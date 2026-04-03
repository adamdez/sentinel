import type {
  TinaFilingLaneId,
  TinaIndustryPlaybookId,
  TinaMaterialityLevel,
  TinaOfficialFederalFormId,
  TinaTaxPositionBucket,
} from "@/tina/types";

export type TinaBooksReconciliationStatus = "reconciled" | "needs_review" | "blocked";

export interface TinaBooksReconciliationCheck {
  id: string;
  title: string;
  status: TinaBooksReconciliationStatus;
  summary: string;
  leftLabel: string;
  leftAmount: number | null;
  rightLabel: string;
  rightAmount: number | null;
  delta: number | null;
  relatedLineNumbers: string[];
  relatedDocumentIds: string[];
}

export interface TinaBooksReconciliationSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  overallStatus: TinaBooksReconciliationStatus;
  sourceMode: "quickbooks_live" | "uploaded_books" | "thin_records";
  summary: string;
  nextStep: string;
  checks: TinaBooksReconciliationCheck[];
}

export type TinaCompanionFormCalculationStatus =
  | "ready"
  | "needs_review"
  | "blocked"
  | "not_applicable";

export interface TinaCompanionFormCalculationValue {
  label: string;
  amount: number | null;
}

export interface TinaCompanionFormCalculationItem {
  id: string;
  formId: TinaOfficialFederalFormId | null;
  title: string;
  status: TinaCompanionFormCalculationStatus;
  summary: string;
  estimatedValues: TinaCompanionFormCalculationValue[];
  requiredRecords: string[];
  relatedLineNumbers: string[];
  relatedDocumentIds: string[];
}

export interface TinaCompanionFormCalculationsSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  overallStatus: "ready" | "needs_review" | "blocked";
  summary: string;
  nextStep: string;
  items: TinaCompanionFormCalculationItem[];
}

export type TinaIndustryEvidenceCoverageStatus = "covered" | "partial" | "missing";

export interface TinaIndustryEvidenceRequirement {
  id: string;
  playbookId: TinaIndustryPlaybookId;
  playbookTitle: string;
  requirement: string;
  status: TinaIndustryEvidenceCoverageStatus;
  materiality: TinaMaterialityLevel;
  summary: string;
  matchedDocumentIds: string[];
  matchedFactIds: string[];
}

export interface TinaIndustryEvidenceMatrixSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  primaryIndustryId: TinaIndustryPlaybookId | null;
  overallStatus: "covered" | "partial" | "missing";
  summary: string;
  nextStep: string;
  items: TinaIndustryEvidenceRequirement[];
}

export type TinaDocumentRequestPlanPriority = "immediate" | "next" | "later";
export type TinaDocumentRequestPlanAudience = "owner" | "reviewer";
export type TinaDocumentRequestPlanCategory =
  | "ownership"
  | "books"
  | "forms"
  | "industry"
  | "evidence"
  | "entity"
  | "economics"
  | "authority";

export interface TinaDocumentRequestPlanItem {
  id: string;
  audience: TinaDocumentRequestPlanAudience;
  category: TinaDocumentRequestPlanCategory;
  priority: TinaDocumentRequestPlanPriority;
  title: string;
  summary: string;
  request: string;
  whyItMatters: string;
  relatedFactIds: string[];
  relatedDocumentIds: string[];
}

export interface TinaDocumentRequestPlanSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  overallStatus: "clear" | "action_queue" | "blocked";
  summary: string;
  nextStep: string;
  items: TinaDocumentRequestPlanItem[];
}

export type TinaEntityRecordCoverageStatus = "covered" | "partial" | "missing";
export type TinaEntityRecordCriticality = "critical" | "important" | "supporting";

export interface TinaEntityRecordRequirement {
  id: string;
  laneId: TinaFilingLaneId;
  returnFamily: string;
  title: string;
  summary: string;
  status: TinaEntityRecordCoverageStatus;
  criticality: TinaEntityRecordCriticality;
  requiredForms: string[];
  matchedDocumentIds: string[];
  matchedFactIds: string[];
}

export interface TinaEntityRecordMatrixSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  laneId: TinaFilingLaneId;
  returnFamily: string;
  overallStatus: "covered" | "partial" | "missing";
  missingCriticalCount: number;
  summary: string;
  nextStep: string;
  items: TinaEntityRecordRequirement[];
}

export type TinaEntityEconomicsCheckStatus =
  | "clear"
  | "needs_review"
  | "blocked"
  | "not_applicable";

export interface TinaEntityEconomicsCheck {
  id: string;
  title: string;
  status: TinaEntityEconomicsCheckStatus;
  summary: string;
  whyItMatters: string;
  relatedRecordIds: string[];
  relatedDocumentIds: string[];
  relatedFactIds: string[];
}

export interface TinaEntityEconomicsReadinessSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  laneId: TinaFilingLaneId;
  returnFamily: string;
  overallStatus: "clear" | "review_required" | "blocked";
  summary: string;
  nextStep: string;
  checks: TinaEntityEconomicsCheck[];
}

export type TinaEntityReturnRunbookStepStatus =
  | "ready"
  | "needs_review"
  | "blocked"
  | "not_applicable";
export type TinaEntityReturnRunbookAudience = "owner" | "reviewer" | "tina";

export interface TinaEntityReturnRunbookStep {
  id: string;
  title: string;
  audience: TinaEntityReturnRunbookAudience;
  status: TinaEntityReturnRunbookStepStatus;
  summary: string;
  deliverable: string;
  relatedRecordIds: string[];
  relatedCheckIds: string[];
}

export interface TinaEntityReturnRunbookSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  laneId: TinaFilingLaneId;
  returnFamily: string;
  executionMode: "tina_supported" | "reviewer_controlled" | "future_lane" | "blocked";
  overallStatus: "ready" | "review_required" | "blocked";
  summary: string;
  nextStep: string;
  steps: TinaEntityReturnRunbookStep[];
}

export type TinaAuthorityPositionSourceType =
  | "tax_opportunity"
  | "treatment_judgment"
  | "appendix_item";
export type TinaAuthorityPositionRecommendation =
  | "use_now"
  | "review_first"
  | "appendix_only"
  | "hold_for_authority"
  | "hold_for_facts"
  | "reject";
export type TinaAuthorityPositionAuthorityStrength =
  | "reviewer_backed"
  | "trail_supported"
  | "thin"
  | "missing";
export type TinaAuthorityPositionFactStrength = "strong" | "moderate" | "thin" | "missing";
export type TinaAuthorityPositionDisclosureReadiness =
  | "clear"
  | "needs_review"
  | "required"
  | "not_applicable";

export interface TinaAuthorityPositionMatrixItem {
  id: string;
  sourceType: TinaAuthorityPositionSourceType;
  title: string;
  recommendedBucket: TinaTaxPositionBucket;
  recommendation: TinaAuthorityPositionRecommendation;
  authorityStrength: TinaAuthorityPositionAuthorityStrength;
  factStrength: TinaAuthorityPositionFactStrength;
  disclosureReadiness: TinaAuthorityPositionDisclosureReadiness;
  priority: TinaDocumentRequestPlanPriority;
  summary: string;
  whyItMatters: string;
  reviewerAction: string;
  ownerAction: string;
  relatedFactIds: string[];
  relatedDocumentIds: string[];
  relatedAuthorityWorkIdeaIds: string[];
}

export interface TinaAuthorityPositionMatrixSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  overallStatus: "actionable" | "mixed" | "thin";
  summary: string;
  nextStep: string;
  items: TinaAuthorityPositionMatrixItem[];
}

export type TinaDisclosureReadinessStatus =
  | "clear"
  | "needs_review"
  | "required"
  | "not_applicable";

export interface TinaDisclosureReadinessItem {
  id: string;
  title: string;
  status: TinaDisclosureReadinessStatus;
  summary: string;
  whyItMatters: string;
  requiredAction: string;
  relatedPositionIds: string[];
  relatedDocumentIds: string[];
}

export interface TinaDisclosureReadinessSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  overallStatus: "clear" | "needs_review" | "required";
  summary: string;
  nextStep: string;
  items: TinaDisclosureReadinessItem[];
}

export type TinaReviewerAcceptanceForecastStatus =
  | "likely_accept"
  | "likely_pushback"
  | "likely_reject";

export interface TinaReviewerAcceptanceForecastItem {
  id: string;
  title: string;
  status: TinaReviewerAcceptanceForecastStatus;
  summary: string;
  whyItMatters: string;
  relatedPositionIds: string[];
  relatedChallengeIds: string[];
  relatedDocumentIds: string[];
}

export interface TinaReviewerAcceptanceForecastSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  overallStatus: "high_confidence" | "mixed" | "low_confidence";
  summary: string;
  nextStep: string;
  items: TinaReviewerAcceptanceForecastItem[];
}

export type TinaAccountingArtifactCoverageStatus = "covered" | "partial" | "missing";
export type TinaAccountingArtifactCriticality = "critical" | "important" | "supporting";

export interface TinaAccountingArtifactCoverageItem {
  id: string;
  title: string;
  status: TinaAccountingArtifactCoverageStatus;
  criticality: TinaAccountingArtifactCriticality;
  summary: string;
  request: string;
  matchedDocumentIds: string[];
  matchedFactIds: string[];
  relatedAreaIds: string[];
}

export interface TinaAccountingArtifactCoverageSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  sourceMode: "quickbooks_live" | "uploaded_books" | "thin_records";
  overallStatus: "covered" | "partial" | "missing";
  summary: string;
  nextStep: string;
  items: TinaAccountingArtifactCoverageItem[];
}

export type TinaAttachmentScheduleSupportLevel = "supported" | "derived" | "missing";

export interface TinaAttachmentScheduleRow {
  id: string;
  label: string;
  value: string;
  amount: number | null;
  supportLevel: TinaAttachmentScheduleSupportLevel;
  summary: string;
  relatedDocumentIds: string[];
}

export interface TinaAttachmentScheduleItem {
  id: string;
  title: string;
  category:
    | "other_expense_detail"
    | "depreciation_support"
    | "home_office_support"
    | "inventory_support"
    | "owner_flow_explanation";
  formId: TinaOfficialFederalFormId | null;
  status: "ready" | "needs_review" | "blocked";
  summary: string;
  columnLabels: string[];
  rows: TinaAttachmentScheduleRow[];
  relatedLineNumbers: string[];
  relatedDocumentIds: string[];
}

export interface TinaAttachmentScheduleSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  overallStatus: "ready" | "needs_review" | "blocked";
  summary: string;
  nextStep: string;
  items: TinaAttachmentScheduleItem[];
}

export type TinaOfficialFormExecutionStatus = "ready_to_fill" | "review_required" | "blocked";

export interface TinaOfficialFormExecutionItem {
  id: string;
  formId: TinaOfficialFederalFormId | null;
  title: string;
  role: "primary_return" | "companion_schedule" | "attachment";
  status: TinaOfficialFormExecutionStatus;
  fillMode: "overlay_ready" | "blank_only" | "future_lane";
  summary: string;
  templateReady: boolean;
  placementCount: number;
  readyPlacementCount: number;
  reviewPlacementCount: number;
  blockedPlacementCount: number;
  scheduleCount: number;
  calculationStatus: string | null;
  relatedLineNumbers: string[];
  relatedDocumentIds: string[];
}

export interface TinaOfficialFormExecutionSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  laneId: TinaFilingLaneId;
  overallStatus: TinaOfficialFormExecutionStatus;
  summary: string;
  nextStep: string;
  items: TinaOfficialFormExecutionItem[];
}

export type TinaPlanningActionBoardItemStatus = "advance" | "review" | "hold" | "reject";
export type TinaPlanningActionBoardPriority = "immediate" | "next" | "later";

export interface TinaPlanningActionBoardItem {
  id: string;
  title: string;
  status: TinaPlanningActionBoardItemStatus;
  priority: TinaPlanningActionBoardPriority;
  summary: string;
  whyNow: string;
  authorityStrength: TinaAuthorityPositionAuthorityStrength | "unknown";
  factStrength: TinaAuthorityPositionFactStrength | "unknown";
  disclosureReadiness: TinaAuthorityPositionDisclosureReadiness | "unknown";
  reviewerAcceptance: TinaReviewerAcceptanceForecastStatus | "unknown";
  reviewerAction: string;
  ownerAction: string;
  relatedPositionIds: string[];
  relatedDocumentIds: string[];
}

export interface TinaPlanningActionBoardSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  overallStatus: "actionable" | "mixed" | "thin";
  summary: string;
  nextStep: string;
  items: TinaPlanningActionBoardItem[];
}
