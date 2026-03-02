/**
 * Grok Memory — Builds rich live context for all Grok interactions.
 *
 * Each query is individually wrapped so a missing table or slow query
 * never blocks the entire context build. The outer call also has a
 * hard 8-second timeout — if Supabase is slow, Grok still responds.
 */

import { createServerClient } from "@/lib/supabase";

export interface GrokFullContext {
  activeLeads: number;
  closedDeals30d: number;
  pipelineByStage: Record<string, number>;
  todayCalls: {
    outbound: number;
    liveAnswers: number;
    avgTalkTimeSec: number;
    connectRate: number;
  };
  top5Hottest: { ownerName: string; address: string; score: number; lastContact: string | null }[];
  coolingLeads: { ownerName: string; address: string; score: number; daysSinceContact: number }[];
  teamPerformance: { userName: string; callsToday: number }[];
  recentGrokDecisions: { action: string; reasoning: string; createdAt: string }[];
  prospectCount: number;
  leadsPerDayLast7d: number;
  crawlerStatus: string;
}

const STAGES = ["prospect", "lead", "negotiation", "disposition", "closed", "dead"] as const;

const CONTEXT_TIMEOUT_MS = 8_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safe<T>(promise: Promise<T>, fallback: T, label?: string): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    console.warn(`[Grok Memory] ${label ?? "query"} failed:`, err instanceof Error ? err.message : err);
    return fallback;
  }
}

function emptyContext(): GrokFullContext {
  return {
    activeLeads: 0,
    closedDeals30d: 0,
    pipelineByStage: {},
    todayCalls: { outbound: 0, liveAnswers: 0, avgTalkTimeSec: 0, connectRate: 0 },
    top5Hottest: [],
    coolingLeads: [],
    teamPerformance: [],
    recentGrokDecisions: [],
    prospectCount: 0,
    leadsPerDayLast7d: 0,
    crawlerStatus: "unknown",
  };
}

async function buildContextInner(): Promise<GrokFullContext> {
  const sb = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tbl = (name: string) => sb.from(name) as any;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayISO = todayStart.toISOString();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();

  const LIVE_ANSWER_EXCLUDE = "no_answer,voicemail,in_progress,initiating,sms_outbound";

  const [
    stageResults,
    closedDeals,
    todayOutbound,
    todayLive,
    todayDurations,
    top5Hot,
    cooling,
    teamCalls,
    grokDecisions,
    prospectCount,
    leadsLast7d,
  ] = await Promise.all([
    safe(
      Promise.all(
        STAGES.map(async (s) => {
          const { count } = await tbl("leads")
            .select("id", { count: "exact", head: true })
            .eq("status", s);
          return [s, count ?? 0] as [string, number];
        })
      ),
      STAGES.map((s) => [s, 0] as [string, number]),
      "pipeline-stages",
    ),

    safe(
      tbl("leads")
        .select("id", { count: "exact", head: true })
        .eq("status", "closed")
        .gte("updated_at", thirtyDaysAgo),
      { count: 0 },
      "closed-deals",
    ),

    safe(
      tbl("calls_log")
        .select("id", { count: "exact", head: true })
        .gte("started_at", todayISO)
        .neq("disposition", "sms_outbound"),
      { count: 0 },
      "today-outbound",
    ),

    safe(
      tbl("calls_log")
        .select("id", { count: "exact", head: true })
        .gte("started_at", todayISO)
        .not("disposition", "in", `(${LIVE_ANSWER_EXCLUDE})`),
      { count: 0 },
      "today-live",
    ),

    safe(
      tbl("calls_log")
        .select("duration_sec")
        .gte("started_at", todayISO)
        .gt("duration_sec", 0),
      { data: [] },
      "today-durations",
    ),

    safe(
      tbl("leads")
        .select("priority, last_contact_at, properties(owner_name, address)")
        .in("status", ["lead", "negotiation"])
        .gte("priority", 85)
        .order("priority", { ascending: false })
        .limit(5),
      { data: [] },
      "top5-hot",
    ),

    safe(
      tbl("leads")
        .select("priority, last_contact_at, properties(owner_name, address)")
        .in("status", ["lead", "negotiation"])
        .gte("priority", 65)
        .lte("last_contact_at", threeDaysAgo)
        .order("priority", { ascending: false })
        .limit(5),
      { data: [] },
      "cooling-leads",
    ),

    safe(
      tbl("calls_log")
        .select("user_id")
        .gte("started_at", todayISO)
        .neq("disposition", "sms_outbound"),
      { data: [] },
      "team-calls",
    ),

    safe(
      tbl("event_log")
        .select("action, details, created_at")
        .eq("action", "agent_grok_decision")
        .order("created_at", { ascending: false })
        .limit(3),
      { data: [] },
      "grok-decisions",
    ),

    safe(
      tbl("leads")
        .select("id", { count: "exact", head: true })
        .eq("status", "prospect"),
      { count: 0 },
      "prospect-count",
    ),

    safe(
      tbl("leads")
        .select("id", { count: "exact", head: true })
        .in("status", ["lead", "negotiation", "disposition", "closed"])
        .gte("created_at", sevenDaysAgo),
      { count: 0 },
      "leads-7d",
    ),
  ]);

  const pipelineByStage: Record<string, number> = {};
  for (const [stage, count] of stageResults) {
    pipelineByStage[stage] = count;
  }

  const durations: { duration_sec: number }[] = todayDurations.data ?? [];
  const avgTalkTimeSec = durations.length > 0
    ? Math.round(durations.reduce((s, r) => s + (r.duration_sec ?? 0), 0) / durations.length)
    : 0;

  const outbound = todayOutbound.count ?? 0;
  const liveAnswers = todayLive.count ?? 0;
  const connectRate = outbound > 0 ? Math.round((liveAnswers / outbound) * 100) : 0;

  const hotRows: { priority: number; last_contact_at: string | null; properties: { owner_name: string; address: string } | null }[] = top5Hot.data ?? [];
  const top5Hottest = hotRows.map((r) => ({
    ownerName: r.properties?.owner_name ?? "Unknown",
    address: r.properties?.address ?? "",
    score: r.priority,
    lastContact: r.last_contact_at,
  }));

  const coolRows: typeof hotRows = cooling.data ?? [];
  const now = Date.now();
  const coolingLeads = coolRows.map((r) => ({
    ownerName: r.properties?.owner_name ?? "Unknown",
    address: r.properties?.address ?? "",
    score: r.priority,
    daysSinceContact: r.last_contact_at ? Math.floor((now - new Date(r.last_contact_at).getTime()) / 86400000) : 99,
  }));

  const callRows: { user_id: string }[] = teamCalls.data ?? [];
  const callsByUser: Record<string, number> = {};
  for (const r of callRows) {
    callsByUser[r.user_id] = (callsByUser[r.user_id] ?? 0) + 1;
  }
  const teamPerformance = Object.entries(callsByUser).map(([uid, count]) => ({
    userName: uid.slice(0, 8),
    callsToday: count,
  }));

  const decisionRows: { action: string; details: Record<string, unknown>; created_at: string }[] = grokDecisions.data ?? [];
  const recentGrokDecisions = decisionRows.map((r) => ({
    action: r.action,
    reasoning: (r.details as { reasoning?: string })?.reasoning ?? JSON.stringify(r.details).slice(0, 200),
    createdAt: r.created_at,
  }));

  const activeLeads = (pipelineByStage["prospect"] ?? 0) +
    (pipelineByStage["lead"] ?? 0) +
    (pipelineByStage["negotiation"] ?? 0);

  return {
    activeLeads,
    closedDeals30d: closedDeals.count ?? 0,
    pipelineByStage,
    todayCalls: { outbound, liveAnswers, avgTalkTimeSec, connectRate },
    top5Hottest,
    coolingLeads,
    teamPerformance,
    recentGrokDecisions,
    prospectCount: prospectCount.count ?? 0,
    leadsPerDayLast7d: Math.round((leadsLast7d.count ?? 0) / 7),
    crawlerStatus: "nominal",
  };
}

export async function buildFullContext(_userId: string): Promise<GrokFullContext> {
  try {
    const result = await Promise.race([
      buildContextInner(),
      new Promise<GrokFullContext>((_, reject) =>
        setTimeout(() => reject(new Error("Context build timed out")), CONTEXT_TIMEOUT_MS)
      ),
    ]);
    return result;
  } catch (err) {
    console.error("[Grok Memory] buildFullContext failed, using empty context:", err instanceof Error ? err.message : err);
    return emptyContext();
  }
}
