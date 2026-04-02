/**
 * Shared analytics helpers
 *
 * Functions used by multiple analytics routes to ensure consistent
 * metric computation across kpi-summary and source-performance.
 */

/**
 * Determines if a deal status represents a contract.
 * Used by both kpi-summary and source-performance routes
 * to ensure consistent contract counting.
 *
 * Canonical statuses: under_contract, contract, contracted, closed, assigned.
 * Note: "negotiating" is NOT a contract status — it precedes contract signing.
 */
export function isContractStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.toLowerCase().trim();
  return (
    s === "under_contract" ||
    s === "contract" ||
    s === "contracted" ||
    s === "closed" ||
    s === "assigned"
  );
}

/**
 * Determines if a deal is closed (has a closed_at timestamp or status is "closed").
 */
export function isClosedDeal(deal: { status?: string | null; closed_at?: string | null }): boolean {
  const s = (deal.status ?? "").toLowerCase();
  return s === "closed" || Boolean(deal.closed_at);
}

/**
 * Parse founder IDs from env-like comma-separated input.
 */
export function parseFounderUserIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const piece of raw.split(",")) {
    const id = piece.trim();
    if (!id) continue;
    seen.add(id);
  }
  return Array.from(seen);
}

export interface FounderEffortCallRow {
  duration_sec?: number | null;
  durationSec?: number | null;
}

export interface FounderEffortSummary {
  callCount: number;
  talkMinutes: number;
  wrapMinutes: number;
  founderHours: number;
}

export interface JeffInfluenceDealRow {
  lead_id?: string | null;
  leadId?: string | null;
  assignment_fee?: number | null;
  assignmentFee?: number | null;
  closed_at?: string | null;
  closedAt?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
}

export interface JeffInfluenceInteractionRow {
  lead_id?: string | null;
  leadId?: string | null;
  interaction_type?: string | null;
  interactionType?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
}

export interface JeffAttributionEventRow {
  lead_id?: string | null;
  leadId?: string | null;
  event_at?: string | null;
  eventAt?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
  offered_at?: string | null;
  offeredAt?: string | null;
  started_at?: string | null;
  startedAt?: string | null;
}

export interface JeffInfluenceSummary {
  influencedClosedDeals: number;
  influencedRevenue: number;
  influenceRatePct: number | null;
}

export interface JeffAttributionFunnelSummary extends JeffInfluenceSummary {
  influencedAppointmentLeads: number;
  influencedOfferLeads: number;
  influencedContractLeads: number;
}

function safeMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Estimate founder effort from call rows using talk time + fixed wrap time per call.
 * This is intentionally conservative and marked as estimated in UI copy.
 */
export function computeFounderEffortFromCalls(
  rows: FounderEffortCallRow[],
  wrapMinutesPerCall = 2,
): FounderEffortSummary {
  const callCount = rows.length;
  const talkMinutes = rows.reduce((sum, row) => {
    const durationSec = Number(row.duration_sec ?? row.durationSec ?? 0);
    if (!Number.isFinite(durationSec) || durationSec <= 0) return sum;
    return sum + (durationSec / 60);
  }, 0);
  const wrapMinutes = Math.max(0, wrapMinutesPerCall) * callCount;
  const founderHoursRaw = (talkMinutes + wrapMinutes) / 60;
  const founderHours = Math.round(founderHoursRaw * 10) / 10;

  return {
    callCount,
    talkMinutes: Math.round(talkMinutes * 10) / 10,
    wrapMinutes: Math.round(wrapMinutes * 10) / 10,
    founderHours,
  };
}

/**
 * Compute how many closed deals/revenue were preceded by meaningful Jeff interactions.
 * Influence is counted when the lead has a non-fyi Jeff interaction before deal outcome
 * within the configured lookback window.
 */
export function computeJeffInfluenceSummary(
  deals: JeffInfluenceDealRow[],
  interactions: JeffInfluenceInteractionRow[],
  lookbackDays = 120,
): JeffInfluenceSummary {
  const summary = computeJeffAttributionFunnel({
    deals,
    interactions,
    lookbackDays,
  });

  return {
    influencedClosedDeals: summary.influencedClosedDeals,
    influencedRevenue: summary.influencedRevenue,
    influenceRatePct: summary.influenceRatePct,
  };
}

function readEventMs(row: JeffAttributionEventRow): number | null {
  return safeMs(
    row.event_at
    ?? row.eventAt
    ?? row.offered_at
    ?? row.offeredAt
    ?? row.started_at
    ?? row.startedAt
    ?? row.created_at
    ?? row.createdAt
    ?? null,
  );
}

function hasJeffInteractionWithinLookback(
  leadId: string,
  eventMs: number,
  interactionsByLead: Map<string, number[]>,
  lookbackMs: number,
): boolean {
  const interactionTimes = interactionsByLead.get(leadId) ?? [];
  if (interactionTimes.length === 0) return false;
  const lowerBoundMs = eventMs - lookbackMs;
  return interactionTimes.some((interactionMs) => interactionMs <= eventMs && interactionMs >= lowerBoundMs);
}

function countInfluencedStageLeads(
  events: JeffAttributionEventRow[],
  interactionsByLead: Map<string, number[]>,
  lookbackMs: number,
): number {
  const influencedLeadIds = new Set<string>();

  for (const row of events) {
    const leadId = (row.lead_id ?? row.leadId ?? "").trim();
    if (!leadId) continue;
    const eventMs = readEventMs(row);
    if (eventMs == null) continue;
    if (!hasJeffInteractionWithinLookback(leadId, eventMs, interactionsByLead, lookbackMs)) continue;
    influencedLeadIds.add(leadId);
  }

  return influencedLeadIds.size;
}

export function computeJeffAttributionFunnel(input: {
  deals: JeffInfluenceDealRow[];
  interactions: JeffInfluenceInteractionRow[];
  appointments?: JeffAttributionEventRow[];
  offers?: JeffAttributionEventRow[];
  contracts?: JeffAttributionEventRow[];
  lookbackDays?: number;
}): JeffAttributionFunnelSummary {
  const lookbackMs = Math.max(1, input.lookbackDays ?? 120) * 24 * 60 * 60 * 1000;
  const byLead = new Map<string, number[]>();

  for (const interaction of input.interactions) {
    const leadId = (interaction.lead_id ?? interaction.leadId ?? "").trim();
    if (!leadId) continue;
    const interactionType = (interaction.interaction_type ?? interaction.interactionType ?? "").toLowerCase().trim();
    if (!interactionType || interactionType === "fyi_only") continue;

    const createdAtMs = safeMs(interaction.created_at ?? interaction.createdAt ?? null);
    if (createdAtMs == null) continue;

    const current = byLead.get(leadId) ?? [];
    current.push(createdAtMs);
    byLead.set(leadId, current);
  }

  let influencedClosedDeals = 0;
  let influencedRevenue = 0;

  for (const deal of input.deals) {
    const leadId = (deal.lead_id ?? deal.leadId ?? "").trim();
    if (!leadId) continue;

    const dealOutcomeMs = safeMs(deal.closed_at ?? deal.closedAt ?? deal.created_at ?? deal.createdAt ?? null);
    if (dealOutcomeMs == null) continue;

    const influenced = hasJeffInteractionWithinLookback(leadId, dealOutcomeMs, byLead, lookbackMs);
    if (!influenced) continue;

    influencedClosedDeals += 1;
    influencedRevenue += Number(deal.assignment_fee ?? deal.assignmentFee ?? 0);
  }

  const influencedAppointmentLeads = countInfluencedStageLeads(
    input.appointments ?? [],
    byLead,
    lookbackMs,
  );
  const influencedOfferLeads = countInfluencedStageLeads(
    input.offers ?? [],
    byLead,
    lookbackMs,
  );
  const influencedContractLeads = countInfluencedStageLeads(
    input.contracts ?? [],
    byLead,
    lookbackMs,
  );

  return {
    influencedAppointmentLeads,
    influencedOfferLeads,
    influencedContractLeads,
    influencedClosedDeals,
    influencedRevenue,
    influenceRatePct: input.deals.length > 0 ? round1((influencedClosedDeals / input.deals.length) * 100) : null,
  };
}
