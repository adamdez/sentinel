/**
 * GET /api/analytics/conversion
 *
 * Conversion analytics from lead_stage_snapshots.
 * Returns: funnel counts, conversion rate by signal type,
 * top signal combinations, average days-to-close, and tier→deal matrix.
 */

import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sb = createServerClient();

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await sb.auth.getUser(token ?? "");
  if (authErr || !user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tbl = (name: string) => sb.from(name) as any;

  try {
    // 1. Funnel counts by stage
    const { data: funnelData } = await tbl("lead_stage_snapshots")
      .select("to_status")
      .order("created_at", { ascending: false });

    const funnelCounts: Record<string, number> = {};
    for (const row of funnelData ?? []) {
      funnelCounts[row.to_status] = (funnelCounts[row.to_status] ?? 0) + 1;
    }

    // 2. Conversion rate by signal type
    // Count how many times each signal type appears in snapshots that reach "closed" vs total
    const { data: closedSnapshots } = await tbl("lead_stage_snapshots")
      .select("signal_types")
      .eq("to_status", "closed");

    const { data: allLeadSnapshots } = await tbl("lead_stage_snapshots")
      .select("signal_types")
      .eq("to_status", "prospect");

    const signalClosedCounts: Record<string, number> = {};
    const signalTotalCounts: Record<string, number> = {};

    for (const row of allLeadSnapshots ?? []) {
      for (const sig of (row.signal_types ?? []) as string[]) {
        signalTotalCounts[sig] = (signalTotalCounts[sig] ?? 0) + 1;
      }
    }
    for (const row of closedSnapshots ?? []) {
      for (const sig of (row.signal_types ?? []) as string[]) {
        signalClosedCounts[sig] = (signalClosedCounts[sig] ?? 0) + 1;
      }
    }

    const conversionBySignal: Record<string, { closed: number; total: number; rate: number }> = {};
    for (const sig of Object.keys(signalTotalCounts)) {
      const closed = signalClosedCounts[sig] ?? 0;
      const total = signalTotalCounts[sig];
      conversionBySignal[sig] = { closed, total, rate: total > 0 ? Math.round((closed / total) * 1000) / 10 : 0 };
    }

    // 3. Top signal combinations
    const comboCounts: Record<string, { closed: number; total: number }> = {};
    for (const row of allLeadSnapshots ?? []) {
      const combo = row.signal_types?.sort().join("+") ?? "none";
      if (!comboCounts[combo]) comboCounts[combo] = { closed: 0, total: 0 };
      comboCounts[combo].total++;
    }
    for (const row of closedSnapshots ?? []) {
      const combo = row.signal_types?.sort().join("+") ?? "none";
      if (!comboCounts[combo]) comboCounts[combo] = { closed: 0, total: 0 };
      comboCounts[combo].closed++;
    }

    const topCombinations = Object.entries(comboCounts)
      .map(([combo, counts]) => ({
        combination: combo,
        ...counts,
        rate: counts.total > 0 ? Math.round((counts.closed / counts.total) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);

    // 4. Average days in each stage
    const { data: velocityData } = await tbl("lead_stage_snapshots")
      .select("to_status, days_in_previous_stage")
      .not("days_in_previous_stage", "is", null);

    const stageDays: Record<string, { sum: number; count: number }> = {};
    for (const row of velocityData ?? []) {
      if (!stageDays[row.to_status]) stageDays[row.to_status] = { sum: 0, count: 0 };
      stageDays[row.to_status].sum += row.days_in_previous_stage;
      stageDays[row.to_status].count++;
    }
    const avgDaysByStage: Record<string, number> = {};
    for (const [stage, data] of Object.entries(stageDays)) {
      avgDaysByStage[stage] = Math.round(data.sum / data.count);
    }

    // 5. Tier conversion matrix
    const { data: tierSnapshots } = await tbl("lead_stage_snapshots")
      .select("tier_at_transition, to_status")
      .in("to_status", ["prospect", "closed", "dead"]);

    const tierMatrix: Record<string, { prospects: number; closed: number; dead: number; closeRate: number }> = {};
    for (const row of tierSnapshots ?? []) {
      const tier = row.tier_at_transition ?? "unknown";
      if (!tierMatrix[tier]) tierMatrix[tier] = { prospects: 0, closed: 0, dead: 0, closeRate: 0 };
      if (row.to_status === "prospect") tierMatrix[tier].prospects++;
      if (row.to_status === "closed") tierMatrix[tier].closed++;
      if (row.to_status === "dead") tierMatrix[tier].dead++;
    }
    for (const data of Object.values(tierMatrix)) {
      data.closeRate = data.prospects > 0 ? Math.round((data.closed / data.prospects) * 1000) / 10 : 0;
    }

    // 6. Dead lead reasons
    const { data: deadSnapshots } = await tbl("lead_stage_snapshots")
      .select("metadata")
      .eq("to_status", "dead");

    const deadReasons: Record<string, number> = {};
    for (const row of deadSnapshots ?? []) {
      const reason = (row.metadata as Record<string, unknown>)?.dead_reason as string ?? "unspecified";
      deadReasons[reason] = (deadReasons[reason] ?? 0) + 1;
    }

    return Response.json({
      funnelCounts,
      conversionBySignal,
      topCombinations,
      avgDaysByStage,
      tierMatrix,
      deadReasons,
      snapshotCount: (funnelData ?? []).length,
    });
  } catch (err) {
    console.error("[Analytics/Conversion] Error:", err);
    return Response.json({ error: "Failed to compute analytics" }, { status: 500 });
  }
}
