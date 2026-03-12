/**
 * GET /api/analytics/source-performance
 *
 * Server-authoritative source performance + attribution endpoint.
 * Returns per-source metrics: leads, contacts, contracts, closed deals,
 * revenue, conversion rates, avg days to contract, and monthly trends.
 *
 * Query params:
 *   ?period=today|week|month|all  (default: "all")
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { getPeriodStart, type TimePeriod } from "@/lib/analytics";
import { normalizeSource, sourceLabel } from "@/lib/source-normalization";
import { isContractStatus } from "@/lib/analytics-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── Types ───────────────────────────────────────────────────────────

interface SourceRow {
  source_key: string;
  source_label: string;
  leads_count: number;
  contacted_count: number;
  contracts_count: number;
  closed_count: number;
  revenue: number;
  contact_rate: number | null;
  contract_rate: number | null;
  close_rate: number | null;
  avg_days_to_contract: number | null;
  monthly_trend: { month: string; leads: number }[];
}

// ── Route handler ───────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const sb = createServerClient();

  // Auth
  const user = await requireAuth(req, sb);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Period
  const periodParam = (req.nextUrl.searchParams.get("period") ?? "all") as TimePeriod;
  const validPeriods: TimePeriod[] = ["today", "week", "month", "all"];
  const period = validPeriods.includes(periodParam) ? periodParam : "all";
  const periodStart = getPeriodStart(period);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tbl = (name: string) => sb.from(name) as any;

  try {
    // 1. Fetch leads
    let leadsQuery = tbl("leads")
      .select("id, source, promoted_at, created_at, status, last_contact_at, total_calls")
      .neq("status", "staging");

    if (periodStart) {
      leadsQuery = leadsQuery.gte("created_at", periodStart);
    }

    const { data: leadsRaw, error: leadsErr } = await leadsQuery;
    if (leadsErr) throw leadsErr;

    interface LeadRow {
      id: string;
      source: string | null;
      promoted_at: string | null;
      created_at: string | null;
      status: string | null;
      last_contact_at: string | null;
      total_calls: number | null;
    }
    const leads: LeadRow[] = (leadsRaw ?? []) as LeadRow[];

    // 2. Fetch deals for these leads
    const leadIds = leads.map((l) => l.id).filter(Boolean);

    interface DealRow {
      id: string;
      lead_id: string | null;
      status: string | null;
      assignment_fee: number | null;
      closed_at: string | null;
      created_at: string | null;
    }

    let deals: DealRow[] = [];
    if (leadIds.length > 0) {
      // Batch in chunks of 500 to avoid query limits
      const chunks: string[][] = [];
      for (let i = 0; i < leadIds.length; i += 500) {
        chunks.push(leadIds.slice(i, i + 500));
      }
      for (const chunk of chunks) {
        const { data: dealData } = await tbl("deals")
          .select("id, lead_id, status, assignment_fee, closed_at, created_at")
          .in("lead_id", chunk);
        deals = deals.concat((dealData ?? []) as DealRow[]);
      }
    }

    // Index deals by lead_id
    const dealsByLeadId = new Map<string, DealRow[]>();
    for (const deal of deals) {
      if (!deal.lead_id) continue;
      const existing = dealsByLeadId.get(deal.lead_id) ?? [];
      existing.push(deal);
      dealsByLeadId.set(deal.lead_id, existing);
    }

    // 3. Compute per-source metrics
    const buckets = new Map<
      string,
      {
        leads: LeadRow[];
        contracts: DealRow[];
        closed: DealRow[];
        revenue: number;
        daysToContract: number[];
        monthlyLeads: Map<string, number>;
      }
    >();

    function getBucket(key: string) {
      if (!buckets.has(key)) {
        buckets.set(key, {
          leads: [],
          contracts: [],
          closed: [],
          revenue: 0,
          daysToContract: [],
          monthlyLeads: new Map(),
        });
      }
      return buckets.get(key)!;
    }

    // 6 months ago for trend computation
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    for (const lead of leads) {
      const key = normalizeSource(lead.source);
      const bucket = getBucket(key);
      bucket.leads.push(lead);

      // Monthly trend (last 6 months, regardless of period filter)
      const createdAt = lead.created_at ? new Date(lead.created_at) : null;
      if (createdAt && createdAt >= sixMonthsAgo) {
        const monthKey = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, "0")}`;
        bucket.monthlyLeads.set(monthKey, (bucket.monthlyLeads.get(monthKey) ?? 0) + 1);
      }

      // Deals for this lead
      const leadDeals = dealsByLeadId.get(lead.id) ?? [];
      for (const deal of leadDeals) {
        // Only count deals with meaningful contract status (not dead/draft)
        const dealStatus = (deal.status ?? "").toLowerCase();
        if (isContractStatus(deal.status) || Boolean(deal.closed_at)) bucket.contracts.push(deal);

        // Closed deals
        if (dealStatus === "closed" || deal.closed_at) {
          bucket.closed.push(deal);
          bucket.revenue += Number(deal.assignment_fee ?? 0);
        }

        // Days to contract: promoted_at -> deal.created_at
        const promotedAt = lead.promoted_at ?? lead.created_at;
        if (promotedAt && deal.created_at) {
          const promotedMs = new Date(promotedAt).getTime();
          const dealCreatedMs = new Date(deal.created_at).getTime();
          if (!isNaN(promotedMs) && !isNaN(dealCreatedMs) && dealCreatedMs >= promotedMs) {
            const days = (dealCreatedMs - promotedMs) / (1000 * 60 * 60 * 24);
            bucket.daysToContract.push(Math.round(days * 10) / 10);
          }
        }
      }
    }

    // Determine which contact indicates "contacted"
    function isContacted(lead: LeadRow): boolean {
      return (
        (lead.last_contact_at != null && lead.last_contact_at !== "") ||
        (lead.total_calls != null && lead.total_calls > 0)
      );
    }

    // Build monthly trend for last 6 months
    function buildMonthlyTrend(monthlyLeads: Map<string, number>): { month: string; leads: number }[] {
      const months: string[] = [];
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      }
      return months.map((m) => ({
        month: m,
        leads: monthlyLeads.get(m) ?? 0,
      }));
    }

    // 4. Build response rows
    const rows: SourceRow[] = [];

    for (const [key, bucket] of buckets.entries()) {
      const leadsCount = bucket.leads.length;
      const contactedCount = bucket.leads.filter(isContacted).length;
      const contractsCount = bucket.contracts.length;
      const closedCount = bucket.closed.length;

      const contactRate = leadsCount > 0 ? Math.round((contactedCount / leadsCount) * 1000) / 10 : null;
      const contractRate = leadsCount > 0 ? Math.round((contractsCount / leadsCount) * 1000) / 10 : null;
      const closeRate = contractsCount > 0 ? Math.round((closedCount / contractsCount) * 1000) / 10 : null;

      const avgDays =
        bucket.daysToContract.length > 0
          ? Math.round((bucket.daysToContract.reduce((s, d) => s + d, 0) / bucket.daysToContract.length) * 10) / 10
          : null;

      rows.push({
        source_key: key,
        source_label: sourceLabel(key),
        leads_count: leadsCount,
        contacted_count: contactedCount,
        contracts_count: contractsCount,
        closed_count: closedCount,
        revenue: bucket.revenue,
        contact_rate: contactRate,
        contract_rate: contractRate,
        close_rate: closeRate,
        avg_days_to_contract: avgDays,
        monthly_trend: buildMonthlyTrend(bucket.monthlyLeads),
      });
    }

    // Sort by leads_count desc, then revenue desc
    rows.sort((a, b) => {
      if (b.leads_count !== a.leads_count) return b.leads_count - a.leads_count;
      return b.revenue - a.revenue;
    });

    return NextResponse.json({
      period,
      period_start: periodStart,
      generated_at: new Date().toISOString(),
      sources: rows,
    });
  } catch (err) {
    console.error("[Analytics/SourcePerformance] Error:", err);
    return NextResponse.json({ error: "Failed to compute source performance" }, { status: 500 });
  }
}
