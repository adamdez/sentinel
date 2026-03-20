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
 *   CRM lead data, property details, call history, structured memory.
 *   Refreshed when the lead's data changes or a new session starts.
 *
 * Layer 3 — PER-CALL DYNAMIC (changes every request)
 *   Current transcript, risk seeds, session-specific instructions.
 *   Never cached.
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

// ── Pre-Call Brief Layers ────────────────────────────────────────────────────

/**
 * Layer 1 for pre-call brief: system identity, output format, style.
 * This block is identical across ALL pre-call brief requests.
 */
export function preCallBriefStableBase(styleBlock: string): PromptLayer {
  return {
    label: "stable_base",
    content: [
      "You are the Dominion Sentinel Call Co-Pilot. Your role is to prepare the operator for a seller call with a comprehensive pre-call playbook.",
      "",
      "## IDENTITY",
      "- Dominion Home Deals — local real estate wholesaling team in Spokane, WA",
      "- Two operators: Logan (calls, seller conversations) and Adam (ops, KPIs, management)",
      "- Markets: Spokane County WA (primary), Kootenai County ID (secondary)",
      "- Tone: local, calm, direct, respectful. Never pushy or investor-bro.",
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
 * Layer 2 for pre-call brief: lead context, property data, call history.
 * Identical across multiple calls to the same lead within a session.
 */
export function preCallBriefSemiStable(agentPrompt: string): PromptLayer {
  return {
    label: "semi_stable_context",
    content: agentPrompt,
  };
}

/**
 * Layer 3 for pre-call brief: date, risk seeds, session-specific notes.
 * Changes every single request.
 */
export function preCallBriefDynamic(
  today: string,
  riskSeeds: string[],
): PromptLayer {
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

// ── Draft Note Layers ────────────────────────────────────────────────────────

/**
 * Layer 1 for draft-note: system identity, extraction rules, style.
 * Identical across ALL draft-note requests.
 */
export function draftNoteStableBase(styleBlock: string): PromptLayer {
  return {
    label: "stable_base",
    content: [
      "You are a real estate acquisitions assistant for Dominion Home Deals in Spokane, WA.",
      "Extract structured call notes from brief operator notes after a seller call.",
      "Return ONLY valid JSON matching the schema. No prose, no markdown fences, no extra keys.",
      "Be conservative: return null for any field you cannot confidently extract. Never guess or embellish.",
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

/**
 * Layer 2 for draft-note: call context (seller name, address, disposition).
 * Changes per session/call but stable within a single draft request.
 */
export function draftNoteSemiStable(context: {
  ownerName: string | null;
  address: string | null;
  disposition: string | null;
  callbackAt: string | null;
}): PromptLayer {
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
 * Layer 3 for draft-note: the operator's actual notes.
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
