import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { withCronTracking } from "@/lib/cron-run-tracker";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/reconcile
 *
 * Detects and cleans up stuck/stale records across cron_runs,
 * delivery_runs, and agent_runs. Part of silent-failure hardening.
 *
 * - delivery_runs stuck in 'queued' for >5 min → mark 'failed'
 * - cron_runs stuck in 'running' for >10 min → mark 'stale'
 * - agent_runs stuck in 'running' for >30 min → mark 'stale'
 * - Warns if >3 delivery failures in last 15 min
 *
 * Secured by CRON_SECRET header.
 */
export async function GET(req: NextRequest) {
  const secret =
    req.headers.get("x-cron-secret") ?? req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (expected && secret !== expected && secret !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return withCronTracking("reconcile", async (run) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = createServerClient();
    const now = new Date();

    // ── 1. Stuck delivery_runs: queued for >5 minutes → failed ──────
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();

    const { data: stuckDeliveries, error: delQueryErr } = await supabase
      .from("delivery_runs")
      .select("id")
      .eq("status", "queued")
      .lt("created_at", fiveMinAgo);

    if (delQueryErr) {
      console.error("[reconcile] Failed to query stuck delivery_runs:", delQueryErr.message);
    }

    let deliveriesReconciled = 0;
    if (stuckDeliveries && stuckDeliveries.length > 0) {
      const ids = stuckDeliveries.map((r: { id: string }) => r.id);
      const { error: delUpdateErr } = await supabase
        .from("delivery_runs")
        .update({
          status: "failed",
          error_message: "delivery_timeout",
          completed_at: now.toISOString(),
        })
        .in("id", ids);

      if (delUpdateErr) {
        console.error("[reconcile] Failed to update stuck delivery_runs:", delUpdateErr.message);
      } else {
        deliveriesReconciled = ids.length;
        run.increment(deliveriesReconciled);
      }
    }

    // ── 2. Stuck cron_runs: running for >10 minutes → stale ─────────
    const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString();

    const { data: stuckCrons, error: cronQueryErr } = await supabase
      .from("cron_runs")
      .select("id")
      .eq("status", "running")
      .lt("started_at", tenMinAgo);

    if (cronQueryErr) {
      console.error("[reconcile] Failed to query stuck cron_runs:", cronQueryErr.message);
    }

    let cronsReconciled = 0;
    if (stuckCrons && stuckCrons.length > 0) {
      const ids = stuckCrons.map((r: { id: string }) => r.id);
      const { error: cronUpdateErr } = await supabase
        .from("cron_runs")
        .update({
          status: "stale",
          completed_at: now.toISOString(),
          error_message: "reconcile: stuck in running state",
        })
        .in("id", ids);

      if (cronUpdateErr) {
        console.error("[reconcile] Failed to update stuck cron_runs:", cronUpdateErr.message);
      } else {
        cronsReconciled = ids.length;
        run.increment(cronsReconciled);
      }
    }

    // ── 3. Stuck agent_runs: running for >30 minutes → stale ────────
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();

    const { data: stuckAgents, error: agentQueryErr } = await supabase
      .from("agent_runs")
      .select("id")
      .eq("status", "running")
      .lt("started_at", thirtyMinAgo);

    if (agentQueryErr) {
      console.error("[reconcile] Failed to query stuck agent_runs:", agentQueryErr.message);
    }

    let agentsReconciled = 0;
    if (stuckAgents && stuckAgents.length > 0) {
      const ids = stuckAgents.map((r: { id: string }) => r.id);
      const { error: agentUpdateErr } = await supabase
        .from("agent_runs")
        .update({
          status: "stale",
          completed_at: now.toISOString(),
          error: "reconcile: stuck in running state",
        })
        .in("id", ids);

      if (agentUpdateErr) {
        console.error("[reconcile] Failed to update stuck agent_runs:", agentUpdateErr.message);
      } else {
        agentsReconciled = ids.length;
        run.increment(agentsReconciled);
      }
    }

    // ── 4. Recent delivery failures warning ─────────────────────────
    const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000).toISOString();

    const { count: recentFailures, error: countErr } = await supabase
      .from("delivery_runs")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("completed_at", fifteenMinAgo);

    if (countErr) {
      console.error("[reconcile] Failed to count recent delivery failures:", countErr.message);
    }

    const failureCount = recentFailures ?? 0;
    let failureWarning: string | null = null;

    if (failureCount > 3) {
      failureWarning = `High delivery failure rate: ${failureCount} failures in last 15 minutes`;
      console.warn(`[reconcile] ${failureWarning}`);
    }

    // ── 5. Return summary ───────────────────────────────────────────
    const totalReconciled = deliveriesReconciled + cronsReconciled + agentsReconciled;

    return NextResponse.json({
      ok: true,
      reconciled: {
        total: totalReconciled,
        delivery_runs: deliveriesReconciled,
        cron_runs: cronsReconciled,
        agent_runs: agentsReconciled,
      },
      recentDeliveryFailures: failureCount,
      failureWarning,
    });
  });
}
