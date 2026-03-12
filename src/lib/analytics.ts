import { supabase } from "@/lib/supabase";
import { normalizeSource, sourceLabel as canonicalSourceLabel } from "@/lib/source-normalization";

export type TimePeriod = "today" | "week" | "month" | "all";
export type MarketKey = "spokane" | "kootenai" | "other";
export type PipelineStage = "prospect" | "lead" | "negotiation" | "disposition" | "nurture" | "closed" | "dead";

const MARKET_ORDER: MarketKey[] = ["spokane", "kootenai", "other"];
const PIPELINE_STAGE_ORDER: PipelineStage[] = ["prospect", "lead", "negotiation", "disposition", "nurture", "closed", "dead"];
const SPEED_TO_LEAD_SLA_MS = 15 * 60 * 1000;

interface RawLead {
  id: string;
  property_id: string | null;
  status: string | null;
  source: string | null;
  promoted_at: string | null;
  created_at: string | null;
  last_contact_at: string | null;
  next_call_scheduled_at: string | null;
  total_calls: number | null;
}

interface RawProperty {
  id: string;
  county: string | null;
}

interface RawCallAttempt {
  lead_id: string | null;
  started_at: string | null;
}

interface RawDeal {
  id: string;
  lead_id: string | null;
  status: string | null;
  assignment_fee: number | null;
  closed_at: string | null;
}

interface EnrichedLead {
  id: string;
  market: MarketKey;
  sourceKey: string;
  sourceLabel: string;
  stage: PipelineStage;
  intakeMs: number | null;
  firstAttemptMs: number | null;
  firstAttemptEstimated: boolean;
  nextFollowUpMs: number | null;
  totalCalls: number;
}

interface ClosedDealFact {
  id: string;
  leadId: string;
  market: MarketKey;
  sourceKey: string;
  assignmentFee: number;
}

export interface MarketScoreRow {
  market: MarketKey;
  label: string;
  totalLeads: number;
  activePipeline: number;
  newLeads: number;
  contactedRatePct: number | null;
  overdueFollowUps: number;
  awaitingFirstContact: number;
  closedDeals: number;
  assignmentRevenue: number;
  medianSpeedToLeadMinutes: number | null;
}

export interface SourceOutcomeRow {
  sourceKey: string;
  sourceLabel: string;
  leads: number;
  spokaneLeads: number;
  kootenaiLeads: number;
  contactedRatePct: number | null;
  closedDeals: number;
  assignmentRevenue: number;
  medianSpeedToLeadMinutes: number | null;
}

export interface PipelineHealthRow {
  market: MarketKey;
  label: string;
  active: number;
  prospect: number;
  lead: number;
  negotiation: number;
  disposition: number;
  nurture: number;
  closed: number;
  dead: number;
}

export interface SpeedToLeadMarketRow {
  market: MarketKey;
  label: string;
  sampleCount: number;
  medianMinutes: number | null;
  within15mRatePct: number | null;
  slowOrMissingCount: number;
}

export interface SpeedToLeadSummary {
  sampleCount: number;
  estimatedSampleCount: number;
  medianMinutes: number | null;
  within15mRatePct: number | null;
  slowOrMissingCount: number;
  coveragePct: number;
  byMarket: SpeedToLeadMarketRow[];
}

export interface RevenueByMarketRow {
  market: MarketKey;
  label: string;
  closedDeals: number;
  assignmentRevenue: number;
}

export interface RevenueSummary {
  closedDeals: number;
  assignmentRevenue: number;
  avgAssignmentFee: number | null;
  undatedClosedDealsExcluded: number;
  byMarket: RevenueByMarketRow[];
}

export interface DominionAnalyticsData {
  generatedAt: string;
  periodStart: string | null;
  marketScoreboard: MarketScoreRow[];
  sourceOutcomes: SourceOutcomeRow[];
  pipelineHealth: PipelineHealthRow[];
  speedToLead: SpeedToLeadSummary;
  revenue: RevenueSummary;
}

export interface ConversionSnapshotSummary {
  snapshotCount: number;
  funnelCounts: Record<string, number>;
  avgDaysByStage: Record<string, number>;
}

export function getPeriodStart(period: TimePeriod): string | null {
  const now = new Date();
  switch (period) {
    case "today": {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    }
    case "week": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    }
    case "month": {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    }
    case "all":
      return null;
  }
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function formatPercent(value: number | null): string {
  if (value == null) return "n/a";
  return `${value.toFixed(1)}%`;
}

export function formatMinutes(value: number | null): string {
  if (value == null) return "n/a";
  return `${value}m`;
}

function toMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function marketFromCounty(county: string | null | undefined): MarketKey {
  const c = (county ?? "").toLowerCase();
  if (c.includes("spokane")) return "spokane";
  if (c.includes("kootenai")) return "kootenai";
  return "other";
}

function marketLabel(market: MarketKey): string {
  if (market === "spokane") return "Spokane";
  if (market === "kootenai") return "Kootenai";
  return "Unknown/Other County";
}

// Use canonical normalization from source-normalization.ts
function sourceKey(source: string | null | undefined): string {
  return normalizeSource(source);
}

function sourceLabel(source: string | null | undefined): string {
  const key = normalizeSource(source);
  if (key === "unknown") return "Uncategorized / Unknown";
  return canonicalSourceLabel(key);
}

function normalizeStage(status: string | null | undefined): PipelineStage {
  const s = (status ?? "").toLowerCase();
  // Legacy compatibility only: assignment segment aliases are not canonical workflow stages.
  if (s === "my_lead" || s === "my_leads" || s === "my_lead_status") return "lead";
  if (PIPELINE_STAGE_ORDER.includes(s as PipelineStage)) return s as PipelineStage;
  return "lead";
}

function isClosedDeal(deal: RawDeal): boolean {
  const status = (deal.status ?? "").toLowerCase();
  return status === "closed" || Boolean(deal.closed_at);
}

function shouldIncludeClosedDealForPeriod(deal: RawDeal, periodStartMs: number | null): boolean {
  if (!isClosedDeal(deal)) return false;
  if (periodStartMs == null) return true;
  const closedMs = toMs(deal.closed_at);
  return closedMs != null && closedMs >= periodStartMs;
}

function emptyPipelineRow(market: MarketKey): PipelineHealthRow {
  return {
    market,
    label: marketLabel(market),
    active: 0,
    prospect: 0,
    lead: 0,
    negotiation: 0,
    disposition: 0,
    nurture: 0,
    closed: 0,
    dead: 0,
  };
}

function emptyMarketScoreRow(market: MarketKey): MarketScoreRow {
  return {
    market,
    label: marketLabel(market),
    totalLeads: 0,
    activePipeline: 0,
    newLeads: 0,
    contactedRatePct: null,
    overdueFollowUps: 0,
    awaitingFirstContact: 0,
    closedDeals: 0,
    assignmentRevenue: 0,
    medianSpeedToLeadMinutes: null,
  };
}

function emptyAnalytics(periodStart: string | null): DominionAnalyticsData {
  return {
    generatedAt: new Date().toISOString(),
    periodStart,
    marketScoreboard: [emptyMarketScoreRow("spokane"), emptyMarketScoreRow("kootenai")],
    sourceOutcomes: [],
    pipelineHealth: [emptyPipelineRow("spokane"), emptyPipelineRow("kootenai")],
    speedToLead: {
      sampleCount: 0,
      estimatedSampleCount: 0,
      medianMinutes: null,
      within15mRatePct: null,
      slowOrMissingCount: 0,
      coveragePct: 0,
      byMarket: [
        { market: "spokane", label: "Spokane", sampleCount: 0, medianMinutes: null, within15mRatePct: null, slowOrMissingCount: 0 },
        { market: "kootenai", label: "Kootenai", sampleCount: 0, medianMinutes: null, within15mRatePct: null, slowOrMissingCount: 0 },
      ],
    },
    revenue: {
      closedDeals: 0,
      assignmentRevenue: 0,
      avgAssignmentFee: null,
      undatedClosedDealsExcluded: 0,
      byMarket: [
        { market: "spokane", label: "Spokane", closedDeals: 0, assignmentRevenue: 0 },
        { market: "kootenai", label: "Kootenai", closedDeals: 0, assignmentRevenue: 0 },
      ],
    },
  };
}

function buildSpeedSummary(leads: EnrichedLead[], nowMs: number): SpeedToLeadSummary {
  const samplesMs: number[] = [];
  let estimatedSampleCount = 0;
  let slowOrMissingCount = 0;
  let intakeCount = 0;

  const perMarket = new Map<MarketKey, { samples: number[]; withinSla: number; slowMissing: number }>();
  for (const market of MARKET_ORDER) {
    perMarket.set(market, { samples: [], withinSla: 0, slowMissing: 0 });
  }

  for (const lead of leads) {
    if (lead.intakeMs == null) continue;
    intakeCount++;

    const marketBucket = perMarket.get(lead.market) ?? { samples: [], withinSla: 0, slowMissing: 0 };

    if (lead.firstAttemptMs != null && lead.firstAttemptMs >= lead.intakeMs) {
      const delta = lead.firstAttemptMs - lead.intakeMs;
      samplesMs.push(delta);
      marketBucket.samples.push(delta);
      if (delta <= SPEED_TO_LEAD_SLA_MS) {
        marketBucket.withinSla += 1;
      }
      if (lead.firstAttemptEstimated) estimatedSampleCount++;
    } else if (nowMs - lead.intakeMs > SPEED_TO_LEAD_SLA_MS) {
      slowOrMissingCount++;
      marketBucket.slowMissing += 1;
    }

    perMarket.set(lead.market, marketBucket);
  }

  const sampleCount = samplesMs.length;
  const withinSla = samplesMs.filter((ms) => ms <= SPEED_TO_LEAD_SLA_MS).length;
  const medianMs = median(samplesMs);

  const byMarketMarkets: MarketKey[] = ["spokane", "kootenai"];
  const byMarket: SpeedToLeadMarketRow[] = byMarketMarkets.map((market) => {
    const bucket = perMarket.get(market) ?? { samples: [], withinSla: 0, slowMissing: 0 };
    const marketMedian = median(bucket.samples);
    return {
      market,
      label: marketLabel(market),
      sampleCount: bucket.samples.length,
      medianMinutes: marketMedian == null ? null : Math.round(marketMedian / 60000),
      within15mRatePct: bucket.samples.length > 0 ? round1((bucket.withinSla / bucket.samples.length) * 100) : null,
      slowOrMissingCount: bucket.slowMissing,
    };
  });

  return {
    sampleCount,
    estimatedSampleCount,
    medianMinutes: medianMs == null ? null : Math.round(medianMs / 60000),
    within15mRatePct: sampleCount > 0 ? round1((withinSla / sampleCount) * 100) : null,
    slowOrMissingCount,
    coveragePct: intakeCount > 0 ? round1((sampleCount / intakeCount) * 100) : 0,
    byMarket,
  };
}

export async function fetchDominionAnalytics(periodStart: string | null, userId?: string): Promise<DominionAnalyticsData> {
  const periodStartMs = toMs(periodStart);
  const nowMs = Date.now();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let leadsQuery = (supabase.from("leads") as any)
    .select("id, property_id, status, source, promoted_at, created_at, last_contact_at, next_call_scheduled_at, total_calls")
    .neq("status", "staging");

  if (userId) {
    leadsQuery = leadsQuery.eq("assigned_to", userId);
  }

  const { data: leadsRaw, error: leadsError } = await leadsQuery;
  if (leadsError) {
    throw leadsError;
  }

  const rawLeads: RawLead[] = (leadsRaw ?? []) as RawLead[];
  if (rawLeads.length === 0) {
    return emptyAnalytics(periodStart);
  }

  const leadIds = [...new Set(rawLeads.map((l) => l.id).filter(Boolean))];
  const propertyIds = [...new Set(rawLeads.map((l) => l.property_id).filter((id): id is string => Boolean(id)))];

  const propertyCountyById = new Map<string, string | null>();
  if (propertyIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: properties } = await (supabase.from("properties") as any)
      .select("id, county")
      .in("id", propertyIds);

    for (const prop of (properties ?? []) as RawProperty[]) {
      propertyCountyById.set(prop.id, prop.county ?? null);
    }
  }

  const firstAttemptByLeadId = new Map<string, string>();
  if (leadIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: calls } = await (supabase.from("calls_log") as any)
      .select("lead_id, started_at")
      .in("lead_id", leadIds)
      .order("started_at", { ascending: true });

    for (const row of (calls ?? []) as RawCallAttempt[]) {
      if (!row.lead_id || !row.started_at) continue;
      if (!firstAttemptByLeadId.has(row.lead_id)) {
        firstAttemptByLeadId.set(row.lead_id, row.started_at);
      }
    }
  }

  const dealsByLeadId = new Map<string, RawDeal[]>();
  if (leadIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: deals } = await (supabase.from("deals") as any)
      .select("id, lead_id, status, assignment_fee, closed_at")
      .in("lead_id", leadIds);

    for (const deal of (deals ?? []) as RawDeal[]) {
      if (!deal.lead_id) continue;
      const existing = dealsByLeadId.get(deal.lead_id) ?? [];
      existing.push(deal);
      dealsByLeadId.set(deal.lead_id, existing);
    }
  }

  const enrichedLeads: EnrichedLead[] = rawLeads.map((lead) => {
    const county = lead.property_id ? propertyCountyById.get(lead.property_id) ?? null : null;
    const callAttemptIso = firstAttemptByLeadId.get(lead.id) ?? null;
    const fallbackAttemptIso = lead.last_contact_at ?? null;
    const intakeMs = toMs(lead.promoted_at ?? lead.created_at);

    return {
      id: lead.id,
      market: marketFromCounty(county),
      sourceKey: sourceKey(lead.source),
      sourceLabel: sourceLabel(lead.source),
      stage: normalizeStage(lead.status),
      intakeMs,
      firstAttemptMs: toMs(callAttemptIso ?? fallbackAttemptIso),
      firstAttemptEstimated: !callAttemptIso && Boolean(fallbackAttemptIso),
      nextFollowUpMs: toMs(lead.next_call_scheduled_at),
      totalCalls: Number(lead.total_calls ?? 0),
    };
  });

  const leadById = new Map(enrichedLeads.map((lead) => [lead.id, lead]));
  const periodLeads = periodStartMs == null
    ? enrichedLeads
    : enrichedLeads.filter((lead) => lead.intakeMs != null && lead.intakeMs >= periodStartMs);

  const closedDealFacts: ClosedDealFact[] = [];
  let undatedClosedDealsExcluded = 0;

  for (const [leadId, deals] of dealsByLeadId.entries()) {
    const lead = leadById.get(leadId);
    if (!lead) continue;

    for (const deal of deals) {
      if (!isClosedDeal(deal)) continue;
      if (periodStartMs != null && !deal.closed_at) {
        undatedClosedDealsExcluded++;
      }
      if (!shouldIncludeClosedDealForPeriod(deal, periodStartMs)) continue;

      closedDealFacts.push({
        id: deal.id,
        leadId,
        market: lead.market,
        sourceKey: lead.sourceKey,
        assignmentFee: Number(deal.assignment_fee ?? 0),
      });
    }
  }

  const speedToLead = buildSpeedSummary(periodLeads, nowMs);

  const marketScoreboard: MarketScoreRow[] = [];
  for (const market of MARKET_ORDER) {
    const marketAll = enrichedLeads.filter((lead) => lead.market === market);
    const marketPeriod = periodLeads.filter((lead) => lead.market === market);
    const marketDeals = closedDealFacts.filter((deal) => deal.market === market);

    if (
      market === "other" &&
      marketAll.length === 0 &&
      marketDeals.length === 0
    ) {
      continue;
    }

    const contacted = marketPeriod.filter((lead) => lead.firstAttemptMs != null).length;
    const overdue = marketAll.filter((lead) => lead.nextFollowUpMs != null && lead.nextFollowUpMs < nowMs).length;
    const awaitingFirstContact = marketAll.filter((lead) => lead.firstAttemptMs == null && lead.totalCalls === 0).length;
    const activePipeline = marketAll.filter((lead) => !["closed", "dead"].includes(lead.stage)).length;
    const speedMarket = speedToLead.byMarket.find((row) => row.market === market);

    marketScoreboard.push({
      market,
      label: marketLabel(market),
      totalLeads: marketAll.length,
      activePipeline,
      newLeads: marketPeriod.length,
      contactedRatePct: marketPeriod.length > 0 ? round1((contacted / marketPeriod.length) * 100) : null,
      overdueFollowUps: overdue,
      awaitingFirstContact,
      closedDeals: marketDeals.length,
      assignmentRevenue: marketDeals.reduce((sum, deal) => sum + deal.assignmentFee, 0),
      medianSpeedToLeadMinutes: speedMarket?.medianMinutes ?? null,
    });
  }

  const pipelineHealthByMarket = new Map<MarketKey, PipelineHealthRow>();
  for (const market of MARKET_ORDER) {
    pipelineHealthByMarket.set(market, emptyPipelineRow(market));
  }
  for (const lead of enrichedLeads) {
    const row = pipelineHealthByMarket.get(lead.market) ?? emptyPipelineRow(lead.market);
    row[lead.stage] += 1;
    row.active = row.prospect + row.lead + row.negotiation + row.disposition + row.nurture;
    pipelineHealthByMarket.set(lead.market, row);
  }
  const pipelineHealth = Array.from(pipelineHealthByMarket.values()).filter((row) => {
    if (row.market !== "other") return true;
    const total = row.active + row.closed + row.dead;
    return total > 0;
  });

  const sourceRows = new Map<
    string,
    {
      sourceLabel: string;
      leads: number;
      spokaneLeads: number;
      kootenaiLeads: number;
      contacted: number;
      speedSamplesMs: number[];
      closedDeals: number;
      assignmentRevenue: number;
    }
  >();

  for (const lead of periodLeads) {
    const existing = sourceRows.get(lead.sourceKey) ?? {
      sourceLabel: lead.sourceLabel,
      leads: 0,
      spokaneLeads: 0,
      kootenaiLeads: 0,
      contacted: 0,
      speedSamplesMs: [],
      closedDeals: 0,
      assignmentRevenue: 0,
    };

    existing.leads += 1;
    if (lead.market === "spokane") existing.spokaneLeads += 1;
    if (lead.market === "kootenai") existing.kootenaiLeads += 1;

    if (lead.firstAttemptMs != null) {
      existing.contacted += 1;
    }
    if (lead.intakeMs != null && lead.firstAttemptMs != null && lead.firstAttemptMs >= lead.intakeMs) {
      existing.speedSamplesMs.push(lead.firstAttemptMs - lead.intakeMs);
    }

    sourceRows.set(lead.sourceKey, existing);
  }

  for (const deal of closedDealFacts) {
    const existing = sourceRows.get(deal.sourceKey) ?? {
      sourceLabel: sourceLabel(deal.sourceKey),
      leads: 0,
      spokaneLeads: 0,
      kootenaiLeads: 0,
      contacted: 0,
      speedSamplesMs: [],
      closedDeals: 0,
      assignmentRevenue: 0,
    };

    existing.closedDeals += 1;
    existing.assignmentRevenue += deal.assignmentFee;
    sourceRows.set(deal.sourceKey, existing);
  }

  const sourceOutcomes: SourceOutcomeRow[] = Array.from(sourceRows.entries())
    .map(([key, row]) => {
      const medianMs = median(row.speedSamplesMs);
      return {
        sourceKey: key,
        sourceLabel: row.sourceLabel,
        leads: row.leads,
        spokaneLeads: row.spokaneLeads,
        kootenaiLeads: row.kootenaiLeads,
        contactedRatePct: row.leads > 0 ? round1((row.contacted / row.leads) * 100) : null,
        closedDeals: row.closedDeals,
        assignmentRevenue: row.assignmentRevenue,
        medianSpeedToLeadMinutes: medianMs == null ? null : Math.round(medianMs / 60000),
      };
    })
    .sort((a, b) => {
      if (b.leads !== a.leads) return b.leads - a.leads;
      return b.assignmentRevenue - a.assignmentRevenue;
    });

  const revenueByMarketMap = new Map<MarketKey, RevenueByMarketRow>();
  for (const market of MARKET_ORDER) {
    revenueByMarketMap.set(market, {
      market,
      label: marketLabel(market),
      closedDeals: 0,
      assignmentRevenue: 0,
    });
  }
  for (const deal of closedDealFacts) {
    const existing = revenueByMarketMap.get(deal.market) ?? {
      market: deal.market,
      label: marketLabel(deal.market),
      closedDeals: 0,
      assignmentRevenue: 0,
    };
    existing.closedDeals += 1;
    existing.assignmentRevenue += deal.assignmentFee;
    revenueByMarketMap.set(deal.market, existing);
  }

  const revenueRows = Array.from(revenueByMarketMap.values()).filter((row) => {
    if (row.market !== "other") return true;
    return row.closedDeals > 0 || row.assignmentRevenue > 0;
  });

  const totalRevenue = closedDealFacts.reduce((sum, deal) => sum + deal.assignmentFee, 0);
  const closedDeals = closedDealFacts.length;

  return {
    generatedAt: new Date().toISOString(),
    periodStart,
    marketScoreboard,
    sourceOutcomes,
    pipelineHealth,
    speedToLead,
    revenue: {
      closedDeals,
      assignmentRevenue: totalRevenue,
      avgAssignmentFee: closedDeals > 0 ? totalRevenue / closedDeals : null,
      undatedClosedDealsExcluded: periodStartMs == null ? 0 : undatedClosedDealsExcluded,
      byMarket: revenueRows,
    },
  };
}
