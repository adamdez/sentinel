/**
 * Grok Reasoning Agent — Sentinel AI Brain
 *
 * Charter v3.1 §5.3/5.4 — AI as massive leverage.
 * Uses Grok (xAI) to observe recent ingest results and closed-deal feedback,
 * reason about which crawlers/sources to prioritise, and produce structured
 * instructions the Agent Core executes.
 *
 * Budget-safe: max 3-4 calls per 4-hour cycle, temperature 0 for determinism.
 * Fully auditable: every Grok decision is logged to event_log.
 */

import { createServerClient } from "@/lib/supabase";

const GROK_ENDPOINT = "https://api.x.ai/v1/chat/completions";
const GROK_MODEL = "grok-4-latest";
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

// ── Types ────────────────────────────────────────────────────────────

export interface GrokDirective {
  nextCrawlersToRun: string[];
  priorityAdjustments: PriorityAdjustment[];
  newCrawlerSuggestions: string[];
  reasoning: string;
}

export interface PriorityAdjustment {
  signalType: string;
  adjustment: "increase" | "decrease" | "neutral";
  reason: string;
}

export interface GrokCycleContext {
  recentCrawlResults: CrawlSummary[];
  closedDeals: DealSummary[];
  activeSignalDistribution: Record<string, number>;
  currentLeadCount: number;
  costBudgetRemaining: number;
}

interface CrawlSummary {
  source: string;
  crawled: number;
  promoted: number;
  errors: number;
  lastRun: string;
}

interface DealSummary {
  signalTypes: string[];
  heatScore: number;
  daysFromSignalToClose: number;
}

// ── Grok API Call ────────────────────────────────────────────────────

async function callGrok(prompt: string): Promise<string> {
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) {
    throw new Error("GROK_API_KEY not configured");
  }

  const res = await fetch(GROK_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROK_MODEL,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: [
            "You are the Sentinel AI reasoning engine for a wholesale real estate acquisition system.",
            "You analyse recent crawl results and closed-deal feedback to decide which data sources to prioritise next.",
            "Always respond with valid JSON matching this schema:",
            '{ "nextCrawlersToRun": string[], "priorityAdjustments": [{ "signalType": string, "adjustment": "increase"|"decrease"|"neutral", "reason": string }], "newCrawlerSuggestions": string[], "reasoning": string }',
            "Be concise. Only recommend crawlers that exist: obituary, court_docket, utility_shutoff, propertyradar, attom.",
            "Only suggest new crawler ideas if you see a clear gap. Compliance is sacred — only public data, no messaging.",
          ].join(" "),
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Grok API ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// ── Parse Grok Response ──────────────────────────────────────────────

function parseGrokDirective(raw: string): GrokDirective {
  const fallback: GrokDirective = {
    nextCrawlersToRun: ["obituary", "court_docket", "utility_shutoff", "propertyradar", "attom"],
    priorityAdjustments: [],
    newCrawlerSuggestions: [],
    reasoning: "Fallback: run all crawlers (Grok response unparseable)",
  };

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return fallback;

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      nextCrawlersToRun: Array.isArray(parsed.nextCrawlersToRun)
        ? parsed.nextCrawlersToRun.filter((s: unknown) => typeof s === "string")
        : fallback.nextCrawlersToRun,
      priorityAdjustments: Array.isArray(parsed.priorityAdjustments)
        ? parsed.priorityAdjustments
        : [],
      newCrawlerSuggestions: Array.isArray(parsed.newCrawlerSuggestions)
        ? parsed.newCrawlerSuggestions.filter((s: unknown) => typeof s === "string")
        : [],
      reasoning: typeof parsed.reasoning === "string"
        ? parsed.reasoning
        : "No reasoning provided",
    };
  } catch {
    return fallback;
  }
}

// ── Build Context from Supabase ──────────────────────────────────────

async function buildCycleContext(): Promise<GrokCycleContext> {
  const sb = createServerClient();

  // Recent crawl logs (last 24h)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: recentLogs } = await (sb.from("event_log") as any)
    .select("action, details, created_at")
    .in("action", [
      "crawl_run",
      "attom_daily_ingest",
      "propertyradar_top10_ingest",
      "agent_grok_decision",
    ])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);

  const recentCrawlResults: CrawlSummary[] = (recentLogs ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (log: any) => ({
      source: log.action,
      crawled: log.details?.total_crawled ?? log.details?.total_fetched ?? 0,
      promoted: log.details?.total_promoted ?? 0,
      errors: log.details?.errors ?? 0,
      lastRun: log.created_at,
    }),
  );

  // Closed deals (last 30 days) for feedback loop
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: closedLeads } = await (sb.from("leads") as any)
    .select("tags, priority, created_at, updated_at")
    .eq("status", "closed")
    .gte("updated_at", thirtyDaysAgo)
    .limit(20);

  const closedDeals: DealSummary[] = (closedLeads ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (l: any) => ({
      signalTypes: l.tags ?? [],
      heatScore: l.priority ?? 0,
      daysFromSignalToClose: Math.round(
        (new Date(l.updated_at).getTime() - new Date(l.created_at).getTime()) /
          (86400000),
      ),
    }),
  );

  // Signal distribution among active prospects/leads
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: activeLeads } = await (sb.from("leads") as any)
    .select("tags")
    .in("status", ["prospect", "lead", "negotiation"])
    .limit(200);

  const signalDist: Record<string, number> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const lead of activeLeads ?? []) {
    for (const tag of (lead.tags ?? []) as string[]) {
      signalDist[tag] = (signalDist[tag] ?? 0) + 1;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count } = await (sb.from("leads") as any)
    .select("id", { count: "exact", head: true })
    .in("status", ["prospect", "lead", "negotiation"]);

  return {
    recentCrawlResults,
    closedDeals,
    activeSignalDistribution: signalDist,
    currentLeadCount: count ?? 0,
    costBudgetRemaining: 500,
  };
}

// ── Main Entry Point ─────────────────────────────────────────────────

export async function runGrokReasoning(): Promise<GrokDirective> {
  const apiKey = process.env.GROK_API_KEY;

  if (!apiKey) {
    console.log("[Grok] GROK_API_KEY not set — using default run-all directive");
    return {
      nextCrawlersToRun: ["obituary", "court_docket", "utility_shutoff", "propertyradar", "attom"],
      priorityAdjustments: [],
      newCrawlerSuggestions: [],
      reasoning: "GROK_API_KEY not configured — running all crawlers by default",
    };
  }

  console.log("[Grok] Building cycle context...");
  const context = await buildCycleContext();

  const prompt = [
    "Here is the current state of our lead acquisition pipeline:",
    "",
    `Active leads: ${context.currentLeadCount}`,
    `Monthly budget remaining: ~$${context.costBudgetRemaining}`,
    "",
    "Recent crawl results (last 24h):",
    context.recentCrawlResults.length === 0
      ? "  No recent crawls"
      : context.recentCrawlResults
          .map((r) => `  - ${r.source}: ${r.crawled} crawled, ${r.promoted} promoted, ${r.errors} errors`)
          .join("\n"),
    "",
    "Signal distribution among active leads:",
    Object.entries(context.activeSignalDistribution).length === 0
      ? "  No signals yet"
      : Object.entries(context.activeSignalDistribution)
          .sort((a, b) => b[1] - a[1])
          .map(([signal, count]) => `  - ${signal}: ${count}`)
          .join("\n"),
    "",
    "Closed deals (last 30 days) for feedback:",
    context.closedDeals.length === 0
      ? "  No closed deals yet"
      : context.closedDeals
          .map((d) => `  - signals: ${d.signalTypes.join(",")} | heat: ${d.heatScore} | days to close: ${d.daysFromSignalToClose}`)
          .join("\n"),
    "",
    "Based on this data, which crawlers should we prioritise this cycle?",
    "Should we adjust priority weights for any signal types?",
    "Any new data sources we should consider adding?",
  ].join("\n");

  console.log("[Grok] Calling Grok for reasoning...");
  const raw = await callGrok(prompt);
  const directive = parseGrokDirective(raw);

  // Audit log the decision
  const sb = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("event_log") as any).insert({
    user_id: SYSTEM_USER_ID,
    action: "agent_grok_decision",
    entity_type: "system",
    entity_id: "grok_reasoning",
    details: {
      directive,
      context_summary: {
        active_leads: context.currentLeadCount,
        recent_crawls: context.recentCrawlResults.length,
        closed_deals_30d: context.closedDeals.length,
        signal_types: Object.keys(context.activeSignalDistribution),
      },
      model: GROK_MODEL,
      timestamp: new Date().toISOString(),
    },
  });

  console.log(
    `[Grok] Directive: run [${directive.nextCrawlersToRun.join(", ")}], ` +
    `${directive.priorityAdjustments.length} adjustments, ` +
    `${directive.newCrawlerSuggestions.length} suggestions`,
  );

  return directive;
}
