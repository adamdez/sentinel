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
  assignedTo: string | null;
  source: string;
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
  callSequenceStep: number;
  totalCalls: number;
  liveAnswers: number;
  voicemailsLeft: number;
  dispositionCode: string | null;
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
    status: p.status, assignedTo: p.assigned_to, source: p.source,
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
    nextCallScheduledAt: null, callSequenceStep: 1, totalCalls: 0, liveAnswers: 0, voicemailsLeft: 0, dispositionCode: null,
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
    status: l.status, assignedTo: l.assignedTo, source: l.source,
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
    propertyType: null, bedrooms: null, bathrooms: null,
    sqft: null, yearBuilt: null, lotSize: null,
    estimatedValue: l.estimatedValue, equityPercent: l.equityPercent,
    availableEquity: null, totalLoanBalance: null,
    lastSalePrice: null, lastSaleDate: null,
    foreclosureStage: null, defaultAmount: null, delinquentAmount: null,
    isVacant: false, isAbsentee: l.ownerBadge === "absentee",
    isFreeClear: false, isHighEquity: false, isCashBuyer: false,
    ownerFlags: l.ownerFlags ?? {}, radarId: null, enriched: false,
    appointmentAt: (l as any).appointmentAt ?? null, offerAmount: (l as any).offerAmount ?? null, contractAt: (l as any).contractAt ?? null, assignmentFeeProjected: (l as any).assignmentFeeProjected ?? null, attribution: (l as any).attribution ?? null,
    nextCallScheduledAt: l.nextCallScheduledAt, callSequenceStep: l.callSequenceStep, totalCalls: l.totalCalls, liveAnswers: l.liveAnswers, voicemailsLeft: l.voicemailsLeft, dispositionCode: l.dispositionCode ?? null,
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
  const composite = lead.priority ?? 0;
  const toNum = (v: unknown): number | null => {
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[$,%]/g, ""));
    return isNaN(n) ? null : n;
  };
  const toBool = (v: unknown) => v === true || v === 1 || v === "1" || v === "Yes" || v === "True" || v === "true";
  const sl = (n: number): AIScore["label"] => n >= 85 ? "platinum" : n >= 65 ? "gold" : n >= 40 ? "silver" : "bronze";

  return {
    id: lead.id, propertyId: lead.property_id ?? "", apn: prop.apn ?? "",
    // Prefer inferred county from crawler rawData over the default market county (upsert key)
    county: (prop.owner_flags?.inferred_county as string) || prop.county || "",
    address: prop.address ?? "", city: prop.city ?? "", state: prop.state ?? "", zip: prop.zip ?? "",
    fullAddress: buildAddress(prop.address, prop.city, prop.state, prop.zip),
    ownerName: prop.owner_name ?? "Unknown", ownerPhone: prop.owner_phone ?? null, ownerEmail: prop.owner_email ?? null,
    status: lead.status ?? "prospect", assignedTo: lead.assigned_to ?? null,
    source: lead.source ?? "unknown", tags: lead.tags ?? [], notes: lead.notes ?? null,
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
    compositeScore: composite, motivationScore: Math.round(composite * 0.85),
    dealScore: Math.round(composite * 0.75), scoreLabel: sl(composite),
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
    callSequenceStep: lead.call_sequence_step ?? 1,
    totalCalls: lead.total_calls ?? 0,
    liveAnswers: lead.live_answers ?? 0,
    voicemailsLeft: lead.voicemails_left ?? 0,
    dispositionCode: lead.disposition_code ?? null,
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

export type TabId = "overview" | "contact" | "dossier" | "comps" | "calculator" | "documents";
export type WorkflowStageId = "prospect" | "lead" | "negotiation" | "disposition" | "nurture" | "dead" | "closed";
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
export type CloseoutNextAction = "follow_up_call" | "nurture_check_in" | "escalation_review";
export type CloseoutPresetId =
  | "call_tomorrow"
  | "call_3_days"
  | "call_next_week"
  | "nurture_14_days"
  | "escalate_review";

// ═══════════════════════════════════════════════════════════════════════
// Constants (no icon/React dependencies)
// ═══════════════════════════════════════════════════════════════════════

export const CALL_OUTCOME_OPTIONS = [
  { id: "interested", label: "Interested" },
  { id: "callback", label: "Callback" },
  { id: "appointment", label: "Appointment" },
  { id: "appointment_set", label: "Appointment Set" },
  { id: "contract", label: "Contract Discussed" },
  { id: "voicemail", label: "Voicemail" },
  { id: "no_answer", label: "No Answer" },
  { id: "not_interested", label: "Not Interested" },
  { id: "wrong_number", label: "Wrong Number" },
  { id: "disconnected", label: "Disconnected" },
  { id: "do_not_call", label: "Do Not Call" },
] as const;

export const CLOSEOUT_PRESETS: Array<{
  id: CloseoutPresetId;
  label: string;
  daysFromNow: number | null;
  action: CloseoutNextAction;
}> = [
  { id: "call_tomorrow", label: "Call tomorrow", daysFromNow: 1, action: "follow_up_call" },
  { id: "call_3_days", label: "Call in 3 days", daysFromNow: 3, action: "follow_up_call" },
  { id: "call_next_week", label: "Call next week", daysFromNow: 7, action: "follow_up_call" },
  { id: "nurture_14_days", label: "Nurture 14 days", daysFromNow: 14, action: "nurture_check_in" },
  { id: "escalate_review", label: "Escalate review", daysFromNow: null, action: "escalation_review" },
];

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

export const PRIMARY_TAB_IDS = new Set<TabId>(["overview", "contact", "dossier"]);
export const ADVANCED_TAB_IDS = new Set<TabId>(["comps", "calculator", "documents"]);

export const WORKFLOW_STAGE_OPTIONS: Array<{ id: WorkflowStageId; label: string }> = [
  { id: "prospect", label: "Prospect" },
  { id: "lead", label: "Lead" },
  { id: "negotiation", label: "Negotiation" },
  { id: "disposition", label: "Disposition" },
  { id: "nurture", label: "Nurture" },
  { id: "dead", label: "Dead" },
  { id: "closed", label: "Closed" },
];

const WORKFLOW_STAGE_SET = new Set<WorkflowStageId>(WORKFLOW_STAGE_OPTIONS.map((s) => s.id));
const LEGACY_MY_LEADS_ALIASES = new Set(["my_lead", "my_leads", "my_lead_status"]);

export const SCORE_LABEL_CFG: Record<AIScore["label"], { text: string; color: string; bg: string }> = {
  platinum: { text: "Top priority", color: "text-cyan-300",    bg: "bg-cyan-400/10 border-cyan-400/30" },
  gold:     { text: "High priority",    color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/30" },
  silver:   { text: "Medium",  color: "text-slate-300",   bg: "bg-slate-400/10 border-slate-400/30" },
  bronze:   { text: "Low priority",  color: "text-orange-500",  bg: "bg-orange-600/10 border-orange-600/30" },
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
  return WORKFLOW_STAGE_OPTIONS.find((s) => s.id === normalized)?.label ?? "Prospect";
}

export function sourceDisplayLabel(source: string | null | undefined): string {
  const normalized = (source ?? "unknown").trim().toLowerCase();
  if (normalized === "propertyradar") return "PropertyRadar";
  if (normalized === "ranger_push") return "Ranger";
  if (normalized === "google_ads") return "Google Ads";
  if (normalized === "facebook_ads") return "Facebook Ads";
  return normalized
    .replace(/^csv:/, "CSV ")
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
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

export function routeForCloseoutAction(action: CloseoutNextAction): QualificationRoute | null {
  if (action === "nurture_check_in") return "nurture";
  if (action === "escalation_review") return "escalate";
  return null;
}

export function closeoutActionLabel(action: CloseoutNextAction): string {
  if (action === "nurture_check_in") return "Nurture Check-In";
  if (action === "escalation_review") return "Escalation Review";
  return "Follow-Up Call";
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
  if (d === "connected" || d === "interested" || d === "appointment_set" || d === "callback") return "text-emerald-400";
  if (d === "no_answer" || d === "voicemail" || d === "busy" || d === "left_message") return "text-amber-400";
  if (d === "wrong_number" || d === "disconnected" || d === "do_not_call") return "text-red-400";
  return "text-muted-foreground";
}
