/**
 * Grok Client — Streaming chat wrapper for xAI Grok API.
 *
 * Used by the Grok Command Center chat UI and the server-side
 * streaming endpoint at /api/grok/chat.
 */

const GROK_ENDPOINT = "https://api.x.ai/v1/chat/completions";
const GROK_MODEL = "grok-4-latest";

export interface GrokMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GrokStreamOptions {
  messages: GrokMessage[];
  temperature?: number;
  apiKey: string;
}

export async function streamGrokChat(opts: GrokStreamOptions): Promise<ReadableStream<Uint8Array>> {
  const { messages, temperature = 0.3, apiKey } = opts;

  const res = await fetch(GROK_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROK_MODEL,
      temperature,
      stream: true,
      messages,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Grok API ${res.status}: ${body.slice(0, 300)}`);
  }

  if (!res.body) {
    throw new Error("Grok API returned no stream body");
  }

  return res.body;
}

export async function completeGrokChat(opts: GrokStreamOptions): Promise<string> {
  const { messages, temperature = 0, apiKey } = opts;

  const res = await fetch(GROK_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROK_MODEL,
      temperature,
      stream: false,
      messages,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Grok API ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

export interface SentinelPromptMetrics {
  activeLeads?: number;
  closedDeals30d?: number;
  dailyCalls?: number;
  crawlerStatus?: string;
  pipelineByStage?: Record<string, number>;
  todayCalls?: { outbound: number; liveAnswers: number; avgTalkTimeSec: number; connectRate: number };
  top5Hottest?: { ownerName: string; address: string; score: number; lastContact: string | null }[];
  coolingLeads?: { ownerName: string; address: string; score: number; daysSinceContact: number }[];
  teamPerformance?: { userName: string; callsToday: number }[];
  recentGrokDecisions?: { action: string; reasoning: string; createdAt: string }[];
  prospectCount?: number;
  leadsPerDayLast7d?: number;
}

export function buildSentinelSystemPrompt(metrics?: SentinelPromptMetrics): string {
  const m = metrics ?? {};

  const lines: string[] = [
    "You are **Grok**, the AI brain of Dominion Sentinel — the fastest, stealthiest wholesale real estate acquisition ERP ever built.",
    "",
    "## Charter Summary (v3.1)",
    "- Owner: Adam DesJardin, Dominion Homes. Field agents: Nathan J. & Logan D.",
    "- Mission: 20+ verified 3-stack leads/day, blended CPL ≤$40, first-to-contact 7-14 days upstream, 3× close rate, $1M+ net/year.",
    "- Signals chased: probate, pre-probate (obituaries), water shut-offs, trustee sales, lis pendens, tax liens, code violations, absentee+high-equity, foreclosure, divorce, bankruptcy.",
    "- Scoring: Dominion Heat Score v2.1 — deterministic + predictive. PLATINUM ≥85, GOLD ≥65, SILVER ≥40, BRONZE <40. Only ≥75 pushed to Sentinel.",
    "- Stack: Next.js 15, React 19, TypeScript, Supabase, Tailwind v4, Zustand.",
    "",
    "## Active Systems",
    "- AI Agent Core: runs every 4h via Vercel Cron — PropertyRadar, obituary/court crawlers, ATTOM daily delta.",
    "- Grok Reasoning Layer: observes crawl results + closed-deal feedback, reasons about which crawlers to run, adjusts priorities.",
    "- Predictive Scoring v2.1: ownership tenure, equity delta, skip-trace inference, foreclosure staging.",
    "- Power Dialer: Twilio integration with hotkeys, 7-Day Power Sequence, auto-queue by blended score.",
    "- Gmail OAuth: send/receive directly from Sentinel.",
    "",
    "## Live Metrics (Real-Time)",
    `- Active leads in pipeline: ${m.activeLeads ?? "unknown"}`,
    `- Prospects in pool: ${m.prospectCount ?? "unknown"}`,
    `- Closed deals (30d): ${m.closedDeals30d ?? "unknown"}`,
    `- Leads/day (7d avg): ${m.leadsPerDayLast7d ?? "unknown"}`,
    `- Crawler status: ${m.crawlerStatus ?? "nominal"}`,
  ];

  if (m.todayCalls) {
    const tc = m.todayCalls;
    lines.push(
      "",
      "## Today's Dialer Stats",
      `- Outbound calls: ${tc.outbound}`,
      `- Live answers: ${tc.liveAnswers}`,
      `- Connect rate: ${tc.connectRate}%`,
      `- Avg talk time: ${Math.floor(tc.avgTalkTimeSec / 60)}:${(tc.avgTalkTimeSec % 60).toString().padStart(2, "0")}`,
    );
  }

  if (m.pipelineByStage) {
    const ps = m.pipelineByStage;
    lines.push(
      "",
      "## Pipeline Breakdown",
      ...Object.entries(ps).map(([stage, count]) => `- ${stage}: ${count}`),
    );
  }

  if (m.top5Hottest && m.top5Hottest.length > 0) {
    lines.push("", "## Top 5 Hottest Leads");
    for (const l of m.top5Hottest) {
      const ago = l.lastContact ? `last contact ${new Date(l.lastContact).toLocaleDateString()}` : "never contacted";
      lines.push(`- ${l.ownerName} — ${l.address} (score ${l.score}, ${ago})`);
    }
  }

  if (m.coolingLeads && m.coolingLeads.length > 0) {
    lines.push("", "## Cooling Leads (no contact 3+ days, score ≥65)");
    for (const l of m.coolingLeads) {
      lines.push(`- ${l.ownerName} — ${l.address} (score ${l.score}, ${l.daysSinceContact}d since contact)`);
    }
  }

  if (m.teamPerformance && m.teamPerformance.length > 0) {
    lines.push("", "## Team Performance Today");
    for (const t of m.teamPerformance) {
      lines.push(`- Agent ${t.userName}: ${t.callsToday} calls`);
    }
  }

  if (m.recentGrokDecisions && m.recentGrokDecisions.length > 0) {
    lines.push("", "## Recent AI Agent Decisions");
    for (const d of m.recentGrokDecisions) {
      lines.push(`- ${d.action} (${new Date(d.createdAt).toLocaleString()}): ${d.reasoning.slice(0, 150)}`);
    }
  }

  lines.push(
    "",
    "## Your Role — Strategic AI Co-Founder",
    "You are Adam's strategic AI co-pilot with full operational authority. You can:",
    "- Analyse lead data and suggest which properties to prioritise.",
    "- Recommend crawler adjustments (increase/decrease frequency, new sources).",
    "- Help draft offers, comp analyses, and disposition strategies.",
    "- Draft personalized outreach (SMS, email, PSAs) for specific leads.",
    "- Forecast weekly revenue based on pipeline velocity and close rates.",
    "- Recommend scoring weight changes based on conversion data.",
    "- Answer questions about the system, Charter, scoring logic, or compliance.",
    "- Suggest process improvements to hit the $1M goal faster.",
    "",
    "## Specialized Agents",
    "You have 4 specialized modes you can invoke:",
    "- **Call Co-Pilot**: Pre-call briefs, objection handlers, script suggestions.",
    "- **Outreach Agent**: Draft personalized texts/emails for leads.",
    "- **Optimization Agent**: Scoring weight changes, data source recommendations.",
    "- **Forecasting Agent**: Revenue projections, pipeline velocity analysis.",
    "",
    "## Executable Actions",
    "When you recommend an action the system can execute, format it as a JSON code block with this exact structure:",
    "```json",
    '{ "action": "run_elite_seed" | "adjust_weight" | "generate_report" | "run_crawlers" | "draft_outreach", "params": { ... }, "description": "Human-readable summary" }',
    "```",
    "",
    "Available actions:",
    '- `run_elite_seed`: `{ "count": 100-2000 }` — Trigger PropertyRadar bulk seed',
    '- `run_crawlers`: `{}` — Trigger full agent cycle (all crawlers)',
    '- `adjust_weight`: `{ "signal_type": "...", "new_weight": 0-100 }` — Propose scoring weight change (requires user confirmation)',
    '- `generate_report`: `{ "type": "weekly" | "monthly" | "pipeline" }` — Generate analytics report',
    '- `draft_outreach`: `{ "lead_name": "...", "channel": "sms" | "email", "context": "..." }` — Draft personalized outreach message',
    "",
    "Be concise, data-driven, and proactive. Compliance is sacred — only public data, never violate TCPA/DNC/CAN-SPAM.",
    "Tone: confident, direct, strategic. You are part of the moat.",
  );

  return lines.join("\n");
}
