import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { normalizeSource, sourceLabel } from "@/lib/source-normalization";

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
 *
 * Query params:
 *   ?period=30|60|90|all  (default: "all") — days lookback
 */
export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const periodParam = req.nextUrl.searchParams.get("period") ?? "all";
    const daysBack = periodParam === "all" ? null : parseInt(periodParam, 10) || null;
    const cutoff = daysBack
      ? new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString()
      : null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tbl = (name: string) => sb.from(name) as any;

    // ── Fetch leads ──────────────────────────────────────────────────
    let leadsQuery = tbl("leads")
      .select("id, source, status, total_calls, live_answers, motivation_level, acquisition_cost, created_at");

    if (cutoff) {
      leadsQuery = leadsQuery.gte("created_at", cutoff);
    }

    const { data: leads } = await leadsQuery;

    if (!leads || leads.length === 0) {
      return NextResponse.json({ ok: true, sources: [], summary: "No leads in system." });
    }

    // ── Fetch deals (contracts) ──────────────────────────────────────
    const { data: deals } = await tbl("deals")
      .select("id, lead_id, status, contract_price, assignment_fee, created_at");

    // ── Fetch source costs ───────────────────────────────────────────
    let costsQuery = tbl("source_costs").select("source_key, total_cost, period_start");
    if (cutoff) {
      costsQuery = costsQuery.gte("period_start", cutoff.slice(0, 10));
    }
    const { data: sourceCostsRaw } = await costsQuery;

    // Aggregate costs by source_key
    const costBySource = new Map<string, number>();
    for (const row of sourceCostsRaw ?? []) {
      const key = row.source_key as string;
      costBySource.set(key, (costBySource.get(key) ?? 0) + Number(row.total_cost ?? 0));
    }

    // Build lookup: leadId -> normalized source
    const leadSourceMap = new Map<string, string>();
    for (const l of leads) {
      leadSourceMap.set(l.id, normalizeSource(l.source));
    }

    // ── Aggregate by source ──────────────────────────────────────────
    type SourceStats = {
      source: string;
      totalLeads: number;
      byStatus: Record<string, number>;
      totalCalls: number;
      liveAnswers: number;
      qualifiedLeads: number;
      hotLeads: number;
      offersCount: number;
      contracts: number;
      closedDeals: number;
      totalContractValue: number;
      totalAssignmentFees: number;
      avgMotivation: number;
      motivationSum: number;
      motivationCount: number;
      leadAcquisitionCostSum: number;
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
          offersCount: 0,
          contracts: 0,
          closedDeals: 0,
          totalContractValue: 0,
          totalAssignmentFees: 0,
          avgMotivation: 0,
          motivationSum: 0,
          motivationCount: 0,
          leadAcquisitionCostSum: 0,
        });
      }
      return sources.get(source)!;
    };

    for (const l of leads) {
      const key = normalizeSource(l.source);
      const s = getOrCreate(key);
      s.totalLeads++;
      s.byStatus[l.status] = (s.byStatus[l.status] ?? 0) + 1;
      s.totalCalls += l.total_calls ?? 0;
      s.liveAnswers += l.live_answers ?? 0;

      if (["negotiation", "disposition"].includes(l.status)) {
        s.qualifiedLeads++;
      }
      if (l.status === "negotiation" || (l as Record<string, unknown>).offer_amount) {
        s.offersCount++;
      }
      if ((l.motivation_level ?? 0) >= 4) {
        s.hotLeads++;
      }
      if (l.motivation_level != null) {
        s.motivationSum += l.motivation_level;
        s.motivationCount++;
      }
      if (l.acquisition_cost != null) {
        s.leadAcquisitionCostSum += Number(l.acquisition_cost);
      }
    }

    // Add deal data
    for (const d of deals ?? []) {
      const source = leadSourceMap.get(d.lead_id) ?? "unknown";
      const s = getOrCreate(source);
      const dealStatus = (d.status ?? "").toLowerCase();

      if (["under_contract", "closed", "assigned"].includes(dealStatus)) {
        s.contracts++;
        s.totalContractValue += d.contract_price ?? 0;
        s.totalAssignmentFees += d.assignment_fee ?? 0;
      }
      if (dealStatus === "closed") {
        s.closedDeals++;
      }
    }

    // ── Compute final metrics and format ─────────────────────────────
    const result = Array.from(sources.values())
      .map((s) => {
        // Total cost = source_costs table spend + per-lead acquisition costs
        const platformCost = costBySource.get(s.source) ?? 0;
        const totalCost = platformCost + s.leadAcquisitionCostSum;

        return {
          source: s.source,
          sourceLabel: sourceLabel(s.source),
          totalLeads: s.totalLeads,
          byStatus: s.byStatus,

          // Contact metrics
          totalCalls: s.totalCalls,
          liveAnswers: s.liveAnswers,
          contactRate: s.totalLeads > 0
            ? Math.round((s.liveAnswers / Math.max(s.totalCalls, 1)) * 100)
            : 0,

          // Funnel: leads -> qualified -> offers -> contracts -> closed
          qualifiedLeads: s.qualifiedLeads,
          qualificationRate: s.totalLeads > 0
            ? Math.round((s.qualifiedLeads / s.totalLeads) * 100)
            : 0,
          offersCount: s.offersCount,
          offerRate: s.qualifiedLeads > 0
            ? Math.round((s.offersCount / s.qualifiedLeads) * 100)
            : 0,
          contracts: s.contracts,
          contractRate: s.totalLeads > 0
            ? Math.round((s.contracts / s.totalLeads) * 10000) / 100
            : 0,
          closedDeals: s.closedDeals,

          // Revenue
          totalContractValue: s.totalContractValue,
          totalAssignmentFees: s.totalAssignmentFees,

          // Cost tracking (Blueprint 5.8 bake-off)
          platformCost,
          leadAcquisitionCost: s.leadAcquisitionCostSum,
          totalCost,
          costPerLead: s.totalLeads > 0
            ? Math.round((totalCost / s.totalLeads) * 100) / 100
            : null,
          costPerQualified: s.qualifiedLeads > 0
            ? Math.round((totalCost / s.qualifiedLeads) * 100) / 100
            : null,
          costPerContract: s.contracts > 0
            ? Math.round((totalCost / s.contracts) * 100) / 100
            : null,

          // ROI (assignment fees vs cost)
          roi: totalCost > 0
            ? Math.round(((s.totalAssignmentFees - totalCost) / totalCost) * 10000) / 100
            : null,

          // Motivation
          hotLeads: s.hotLeads,
          avgMotivation: s.motivationCount > 0
            ? Math.round((s.motivationSum / s.motivationCount) * 10) / 10
            : null,
        };
      })
      .sort((a, b) => {
        // Primary: cost-per-contract ascending (cheapest source wins), nulls last
        if (a.costPerContract != null && b.costPerContract != null) {
          return a.costPerContract - b.costPerContract;
        }
        if (a.costPerContract != null) return -1;
        if (b.costPerContract != null) return 1;
        // Secondary: contracts descending
        return b.contracts - a.contracts || b.qualifiedLeads - a.qualifiedLeads;
      });

    const totalLeads = leads.length;
    const totalContracts = result.reduce((sum, s) => sum + s.contracts, 0);
    const totalSpend = result.reduce((sum, s) => sum + s.totalCost, 0);
    const totalFees = result.reduce((sum, s) => sum + s.totalAssignmentFees, 0);

    return NextResponse.json({
      ok: true,
      sources: result,
      summary: {
        totalLeads,
        totalContracts,
        totalSources: result.length,
        totalSpend,
        totalAssignmentFees: totalFees,
        blendedCostPerContract: totalContracts > 0
          ? Math.round((totalSpend / totalContracts) * 100) / 100
          : null,
        blendedROI: totalSpend > 0
          ? Math.round(((totalFees - totalSpend) / totalSpend) * 10000) / 100
          : null,
        topSourceByVolume: result.sort((a, b) => b.totalLeads - a.totalLeads)[0]?.source ?? null,
        topSourceByCostPerContract: result
          .filter((s) => s.costPerContract != null)
          .sort((a, b) => (a.costPerContract ?? Infinity) - (b.costPerContract ?? Infinity))[0]?.source ?? null,
      },
      period: daysBack ? `${daysBack}d` : "all",
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
