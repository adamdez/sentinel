import {
  deriveOfferPrepHealth,
  deriveOfferVisibilityStatus,
  extractOfferPrepSnapshot,
  type LeadRow,
} from "@/lib/leads-data";
import { extractProspectingSnapshot } from "@/lib/prospecting";

type RawLeadRecord = Record<string, unknown> & {
  property_id?: string | null;
  priority?: number | null;
  status?: string | null;
  assigned_to?: string | null;
  next_follow_up_at?: string | null;
  next_call_scheduled_at?: string | null;
  follow_up_date?: string | null;
  last_contact_at?: string | null;
  created_at?: string | null;
  promoted_at?: string | null;
  motivation_level?: number | null;
  seller_timeline?: LeadRow["sellerTimeline"];
  condition_level?: number | null;
  decision_maker_confirmed?: boolean | null;
  price_expectation?: number | null;
  qualification_route?: LeadRow["qualificationRoute"];
  occupancy_score?: number | null;
  equity_flexibility_score?: number | null;
  qualification_score_total?: number | null;
  source?: string | null;
  tags?: string[] | null;
  notes?: string | null;
  total_calls?: number | null;
  live_answers?: number | null;
  voicemails_left?: number | null;
  call_sequence_step?: number | null;
  disposition_code?: string | null;
  appointment_at?: string | null;
  offer_amount?: number | null;
  contract_at?: string | null;
  assignment_fee_projected?: number | null;
  seller_situation_summary_short?: string | null;
  recommended_call_angle?: string | null;
  top_fact_1?: string | null;
  top_fact_2?: string | null;
  top_fact_3?: string | null;
  opportunity_score?: number | null;
  contactability_score?: number | null;
  confidence_score?: number | null;
  dossier_url?: string | null;
  next_action?: string | null;
  next_action_due_at?: string | null;
  pinned?: boolean | null;
  pinned_at?: string | null;
  pinned_by?: string | null;
  dial_queue_active?: boolean | null;
  dial_queue_added_at?: string | null;
  intro_sop_active?: boolean | null;
  intro_day_count?: number | null;
  intro_last_call_date?: string | null;
  intro_completed_at?: string | null;
  intro_exit_category?: string | null;
  properties?: RawPropertyRecord | RawPropertyRecord[] | null;
};

type RawPropertyRecord = Record<string, unknown> & {
  id?: string | null;
  apn?: string | null;
  county?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  owner_name?: string | null;
  owner_phone?: string | null;
  owner_email?: string | null;
  owner_flags?: Record<string, unknown> | null;
  estimated_value?: number | null;
  equity_percent?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  sqft?: number | null;
  property_type?: string | null;
  year_built?: number | null;
  lot_size?: number | null;
  loan_balance?: number | null;
  last_sale_price?: number | null;
  last_sale_date?: string | null;
  foreclosure_stage?: string | null;
  default_amount?: number | null;
  delinquent_amount?: number | null;
  is_vacant?: boolean | null;
};

function scoreLabel(n: number | null): LeadRow["score"]["label"] {
  if (n == null) return "unscored";
  if (n >= 85) return "platinum";
  if (n >= 65) return "gold";
  if (n >= 40) return "silver";
  return "bronze";
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/[$,%]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBool(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "Yes" || value === "True" || value === "true";
}

function sanitizeOwnerFlags(ownerFlags: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!ownerFlags || typeof ownerFlags !== "object" || Array.isArray(ownerFlags)) return {};
  const {
    pr_raw,
    deep_crawl,
    deep_crawl_result,
    deep_skip,
    ...lightFlags
  } = ownerFlags;
  void pr_raw;
  void deep_crawl;
  void deep_crawl_result;
  void deep_skip;
  return lightFlags;
}

function getPropertyRecord(input: RawLeadRecord["properties"]): RawPropertyRecord {
  if (!input) return {};
  if (Array.isArray(input)) {
    return (input[0] ?? {}) as RawPropertyRecord;
  }
  return input as RawPropertyRecord;
}

export function buildLeadQueueRow(raw: RawLeadRecord, predictiveScore?: number | null): LeadRow {
  const property = getPropertyRecord(raw.properties);
  const ownerFlags = sanitizeOwnerFlags(property.owner_flags);
  const offerPrepSnapshot = extractOfferPrepSnapshot(ownerFlags);
  const prospecting = extractProspectingSnapshot(ownerFlags);
  const composite = toNumber(raw.priority) ?? 0;
  const blendedPredictivePriority =
    predictiveScore != null
      ? Math.round((composite * 0.6) + (predictiveScore * 0.4))
      : composite;

  return {
    id: String(raw.id ?? ""),
    propertyId: String(raw.property_id ?? ""),
    apn: String(property.apn ?? ""),
    county: String(property.county ?? ""),
    address: String(property.address ?? "Unknown"),
    city: String(property.city ?? ""),
    state: String(property.state ?? ""),
    zip: String(property.zip ?? ""),
    ownerName: String(property.owner_name ?? "Unknown"),
    ownerPhone: typeof property.owner_phone === "string" ? property.owner_phone : null,
    ownerEmail: typeof property.owner_email === "string" ? property.owner_email : null,
    ownerBadge: toBool(ownerFlags.absentee) ? "absentee" : null,
    distressSignals: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === "string") : [],
    status: (raw.status as LeadRow["status"] | null) ?? "lead",
    assignedTo: typeof raw.assigned_to === "string" ? raw.assigned_to : null,
    assignedName: null,
    score: {
      composite,
      motivation: composite != null ? Math.round(composite * 0.85) : 0,
      equityVelocity: Math.round((toNumber(property.equity_percent) ?? 50) * 0.8),
      urgency: composite != null ? Math.min(composite + 5, 100) : 0,
      historicalConversion: composite != null ? Math.round(composite * 0.7) : 0,
      aiBoost: 0,
      label: scoreLabel(composite),
    },
    predictivePriority: blendedPredictivePriority,
    estimatedValue: toNumber(property.estimated_value),
    equityPercent: toNumber(property.equity_percent),
    bedrooms: toNumber(property.bedrooms),
    bathrooms: toNumber(property.bathrooms),
    sqft: toNumber(property.sqft),
    propertyType: typeof property.property_type === "string" ? property.property_type : null,
    yearBuilt: toNumber(property.year_built),
    lotSize: toNumber(property.lot_size),
    loanBalance: toNumber(property.loan_balance),
    lastSalePrice: toNumber(property.last_sale_price),
    lastSaleDate: typeof property.last_sale_date === "string" ? property.last_sale_date : null,
    foreclosureStage: typeof property.foreclosure_stage === "string" ? property.foreclosure_stage : null,
    defaultAmount: toNumber(property.default_amount),
    delinquentAmount: toNumber(property.delinquent_amount),
    isVacant: property.is_vacant === true,
    followUpDate:
      (typeof raw.next_follow_up_at === "string" ? raw.next_follow_up_at : null)
      ?? (typeof raw.next_call_scheduled_at === "string" ? raw.next_call_scheduled_at : null)
      ?? (typeof raw.follow_up_date === "string" ? raw.follow_up_date : null),
    lastContactAt: typeof raw.last_contact_at === "string" ? raw.last_contact_at : null,
    firstAttemptAt: null,
    motivationLevel: toNumber(raw.motivation_level),
    sellerTimeline: (raw.seller_timeline as LeadRow["sellerTimeline"] | null) ?? null,
    conditionLevel: toNumber(raw.condition_level),
    decisionMakerConfirmed: raw.decision_maker_confirmed === true,
    priceExpectation: toNumber(raw.price_expectation),
    qualificationRoute: (raw.qualification_route as LeadRow["qualificationRoute"] | null) ?? null,
    occupancyScore: toNumber(raw.occupancy_score),
    equityFlexibilityScore: toNumber(raw.equity_flexibility_score),
    qualificationScoreTotal: toNumber(raw.qualification_score_total),
    offerStatus: deriveOfferVisibilityStatus({
      status: ((raw.status as LeadRow["status"] | null) ?? "lead"),
      qualificationRoute: (raw.qualification_route as LeadRow["qualificationRoute"] | null) ?? null,
    }),
    offerPrepSnapshot,
    offerPrepHealth: deriveOfferPrepHealth({
      status: ((raw.status as LeadRow["status"] | null) ?? "lead"),
      qualificationRoute: (raw.qualification_route as LeadRow["qualificationRoute"] | null) ?? null,
      snapshot: offerPrepSnapshot,
      nextCallScheduledAt: (typeof raw.next_call_scheduled_at === "string" ? raw.next_call_scheduled_at : null),
      nextFollowUpAt:
        (typeof raw.next_follow_up_at === "string" ? raw.next_follow_up_at : null)
        ?? (typeof raw.follow_up_date === "string" ? raw.follow_up_date : null),
    }).state,
    promotedAt: typeof raw.promoted_at === "string" ? raw.promoted_at : typeof raw.created_at === "string" ? raw.created_at : new Date().toISOString(),
    source: typeof raw.source === "string" ? raw.source : "unknown",
    sourceChannel: prospecting.sourceChannel ?? (typeof raw.source === "string" ? raw.source : "unknown"),
    sourceVendor: prospecting.sourceVendor,
    sourceListName: prospecting.sourceListName,
    sourcePullDate: prospecting.sourcePullDate,
    sourceCampaign: prospecting.sourceCampaign,
    intakeMethod: prospecting.intakeMethod,
    rawSourceRef: prospecting.rawSourceRef,
    duplicateStatus: prospecting.duplicateStatus,
    receivedAt: prospecting.receivedAt,
    nicheTag: prospecting.nicheTag,
    importBatchId: prospecting.importBatchId,
    outreachType: prospecting.outreachType,
    assignedAt: prospecting.assignedAt,
    skipTraceStatus: prospecting.skipTraceStatus,
    outboundStatus: prospecting.outboundStatus,
    outboundAttemptCount: prospecting.attemptCount,
    outboundFirstCallAt: prospecting.firstCallAt,
    outboundLastCallAt: prospecting.lastCallAt,
    firstContactAt: prospecting.firstContactAt ?? (typeof raw.last_contact_at === "string" ? raw.last_contact_at : null),
    wrongNumber: prospecting.wrongNumber,
    doNotCall: prospecting.doNotCall,
    badRecord: prospecting.badRecord,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === "string") : [],
    complianceClean: true,
    notes: typeof raw.notes === "string" ? raw.notes : null,
    totalCalls: toNumber(raw.total_calls) ?? 0,
    liveAnswers: toNumber(raw.live_answers) ?? 0,
    voicemailsLeft: toNumber(raw.voicemails_left) ?? 0,
    callSequenceStep: toNumber(raw.call_sequence_step) ?? 1,
    nextCallScheduledAt: typeof raw.next_call_scheduled_at === "string" ? raw.next_call_scheduled_at : null,
    dispositionCode: typeof raw.disposition_code === "string" ? raw.disposition_code : null,
    ownerFlags,
    appointmentAt: typeof raw.appointment_at === "string" ? raw.appointment_at : null,
    offerAmount: toNumber(raw.offer_amount),
    contractAt: typeof raw.contract_at === "string" ? raw.contract_at : null,
    assignmentFeeProjected: toNumber(raw.assignment_fee_projected),
    conversionGclid: null,
    attribution: null,
    sellerSituationSummaryShort: typeof raw.seller_situation_summary_short === "string" ? raw.seller_situation_summary_short : null,
    recommendedCallAngle: typeof raw.recommended_call_angle === "string" ? raw.recommended_call_angle : null,
    topFact1: typeof raw.top_fact_1 === "string" ? raw.top_fact_1 : null,
    topFact2: typeof raw.top_fact_2 === "string" ? raw.top_fact_2 : null,
    topFact3: typeof raw.top_fact_3 === "string" ? raw.top_fact_3 : null,
    opportunityScore: toNumber(raw.opportunity_score),
    contactabilityScore: toNumber(raw.contactability_score),
    confidenceScore: toNumber(raw.confidence_score),
    dossierUrl: typeof raw.dossier_url === "string" ? raw.dossier_url : null,
    nextAction: typeof raw.next_action === "string" ? raw.next_action : null,
    nextActionDueAt: typeof raw.next_action_due_at === "string" ? raw.next_action_due_at : null,
    pinned: raw.pinned === true,
    pinnedAt: typeof raw.pinned_at === "string" ? raw.pinned_at : null,
    pinnedBy: typeof raw.pinned_by === "string" ? raw.pinned_by : null,
    dialQueueActive: raw.dial_queue_active === true,
    dialQueueAddedAt: typeof raw.dial_queue_added_at === "string" ? raw.dial_queue_added_at : null,
    introSopActive: raw.intro_sop_active !== false,
    introDayCount: typeof raw.intro_day_count === "number" ? Math.min(3, Math.max(0, Math.floor(raw.intro_day_count))) : 0,
    introLastCallDate: typeof raw.intro_last_call_date === "string" ? raw.intro_last_call_date : null,
    introCompletedAt: typeof raw.intro_completed_at === "string" ? raw.intro_completed_at : null,
    introExitCategory: typeof raw.intro_exit_category === "string" ? raw.intro_exit_category : null,
    requiresIntroExitCategory:
      typeof raw.intro_completed_at === "string"
      && !(typeof raw.intro_exit_category === "string" && raw.intro_exit_category.trim().length > 0),
  };
}
