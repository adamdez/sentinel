"use client";

/**
 * master-client-file-helpers.ts
 * Pure types, adapters, constants, and utility functions extracted from
 * master-client-file-modal.tsx to reduce file size and improve reviewability.
 */

import { formatCurrency } from "@/lib/utils";
import type { ProspectRow } from "@/hooks/use-prospects";
import {
  extractBuyerDispoTruthSnapshot,
  deriveOfferVisibilityStatus,
  extractOfferPrepSnapshot,
  extractOfferStatusSnapshot,
  type LeadRow,
  type BuyerFitVisibility,
  type DispoReadinessVisibility,
  type OfferPrepConfidence,
  type OfferStatusTruth,
  type OfferVisibilityStatus,
} from "@/lib/leads-data";
import type { AIScore, DistressType, SellerTimeline, QualificationRoute } from "@/lib/types";
import { SIGNAL_WEIGHTS } from "@/lib/scoring";
import { deriveLeadActionSummary } from "@/lib/action-derivation";

// ═══════════════════════════════════════════════════════════════════════
// ClientFile — single unified shape for every funnel stage
// ═══════════════════════════════════════════════════════════════════════

export interface ClientFile {
  id: string;
  propertyId: string;
  apn: string;
  county: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  fullAddress: string;
  ownerName: string;
  ownerPhone: string | null;
  ownerEmail: string | null;
  status: string;
  pinned: boolean;
  pinnedAt: string | null;
  pinnedBy: string | null;
  assignedTo: string | null;
  source: string;
  sourceListName: string | null;
  sourceVendor: string | null;
  tags: string[];
  notes: string | null;
  promotedAt: string | null;
  lastContactAt: string | null;
  followUpDate: string | null;
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
  complianceClean: boolean;
  compositeScore: number;
  motivationScore: number;
  dealScore: number;
  scoreLabel: AIScore["label"];
  aiBoost: number;
  factors: unknown[];
  modelVersion: string | null;
  propertyType: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  lotSize: number | null;
  estimatedValue: number | null;
  equityPercent: number | null;
  availableEquity: number | null;
  totalLoanBalance: number | null;
  lastSalePrice: number | null;
  lastSaleDate: string | null;
  foreclosureStage: string | null;
  defaultAmount: number | null;
  delinquentAmount: number | null;
  isVacant: boolean;
  isAbsentee: boolean;
  isFreeClear: boolean;
  isHighEquity: boolean;
  isCashBuyer: boolean;
  ownerFlags: Record<string, unknown>;
  radarId: string | null;
  enriched: boolean;
  lockVersion?: number;
  appointmentAt: string | null;
  offerAmount: number | null;
  contractAt: string | null;
  assignmentFeeProjected: number | null;
  attribution: { campaignName?: string; adGroupName?: string; keywordText?: string; [k: string]: unknown } | null;
  nextCallScheduledAt: string | null;
  nextAction: string | null;
  nextActionDueAt: string | null;
  callSequenceStep: number;
  totalCalls: number;
  liveAnswers: number;
  voicemailsLeft: number;
  dispositionCode: string | null;
  skipTraceStatus: string | null;
  skipTraceCompletedAt: string | null;
  skipTraceLastError: string | null;
  prediction?: {
    predictiveScore: number;
    daysUntilDistress: number;
    confidence: number;
    label: "imminent" | "likely" | "possible" | "unlikely";
    ownerAgeInference: number | null;
    equityBurnRate: number | null;
    lifeEventProbability: number | null;
  } | null;
  // Buyer-liquidity fields (Phase 1) — manual, Adam-only
  monetizabilityScore: number | null;
  dispoFrictionLevel: string | null;
  // Dossier promotion field — written only through the explicit promote path
  decisionMakerNote: string | null;
  // Intelligence CRM projection fields (from dossier promote / refresh-scores)
  sellerSituationSummaryShort: string | null;
  recommendedCallAngle: string | null;
  topFact1: string | null;
  topFact2: string | null;
  topFact3: string | null;
  opportunityScore: number | null;
  contactabilityScore: number | null;
  confidenceScore: number | null;
  dossierUrl: string | null;
}

// ═══════════════════════════════════════════════════════════════════════
// Adapters
// ═══════════════════════════════════════════════════════════════════════

export function buildAddress(...parts: (string | null | undefined)[]) {
  const filtered = parts.filter((p): p is string => !!p);
  if (filtered.length <= 1) return filtered[0] ?? "";
  const [street, ...rest] = filtered;
  const sl = street.toLowerCase();
  const unique = rest.filter((p) => !sl.includes(p.toLowerCase()));
  return [street, ...unique].join(", ");
}

export function clientFileFromProspect(p: ProspectRow): ClientFile {
  return {
    id: p.id, propertyId: p.property_id, apn: p.apn,
    county: (p.owner_flags?.inferred_county as string) || p.county,
    address: p.address, city: p.city, state: p.state, zip: p.zip,
    fullAddress: buildAddress(p.address, p.city, p.state, p.zip),
    ownerName: p.owner_name, ownerPhone: p.owner_phone, ownerEmail: p.owner_email,
    status: p.status, pinned: p.pinned === true, pinnedAt: p.pinned_at ?? null, pinnedBy: p.pinned_by ?? null, assignedTo: p.assigned_to, source: p.source,
    sourceListName: (p.source_list_name as string | null) ?? ((p.owner_flags?.prospecting_intake as Record<string,unknown> | null)?.source_list_name as string | null) ?? null,
    sourceVendor: (p.source_vendor as string | null) ?? ((p.owner_flags?.prospecting_intake as Record<string,unknown> | null)?.source_vendor as string | null) ?? null,
    tags: p.tags, notes: p.notes, promotedAt: p.promoted_at,
    lastContactAt: null, followUpDate: null,
    motivationLevel: p.motivation_level ?? null,
    sellerTimeline: p.seller_timeline ?? null,
    conditionLevel: p.condition_level ?? null,
    decisionMakerConfirmed: p.decision_maker_confirmed ?? false,
    priceExpectation: p.price_expectation ?? null,
    qualificationRoute: p.qualification_route ?? null,
    occupancyScore: p.occupancy_score ?? null,
    equityFlexibilityScore: p.equity_flexibility_score ?? null,
    qualificationScoreTotal: p.qualification_score_total ?? null,
    offerStatus: deriveOfferVisibilityStatus({
      status: p.status,
      qualificationRoute: p.qualification_route ?? null,
    }),
    complianceClean: true,
    compositeScore: p.composite_score, motivationScore: p.motivation_score,
    dealScore: p.deal_score, scoreLabel: p.score_label,
    aiBoost: p.ai_boost, factors: p.factors, modelVersion: p.model_version,
    propertyType: p.property_type, bedrooms: p.bedrooms, bathrooms: p.bathrooms,
    sqft: p.sqft, yearBuilt: p.year_built, lotSize: p.lot_size,
    estimatedValue: p.estimated_value, equityPercent: p.equity_percent,
    availableEquity: p.available_equity, totalLoanBalance: p.total_loan_balance,
    lastSalePrice: p.last_sale_price, lastSaleDate: p.last_sale_date,
    foreclosureStage: p.foreclosure_stage, defaultAmount: p.default_amount,
    delinquentAmount: p.delinquent_amount, isVacant: p.is_vacant,
    isAbsentee: p.is_absentee, isFreeClear: p.is_free_clear,
    isHighEquity: p.is_high_equity, isCashBuyer: p.is_cash_buyer,
    ownerFlags: p.owner_flags, radarId: p.radar_id, enriched: p.enriched,
    appointmentAt: null, offerAmount: null, contractAt: null, assignmentFeeProjected: null, attribution: null,
    nextCallScheduledAt: null, nextAction: null, nextActionDueAt: null, callSequenceStep: 1, totalCalls: 0, liveAnswers: 0, voicemailsLeft: 0, dispositionCode: null,
    skipTraceStatus: null, skipTraceCompletedAt: null, skipTraceLastError: null,
    prediction: p._prediction ?? null,
    monetizabilityScore: null,
    dispoFrictionLevel: null,
    decisionMakerNote: null,
    sellerSituationSummaryShort: null,
    recommendedCallAngle: null,
    topFact1: null,
    topFact2: null,
    topFact3: null,
    opportunityScore: null,
    contactabilityScore: null,
    confidenceScore: null,
    dossierUrl: null,
  };
}

export function clientFileFromLead(l: LeadRow): ClientFile {
  return {
    id: l.id, propertyId: l.propertyId, apn: l.apn, county: l.county,
    address: l.address, city: l.city, state: l.state, zip: l.zip,
    fullAddress: buildAddress(l.address, l.city, l.state, l.zip),
    ownerName: l.ownerName, ownerPhone: l.ownerPhone, ownerEmail: l.ownerEmail,
    status: l.status, pinned: l.pinned === true, pinnedAt: l.pinnedAt ?? null, pinnedBy: l.pinnedBy ?? null, assignedTo: l.assignedTo, source: l.source,
    sourceListName: l.sourceListName ?? null,
    sourceVendor: l.sourceVendor ?? null,
    tags: l.tags, notes: l.notes, promotedAt: l.promotedAt,
    lastContactAt: l.lastContactAt, followUpDate: l.followUpDate,
    motivationLevel: l.motivationLevel,
    sellerTimeline: l.sellerTimeline,
    conditionLevel: l.conditionLevel,
    decisionMakerConfirmed: l.decisionMakerConfirmed,
    priceExpectation: l.priceExpectation,
    qualificationRoute: l.qualificationRoute,
    occupancyScore: l.occupancyScore ?? null,
    equityFlexibilityScore: l.equityFlexibilityScore ?? null,
    qualificationScoreTotal: l.qualificationScoreTotal ?? null,
    offerStatus: l.offerStatus,
    complianceClean: l.complianceClean,
    compositeScore: l.score.composite, motivationScore: l.score.motivation,
    dealScore: Math.round(l.score.composite * 0.75), scoreLabel: l.score.label,
    aiBoost: l.score.aiBoost, factors: [], modelVersion: null,
    propertyType: l.propertyType, bedrooms: l.bedrooms, bathrooms: l.bathrooms,
    sqft: l.sqft, yearBuilt: l.yearBuilt, lotSize: l.lotSize,
    estimatedValue: l.estimatedValue, equityPercent: l.equityPercent,
    availableEquity: l.estimatedValue != null && l.loanBalance != null ? l.estimatedValue - l.loanBalance : null,
    totalLoanBalance: l.loanBalance,
    lastSalePrice: l.lastSalePrice, lastSaleDate: l.lastSaleDate,
    foreclosureStage: l.foreclosureStage, defaultAmount: l.defaultAmount, delinquentAmount: l.delinquentAmount,
    isVacant: l.isVacant, isAbsentee: l.ownerBadge === "absentee",
    isFreeClear: l.loanBalance == null || l.loanBalance === 0,
    isHighEquity: (l.equityPercent ?? 0) >= 40,
    isCashBuyer: false,
    ownerFlags: l.ownerFlags ?? {}, radarId: null, enriched: false,
    appointmentAt: (l as any).appointmentAt ?? null, offerAmount: (l as any).offerAmount ?? null, contractAt: (l as any).contractAt ?? null, assignmentFeeProjected: (l as any).assignmentFeeProjected ?? null, attribution: (l as any).attribution ?? null,
    nextCallScheduledAt: l.nextCallScheduledAt, nextAction: l.nextAction ?? null, nextActionDueAt: l.nextActionDueAt ?? null, callSequenceStep: l.callSequenceStep, totalCalls: l.totalCalls, liveAnswers: l.liveAnswers, voicemailsLeft: l.voicemailsLeft, dispositionCode: l.dispositionCode ?? null,
    skipTraceStatus: l.skipTraceStatus ?? null,
    skipTraceCompletedAt: (l as LeadRow & { skipTraceCompletedAt?: string | null }).skipTraceCompletedAt ?? null,
    skipTraceLastError: (l as LeadRow & { skipTraceLastError?: string | null }).skipTraceLastError ?? null,
    prediction: null,
    monetizabilityScore: (l as any).monetizability_score ?? null,
    dispoFrictionLevel: (l as any).dispo_friction_level ?? null,
    decisionMakerNote: (l as any).decision_maker_note ?? null,
    sellerSituationSummaryShort: l.sellerSituationSummaryShort ?? null,
    recommendedCallAngle: l.recommendedCallAngle ?? null,
    topFact1: l.topFact1 ?? null,
    topFact2: l.topFact2 ?? null,
    topFact3: l.topFact3 ?? null,
    opportunityScore: l.opportunityScore ?? null,
    contactabilityScore: l.contactabilityScore ?? null,
    confidenceScore: l.confidenceScore ?? null,
    dossierUrl: l.dossierUrl ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function clientFileFromRaw(lead: Record<string, any>, prop: Record<string, any>): ClientFile {
  const flags = prop.owner_flags ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prRaw = (flags.pr_raw ?? {}) as Record<string, any>;
  const composite = lead.priority ?? null;
  const toNum = (v: unknown): number | null => {
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[$,%]/g, ""));
    return isNaN(n) ? null : n;
  };
  const toBool = (v: unknown) => v === true || v === 1 || v === "1" || v === "Yes" || v === "True" || v === "true";
  const sl = (n: number | null): AIScore["label"] => n == null ? "unscored" : n >= 85 ? "platinum" : n >= 65 ? "gold" : n >= 40 ? "silver" : "bronze";

  return {
    id: lead.id, propertyId: lead.property_id ?? "", apn: prop.apn ?? "",
    // Prefer inferred county from crawler rawData over the default market county (upsert key)
    county: (prop.owner_flags?.inferred_county as string) || prop.county || "",
    address: prop.address ?? "", city: prop.city ?? "", state: prop.state ?? "", zip: prop.zip ?? "",
    fullAddress: buildAddress(prop.address, prop.city, prop.state, prop.zip),
    ownerName: prop.owner_name ?? "Unknown", ownerPhone: prop.owner_phone ?? null, ownerEmail: prop.owner_email ?? null,
    status: lead.status ?? "prospect", pinned: lead.pinned === true, pinnedAt: lead.pinned_at ?? null, pinnedBy: lead.pinned_by ?? null, assignedTo: lead.assigned_to ?? null,
    source: lead.source ?? "unknown",
    sourceListName: (lead.source_list_name as string | null) ?? null,
    sourceVendor: (lead.source_vendor as string | null) ?? null,
    tags: lead.tags ?? [], notes: lead.notes ?? null,
    promotedAt: lead.promoted_at ?? null, lastContactAt: lead.last_contact_at ?? null,
    followUpDate: lead.follow_up_date ?? null,
    motivationLevel: lead.motivation_level != null ? Number(lead.motivation_level) : null,
    sellerTimeline: (lead.seller_timeline as SellerTimeline | null) ?? null,
    conditionLevel: lead.condition_level != null ? Number(lead.condition_level) : null,
    decisionMakerConfirmed: lead.decision_maker_confirmed === true,
    priceExpectation: lead.price_expectation != null ? Number(lead.price_expectation) : null,
    qualificationRoute: (lead.qualification_route as QualificationRoute | null) ?? null,
    occupancyScore: lead.occupancy_score != null ? Number(lead.occupancy_score) : null,
    equityFlexibilityScore: lead.equity_flexibility_score != null ? Number(lead.equity_flexibility_score) : null,
    qualificationScoreTotal: lead.qualification_score_total != null ? Number(lead.qualification_score_total) : null,
    offerStatus: deriveOfferVisibilityStatus({
      status: lead.status ?? "prospect",
      qualificationRoute: (lead.qualification_route as QualificationRoute | null) ?? null,
    }),
    complianceClean: true,
    compositeScore: composite ?? 0, motivationScore: composite != null ? Math.round(composite * 0.85) : 0,
    dealScore: composite != null ? Math.round(composite * 0.75) : 0, scoreLabel: sl(composite),
    aiBoost: 0, factors: [], modelVersion: null,
    propertyType: prop.property_type ?? null, bedrooms: prop.bedrooms ?? null,
    bathrooms: prop.bathrooms != null ? Number(prop.bathrooms) : null,
    sqft: prop.sqft ?? null, yearBuilt: prop.year_built ?? null, lotSize: prop.lot_size ?? null,
    estimatedValue: prop.estimated_value ?? null,
    equityPercent: prop.equity_percent != null ? Number(prop.equity_percent) : null,
    availableEquity: toNum(prRaw.AvailableEquity) ?? toNum(flags.available_equity),
    totalLoanBalance: toNum(prRaw.TotalLoanBalance) ?? toNum(flags.total_loan_balance),
    lastSalePrice: toNum(prRaw.LastTransferValue) ?? toNum(flags.last_sale_price),
    lastSaleDate: (prRaw.LastTransferRecDate as string) ?? (flags.last_sale_date as string) ?? null,
    foreclosureStage: (prRaw.ForeclosureStage as string) ?? null,
    defaultAmount: toNum(prRaw.DefaultAmount), delinquentAmount: toNum(prRaw.DelinquentAmount),
    isVacant: toBool(flags.vacant) || toBool(prRaw.isSiteVacant),
    isAbsentee: toBool(flags.absentee) || toBool(prRaw.isNotSameMailingOrExempt),
    isFreeClear: toBool(flags.freeAndClear) || toBool(prRaw.isFreeAndClear),
    isHighEquity: toBool(flags.highEquity) || toBool(prRaw.isHighEquity),
    isCashBuyer: toBool(flags.cashBuyer) || toBool(prRaw.isCashBuyer),
    ownerFlags: flags, radarId: (flags.radar_id as string) ?? null,
    enriched: !!flags.skip_traced || (flags.all_phones as unknown[])?.length > 0,
    lockVersion: lead.lock_version ?? 0,
    appointmentAt: lead.appointment_at ?? null, offerAmount: lead.offer_amount != null ? Number(lead.offer_amount) : null, contractAt: lead.contract_at ?? null, assignmentFeeProjected: lead.assignment_fee_projected != null ? Number(lead.assignment_fee_projected) : null, attribution: lead.attribution ?? null,
    nextCallScheduledAt: lead.next_call_scheduled_at ?? null,
    nextAction: lead.next_action ?? null,
    nextActionDueAt: lead.next_action_due_at ?? null,
    callSequenceStep: lead.call_sequence_step ?? 1,
    totalCalls: lead.total_calls ?? 0,
    liveAnswers: lead.live_answers ?? 0,
    voicemailsLeft: lead.voicemails_left ?? 0,
    dispositionCode: lead.disposition_code ?? null,
    skipTraceStatus: lead.skip_trace_status ?? lead.skipTraceStatus ?? null,
    skipTraceCompletedAt: lead.skip_trace_completed_at ?? lead.skipTraceCompletedAt ?? null,
    skipTraceLastError: lead.skip_trace_last_error ?? lead.skipTraceLastError ?? null,
    prediction: lead._prediction ?? null,
    monetizabilityScore: lead.monetizability_score != null ? Number(lead.monetizability_score) : null,
    dispoFrictionLevel: lead.dispo_friction_level ?? null,
    decisionMakerNote: lead.decision_maker_note ?? null,
    sellerSituationSummaryShort: lead.seller_situation_summary_short ?? null,
    recommendedCallAngle: lead.recommended_call_angle ?? null,
    topFact1: lead.top_fact_1 ?? null,
    topFact2: lead.top_fact_2 ?? null,
    topFact3: lead.top_fact_3 ?? null,
    opportunityScore: lead.opportunity_score != null ? Number(lead.opportunity_score) : null,
    contactabilityScore: lead.contactability_score != null ? Number(lead.contactability_score) : null,
    confidenceScore: lead.confidence_score != null ? Number(lead.confidence_score) : null,
    dossierUrl: lead.dossier_url ?? null,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Type aliases
// ═══════════════════════════════════════════════════════════════════════

export type TabId = "overview" | "contact" | "deep_search" | "dossier" | "comps" | "calculator" | "documents" | "legal";
export type WorkflowStageId = "prospect" | "lead" | "active" | "negotiation" | "disposition" | "nurture" | "dead" | "closed";
export type ScoreType = "composite" | "motivation" | "deal";

export type QualificationDraft = {
  motivationLevel: number | null;
  sellerTimeline: SellerTimeline | null;
  conditionLevel: number | null;
  decisionMakerConfirmed: boolean;
  priceExpectation: number | null;
  qualificationRoute: QualificationRoute | null;
  occupancyScore: number | null;
  equityFlexibilityScore: number | null;
};
export type OfferPrepSnapshotDraft = {
  arvUsed: string;
  rehabEstimate: string;
  maoLow: string;
  maoHigh: string;
  confidence: OfferPrepConfidence | "";
  sheetUrl: string;
  conditionAdjPct: number;
  arvLow: number | null;
  arvBase: number | null;
  arvHigh: number | null;
  arvSource: "comps" | "avm" | "manual" | null;
  offerPercentage: number | null;
};
export type OfferStatusSnapshotDraft = {
  status: OfferStatusTruth | "";
  amount: string;
  amountLow: string;
  amountHigh: string;
  sellerResponseNote: string;
};
export type BuyerDispoTruthDraft = {
  buyerFit: BuyerFitVisibility | "";
  dispoStatus: DispoReadinessVisibility | "";
  nextStep: string;
  dispoNote: string;
};
export type CloseoutNextAction =
  | "follow_up_call"
  | "nurture_check_in"
  | "escalation_review"
  | "drive_by"
  | "move_active"
  | "mark_dead";
export type CloseoutPresetId =
  | "call_tomorrow"
  | "call_3_days"
  | "call_next_week"
  | "nurture_30_days"
  | "nurture_90_days"
  | "nurture_6_months"
  | "escalate_review"
  | "drive_by_tomorrow"
  | "drive_by_3_days"
  | "move_active"
  | "mark_dead";
export type CloseoutPresetGroupId = "retry_call" | "field_follow_up" | "stage_transitions" | "terminal";

export type CloseoutPresetDefinition = {
  id: CloseoutPresetId;
  label: string;
  action: CloseoutNextAction;
  daysFromNow?: number;
  monthsFromNow?: number;
  nextActionText?: string | null;
};

export type SkipTraceUiState = "skipped" | "skip_empty" | "skip_failed" | "not_run";

export function deriveSkipTraceUiState(input: {
  clientFile: ClientFile;
  sessionHasResults?: boolean;
  sessionFailed?: boolean;
  persistedPhoneCount?: number;
}): {
  status: SkipTraceUiState;
  durableFailureReason: string | null;
} {
  const cf = input.clientFile;
  const durableSkipTraced = Boolean(
    cf.skipTraceCompletedAt
    || cf.ownerFlags?.skip_traced
    || cf.ownerFlags?.skip_trace_intel_at
    || (typeof cf.skipTraceStatus === "string" && ["completed", "partial_failure"].includes(cf.skipTraceStatus.trim().toLowerCase()))
  );
  const ownerFlagPhoneCount = (cf.ownerFlags?.all_phones as unknown[] | undefined)?.length ?? 0;
  const persistedPhoneCount = Math.max(
    input.persistedPhoneCount ?? 0,
    ownerFlagPhoneCount,
    cf.ownerPhone ? 1 : 0,
  );
  const durableFailureReason =
    (typeof cf.skipTraceLastError === "string" && cf.skipTraceLastError.trim())
      ? cf.skipTraceLastError
      : (typeof cf.ownerFlags?.skip_trace_failure_reason === "string" && cf.ownerFlags.skip_trace_failure_reason.trim())
        ? (cf.ownerFlags.skip_trace_failure_reason as string)
        : (typeof cf.ownerFlags?.skip_trace_last_error === "string" && cf.ownerFlags.skip_trace_last_error.trim())
          ? (cf.ownerFlags.skip_trace_last_error as string)
          : null;
  const durableFailed = Boolean(
    durableFailureReason
    || (typeof cf.skipTraceStatus === "string" && ["failed"].includes(cf.skipTraceStatus.trim().toLowerCase()))
  );

  const status: SkipTraceUiState =
    input.sessionHasResults ? "skipped"
    : (durableSkipTraced && persistedPhoneCount > 0) ? "skipped"
    : (input.sessionFailed || durableFailed) ? "skip_failed"
    : durableSkipTraced ? "skip_empty"
    : "not_run";

  return { status, durableFailureReason };
}

// ═══════════════════════════════════════════════════════════════════════
// Constants (no icon/React dependencies)
// ═══════════════════════════════════════════════════════════════════════

export const CALL_OUTCOME_OPTIONS = [
  { id: "interested", label: "Talked / Interested" },
  { id: "callback", label: "Callback" },
  { id: "appointment", label: "Appointment" },
  { id: "voicemail", label: "Voicemail" },
  { id: "no_answer", label: "No Answer" },
  { id: "not_interested", label: "Not Interested" },
  { id: "wrong_number", label: "Wrong Number" },
  { id: "disconnected", label: "Disconnected" },
  { id: "do_not_call", label: "Do Not Call" },
] as const;

export const CLOSEOUT_PRESETS: CloseoutPresetDefinition[] = [
  { id: "call_tomorrow", label: "Call tomorrow", daysFromNow: 1, action: "follow_up_call" },
  { id: "call_3_days", label: "Call in 3 days", daysFromNow: 3, action: "follow_up_call" },
  { id: "call_next_week", label: "Call next week", daysFromNow: 7, action: "follow_up_call" },
  { id: "drive_by_tomorrow", label: "Drive by tomorrow", daysFromNow: 1, action: "drive_by", nextActionText: "Drive by tomorrow" },
  { id: "drive_by_3_days", label: "Drive by in 3 days", daysFromNow: 3, action: "drive_by", nextActionText: "Drive by in 3 days" },
  { id: "move_active", label: "Move to Active", action: "move_active", nextActionText: "Active seller follow-up" },
  { id: "nurture_30_days", label: "Nurture 30 days", daysFromNow: 30, action: "nurture_check_in", nextActionText: "Nurture check-in in 30 days" },
  { id: "nurture_90_days", label: "Nurture 90 days", daysFromNow: 90, action: "nurture_check_in", nextActionText: "Nurture check-in in 90 days" },
  { id: "nurture_6_months", label: "Nurture 6 months", monthsFromNow: 6, action: "nurture_check_in", nextActionText: "Nurture check-in in 6 months" },
  { id: "mark_dead", label: "Mark Dead", action: "mark_dead", nextActionText: "Marked dead - no further follow-up" },
  { id: "escalate_review", label: "Escalate review", action: "escalation_review", nextActionText: "Escalation review requested" },
];

export const CLOSEOUT_PRESET_GROUPS: Array<{
  id: CloseoutPresetGroupId;
  label: string;
  presetIds: CloseoutPresetId[];
}> = [
  {
    id: "retry_call",
    label: "Retry Call",
    presetIds: ["call_tomorrow", "call_3_days", "call_next_week"],
  },
  {
    id: "field_follow_up",
    label: "Field Follow-Up",
    presetIds: ["drive_by_tomorrow", "drive_by_3_days"],
  },
  {
    id: "stage_transitions",
    label: "Stage Transition",
    presetIds: ["move_active", "nurture_30_days", "nurture_90_days", "nurture_6_months"],
  },
  {
    id: "terminal",
    label: "Terminal / Review",
    presetIds: ["mark_dead", "escalate_review"],
  },
];

export const OUTCOME_PRESET_DEFAULTS: Partial<Record<string, CloseoutPresetId>> = {
  no_answer:      "call_tomorrow",
  voicemail:      "call_3_days",
  disconnected:   "mark_dead",
  wrong_number:   "mark_dead",
  callback:       "call_3_days",
  interested:     "move_active",
  appointment:    "move_active",
  appointment_set:"move_active",
  contract:       "move_active",
  do_not_call:    "mark_dead",
  not_interested: "mark_dead",
};

export const SELLER_TIMELINE_OPTIONS: Array<{ id: SellerTimeline; label: string }> = [
  { id: "immediate", label: "Immediate" },
  { id: "30_days", label: "30 Days" },
  { id: "60_days", label: "60 Days" },
  { id: "flexible", label: "Flexible" },
  { id: "unknown", label: "Unknown" },
];

export const QUALIFICATION_ROUTE_OPTIONS: Array<{ id: QualificationRoute; label: string }> = [
  { id: "offer_ready", label: "Offer Ready" },
  { id: "follow_up", label: "Follow-Up" },
  { id: "nurture", label: "Nurture" },
  { id: "dead", label: "Dead" },
  { id: "escalate", label: "Escalate Review" },
];
export const QUALIFICATION_ROUTE_IDS = new Set<QualificationRoute>(QUALIFICATION_ROUTE_OPTIONS.map((option) => option.id));

export const OFFER_PREP_CONFIDENCE_OPTIONS: Array<{ id: OfferPrepConfidence; label: string }> = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
];

export const OFFER_STATUS_OPTIONS: Array<{ id: OfferStatusTruth; label: string }> = [
  { id: "offer_discussed", label: "Offer Discussed" },
  { id: "offer_sent", label: "Offer Sent" },
  { id: "seller_reviewing", label: "Seller Reviewing" },
  { id: "counter_needs_revision", label: "Counter / Needs Revision" },
  { id: "accepted", label: "Accepted" },
  { id: "passed_not_moving_forward", label: "Passed / Not Moving Forward" },
];

export const PRIMARY_TAB_IDS = new Set<TabId>(["overview", "contact", "deep_search"]);
export const ADVANCED_TAB_IDS = new Set<TabId>(["comps", "calculator", "documents"]);

export const WORKFLOW_STAGE_OPTIONS: Array<{ id: WorkflowStageId; label: string }> = [
  { id: "prospect", label: "New" },
  { id: "lead", label: "Lead" },
  { id: "active", label: "Active" },
  { id: "negotiation", label: "Negotiation" },
  { id: "disposition", label: "Disposition" },
  { id: "nurture", label: "Nurture" },
  { id: "dead", label: "Dead" },
  { id: "closed", label: "Closed" },
];

const WORKFLOW_STAGE_SET = new Set<WorkflowStageId>(WORKFLOW_STAGE_OPTIONS.map((s) => s.id));
const LEGACY_MY_LEADS_ALIASES = new Set(["my_lead", "my_leads", "my_lead_status"]);

export const SCORE_LABEL_CFG: Record<AIScore["label"], { text: string; color: string; bg: string }> = {
  unscored: { text: "Unscored",     color: "text-muted-foreground/50", bg: "bg-muted/5 border-border/20" },
  platinum: { text: "Top priority", color: "text-primary-300",    bg: "bg-primary-400/10 border-primary-400/30" },
  gold:     { text: "High priority",    color: "text-foreground",   bg: "bg-muted/10 border-border/30" },
  silver:   { text: "Medium",  color: "text-foreground",   bg: "bg-muted/10 border-border/30" },
  bronze:   { text: "Low priority",  color: "text-foreground",  bg: "bg-muted/10 border-border/30" },
};

export const COUNTY_LINKS: Record<string, { name: string; gis: (apn: string) => string; assessor: (apn: string) => string; treasurer?: (apn: string) => string }> = {
  spokane: {
    name: "Spokane County",
    gis: (apn) => `https://cp.spokanecounty.org/SCOUT/Map/?PID=${encodeURIComponent(apn)}`,
    assessor: (apn) => `https://cp.spokanecounty.org/SCOUT/propertyinformation/Summary.aspx?PID=${encodeURIComponent(apn)}`,
    treasurer: (apn) => `https://cp.spokanecounty.org/SCOUT/propertyinformation/Summary.aspx?PID=${encodeURIComponent(apn)}`,
  },
  kootenai: {
    name: "Kootenai County",
    gis: () => `https://gis.kcgov.us/app/kcearth/`,
    assessor: () => `https://ftp.kcgov.us/departments/mapping/mapSearch/`,
    treasurer: () => `https://id-kootenai.publicaccessnow.com/Treasurer/TaxSearch.aspx`,
  },
  ada: {
    name: "Ada County",
    gis: (apn) => `https://www.adacountyassessor.org/adamaps/?run=ZoomToParcel&query=parcel%3D'${encodeURIComponent(apn)}'&LayerTheme=AerialsOn`,
    assessor: () => `https://apps.adacounty.id.gov/PropertyLookup/`,
    treasurer: () => `https://adacounty.id.gov/treasurer/`,
  },
};

export function buildZillowSearchUrl(property: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
} | null | undefined): string | null {
  if (!property) return null;
  const parts = [
    property.address?.trim(),
    property.city?.trim(),
    property.state?.trim(),
    property.zip?.trim(),
  ].filter((value): value is string => Boolean(value && value.length > 0));

  if (parts.length === 0) return null;
  return `https://www.zillow.com/homes/${encodeURIComponent(parts.join(", "))}_rb/`;
}

export function buildCountyParcelAssessorUrl(input: {
  county?: string | null;
  parcel?: string | null;
} | null | undefined): string | null {
  if (!input) return null;
  const parcel = input.parcel?.trim();
  if (!parcel) return null;
  const countyKey = input.county?.trim().toLowerCase() ?? "";
  const countyInfo = Object.entries(COUNTY_LINKS).find(([key]) => countyKey.includes(key))?.[1];
  return countyInfo ? countyInfo.assessor(parcel) : null;
}

// ═══════════════════════════════════════════════════════════════════════
// Pure utility functions
// ═══════════════════════════════════════════════════════════════════════

export function parseSuggestedRoute(value: unknown): QualificationRoute | null {
  if (typeof value !== "string") return null;
  return QUALIFICATION_ROUTE_IDS.has(value as QualificationRoute) ? (value as QualificationRoute) : null;
}

export function qualificationRouteLabel(route: QualificationRoute | null | undefined): string {
  switch (route) {
    case "offer_ready":
      return "Offer Ready";
    case "follow_up":
      return "Follow-Up";
    case "nurture":
      return "Nurture";
    case "dead":
      return "Dead";
    case "escalate":
      return "Escalate Review";
    default:
      return "Unknown";
  }
}

export function normalizeWorkflowStage(status: string | null | undefined): WorkflowStageId {
  const normalized = (status ?? "").toLowerCase().replace(/\s+/g, "_");
  if (WORKFLOW_STAGE_SET.has(normalized as WorkflowStageId)) {
    return normalized as WorkflowStageId;
  }
  if (LEGACY_MY_LEADS_ALIASES.has(normalized)) {
    return "lead";
  }
  return "prospect";
}

export function workflowStageLabel(status: string | null | undefined): string {
  const normalized = normalizeWorkflowStage(status);
  return WORKFLOW_STAGE_OPTIONS.find((s) => s.id === normalized)?.label ?? "New";
}

export function sourceDisplayLabel(source: string | null | undefined): string {
  const normalized = (source ?? "unknown").trim().toLowerCase();
  if (normalized === "propertyradar") return "PropertyRadar";
  if (normalized === "ranger_push") return "Ranger";
  if (normalized === "google_ads") return "Google Ads";
  if (normalized === "facebook_ads") return "Facebook Ads";
  if (normalized === "csv_import") return "CSV Import";
  if (normalized === "manual") return "Manual";
  if (normalized === "special_intake") return "Special Intake";
  if (normalized === "spokane_scout_harvest") return "Scout Harvest";
  if (normalized === "vendor_inbound") return "Vendor Inbound";
  if (normalized === "eliteseed_top10_20260301") return "EliteSeed";
  if (normalized.startsWith("eliteseed")) return "EliteSeed";
  return normalized
    .replace(/^csv:/, "CSV ")
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function vendorDisplayLabel(vendor: string | null | undefined): string | null {
  if (!vendor) return null;
  const v = vendor.trim().toLowerCase();
  if (v === "propradar" || v === "propertyradar") return "PropRadar";
  if (v === "realsupermarket") return "RealSupermarket";
  if (v === "batchdata") return "BatchData";
  if (v === "propstream") return "PropStream";
  if (v === "manual_resume" || v === "manual") return null; // not a real vendor name
  return vendor.trim().replace(/[_-]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

/**
 * Returns "Vendor · List Name", "List Name", "Vendor", or the base source label —
 * whichever pieces are available. Used consistently across all surfaces.
 */
export function buildSourceLabel(
  source: string | null | undefined,
  vendor: string | null | undefined,
  listName: string | null | undefined,
): string {
  const v = vendorDisplayLabel(vendor);
  const l = listName?.trim() || null;
  if (v && l) return `${v} · ${l}`;
  if (l) return l;
  if (v) return v;
  return sourceDisplayLabel(source);
}

export function marketDisplayLabel(county: string | null | undefined): string {
  const c = (county ?? "").toLowerCase();
  if (c.includes("spokane")) return "Spokane County, WA";
  if (c.includes("kootenai")) return "Kootenai County, ID";
  if (!county) return "Other Market";
  return county.toLowerCase().includes("county") ? county : `${county} County`;
}

export function formatDateTimeShort(iso: string | null | undefined): string {
  if (!iso) return "n/a";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "n/a";
  const raw = d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  // Guard against environments that drop the colon between hour and minute
  // e.g. "Mar 21, 2026 723 PM" → "Mar 21, 2026 7:23 PM"
  return raw.replace(/(\d{1,2})(\d{2})\s*(AM|PM)/i, "$1:$2 $3");
}

export function toLocalDateTimeInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function fromLocalDateTimeInput(localValue: string): string | null {
  if (!localValue) return null;
  const d = new Date(localValue);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function presetDateTimeLocal(daysFromNow: number): string {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setDate(d.getDate() + daysFromNow);
  return toLocalDateTimeInput(d.toISOString());
}

export function presetDateTimeMonthsLocal(monthsFromNow: number): string {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMonth(d.getMonth() + monthsFromNow);
  return toLocalDateTimeInput(d.toISOString());
}

export function resolveCloseoutPresetDateTimeLocal(preset: CloseoutPresetDefinition): string {
  if (typeof preset.monthsFromNow === "number") {
    return presetDateTimeMonthsLocal(preset.monthsFromNow);
  }
  if (typeof preset.daysFromNow === "number") {
    return presetDateTimeLocal(preset.daysFromNow);
  }
  return "";
}

export function routeForCloseoutAction(action: CloseoutNextAction): QualificationRoute | null {
  if (action === "nurture_check_in") return "nurture";
  if (action === "move_active") return "follow_up";
  if (action === "mark_dead") return "dead";
  if (action === "escalation_review") return "escalate";
  return null;
}

export function closeoutActionLabel(action: CloseoutNextAction): string {
  if (action === "drive_by") return "Drive By";
  if (action === "move_active") return "Move to Active";
  if (action === "mark_dead") return "Mark Dead";
  if (action === "nurture_check_in") return "Move to Nurture";
  if (action === "escalation_review") return "Escalation Review";
  return "Follow-Up Call";
}

/** Structured next_action text for closeout actions that are not phone calls */
export function closeoutNextActionText(
  action: CloseoutNextAction,
  presetId?: CloseoutPresetId | null,
): string | null {
  if (presetId) {
    const preset = CLOSEOUT_PRESETS.find((item) => item.id === presetId);
    if (preset?.nextActionText) return preset.nextActionText;
  }
  if (action === "drive_by") return "Drive by";
  if (action === "move_active") return "Active seller follow-up";
  if (action === "mark_dead") return "Marked dead - no further follow-up";
  if (action === "nurture_check_in") return "Nurture check-in";
  if (action === "escalation_review") return "Escalation review requested";
  return null;
}

export function closeoutActionRequiresDueDate(action: CloseoutNextAction): boolean {
  return action === "follow_up_call" || action === "nurture_check_in" || action === "drive_by";
}

function closeoutDuePhrase(dueAtIso: string | null | undefined): string | null {
  if (!dueAtIso) return null;
  const due = new Date(dueAtIso);
  if (Number.isNaN(due.getTime())) return null;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const dayDiff = Math.round((startOfDue.getTime() - startOfToday.getTime()) / 86_400_000);
  if (dayDiff <= 0) return "today";
  if (dayDiff === 1) return "tomorrow";
  if (dayDiff < 7) return `in ${dayDiff} days`;
  return formatDateTimeShort(dueAtIso);
}

export function closeoutSuccessMessage(action: CloseoutNextAction, dueAtIso?: string | null): string {
  const dueLabel = closeoutDuePhrase(dueAtIso);
  if (action === "move_active") return "Moved to Active";
  if (action === "mark_dead") return "Marked Dead";
  if (action === "escalation_review") return "Requested Escalation Review";
  if (action === "drive_by") return dueLabel ? `Set Drive By for ${dueLabel}` : "Set Drive By";
  if (action === "nurture_check_in") return dueLabel ? `Moved to Nurture for ${dueLabel}` : "Moved to Nurture";
  return dueLabel ? `Scheduled callback for ${dueLabel}` : "Scheduled callback";
}

export function formatRelativeFromNow(iso: string | null | undefined): string {
  if (!iso) return "n/a";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "n/a";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(Math.abs(diffMs) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return diffMs >= 0 ? `${mins}m ago` : `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return diffMs >= 0 ? `${hrs}h ago` : `in ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return diffMs >= 0 ? `${days}d ago` : `in ${days}d`;
}

export function getQualificationDraft(cf: ClientFile | null | undefined): QualificationDraft {
  return {
    motivationLevel: cf?.motivationLevel ?? null,
    sellerTimeline: cf?.sellerTimeline ?? null,
    conditionLevel: cf?.conditionLevel ?? null,
    decisionMakerConfirmed: cf?.decisionMakerConfirmed ?? false,
    priceExpectation: cf?.priceExpectation ?? null,
    qualificationRoute: cf?.qualificationRoute ?? null,
    occupancyScore: cf?.occupancyScore ?? null,
    equityFlexibilityScore: cf?.equityFlexibilityScore ?? null,
  };
}

export function toDraftCurrency(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return String(Math.round(value));
}

export function parseDraftCurrency(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed.replace(/[$,\s]/g, ""), 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, parsed);
}

export function getOfferPrepDraft(cf: ClientFile | null | undefined): OfferPrepSnapshotDraft {
  const snapshot = extractOfferPrepSnapshot((cf?.ownerFlags ?? null) as Record<string, unknown> | null);
  const fallbackArv = typeof cf?.ownerFlags?.comp_arv === "number" ? (cf?.ownerFlags?.comp_arv as number) : null;

  return {
    arvUsed: toDraftCurrency(snapshot.arvUsed ?? fallbackArv),
    rehabEstimate: toDraftCurrency(snapshot.rehabEstimate),
    maoLow: toDraftCurrency(snapshot.maoLow),
    maoHigh: toDraftCurrency(snapshot.maoHigh),
    confidence: snapshot.confidence ?? "",
    sheetUrl: snapshot.sheetUrl ?? "",
    conditionAdjPct: snapshot.conditionAdjPct ?? 0,
    arvLow: snapshot.arvLow ?? null,
    arvBase: snapshot.arvBase ?? null,
    arvHigh: snapshot.arvHigh ?? null,
    arvSource: snapshot.arvSource ?? null,
    offerPercentage: snapshot.offerPercentage ?? null,
  };
}

export function getOfferStatusDraft(cf: ClientFile | null | undefined): OfferStatusSnapshotDraft {
  const snapshot = extractOfferStatusSnapshot((cf?.ownerFlags ?? null) as Record<string, unknown> | null);
  return {
    status: snapshot.status ?? "",
    amount: toDraftCurrency(snapshot.amount),
    amountLow: toDraftCurrency(snapshot.amountLow),
    amountHigh: toDraftCurrency(snapshot.amountHigh),
    sellerResponseNote: snapshot.sellerResponseNote ?? "",
  };
}

export function getBuyerDispoTruthDraft(cf: ClientFile | null | undefined): BuyerDispoTruthDraft {
  const snapshot = extractBuyerDispoTruthSnapshot((cf?.ownerFlags ?? null) as Record<string, unknown> | null);
  return {
    buyerFit: snapshot.buyerFit ?? "",
    dispoStatus: snapshot.dispoStatus ?? "",
    nextStep: snapshot.nextStep ?? "",
    dispoNote: snapshot.dispoNote ?? "",
  };
}

export function getNextActionUrgency(cf: ClientFile): {
  label: string;
  detail: string;
  tone: "normal" | "warn" | "danger";
} {
  const summary = deriveLeadActionSummary({
    status: cf.status,
    qualificationRoute: cf.qualificationRoute,
    assignedTo: cf.assignedTo,
    nextCallScheduledAt: cf.nextCallScheduledAt,
    nextFollowUpAt: cf.followUpDate,
    lastContactAt: cf.lastContactAt,
    totalCalls: cf.totalCalls,
    nextAction: cf.nextAction,
    nextActionDueAt: cf.nextActionDueAt,
    createdAt: cf.promotedAt,
    promotedAt: cf.promotedAt,
  });

  const tone: "normal" | "warn" | "danger" =
    summary.urgency === "critical" ? "danger" :
    summary.urgency === "high" || summary.urgency === "normal" ? "warn" :
    "normal";

  return { label: summary.action, detail: summary.reason, tone };
}

export function extractLatLng(cf: ClientFile): { lat: number | null; lng: number | null } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flags = (cf.ownerFlags ?? {}) as Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prRaw = (flags.pr_raw ?? {}) as Record<string, any>;

  const tryParse = (v: unknown): number | null => {
    if (v == null || v === "" || v === "null") return null;
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return isNaN(n) || n === 0 ? null : n;
  };

  const lat =
    tryParse(prRaw.Latitude) ??
    tryParse(prRaw.latitude) ??
    tryParse(flags.latitude) ??
    tryParse(flags.lat) ??
    null;

  const lng =
    tryParse(prRaw.Longitude) ??
    tryParse(prRaw.longitude) ??
    tryParse(flags.longitude) ??
    tryParse(flags.lng) ??
    null;

  return { lat, lng };
}

export function dispositionColor(disp: string): string {
  const d = disp.toLowerCase();
  if (d === "connected" || d === "interested" || d === "appointment_set" || d === "callback") return "text-foreground";
  if (d === "no_answer" || d === "voicemail" || d === "busy" || d === "left_message") return "text-foreground";
  if (d === "wrong_number" || d === "disconnected" || d === "do_not_call") return "text-foreground";
  return "text-muted-foreground";
}
