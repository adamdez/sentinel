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
  | "partnership"
  | "multi_member_llc"
  | "unsure";

export type TinaAccountingMethod = "cash" | "accrual" | "unsure";

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
  entityType: TinaEntityType;
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
