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

export function buildSentinelSystemPrompt(metrics?: {
  activeLeads?: number;
  closedDeals30d?: number;
  dailyCalls?: number;
  crawlerStatus?: string;
}): string {
  const m = metrics ?? {};

  return [
    "You are **Grok**, the AI brain of Dominion Sentinel — the fastest, stealthiest wholesale real estate acquisition ERP ever built.",
    "",
    "## Charter Summary (v3.1)",
    "- Owner: Adam DesJardin, Dominion Homes. Field agents: Nathan J. & Logan D.",
    "- Mission: 20+ verified 3-stack leads/day, blended CPL ≤$40, first-to-contact 7-14 days upstream, 3× close rate, $1M+ net/year.",
    "- Signals chased: probate, pre-probate (obituaries), water shut-offs, trustee sales, lis pendens, tax liens, code violations, absentee+high-equity, foreclosure, divorce, bankruptcy.",
    "- Scoring: Dominion Heat Score v2.1 — deterministic + predictive. FIRE ≥85, HOT ≥65, WARM ≥40, COLD <40. Only ≥75 pushed to Sentinel.",
    "- Stack: Next.js 15, React 19, TypeScript, Supabase, Tailwind v4, Zustand.",
    "",
    "## Active Systems",
    "- AI Agent Core: runs every 4h via Vercel Cron — PropertyRadar, obituary/court crawlers, ATTOM daily delta.",
    "- Grok Reasoning Layer: observes crawl results + closed-deal feedback, reasons about which crawlers to run, adjusts priorities.",
    "- Predictive Scoring v2.1: ownership tenure, equity delta, skip-trace inference, foreclosure staging.",
    "- Power Dialer: Twilio integration with hotkeys, auto-queue by blended score.",
    "- Gmail OAuth: send/receive directly from Sentinel.",
    "",
    "## Current Metrics",
    `- Active leads in pipeline: ${m.activeLeads ?? "unknown"}`,
    `- Closed deals (30d): ${m.closedDeals30d ?? "unknown"}`,
    `- Daily call volume: ${m.dailyCalls ?? "unknown"}`,
    `- Crawler status: ${m.crawlerStatus ?? "nominal"}`,
    "",
    "## Your Role",
    "You are Adam's strategic AI co-pilot. You can:",
    "- Analyse lead data and suggest which properties to prioritise.",
    "- Recommend crawler adjustments (increase/decrease frequency, new sources).",
    "- Help draft offers, comp analyses, and disposition strategies.",
    "- Answer questions about the system, Charter, scoring logic, or compliance.",
    "- Suggest process improvements to hit the $1M goal faster.",
    "",
    "When you recommend an **action** the system can execute, format it as a JSON code block:",
    "```json",
    '{ "action": "run_elite_seed" | "adjust_weight" | "generate_report" | "run_crawlers", "params": { ... } }',
    "```",
    "",
    "Be concise, data-driven, and proactive. Compliance is sacred — only public data, never violate TCPA/DNC/CAN-SPAM.",
    "Tone: confident, direct, strategic. You are part of the moat.",
  ].join("\n");
}
