export type TinaStageStatus = "live" | "next" | "planned";

export interface TinaStageBlueprint {
  id: string;
  title: string;
  summary: string;
  deliverable: string;
  status: TinaStageStatus;
}

export interface TinaBoundaryNote {
  title: string;
  summary: string;
}

export type TinaEntityType =
  | "sole_prop"
  | "single_member_llc"
  | "s_corp"
  | "c_corp"
  | "partnership"
  | "multi_member_llc"
  | "unsure";

export type TinaAccountingMethod = "cash" | "accrual" | "unsure";
export type TinaTaxElection = "unsure" | "default" | "s_corp" | "c_corp";
export type TinaSpouseCommunityPropertyTreatment =
  | "unknown"
  | "no"
  | "possible"
  | "confirmed";

export interface TinaPriorReturnSnapshot {
  fileName: string;
  fileSize: number;
  fileType: string;
  lastModified: number;
  capturedAt: string;
}

export type TinaStoredDocumentCategory = "prior_return" | "supporting_document";

export interface TinaStoredDocument {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  storagePath: string;
  category: TinaStoredDocumentCategory;
  requestId: string | null;
  requestLabel: string | null;
  uploadedAt: string;
}

export type TinaDocumentReadingKind = "spreadsheet" | "pdf" | "word" | "image" | "unknown";
export type TinaDocumentReadingStatus = "not_started" | "complete" | "waiting_for_ai" | "error";
export type TinaDocumentFactConfidence = "high" | "medium" | "low";

export interface TinaDocumentReadingFact {
  id: string;
  label: string;
  value: string;
  confidence: TinaDocumentFactConfidence;
}

export interface TinaSourceFact {
  id: string;
  sourceDocumentId: string;
  label: string;
  value: string;
  confidence: TinaDocumentFactConfidence;
  capturedAt: string | null;
}

export interface TinaDocumentReading {
  documentId: string;
  status: TinaDocumentReadingStatus;
  kind: TinaDocumentReadingKind;
  summary: string;
  nextStep: string;
  facts: TinaDocumentReadingFact[];
  detailLines: string[];
  rowCount: number | null;
  headers: string[];
  sheetNames: string[];
  lastReadAt: string | null;
}

export interface TinaBusinessTaxProfile {
  businessName: string;
  taxYear: string;
  principalBusinessActivity: string;
  entityType: TinaEntityType;
  ownerCount: number | null;
  ownershipChangedDuringYear: boolean;
  taxElection: TinaTaxElection;
  spouseCommunityPropertyTreatment: TinaSpouseCommunityPropertyTreatment;
  hasOwnerBuyoutOrRedemption: boolean;
  hasFormerOwnerPayments: boolean;
  formationState: string;
  formationDate: string;
  accountingMethod: TinaAccountingMethod;
  naicsCode: string;
  hasPayroll: boolean;
  paysContractors: boolean;
  hasInventory: boolean;
  hasFixedAssets: boolean;
  collectsSalesTax: boolean;
  hasIdahoActivity: boolean;
  notes: string;
}

export type TinaBootstrapFactSource = "organizer" | "prior_return" | "document_vault";
export type TinaBootstrapFactStatus = "ready" | "review";

export interface TinaBootstrapFact {
  id: string;
  label: string;
  value: string;
  source: TinaBootstrapFactSource;
  status: TinaBootstrapFactStatus;
}

export type TinaReviewSeverity = "blocking" | "needs_attention" | "watch";
export type TinaReviewStatus = "open" | "resolved";
export type TinaReviewCategory =
  | "setup"
  | "document_followup"
  | "fact_mismatch"
  | "continuity"
  | "state_scope"
  | "books";

export interface TinaReviewItem {
  id: string;
  title: string;
  summary: string;
  severity: TinaReviewSeverity;
  status: TinaReviewStatus;
  category: TinaReviewCategory;
  requestId: string | null;
  documentId?: string | null;
  factId?: string | null;
}

export type TinaBootstrapReviewStatus = "idle" | "stale" | "running" | "complete";

export interface TinaBootstrapReview {
  lastRunAt: string | null;
  profileFingerprint?: string | null;
  status: TinaBootstrapReviewStatus;
  summary: string;
  nextStep: string;
  facts: TinaBootstrapFact[];
  items: TinaReviewItem[];
}

export type TinaIssueQueueStatus = "idle" | "stale" | "running" | "complete";
export type TinaPrepRecordStatus = "ready" | "needs_attention" | "waiting";

export interface TinaPrepRecord {
  id: string;
  label: string;
  status: TinaPrepRecordStatus;
  summary: string;
  issueIds: string[];
}

export interface TinaIssueQueue {
  lastRunAt: string | null;
  profileFingerprint?: string | null;
  status: TinaIssueQueueStatus;
  summary: string;
  nextStep: string;
  items: TinaReviewItem[];
  records: TinaPrepRecord[];
}

export type TinaWorkpaperStatus = "idle" | "stale" | "running" | "complete";
export type TinaWorkpaperLayer =
  | "book_original"
  | "ai_cleanup"
  | "tax_adjustment"
  | "reviewer_final";
export type TinaWorkpaperLineKind =
  | "income"
  | "expense"
  | "net"
  | "coverage"
  | "signal";
export type TinaWorkpaperLineStatus = "ready" | "needs_attention" | "waiting";

export interface TinaWorkpaperLine {
  id: string;
  kind: TinaWorkpaperLineKind;
  layer: TinaWorkpaperLayer;
  label: string;
  amount: number | null;
  status: TinaWorkpaperLineStatus;
  summary: string;
  sourceDocumentIds: string[];
  sourceFactIds: string[];
  issueIds: string[];
  derivedFromLineIds: string[];
  cleanupSuggestionIds: string[];
  taxAdjustmentIds?: string[];
}

export interface TinaWorkpaperSnapshot {
  lastRunAt: string | null;
  status: TinaWorkpaperStatus;
  summary: string;
  nextStep: string;
  lines: TinaWorkpaperLine[];
}

export interface TinaAiCleanupSnapshot {
  lastRunAt: string | null;
  status: TinaWorkpaperStatus;
  summary: string;
  nextStep: string;
  lines: TinaWorkpaperLine[];
}

export type TinaTaxAdjustmentStatus =
  | "needs_authority"
  | "ready_for_review"
  | "approved"
  | "rejected";
export type TinaTaxAdjustmentRisk = "low" | "medium" | "high";
export type TinaTaxAdjustmentKind =
  | "carryforward_line"
  | "timing_review"
  | "sales_tax_exclusion"
  | "payroll_classification"
  | "contractor_classification"
  | "inventory_treatment"
  | "multistate_scope";

export interface TinaTaxAdjustment {
  id: string;
  kind: TinaTaxAdjustmentKind;
  status: TinaTaxAdjustmentStatus;
  risk: TinaTaxAdjustmentRisk;
  requiresAuthority: boolean;
  title: string;
  summary: string;
  suggestedTreatment: string;
  whyItMatters: string;
  amount: number | null;
  authorityWorkIdeaIds: string[];
  aiCleanupLineIds: string[];
  sourceDocumentIds: string[];
  sourceFactIds: string[];
  reviewerNotes: string;
}

export interface TinaTaxAdjustmentSnapshot {
  lastRunAt: string | null;
  status: TinaWorkpaperStatus;
  summary: string;
  nextStep: string;
  adjustments: TinaTaxAdjustment[];
}

export interface TinaScheduleCDraftField {
  id: string;
  lineNumber: string;
  label: string;
  amount: number | null;
  status: TinaWorkpaperLineStatus;
  summary: string;
  reviewerFinalLineIds: string[];
  taxAdjustmentIds: string[];
  sourceDocumentIds: string[];
}

export interface TinaScheduleCDraftNote {
  id: string;
  title: string;
  summary: string;
  severity: "needs_attention" | "watch";
  reviewerFinalLineIds: string[];
  taxAdjustmentIds: string[];
  sourceDocumentIds: string[];
}

export interface TinaScheduleCDraftSnapshot {
  lastRunAt: string | null;
  status: TinaWorkpaperStatus;
  summary: string;
  nextStep: string;
  fields: TinaScheduleCDraftField[];
  notes: TinaScheduleCDraftNote[];
}

export type TinaPackageReadinessLevel = "blocked" | "needs_review" | "ready_for_cpa";

export interface TinaPackageReadinessItem {
  id: string;
  title: string;
  summary: string;
  severity: "blocking" | "needs_attention";
  relatedFieldIds: string[];
  relatedNoteIds: string[];
  relatedReviewItemIds: string[];
  sourceDocumentIds: string[];
}

export interface TinaPackageReadinessSnapshot {
  lastRunAt: string | null;
  status: TinaWorkpaperStatus;
  level: TinaPackageReadinessLevel;
  summary: string;
  nextStep: string;
  items: TinaPackageReadinessItem[];
}

export type TinaCpaHandoffArtifactStatus = "ready" | "waiting" | "blocked";

export interface TinaCpaHandoffArtifact {
  id: string;
  title: string;
  status: TinaCpaHandoffArtifactStatus;
  summary: string;
  includes: string[];
  relatedFieldIds: string[];
  relatedNoteIds: string[];
  relatedReadinessItemIds: string[];
  sourceDocumentIds: string[];
}

export interface TinaCpaHandoffSnapshot {
  lastRunAt: string | null;
  status: TinaWorkpaperStatus;
  summary: string;
  nextStep: string;
  artifacts: TinaCpaHandoffArtifact[];
}

export type TinaPackageState =
  | "provisional"
  | "ready_for_cpa_review"
  | "blocked"
  | "signed_off"
  | "signed_off_stale";

export type TinaReviewerDecision = "approved" | "changes_requested" | "revoked";

export interface TinaReviewerDecisionRecord {
  id: string;
  snapshotId: string;
  decision: TinaReviewerDecision;
  reviewerName: string;
  notes: string;
  decidedAt: string;
}

export type TinaReviewerObservedDeltaDomain =
  | "entity_route"
  | "evidence_books"
  | "treatment_authority"
  | "form_execution"
  | "workflow_governance"
  | "planning"
  | "general";

export type TinaReviewerObservedDeltaKind =
  | "accepted_first_pass"
  | "accepted_after_adjustment"
  | "change_requested"
  | "rejected"
  | "stale_after_acceptance";

export type TinaReviewerObservedDeltaSeverity = "info" | "needs_attention" | "blocking";

export interface TinaReviewerObservedDeltaRecord {
  id: string;
  title: string;
  domain: TinaReviewerObservedDeltaDomain;
  kind: TinaReviewerObservedDeltaKind;
  severity: TinaReviewerObservedDeltaSeverity;
  occurredAt: string;
  reviewerName: string | null;
  summary: string;
  trustEffect: string;
  ownerEngines: string[];
  benchmarkScenarioIds: string[];
  relatedDecisionId: string | null;
  relatedSnapshotId: string | null;
  relatedAuthorityWorkIdeaId: string | null;
}

export interface TinaPackageSnapshotRecord {
  id: string;
  createdAt: string;
  packageFingerprint: string;
  packageState: TinaPackageState;
  readinessLevel: TinaPackageReadinessLevel;
  blockerCount: number;
  attentionCount: number;
  summary: string;
  exportFileName: string;
  exportContents: string;
}

export interface TinaReviewerSignoffSnapshot {
  lastEvaluatedAt: string | null;
  packageState: TinaPackageState;
  summary: string;
  nextStep: string;
  activeSnapshotId: string | null;
  activeDecisionId: string | null;
  currentPackageFingerprint: string | null;
  signedOffPackageFingerprint: string | null;
  hasDriftSinceSignoff: boolean;
}

export type TinaTaxPositionBucket = "use" | "review" | "appendix" | "reject";
export type TinaTreatmentCleanupDependency =
  | "cleanup_first"
  | "proof_first"
  | "return_prep_ready";
export type TinaTreatmentFederalStateSensitivity =
  | "federal_only"
  | "federal_with_state_follow_through"
  | "state_can_change_answer";
export type TinaTreatmentCommercialPriority = "immediate" | "next" | "later";

export interface TinaAppendixItem {
  id: string;
  title: string;
  summary: string;
  whyItMatters: string;
  taxPositionBucket: TinaTaxPositionBucket;
  category: string;
  nextStep: string;
  authoritySummary: string;
  reviewerQuestion: string;
  disclosureFlag: string;
  authorityTargets: string[];
  sourceLabels: string[];
  factIds: string[];
  documentIds: string[];
}

export interface TinaAppendixSnapshot {
  lastRunAt: string | null;
  status: TinaWorkpaperStatus;
  summary: string;
  nextStep: string;
  items: TinaAppendixItem[];
}

export type TinaOperationalMaturity = "foundation" | "schedule_c_core" | "reviewer_grade_core";

export interface TinaOperationalStatusSnapshot {
  lastRunAt: string | null;
  maturity: TinaOperationalMaturity;
  packageState: TinaPackageState;
  summary: string;
  nextStep: string;
  truths: string[];
  blockers: string[];
}

export type TinaQuickBooksConnectionStatus =
  | "not_connected"
  | "connecting"
  | "connected"
  | "syncing"
  | "error";

export interface TinaQuickBooksConnectionSnapshot {
  status: TinaQuickBooksConnectionStatus;
  connectedAt: string | null;
  lastSyncAt: string | null;
  companyName: string;
  realmId: string;
  summary: string;
  nextStep: string;
  lastError: string;
  importedDocumentIds: string[];
}

export type TinaCleanupPlanStatus = "idle" | "stale" | "running" | "complete";
export type TinaCleanupSuggestionType =
  | "reconcile_line"
  | "confirm_scope"
  | "request_document";
export type TinaCleanupSuggestionPriority = "important" | "helpful" | "watch";
export type TinaCleanupSuggestionStatus =
  | "suggested"
  | "reviewing"
  | "approved"
  | "rejected";

export interface TinaCleanupSuggestion {
  id: string;
  type: TinaCleanupSuggestionType;
  priority: TinaCleanupSuggestionPriority;
  status: TinaCleanupSuggestionStatus;
  title: string;
  summary: string;
  suggestedAction: string;
  whyItMatters: string;
  workpaperLineIds: string[];
  issueIds: string[];
  sourceDocumentIds: string[];
  sourceFactIds: string[];
  reviewerNotes: string;
}

export interface TinaCleanupPlan {
  lastRunAt: string | null;
  status: TinaCleanupPlanStatus;
  summary: string;
  nextStep: string;
  suggestions: TinaCleanupSuggestion[];
}

export type TinaAuthorityWorkStatus =
  | "not_started"
  | "researching"
  | "ready_for_reviewer"
  | "reviewed"
  | "rejected";

export type TinaAuthorityReviewerDecision =
  | "pending"
  | "use_it"
  | "need_more_support"
  | "do_not_use";

export type TinaAuthorityDisclosureDecision =
  | "unknown"
  | "not_needed"
  | "needs_review"
  | "required";

export type TinaAuthorityCitationSourceClass =
  | "primary_authority"
  | "secondary_analysis"
  | "internal_signal"
  | "community_lead"
  | "low_trust_lead"
  | "unknown";

export type TinaAuthorityCitationEffect = "supports" | "warns" | "background";

export interface TinaAuthorityCitation {
  id: string;
  title: string;
  url: string;
  sourceClass: TinaAuthorityCitationSourceClass;
  effect: TinaAuthorityCitationEffect;
  note: string;
}

export interface TinaAuthorityWorkItem {
  ideaId: string;
  status: TinaAuthorityWorkStatus;
  reviewerDecision: TinaAuthorityReviewerDecision;
  disclosureDecision: TinaAuthorityDisclosureDecision;
  memo: string;
  reviewerNotes: string;
  missingAuthority: string[];
  citations: TinaAuthorityCitation[];
  lastAiRunAt: string | null;
  updatedAt: string | null;
}

export interface TinaWorkspaceDraft {
  version: number;
  savedAt: string | null;
  priorReturn: TinaPriorReturnSnapshot | null;
  priorReturnDocumentId: string | null;
  documents: TinaStoredDocument[];
  documentReadings: TinaDocumentReading[];
  sourceFacts: TinaSourceFact[];
  bootstrapReview: TinaBootstrapReview;
  issueQueue: TinaIssueQueue;
  workpapers: TinaWorkpaperSnapshot;
  cleanupPlan: TinaCleanupPlan;
  aiCleanup: TinaAiCleanupSnapshot;
  taxAdjustments: TinaTaxAdjustmentSnapshot;
  reviewerFinal: TinaWorkpaperSnapshot;
  scheduleCDraft: TinaScheduleCDraftSnapshot;
  packageReadiness: TinaPackageReadinessSnapshot;
  cpaHandoff: TinaCpaHandoffSnapshot;
  reviewerSignoff: TinaReviewerSignoffSnapshot;
  reviewerDecisions: TinaReviewerDecisionRecord[];
  reviewerObservedDeltas: TinaReviewerObservedDeltaRecord[];
  packageSnapshots: TinaPackageSnapshotRecord[];
  appendix: TinaAppendixSnapshot;
  operationalStatus: TinaOperationalStatusSnapshot;
  quickBooksConnection: TinaQuickBooksConnectionSnapshot;
  authorityWork: TinaAuthorityWorkItem[];
  profile: TinaBusinessTaxProfile;
}

export type TinaDraftSyncStatus =
  | "loading"
  | "local_only"
  | "saving"
  | "saved"
  | "error";

export type TinaFilingLaneId =
  | "schedule_c_single_member_llc"
  | "1120_s"
  | "1120"
  | "1065"
  | "unknown";

export type TinaFilingLaneSupport = "supported" | "future" | "blocked";

export interface TinaFilingLaneRecommendation {
  laneId: TinaFilingLaneId;
  title: string;
  support: TinaFilingLaneSupport;
  summary: string;
  reasons: string[];
  blockers: string[];
}

export type TinaChecklistPriority = "required" | "recommended" | "watch";

export interface TinaChecklistItem {
  id: string;
  label: string;
  reason: string;
  priority: TinaChecklistPriority;
  status: "needed" | "covered";
}

export type TinaStartPathProofRequirementId =
  | "ownership-agreement"
  | "entity-election"
  | "ownership-transition"
  | "community-property-proof";

export interface TinaStartPathProofRequirement {
  id: TinaStartPathProofRequirementId;
  label: string;
  reason: string;
  priority: TinaChecklistPriority;
  status: "needed" | "covered";
  relatedLaneIds: TinaFilingLaneId[];
  relatedFactIds: string[];
  relatedDocumentIds: string[];
}

export interface TinaStartPathAssessment {
  recommendation: TinaFilingLaneRecommendation;
  returnTypeHintFacts: TinaSourceFact[];
  hintedLanes: TinaFilingLaneId[];
  hasMixedHintedLanes: boolean;
  singleHintedLane: TinaFilingLaneId | null;
  hasHintVsOrganizerConflict: boolean;
  ownershipChangeClue: TinaSourceFact | null;
  formerOwnerPaymentClue: TinaSourceFact | null;
  ownershipMismatchWithSingleOwnerLane: boolean;
  route: "supported" | "review_only" | "blocked";
  confidence: "high" | "needs_review" | "blocked";
  blockingReasons: string[];
  reviewReasons: string[];
  proofRequirements: TinaStartPathProofRequirement[];
  relatedFactIds: string[];
  relatedDocumentIds: string[];
}

export type TinaFormBuildStatus = "idle" | "complete";
export type TinaFormValidationSeverity = "blocking" | "needs_attention";

export interface TinaFormValidationIssue {
  id: string;
  title: string;
  summary: string;
  severity: TinaFormValidationSeverity;
  relatedLineNumbers: string[];
}

export interface TinaScheduleCFormField {
  id: string;
  lineNumber: string;
  formKey: string;
  label: string;
  amount: number | null;
  status: TinaWorkpaperLineStatus;
  sourceFieldIds: string[];
}

export interface TinaScheduleCFormHeader {
  businessName: string;
  taxYear: string;
  principalBusinessActivity: string;
  naicsCode: string;
  accountingMethod: TinaBusinessTaxProfile["accountingMethod"];
  entityType: TinaBusinessTaxProfile["entityType"];
}

export type TinaScheduleCFormCoverageStatus =
  | "covered"
  | "partial"
  | "needs_review"
  | "unsupported";

export interface TinaScheduleCFormCoverageItem {
  id: string;
  title: string;
  status: TinaScheduleCFormCoverageStatus;
  summary: string;
  relatedLineNumbers: string[];
}

export interface TinaScheduleCFormCoverageSnapshot {
  lastBuiltAt: string | null;
  summary: string;
  nextStep: string;
  items: TinaScheduleCFormCoverageItem[];
}

export interface TinaScheduleCReturnSnapshot {
  lastBuiltAt: string | null;
  status: TinaFormBuildStatus;
  summary: string;
  nextStep: string;
  header: TinaScheduleCFormHeader;
  businessName: string;
  taxYear: string;
  laneId: TinaFilingLaneId;
  fields: TinaScheduleCFormField[];
  validationIssues: TinaFormValidationIssue[];
}

export interface TinaScheduleCFormTraceLine {
  id: string;
  lineNumber: string;
  formKey: string;
  label: string;
  amount: number | null;
  status: TinaWorkpaperLineStatus;
  sourceFieldIds: string[];
  reviewerFinalLineIds: string[];
  taxAdjustmentIds: string[];
  sourceDocumentIds: string[];
  sourceFactIds: string[];
  evidenceSupportLevel: "strong" | "moderate" | "weak" | "missing";
  evidenceSupportSummary: string;
}

export interface TinaScheduleCFormTraceSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  summary: string;
  nextStep: string;
  lines: TinaScheduleCFormTraceLine[];
}

export interface TinaReviewerChallengeItem {
  id: string;
  title: string;
  summary: string;
  severity: "blocking" | "needs_attention";
  category:
    | "start_path"
    | "evidence"
    | "books"
    | "validation"
    | "coverage";
  relatedLineNumbers: string[];
  relatedFactIds: string[];
  relatedDocumentIds: string[];
}

export interface TinaReviewerChallengeSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  summary: string;
  nextStep: string;
  items: TinaReviewerChallengeItem[];
}

export type TinaEntityJudgmentStatus =
  | "clear_supported"
  | "clear_but_unsupported"
  | "review_required"
  | "blocked";

export interface TinaEntityJudgmentQuestion {
  id: string;
  title: string;
  summary: string;
  severity: "blocking" | "needs_attention";
  relatedFactIds: string[];
  relatedDocumentIds: string[];
}

export interface TinaEntityJudgmentSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  judgmentStatus: TinaEntityJudgmentStatus;
  laneId: TinaFilingLaneId;
  likelyFederalTreatment: string;
  summary: string;
  nextStep: string;
  reasons: string[];
  questions: TinaEntityJudgmentQuestion[];
}

export interface TinaTreatmentJudgmentItem {
  id: string;
  title: string;
  policyArea: string;
  summary: string;
  taxPositionBucket: TinaTaxPositionBucket;
  confidence: "high" | "medium" | "low";
  suggestedTreatment: string;
  nextStep: string;
  requiredProof: string[];
  alternativeTreatments: string[];
  cleanupDependency: TinaTreatmentCleanupDependency;
  federalStateSensitivity: TinaTreatmentFederalStateSensitivity;
  commercialPriority: TinaTreatmentCommercialPriority;
  authorityWorkIdeaIds: string[];
  relatedFactIds: string[];
  relatedDocumentIds: string[];
}

export interface TinaTreatmentJudgmentSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  summary: string;
  nextStep: string;
  items: TinaTreatmentJudgmentItem[];
}

export interface TinaOwnershipTimelineEvent {
  id: string;
  title: string;
  summary: string;
  status: "known" | "assumed" | "needs_proof";
  relatedFactIds: string[];
  relatedDocumentIds: string[];
}

export interface TinaOwnershipTimelineSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  summary: string;
  nextStep: string;
  likelyOwnerCount: number | null;
  hasMidYearChange: boolean;
  hasFormerOwnerPayments: boolean;
  events: TinaOwnershipTimelineEvent[];
}

export type TinaEntityAmbiguitySignalCategory =
  | "route_conflict"
  | "owner_count_conflict"
  | "election_gap"
  | "spouse_exception"
  | "transition_timeline"
  | "buyout_economics";
export type TinaEntityAmbiguitySignalSeverity = "signal" | "review" | "blocking";
export type TinaEntityAmbiguityHypothesisStatus = "leading" | "plausible" | "fallback";
export type TinaEntityAmbiguityOverallStatus = "stable_route" | "competing_routes" | "blocked";
export type TinaEntityAmbiguityRecommendedHandling =
  | "continue"
  | "carry_competing_paths"
  | "blocked_until_proved";

export interface TinaEntityAmbiguitySignal {
  id: string;
  title: string;
  category: TinaEntityAmbiguitySignalCategory;
  severity: TinaEntityAmbiguitySignalSeverity;
  summary: string;
  relatedLaneIds: TinaFilingLaneId[];
  relatedFactIds: string[];
  relatedDocumentIds: string[];
}

export interface TinaEntityAmbiguityHypothesis {
  id: string;
  title: string;
  laneId: TinaFilingLaneId;
  status: TinaEntityAmbiguityHypothesisStatus;
  confidence: "high" | "medium" | "low";
  stabilityScore: number;
  summary: string;
  whyPlausible: string[];
  whatCouldChange: string[];
  requiredProof: string[];
  supportingSignalCount: number;
  contradictingSignalCount: number;
  recommendedFirstQuestion: string | null;
  relatedSignalIds: string[];
}

export interface TinaEntityAmbiguitySnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  overallStatus: TinaEntityAmbiguityOverallStatus;
  recommendedHandling: TinaEntityAmbiguityRecommendedHandling;
  leadingHypothesisId: string | null;
  summary: string;
  nextStep: string;
  signals: TinaEntityAmbiguitySignal[];
  hypotheses: TinaEntityAmbiguityHypothesis[];
  priorityQuestions: string[];
}

export type TinaEntityFilingRemediationSignalCategory =
  | "current_vs_prior_route_drift"
  | "ownership_timeline_gap"
  | "election_trail_gap"
  | "missing_return_backlog"
  | "transition_year"
  | "state_registration_drift"
  | "prior_year_books_drift"
  | "late_election_relief"
  | "amended_return_sequencing";
export type TinaEntityFilingRemediationSignalSeverity = "signal" | "review" | "blocking";
export type TinaEntityFilingRemediationOverallStatus = "aligned" | "review_required" | "blocked";
export type TinaEntityFilingRemediationPosture =
  | "aligned_current_path"
  | "prior_return_drift"
  | "missing_return_backlog"
  | "election_unproved"
  | "late_election_relief"
  | "amended_return_pressure"
  | "transition_year_rebuild"
  | "competing_entity_paths";
export type TinaEntityFilingRemediationReturnKind =
  | "current_year_return"
  | "prior_year_remediation"
  | "election_relief"
  | "state_alignment"
  | "amended_return";
export type TinaEntityFilingRemediationReturnStatus =
  | "aligned"
  | "conditional"
  | "likely_missing"
  | "reviewer_controlled";
export type TinaEntityFilingRemediationHistoryStatus =
  | "aligned"
  | "review_required"
  | "blocked";
export type TinaEntityFilingRemediationElectionStatus =
  | "not_applicable"
  | "accepted_or_timely"
  | "relief_candidate"
  | "unproved";
export type TinaEntityFilingRemediationAmendmentStatus =
  | "not_applicable"
  | "possible"
  | "sequencing_required";

export interface TinaEntityFilingRemediationSignal {
  id: string;
  title: string;
  category: TinaEntityFilingRemediationSignalCategory;
  severity: TinaEntityFilingRemediationSignalSeverity;
  summary: string;
  relatedLaneIds: TinaFilingLaneId[];
  relatedFactIds: string[];
  relatedDocumentIds: string[];
}

export interface TinaEntityFilingRemediationIssue {
  id: string;
  title: string;
  summary: string;
  severity: "blocking" | "needs_attention";
  relatedFactIds: string[];
  relatedDocumentIds: string[];
}

export interface TinaEntityFilingRemediationReturnAction {
  id: string;
  title: string;
  kind: TinaEntityFilingRemediationReturnKind;
  status: TinaEntityFilingRemediationReturnStatus;
  summary: string;
  whyNow: string;
  returnFamily: string;
  laneId: TinaFilingLaneId | null;
  taxYears: string[];
  relatedSignalIds: string[];
}

export interface TinaEntityFilingRemediationSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  overallStatus: TinaEntityFilingRemediationOverallStatus;
  posture: TinaEntityFilingRemediationPosture;
  historyStatus: TinaEntityFilingRemediationHistoryStatus;
  electionStatus: TinaEntityFilingRemediationElectionStatus;
  amendmentStatus: TinaEntityFilingRemediationAmendmentStatus;
  currentLaneId: TinaFilingLaneId;
  likelyPriorLaneIds: TinaFilingLaneId[];
  alternateLaneIds: TinaFilingLaneId[];
  summary: string;
  nextStep: string;
  priorityQuestions: string[];
  remediationStepsFirst: string[];
  blockedIssueCount: number;
  reviewIssueCount: number;
  signals: TinaEntityFilingRemediationSignal[];
  issues: TinaEntityFilingRemediationIssue[];
  actions: TinaEntityFilingRemediationReturnAction[];
  relatedFactIds: string[];
  relatedDocumentIds: string[];
}

export interface TinaFederalReturnRequirementItem {
  id: string;
  title: string;
  status: "ready" | "needs_attention" | "blocked";
  summary: string;
  requiredForms: string[];
  requiredRecords: string[];
  reviewerQuestions: string[];
}

export interface TinaFederalReturnRequirementsSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  laneId: TinaFilingLaneId;
  returnFamily: string;
  canTinaFinishLane: boolean;
  summary: string;
  nextStep: string;
  items: TinaFederalReturnRequirementItem[];
}

export interface TinaFederalReturnClassificationSignal {
  id: string;
  title: string;
  summary: string;
  strength: "strong" | "moderate" | "weak";
  relatedFactIds: string[];
  relatedDocumentIds: string[];
}

export interface TinaFederalReturnClassificationIssue {
  id: string;
  title: string;
  summary: string;
  severity: "blocking" | "needs_attention";
  relatedFactIds: string[];
  relatedDocumentIds: string[];
}

export interface TinaFederalReturnClassificationSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  laneId: TinaFilingLaneId;
  returnFamily: string;
  route: TinaStartPathAssessment["route"];
  confidence: "high" | "medium" | "low" | "blocked";
  summary: string;
  nextStep: string;
  signals: TinaFederalReturnClassificationSignal[];
  issues: TinaFederalReturnClassificationIssue[];
}

export type TinaOwnershipCapitalEventType =
  | "opening_ownership"
  | "closing_ownership"
  | "ownership_change"
  | "buyout_redemption"
  | "former_owner_payment"
  | "community_property_exception"
  | "capital_economics_question";

export interface TinaOwnershipCapitalEvent {
  id: string;
  title: string;
  summary: string;
  eventType: TinaOwnershipCapitalEventType;
  status: "known" | "needs_review" | "blocked";
  relatedFactIds: string[];
  relatedDocumentIds: string[];
}

export interface TinaOwnershipCapitalEventsSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  overallStatus: "clear" | "review_required" | "blocked";
  likelyOwnerCount: number | null;
  eventCount: number;
  blockedEventCount: number;
  summary: string;
  nextStep: string;
  events: TinaOwnershipCapitalEvent[];
}

export interface TinaBooksNormalizationIssue {
  id: string;
  title: string;
  summary: string;
  severity: "blocking" | "needs_attention" | "watch";
  sourceLabels: string[];
  factIds: string[];
  documentIds: string[];
}

export interface TinaBooksNormalizationSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  summary: string;
  nextStep: string;
  issues: TinaBooksNormalizationIssue[];
}

export type TinaBooksReconstructionSourceMode =
  | "quickbooks_live"
  | "uploaded_books"
  | "thin_records";

export type TinaBooksReconstructionAreaId =
  | "income"
  | "core_expenses"
  | "owner_flows"
  | "worker_payments"
  | "fixed_assets"
  | "inventory_cogs"
  | "entity_boundary";

export interface TinaBooksReconstructionArea {
  id: TinaBooksReconstructionAreaId;
  title: string;
  status: "ready" | "needs_review" | "blocked";
  summary: string;
  relatedIssueIds: string[];
  relatedFactIds: string[];
  relatedDocumentIds: string[];
}

export interface TinaBooksReconstructionSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  overallStatus: "reconstructed" | "partial" | "blocked";
  sourceMode: TinaBooksReconstructionSourceMode;
  summary: string;
  nextStep: string;
  areas: TinaBooksReconstructionArea[];
}

export type TinaEvidenceSufficiencyLevel = "strong" | "moderate" | "weak" | "missing";

export interface TinaEvidenceSufficiencyLine {
  id: string;
  lineNumber: string;
  label: string;
  amount: number | null;
  level: TinaEvidenceSufficiencyLevel;
  summary: string;
  relatedFactIds: string[];
  relatedDocumentIds: string[];
}

export interface TinaEvidenceSufficiencyIssue {
  id: string;
  title: string;
  summary: string;
  severity: "blocking" | "needs_attention";
  relatedFactIds: string[];
  relatedDocumentIds: string[];
}

export interface TinaEvidenceSufficiencySnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  overallStatus: "reviewer_grade" | "provisional" | "blocked";
  summary: string;
  nextStep: string;
  counts: Record<TinaEvidenceSufficiencyLevel, number>;
  lines: TinaEvidenceSufficiencyLine[];
  issues: TinaEvidenceSufficiencyIssue[];
}

export type TinaMaterialityLevel = "high" | "medium" | "low";

export interface TinaTaxTreatmentPolicyDecision {
  id: string;
  title: string;
  policyArea: string;
  status: "cleared" | "review_required" | "blocked";
  materiality: TinaMaterialityLevel;
  summary: string;
  recommendedBucket: TinaTaxPositionBucket;
  nextStep: string;
  requiredProof: string[];
  alternativeTreatments: string[];
  cleanupDependency: TinaTreatmentCleanupDependency;
  federalStateSensitivity: TinaTreatmentFederalStateSensitivity;
  commercialPriority: TinaTreatmentCommercialPriority;
  authorityWorkIdeaIds: string[];
  relatedJudgmentIds: string[];
  relatedFactIds: string[];
  relatedDocumentIds: string[];
}

export interface TinaTaxTreatmentPolicySnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  overallStatus: "cleared" | "review_required" | "blocked";
  summary: string;
  nextStep: string;
  decisions: TinaTaxTreatmentPolicyDecision[];
}

export interface TinaMaterialityPriorityItem {
  id: string;
  title: string;
  source: "start_path" | "treatment_policy" | "evidence" | "books" | "package" | "form";
  priority: "immediate" | "next" | "monitor";
  materiality: TinaMaterialityLevel;
  summary: string;
  relatedFactIds: string[];
  relatedDocumentIds: string[];
}

export interface TinaMaterialityPrioritySnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  overallStatus: "immediate_action" | "review_queue" | "monitor_only";
  summary: string;
  nextStep: string;
  items: TinaMaterialityPriorityItem[];
}

export type TinaIndustryPlaybookId =
  | "general_small_business"
  | "professional_services"
  | "skilled_trades"
  | "e_commerce_retail"
  | "real_estate"
  | "food_service"
  | "creator_media";

export interface TinaIndustryPlaybookItem {
  id: TinaIndustryPlaybookId;
  title: string;
  fit: "primary" | "secondary" | "possible";
  summary: string;
  characteristicSignals: string[];
  keyRisks: string[];
  likelyOpportunities: string[];
  requiredRecords: string[];
  relatedFactIds: string[];
  relatedDocumentIds: string[];
}

export interface TinaIndustryPlaybookSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  primaryIndustryId: TinaIndustryPlaybookId | null;
  summary: string;
  nextStep: string;
  items: TinaIndustryPlaybookItem[];
}

export type TinaTaxOpportunityStatus =
  | "ready_to_pursue"
  | "needs_authority"
  | "needs_facts"
  | "review_only"
  | "reject";

export type TinaTaxOpportunityImpact = "high" | "medium" | "low";

export interface TinaTaxOpportunityItem {
  id: string;
  title: string;
  status: TinaTaxOpportunityStatus;
  impact: TinaTaxOpportunityImpact;
  reviewerBurden: "light" | "moderate" | "heavy";
  summary: string;
  whyItMatters: string;
  recommendedAction: string;
  authorityState: string;
  disclosureFlag: string;
  relatedIndustryIds: TinaIndustryPlaybookId[];
  sourceLabels: string[];
  relatedFactIds: string[];
  relatedDocumentIds: string[];
}

export interface TinaTaxOpportunitySnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  overallStatus: "strong_queue" | "mixed_queue" | "thin_queue";
  summary: string;
  nextStep: string;
  items: TinaTaxOpportunityItem[];
}

export interface TinaCompanionFormPlanItem {
  id: string;
  formId: TinaOfficialFederalFormId | null;
  title: string;
  role: TinaOfficialFederalFormRole;
  status: "required_ready" | "required_needs_review" | "required_blocked" | "optional_watch";
  fillMode: "structured_supported" | "blank_form_only" | "future_lane" | "not_applicable";
  summary: string;
  relatedLineNumbers: string[];
  relatedDocumentIds: string[];
}

export interface TinaCompanionFormPlanSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  laneId: TinaFilingLaneId;
  returnFamily: string;
  summary: string;
  nextStep: string;
  items: TinaCompanionFormPlanItem[];
}

export interface TinaCrossFormConsistencyIssue {
  id: string;
  title: string;
  summary: string;
  severity: "blocking" | "needs_attention";
  category: "lane" | "attachment" | "evidence" | "form_plan" | "package_state";
  relatedLineNumbers: string[];
  relatedFactIds: string[];
  relatedDocumentIds: string[];
}

export interface TinaCrossFormConsistencySnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  overallStatus: "aligned" | "review_required" | "blocked";
  summary: string;
  nextStep: string;
  issues: TinaCrossFormConsistencyIssue[];
}

export interface TinaOfficialFormFillPlacement {
  id: string;
  formId: TinaOfficialFederalFormId;
  pageNumber: number;
  fieldKey: string;
  label: string;
  value: string;
  pdfFieldName: string | null;
  x: number;
  y: number;
  fontSize: number;
  status: "ready" | "needs_review" | "blocked";
  evidenceSupportLevel: TinaEvidenceSufficiencyLevel;
  relatedLineNumbers: string[];
  relatedDocumentIds: string[];
}

export interface TinaOfficialFormFillSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  formId: TinaOfficialFederalFormId | null;
  templateTitle: string | null;
  overallStatus: "ready" | "needs_review" | "blocked";
  mode: "overlay_plan" | "direct_field_plan" | "blocked_route";
  summary: string;
  nextStep: string;
  placements: TinaOfficialFormFillPlacement[];
  blockedReasons: string[];
}

export type TinaAttachmentStatementStatus = "ready" | "needs_review" | "blocked";
export type TinaAttachmentStatementCategory =
  | "other_expense_detail"
  | "depreciation_support"
  | "home_office_support"
  | "inventory_support"
  | "owner_flow_explanation";

export interface TinaAttachmentStatementItem {
  id: string;
  title: string;
  category: TinaAttachmentStatementCategory;
  formId: TinaOfficialFederalFormId | null;
  status: TinaAttachmentStatementStatus;
  summary: string;
  statement: string;
  relatedLineNumbers: string[];
  relatedDocumentIds: string[];
}

export interface TinaAttachmentStatementSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  overallStatus: "ready" | "needs_review" | "blocked";
  summary: string;
  nextStep: string;
  items: TinaAttachmentStatementItem[];
}

export interface TinaDecisionBriefing {
  audience: "reviewer" | "owner";
  headline: string;
  summary: string;
  keyPoints: string[];
  openQuestions: string[];
  recommendedActions: string[];
}

export interface TinaDecisionBriefingSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  reviewer: TinaDecisionBriefing;
  owner: TinaDecisionBriefing;
}

export type TinaTaxPlanningMemoPriority = "now" | "soon" | "later";

export interface TinaTaxPlanningMemoItem {
  id: string;
  title: string;
  priority: TinaTaxPlanningMemoPriority;
  status: TinaTaxOpportunityStatus;
  impact: TinaTaxOpportunityImpact;
  summary: string;
  whyNow: string;
  reviewerAction: string;
  ownerAction: string;
  documentationNeeds: string[];
  relatedIndustryIds: TinaIndustryPlaybookId[];
  relatedDocumentIds: string[];
}

export interface TinaTaxPlanningMemoSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  overallStatus: "actionable" | "mixed" | "thin";
  summary: string;
  nextStep: string;
  items: TinaTaxPlanningMemoItem[];
}

export interface TinaReviewBundleFile {
  id: string;
  fileName: string;
  mimeType: string;
  encoding: "utf8" | "base64";
  contents: string;
}

export interface TinaReviewBundleExport {
  builtAt: string;
  businessName: string;
  taxYear: string;
  packageState: TinaPackageState;
  sourceMode: "live_draft" | "immutable_snapshot";
  snapshotId: string | null;
  summary: string;
  nextStep: string;
  files: TinaReviewBundleFile[];
}

export type TinaFormReadinessLevel = "not_ready" | "provisional" | "reviewer_ready";

export interface TinaFormReadinessReason {
  id: string;
  title: string;
  summary: string;
  severity: "blocking" | "needs_attention";
}

export interface TinaFormReadinessSnapshot {
  lastBuiltAt: string | null;
  level: TinaFormReadinessLevel;
  summary: string;
  nextStep: string;
  reasons: TinaFormReadinessReason[];
}

export type TinaOfficialFederalFormId =
  | "f1040"
  | "f1040sc"
  | "f1040sse"
  | "f1065"
  | "f1120s"
  | "f1120"
  | "f8829"
  | "f4562";

export type TinaOfficialFederalFormRole =
  | "primary_return"
  | "companion_schedule"
  | "attachment";

export type TinaOfficialFederalFormSupport =
  | "blank_stored"
  | "planned_fill"
  | "not_supported";

export interface TinaOfficialFederalFormTemplate {
  id: TinaOfficialFederalFormId;
  taxYear: string;
  formNumber: string;
  title: string;
  role: TinaOfficialFederalFormRole;
  support: TinaOfficialFederalFormSupport;
  irsUrl: string;
  fileName: string;
  localAssetPath: string;
  sha256: string;
  byteLength: number;
  laneIds: TinaFilingLaneId[];
  summary: string;
}

export interface TinaOfficialFederalFormTemplateSnapshot {
  lastBuiltAt: string | null;
  taxYear: string;
  laneId: TinaFilingLaneId;
  summary: string;
  nextStep: string;
  primaryTemplateId: TinaOfficialFederalFormId | null;
  templates: TinaOfficialFederalFormTemplate[];
  storedBlankTemplateIds: TinaOfficialFederalFormId[];
}

export type TinaScheduleCPdfRenderMode =
  | "tina_schedule_c_draft"
  | "blocked_route_notice";
