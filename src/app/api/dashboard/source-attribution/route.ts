import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

/**
 * GET /api/dashboard/source-attribution
 *
 * Source attribution report for the prospect engine bake-off.
 * Tracks cost-per-contract and conversion funnel by lead source.
 *
 * Blueprint 5.8: "Track source attribution in Sentinel from day one.
 * Do not judge on lead volume. Judge on cost-per-contract and qualified
 * conversation rate."
 *
 * Blueprint 12.1 north-star: "Cost-per-contract by prospect engine"
 */
export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // ── Lead funnel by source ──────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: leads } = await (sb.from("leads") as any)
      .select("id, source, status, total_calls, live_answers, motivation_level, created_at");

    if (!leads || leads.length === 0) {
      return NextResponse.json({ ok: true, sources: [], summary: "No leads in system." });
    }

    // ── Deals (contracts) by lead source ───────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: deals } = await (sb.from("deals") as any)
      .select("id, lead_id, status, contract_price, assignment_fee, created_at");

    // Build lookup: leadId → source
    const leadSourceMap = new Map<string, string>();
    for (const l of leads) {
      leadSourceMap.set(l.id, l.source ?? "unknown");
    }

    // ── Aggregate by source ────────────────────────────────────────────
    type SourceStats = {
      source: string;
      totalLeads: number;
      byStatus: Record<string, number>;
      totalCalls: number;
      liveAnswers: number;
      qualifiedLeads: number;
      hotLeads: number;
      contracts: number;
      totalContractValue: number;
      totalAssignmentFees: number;
      avgMotivation: number;
      motivationSum: number;
      motivationCount: number;
    };

    const sources = new Map<string, SourceStats>();

    const getOrCreate = (source: string): SourceStats => {
      if (!sources.has(source)) {
        sources.set(source, {
          source,
          totalLeads: 0,
          byStatus: {},
          totalCalls: 0,
          liveAnswers: 0,
          qualifiedLeads: 0,
          hotLeads: 0,
          contracts: 0,
          totalContractValue: 0,
          totalAssignmentFees: 0,
          avgMotivation: 0,
          motivationSum: 0,
          motivationCount: 0,
        });
      }
      return sources.get(source)!;
    };

    for (const l of leads) {
      const s = getOrCreate(l.source ?? "unknown");
      s.totalLeads++;
      s.byStatus[l.status] = (s.byStatus[l.status] ?? 0) + 1;
      s.totalCalls += l.total_calls ?? 0;
      s.liveAnswers += l.live_answers ?? 0;
      if (["qualified", "negotiation", "disposition"].includes(l.status)) {
        s.qualifiedLeads++;
      }
      if ((l.motivation_level ?? 0) >= 4) {
        s.hotLeads++;
      }
      if (l.motivation_level != null) {
        s.motivationSum += l.motivation_level;
        s.motivationCount++;
      }
    }

    // Add deal data
    for (const d of deals ?? []) {
      const source = leadSourceMap.get(d.lead_id) ?? "unknown";
      const s = getOrCreate(source);
      if (["under_contract", "closed", "assigned"].includes(d.status)) {
        s.contracts++;
        s.totalContractValue += d.contract_price ?? 0;
        s.totalAssignmentFees += d.assignment_fee ?? 0;
      }
    }

    // Compute averages and format
    const result = Array.from(sources.values())
      .map((s) => ({
        source: s.source,
        totalLeads: s.totalLeads,
        byStatus: s.byStatus,
        totalCalls: s.totalCalls,
        liveAnswers: s.liveAnswers,
        contactRate: s.totalLeads > 0
          ? Math.round((s.liveAnswers / Math.max(s.totalCalls, 1)) * 100)
          : 0,
        qualifiedLeads: s.qualifiedLeads,
        qualificationRate: s.totalLeads > 0
          ? Math.round((s.qualifiedLeads / s.totalLeads) * 100)
          : 0,
        hotLeads: s.hotLeads,
        contracts: s.contracts,
        conversionRate: s.totalLeads > 0
          ? Math.round((s.contracts / s.totalLeads) * 10000) / 100
          : 0,
        totalContractValue: s.totalContractValue,
        totalAssignmentFees: s.totalAssignmentFees,
        avgMotivation: s.motivationCount > 0
          ? Math.round((s.motivationSum / s.motivationCount) * 10) / 10
          : null,
      }))
      .sort((a, b) => b.contracts - a.contracts || b.qualifiedLeads - a.qualifiedLeads);

    const totalLeads = leads.length;
    const totalContracts = result.reduce((sum, s) => sum + s.contracts, 0);

    return NextResponse.json({
      ok: true,
      sources: result,
      summary: {
        totalLeads,
        totalContracts,
        totalSources: result.length,
        topSource: result[0]?.source ?? null,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
