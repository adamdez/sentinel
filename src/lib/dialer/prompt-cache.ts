/**
 * 3-Layer Prompt Cache Architecture — PR-3
 *
 * Blueprint Section 15.1: Split every AI prompt into three layers ordered
 * for maximum cache hit rate on the provider side.
 *
 * Layer 1 — STABLE BASE (never changes between calls)
 *   System identity, output format, sales philosophy, style block.
 *   Changes only when we ship a new prompt version.
 *   → OpenAI auto-caches the first 1024+ identical tokens across requests.
 *   → Future Anthropic: explicit cache_control breakpoint after this layer.
 *
 * Layer 2 — SEMI-STABLE CONTEXT (changes per lead, stable within a session)
 *   CRM lead data, property details, call history, structured seller memory.
 *   Refreshed when the lead's data changes or a new session starts.
 *
 * Layer 3 — PER-CALL DYNAMIC (changes every request)
 *   Current transcript excerpt, risk seeds, live session signals,
 *   session-specific instructions. Never cached.
 *
 * ORDERING RULE: Stable content MUST come first in the prompt so the
 * provider's prefix-match cache can hit on Layers 1+2 even when Layer 3
 * changes. This is how OpenAI's automatic prompt caching works — identical
 * prefix tokens get cached for up to 1 hour.
 *
 * BOUNDARY: Pure prompt assembly. No DB access, no side effects.
 * Zero imports from CRM domain. Dialer-only.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface PromptLayer {
  /** Human-readable label for tracing */
  label: "stable_base" | "semi_stable_context" | "per_call_dynamic";
  /** The text content of this layer */
  content: string;
}

export interface LayeredPrompt {
  layers: [PromptLayer, PromptLayer, PromptLayer];
  /** Combined version string for tracing (e.g., "pre_call_brief@1.3.0+style@1.0.0") */
  version: string;
  /** Workflow identifier for the prompt registry */
  workflow: string;
}

/**
 * Assembled prompt ready for the AI completion client.
 * The system message is layers joined in order (stable → semi-stable → dynamic).
 */
export interface AssembledPrompt {
  systemMessage: string;
  userMessage: string;
  version: string;
  workflow: string;
  /** Byte lengths per layer — useful for cache hit analysis in traces */
  layerSizes: { stable: number; semiStable: number; dynamic: number };
}

// ── Layer 2 Input Types ──────────────────────────────────────────────────────

/**
 * Structured lead context for Layer 2 — the semi-stable context snapshot.
 * All fields are optional so callers can provide whatever CRM data they have.
 * This interface lives here (not in grok-agents.ts) so prompt-cache owns
 * the contract for what Layer 2 accepts.
 */
export interface LeadContextSnapshot {
  ownerName: string | null;
  address: string | null;
  score: number | null;
  distressSignals: string[];
  equityPercent: number | null;
  ownershipYears: number | null;
  estimatedValue: number | null;
  propertyType: string | null;
  county: string | null;
  tags: string[];

  /** Call history — most recent first, max 5 entries */
  callHistory: {
    date: string;
    disposition: string;
    notes: string;
  }[];

  /** AI-generated summaries from prior calls */
  aiNotes: string[];

  /** Latest structured post-call memory (from post_call_structures) */
  sellerMemory: {
    summary_line: string | null;
    promises_made: string | null;
    objection: string | null;
    next_task_suggestion: string | null;
    callback_timing_hint: string | null;
    deal_temperature: string | null;
  } | null;

  /** Dossier fields — present only when Research Agent has run */
  sellerSituationSummary: string | null;
  recommendedCallAngle: string | null;
  likelyDecisionMaker: string | null;
  decisionMakerConfidence: string | null;
  topFacts: string[];
  opportunityScore: number | null;
  confidenceScore: number | null;

  /** Inbound voice session signals (Vapi extracted facts) */
  inboundSignals: {
    type: string;
    value: string;
    source: string;
    date: string;
  }[];

  /** Structured facts from session_extracted_facts table */
  structuredFacts: {
    type: string;
    text: string;
    value: unknown;
    confirmed: boolean;
  }[];
}

/** Draft note context — minimal fields needed for Layer 2 */
export interface DraftNoteContext {
  ownerName: string | null;
  address: string | null;
  disposition: string | null;
  callbackAt: string | null;
}

// ── Layer 3 Input Types ──────────────────────────────────────────────────────

/** Live session signals for Layer 3 — real-time context that changes per request */
export interface LiveSessionSignals {
  /** Current date string (ISO date portion, e.g. "2026-03-20") */
  today: string;
  /** Risk seeds derived from data contradictions */
  riskSeeds: string[];
  /** Excerpt from the current live transcript (most recent N seconds) */
  transcriptExcerpt?: string;
  /** Real-time extracted signals from the active call */
  liveSignals?: {
    type: string;
    value: string;
  }[];
  /** Session-specific operator instructions (e.g., "focus on timeline") */
  sessionInstructions?: string;
}

// ── Builder ──────────────────────────────────────────────────────────────────

/**
 * Assemble a 3-layer prompt into a single system message + user message.
 *
 * The system message concatenates all three layers in cache-optimal order:
 *   [stable base] + [semi-stable context] + [per-call dynamic]
 *
 * This ensures the longest possible prefix stays identical across calls
 * to the same lead, maximizing OpenAI's automatic prompt cache hits.
 */
export function assemblePrompt(
  layered: LayeredPrompt,
  userMessage: string,
): AssembledPrompt {
  const [stable, semiStable, dynamic] = layered.layers;

  const systemMessage = [
    stable.content,
    semiStable.content,
    dynamic.content,
  ]
    .filter((s) => s.length > 0)
    .join("\n\n---\n\n");

  return {
    systemMessage,
    userMessage,
    version: layered.version,
    workflow: layered.workflow,
    layerSizes: {
      stable: Buffer.byteLength(stable.content, "utf8"),
      semiStable: Buffer.byteLength(semiStable.content, "utf8"),
      dynamic: Buffer.byteLength(dynamic.content, "utf8"),
    },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
//  LAYER 1 — STABLE BASE
//  System identity, output format, style block.
//  Identical across ALL requests for a given workflow.
//  If a prompt_registry row exists for this workflow, its system_prompt
//  takes precedence. The static fallbacks below serve as defaults when
//  the registry hasn't been populated yet.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Build Layer 1 for pre-call brief.
 *
 * Accepts an optional `registryPrompt` — if the caller fetched an active
 * system prompt from `prompt_registry`, pass it here and it replaces the
 * hardcoded identity block. The style block is always appended so style
 * versioning stays independent of the registry row.
 */
export function preCallBriefStableBase(
  styleBlock: string,
  registryPrompt?: string | null,
): PromptLayer {
  const identity = registryPrompt ?? [
    "You are the Dominion Sentinel Call Co-Pilot. Your role is to prepare the operator for a seller call with a comprehensive pre-call playbook.",
    "",
    "## IDENTITY",
    "- Dominion Home Deals — local real estate wholesaling team in Spokane, WA",
    "- Two operators: Logan (calls, seller conversations) and Adam (ops, KPIs, management)",
    "- Markets: Spokane County WA (primary), Kootenai County ID (secondary)",
    "- Tone: local, calm, direct, respectful. Never pushy or investor-bro.",
  ].join("\n");

  return {
    label: "stable_base",
    content: [
      identity,
      "",
      styleBlock,
      "",
      "## OUTPUT FORMAT",
      "Return ONLY a JSON object (no markdown, no explanation):",
      "{",
      '  "bullets":["bullet 1","bullet 2","bullet 3"],',
      '  "suggestedOpener":"Opening line here",',
      '  "talkingPoints":["point 1","point 2"],',
      '  "objections":[{"objection":"They say X","rebuttal":"You respond Y"}],',
      '  "negotiationAnchor":"Offer range: $X - $Y based on ...",',
      '  "watchOuts":["compliance note","emotional trigger to avoid"],',
      '  "riskFlags":["risk or contradiction to verify"]',
      "}",
      "",
      "## OUTPUT RULES",
      "- Keep bullets under 80 chars. Opening line should be natural and empathetic.",
      "- talkingPoints: 2-3 conversation starters tied to their distress signals.",
      "- objections: 2-3 likely pushbacks with one-line rebuttals.",
      "- negotiationAnchor: a single sentence with the MAO range if data exists.",
      "- watchOuts: 1-2 compliance/emotional things to avoid.",
      "- riskFlags: 0-4 practical caution signals where data may not line up; keep plainspoken and non-creepy.",
      '- If evidence is thin, say that plainly (e.g., "Evidence is thin — manual verification recommended").',
    ].join("\n"),
  };
}

/**
 * Build Layer 1 for draft-note.
 *
 * Same registry override pattern as preCallBriefStableBase.
 */
export function draftNoteStableBase(
  styleBlock: string,
  registryPrompt?: string | null,
): PromptLayer {
  const identity = registryPrompt ?? [
    "You are a real estate acquisitions assistant for Dominion Home Deals in Spokane, WA.",
    "Extract structured call notes from brief operator notes after a seller call.",
    "Return ONLY valid JSON matching the schema. No prose, no markdown fences, no extra keys.",
    "Be conservative: return null for any field you cannot confidently extract. Never guess or embellish.",
  ].join("\n");

  return {
    label: "stable_base",
    content: [
      identity,
      "",
      styleBlock,
      "",
      "## EXTRACTION SCHEMA",
      "{",
      '  "summary_line": <string max 120 chars or null>,',
      '  "promises_made": <string max 80 chars or null>,',
      '  "objection": <string max 80 chars or null>,',
      '  "next_task_suggestion": <string max 60 chars or null>,',
      '  "callback_timing_hint": <string max 60 chars or null>,',
      '  "deal_temperature": <"hot"|"warm"|"cool"|"cold"|"dead"|null>',
      "}",
      "",
      "## FIELD RULES",
      "- summary_line: what happened on this call in 1-2 sentences. null if notes are too sparse.",
      "- promises_made: only explicit commitments (callback by X, sending Y, etc.). null if none.",
      "- objection: primary unresolved seller concern. null if none mentioned or call was no-answer/voicemail.",
      '- next_task_suggestion: concise, plainspoken action phrase like "Check in Thursday afternoon". Avoid pushy language.',
      '- callback_timing_hint: if notes mention a preferred day/time window, capture in plain language (e.g., "Thursday afternoon"). null if not mentioned.',
      "- deal_temperature: seller engagement level. null if call was no-answer/voicemail or too unclear.",
      "- Keep phrasing calm and human. Diagnose before persuasion.",
      '- Suggest question-led next steps ("ask what timing feels realistic") over pressure-led steps.',
      "- Return null for any field you cannot confidently extract — never guess.",
    ].join("\n"),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
//  LAYER 2 — SEMI-STABLE CONTEXT
//  CRM lead data, property details, call history, seller memory.
//  Changes per lead but stable within a single dialer session.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Build Layer 2 for pre-call brief from a structured LeadContextSnapshot.
 *
 * This is the canonical builder that routes should use. It accepts the
 * full lead context snapshot and renders a prompt-optimized text block.
 *
 * For backward compatibility, also accepts a raw agent prompt string
 * (the `agentPrompt` overload). New callers should prefer the snapshot form.
 */
export function preCallBriefSemiStable(ctx: LeadContextSnapshot | string): PromptLayer {
  // Backward-compatible path: raw agent prompt string
  if (typeof ctx === "string") {
    return {
      label: "semi_stable_context",
      content: ctx,
    };
  }

  // Structured path: build Layer 2 from snapshot
  return {
    label: "semi_stable_context",
    content: buildLeadContextBlock(ctx),
  };
}

/**
 * Build Layer 2 for draft-note: call context (seller name, address, disposition).
 * Changes per session/call but stable within a single draft request.
 */
export function draftNoteSemiStable(context: DraftNoteContext): PromptLayer {
  const parts = [
    context.ownerName && `Seller: ${context.ownerName}`,
    context.address && `Property: ${context.address}`,
    context.disposition && `Call outcome: ${context.disposition.replace(/_/g, " ")}`,
    context.callbackAt &&
      `Callback scheduled: ${new Date(context.callbackAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
  ].filter(Boolean);

  return {
    label: "semi_stable_context",
    content: parts.length > 0 ? `[Context: ${parts.join(" | ")}]` : "",
  };
}

/**
 * Render a LeadContextSnapshot into a prompt-ready text block.
 *
 * This is the shared formatter for Layer 2. It mirrors the structure
 * that buildCallCoPilotPrompt in grok-agents.ts produces, but lives
 * here so prompt-cache owns the Layer 2 contract end-to-end.
 */
function buildLeadContextBlock(lead: LeadContextSnapshot): string {
  // ── Lead profile ──────────────────────────────────────────────────
  const profileLines = [
    "## LEAD CONTEXT SNAPSHOT",
    "",
    "### Lead Profile",
    `- Owner: ${lead.ownerName ?? "Unknown Owner"}`,
    `- Property: ${lead.address ?? "unknown"}`,
    `- Score: ${lead.score ?? "unscored"}`,
    `- Distress signals: ${lead.distressSignals.join(", ") || "none identified"}`,
    `- Equity: ${lead.equityPercent != null ? `${lead.equityPercent}%` : "unknown"}`,
    `- Ownership: ${lead.ownershipYears != null ? `${lead.ownershipYears} years` : "unknown"}`,
    `- Est. value: ${lead.estimatedValue ? `$${lead.estimatedValue.toLocaleString()}` : "unknown"}`,
    `- Property type: ${lead.propertyType ?? "unknown"}`,
    `- County: ${lead.county ?? "unknown"}`,
    `- Tags: ${lead.tags.join(", ") || "none"}`,
  ];

  if (lead.opportunityScore != null) {
    profileLines.push(`- Opportunity score: ${lead.opportunityScore}/100`);
  }
  if (lead.confidenceScore != null) {
    profileLines.push(`- Intelligence confidence: ${lead.confidenceScore}/100`);
  }

  // ── Dossier intelligence brief ────────────────────────────────────
  const hasDossier = lead.sellerSituationSummary || lead.recommendedCallAngle || lead.topFacts.length > 0;
  const dossierLines: string[] = [];
  if (hasDossier) {
    dossierLines.push("", "### Intelligence Brief (from Research Agent dossier)");
    if (lead.sellerSituationSummary) dossierLines.push(`- Situation: ${lead.sellerSituationSummary}`);
    if (lead.recommendedCallAngle) dossierLines.push(`- Recommended approach: ${lead.recommendedCallAngle}`);
    if (lead.likelyDecisionMaker) {
      dossierLines.push(`- Decision maker: ${lead.likelyDecisionMaker} (${lead.decisionMakerConfidence ?? "unknown"} confidence)`);
    }
    for (let i = 0; i < lead.topFacts.length; i++) {
      dossierLines.push(`- Key fact ${i + 1}: ${lead.topFacts[i]}`);
    }
  }

  // ── Call history ──────────────────────────────────────────────────
  const historyBlock = lead.callHistory.length > 0
    ? lead.callHistory
        .map((c) => `  - ${c.date}: ${c.disposition} — ${c.notes.slice(0, 200)}`)
        .join("\n")
    : "  No prior calls.";

  const aiNotesBlock = lead.aiNotes.length > 0
    ? lead.aiNotes.map((n) => `  - ${n.slice(0, 200)}`).join("\n")
    : "  No AI notes yet.";

  // ── Seller memory (structured post-call takeaway) ─────────────────
  const mem = lead.sellerMemory;
  const hasMemory = !!(
    mem?.summary_line ||
    mem?.promises_made ||
    mem?.objection ||
    mem?.next_task_suggestion ||
    mem?.deal_temperature
  );

  const memoryLines: string[] = [];
  memoryLines.push("", "### Seller Memory (latest reviewed takeaway — assistive, not authoritative)");
  if (hasMemory && mem) {
    memoryLines.push(
      mem.summary_line ? `- Summary: ${mem.summary_line}` : "- Summary: unknown",
      mem.promises_made ? `- Promises made: ${mem.promises_made}` : "- Promises made: none recorded",
      mem.objection ? `- Objection: ${mem.objection}` : "- Objection: none recorded",
      mem.next_task_suggestion ? `- Suggested next step: ${mem.next_task_suggestion}` : "- Suggested next step: none recorded",
      mem.callback_timing_hint ? `- Callback timing: ${mem.callback_timing_hint}` : "",
      mem.deal_temperature ? `- Deal temperature: ${mem.deal_temperature}` : "- Deal temperature: unknown",
    );
  } else {
    memoryLines.push("  No structured post-call takeaway available yet.");
  }

  // ── Inbound signals ───────────────────────────────────────────────
  const signalLines: string[] = [];
  if (lead.inboundSignals.length > 0 || lead.structuredFacts.length > 0) {
    signalLines.push("", "### Inbound Call Intelligence (from Vapi voice sessions)");
    for (const s of lead.inboundSignals) {
      signalLines.push(`- [${s.type}] ${s.value} (${s.source}, ${new Date(s.date).toLocaleDateString()})`);
    }
    for (const f of lead.structuredFacts) {
      const confirmed = f.confirmed ? " [confirmed]" : "";
      const val = f.value ? ` → ${JSON.stringify(f.value)}` : "";
      signalLines.push(`- [${f.type}] ${f.text}${confirmed}${val}`);
    }
  }

  return [
    ...profileLines,
    ...dossierLines,
    "",
    "### Call History",
    historyBlock,
    "",
    "### AI Notes from Previous Calls",
    aiNotesBlock,
    ...memoryLines.filter(Boolean),
    ...signalLines,
  ].join("\n");
}

// ══════════════════════════════════════════════════════════════════════════════
//  LAYER 3 — PER-CALL DYNAMIC
//  Current date, risk seeds, live transcript, real-time signals.
//  Changes every single request — never cached.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Build Layer 3 for pre-call brief from structured live session signals.
 *
 * Overloaded: accepts either the full LiveSessionSignals object (preferred)
 * or the legacy (today, riskSeeds) pair for backward compatibility.
 */
export function preCallBriefDynamic(
  todayOrSignals: string | LiveSessionSignals,
  riskSeeds?: string[],
): PromptLayer {
  // Legacy overload: (today: string, riskSeeds: string[])
  if (typeof todayOrSignals === "string") {
    return buildDynamicLayer(todayOrSignals, riskSeeds ?? []);
  }

  // Structured overload: LiveSessionSignals
  const signals = todayOrSignals;
  return buildDynamicLayerFull(signals);
}

/** Legacy dynamic layer — date + risk seeds only */
function buildDynamicLayer(today: string, riskSeeds: string[]): PromptLayer {
  const riskBlock =
    riskSeeds.length > 0
      ? riskSeeds.map((r) => `- ${r}`).join("\n")
      : "- No clear contradiction seed from available data.";

  return {
    label: "per_call_dynamic",
    content: [
      `## TEMPORAL CONTEXT`,
      `Today is ${today}. Use this date for all temporal reasoning — recency, days since filing, urgency calculations.`,
      "",
      "## RISK SEED (from observed data)",
      riskBlock,
    ].join("\n"),
  };
}

/** Full dynamic layer — date, risk seeds, transcript, live signals, instructions */
function buildDynamicLayerFull(signals: LiveSessionSignals): PromptLayer {
  const riskBlock =
    signals.riskSeeds.length > 0
      ? signals.riskSeeds.map((r) => `- ${r}`).join("\n")
      : "- No clear contradiction seed from available data.";

  const parts: string[] = [
    `## TEMPORAL CONTEXT`,
    `Today is ${signals.today}. Use this date for all temporal reasoning — recency, days since filing, urgency calculations.`,
    "",
    "## RISK SEED (from observed data)",
    riskBlock,
  ];

  // Live transcript excerpt — present during active calls
  if (signals.transcriptExcerpt) {
    parts.push(
      "",
      "## LIVE TRANSCRIPT (most recent excerpt)",
      signals.transcriptExcerpt.slice(0, 2000),
    );
  }

  // Real-time signals — extracted during active call (e.g., detected objection, sentiment shift)
  if (signals.liveSignals && signals.liveSignals.length > 0) {
    parts.push("", "## LIVE SIGNALS (real-time)");
    for (const sig of signals.liveSignals.slice(0, 10)) {
      parts.push(`- [${sig.type}] ${sig.value}`);
    }
  }

  // Session-specific operator instructions
  if (signals.sessionInstructions) {
    parts.push(
      "",
      "## SESSION INSTRUCTIONS (operator-set)",
      signals.sessionInstructions.slice(0, 500),
    );
  }

  return {
    label: "per_call_dynamic",
    content: parts.join("\n"),
  };
}

/**
 * Build Layer 3 for draft-note: the operator's actual notes.
 * Always unique per request.
 */
export function draftNoteDynamic(operatorNotes: string): PromptLayer {
  return {
    label: "per_call_dynamic",
    content: [
      `Operator call notes:`,
      `"${operatorNotes.slice(0, 800)}"`,
      "",
      "Extract structured call notes. Return exactly the JSON schema above.",
    ].join("\n"),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
//  CONVENIENCE: Full Layered Prompt Builders
//  These assemble all three layers in one call — useful when the route
//  has already gathered all the data and wants a single function call.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Build a complete 3-layer pre-call brief prompt from structured inputs.
 *
 * This is the preferred entry point for new code. It assembles all three
 * layers and returns a LayeredPrompt ready for `assemblePrompt()`.
 */
export function buildPreCallBriefLayers(opts: {
  styleBlock: string;
  leadContext: LeadContextSnapshot;
  sessionSignals: LiveSessionSignals;
  version: string;
  registryPrompt?: string | null;
}): LayeredPrompt {
  return {
    layers: [
      preCallBriefStableBase(opts.styleBlock, opts.registryPrompt),
      preCallBriefSemiStable(opts.leadContext),
      preCallBriefDynamic(opts.sessionSignals),
    ],
    version: opts.version,
    workflow: "pre_call_brief",
  };
}

/**
 * Build a complete 3-layer draft-note prompt from structured inputs.
 */
export function buildDraftNoteLayers(opts: {
  styleBlock: string;
  noteContext: DraftNoteContext;
  operatorNotes: string;
  version: string;
  registryPrompt?: string | null;
}): LayeredPrompt {
  return {
    layers: [
      draftNoteStableBase(opts.styleBlock, opts.registryPrompt),
      draftNoteSemiStable(opts.noteContext),
      draftNoteDynamic(opts.operatorNotes),
    ],
    version: opts.version,
    workflow: "draft_note",
  };
}
