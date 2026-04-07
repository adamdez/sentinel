/**
 * Lead view model types and team configuration.
 * All lead data is fetched live from Supabase.
 */

import type { AIScore, LeadStatus, SellerTimeline, QualificationRoute } from "./types";

export type OfferVisibilityStatus =
  | "none"
  | "preparing_offer"
  | "offer_made"
  | "seller_reviewing"
  | "declined";

export type OfferPrepConfidence = "low" | "medium" | "high";
export type OfferPrepHealth = "not_applicable" | "missing" | "stale" | "ready";

export interface OfferPrepSnapshot {
  arvUsed: number | null;
  rehabEstimate: number | null;
  maoLow: number | null;
  maoHigh: number | null;
  confidence: OfferPrepConfidence | null;
  sheetUrl: string | null;
  updatedAt: string | null;
  /** Enhanced fields from valuation kernel v1.0+ (additive, nullable for backward compat) */
  formulaVersion: string | null;
  formulaMode: string | null;
  arvLow: number | null;
  arvBase: number | null;
  arvHigh: number | null;
  arvSource: "comps" | "avm" | "manual" | null;
  conditionLevel: number | null;
  conditionAdjPct: number | null;
  avgPpsf: number | null;
  compCount: number | null;
  spreadPct: number | null;
  offerPercentage: number | null;
  assignmentFeeTarget: number | null;
  holdingCosts: number | null;
  closingCosts: number | null;
  maoResult: number | null;
  warnings: Array<{ code: string; severity: string; message: string }> | null;
  calculatedBy: string | null;
}

export type OfferStatusTruth =
  | "offer_discussed"
  | "offer_sent"
  | "seller_reviewing"
  | "counter_needs_revision"
  | "accepted"
  | "passed_not_moving_forward";

export interface OfferStatusSnapshot {
  status: OfferStatusTruth | null;
  amount: number | null;
  amountLow: number | null;
  amountHigh: number | null;
  sellerResponseNote: string | null;
  updatedAt: string | null;
}

export interface OfferPrepHealthInfo {
  state: OfferPrepHealth;
  label: string;
  hint: string;
}

export type BuyerFitVisibility = "broad" | "narrow" | "unknown";
export type DispoReadinessVisibility = "not_ready" | "needs_review" | "ready";

export interface BuyerDispoVisibility {
  buyerFit: BuyerFitVisibility;
  dispoReadiness: DispoReadinessVisibility;
  hint: string;
  nextStep: string;
}

export interface BuyerDispoTruthSnapshot {
  buyerFit: BuyerFitVisibility | null;
  dispoStatus: DispoReadinessVisibility | null;
  nextStep: string | null;
  dispoNote: string | null;
  updatedAt: string | null;
}

export type NextActionKind =
  | "callback_scheduled"
  | "follow_up_due"
  | "nurture_check_in"
  | "offer_prep_follow_up"
  | "escalation_review"
  | "none";

export interface NextActionVisibility {
  kind: NextActionKind;
  label: string;
  dueAt: string | null;
  isOverdue: boolean;
}

export interface LeadAttribution {
  campaignName: string | null;
  adGroupName: string | null;
  keywordText: string | null;
  market: "spokane" | "kootenai" | "other" | null;
  gclid: string | null;
}

function toObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseFloat(value.replace(/[$,%\s,]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toOfferPrepConfidence(value: unknown): OfferPrepConfidence | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high") {
    return normalized as OfferPrepConfidence;
  }
  return null;
}

function toOfferStatusTruth(value: unknown): OfferStatusTruth | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "offer_discussed"
    || normalized === "offer_sent"
    || normalized === "seller_reviewing"
    || normalized === "counter_needs_revision"
    || normalized === "accepted"
    || normalized === "passed_not_moving_forward"
  ) {
    return normalized as OfferStatusTruth;
  }
  return null;
}

export function extractOfferPrepSnapshot(
  ownerFlags: Record<string, unknown> | null | undefined,
): OfferPrepSnapshot {
  const flags = toObject(ownerFlags);
  const nested = toObject(flags?.offer_prep_snapshot);

  const arvUsed = toNullableNumber(nested?.arv_used ?? flags?.offer_prep_arv_used);
  const rehabEstimate = toNullableNumber(nested?.rehab_estimate ?? flags?.offer_prep_rehab_estimate);
  const maoLow = toNullableNumber(nested?.mao_low ?? flags?.offer_prep_mao_low);
  const maoHigh = toNullableNumber(nested?.mao_high ?? flags?.offer_prep_mao_high);
  const confidence = toOfferPrepConfidence(nested?.confidence ?? flags?.offer_prep_confidence);
  const sheetUrl = toNullableString(nested?.sheet_url ?? flags?.offer_prep_sheet_url);
  const updatedAt = toNullableString(nested?.updated_at ?? flags?.offer_prep_updated_at);

  return {
    arvUsed,
    rehabEstimate,
    maoLow,
    maoHigh,
    confidence,
    sheetUrl,
    updatedAt,
    // Enhanced kernel fields (v1.0+) — nullable for backward compat
    formulaVersion: toNullableString(nested?.formula_version) ?? null,
    formulaMode: toNullableString(nested?.formula_mode) ?? null,
    arvLow: toNullableNumber(nested?.arv_low) ?? null,
    arvBase: toNullableNumber(nested?.arv_base) ?? null,
    arvHigh: toNullableNumber(nested?.arv_high) ?? null,
    arvSource: (() => {
      const v = toNullableString(nested?.arv_source);
      return v === "comps" || v === "avm" || v === "manual" ? v : null;
    })(),
    conditionLevel: toNullableNumber(nested?.condition_level) ?? null,
    conditionAdjPct: toNullableNumber(nested?.condition_adj_pct) ?? null,
    avgPpsf: toNullableNumber(nested?.avg_ppsf) ?? null,
    compCount: toNullableNumber(nested?.comp_count) ?? null,
    spreadPct: toNullableNumber(nested?.spread_pct) ?? null,
    offerPercentage: toNullableNumber(nested?.offer_percentage) ?? null,
    assignmentFeeTarget: toNullableNumber(nested?.assignment_fee_target) ?? null,
    holdingCosts: toNullableNumber(nested?.holding_costs) ?? null,
    closingCosts: toNullableNumber(nested?.closing_costs) ?? null,
    maoResult: toNullableNumber(nested?.mao_result) ?? null,
    warnings: Array.isArray(nested?.warnings) ? nested.warnings as Array<{ code: string; severity: string; message: string }> : null,
    calculatedBy: toNullableString(nested?.calculated_by) ?? null,
  };
}

export function extractOfferStatusSnapshot(
  ownerFlags: Record<string, unknown> | null | undefined,
): OfferStatusSnapshot {
  const flags = toObject(ownerFlags);
  const nested = toObject(flags?.offer_status_snapshot);

  return {
    status: toOfferStatusTruth(nested?.status ?? flags?.offer_status),
    amount: toNullableNumber(nested?.amount ?? flags?.offer_status_amount),
    amountLow: toNullableNumber(nested?.amount_low ?? flags?.offer_status_amount_low),
    amountHigh: toNullableNumber(nested?.amount_high ?? flags?.offer_status_amount_high),
    sellerResponseNote: toNullableString(nested?.seller_response_note ?? flags?.offer_status_seller_response_note),
    updatedAt: toNullableString(nested?.updated_at ?? flags?.offer_status_updated_at),
  };
}

export function offerStatusTruthLabel(value: OfferStatusTruth | null | undefined): string {
  switch (value) {
    case "offer_discussed":
      return "Offer Discussed";
    case "offer_sent":
      return "Offer Sent";
    case "seller_reviewing":
      return "Seller Reviewing";
    case "counter_needs_revision":
      return "Counter / Needs Revision";
    case "accepted":
      return "Accepted";
    case "passed_not_moving_forward":
      return "Passed / Not Moving Forward";
    default:
      return "Not set";
  }
}

export function extractBuyerDispoTruthSnapshot(
  ownerFlags: Record<string, unknown> | null | undefined,
): BuyerDispoTruthSnapshot {
  const flags = toObject(ownerFlags);
  const nested = toObject(flags?.buyer_dispo_snapshot);

  const buyerFit = (() => {
    const raw = typeof nested?.buyer_fit === "string" ? nested.buyer_fit : flags?.buyer_dispo_buyer_fit;
    if (raw === "broad" || raw === "narrow" || raw === "unknown") return raw;
    return null;
  })();

  const dispoStatus = (() => {
    const raw = typeof nested?.dispo_status === "string" ? nested.dispo_status : flags?.buyer_dispo_status;
    if (raw === "not_ready" || raw === "needs_review" || raw === "ready") return raw;
    return null;
  })();

  return {
    buyerFit,
    dispoStatus,
    nextStep: toNullableString(nested?.next_step ?? flags?.buyer_dispo_next_step),
    dispoNote: toNullableString(nested?.dispo_note ?? flags?.buyer_dispo_note),
    updatedAt: toNullableString(nested?.updated_at ?? flags?.buyer_dispo_updated_at),
  };
}

export function deriveOfferPrepHealth(input: {
  status: LeadStatus | string | null | undefined;
  qualificationRoute?: QualificationRoute | null;
  snapshot: OfferPrepSnapshot;
  nextCallScheduledAt?: string | null;
  nextFollowUpAt?: string | null;
  nowMs?: number;
}): OfferPrepHealthInfo {
  const status = (input.status ?? "").toLowerCase();
  const route = input.qualificationRoute ?? null;
  const activePath =
    route === "offer_ready"
    || status === "negotiation"
    || status === "disposition";

  if (!activePath) {
    return {
      state: "not_applicable",
      label: "Not in Offer Prep",
      hint: "Offer-prep snapshot is only expected for active offer-ready/negotiation paths.",
    };
  }

  const hasCoreFields =
    input.snapshot.arvUsed != null
    && input.snapshot.rehabEstimate != null
    && input.snapshot.maoLow != null
    && input.snapshot.maoHigh != null
    && input.snapshot.confidence != null
    && input.snapshot.updatedAt != null;

  if (!hasCoreFields) {
    return {
      state: "missing",
      label: "Missing",
      hint: "Add ARV, rehab, MAO range, and confidence to anchor offer prep.",
    };
  }

  const nowMs = input.nowMs ?? Date.now();
  const updatedMs = input.snapshot.updatedAt ? new Date(input.snapshot.updatedAt).getTime() : NaN;
  const dueIso = input.nextCallScheduledAt ?? input.nextFollowUpAt ?? null;
  const dueMs = dueIso ? new Date(dueIso).getTime() : NaN;

  const staleByAge = !Number.isNaN(updatedMs) && nowMs - updatedMs > 7 * 24 * 60 * 60 * 1000;
  const staleByDue = !Number.isNaN(dueMs) && dueMs < nowMs;

  if (staleByAge || staleByDue) {
    return {
      state: "stale",
      label: "Stale",
      hint: staleByDue
        ? "Offer-prep follow-up is overdue."
        : "Offer-prep snapshot is older than 7 days.",
    };
  }

  return {
    state: "ready",
    label: "Ready",
    hint: "Offer-prep snapshot is present and current.",
  };
}

export function deriveOfferVisibilityStatus(input: {
  status: LeadStatus | string | null | undefined;
  qualificationRoute?: QualificationRoute | null;
}): OfferVisibilityStatus {
  const status = (input.status ?? "").toLowerCase();
  const route = input.qualificationRoute ?? null;

  if (status === "disposition") return "seller_reviewing";
  if (status === "negotiation") return "offer_made";
  if (status === "dead" && route === "offer_ready") return "declined";
  if (route === "offer_ready") return "preparing_offer";
  return "none";
}

export function offerVisibilityLabel(status: OfferVisibilityStatus): string {
  switch (status) {
    case "preparing_offer":
      return "Offer Prep";
    case "offer_made":
      return "Offer Discussed";
    case "seller_reviewing":
      return "Seller Reviewing";
    case "declined":
      return "Offer Path Closed";
    default:
      return "Not yet qualified for offer";
  }
}

export function deriveBuyerDispoVisibility(input: {
  status: LeadStatus | string | null | undefined;
  qualificationRoute?: QualificationRoute | null;
  offerStatus?: OfferVisibilityStatus | null;
  conditionLevel?: number | null;
  priceExpectation?: number | null;
  estimatedValue?: number | null;
}): BuyerDispoVisibility {
  const status = (input.status ?? "").toLowerCase();
  const route = input.qualificationRoute ?? null;
  const offerStatus = input.offerStatus ?? deriveOfferVisibilityStatus({
    status,
    qualificationRoute: route,
  });

  const ask = typeof input.priceExpectation === "number" ? input.priceExpectation : null;
  const est = typeof input.estimatedValue === "number" && input.estimatedValue > 0 ? input.estimatedValue : null;
  const askRatio = ask != null && est != null ? ask / est : null;
  const conditionLevel = typeof input.conditionLevel === "number" ? input.conditionLevel : null;

  let dispoReadiness: DispoReadinessVisibility = "not_ready";
  if (status !== "dead" && status !== "closed") {
    if (status === "disposition" || offerStatus === "seller_reviewing") {
      dispoReadiness = "ready";
    } else if (
      status === "negotiation"
      || offerStatus === "offer_made"
      || offerStatus === "preparing_offer"
      || route === "offer_ready"
    ) {
      dispoReadiness = "needs_review";
    }
  }

  let buyerFit: BuyerFitVisibility = "unknown";
  if (status === "dead" || route === "dead" || offerStatus === "declined") {
    buyerFit = "narrow";
  } else if (askRatio != null) {
    if (askRatio <= 0.85) {
      buyerFit = "broad";
    } else if (askRatio >= 0.98) {
      buyerFit = "narrow";
    }
  } else if (route === "offer_ready" && (conditionLevel == null || conditionLevel >= 3)) {
    buyerFit = "broad";
  }

  const hint =
    dispoReadiness === "ready"
      ? "Derived from stage + offer progress: ready for buyer-side review."
      : dispoReadiness === "needs_review"
        ? "Derived from stage + offer progress: review buyer fit before disposition handoff."
        : buyerFit === "narrow"
          ? "Current signals suggest a tighter buyer fit."
          : "No reliable buyer/dispo readiness signal yet from current data.";

  const nextStep =
    dispoReadiness === "ready"
      ? "Prepare buyer-ready summary and confirm seller decision follow-up."
      : dispoReadiness === "needs_review"
        ? buyerFit === "narrow"
          ? "Review fit constraints, then decide whether to hand off or continue negotiation."
          : "Confirm buyer fit and set a dispo follow-up touchpoint."
        : "Keep working qualification and negotiation before buyer-side prep.";

  return { buyerFit, dispoReadiness, hint, nextStep };
}

export function buyerFitVisibilityLabel(value: BuyerFitVisibility): string {
  switch (value) {
    case "broad":
      return "Broad";
    case "narrow":
      return "Narrow";
    default:
      return "Unknown";
  }
}

export function dispoReadinessVisibilityLabel(value: DispoReadinessVisibility): string {
  switch (value) {
    case "ready":
      return "Ready";
    case "needs_review":
      return "Needs Review";
    default:
      return "Not Ready";
  }
}

export function deriveNextActionVisibility(input: {
  status: LeadStatus | string | null | undefined;
  qualificationRoute?: QualificationRoute | null;
  nextCallScheduledAt?: string | null;
  nextFollowUpAt?: string | null;
}): NextActionVisibility {
  const status = (input.status ?? "").toLowerCase();
  const route = input.qualificationRoute ?? null;
  const callbackAt = input.nextCallScheduledAt ?? null;
  const followUpAt = input.nextFollowUpAt ?? null;
  const dueAt = callbackAt ?? followUpAt;
  const dueMs = dueAt ? new Date(dueAt).getTime() : NaN;
  const isOverdue = !Number.isNaN(dueMs) && dueMs < Date.now();

  if (route === "offer_ready") {
    return {
      kind: "offer_prep_follow_up",
      label: "Offer-prep follow-up",
      dueAt,
      isOverdue,
    };
  }

  if (route === "escalate") {
    return {
      kind: "escalation_review",
      label: "Escalation review follow-up",
      dueAt,
      isOverdue,
    };
  }

  if (route === "nurture" || status === "nurture") {
    return {
      kind: "nurture_check_in",
      label: "Nurture check-in",
      dueAt,
      isOverdue,
    };
  }

  if (callbackAt) {
    return {
      kind: "callback_scheduled",
      label: "Callback scheduled",
      dueAt,
      isOverdue,
    };
  }

  if (followUpAt) {
    return {
      kind: "follow_up_due",
      label: "Follow-up due",
      dueAt,
      isOverdue,
    };
  }

  return {
    kind: "none",
    label: "No next action set",
    dueAt: null,
    isOverdue: false,
  };
}

export interface LeadRow {
  id: string;
  propertyId: string;
  apn: string;
  county: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  ownerName: string;
  ownerPhone: string | null;
  ownerEmail: string | null;
  ownerBadge: "absentee" | "corporate" | "inherited" | "elderly" | "out-of-state" | null;
  distressSignals: string[];
  status: LeadStatus;
  assignedTo: string | null;
  assignedName: string | null;
  score: AIScore;
  predictivePriority: number;
  estimatedValue: number | null;
  equityPercent: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  propertyType: string | null;
  yearBuilt: number | null;
  lotSize: number | null;
  loanBalance: number | null;
  lastSalePrice: number | null;
  lastSaleDate: string | null;
  foreclosureStage: string | null;
  defaultAmount: number | null;
  delinquentAmount: number | null;
  isVacant: boolean;
  followUpDate: string | null;
  lastContactAt: string | null;
  firstAttemptAt: string | null;
  motivationLevel: number | null;
  sellerTimeline: SellerTimeline | null;
  conditionLevel: number | null;
  decisionMakerConfirmed: boolean;
  priceExpectation: number | null;
  qualificationRoute: QualificationRoute | null;
  occupancyScore: number | null;
  equityFlexibilityScore: number | null;
  qualificationScoreTotal: number | null;
  offerStatus: OfferVisibilityStatus;
  offerPrepSnapshot: OfferPrepSnapshot;
  offerPrepHealth: OfferPrepHealth;
  promotedAt: string;
  source: string;
  sourceChannel: string | null;
  sourceVendor: string | null;
  sourceListName: string | null;
  sourcePullDate: string | null;
  sourceCampaign: string | null;
  intakeMethod: string | null;
  rawSourceRef: string | null;
  duplicateStatus: string | null;
  receivedAt: string | null;
  nicheTag: string | null;
  importBatchId: string | null;
  outreachType: string | null;
  assignedAt: string | null;
  skipTraceStatus: string | null;
  outboundStatus: string | null;
  outboundAttemptCount: number | null;
  outboundFirstCallAt: string | null;
  outboundLastCallAt: string | null;
  firstContactAt: string | null;
  wrongNumber: boolean;
  doNotCall: boolean;
  badRecord: boolean;
  tags: string[];
  complianceClean: boolean;
  notes: string | null;
  totalCalls: number;
  liveAnswers: number;
  voicemailsLeft: number;
  callSequenceStep: number;
  nextCallScheduledAt: string | null;
  dispositionCode: string | null;
  ownerFlags: Record<string, unknown>;
  // Milestone fields
  appointmentAt: string | null;
  offerAmount: number | null;
  contractAt: string | null;
  assignmentFeeProjected: number | null;
  conversionGclid: string | null;
  // Attribution data
  attribution: LeadAttribution | null;
  // Intelligence CRM projection fields (from dossier promote)
  sellerSituationSummaryShort: string | null;
  recommendedCallAngle: string | null;
  topFact1: string | null;
  topFact2: string | null;
  topFact3: string | null;
  opportunityScore: number | null;
  contactabilityScore: number | null;
  confidenceScore: number | null;
  dossierUrl: string | null;
  nextAction: string | null;
  nextActionDueAt: string | null;
  // Active state — active leads appear in Pipeline board
  pinned: boolean;
  pinnedAt: string | null;
  pinnedBy: string | null;
  // Dial queue membership
  dialQueueActive: boolean;
  dialQueueAddedAt: string | null;
  introSopActive: boolean;
  introDayCount: number;
  introLastCallDate: string | null;
  introCompletedAt: string | null;
  introExitCategory: string | null;
  requiresIntroExitCategory: boolean;
}

/**
 * Dynamic team member loaded from user_profiles (real Supabase UUIDs).
 * Replaces the old hardcoded TEAM_MEMBERS whose IDs never matched
 * the actual Supabase auth UUIDs stored in leads.assigned_to.
 */
export interface DynamicTeamMember {
  id: string;       // Supabase auth UUID
  name: string;     // full_name from user_profiles
  role: "admin" | "agent";
}

/**
 * @deprecated Use DynamicTeamMember[] fetched from user_profiles instead.
 * Kept only as a fallback if the DB fetch fails.
 */
export const TEAM_MEMBERS = [
  { id: "user-adam", name: "Adam D.", role: "admin" as const },
  { id: "user-guest", name: "Guest", role: "agent" as const },
  { id: "user-logan", name: "Logan T.", role: "agent" as const },
] as const;

export type TeamMemberId = (typeof TEAM_MEMBERS)[number]["id"];

/** Segment can be "all", "mine", or any team member UUID */
export type LeadSegment = "all" | "mine" | string;
