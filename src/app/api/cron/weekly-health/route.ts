import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { notifyWeeklyHealth } from "@/lib/notify";
import { withCronTracking } from "@/lib/cron-run-tracker";
import { summarizeAgentHealth, type AgentRunHealthRow } from "@/lib/agent-health";
import { getWeeklyFounderScorecard } from "@/lib/weekly-scorecard";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/weekly-health
 *
 * Monday 9am PT. Weekly health report covering:
 *   1. Schema drift — tables/columns that exist but aren't in Drizzle schema
 *   2. Agent fleet health — success/failure rates per agent over 7 days
 *   3. Pipeline velocity — leads created, stages advanced, deals closed this week
 *   4. Intelligence pipeline usage — artifacts, facts, dossiers created this week
 *   5. Voice session summary — calls handled, transfers, callbacks this week
 *   6. Quick-win backlog — easy improvements surfaced by data patterns
 *
 * Read-only except for storing the report itself. Secured by CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (expected && secret !== expected && secret !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return withCronTracking("weekly-health", async (run) => {
    const sb = createServerClient();
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // ── 1. Agent fleet health (7-day window) ────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: agentRuns } = await (sb.from("agent_runs") as any)
      .select("id, agent_name, status, duration_ms, cost_cents, error, started_at, completed_at")
      .gte("started_at", sevenDaysAgo);

    const agentHealth: Record<string, AgentStats> = {};
    for (const run of agentRuns ?? []) {
      const name = run.agent_name as string;
      if (!agentHealth[name]) {
        agentHealth[name] = { total: 0, completed: 0, failed: 0, avgDurationMs: 0, totalCostCents: 0 };
      }
      const stats = agentHealth[name];
      stats.total++;
      if (run.status === "completed") stats.completed++;
      if (run.status === "failed") stats.failed++;
      if (run.duration_ms) stats.avgDurationMs += run.duration_ms;
      if (run.cost_cents) stats.totalCostCents += run.cost_cents;
    }
    // Calculate averages
    for (const stats of Object.values(agentHealth)) {
      if (stats.completed > 0) stats.avgDurationMs = Math.round(stats.avgDurationMs / stats.completed);
    }
    const fleetSummary = summarizeAgentHealth((agentRuns ?? []) as AgentRunHealthRow[], 24 * 7, now.toISOString());

    const founderScorecard = await getWeeklyFounderScorecard({ windowDays: 7 }).catch((error) => {
      console.error("[weekly-health] founder scorecard failed:", error);
      return null;
    });

    // ── 2. Pipeline velocity ────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: leadsCreated } = await (sb.from("leads") as any)
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: stageTransitions } = await (sb.from("event_log") as any)
      .select("id", { count: "exact", head: true })
      .eq("action", "lead.stage_transition")
      .gte("created_at", sevenDaysAgo);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: callsLogged } = await (sb.from("calls_log") as any)
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: tasksCompleted } = await (sb.from("tasks") as any)
      .select("id", { count: "exact", head: true })
      .in("status", ["completed", "done"])
      .gte("updated_at", sevenDaysAgo);

    const pipeline = {
      leadsCreated: leadsCreated ?? 0,
      stageTransitions: stageTransitions ?? 0,
      callsLogged: callsLogged ?? 0,
      tasksCompleted: tasksCompleted ?? 0,
    };

    // ── 3. Intelligence pipeline usage ──────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: artifactsCreated } = await (sb.from("dossier_artifacts") as any)
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: factsCreated } = await (sb.from("fact_assertions") as any)
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: dossiersCreated } = await (sb.from("dossiers") as any)
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: reviewItemsProcessed } = await (sb.from("review_queue") as any)
      .select("id", { count: "exact", head: true })
      .in("status", ["approved", "rejected"])
      .gte("reviewed_at", sevenDaysAgo);

    const intelligence = {
      artifactsCreated: artifactsCreated ?? 0,
      factsCreated: factsCreated ?? 0,
      dossiersCreated: dossiersCreated ?? 0,
      reviewItemsProcessed: reviewItemsProcessed ?? 0,
    };

    // ── 4. Voice session summary ────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: voiceSessions } = await (sb.from("voice_sessions") as any)
      .select("status, caller_type, callback_requested, duration_seconds")
      .gte("created_at", sevenDaysAgo);

    const voice = {
      totalCalls: (voiceSessions ?? []).length,
      transferred: (voiceSessions ?? []).filter((v: { status: string }) => v.status === "transferred").length,
      completed: (voiceSessions ?? []).filter((v: { status: string }) => v.status === "completed").length,
      callbacksRequested: (voiceSessions ?? []).filter((v: { callback_requested: boolean }) => v.callback_requested).length,
      sellerCalls: (voiceSessions ?? []).filter((v: { caller_type: string }) => v.caller_type === "seller").length,
      avgDurationSec: (voiceSessions ?? []).length > 0
        ? Math.round(
            (voiceSessions ?? []).reduce((sum: number, v: { duration_seconds: number | null }) => sum + (v.duration_seconds ?? 0), 0)
            / (voiceSessions ?? []).length
          )
        : 0,
    };

    // ── 5. Quick-win detection ──────────────────────────────────────
    const quickWins: string[] = [];

    // Leads created but never called
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: neverCalled } = await (sb.from("leads") as any)
      .select("id", { count: "exact", head: true })
      .in("status", ["prospect", "lead"])
      .eq("total_calls", 0)
      .gte("created_at", sevenDaysAgo);

    if ((neverCalled ?? 0) > 0) {
      quickWins.push(`${neverCalled} new leads this week with zero call attempts`);
    }

    // High-motivation leads not in negotiation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: hotNotAdvanced } = await (sb.from("leads") as any)
      .select("id", { count: "exact", head: true })
      .gte("motivation_level", 4)
      .in("status", ["prospect", "lead"]);

    if ((hotNotAdvanced ?? 0) > 0) {
      quickWins.push(`${hotNotAdvanced} high-motivation leads (4-5) still pre-negotiation`);
    }

    // Review queue backlog
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: pendingReviews } = await (sb.from("review_queue") as any)
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    if ((pendingReviews ?? 0) > 5) {
      quickWins.push(`${pendingReviews} pending agent proposals in review queue — review backlog growing`);
    }

    // Agents with 0 runs this week (may be disabled when they should be on)
    const activeAgents = ["exception", "research", "follow-up", "qa", "dispo", "ads_monitor"];
    const dormantAgents = activeAgents.filter(a => !agentHealth[a] || agentHealth[a].total === 0);
    if (dormantAgents.length > 0) {
      quickWins.push(`Dormant agents (0 runs this week): ${dormantAgents.join(", ")}`);
    }

    // Agent failure rate >25%
    for (const [name, stats] of Object.entries(agentHealth)) {
      if (stats.total >= 3 && stats.failed / stats.total > 0.25) {
        quickWins.push(`Agent "${name}" failing ${Math.round(stats.failed / stats.total * 100)}% of runs (${stats.failed}/${stats.total})`);
      }
    }

    // ── Assemble report ─────────────────────────────────────────────
    const report = {
      ok: true,
      timestamp: now.toISOString(),
      weekEnding: now.toISOString().slice(0, 10),
      agentHealth,
      pipeline,
      intelligence,
      voice,
      founderScorecard,
      quickWins,
      summary: buildSummary(pipeline, intelligence, voice, quickWins, agentHealth),
    };

    // ── Dispatch to Slack (fire-and-forget) ────────────────────────
    notifyWeeklyHealth({
      weekEnding: report.weekEnding,
      summary: report.summary,
      agentHealth: report.agentHealth,
      fleetSummary,
      pipeline: report.pipeline,
      intelligence: report.intelligence,
      voice: report.voice,
      founderScorecard: report.founderScorecard ?? undefined,
      quickWins: report.quickWins,
    }).catch(() => {});

    run.increment();
    return NextResponse.json(report);
  });
}

interface AgentStats {
  total: number;
  completed: number;
  failed: number;
  avgDurationMs: number;
  totalCostCents: number;
}

function buildSummary(
  pipeline: Record<string, number>,
  intelligence: Record<string, number>,
  voice: Record<string, number>,
  quickWins: string[],
  agentHealth: Record<string, AgentStats>,
): string {
  const totalAgentRuns = Object.values(agentHealth).reduce((s, a) => s + a.total, 0);
  const totalAgentCost = Object.values(agentHealth).reduce((s, a) => s + a.totalCostCents, 0);

  const parts = [
    `Week: ${pipeline.leadsCreated} new leads, ${pipeline.callsLogged} calls, ${pipeline.stageTransitions} stage transitions, ${pipeline.tasksCompleted} tasks completed.`,
    `Intel: ${intelligence.artifactsCreated} artifacts, ${intelligence.factsCreated} facts, ${intelligence.dossiersCreated} dossiers, ${intelligence.reviewItemsProcessed} reviews processed.`,
    `Voice: ${voice.totalCalls} AI calls (${voice.sellerCalls} sellers, ${voice.transferred} transferred, ${voice.callbacksRequested} callbacks).`,
    `Agents: ${totalAgentRuns} runs ($${(totalAgentCost / 100).toFixed(2)} total cost).`,
  ];

  if (quickWins.length > 0) {
    parts.push(`Quick wins: ${quickWins.length} opportunities identified.`);
  }

  return parts.join(" ");
}
