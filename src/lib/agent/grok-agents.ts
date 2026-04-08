/**
 * Grok Multi-Agent System — 4 specialized prompt builders.
 *
 * Each function returns a focused system prompt supplement that gets
 * appended to the base Sentinel prompt when the relevant agent mode
 * is invoked (either automatically via intent detection or manually).
 */

import { getStyleBlock, styleVersionTag } from "@/lib/conversation-style";

// Expose style version tag for callers that embed it in prompt_version strings
export { styleVersionTag };

export interface LeadContext {
  ownerName: string;
  address: string;
  score: number;
  distressSignals: string[];
  callHistory: { date: string; disposition: string; notes: string }[];
  aiNotes: string[];
  equityPercent?: number;
  ownershipYears?: number;
  phoneNumbers?: string[];
  estimatedValue?: number;
  tags?: string[];
  ownerAge?: number | null;
  isAbsentee?: boolean;
  isFreeClear?: boolean;
  isVacant?: boolean;
  propertyType?: string;
  county?: string;
  lastTransferType?: string;
  delinquentAmount?: number;
  foreclosureStage?: string;
  latestStructuredMemory?: {
    summary_line?: string | null;
    promises_made?: string | null;
    objection?: string | null;
    next_task_suggestion?: string | null;
    callback_timing_hint?: string | null;
    deal_temperature?: string | null;
  } | null;

  // Dossier projection fields (Blueprint 9.1)
  sellerSituationSummary?: string | null;
  recommendedCallAngle?: string | null;
  likelyDecisionMaker?: string | null;
  decisionMakerConfidence?: string | null;
  topFacts?: string[];
  opportunityScore?: number | null;
  confidenceScore?: number | null;

  // Inbound voice session signals (Vapi extracted facts)
  inboundSignals?: {
    type: string;
    value: string;
    source: string;
    date: string;
  }[];

  // Session extracted facts (structured fact rows)
  structuredFacts?: {
    type: string;
    text: string;
    value: unknown;
    confirmed: boolean;
  }[];
}

export interface PipelineMetrics {
  pipelineByStage: Record<string, number>;
  conversionRates?: Record<string, number>;
  avgDaysInStage?: Record<string, number>;
  closedDeals30d: number;
  avgDealSize?: number;
  leadsPerDayLast7d: number;
  todayCalls: { outbound: number; connectRate: number; liveAnswers: number };
}

export function buildCallCoPilotPrompt(lead: LeadContext): string {
  const historyBlock = lead.callHistory.length > 0
    ? lead.callHistory
        .map((c) => `  - ${c.date}: ${c.disposition} — ${c.notes.slice(0, 200)}`)
        .join("\n")
    : "  No prior calls.";

  const aiNotesBlock = lead.aiNotes.length > 0
    ? lead.aiNotes.map((n) => `  - ${n.slice(0, 200)}`).join("\n")
    : "  No AI notes yet.";

  const memory = lead.latestStructuredMemory ?? null;
  const hasStructuredMemory = !!(
    memory?.summary_line ||
    memory?.promises_made ||
    memory?.objection ||
    memory?.next_task_suggestion ||
    memory?.callback_timing_hint ||
    memory?.deal_temperature
  );
  const latestStructuredBlock = hasStructuredMemory
    ? [
        "### Latest Reviewed Seller Takeaway (assistive, not authoritative)",
        memory?.summary_line ? `- Summary: ${memory.summary_line}` : "- Summary: unknown",
        memory?.promises_made ? `- Promises made: ${memory.promises_made}` : "- Promises made: none recorded",
        memory?.objection ? `- Objection: ${memory.objection}` : "- Objection: none recorded",
        memory?.next_task_suggestion ? `- Suggested next step: ${memory.next_task_suggestion}` : "- Suggested next step: none recorded",
        memory?.callback_timing_hint ? `- Callback timing: ${memory.callback_timing_hint}` : "",
        memory?.deal_temperature ? `- Deal temperature: ${memory.deal_temperature}` : "- Deal temperature: unknown",
      ].join("\n")
    : "### Latest Reviewed Seller Takeaway (assistive, not authoritative)\n  No structured post-call takeaway available yet.";

  return [
    "",
    "## Agent Mode: CALL CO-PILOT",
    "You are now in Call Co-Pilot mode. Your job is to help the agent prepare for and succeed on this call.",
    "",
    "### Lead Profile",
    `- Owner: ${lead.ownerName}`,
    `- Property: ${lead.address}`,
    `- Score: ${lead.score}`,
    `- Distress signals: ${lead.distressSignals.join(", ") || "none identified"}`,
    `- Equity: ${lead.equityPercent != null ? `${lead.equityPercent}%` : "unknown"}`,
    `- Ownership: ${lead.ownershipYears != null ? `${lead.ownershipYears} years` : "unknown"}`,
    `- Est. value: ${lead.estimatedValue ? `$${lead.estimatedValue.toLocaleString()}` : "unknown"}`,
    `- Tags: ${(lead.tags ?? lead.distressSignals)?.join(", ") || "none"}`,
    `- Owner age: ${lead.ownerAge ?? "unknown"}`,
    `- Absentee: ${lead.isAbsentee ? "yes" : "no"}`,
    `- Free & clear: ${lead.isFreeClear ? "yes" : "no"}`,
    `- Vacant: ${lead.isVacant ? "yes" : "no"}`,
    `- Property type: ${lead.propertyType ?? "unknown"}`,
    `- County: ${lead.county ?? "unknown"}`,
    lead.lastTransferType ? `- Last transfer: ${lead.lastTransferType}` : "",
    lead.delinquentAmount ? `- Delinquent amount: $${lead.delinquentAmount.toLocaleString()}` : "",
    lead.foreclosureStage ? `- Foreclosure stage: ${lead.foreclosureStage}` : "",
    lead.opportunityScore != null ? `- Opportunity score: ${lead.opportunityScore}/100` : "",
    lead.confidenceScore != null ? `- Intelligence confidence: ${lead.confidenceScore}/100` : "",
    "",
    // Dossier intelligence brief — only included when Research Agent has run
    ...(lead.sellerSituationSummary || lead.recommendedCallAngle || (lead.topFacts && lead.topFacts.length > 0)
      ? [
          "### Intelligence Brief (from Research Agent dossier)",
          lead.sellerSituationSummary ? `- Situation: ${lead.sellerSituationSummary}` : "",
          lead.recommendedCallAngle ? `- Recommended approach: ${lead.recommendedCallAngle}` : "",
          lead.likelyDecisionMaker ? `- Decision maker: ${lead.likelyDecisionMaker} (${lead.decisionMakerConfidence ?? "unknown"} confidence)` : "",
          ...(lead.topFacts ?? []).map((f, i) => `- Key fact ${i + 1}: ${f}`),
          "",
        ]
      : []),
    "### Call History",
    historyBlock,
    "",
    "### AI Notes from Previous Calls",
    aiNotesBlock,
    "",
    latestStructuredBlock,
    "",
    // Inbound voice session signals
    ...((lead.inboundSignals && lead.inboundSignals.length > 0) || (lead.structuredFacts && lead.structuredFacts.length > 0)
      ? [
          "### Inbound Call Intelligence (from Vapi voice sessions)",
          ...(lead.inboundSignals ?? []).map((s) => `- [${s.type}] ${s.value} (${s.source}, ${new Date(s.date).toLocaleDateString()})`),
          ...(lead.structuredFacts ?? []).map((f) =>
            `- [${f.type}] ${f.text}${f.confirmed ? " ✓ confirmed" : ""}${f.value ? ` → ${JSON.stringify(f.value)}` : ""}`
          ),
          "",
        ]
      : []),
    "### Your Output",
    "Provide:",
    "1. A 3-bullet pre-call brief (key facts the agent should know BEFORE dialing, including latest reviewed takeaway when present)",
    "2. A suggested opening line tailored to the owner's situation",
    "3. 2-3 talking points based on the distress signals — what to bring up naturally",
    "4. Top 3 likely objections with one-line rebuttals",
    "5. A negotiation anchor (MAO range based on equity + value if available — for Logan's reference only, not to read aloud)",
    "6. Any watch-outs (compliance red flags, emotional triggers, things to avoid saying)",
    "",
    getStyleBlock("call_copilot"),
    "",
    "Remember compliance: never misrepresent who we are or why we're calling.",
  ].join("\n");
}

export function buildOutreachAgentPrompt(lead: LeadContext): string {
  return [
    "",
    "## Agent Mode: OUTREACH SPECIALIST",
    "Draft personalized outreach for this lead. Adapt tone to the distress situation.",
    "",
    "### Lead Profile",
    `- Owner: ${lead.ownerName}`,
    `- Property: ${lead.address}`,
    `- Score: ${lead.score}`,
    `- Distress: ${lead.distressSignals.join(", ") || "none"}`,
    `- Prior contacts: ${lead.callHistory.length} calls`,
    "",
    "### Guidelines",
    "- SMS: max 160 chars, casual tone, mention the property vaguely (\"your property on [street name]\").",
    "- Email: subject line + 3-4 sentence body. Professional but human.",
    "- Never mention distress signals directly (e.g., don't say \"we know about your foreclosure\").",
    "- Always include opt-out language for compliance.",
    "- Include a clear call-to-action.",
    "",
    "### Output Format",
    "Return a JSON block:",
    "```json",
    '{ "channel": "sms" | "email", "subject": "(email only)", "body": "...", "cta": "..." }',
    "```",
  ].join("\n");
}

export function buildOptimizationAgentPrompt(metrics: PipelineMetrics): string {
  return [
    "",
    "## Agent Mode: OPTIMIZATION ANALYST",
    "Analyze scoring and conversion data to recommend improvements.",
    "",
    "### Current Pipeline",
    ...Object.entries(metrics.pipelineByStage).map(([s, c]) => `- ${s}: ${c}`),
    `- Closed (30d): ${metrics.closedDeals30d}`,
    `- Leads/day (7d avg): ${metrics.leadsPerDayLast7d}`,
    "",
    "### Dialer Performance",
    `- Outbound today: ${metrics.todayCalls.outbound}`,
    `- Connect rate: ${metrics.todayCalls.connectRate}%`,
    `- Live answers: ${metrics.todayCalls.liveAnswers}`,
    "",
    "### Your Analysis Should Cover",
    "1. Which scoring signal types are likely over/under-weighted based on conversion patterns?",
    "2. Are there data sources we should add or deprioritize?",
    "3. Dialer efficiency recommendations (time-of-day, day-of-week patterns).",
    "4. Concrete scoring weight adjustments (use `adjust_weight` action format if recommending changes).",
    "",
    "Be data-driven. Base recommendations on the numbers, not guesses.",
  ].join("\n");
}

export function buildForecastingAgentPrompt(metrics: PipelineMetrics): string {
  const avgDeal = metrics.avgDealSize ?? 15000;
  return [
    "",
    "## Agent Mode: FORECASTING ANALYST",
    "Project revenue and pipeline velocity for the coming weeks.",
    "",
    "### Current Pipeline",
    ...Object.entries(metrics.pipelineByStage).map(([s, c]) => `- ${s}: ${c}`),
    `- Closed (30d): ${metrics.closedDeals30d}`,
    `- Avg deal size: $${avgDeal.toLocaleString()}`,
    `- Leads/day (7d avg): ${metrics.leadsPerDayLast7d}`,
    "",
    "### Charter Targets",
    "- $1M+ annual net revenue ($83,333/month)",
    "- 20+ verified 3-stack leads/day",
    "- Blended CPL ≤ $40",
    "",
    "### Your Projections Should Include",
    "1. This week's estimated closed revenue (based on current negotiation/disposition pipeline)",
    "2. 30-day revenue projection with confidence intervals",
    "3. Whether we're on track for the $1M annual target — if not, what needs to change",
    "4. Bottleneck identification (which stage is the biggest drop-off)",
    "5. Recommended actions to increase velocity",
    "",
    "Use conservative estimates. Better to under-promise.",
  ].join("\n");
}

export interface TroubleshootDiagnostics {
  timestamp: string;
  recentErrors: { id: string; action: string; entity_type: string; details: Record<string, unknown>; created_at: string }[];
  failedTransitions: { id: string; action: string; details: Record<string, unknown>; created_at: string }[];
  apiFailures: { id: string; action: string; details: Record<string, unknown>; created_at: string }[];
  crawlerIssues: { id: string; action: string; details: Record<string, unknown>; created_at: string }[];
  envStatus: Record<string, "set" | "missing">;
  healthSummary: {
    status: "nominal" | "degraded" | "critical";
    errorCount: number;
    failedTransitionCount: number;
    apiFailureCount: number;
    crawlerIssueCount: number;
    message: string;
  };
  cursorFixes: string[];
}

export function buildTroubleshootAgentPrompt(diagnostics: TroubleshootDiagnostics): string {
  const lines: string[] = [
    "",
    "## Agent Mode: SYSTEM TROUBLESHOOTER",
    "You are in full diagnostic mode. Below is live telemetry from Sentinel's event_log and environment scan.",
    "",
    `### Health Summary (${new Date(diagnostics.timestamp).toLocaleString()})`,
    `- Status: **${diagnostics.healthSummary.status.toUpperCase()}**`,
    `- ${diagnostics.healthSummary.message}`,
    `- Errors: ${diagnostics.healthSummary.errorCount}`,
    `- Failed transitions: ${diagnostics.healthSummary.failedTransitionCount}`,
    `- API failures: ${diagnostics.healthSummary.apiFailureCount}`,
    `- Crawler issues: ${diagnostics.healthSummary.crawlerIssueCount}`,
  ];

  const missingEnvs = Object.entries(diagnostics.envStatus)
    .filter(([, v]) => v === "missing")
    .map(([k]) => k);
  if (missingEnvs.length > 0) {
    lines.push("", "### Missing Environment Variables");
    for (const v of missingEnvs) {
      lines.push(`- ❌ ${v}`);
    }
  } else {
    lines.push("", "### Environment: All required variables set ✓");
  }

  if (diagnostics.recentErrors.length > 0) {
    lines.push("", "### Recent Errors (last 24h)");
    for (const e of diagnostics.recentErrors.slice(0, 10)) {
      const d = JSON.stringify(e.details).slice(0, 200);
      lines.push(`- [${new Date(e.created_at).toLocaleTimeString()}] ${e.action} (${e.entity_type}): ${d}`);
    }
  }

  if (diagnostics.failedTransitions.length > 0) {
    lines.push("", "### Failed Status Transitions");
    for (const e of diagnostics.failedTransitions.slice(0, 5)) {
      const d = JSON.stringify(e.details).slice(0, 200);
      lines.push(`- [${new Date(e.created_at).toLocaleTimeString()}] ${e.action}: ${d}`);
    }
  }

  if (diagnostics.apiFailures.length > 0) {
    lines.push("", "### API Failures");
    for (const e of diagnostics.apiFailures.slice(0, 5)) {
      const d = JSON.stringify(e.details).slice(0, 200);
      lines.push(`- [${new Date(e.created_at).toLocaleTimeString()}] ${e.action}: ${d}`);
    }
  }

  if (diagnostics.crawlerIssues.length > 0) {
    lines.push("", "### Crawler / Ingest Issues");
    for (const e of diagnostics.crawlerIssues.slice(0, 5)) {
      const d = JSON.stringify(e.details).slice(0, 200);
      lines.push(`- [${new Date(e.created_at).toLocaleTimeString()}] ${e.action}: ${d}`);
    }
  }

  if (diagnostics.cursorFixes.length > 0) {
    lines.push("", "### Auto-Generated Fix Suggestions");
    for (const f of diagnostics.cursorFixes) {
      lines.push(`- ${f}`);
    }
  }

  lines.push(
    "",
    "### Your Task",
    "1. Explain each detected issue in plain language — what broke, why, and what the impact is.",
    "2. Prioritize issues by severity (critical first, then degraded).",
    "3. For EACH issue, output a complete Cursor Composer prompt. ALWAYS start the fix block with:",
    '   `Here is the complete ready-to-paste Cursor Composer prompt for Claude:`',
    "   Then provide the full prompt in a ```cursor code fence, including:",
    "   - Exact files to modify (full paths from project root: src/...)",
    "   - The specific code change (find string → replace string)",
    "   - Git commit message in imperative mood",
    "   - Verification: `Run \\`npm run build\\` to confirm zero errors`",
    "4. If everything is nominal, confirm all systems are healthy and suggest proactive optimizations.",
    "5. End with a one-line system health verdict.",
  );

  return lines.join("\n");
}

export type AgentType = "call-copilot" | "outreach" | "optimization" | "forecasting" | "troubleshoot";

export function detectAgentIntent(message: string): AgentType | null {
  const lower = message.toLowerCase();

  if (/\b(troubleshoot|diagnos|debug|fix\b|fix\s*error|system\s*health|what.?s?\s*broken|check\s*errors?|self.?heal|cursor\s*(prompt|fix)|generate\s*cursor|what.?s?\s*wrong)\b/.test(lower)) {
    return "troubleshoot";
  }
  if (/\b(draft|write|compose|send|text|sms|email|outreach|message)\b/.test(lower) &&
      /\b(lead|owner|property|contact)\b/.test(lower)) {
    return "outreach";
  }
  if (/\b(forecast|project|revenue|projection|predict|velocity)\b/.test(lower)) {
    return "forecasting";
  }
  if (/\b(optimi[sz]e|weight|scoring|conversion|adjust|tuning)\b/.test(lower)) {
    return "optimization";
  }
  if (/\b(call|dial|script|objection|pre.?call|brief)\b/.test(lower)) {
    return "call-copilot";
  }

  return null;
}
