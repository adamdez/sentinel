import type {
  TinaFilingLaneId,
  TinaIndustryPlaybookId,
  TinaMaterialityLevel,
  TinaOfficialFederalFormId,
  TinaReviewerObservedDeltaDomain,
  TinaReviewerObservedDeltaKind,
  TinaReviewerObservedDeltaSeverity,
  TinaTaxPositionBucket,
} from "@/tina/types";

export type TinaBooksReconciliationStatus = "reconciled" | "needs_review" | "blocked";
export type TinaReconciliationVarianceKind =
  | "amount_mismatch"
  | "missing_support"
  | "classification_overlap"
  | "entity_contamination";

export interface TinaBooksReconciliationCheck {
  id: string;
  title: string;
  status: TinaBooksReconciliationStatus;
  summary: string;
  supportSummary: string;
  varianceKind: TinaReconciliationVarianceKind | null;
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
  variances: TinaReconciliationVariance[];
  blockedCheckCount: number;
  reviewCheckCount: number;
  materialVarianceCount: number;
  unsupportedBalanceCount: number;
}

export type TinaLedgerTransactionGroupStatus =
  | "reconstructed"
  | "partial"
  | "blocked"
  | "not_applicable";
export type TinaLedgerTransactionGroupCategory =
  | "income"
  | "owner_flow"
  | "payroll"
  | "contractors"
  | "inventory"
  | "fixed_assets"
  | "related_party"
  | "taxes"
  | "mixed_use"
  | "other";
export type TinaLedgerTransactionGroupSupportLevel = "strong" | "moderate" | "weak" | "missing";
export type TinaLedgerSupportChannelKind =
  | "bank_statements"
  | "card_statements"
  | "books_summary"
  | "general_ledger"
  | "payroll_reports"
  | "contractor_support"
  | "inventory_records"
  | "asset_records"
  | "ownership_records"
  | "prior_return"
  | "narrative_only";
export type TinaLedgerSupportChannelStatus = "structured" | "narrative_only" | "missing";
export type TinaLedgerIndependenceStatus = "independent" | "mixed" | "concentrated";
export type TinaLedgerContaminationRisk = "low" | "watch" | "high";

export interface TinaLedgerSupportChannel {
  id: string;
  kind: TinaLedgerSupportChannelKind;
  status: TinaLedgerSupportChannelStatus;
  summary: string;
  relatedDocumentIds: string[];
  relatedFactIds: string[];
}

export interface TinaLedgerArtifactNeed {
  id: string;
  title: string;
  status: "covered" | "partial" | "missing";
  criticality: "critical" | "important";
}

export interface TinaLedgerTransactionGroup {
  id: string;
  title: string;
  category: TinaLedgerTransactionGroupCategory;
  status: TinaLedgerTransactionGroupStatus;
  supportLevel: TinaLedgerTransactionGroupSupportLevel;
  independenceStatus: TinaLedgerIndependenceStatus;
  contaminationRisk: TinaLedgerContaminationRisk;
  contradictionCount: number;
  estimatedAmount: number | null;
  documentCount: number;
  factCount: number;
  summary: string;
  supportChannels: TinaLedgerSupportChannel[];
  requiredArtifacts: TinaLedgerArtifactNeed[];
  relatedDocumentIds: string[];
  relatedFactIds: string[];
  relatedLineNumbers: string[];
}

export interface TinaLedgerReconstructionSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  sourceMode: "quickbooks_live" | "uploaded_books" | "thin_records";
  overallStatus: "reconstructed" | "partial" | "blocked";
  summary: string;
  nextStep: string;
  groups: TinaLedgerTransactionGroup[];
  blockedGroupCount: number;
  partialGroupCount: number;
  concentratedGroupCount: number;
  highContaminationGroupCount: number;
}

export type TinaReconciliationVarianceSeverity = "material" | "moderate" | "immaterial";

export interface TinaReconciliationVariance {
  id: string;
  title: string;
  kind: TinaReconciliationVarianceKind;
  severity: TinaReconciliationVarianceSeverity;
  amount: number | null;
  summary: string;
  relatedCheckIds: string[];
  relatedDocumentIds: string[];
  relatedLineNumbers: string[];
}

export type TinaEvidenceCredibilityFactorStatus = "strong" | "mixed" | "weak" | "blocked";
export type TinaEvidenceCredibilityDimension =
  | "source_quality"
  | "completeness"
  | "independence"
  | "contradiction"
  | "ledger_integrity"
  | "reconciliation_quality";

export interface TinaEvidenceCredibilityFactor {
  id: string;
  title: string;
  dimension: TinaEvidenceCredibilityDimension;
  status: TinaEvidenceCredibilityFactorStatus;
  summary: string;
  signalCount: number;
  blockerCount: number;
  relatedDocumentIds: string[];
  relatedFactIds: string[];
}

export interface TinaEvidenceCredibilitySnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  overallStatus: "credible" | "mixed" | "thin" | "blocked";
  summary: string;
  nextStep: string;
  factors: TinaEvidenceCredibilityFactor[];
  blockingFactorCount: number;
  weakFactorCount: number;
  concentratedGroupCount: number;
  materialVarianceCount: number;
}

export type TinaUnknownPatternSignalCategory =
  | "route_conflict"
  | "entity_ambiguity"
  | "cross_year_drift"
  | "entity_continuity"
  | "entity_economics"
  | "messy_evidence"
  | "treatment_novelty"
  | "document_shape"
  | "document_intelligence";
export type TinaUnknownPatternSignalSeverity = "signal" | "review" | "blocking";
export type TinaUnknownPatternHypothesisStatus = "leading" | "plausible" | "fallback";
export type TinaUnknownPatternConfidence = "high" | "medium" | "low";

export interface TinaUnknownPatternSignal {
  id: string;
  title: string;
  category: TinaUnknownPatternSignalCategory;
  severity: TinaUnknownPatternSignalSeverity;
  summary: string;
  relatedLaneIds: TinaFilingLaneId[];
  relatedFactIds: string[];
  relatedDocumentIds: string[];
}

export interface TinaUnknownPatternHypothesis {
  id: string;
  title: string;
  laneId: TinaFilingLaneId;
  status: TinaUnknownPatternHypothesisStatus;
  confidence: TinaUnknownPatternConfidence;
  stabilityScore: number;
  summary: string;
  whyPlausible: string[];
  whatCouldDisprove: string[];
  requiredProof: string[];
  supportingSignalCount: number;
  contradictingSignalCount: number;
  recommendedFirstQuestion: string | null;
  relatedSignalIds: string[];
}

export interface TinaUnknownPatternEngineSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  overallStatus: "known_pattern" | "ambiguous_pattern" | "novel_pattern";
  recommendedHandling: "continue" | "reviewer_controlled" | "blocked_until_proved";
  summary: string;
  nextStep: string;
  leadingHypothesisId: string | null;
  signals: TinaUnknownPatternSignal[];
  hypotheses: TinaUnknownPatternHypothesis[];
  customProofRequests: string[];
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

export type TinaOwnerFlowBasisAdjudicationStatus =
  | "clear"
  | "needs_review"
  | "blocked"
  | "not_applicable";
export type TinaOwnerFlowBasisAdjudicationTopic =
  | "opening_basis"
  | "basis_rollforward_continuity"
  | "owner_flow_characterization"
  | "loan_vs_equity"
  | "distribution_taxability"
  | "ownership_change_allocation"
  | "buyout_redemption"
  | "debt_basis_overlap"
  | "asset_basis_overlap";
export type TinaOwnerFlowBasisSensitivity = "high" | "medium" | "low";
export type TinaOwnerFlowBasisRollupStatus =
  | "clear"
  | "review_required"
  | "blocked"
  | "not_applicable";

export interface TinaOwnerFlowBasisAdjudicationItem {
  id: string;
  title: string;
  topic: TinaOwnerFlowBasisAdjudicationTopic;
  status: TinaOwnerFlowBasisAdjudicationStatus;
  sensitivity: TinaOwnerFlowBasisSensitivity;
  summary: string;
  nextStep: string;
  likelyCharacterizations: string[];
  requiredProof: string[];
  relatedRecordIds: string[];
  relatedDocumentIds: string[];
  relatedFactIds: string[];
}

export interface TinaOwnerFlowBasisAdjudicationSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  laneId: TinaFilingLaneId;
  returnFamily: string;
  overallStatus: "clear" | "review_required" | "blocked";
  openingFootingStatus: TinaOwnerFlowBasisRollupStatus;
  basisRollforwardStatus: TinaOwnerFlowBasisRollupStatus;
  ownerFlowCharacterizationStatus: TinaOwnerFlowBasisRollupStatus;
  loanEquityStatus: TinaOwnerFlowBasisRollupStatus;
  distributionTaxabilityStatus: TinaOwnerFlowBasisRollupStatus;
  transitionEconomicsStatus: TinaOwnerFlowBasisRollupStatus;
  summary: string;
  nextStep: string;
  blockedItemCount: number;
  reviewItemCount: number;
  items: TinaOwnerFlowBasisAdjudicationItem[];
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

export type TinaPayrollComplianceStatus =
  | "supported"
  | "needs_review"
  | "blocked"
  | "not_applicable";
export type TinaPayrollCompliancePosture =
  | "no_payroll_detected"
  | "payroll_supported"
  | "payroll_with_compliance_gaps"
  | "s_corp_no_payroll"
  | "contractor_likely"
  | "mixed_worker_flows"
  | "reviewer_controlled";
export type TinaPayrollSupportStatus =
  | "supported"
  | "partial"
  | "missing"
  | "not_applicable";
export type TinaPayrollWorkerClassification =
  | "none"
  | "payroll_only"
  | "contractor_only"
  | "mixed"
  | "unclear";
export type TinaPayrollComplianceChannelKind =
  | "payroll_reports"
  | "quarterly_filings"
  | "annual_wage_forms"
  | "deposit_trail"
  | "bank_activity"
  | "general_ledger"
  | "contractor_support"
  | "owner_comp_support"
  | "narrative_only";
export type TinaPayrollComplianceChannelStatus =
  | "structured"
  | "narrative_only"
  | "missing";

export interface TinaPayrollComplianceChannel {
  id: string;
  kind: TinaPayrollComplianceChannelKind;
  status: TinaPayrollComplianceChannelStatus;
  summary: string;
  relatedDocumentIds: string[];
  relatedFactIds: string[];
}

export interface TinaPayrollComplianceIssue {
  id: string;
  title: string;
  status: "needs_review" | "blocked";
  summary: string;
  likelyImpact: string;
  relatedDocumentIds: string[];
  relatedFactIds: string[];
}

export interface TinaPayrollComplianceSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  overallStatus: TinaPayrollComplianceStatus;
  posture: TinaPayrollCompliancePosture;
  summary: string;
  nextStep: string;
  workerClassification: TinaPayrollWorkerClassification;
  payrollOperationalStatus: TinaPayrollSupportStatus;
  quarterlyFilingStatus: TinaPayrollSupportStatus;
  annualWageFormStatus: TinaPayrollSupportStatus;
  depositTrailStatus: TinaPayrollSupportStatus;
  ownerCompensationStatus: TinaPayrollSupportStatus;
  payrollProviderSignal: boolean;
  manualPayrollSignal: boolean;
  blockedIssueCount: number;
  reviewIssueCount: number;
  likelyMissingFilings: string[];
  questions: string[];
  cleanupStepsFirst: string[];
  channels: TinaPayrollComplianceChannel[];
  issues: TinaPayrollComplianceIssue[];
  relatedDocumentIds: string[];
  relatedFactIds: string[];
}

export type TinaSingleOwnerCorporateRouteStatus =
  | "clear"
  | "review_required"
  | "blocked"
  | "not_applicable";
export type TinaSingleOwnerCorporateRoutePosture =
  | "not_applicable"
  | "single_owner_default_path"
  | "corporate_route_proved"
  | "corporate_route_conditional"
  | "corporate_behavior_without_route_proof"
  | "s_corp_no_payroll";
export type TinaSingleOwnerCorporateElectionProofStatus =
  | "not_applicable"
  | "proved"
  | "conditional"
  | "missing";
export type TinaSingleOwnerCorporatePayrollRequirementStatus =
  | "not_applicable"
  | "supported"
  | "review_required"
  | "missing";
export type TinaSingleOwnerCorporateOwnerServiceStatus =
  | "not_applicable"
  | "likely_active"
  | "unclear";

export interface TinaSingleOwnerCorporateRouteIssue {
  id: string;
  title: string;
  severity: "needs_review" | "blocking";
  summary: string;
  relatedDocumentIds: string[];
  relatedFactIds: string[];
}

export interface TinaSingleOwnerCorporateRouteSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  overallStatus: TinaSingleOwnerCorporateRouteStatus;
  posture: TinaSingleOwnerCorporateRoutePosture;
  electionProofStatus: TinaSingleOwnerCorporateElectionProofStatus;
  payrollRequirementStatus: TinaSingleOwnerCorporatePayrollRequirementStatus;
  ownerServiceStatus: TinaSingleOwnerCorporateOwnerServiceStatus;
  summary: string;
  nextStep: string;
  blockedIssueCount: number;
  reviewIssueCount: number;
  questions: string[];
  cleanupStepsFirst: string[];
  issues: TinaSingleOwnerCorporateRouteIssue[];
  relatedDocumentIds: string[];
  relatedFactIds: string[];
}

export type TinaSingleMemberEntityHistoryProofStatus =
  | "clear"
  | "review_required"
  | "blocked"
  | "not_applicable";
export type TinaSingleMemberEntityHistoryPosture =
  | "not_applicable"
  | "single_member_path_proved"
  | "single_member_path_conditional"
  | "spouse_exception_candidate"
  | "multi_owner_history_conflicted"
  | "transition_year_conflicted"
  | "books_not_caught_up"
  | "corporate_overlay_without_history";
export type TinaSingleMemberOwnerHistoryStatus =
  | "not_applicable"
  | "proved"
  | "conditional"
  | "conflicted"
  | "missing";
export type TinaSingleMemberSpouseExceptionStatus =
  | "not_applicable"
  | "proved"
  | "conditional"
  | "missing";
export type TinaSingleMemberPriorFilingAlignmentStatus =
  | "not_applicable"
  | "aligned"
  | "conditional"
  | "conflicted";
export type TinaSingleMemberTransitionYearStatus =
  | "not_applicable"
  | "proved"
  | "conditional"
  | "conflicted";
export type TinaSingleMemberBooksPostureStatus =
  | "not_applicable"
  | "aligned"
  | "conditional"
  | "not_caught_up"
  | "conflicted";

export interface TinaSingleMemberEntityHistoryIssue {
  id: string;
  title: string;
  severity: "needs_review" | "blocking";
  summary: string;
  relatedDocumentIds: string[];
  relatedFactIds: string[];
}

export interface TinaSingleMemberEntityHistorySnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  overallStatus: TinaSingleMemberEntityHistoryProofStatus;
  posture: TinaSingleMemberEntityHistoryPosture;
  ownerHistoryStatus: TinaSingleMemberOwnerHistoryStatus;
  spouseExceptionStatus: TinaSingleMemberSpouseExceptionStatus;
  priorFilingAlignmentStatus: TinaSingleMemberPriorFilingAlignmentStatus;
  transitionYearStatus: TinaSingleMemberTransitionYearStatus;
  booksPostureStatus: TinaSingleMemberBooksPostureStatus;
  summary: string;
  nextStep: string;
  blockedIssueCount: number;
  reviewIssueCount: number;
  questions: string[];
  cleanupStepsFirst: string[];
  issues: TinaSingleMemberEntityHistoryIssue[];
  relatedDocumentIds: string[];
  relatedFactIds: string[];
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
  fillMode:
    | "overlay_ready"
    | "rendered_preview"
    | "rendered_pdf_ready"
    | "annotated_pdf_ready"
    | "blank_only"
    | "future_lane";
  summary: string;
  templateReady: boolean;
  placementCount: number;
  readyPlacementCount: number;
  reviewPlacementCount: number;
  blockedPlacementCount: number;
  scheduleCount: number;
  calculationStatus: string | null;
  renderedArtifactCount: number;
  directPdfFieldCount: number;
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

export type TinaRenderedFormArtifactStatus = "ready" | "provisional" | "blocked";
export type TinaRenderedFormRenderMode =
  | "official_blank_fill_ready"
  | "official_blank_annotated_ready"
  | "official_overlay_preview"
  | "companion_preview"
  | "blocked";

export interface TinaRenderedFormFieldValue {
  id: string;
  fieldKey: string;
  label: string;
  value: string;
  amount: number | null;
  supportLevel: "supported" | "derived" | "missing";
  relatedLineNumbers: string[];
  relatedDocumentIds: string[];
}

export interface TinaRenderedFormArtifact {
  id: string;
  formId: TinaOfficialFederalFormId | null;
  title: string;
  status: TinaRenderedFormArtifactStatus;
  renderMode: TinaRenderedFormRenderMode;
  fileName: string;
  mimeType: string;
  templateReady: boolean;
  placementCount: number;
  renderedAt: string | null;
  renderedByteLength: number | null;
  renderedSha256: string | null;
  directPdfFieldCount: number;
  appendixFieldCount: number;
  appendixPageCount: number;
  downloadPath: string | null;
  summary: string;
  fieldValues: TinaRenderedFormFieldValue[];
  relatedLineNumbers: string[];
  relatedDocumentIds: string[];
}

export interface TinaRenderedFormBinaryArtifact {
  artifactId: string;
  formId: TinaOfficialFederalFormId | null;
  renderMode: Extract<
    TinaRenderedFormRenderMode,
    "official_blank_fill_ready" | "official_blank_annotated_ready"
  >;
  fileName: string;
  mimeType: string;
  renderedAt: string;
  byteLength: number;
  sha256: string;
  appendixPageCount: number;
  bytes: Uint8Array;
}

export interface TinaCompanionFormRenderPlanItem {
  id: string;
  formId: TinaOfficialFederalFormId | null;
  title: string;
  status: TinaOfficialFormExecutionStatus;
  templateReady: boolean;
  summary: string;
  fieldValues: TinaRenderedFormFieldValue[];
  requiredAttachmentCategories: string[];
  relatedLineNumbers: string[];
  relatedDocumentIds: string[];
}

export interface TinaCompanionFormRenderPlanSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  overallStatus: TinaOfficialFormExecutionStatus;
  summary: string;
  nextStep: string;
  items: TinaCompanionFormRenderPlanItem[];
}

export interface TinaAttachmentArtifact {
  id: string;
  sourceId: string;
  title: string;
  category:
    | "other_expense_detail"
    | "depreciation_support"
    | "home_office_support"
    | "inventory_support"
    | "owner_flow_explanation";
  status: "ready" | "needs_review" | "blocked";
  fileName: string;
  mimeType: string;
  summary: string;
  relatedLineNumbers: string[];
  relatedDocumentIds: string[];
}

export interface TinaDisclosureArtifact {
  id: string;
  title: string;
  status: "clear" | "needs_review" | "required";
  fileName: string | null;
  summary: string;
  relatedPositionIds: string[];
  relatedDocumentIds: string[];
}

export interface TinaReturnPackageArtifactSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  overallStatus: "ready" | "provisional" | "blocked";
  summary: string;
  nextStep: string;
  renderedForms: TinaRenderedFormArtifact[];
  attachments: TinaAttachmentArtifact[];
  disclosures: TinaDisclosureArtifact[];
  entityPackageItems: TinaEntityReturnPackageItem[];
  entitySupportArtifacts: TinaEntityReturnSupportArtifact[];
  entityScheduleFamilyArtifacts: TinaEntityReturnScheduleFamilyArtifact[];
  entityScheduleFamilyPayloadArtifacts: TinaEntityReturnScheduleFamilyPayloadArtifact[];
  entityScheduleFamilyFinalizationArtifacts: TinaEntityReturnScheduleFamilyFinalizationArtifact[];
}

export type TinaEntityEconomicsProofStatus = "proved" | "partial" | "missing";

export interface TinaEntityEconomicsProof {
  id: string;
  title: string;
  status: TinaEntityEconomicsProofStatus;
  summary: string;
  relatedCheckIds: string[];
  relatedRecordIds: string[];
  relatedDocumentIds: string[];
}

export interface TinaReturnFamilyAssembly {
  laneId: TinaFilingLaneId;
  returnFamily: string;
  status: "ready" | "review_required" | "blocked";
  primaryFormId: TinaOfficialFederalFormId | null;
  companionFormIds: TinaOfficialFederalFormId[];
  attachmentFormIds: TinaOfficialFederalFormId[];
  requiredRecordIds: string[];
  blockedReasonIds: string[];
  summary: string;
}

export interface TinaEntityLaneExecutionSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  laneId: TinaFilingLaneId;
  executionMode: "tina_supported" | "reviewer_controlled" | "future_lane" | "blocked";
  overallStatus: "ready" | "review_required" | "blocked";
  summary: string;
  nextStep: string;
  assembly: TinaReturnFamilyAssembly;
  economicsProofs: TinaEntityEconomicsProof[];
}

export type TinaEntityReturnPackageItemKind =
  | "primary_return"
  | "companion_schedule"
  | "attachment"
  | "supporting_workpaper";
export type TinaEntityReturnPackageItemStatus = "ready" | "review_required" | "blocked";
export type TinaEntityReturnPackageExecutionOwner = "tina" | "reviewer";

export interface TinaEntityReturnPackageItem {
  id: string;
  title: string;
  kind: TinaEntityReturnPackageItemKind;
  formId: TinaOfficialFederalFormId | null;
  status: TinaEntityReturnPackageItemStatus;
  executionOwner: TinaEntityReturnPackageExecutionOwner;
  templateReady: boolean;
  deliverable: string;
  summary: string;
  requiredRecordIds: string[];
  requiredCheckIds: string[];
  requiredRecords: string[];
  reviewerQuestions: string[];
  relatedDocumentIds: string[];
}

export interface TinaEntityReturnPackagePlanSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  laneId: TinaFilingLaneId;
  returnFamily: string;
  executionMode: "tina_supported" | "reviewer_controlled" | "future_lane" | "blocked";
  overallStatus: TinaEntityReturnPackageItemStatus;
  summary: string;
  nextStep: string;
  items: TinaEntityReturnPackageItem[];
}

export type TinaEntityReturnCalculationStatus = "ready" | "needs_review" | "blocked";
export type TinaEntityReturnCalculationFieldSupportLevel = "supported" | "derived" | "missing";

export interface TinaEntityReturnCalculationField {
  id: string;
  fieldKey: string;
  label: string;
  value: string;
  amount: number | null;
  supportLevel: TinaEntityReturnCalculationFieldSupportLevel;
  relatedRecordIds: string[];
  relatedCheckIds: string[];
  relatedDocumentIds: string[];
}

export interface TinaEntityReturnCalculationItem {
  id: string;
  formId: TinaOfficialFederalFormId | null;
  title: string;
  status: TinaEntityReturnCalculationStatus;
  summary: string;
  fields: TinaEntityReturnCalculationField[];
  reviewerQuestions: string[];
  relatedPackageItemIds: string[];
  relatedDocumentIds: string[];
}

export interface TinaEntityReturnCalculationsSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  laneId: TinaFilingLaneId;
  returnFamily: string;
  overallStatus: TinaEntityReturnCalculationStatus;
  summary: string;
  nextStep: string;
  items: TinaEntityReturnCalculationItem[];
}

export type TinaEntityReturnSupportArtifactKind =
  | "schedule_support"
  | "k1_package"
  | "capital_workpaper"
  | "balance_sheet_package"
  | "equity_workpaper"
  | "compensation_workpaper"
  | "supporting_workpaper";

export interface TinaEntityReturnSupportArtifact {
  id: string;
  laneId: TinaFilingLaneId;
  returnFamily: string;
  sourceCalculationItemId: string;
  title: string;
  kind: TinaEntityReturnSupportArtifactKind;
  status: TinaEntityReturnCalculationStatus;
  fileName: string;
  mimeType: string;
  deliverable: string;
  summary: string;
  fieldCount: number;
  supportedFieldCount: number;
  derivedFieldCount: number;
  missingFieldCount: number;
  fields: TinaEntityReturnCalculationField[];
  reviewerQuestions: string[];
  relatedPackageItemIds: string[];
  relatedDocumentIds: string[];
}

export interface TinaEntityReturnSupportArtifactsSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  laneId: TinaFilingLaneId;
  returnFamily: string;
  overallStatus: TinaEntityReturnCalculationStatus;
  summary: string;
  nextStep: string;
  items: TinaEntityReturnSupportArtifact[];
}

export type TinaEntityReturnScheduleFamilyArtifactKind =
  | "schedule_k_family"
  | "schedule_k1_family"
  | "schedule_l_family"
  | "schedule_m_family"
  | "capital_family"
  | "equity_family"
  | "partner_flow_family"
  | "shareholder_flow_family";

export interface TinaEntityReturnScheduleFamilyArtifact {
  id: string;
  laneId: TinaFilingLaneId;
  returnFamily: string;
  title: string;
  kind: TinaEntityReturnScheduleFamilyArtifactKind;
  status: TinaEntityReturnCalculationStatus;
  deliverable: string;
  summary: string;
  sourceCalculationItemIds: string[];
  sourceSupportArtifactIds: string[];
  fieldCount: number;
  supportedFieldCount: number;
  derivedFieldCount: number;
  missingFieldCount: number;
  fields: TinaEntityReturnCalculationField[];
  reviewerQuestions: string[];
  relatedPackageItemIds: string[];
  relatedDocumentIds: string[];
}

export interface TinaEntityReturnScheduleFamilySnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  laneId: TinaFilingLaneId;
  returnFamily: string;
  overallStatus: TinaEntityReturnCalculationStatus;
  summary: string;
  nextStep: string;
  items: TinaEntityReturnScheduleFamilyArtifact[];
}

export type TinaEntityReturnScheduleFamilyPayloadReadiness =
  | "payload_ready"
  | "reviewer_payload"
  | "blocked";

export interface TinaEntityReturnScheduleFamilyPayloadSection {
  id: string;
  title: string;
  status: TinaEntityReturnCalculationStatus;
  summary: string;
  fieldCount: number;
  supportedFieldCount: number;
  derivedFieldCount: number;
  missingFieldCount: number;
  fieldKeys: string[];
  fields: TinaEntityReturnCalculationField[];
  relatedDocumentIds: string[];
}

export interface TinaEntityReturnScheduleFamilyPayloadArtifact {
  id: string;
  laneId: TinaFilingLaneId;
  returnFamily: string;
  sourceScheduleFamilyArtifactId: string;
  title: string;
  kind: TinaEntityReturnScheduleFamilyArtifactKind;
  status: TinaEntityReturnCalculationStatus;
  fileName: string;
  mimeType: string;
  deliverable: string;
  summary: string;
  payloadReadiness: TinaEntityReturnScheduleFamilyPayloadReadiness;
  completionPercent: number;
  officialScheduleTargets: string[];
  sectionCount: number;
  readySectionCount: number;
  reviewSectionCount: number;
  blockedSectionCount: number;
  supportArtifactCount: number;
  sourceCalculationItemIds: string[];
  sourceSupportArtifactIds: string[];
  sections: TinaEntityReturnScheduleFamilyPayloadSection[];
  reviewerQuestions: string[];
  relatedPackageItemIds: string[];
  relatedDocumentIds: string[];
}

export interface TinaEntityReturnScheduleFamilyPayloadSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  laneId: TinaFilingLaneId;
  returnFamily: string;
  overallStatus: TinaEntityReturnCalculationStatus;
  summary: string;
  nextStep: string;
  items: TinaEntityReturnScheduleFamilyPayloadArtifact[];
}

export type TinaEntityReturnScheduleFamilyFinalizationReadiness =
  | "finalized_payload_ready"
  | "reviewer_finalization"
  | "blocked";

export interface TinaEntityReturnScheduleFamilyFinalizationLine {
  id: string;
  target: string;
  label: string;
  status: TinaEntityReturnCalculationStatus;
  summary: string;
  value: string;
  amount: number | null;
  supportLevel: TinaEntityReturnCalculationFieldSupportLevel;
  sourceFieldKeys: string[];
  relatedDocumentIds: string[];
}

export interface TinaEntityReturnScheduleFamilyFinalizationArtifact {
  id: string;
  laneId: TinaFilingLaneId;
  returnFamily: string;
  sourceScheduleFamilyPayloadArtifactId: string;
  title: string;
  kind: TinaEntityReturnScheduleFamilyArtifactKind;
  status: TinaEntityReturnCalculationStatus;
  fileName: string;
  mimeType: string;
  deliverable: string;
  summary: string;
  finalizationReadiness: TinaEntityReturnScheduleFamilyFinalizationReadiness;
  completionPercent: number;
  officialScheduleTargets: string[];
  lineCount: number;
  readyLineCount: number;
  reviewLineCount: number;
  blockedLineCount: number;
  sourceCalculationItemIds: string[];
  sourceSupportArtifactIds: string[];
  lineItems: TinaEntityReturnScheduleFamilyFinalizationLine[];
  reviewerQuestions: string[];
  relatedPackageItemIds: string[];
  relatedDocumentIds: string[];
}

export interface TinaEntityReturnScheduleFamilyFinalizationSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  laneId: TinaFilingLaneId;
  returnFamily: string;
  overallStatus: TinaEntityReturnCalculationStatus;
  summary: string;
  nextStep: string;
  items: TinaEntityReturnScheduleFamilyFinalizationArtifact[];
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

export type TinaConfidenceCalibrationDomain =
  | "route"
  | "evidence"
  | "treatment"
  | "planning"
  | "form_execution"
  | "review_acceptance";
export type TinaConfidenceCalibrationStatus = "calibrated" | "watch" | "overstated" | "blocked";
export type TinaConfidenceLevel = "high" | "medium" | "low";
export type TinaConfidenceDebtSeverity = "blocking" | "major" | "moderate";

export interface TinaConfidenceCalibrationCheck {
  id: string;
  title: string;
  domain: TinaConfidenceCalibrationDomain;
  status: TinaConfidenceCalibrationStatus;
  claimedConfidence: TinaConfidenceLevel;
  supportedConfidence: TinaConfidenceLevel;
  summary: string;
  nextStep: string;
  ownerEngines: string[];
  relatedFactIds: string[];
  relatedDocumentIds: string[];
}

export interface TinaConfidenceDebt {
  id: string;
  title: string;
  severity: TinaConfidenceDebtSeverity;
  summary: string;
  currentClaim: string;
  safePosture: string;
  ownerEngine: string;
  relatedCheckIds: string[];
  relatedFactIds: string[];
  relatedDocumentIds: string[];
}

export interface TinaConfidenceCalibrationSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  overallStatus: TinaConfidenceCalibrationStatus;
  recommendedPosture: "normal_use" | "reviewer_controlled" | "hold_until_proved";
  summary: string;
  nextStep: string;
  checks: TinaConfidenceCalibrationCheck[];
  debts: TinaConfidenceDebt[];
}

export type TinaCaseMemoryLedgerOverallStatus =
  | "stable"
  | "review_pending"
  | "drifted"
  | "blocked";
export type TinaCaseMemoryLedgerEntryType =
  | "current_state"
  | "snapshot"
  | "reviewer_decision"
  | "reviewer_observed_delta"
  | "drift";
export type TinaCaseMemoryLedgerEntrySeverity = "info" | "needs_attention" | "blocking";
export type TinaCaseMemoryLedgerActor = "tina" | "reviewer" | "system";
export type TinaCaseMemoryOverrideStatus = "open" | "resolved";

export interface TinaCaseMemoryLedgerEntry {
  id: string;
  type: TinaCaseMemoryLedgerEntryType;
  actor: TinaCaseMemoryLedgerActor;
  severity: TinaCaseMemoryLedgerEntrySeverity;
  occurredAt: string;
  title: string;
  summary: string;
  effectOnTrust: string;
  relatedSnapshotId: string | null;
  relatedDecisionId: string | null;
}

export interface TinaCaseMemoryOverride {
  id: string;
  decisionId: string;
  snapshotId: string;
  decision: "changes_requested" | "revoked";
  status: TinaCaseMemoryOverrideStatus;
  reviewerName: string;
  decidedAt: string;
  summary: string;
  notes: string;
}

export interface TinaCaseMemoryLedgerSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  overallStatus: TinaCaseMemoryLedgerOverallStatus;
  summary: string;
  nextStep: string;
  activeAnchorSnapshotId: string | null;
  latestSnapshotId: string | null;
  latestDecisionId: string | null;
  openOverrideCount: number;
  driftReasons: string[];
  entries: TinaCaseMemoryLedgerEntry[];
  overrides: TinaCaseMemoryOverride[];
}

export type TinaReviewerLearningLoopOverallStatus =
  | "stable"
  | "active_learning"
  | "policy_update_required";
export type TinaReviewerLearningLessonSource =
  | "reviewer_decision"
  | "authority_review"
  | "signoff_drift";
export type TinaReviewerLearningLessonStatus = "queued" | "anchored";
export type TinaReviewerLearningLessonSeverity = "info" | "needs_attention" | "blocking";
export type TinaReviewerLearningTheme =
  | "ownership_transition"
  | "sales_tax_authority"
  | "depreciation_assets"
  | "inventory_cogs"
  | "worker_classification"
  | "related_party"
  | "mixed_use"
  | "snapshot_drift"
  | "unknown_route"
  | "general_review_control";
export type TinaReviewerPolicyCandidatePriority = "high" | "medium" | "low";
export type TinaReviewerRegressionTargetStatus = "existing_fixture" | "new_fixture_needed";

export interface TinaReviewerLearningLesson {
  id: string;
  source: TinaReviewerLearningLessonSource;
  theme: TinaReviewerLearningTheme;
  status: TinaReviewerLearningLessonStatus;
  severity: TinaReviewerLearningLessonSeverity;
  occurredAt: string;
  title: string;
  summary: string;
  lesson: string;
  confidenceImpact: string;
  ownerEngines: string[];
  relatedDecisionId: string | null;
  relatedSnapshotId: string | null;
  relatedAuthorityWorkIdeaIds: string[];
}

export interface TinaReviewerPolicyCandidate {
  id: string;
  theme: TinaReviewerLearningTheme;
  title: string;
  priority: TinaReviewerPolicyCandidatePriority;
  summary: string;
  recommendedChange: string;
  ownerEngines: string[];
  triggeredByLessonIds: string[];
}

export interface TinaReviewerRegressionTarget {
  id: string;
  theme: TinaReviewerLearningTheme;
  title: string;
  status: TinaReviewerRegressionTargetStatus;
  fixtureId: string | null;
  summary: string;
  targetBehavior: string;
  ownerEngines: string[];
  triggeredByLessonIds: string[];
}

export interface TinaReviewerLearningLoopSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  overallStatus: TinaReviewerLearningLoopOverallStatus;
  summary: string;
  nextStep: string;
  activeLessonCount: number;
  anchoredLessonCount: number;
  policyCandidateCount: number;
  regressionTargetCount: number;
  lessons: TinaReviewerLearningLesson[];
  policyCandidates: TinaReviewerPolicyCandidate[];
  regressionTargets: TinaReviewerRegressionTarget[];
}

export type TinaReviewerOverrideGovernanceOverallStatus =
  | "stable"
  | "active_overrides"
  | "policy_update_required";
export type TinaReviewerOverridePolicyState = "unmodeled" | "candidate" | "anchored";
export type TinaReviewerOverrideTrustBoundary =
  | "reviewer_controlled"
  | "bounded_reuse"
  | "superseded";
export type TinaReviewerOverrideGovernanceItemStatus = "open" | "resolved" | "anchored";
export type TinaReviewerOverrideScope =
  | "entity_route"
  | "evidence_books"
  | "treatment_authority"
  | "form_execution"
  | "workflow_governance"
  | "planning";
export type TinaReviewerOverrideGovernancePriority = "high" | "medium" | "low";
export type TinaReviewerAcceptanceDeltaStatus = "accepted" | "adjusted" | "rejected" | "stale";
export type TinaReviewerAcceptanceDeltaSeverity = "info" | "needs_attention" | "blocking";

export interface TinaReviewerOverrideGovernanceItem {
  id: string;
  title: string;
  theme: TinaReviewerLearningTheme;
  scope: TinaReviewerOverrideScope;
  status: TinaReviewerOverrideGovernanceItemStatus;
  policyState: TinaReviewerOverridePolicyState;
  trustBoundary: TinaReviewerOverrideTrustBoundary;
  priority: TinaReviewerOverrideGovernancePriority;
  reviewerName: string | null;
  decidedAt: string;
  reviewByAt: string | null;
  summary: string;
  requiredAction: string;
  ownerEngines: string[];
  relatedDecisionId: string | null;
  relatedSnapshotId: string | null;
  relatedPolicyCandidateIds: string[];
  relatedRegressionTargetIds: string[];
  benchmarkScenarioIds: string[];
}

export interface TinaReviewerAcceptanceDelta {
  id: string;
  title: string;
  theme: TinaReviewerLearningTheme;
  status: TinaReviewerAcceptanceDeltaStatus;
  severity: TinaReviewerAcceptanceDeltaSeverity;
  occurredAt: string;
  reviewerName: string | null;
  summary: string;
  consequence: string;
  ownerEngines: string[];
  relatedDecisionId: string | null;
  relatedSnapshotId: string | null;
  benchmarkScenarioIds: string[];
}

export type TinaReviewerObservedDeltasOverallStatus =
  | "quiet"
  | "watch"
  | "policy_update_required"
  | "regressing";

export interface TinaReviewerObservedDeltaItem {
  id: string;
  title: string;
  theme: TinaReviewerLearningTheme;
  domain: TinaReviewerObservedDeltaDomain;
  kind: TinaReviewerObservedDeltaKind;
  severity: TinaReviewerObservedDeltaSeverity;
  occurredAt: string;
  reviewerName: string | null;
  summary: string;
  trustEffect: string;
  ownerEngines: string[];
  relatedDecisionId: string | null;
  relatedSnapshotId: string | null;
  relatedAuthorityWorkIdeaId: string | null;
  benchmarkScenarioIds: string[];
  topPriorityBenchmarkScenarioIds: string[];
}

export interface TinaReviewerObservedDeltasSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  overallStatus: TinaReviewerObservedDeltasOverallStatus;
  summary: string;
  nextStep: string;
  totalDeltaCount: number;
  acceptedFirstPassCount: number;
  acceptedAfterAdjustmentCount: number;
  changeRequestedCount: number;
  rejectedCount: number;
  staleCount: number;
  blockingCount: number;
  benchmarkScenarioCoverageCount: number;
  topPriorityCoverageCount: number;
  items: TinaReviewerObservedDeltaItem[];
}

export interface TinaReviewerOverrideGovernanceSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  overallStatus: TinaReviewerOverrideGovernanceOverallStatus;
  summary: string;
  nextStep: string;
  openOverrideCount: number;
  anchoredOverrideCount: number;
  policyUpdateRequiredCount: number;
  fixtureGapCount: number;
  blockingAcceptanceDeltaCount: number;
  recommendedBenchmarkScenarioIds: string[];
  items: TinaReviewerOverrideGovernanceItem[];
  acceptanceDeltas: TinaReviewerAcceptanceDelta[];
}

export type TinaReviewerPolicyVersioningOverallStatus = "stable" | "release_queue" | "blocked";
export type TinaReviewerPolicyBenchmarkCoverageStatus = "covered" | "partial" | "missing";
export type TinaReviewerPolicyVersionStatus =
  | "active"
  | "ready_to_promote"
  | "benchmarking"
  | "candidate"
  | "blocked";

export interface TinaReviewerPolicyVersionTrack {
  id: string;
  theme: TinaReviewerLearningTheme;
  title: string;
  status: TinaReviewerPolicyVersionStatus;
  currentVersionId: string | null;
  candidateVersionId: string | null;
  benchmarkCoverageStatus: TinaReviewerPolicyBenchmarkCoverageStatus;
  summary: string;
  nextStep: string;
  ownerEngines: string[];
  anchoredLessonCount: number;
  queuedLessonCount: number;
  policyCandidateCount: number;
  openOverrideCount: number;
  blockingAcceptanceDeltaCount: number;
  relatedLessonIds: string[];
  relatedPolicyCandidateIds: string[];
  relatedRegressionTargetIds: string[];
  relatedGovernanceItemIds: string[];
  relatedAcceptanceDeltaIds: string[];
  benchmarkScenarioIds: string[];
  topPriorityBenchmarkScenarioIds: string[];
  blockers: string[];
  releaseNotes: string[];
}

export interface TinaReviewerPolicyVersioningSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  overallStatus: TinaReviewerPolicyVersioningOverallStatus;
  summary: string;
  nextStep: string;
  activePolicyCount: number;
  readyToPromoteCount: number;
  candidatePolicyCount: number;
  benchmarkingPolicyCount: number;
  blockedPolicyCount: number;
  benchmarkCoverageGapCount: number;
  topPriorityBenchmarkCoverageCount: number;
  items: TinaReviewerPolicyVersionTrack[];
}

export type TinaReviewerAcceptanceRealityOverallStatus =
  | "trusted"
  | "watch"
  | "unproven"
  | "regressing";
export type TinaReviewerAcceptanceRealityOutcome =
  | "accepted_first_pass"
  | "accepted_after_adjustment"
  | "blocked_by_reviewer"
  | "rejected"
  | "stale_after_acceptance";

export interface TinaReviewerAcceptanceRealityItem {
  id: string;
  theme: TinaReviewerLearningTheme;
  title: string;
  outcome: TinaReviewerAcceptanceRealityOutcome;
  reviewerNames: string[];
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  summary: string;
  nextStep: string;
  ownerEngines: string[];
  acceptedCount: number;
  adjustedCount: number;
  rejectedCount: number;
  staleCount: number;
  relatedDecisionIds: string[];
  relatedSnapshotIds: string[];
  relatedAcceptanceDeltaIds: string[];
  relatedGovernanceItemIds: string[];
  policyTrackId: string | null;
  policyTrackStatus: TinaReviewerPolicyVersionStatus | null;
  benchmarkCoverageStatus: TinaReviewerPolicyBenchmarkCoverageStatus | null;
  benchmarkScenarioIds: string[];
  topPriorityBenchmarkScenarioIds: string[];
}

export interface TinaReviewerAcceptanceRealitySnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  overallStatus: TinaReviewerAcceptanceRealityOverallStatus;
  summary: string;
  nextStep: string;
  totalObservedThemeCount: number;
  acceptedFirstPassCount: number;
  acceptedAfterAdjustmentCount: number;
  blockedThemeCount: number;
  rejectedThemeCount: number;
  staleThemeCount: number;
  observedAcceptanceRate: number;
  durableAcceptanceRate: number;
  benchmarkBackedAcceptedCount: number;
  topPriorityAcceptedCoverageCount: number;
  items: TinaReviewerAcceptanceRealityItem[];
}

export type TinaDocumentIntelligenceRole =
  | "prior_return_package"
  | "entity_election"
  | "formation_document"
  | "state_registration"
  | "operating_agreement"
  | "cap_table"
  | "ownership_schedule"
  | "buyout_agreement"
  | "payroll_report"
  | "asset_ledger"
  | "inventory_count"
  | "inventory_rollforward"
  | "related_party_agreement"
  | "books_ledger"
  | "bank_statement"
  | "general_support"
  | "unknown";
export type TinaDocumentIntelligenceStatus = "strong" | "partial" | "signal_only";
export type TinaDocumentIntelligenceExtractKind =
  | "lane_hint"
  | "entity_name_signal"
  | "election_signal"
  | "prior_filing_signal"
  | "election_timeline_signal"
  | "ownership_signal"
  | "ownership_timeline_signal"
  | "identity_signal"
  | "state_registration_signal"
  | "home_office_input"
  | "asset_signal"
  | "payroll_signal"
  | "payroll_provider_signal"
  | "manual_payroll_signal"
  | "payroll_quarterly_filing_signal"
  | "payroll_annual_wage_form_signal"
  | "payroll_deposit_signal"
  | "payroll_compliance_gap_signal"
  | "owner_comp_signal"
  | "contractor_signal"
  | "inventory_signal"
  | "related_party_signal";
export type TinaDocumentIntelligenceExtractSource =
  | "document_name"
  | "request_metadata"
  | "detail_line"
  | "source_fact";
export type TinaDocumentIntelligenceExtractConfidence = "strong" | "moderate";

export interface TinaDocumentIntelligenceExtractedFact {
  id: string;
  kind: TinaDocumentIntelligenceExtractKind;
  source: TinaDocumentIntelligenceExtractSource;
  confidence: TinaDocumentIntelligenceExtractConfidence;
  label: string;
  summary: string;
  valueText: string | null;
  valueNumber: number | null;
  laneId: TinaFilingLaneId | null;
}

export interface TinaDocumentIntelligenceItem {
  id: string;
  documentId: string;
  title: string;
  roles: TinaDocumentIntelligenceRole[];
  status: TinaDocumentIntelligenceStatus;
  summary: string;
  structuredTruths: string[]; 
  relatedLaneIds: TinaFilingLaneId[];
  relatedFactIds: string[];
  extractedFacts: TinaDocumentIntelligenceExtractedFact[];
}

export interface TinaDocumentIntelligenceSnapshot {
  lastBuiltAt: string | null;
  status: "idle" | "complete";
  overallStatus: "surface_only" | "structured" | "conflicted";
  summary: string;
  nextStep: string;
  structuredDocumentCount: number;
  extractedFactCount: number;
  conflictCount: number;
  identityConflictCount: number;
  continuityConflictCount: number;
  missingCriticalRoleCount: number;
  entityNameCount: number;
  distinctEinCount: number;
  priorFilingSignalCount: number;
  electionTimelineSignalCount: number;
  ownershipTimelineSignalCount: number;
  stateRegistrationSignalCount: number;
  missingCriticalRoles: string[];
  continuityQuestions: string[];
  items: TinaDocumentIntelligenceItem[];
}
