/**
 * GET /api/analytics/kpi-summary
 *
 * Centralized KPI computation endpoint returning all dashboard KPIs from one call.
 * Query params:
 *   ?period=today|week|month|all  (default: "all")
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { getPeriodStart, type TimePeriod } from "@/lib/analytics";
import { normalizeSource, sourceLabel as getSourceLabel } from "@/lib/source-normalization";
import { isContractStatus } from "@/lib/analytics-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: ReturnType<typeof createServerClient>, name: string) => sb.from(name) as any;

function toMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const periodParam = (req.nextUrl.searchParams.get("period") ?? "all") as TimePeriod;
  const validPeriods: TimePeriod[] = ["today", "week", "month", "all"];
  const period = validPeriods.includes(periodParam) ? periodParam : "all";
  const periodStart = getPeriodStart(period);

  const now = new Date();
  const nowIso = now.toISOString();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  try {
    // ── 1. Leads ──────────────────────────────────────────────────────
    // All leads (not staging) for pipeline counts
    const { data: allLeadsRaw, error: allLeadsErr } = await tbl(sb, "leads")
      .select("id, status, source, promoted_at, created_at, last_contact_at, total_calls")
      .neq("status", "staging");
    if (allLeadsErr) throw allLeadsErr;

    interface LeadRow {
      id: string;
      status: string | null;
      source: string | null;
      promoted_at: string | null;
      created_at: string | null;
      last_contact_at: string | null;
      total_calls: number | null;
    }
    const allLeads: LeadRow[] = (allLeadsRaw ?? []) as LeadRow[];

    // Period-filtered leads (new leads in period)
    let periodLeadsQuery = tbl(sb, "leads")
      .select("id, status, source, promoted_at, created_at, last_contact_at, total_calls")
      .neq("status", "staging");
    if (periodStart) {
      periodLeadsQuery = periodLeadsQuery.gte("created_at", periodStart);
    }
    const { data: periodLeadsRaw, error: periodLeadsErr } = await periodLeadsQuery;
    if (periodLeadsErr) throw periodLeadsErr;
    const periodLeads: LeadRow[] = (periodLeadsRaw ?? []) as LeadRow[];

    // ── 2. Active pipeline (current snapshot, not period-filtered) ───
    const activeStages = new Set(["prospect", "lead", "negotiation", "disposition"]);
    const nonDeadStages = new Set(["prospect", "lead", "negotiation", "disposition", "nurture"]);

    const activePipeline = allLeads.filter((l) => activeStages.has(l.status ?? "")).length;
    const qualifiedLeads = allLeads.filter((l) => !["staging", "dead"].includes(l.status ?? "")).length;

    // Pipeline by stage
    const stageCounts = new Map<string, number>();
    for (const l of allLeads) {
      const s = l.status ?? "lead";
      stageCounts.set(s, (stageCounts.get(s) ?? 0) + 1);
    }
    const pipeline_by_stage = Array.from(stageCounts.entries())
      .map(([stage, count]) => ({ stage, count }))
      .sort((a, b) => b.count - a.count);

    // ── 3. Deals ─────────────────────────────────────────────────────
    // Offers/contracts: filter on deal created_at (when was it originated?)
    interface DealRow {
      id: string;
      lead_id: string | null;
      status: string | null;
      assignment_fee: number | null;
      closed_at: string | null;
      created_at: string | null;
    }

    let dealsQuery = tbl(sb, "deals").select("id, lead_id, status, assignment_fee, closed_at, created_at");
    if (periodStart) {
      dealsQuery = dealsQuery.gte("created_at", periodStart);
    }
    const { data: dealsRaw, error: dealsErr } = await dealsQuery;
    if (dealsErr) throw dealsErr;
    const periodDeals: DealRow[] = (dealsRaw ?? []) as DealRow[];

    const offers_made = periodDeals.length;
    const contracts_signed = periodDeals.filter((d) => {
      return isContractStatus(d.status) || Boolean(d.closed_at);
    }).length;

    // Closed deals + revenue: filter on closed_at (when did it actually close?)
    // This is intentionally a separate query so revenue reflects the period it closed in.
    let closedQuery = tbl(sb, "deals").select("id, lead_id, status, assignment_fee, closed_at, created_at");
    if (periodStart) {
      closedQuery = closedQuery.gte("closed_at", periodStart);
    }
    // Only include deals that are actually closed
    closedQuery = closedQuery.not("closed_at", "is", null);
    const { data: closedRaw } = await closedQuery;
    const closedDeals: DealRow[] = (closedRaw ?? []) as DealRow[];
    const deals_closed = closedDeals.length;
    const total_revenue = closedDeals.reduce((sum, d) => sum + Number(d.assignment_fee ?? 0), 0);
    const avg_assignment_fee = deals_closed > 0 ? Math.round(total_revenue / deals_closed) : null;

    // ── 4. Contact rate ──────────────────────────────────────────────
    const contactedCount = periodLeads.filter(
      (l) => (l.last_contact_at != null && l.last_contact_at !== "") || (l.total_calls != null && l.total_calls > 0)
    ).length;
    const contact_rate = periodLeads.length > 0 ? round1((contactedCount / periodLeads.length) * 100) : null;

    // ── 5. Conversion rates ──────────────────────────────────────────
    // Use period-filtered leads as denominator so the rate is meaningful within the selected period
    const periodQualified = periodLeads.filter((l) => !["staging", "dead"].includes(l.status ?? "")).length;
    const contract_conversion_rate =
      periodQualified > 0 ? round1((contracts_signed / periodQualified) * 100) : null;
    const close_rate = contracts_signed > 0 ? round1((deals_closed / contracts_signed) * 100) : null;

    // ── 6. Speed to lead ─────────────────────────────────────────────
    const leadIds = periodLeads.map((l) => l.id).filter(Boolean);
    const firstAttemptByLead = new Map<string, string>();

    if (leadIds.length > 0) {
      // Batch in chunks of 500
      const chunks: string[][] = [];
      for (let i = 0; i < leadIds.length; i += 500) {
        chunks.push(leadIds.slice(i, i + 500));
      }
      for (const chunk of chunks) {
        const { data: calls } = await tbl(sb, "calls_log")
          .select("lead_id, started_at")
          .in("lead_id", chunk)
          .order("started_at", { ascending: true });

        for (const row of (calls ?? []) as { lead_id: string | null; started_at: string | null }[]) {
          if (!row.lead_id || !row.started_at) continue;
          if (!firstAttemptByLead.has(row.lead_id)) {
            firstAttemptByLead.set(row.lead_id, row.started_at);
          }
        }
      }
    }

    const speedSamplesMs: number[] = [];
    for (const lead of periodLeads) {
      const intakeMs = toMs(lead.promoted_at ?? lead.created_at);
      if (intakeMs == null) continue;

      const callAttemptIso = firstAttemptByLead.get(lead.id) ?? null;
      const fallbackIso = lead.last_contact_at ?? null;
      const attemptMs = toMs(callAttemptIso ?? fallbackIso);

      if (attemptMs != null && attemptMs >= intakeMs) {
        speedSamplesMs.push(attemptMs - intakeMs);
      }
    }
    const medianSpeedMs = median(speedSamplesMs);
    const median_speed_to_lead_minutes = medianSpeedMs != null ? Math.round(medianSpeedMs / 60000) : null;

    // ── 7. Avg days lead to contract ─────────────────────────────────
    const daysToContract: number[] = [];
    for (const deal of periodDeals) {
      if (!deal.lead_id || !deal.created_at) continue;
      const lead = periodLeads.find((l) => l.id === deal.lead_id);
      if (!lead) continue;
      const leadCreated = toMs(lead.promoted_at ?? lead.created_at);
      const dealCreated = toMs(deal.created_at);
      if (leadCreated != null && dealCreated != null && dealCreated >= leadCreated) {
        daysToContract.push((dealCreated - leadCreated) / (1000 * 60 * 60 * 24));
      }
    }
    const avg_days_lead_to_contract =
      daysToContract.length > 0
        ? round1(daysToContract.reduce((s, d) => s + d, 0) / daysToContract.length)
        : null;

    // ── 8. Tasks (follow-up discipline) ──────────────────────────────
    // Overdue tasks: due_at < start of today AND status = pending
    const { data: overdueData } = await tbl(sb, "tasks")
      .select("id")
      .eq("status", "pending")
      .lt("due_at", startOfToday.toISOString())
      .is("completed_at", null);
    const overdue_tasks = (overdueData ?? []).length;

    // Tasks due today: due_at between start and end of today AND pending
    const { data: todayData } = await tbl(sb, "tasks")
      .select("id")
      .eq("status", "pending")
      .gte("due_at", startOfToday.toISOString())
      .lte("due_at", endOfToday.toISOString())
      .is("completed_at", null);
    const tasks_due_today = (todayData ?? []).length;

    // Completed tasks in period
    let completedQuery = tbl(sb, "tasks").select("id").eq("status", "completed");
    if (periodStart) {
      completedQuery = completedQuery.gte("completed_at", periodStart);
    }
    const { data: completedData } = await completedQuery;
    const tasks_completed_this_period = (completedData ?? []).length;

    // ── 9. Source summary (uses canonical normalization) ─────────────
    const sourceMap = new Map<string, number>();
    for (const lead of periodLeads) {
      const src = normalizeSource(lead.source);
      sourceMap.set(src, (sourceMap.get(src) ?? 0) + 1);
    }
    const sortedSources = Array.from(sourceMap.entries()).sort((a, b) => b[1] - a[1]);
    const top_source = sortedSources.length > 0
      ? { name: getSourceLabel(sortedSources[0][0]), key: sortedSources[0][0], leads: sortedSources[0][1] }
      : null;
    const source_count = sortedSources.length;

    // ── Build response ───────────────────────────────────────────────
    return NextResponse.json({
      period,
      generated_at: new Date().toISOString(),
      kpis: {
        // Volume
        new_leads: periodLeads.length,
        qualified_leads: qualifiedLeads,
        active_pipeline: activePipeline,

        // Conversion
        offers_made,
        contracts_signed,
        deals_closed,

        // Revenue
        total_revenue,
        avg_assignment_fee,

        // Rates
        contact_rate,
        contract_conversion_rate,
        close_rate,

        // Speed
        median_speed_to_lead_minutes,
        avg_days_lead_to_contract,

        // Follow-up discipline
        overdue_tasks,
        tasks_due_today,
        tasks_completed_this_period,

        // Pipeline
        pipeline_by_stage,

        // Source summary
        top_source,
        source_count,
      },
    });
  } catch (err) {
    console.error("[Analytics/KpiSummary] Error:", err);
    return NextResponse.json({ error: "Failed to compute KPI summary" }, { status: 500 });
  }
}
