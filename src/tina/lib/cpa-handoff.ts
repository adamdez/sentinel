import { buildTinaAttachmentStatements } from "@/tina/lib/attachment-statements";
import { buildTinaAttachmentSchedules } from "@/tina/lib/attachment-schedules";
import { buildTinaAccountingArtifactCoverage } from "@/tina/lib/accounting-artifact-coverage";
import { buildTinaAuthorityPositionMatrix } from "@/tina/lib/authority-position-matrix";
import { buildTinaBooksNormalization } from "@/tina/lib/books-normalization";
import { buildTinaBooksReconciliation } from "@/tina/lib/books-reconciliation";
import { buildTinaCaseMemoryLedger } from "@/tina/lib/case-memory-ledger";
import { buildTinaChecklist } from "@/tina/lib/checklist";
import { buildTinaCompanionFormCalculations } from "@/tina/lib/companion-form-calculations";
import { buildTinaCompanionFormPlan } from "@/tina/lib/companion-form-plan";
import { buildTinaCompanionFormRenderPlan } from "@/tina/lib/companion-form-render-plan";
import { buildTinaConfidenceCalibration } from "@/tina/lib/confidence-calibration";
import { buildTinaCrossFormConsistency } from "@/tina/lib/cross-form-consistency";
import { buildTinaDecisionBriefings } from "@/tina/lib/decision-briefings";
import { buildTinaDocumentRequestPlan } from "@/tina/lib/document-request-plan";
import { buildTinaDisclosureReadiness } from "@/tina/lib/disclosure-readiness";
import { buildTinaEntityEconomicsReadiness } from "@/tina/lib/entity-economics-readiness";
import { buildTinaEntityFilingRemediation } from "@/tina/lib/entity-filing-remediation";
import { buildTinaEntityJudgment } from "@/tina/lib/entity-judgment";
import { buildTinaEntityReturnCalculations } from "@/tina/lib/entity-return-calculations";
import { buildTinaEntityReturnPackagePlan } from "@/tina/lib/entity-return-package-plan";
import { buildTinaEntityReturnScheduleFamilyFinalizations } from "@/tina/lib/entity-return-schedule-family-finalizations";
import { buildTinaEntityReturnScheduleFamilyPayloads } from "@/tina/lib/entity-return-schedule-family-payloads";
import { buildTinaEntityReturnScheduleFamilyArtifacts } from "@/tina/lib/entity-return-schedule-family-artifacts";
import { buildTinaEntityReturnSupportArtifacts } from "@/tina/lib/entity-return-support-artifacts";
import { buildTinaEntityRecordMatrix } from "@/tina/lib/entity-record-matrix";
import { buildTinaEntityReturnRunbook } from "@/tina/lib/entity-return-runbook";
import { buildTinaEvidenceCredibility } from "@/tina/lib/evidence-credibility";
import { buildTinaFederalReturnRequirements } from "@/tina/lib/federal-return-requirements";
import { buildTinaFormReadiness } from "@/tina/lib/form-readiness";
import { buildTinaIndustryPlaybooks } from "@/tina/lib/industry-playbooks";
import { buildTinaIndustryEvidenceMatrix } from "@/tina/lib/industry-evidence-matrix";
import { buildTinaOfficialFormFill } from "@/tina/lib/official-form-fill";
import { buildTinaOfficialFormExecution } from "@/tina/lib/official-form-execution";
import { buildTinaOwnerFlowBasisAdjudication } from "@/tina/lib/owner-flow-basis-adjudication";
import { buildTinaOwnershipTimeline } from "@/tina/lib/ownership-timeline";
import { buildTinaPackageReadiness } from "@/tina/lib/package-readiness";
import { buildTinaPackageState } from "@/tina/lib/package-state";
import { buildTinaPayrollComplianceReconstruction } from "@/tina/lib/payroll-compliance-reconstruction";
import { buildTinaReviewerChallenges } from "@/tina/lib/reviewer-challenges";
import { buildTinaReviewerAcceptanceForecast } from "@/tina/lib/reviewer-acceptance-forecast";
import { buildTinaReviewerAcceptanceReality } from "@/tina/lib/reviewer-acceptance-reality";
import { buildTinaReviewerLearningLoop } from "@/tina/lib/reviewer-learning-loop";
import { buildTinaReviewerOverrideGovernance } from "@/tina/lib/reviewer-override-governance";
import { buildTinaReviewerPolicyVersioning } from "@/tina/lib/reviewer-policy-versioning";
import { buildTinaScheduleCFormCoverage } from "@/tina/lib/schedule-c-form-coverage";
import { buildTinaScheduleCFormTrace } from "@/tina/lib/schedule-c-form-trace";
import { buildTinaScheduleCReturn } from "@/tina/lib/schedule-c-return";
import { buildTinaSingleMemberEntityHistoryProof } from "@/tina/lib/single-member-entity-history-proof";
import { buildTinaSingleOwnerCorporateRouteProof } from "@/tina/lib/single-owner-corporate-route-proof";
import { buildTinaStartPathAssessment } from "@/tina/lib/start-path";
import { buildTinaTaxOpportunityEngine } from "@/tina/lib/tax-opportunity-engine";
import { buildTinaPlanningActionBoard } from "@/tina/lib/planning-action-board";
import { buildTinaTaxPlanningMemo } from "@/tina/lib/tax-planning-memo";
import { buildTinaTreatmentJudgment } from "@/tina/lib/treatment-judgment";
import { buildTinaUnknownPatternEngine } from "@/tina/lib/unknown-pattern-engine";
import { buildTinaLedgerReconstruction } from "@/tina/lib/ledger-reconstruction";
import type {
  TinaCpaHandoffArtifact,
  TinaCpaHandoffArtifactStatus,
  TinaCpaHandoffSnapshot,
  TinaPackageReadinessItem,
  TinaWorkspaceDraft,
} from "@/tina/types";

function createEmptySnapshot(): TinaCpaHandoffSnapshot {
  return {
    lastRunAt: null,
    status: "idle",
    summary: "Tina has not built the CPA handoff packet yet.",
    nextStep:
      "Build the package check first, then let Tina lay out what belongs in the review packet.",
    artifacts: [],
  };
}

export function createDefaultTinaCpaHandoff(): TinaCpaHandoffSnapshot {
  return createEmptySnapshot();
}

export function markTinaCpaHandoffStale(
  snapshot: TinaCpaHandoffSnapshot
): TinaCpaHandoffSnapshot {
  if (snapshot.status === "idle" || snapshot.status === "stale") return snapshot;

  return {
    ...snapshot,
    status: "stale",
    summary:
      "Your draft, package check, or review notes changed, so Tina should rebuild the CPA handoff packet.",
    nextStep:
      "Build the CPA handoff packet again so Tina does not lean on old review notes or packet sections.",
  };
}

function uniqueIds(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildArtifact(args: {
  id: string;
  title: string;
  status: TinaCpaHandoffArtifactStatus;
  summary: string;
  includes: string[];
  relatedFieldIds?: string[];
  relatedNoteIds?: string[];
  relatedReadinessItemIds?: string[];
  sourceDocumentIds?: string[];
}): TinaCpaHandoffArtifact {
  return {
    id: args.id,
    title: args.title,
    status: args.status,
    summary: args.summary,
    includes: args.includes,
    relatedFieldIds: args.relatedFieldIds ?? [],
    relatedNoteIds: args.relatedNoteIds ?? [],
    relatedReadinessItemIds: args.relatedReadinessItemIds ?? [],
    sourceDocumentIds: args.sourceDocumentIds ?? [],
  };
}

function isFieldOrNoteItem(item: TinaPackageReadinessItem): boolean {
  return item.relatedFieldIds.length > 0 || item.relatedNoteIds.length > 0;
}

export function buildTinaCpaHandoff(draft: TinaWorkspaceDraft): TinaCpaHandoffSnapshot {
  const now = new Date().toISOString();
  const packageState = buildTinaPackageState(draft);
  const startPath = buildTinaStartPathAssessment(draft);
  const entityJudgment = buildTinaEntityJudgment(draft);
  const entityRecordMatrix = buildTinaEntityRecordMatrix(draft);
  const entityEconomicsReadiness = buildTinaEntityEconomicsReadiness(draft);
  const entityReturnCalculations = buildTinaEntityReturnCalculations(draft);
  const ownerFlowBasis = buildTinaOwnerFlowBasisAdjudication(draft);
  const entityReturnPackagePlan = buildTinaEntityReturnPackagePlan(draft);
  const entityReturnScheduleFamilyFinalizations =
    buildTinaEntityReturnScheduleFamilyFinalizations(draft);
  const entityReturnScheduleFamilyPayloads = buildTinaEntityReturnScheduleFamilyPayloads(draft);
  const entityReturnScheduleFamilies = buildTinaEntityReturnScheduleFamilyArtifacts(draft);
  const entityReturnSupportArtifacts = buildTinaEntityReturnSupportArtifacts(draft);
  const entityReturnRunbook = buildTinaEntityReturnRunbook(draft);
  const federalReturnRequirements = buildTinaFederalReturnRequirements(draft);
  const entityFilingRemediation = buildTinaEntityFilingRemediation(draft);
  const unknownPatternEngine = buildTinaUnknownPatternEngine(draft);
  const confidenceCalibration = buildTinaConfidenceCalibration(draft);
  const caseMemoryLedger = buildTinaCaseMemoryLedger(draft);
  const reviewerLearningLoop = buildTinaReviewerLearningLoop(draft);
  const reviewerOverrideGovernance = buildTinaReviewerOverrideGovernance(draft);
  const reviewerPolicyVersioning = buildTinaReviewerPolicyVersioning(draft);
  const reviewerAcceptanceReality = buildTinaReviewerAcceptanceReality(draft);
  const ownershipTimeline = buildTinaOwnershipTimeline(draft);
  const treatmentJudgment = buildTinaTreatmentJudgment(draft);
  const lane = startPath.recommendation;
  const booksNormalization = buildTinaBooksNormalization(draft);
  const ledgerReconstruction = buildTinaLedgerReconstruction(draft);
  const booksReconciliation = buildTinaBooksReconciliation(draft);
  const evidenceCredibility = buildTinaEvidenceCredibility(draft);
  const accountingArtifactCoverage = buildTinaAccountingArtifactCoverage(draft);
  const payrollCompliance = buildTinaPayrollComplianceReconstruction(draft);
  const singleMemberEntityHistory = buildTinaSingleMemberEntityHistoryProof(draft);
  const singleOwnerCorporateRoute = buildTinaSingleOwnerCorporateRouteProof(draft);
  const industryPlaybooks = buildTinaIndustryPlaybooks(draft);
  const industryEvidenceMatrix = buildTinaIndustryEvidenceMatrix(draft);
  const taxOpportunityEngine = buildTinaTaxOpportunityEngine(draft);
  const companionFormPlan = buildTinaCompanionFormPlan(draft);
  const companionFormCalculations = buildTinaCompanionFormCalculations(draft);
  const companionFormRenderPlan = buildTinaCompanionFormRenderPlan(draft);
  const crossFormConsistency = buildTinaCrossFormConsistency(draft);
  const reviewerChallenges = buildTinaReviewerChallenges(draft);
  const scheduleCReturn = buildTinaScheduleCReturn(draft);
  const formCoverage = buildTinaScheduleCFormCoverage(draft);
  const formTrace = buildTinaScheduleCFormTrace(draft);
  const formReadiness = buildTinaFormReadiness(draft);
  const officialFormFill = buildTinaOfficialFormFill(draft);
  const officialFormExecution = buildTinaOfficialFormExecution(draft);
  const attachmentStatements = buildTinaAttachmentStatements(draft);
  const attachmentSchedules = buildTinaAttachmentSchedules(draft);
  const decisionBriefings = buildTinaDecisionBriefings(draft);
  const checklist = buildTinaChecklist(draft, lane);
  const taxPlanningMemo = buildTinaTaxPlanningMemo(draft);
  const planningActionBoard = buildTinaPlanningActionBoard(draft);
  const authorityPositionMatrix = buildTinaAuthorityPositionMatrix(draft);
  const disclosureReadiness = buildTinaDisclosureReadiness(draft);
  const reviewerAcceptanceForecast = buildTinaReviewerAcceptanceForecast(draft);
  const documentRequestPlan = buildTinaDocumentRequestPlan(draft);

  if (draft.reviewerFinal.status !== "complete") {
    return {
      ...createDefaultTinaCpaHandoff(),
      lastRunAt: now,
      status: draft.reviewerFinal.status === "stale" ? "stale" : "idle",
      summary:
        "Tina needs the return-facing review layer before she can lay out a CPA handoff packet.",
      nextStep: "Build the return-facing review layer first.",
    };
  }

  if (draft.scheduleCDraft.status !== "complete") {
    return {
      ...createDefaultTinaCpaHandoff(),
      lastRunAt: now,
      status: draft.scheduleCDraft.status === "stale" ? "stale" : "idle",
      summary:
        "Tina needs the first Schedule C draft before she can lay out a CPA handoff packet.",
      nextStep: "Build the Schedule C draft first.",
    };
  }

  const packageReadiness = buildTinaPackageReadiness(draft);

  const blockingReadinessItems = packageReadiness.items.filter(
    (item) => item.severity === "blocking"
  );
  const attentionReadinessItems = packageReadiness.items.filter(
    (item) => item.severity === "needs_attention"
  );
  const fieldOrNoteBlockingItems = blockingReadinessItems.filter(isFieldOrNoteItem);
  const fieldOrNoteAttentionItems = attentionReadinessItems.filter(isFieldOrNoteItem);
  const requiredChecklistItems = checklist.filter(
    (item) => item.priority === "required" && item.status === "needed"
  );
  const authorityBlockedAdjustments = draft.taxAdjustments.adjustments.filter(
    (adjustment) => adjustment.status === "needs_authority"
  );
  const reviewAdjustments = draft.taxAdjustments.adjustments.filter(
    (adjustment) => adjustment.status === "ready_for_review"
  );
  const unresolvedAuthorityWork = draft.authorityWork.filter(
    (item) =>
      item.status === "not_started" ||
      item.status === "researching" ||
      item.status === "ready_for_reviewer"
  );
  const citationCount = draft.authorityWork.reduce(
    (total, item) => total + item.citations.length,
    0
  );

  const allDocumentIds = draft.documents.map((document) => document.id);
  const reviewerFinalDocumentIds = uniqueIds(
    draft.reviewerFinal.lines.flatMap((line) => line.sourceDocumentIds)
  );
  const scheduleCDocumentIds = uniqueIds([
    ...draft.scheduleCDraft.fields.flatMap((field) => field.sourceDocumentIds),
    ...draft.scheduleCDraft.notes.flatMap((note) => note.sourceDocumentIds),
  ]);
  const readinessDocumentIds = uniqueIds(
    packageReadiness.items.flatMap((item) => item.sourceDocumentIds)
  );

  const coverNoteStatus: TinaCpaHandoffArtifactStatus =
    packageReadiness.level === "blocked"
      ? "blocked"
      : packageReadiness.level === "needs_review"
        ? "waiting"
        : "ready";

  const sourceIndexStatus: TinaCpaHandoffArtifactStatus =
    draft.documents.length === 0 || requiredChecklistItems.length > 0 ? "waiting" : "ready";

  const workpaperTraceStatus: TinaCpaHandoffArtifactStatus =
    draft.reviewerFinal.lines.length > 0 ? "ready" : "waiting";

  const authorityStatus: TinaCpaHandoffArtifactStatus =
    authorityBlockedAdjustments.length > 0
      ? "blocked"
      : reviewAdjustments.length > 0 || unresolvedAuthorityWork.length > 0
        ? "waiting"
        : "ready";

  const scheduleDraftStatus: TinaCpaHandoffArtifactStatus =
    draft.scheduleCDraft.fields.length === 0
      ? "waiting"
      : fieldOrNoteBlockingItems.length > 0
        ? "blocked"
        : fieldOrNoteAttentionItems.length > 0
          ? "waiting"
          : "ready";

  const openItemsStatus: TinaCpaHandoffArtifactStatus =
    blockingReadinessItems.length > 0
      ? "blocked"
      : attentionReadinessItems.length > 0
        ? "waiting"
        : "ready";
  const signoffStatus: TinaCpaHandoffArtifactStatus =
    packageState === "signed_off"
      ? "ready"
      : packageState === "blocked" || packageState === "signed_off_stale"
        ? "blocked"
        : "waiting";
  const appendixStatus: TinaCpaHandoffArtifactStatus =
    draft.appendix.items.length > 0 ? "waiting" : "ready";
  const formOutputStatus: TinaCpaHandoffArtifactStatus =
    packageState === "signed_off" && formReadiness.level === "reviewer_ready"
      ? "ready"
      : formReadiness.level === "not_ready"
        ? "blocked"
        : formReadiness.level === "provisional"
          ? "waiting"
          : "ready";
  const startPathStatus: TinaCpaHandoffArtifactStatus =
    startPath.route === "supported"
      ? "ready"
      : startPath.route === "review_only"
        ? "waiting"
        : "blocked";
  const entityFilingRemediationStatus: TinaCpaHandoffArtifactStatus =
    entityFilingRemediation.overallStatus === "blocked"
      ? "blocked"
      : entityFilingRemediation.overallStatus === "review_required"
        ? "waiting"
        : "ready";
  const singleOwnerCorporateRouteStatus: TinaCpaHandoffArtifactStatus =
    singleOwnerCorporateRoute.overallStatus === "blocked"
      ? "blocked"
      : singleOwnerCorporateRoute.overallStatus === "review_required"
        ? "waiting"
        : "ready";
  const singleMemberEntityHistoryStatus: TinaCpaHandoffArtifactStatus =
    singleMemberEntityHistory.overallStatus === "blocked"
      ? "blocked"
      : singleMemberEntityHistory.overallStatus === "review_required"
        ? "waiting"
        : "ready";
  const blockingNormalizationIssues = booksNormalization.issues.filter(
    (issue) => issue.severity === "blocking"
  );
  const attentionNormalizationIssues = booksNormalization.issues.filter(
    (issue) => issue.severity === "needs_attention" || issue.severity === "watch"
  );
  const booksNormalizationStatus: TinaCpaHandoffArtifactStatus =
    blockingNormalizationIssues.length > 0
      ? "blocked"
      : attentionNormalizationIssues.length > 0
        ? "waiting"
        : "ready";
  const blockedBooksReconciliationChecks = booksReconciliation.checks.filter(
    (check) => check.status === "blocked"
  );
  const reviewBooksReconciliationChecks = booksReconciliation.checks.filter(
    (check) => check.status === "needs_review"
  );
  const booksReconciliationStatus: TinaCpaHandoffArtifactStatus =
    blockedBooksReconciliationChecks.length > 0
      ? "blocked"
      : reviewBooksReconciliationChecks.length > 0
        ? "waiting"
        : "ready";
  const missingCriticalAccountingArtifacts = accountingArtifactCoverage.items.filter(
    (item) => item.criticality === "critical" && item.status === "missing"
  );
  const partialAccountingArtifacts = accountingArtifactCoverage.items.filter(
    (item) => item.status === "partial"
  );
  const accountingArtifactCoverageStatus: TinaCpaHandoffArtifactStatus =
    missingCriticalAccountingArtifacts.length > 0
      ? "blocked"
      : partialAccountingArtifacts.length > 0
        ? "waiting"
        : "ready";
  const payrollComplianceStatus: TinaCpaHandoffArtifactStatus =
    payrollCompliance.overallStatus === "blocked"
      ? "blocked"
      : payrollCompliance.overallStatus === "needs_review"
        ? "waiting"
        : "ready";
  const industryPlaybookStatus: TinaCpaHandoffArtifactStatus =
    industryPlaybooks.primaryIndustryId ? "ready" : "waiting";
  const missingIndustryEvidenceItems = industryEvidenceMatrix.items.filter(
    (item) => item.status === "missing"
  );
  const partialIndustryEvidenceItems = industryEvidenceMatrix.items.filter(
    (item) => item.status === "partial"
  );
  const industryEvidenceMatrixStatus: TinaCpaHandoffArtifactStatus =
    missingIndustryEvidenceItems.length > 0
      ? "waiting"
      : partialIndustryEvidenceItems.length > 0
        ? "waiting"
        : "ready";
  const readyTaxOpportunityCount = taxOpportunityEngine.items.filter(
    (item) => item.status === "ready_to_pursue"
  ).length;
  const taxOpportunityStatus: TinaCpaHandoffArtifactStatus =
    taxOpportunityEngine.items.every((item) => item.status === "reject")
      ? "blocked"
      : readyTaxOpportunityCount > 0
        ? "ready"
        : "waiting";
  const blockedCompanionForms = companionFormPlan.items.filter(
    (item) => item.status === "required_blocked"
  );
  const reviewCompanionForms = companionFormPlan.items.filter(
    (item) => item.status === "required_needs_review"
  );
  const companionFormPlanStatus: TinaCpaHandoffArtifactStatus =
    blockedCompanionForms.length > 0
      ? "blocked"
      : reviewCompanionForms.length > 0
        ? "waiting"
        : "ready";
  const blockedCompanionFormCalculations = companionFormCalculations.items.filter(
    (item) => item.status === "blocked"
  );
  const reviewCompanionFormCalculations = companionFormCalculations.items.filter(
    (item) => item.status === "needs_review"
  );
  const companionFormCalculationsStatus: TinaCpaHandoffArtifactStatus =
    blockedCompanionFormCalculations.length > 0
      ? "blocked"
      : reviewCompanionFormCalculations.length > 0
        ? "waiting"
        : "ready";
  const companionFormRenderPlanStatus: TinaCpaHandoffArtifactStatus =
    companionFormRenderPlan.overallStatus === "blocked"
      ? "blocked"
      : companionFormRenderPlan.overallStatus === "review_required"
        ? "waiting"
        : "ready";
  const traceableLineCount = formTrace.lines.filter(
    (line) =>
      line.sourceFieldIds.length > 0 ||
      line.reviewerFinalLineIds.length > 0 ||
      line.sourceDocumentIds.length > 0 ||
      (line.amount === 0 && line.status === "ready")
  ).length;
  const formTraceStatus: TinaCpaHandoffArtifactStatus =
    formTrace.lines.length === 0
      ? "blocked"
      : traceableLineCount === formTrace.lines.length
        ? "ready"
        : "waiting";
  const unsupportedCoverageItems = formCoverage.items.filter(
    (item) => item.status === "unsupported"
  );
  const partialCoverageItems = formCoverage.items.filter(
    (item) => item.status === "partial" || item.status === "needs_review"
  );
  const formCoverageStatus: TinaCpaHandoffArtifactStatus =
    unsupportedCoverageItems.length > 0
      ? "blocked"
      : partialCoverageItems.length > 0
        ? "waiting"
        : "ready";
  const officialFormFillStatus: TinaCpaHandoffArtifactStatus =
    officialFormFill.overallStatus === "blocked"
      ? "blocked"
      : officialFormFill.overallStatus === "needs_review"
        ? "waiting"
        : "ready";
  const officialFormExecutionStatus: TinaCpaHandoffArtifactStatus =
    officialFormExecution.overallStatus === "blocked"
      ? "blocked"
      : officialFormExecution.overallStatus === "review_required"
        ? "waiting"
        : "ready";
  const unknownPatternStatus: TinaCpaHandoffArtifactStatus =
    unknownPatternEngine.overallStatus === "novel_pattern"
      ? "blocked"
      : unknownPatternEngine.overallStatus === "ambiguous_pattern"
        ? "waiting"
        : "ready";
  const confidenceCalibrationStatus: TinaCpaHandoffArtifactStatus =
    confidenceCalibration.overallStatus === "blocked"
      ? "blocked"
      : confidenceCalibration.overallStatus === "watch" ||
          confidenceCalibration.overallStatus === "overstated"
        ? "waiting"
        : "ready";
  const caseMemoryLedgerStatus: TinaCpaHandoffArtifactStatus =
    caseMemoryLedger.overallStatus === "stable"
      ? "ready"
      : caseMemoryLedger.overallStatus === "review_pending"
        ? "waiting"
        : "blocked";
  const reviewerLearningLoopStatus: TinaCpaHandoffArtifactStatus =
    reviewerLearningLoop.overallStatus === "stable"
      ? "ready"
      : reviewerLearningLoop.overallStatus === "active_learning"
        ? "waiting"
        : "blocked";
  const reviewerOverrideGovernanceStatus: TinaCpaHandoffArtifactStatus =
    reviewerOverrideGovernance.overallStatus === "stable"
      ? "ready"
      : reviewerOverrideGovernance.overallStatus === "active_overrides"
        ? "waiting"
        : "blocked";
  const reviewerPolicyVersioningStatus: TinaCpaHandoffArtifactStatus =
    reviewerPolicyVersioning.overallStatus === "stable"
      ? "ready"
      : reviewerPolicyVersioning.overallStatus === "release_queue"
        ? "waiting"
        : "blocked";
  const reviewerAcceptanceRealityStatus: TinaCpaHandoffArtifactStatus =
    reviewerAcceptanceReality.overallStatus === "trusted"
      ? "ready"
      : reviewerAcceptanceReality.overallStatus === "regressing"
        ? "blocked"
        : "waiting";
  const attachmentStatementStatus: TinaCpaHandoffArtifactStatus =
    attachmentStatements.overallStatus === "blocked"
      ? "blocked"
      : attachmentStatements.overallStatus === "needs_review"
        ? "waiting"
        : "ready";
  const attachmentScheduleStatus: TinaCpaHandoffArtifactStatus =
    attachmentSchedules.overallStatus === "blocked"
      ? "blocked"
      : attachmentSchedules.overallStatus === "needs_review"
        ? "waiting"
        : "ready";
  const crossFormConsistencyStatus: TinaCpaHandoffArtifactStatus =
    crossFormConsistency.overallStatus === "blocked"
      ? "blocked"
      : crossFormConsistency.overallStatus === "review_required"
        ? "waiting"
        : "ready";
  const decisionBriefingsStatus: TinaCpaHandoffArtifactStatus =
    decisionBriefings.reviewer.openQuestions.length > 0 ||
    decisionBriefings.owner.openQuestions.length > 0
      ? "waiting"
      : "ready";
  const taxPlanningMemoStatus: TinaCpaHandoffArtifactStatus =
    taxPlanningMemo.overallStatus === "thin"
      ? "blocked"
      : taxPlanningMemo.overallStatus === "mixed"
        ? "waiting"
        : "ready";
  const planningActionBoardStatus: TinaCpaHandoffArtifactStatus =
    planningActionBoard.overallStatus === "thin"
      ? "blocked"
      : planningActionBoard.overallStatus === "mixed"
        ? "waiting"
        : "ready";
  const authorityPositionMatrixStatus: TinaCpaHandoffArtifactStatus =
    authorityPositionMatrix.overallStatus === "thin"
      ? "blocked"
      : authorityPositionMatrix.overallStatus === "mixed"
        ? "waiting"
        : "ready";
  const disclosureReadinessStatus: TinaCpaHandoffArtifactStatus =
    disclosureReadiness.overallStatus === "required"
      ? "blocked"
      : disclosureReadiness.overallStatus === "needs_review"
        ? "waiting"
        : "ready";
  const reviewerAcceptanceForecastStatus: TinaCpaHandoffArtifactStatus =
    reviewerAcceptanceForecast.overallStatus === "low_confidence"
      ? "blocked"
      : reviewerAcceptanceForecast.overallStatus === "mixed"
        ? "waiting"
        : "ready";
  const immediateDocumentRequests = documentRequestPlan.items.filter(
    (item) => item.priority === "immediate"
  );
  const nextDocumentRequests = documentRequestPlan.items.filter((item) => item.priority === "next");
  const documentRequestPlanStatus: TinaCpaHandoffArtifactStatus =
    immediateDocumentRequests.length > 0
      ? "blocked"
      : nextDocumentRequests.length > 0
        ? "waiting"
        : "ready";
  const ownerFlowBasisStatus: TinaCpaHandoffArtifactStatus =
    ownerFlowBasis.overallStatus === "blocked"
      ? "blocked"
      : ownerFlowBasis.overallStatus === "review_required"
        ? "waiting"
        : "ready";
  const reviewBundleStatus: TinaCpaHandoffArtifactStatus =
    [
      startPathStatus,
      formOutputStatus,
      formCoverageStatus,
      formTraceStatus,
      booksReconciliationStatus,
      accountingArtifactCoverageStatus,
      booksNormalizationStatus,
      officialFormFillStatus,
      officialFormExecutionStatus,
      unknownPatternStatus,
      confidenceCalibrationStatus,
      reviewerLearningLoopStatus,
      reviewerPolicyVersioningStatus,
      singleMemberEntityHistoryStatus,
      ownerFlowBasisStatus,
      attachmentStatementStatus,
      attachmentScheduleStatus,
      companionFormCalculationsStatus,
      companionFormPlanStatus,
      crossFormConsistencyStatus,
      planningActionBoardStatus,
      authorityPositionMatrixStatus,
      disclosureReadinessStatus,
      reviewerAcceptanceForecastStatus,
    ].includes("blocked")
      ? "blocked"
      : [
            startPathStatus,
            formOutputStatus,
            formCoverageStatus,
            formTraceStatus,
            booksReconciliationStatus,
            accountingArtifactCoverageStatus,
            booksNormalizationStatus,
            officialFormFillStatus,
            officialFormExecutionStatus,
            unknownPatternStatus,
            confidenceCalibrationStatus,
            reviewerLearningLoopStatus,
            reviewerPolicyVersioningStatus,
            singleMemberEntityHistoryStatus,
            ownerFlowBasisStatus,
            attachmentStatementStatus,
            attachmentScheduleStatus,
            companionFormCalculationsStatus,
            planningActionBoardStatus,
            authorityPositionMatrixStatus,
            disclosureReadinessStatus,
            reviewerAcceptanceForecastStatus,
          ].includes("waiting")
        ? "waiting"
        : "ready";
  const blockingReviewerChallenges = reviewerChallenges.items.filter(
    (item) => item.severity === "blocking"
  );
  const attentionReviewerChallenges = reviewerChallenges.items.filter(
    (item) => item.severity === "needs_attention"
  );
  const reviewerChallengeStatus: TinaCpaHandoffArtifactStatus =
    blockingReviewerChallenges.length > 0
      ? "blocked"
      : attentionReviewerChallenges.length > 0
        ? "waiting"
        : "ready";
  const blockingEntityQuestions = entityJudgment.questions.filter(
    (question) => question.severity === "blocking"
  );
  const attentionEntityQuestions = entityJudgment.questions.filter(
    (question) => question.severity === "needs_attention"
  );
  const entityJudgmentStatus: TinaCpaHandoffArtifactStatus =
    blockingEntityQuestions.length > 0
      ? "blocked"
      : attentionEntityQuestions.length > 0
        ? "waiting"
        : entityJudgment.judgmentStatus === "clear_supported" ? "ready" : "waiting";
  const blockingFederalReturnRequirements = federalReturnRequirements.items.filter(
    (item) => item.status === "blocked"
  );
  const attentionFederalReturnRequirements = federalReturnRequirements.items.filter(
    (item) => item.status === "needs_attention"
  );
  const federalReturnRequirementsStatus: TinaCpaHandoffArtifactStatus =
    blockingFederalReturnRequirements.length > 0
      ? "blocked"
      : attentionFederalReturnRequirements.length > 0 || !federalReturnRequirements.canTinaFinishLane
        ? "waiting"
        : "ready";
  const missingEntityRecordItems = entityRecordMatrix.items.filter((item) => item.status === "missing");
  const partialEntityRecordItems = entityRecordMatrix.items.filter((item) => item.status === "partial");
  const entityRecordMatrixStatus: TinaCpaHandoffArtifactStatus =
    missingEntityRecordItems.some((item) => item.criticality === "critical")
      ? "blocked"
      : missingEntityRecordItems.length > 0 || partialEntityRecordItems.length > 0
        ? "waiting"
        : "ready";
  const blockedEntityEconomicsChecks = entityEconomicsReadiness.checks.filter(
    (check) => check.status === "blocked"
  );
  const reviewEntityEconomicsChecks = entityEconomicsReadiness.checks.filter(
    (check) => check.status === "needs_review"
  );
  const entityEconomicsStatus: TinaCpaHandoffArtifactStatus =
    blockedEntityEconomicsChecks.length > 0
      ? "blocked"
      : reviewEntityEconomicsChecks.length > 0
        ? "waiting"
        : "ready";
  const entityReturnRunbookStatus: TinaCpaHandoffArtifactStatus =
    entityReturnRunbook.overallStatus === "blocked"
      ? "blocked"
      : entityReturnRunbook.overallStatus === "review_required"
        ? "waiting"
        : "ready";
  const entityReturnCalculationsStatus: TinaCpaHandoffArtifactStatus =
    entityReturnCalculations.overallStatus === "blocked"
      ? "blocked"
      : entityReturnCalculations.overallStatus === "needs_review"
        ? "waiting"
        : "ready";
  const entityReturnSupportArtifactsStatus: TinaCpaHandoffArtifactStatus =
    entityReturnSupportArtifacts.overallStatus === "blocked"
      ? "blocked"
      : entityReturnSupportArtifacts.overallStatus === "needs_review"
        ? "waiting"
        : "ready";
  const entityReturnScheduleFamiliesStatus: TinaCpaHandoffArtifactStatus =
    entityReturnScheduleFamilies.overallStatus === "blocked"
      ? "blocked"
      : entityReturnScheduleFamilies.overallStatus === "needs_review"
        ? "waiting"
        : "ready";
  const entityReturnScheduleFamilyPayloadsStatus: TinaCpaHandoffArtifactStatus =
    entityReturnScheduleFamilyPayloads.overallStatus === "blocked"
      ? "blocked"
      : entityReturnScheduleFamilyPayloads.overallStatus === "needs_review"
        ? "waiting"
        : "ready";
  const entityReturnScheduleFamilyFinalizationsStatus: TinaCpaHandoffArtifactStatus =
    entityReturnScheduleFamilyFinalizations.overallStatus === "blocked"
      ? "blocked"
      : entityReturnScheduleFamilyFinalizations.overallStatus === "needs_review"
        ? "waiting"
        : "ready";
  const entityReturnPackagePlanStatus: TinaCpaHandoffArtifactStatus =
    entityReturnPackagePlan.overallStatus === "blocked"
      ? "blocked"
      : entityReturnPackagePlan.overallStatus === "review_required"
        ? "waiting"
        : "ready";
  const reviewTreatmentItems = treatmentJudgment.items.filter(
    (item) => item.taxPositionBucket === "review"
  );
  const rejectTreatmentItems = treatmentJudgment.items.filter(
    (item) => item.taxPositionBucket === "reject"
  );
  const treatmentJudgmentStatus: TinaCpaHandoffArtifactStatus =
    rejectTreatmentItems.length > 0
      ? "blocked"
      : reviewTreatmentItems.length > 0
        ? "waiting"
        : "ready";
  const ownershipTimelineStatus: TinaCpaHandoffArtifactStatus =
    ownershipTimeline.events.some((event) => event.status === "needs_proof")
      ? "blocked"
      : ownershipTimeline.events.some((event) => event.status === "assumed")
        ? "waiting"
        : "ready";
  const reviewBundleFileCount = officialFormFill.formId ? 51 : 50;
  const reviewBundleSourceMode =
    draft.packageSnapshots.length > 0 ? "immutable snapshot available" : "live draft";

  const artifacts: TinaCpaHandoffArtifact[] = [
    buildArtifact({
      id: "start-path-decision",
      title: "Start path decision",
      status: startPathStatus,
      summary:
        startPathStatus === "ready"
          ? "Tina has a clean supported starting lane with aligned facts and paper signals."
          : startPathStatus === "waiting"
            ? "Tina has a likely starting lane, but reviewer control is still needed before deeper prep."
            : "Tina should not move deeper into prep because the starting lane is still blocked.",
      includes: [
        `Recommendation: ${startPath.recommendation.title}`,
        `Route: ${startPath.route}`,
        `Confidence: ${startPath.confidence}`,
        ...startPath.proofRequirements
          .slice(0, 3)
          .map((requirement) => `${requirement.label} [${requirement.status}]`),
        ...startPath.blockingReasons.slice(0, 3),
        ...startPath.reviewReasons.slice(0, 3),
      ],
      sourceDocumentIds: startPath.relatedDocumentIds,
    }),
    buildArtifact({
      id: "entity-filing-remediation",
      title: "Entity filing continuity and remediation",
      status: entityFilingRemediationStatus,
      summary:
        entityFilingRemediationStatus === "ready"
          ? "Tina has an aligned entity-filing story, so the current route and prior-return continuity are coherent."
          : entityFilingRemediationStatus === "waiting"
            ? "Tina has a likely entity-filing path, but continuity gaps still need reviewer-controlled cleanup."
            : "Tina should fail closed because prior-return drift, election proof gaps, or missing-return backlog still change the route story.",
      includes: [
        `Overall status: ${entityFilingRemediation.overallStatus}`,
        `Posture: ${entityFilingRemediation.posture.replace(/_/g, " ")}`,
        `History status: ${entityFilingRemediation.historyStatus.replace(/_/g, " ")}`,
        `Election status: ${entityFilingRemediation.electionStatus.replace(/_/g, " ")}`,
        `Amendment status: ${entityFilingRemediation.amendmentStatus.replace(/_/g, " ")}`,
        `Current lane: ${entityFilingRemediation.currentLaneId}`,
        `Likely prior lanes: ${
          entityFilingRemediation.likelyPriorLaneIds.length > 0
            ? entityFilingRemediation.likelyPriorLaneIds.join(", ")
            : "None"
        }`,
        `Blocked issues: ${entityFilingRemediation.blockedIssueCount}`,
        `Review issues: ${entityFilingRemediation.reviewIssueCount}`,
        ...entityFilingRemediation.priorityQuestions
          .slice(0, 2)
          .map((question) => `Question: ${question}`),
        ...entityFilingRemediation.actions
          .slice(0, 3)
          .map((action) => `${action.title} [${action.status}]`),
      ],
      sourceDocumentIds: entityFilingRemediation.relatedDocumentIds,
    }),
    buildArtifact({
      id: "single-member-entity-history-proof",
      title: "Single-member entity-history proof",
      status:
        singleMemberEntityHistory.overallStatus === "not_applicable"
          ? "ready"
          : singleMemberEntityHistoryStatus,
      summary:
        singleMemberEntityHistory.overallStatus === "not_applicable"
          ? "Tina does not currently see a single-member history issue that should travel with the packet."
          : singleMemberEntityHistoryStatus === "ready"
            ? "Tina sees a coherent single-member entity-history story with prior filings and books aligned enough to carry forward."
            : singleMemberEntityHistoryStatus === "waiting"
              ? "Tina sees a plausible single-member history, but owner-count, spouse-exception, or books-posture proof still needs reviewer control."
              : "Tina should fail closed because owner history, spouse-exception proof, or transition-year books posture is still unresolved.",
      includes: [
        `Overall status: ${singleMemberEntityHistory.overallStatus}`,
        `Posture: ${singleMemberEntityHistory.posture.replace(/_/g, " ")}`,
        `Owner history: ${singleMemberEntityHistory.ownerHistoryStatus.replace(/_/g, " ")}`,
        `Spouse exception: ${singleMemberEntityHistory.spouseExceptionStatus.replace(/_/g, " ")}`,
        `Prior filing alignment: ${singleMemberEntityHistory.priorFilingAlignmentStatus.replace(/_/g, " ")}`,
        `Transition year: ${singleMemberEntityHistory.transitionYearStatus.replace(/_/g, " ")}`,
        `Books posture: ${singleMemberEntityHistory.booksPostureStatus.replace(/_/g, " ")}`,
        `Blocked issues: ${singleMemberEntityHistory.blockedIssueCount}`,
        `Review issues: ${singleMemberEntityHistory.reviewIssueCount}`,
        ...singleMemberEntityHistory.questions
          .slice(0, 2)
          .map((question) => `Question: ${question}`),
      ],
      sourceDocumentIds: singleMemberEntityHistory.relatedDocumentIds,
    }),
    buildArtifact({
      id: "single-owner-corporate-route-proof",
      title: "Single-owner corporate route proof",
      status:
        singleOwnerCorporateRoute.overallStatus === "not_applicable"
          ? "ready"
          : singleOwnerCorporateRouteStatus,
      summary:
        singleOwnerCorporateRoute.overallStatus === "not_applicable"
          ? "Tina does not currently see a single-owner corporate route problem that should travel with the packet."
          : singleOwnerCorporateRouteStatus === "ready"
            ? "Tina sees a single-owner corporate route with election and payroll posture that is coherent enough to carry forward."
            : singleOwnerCorporateRouteStatus === "waiting"
              ? "Tina sees a plausible single-owner corporate route, but election or owner-pay facts still need reviewer control."
              : "Tina should fail closed because the single-owner corporate route or no-payroll S-corp posture is still unsafe.",
      includes: [
        `Overall status: ${singleOwnerCorporateRoute.overallStatus}`,
        `Posture: ${singleOwnerCorporateRoute.posture.replace(/_/g, " ")}`,
        `Election proof: ${singleOwnerCorporateRoute.electionProofStatus.replace(/_/g, " ")}`,
        `Payroll requirement: ${singleOwnerCorporateRoute.payrollRequirementStatus.replace(/_/g, " ")}`,
        `Owner services: ${singleOwnerCorporateRoute.ownerServiceStatus.replace(/_/g, " ")}`,
        `Blocked issues: ${singleOwnerCorporateRoute.blockedIssueCount}`,
        `Review issues: ${singleOwnerCorporateRoute.reviewIssueCount}`,
        ...singleOwnerCorporateRoute.questions.slice(0, 2).map((question) => `Question: ${question}`),
        ...singleOwnerCorporateRoute.issues
          .slice(0, 2)
          .map((issue) => `${issue.title} [${issue.severity}]`),
      ],
      sourceDocumentIds: singleOwnerCorporateRoute.relatedDocumentIds,
    }),
    buildArtifact({
      id: "unknown-pattern-resolution",
      title: "Unknown-pattern resolution",
      status: unknownPatternStatus,
      summary:
        unknownPatternStatus === "ready"
          ? "Tina does not currently see enough novelty pressure to break out of the known pattern."
          : unknownPatternStatus === "waiting"
            ? "Tina is holding multiple plausible explanations open until the reviewer narrows the file."
            : "Tina sees a novel or unstable pattern and should block the nearest canned category until proof catches up.",
      includes: [
        `Overall status: ${unknownPatternEngine.overallStatus}`,
        `Handling: ${unknownPatternEngine.recommendedHandling.replace(/_/g, " ")}`,
        `Signals: ${unknownPatternEngine.signals.length}`,
        `Hypotheses: ${unknownPatternEngine.hypotheses.length}`,
        ...unknownPatternEngine.hypotheses
          .slice(0, 3)
          .map(
            (hypothesis) =>
              `${hypothesis.title} [${hypothesis.status} | ${hypothesis.confidence}]`
          ),
        ...unknownPatternEngine.customProofRequests
          .slice(0, 2)
          .map((request) => `Proof request: ${request}`),
      ],
      sourceDocumentIds: uniqueIds(
        unknownPatternEngine.signals.flatMap((signal) => signal.relatedDocumentIds)
      ),
    }),
    buildArtifact({
      id: "confidence-calibration",
      title: "Confidence calibration",
      status: confidenceCalibrationStatus,
      summary:
        confidenceCalibrationStatus === "ready"
          ? "Tina's claimed certainty and earned support are aligned across the major backend judgment domains."
          : confidenceCalibrationStatus === "waiting"
            ? "Tina is keeping some confidence under reviewer control because parts of the file are not fully earned yet."
            : "Tina should fail closed because confidence debt is still blocking a safe reviewer-grade posture.",
      includes: [
        `Overall status: ${confidenceCalibration.overallStatus}`,
        `Recommended posture: ${confidenceCalibration.recommendedPosture.replace(/_/g, " ")}`,
        `Checks: ${confidenceCalibration.checks.length}`,
        `Debt items: ${confidenceCalibration.debts.length}`,
        ...confidenceCalibration.checks
          .slice(0, 3)
          .map(
            (check) =>
              `${check.title} [${check.status}] claimed ${check.claimedConfidence}, earned ${check.supportedConfidence}`
          ),
        ...confidenceCalibration.debts
          .slice(0, 2)
          .map((debt) => `Debt: ${debt.title} [${debt.severity}]`),
      ],
      sourceDocumentIds: uniqueIds(
        confidenceCalibration.checks.flatMap((check) => check.relatedDocumentIds)
      ),
    }),
    buildArtifact({
      id: "case-memory-ledger",
      title: "Durable case memory and decision ledger",
      status: caseMemoryLedgerStatus,
      summary:
        caseMemoryLedgerStatus === "ready"
          ? "Tina has a stable reviewer-approved anchor and a durable history of why the live package is still trustworthy."
          : caseMemoryLedgerStatus === "waiting"
            ? "Tina has reviewer history, but she still needs a fresh anchor before she should sound durably settled."
            : "Tina remembers the reviewer history, but the live package drift or open overrides mean she should not lean on it yet.",
      includes: [
        `Overall status: ${caseMemoryLedger.overallStatus}`,
        `Active anchor: ${caseMemoryLedger.activeAnchorSnapshotId ?? "None"}`,
        `Open overrides: ${caseMemoryLedger.openOverrideCount}`,
        `Drift reasons: ${caseMemoryLedger.driftReasons.length}`,
        ...caseMemoryLedger.driftReasons.slice(0, 3),
        ...caseMemoryLedger.overrides
          .slice(0, 2)
          .map((override) => `${override.summary} [${override.status}]`),
        ...caseMemoryLedger.entries
          .slice(0, 2)
          .map((entry) => `${entry.title} [${entry.severity}]`),
      ],
    }),
    buildArtifact({
      id: "reviewer-override-governance",
      title: "Reviewer override governance",
      status: reviewerOverrideGovernanceStatus,
      summary:
        reviewerOverrideGovernanceStatus === "ready"
          ? "Reviewer overrides are anchored tightly enough that Tina can keep them as bounded reusable guardrails."
          : reviewerOverrideGovernanceStatus === "waiting"
            ? "Reviewer overrides are still active, so Tina should keep some postures bounded and reviewer-controlled."
            : "Reviewer overrides and acceptance deltas still need explicit policy follow-through before Tina widens certainty.",
      includes: [
        `Overall status: ${reviewerOverrideGovernance.overallStatus}`,
        `Open overrides: ${reviewerOverrideGovernance.openOverrideCount}`,
        `Anchored overrides: ${reviewerOverrideGovernance.anchoredOverrideCount}`,
        `Policy updates still needed: ${reviewerOverrideGovernance.policyUpdateRequiredCount}`,
        `Blocking acceptance deltas: ${reviewerOverrideGovernance.blockingAcceptanceDeltaCount}`,
        ...reviewerOverrideGovernance.items
          .slice(0, 3)
          .map(
            (item) =>
              `${item.title} [${item.status} | ${item.policyState} | ${item.trustBoundary}]`
          ),
        ...reviewerOverrideGovernance.acceptanceDeltas
          .slice(0, 2)
          .map((delta) => `${delta.title} [${delta.status} | ${delta.severity}]`),
        ...reviewerOverrideGovernance.recommendedBenchmarkScenarioIds
          .slice(0, 2)
          .map((scenarioId) => `Benchmark scenario: ${scenarioId}`),
      ],
    }),
    buildArtifact({
      id: "reviewer-policy-versioning",
      title: "Reviewer policy versioning",
      status: reviewerPolicyVersioningStatus,
      summary:
        reviewerPolicyVersioningStatus === "ready"
          ? "Reviewer-approved lessons are benchmark-backed tightly enough to act like bounded reusable policy."
          : reviewerPolicyVersioningStatus === "waiting"
            ? "Reviewer policy tracks are maturing, but Tina still needs benchmark or release work before widening certainty."
            : "Reviewer policy tracks are still blocked by open deltas, open overrides, or missing release maturity.",
      includes: [
        `Overall status: ${reviewerPolicyVersioning.overallStatus}`,
        `Active policy tracks: ${reviewerPolicyVersioning.activePolicyCount}`,
        `Ready to promote: ${reviewerPolicyVersioning.readyToPromoteCount}`,
        `Benchmark coverage gaps: ${reviewerPolicyVersioning.benchmarkCoverageGapCount}`,
        ...reviewerPolicyVersioning.items.slice(0, 3).map(
          (item) =>
            `${item.title} [${item.status} | ${item.benchmarkCoverageStatus}${item.currentVersionId ? ` | ${item.currentVersionId}` : ""}]`
        ),
        ...reviewerPolicyVersioning.items
          .flatMap((item) => item.topPriorityBenchmarkScenarioIds)
          .slice(0, 2)
          .map((scenarioId) => `Top-priority benchmark: ${scenarioId}`),
      ],
      sourceDocumentIds: allDocumentIds,
    }),
    buildArtifact({
      id: "reviewer-acceptance-reality",
      title: "Reviewer acceptance reality",
      status: reviewerAcceptanceRealityStatus,
      summary:
        reviewerAcceptanceRealityStatus === "ready"
          ? "Observed reviewer outcomes are strong enough that Tina can lean on real acceptance history as a bounded trust signal."
          : reviewerAcceptanceRealityStatus === "waiting"
            ? "Tina has some observed reviewer acceptance history, but it is still thin or not durable enough to widen certainty aggressively."
            : "Observed reviewer outcomes are regressing or stale enough that Tina should tighten trust language immediately.",
      includes: [
        `Overall status: ${reviewerAcceptanceReality.overallStatus}`,
        `Observed themes: ${reviewerAcceptanceReality.totalObservedThemeCount}`,
        `Observed acceptance rate: ${reviewerAcceptanceReality.observedAcceptanceRate}%`,
        `Durable acceptance rate: ${reviewerAcceptanceReality.durableAcceptanceRate}%`,
        `Top-priority accepted coverage: ${reviewerAcceptanceReality.topPriorityAcceptedCoverageCount}`,
        ...reviewerAcceptanceReality.items.slice(0, 3).map(
          (item) =>
            `${item.title} [${item.outcome}${item.policyTrackStatus ? ` | ${item.policyTrackStatus}` : ""}]`
        ),
      ],
      sourceDocumentIds: allDocumentIds,
    }),
    buildArtifact({
      id: "entity-treatment-judgment",
      title: "Entity treatment judgment",
      status: entityJudgmentStatus,
      summary: entityJudgment.summary,
      includes: [
        entityJudgment.likelyFederalTreatment,
        ...entityJudgment.reasons.slice(0, 3),
        ...entityJudgment.questions.slice(0, 3).map((question) => `${question.title} [${question.severity}]`),
      ],
      sourceDocumentIds: uniqueIds(
        entityJudgment.questions.flatMap((question) => question.relatedDocumentIds)
      ),
    }),
    buildArtifact({
      id: "federal-return-requirements",
      title: "Federal return requirements",
      status: federalReturnRequirementsStatus,
      summary: federalReturnRequirements.summary,
      includes: [
        `Return family: ${federalReturnRequirements.returnFamily}`,
        `Tina can finish this lane: ${federalReturnRequirements.canTinaFinishLane ? "Yes" : "No"}`,
        ...federalReturnRequirements.items
          .slice(0, 4)
          .map((item) => `${item.title} [${item.status}]`),
      ],
    }),
    buildArtifact({
      id: "entity-record-matrix",
      title: "Entity record matrix",
      status: entityRecordMatrixStatus,
      summary:
        entityRecordMatrixStatus === "ready"
          ? "Tina sees the lane-critical entity records for the current return family."
          : entityRecordMatrixStatus === "waiting"
            ? "Tina has part of the lane-critical entity records, but some are still thin or missing."
            : "Tina still lacks critical entity-return records for this lane.",
      includes: [
        `Entity record items: ${entityRecordMatrix.items.length}`,
        ...entityRecordMatrix.items
          .slice(0, 4)
          .map((item) => `${item.title} [${item.status} | ${item.criticality}]`),
      ],
      sourceDocumentIds: uniqueIds(
        entityRecordMatrix.items.flatMap((item) => item.matchedDocumentIds)
      ),
    }),
    buildArtifact({
      id: "entity-economics-readiness",
      title: "Entity economics readiness",
      status: entityEconomicsStatus,
      summary:
        entityEconomicsStatus === "ready"
          ? "Tina has a coherent owner, partner, or shareholder economics story for this lane."
          : entityEconomicsStatus === "waiting"
            ? "Tina has a partial economics story, but reviewer judgment still matters."
            : "Tina still lacks the economics support needed to trust entity-specific prep.",
      includes: [
        `Economics checks: ${entityEconomicsReadiness.checks.length}`,
        ...entityEconomicsReadiness.checks
          .slice(0, 4)
          .map((check) => `${check.title} [${check.status}]`),
      ],
      sourceDocumentIds: uniqueIds(
        entityEconomicsReadiness.checks.flatMap((check) => check.relatedDocumentIds)
      ),
    }),
      buildArtifact({
        id: "owner-flow-basis-adjudication",
        title: "Owner-flow and basis adjudication",
        status: ownerFlowBasisStatus,
        summary:
          ownerFlowBasisStatus === "ready"
            ? "Tina has a coherent owner-flow and basis story that can travel into return calculations and reviewer artifacts."
            : ownerFlowBasisStatus === "waiting"
              ? "Tina sees the owner-flow and basis shape, but reviewer control still matters around footing, rollforward continuity, or transition economics."
              : "Tina still has blocked owner-flow or basis-sensitive areas around footing, rollforward continuity, loan/equity posture, or transition economics that can change treatment materially.",
        includes: [
          `Opening footing: ${ownerFlowBasis.openingFootingStatus.replace(/_/g, " ")}`,
          `Basis rollforward: ${ownerFlowBasis.basisRollforwardStatus.replace(/_/g, " ")}`,
          `Loan versus equity: ${ownerFlowBasis.loanEquityStatus.replace(/_/g, " ")}`,
          `Distribution taxability: ${ownerFlowBasis.distributionTaxabilityStatus.replace(/_/g, " ")}`,
          `Transition economics: ${ownerFlowBasis.transitionEconomicsStatus.replace(/_/g, " ")}`,
          `Adjudication items: ${ownerFlowBasis.items.length}`,
          ...ownerFlowBasis.items
            .slice(0, 4)
          .map((item) => `${item.title} [${item.status} | ${item.sensitivity}]`),
      ],
      sourceDocumentIds: uniqueIds(
        ownerFlowBasis.items.flatMap((item) => item.relatedDocumentIds)
      ),
    }),
    buildArtifact({
      id: "entity-return-calculations",
      title: "Entity return calculations",
      status: entityReturnCalculationsStatus,
      summary:
        entityReturnCalculationsStatus === "ready"
          ? "Tina has structured non-Schedule-C return values she can carry into rendered package artifacts."
          : entityReturnCalculationsStatus === "waiting"
            ? "Tina has structured non-Schedule-C return values, but reviewer-controlled completion still matters."
            : "Tina still lacks enough route, record, or economics support to trust the non-Schedule-C return values.",
      includes: [
        `Calculation items: ${entityReturnCalculations.items.length}`,
        ...entityReturnCalculations.items
          .slice(0, 4)
          .map(
            (item) => `${item.title} [${item.status}] (${item.fields.length} structured values)`
          ),
      ],
      sourceDocumentIds: uniqueIds(
        entityReturnCalculations.items.flatMap((item) => item.relatedDocumentIds)
      ),
    }),
    buildArtifact({
      id: "entity-return-schedule-families",
      title: "Entity return schedule families",
      status: entityReturnScheduleFamiliesStatus,
      summary:
        entityReturnScheduleFamiliesStatus === "ready"
          ? "Tina now carries explicit K-1, Schedule L, M-family, capital, and shareholder-flow schedule artifacts behind this entity return family."
          : entityReturnScheduleFamiliesStatus === "waiting"
            ? "Tina now carries explicit entity schedule-family artifacts, but some still need reviewer-controlled completion."
            : "Tina still has blocked K-1, Schedule L, M-family, capital, or shareholder-flow schedule artifacts behind this entity return family.",
      includes: [
        `Schedule families: ${entityReturnScheduleFamilies.items.length}`,
        ...entityReturnScheduleFamilies.items
          .slice(0, 5)
          .map(
            (item) =>
              `${item.title} [${item.status}] (${item.supportedFieldCount}/${item.fieldCount} supported fields)`
          ),
      ],
      sourceDocumentIds: uniqueIds(
        entityReturnScheduleFamilies.items.flatMap((item) => item.relatedDocumentIds)
      ),
    }),
    buildArtifact({
      id: "entity-return-schedule-family-payloads",
      title: "Entity return schedule-family payloads",
      status: entityReturnScheduleFamilyPayloadsStatus,
      summary:
        entityReturnScheduleFamilyPayloadsStatus === "ready"
          ? "Tina now carries sectioned K-1, Schedule L, M-family, capital, and flow payloads as near-filing-grade package truth behind this entity return family."
          : entityReturnScheduleFamilyPayloadsStatus === "waiting"
            ? "Tina now carries sectioned schedule-family payloads, but some still need reviewer-controlled completion before they behave filing-grade."
            : "Tina still has blocked schedule-family payloads behind this entity return family.",
      includes: [
        `Schedule-family payloads: ${entityReturnScheduleFamilyPayloads.items.length}`,
        ...entityReturnScheduleFamilyPayloads.items
          .slice(0, 5)
          .map(
            (item) =>
              `${item.title} [${item.status} | ${item.payloadReadiness} | ${item.completionPercent}% complete]`
          ),
      ],
      sourceDocumentIds: uniqueIds(
        entityReturnScheduleFamilyPayloads.items.flatMap((item) => item.relatedDocumentIds)
      ),
    }),
    buildArtifact({
      id: "entity-return-schedule-family-finalizations",
      title: "Entity return schedule-family finalizations",
      status: entityReturnScheduleFamilyFinalizationsStatus,
      summary:
        entityReturnScheduleFamilyFinalizationsStatus === "ready"
          ? "Tina now carries line-oriented K-1, Schedule L, M-family, capital, and flow finalizations behind this entity return family."
          : entityReturnScheduleFamilyFinalizationsStatus === "waiting"
            ? "Tina now carries line-oriented schedule-family finalizations, but some still need reviewer-controlled completion before they behave filing-grade."
            : "Tina still has blocked schedule-family finalization outputs behind this entity return family.",
      includes: [
        `Schedule-family finalizations: ${entityReturnScheduleFamilyFinalizations.items.length}`,
        ...entityReturnScheduleFamilyFinalizations.items
          .slice(0, 5)
          .map(
            (item) =>
              `${item.title} [${item.status} | ${item.finalizationReadiness} | ${item.completionPercent}%]`
          ),
      ],
      sourceDocumentIds: uniqueIds(
        entityReturnScheduleFamilyFinalizations.items.flatMap((item) => item.relatedDocumentIds)
      ),
    }),
    buildArtifact({
      id: "entity-return-support-artifacts",
      title: "Entity return support artifacts",
      status: entityReturnSupportArtifactsStatus,
      summary:
        entityReturnSupportArtifactsStatus === "ready"
          ? "Tina has explicit K-1, capital, balance-sheet, equity, or compensation support artifacts behind this entity return family."
          : entityReturnSupportArtifactsStatus === "waiting"
            ? "Tina has explicit entity support artifacts, but some still need reviewer-controlled completion."
            : "Tina still has blocked K-1, capital, balance-sheet, equity, or compensation support artifacts behind this entity return family.",
      includes: [
        `Support artifacts: ${entityReturnSupportArtifacts.items.length}`,
        ...entityReturnSupportArtifacts.items
          .slice(0, 5)
          .map(
            (item) =>
              `${item.title} [${item.status}] (${item.supportedFieldCount}/${item.fieldCount} supported fields)`
          ),
      ],
      sourceDocumentIds: uniqueIds(
        entityReturnSupportArtifacts.items.flatMap((item) => item.relatedDocumentIds)
      ),
    }),
    buildArtifact({
      id: "entity-return-runbook",
      title: "Entity return runbook",
      status: entityReturnRunbookStatus,
      summary:
        entityReturnRunbookStatus === "ready"
          ? "Tina has a coherent runbook for the current return family."
          : entityReturnRunbookStatus === "waiting"
            ? "Tina has a usable runbook, but reviewer-controlled steps still remain."
            : "Tina still has blocked runbook steps before the lane feels execution-ready.",
      includes: [
        `Execution mode: ${entityReturnRunbook.executionMode}`,
        ...entityReturnRunbook.steps
          .slice(0, 5)
          .map((step) => `${step.title} [${step.status} | ${step.audience}]`),
      ],
    }),
    buildArtifact({
      id: "entity-return-package-plan",
      title: "Entity return package plan",
      status: entityReturnPackagePlanStatus,
      summary:
        entityReturnPackagePlanStatus === "ready"
          ? "Tina now names the actual return-family deliverables for this lane, not just the runbook."
          : entityReturnPackagePlanStatus === "waiting"
            ? "Tina can name the return-family deliverables, but some are still reviewer-controlled."
            : "Tina can name the return-family deliverables, but some are still blocked by route, record, or economics gaps.",
      includes: [
        `Execution mode: ${entityReturnPackagePlan.executionMode}`,
        `Package items: ${entityReturnPackagePlan.items.length}`,
        ...entityReturnPackagePlan.items
          .slice(0, 5)
          .map(
            (item) =>
              `${item.title} [${item.status} | ${item.kind} | ${item.executionOwner}]`
          ),
      ],
      sourceDocumentIds: uniqueIds(
        entityReturnPackagePlan.items.flatMap((item) => item.relatedDocumentIds)
      ),
    }),
    buildArtifact({
      id: "ownership-timeline",
      title: "Ownership timeline",
      status: ownershipTimelineStatus,
      summary: ownershipTimeline.summary,
      includes: ownershipTimeline.events
        .slice(0, 4)
        .map((event) => `${event.title} [${event.status}]`),
      sourceDocumentIds: uniqueIds(
        ownershipTimeline.events.flatMap((event) => event.relatedDocumentIds)
      ),
    }),
    buildArtifact({
      id: "treatment-judgment",
      title: "Tax treatment judgment",
      status: treatmentJudgmentStatus,
      summary: treatmentJudgment.summary,
      includes: [
        ...treatmentJudgment.items
          .slice(0, 4)
          .map((item) => `${item.title} [${item.taxPositionBucket}]`),
      ],
      sourceDocumentIds: uniqueIds(
        treatmentJudgment.items.flatMap((item) => item.relatedDocumentIds)
      ),
    }),
    buildArtifact({
      id: "cpa-cover-note",
      title: "CPA cover note",
      status: coverNoteStatus,
      summary:
        coverNoteStatus === "ready"
          ? "Tina can frame the packet for a reviewer in plain language."
          : coverNoteStatus === "waiting"
            ? "Tina can draft the cover note, but a few review items still belong at the top."
            : "Tina can explain the packet, but she still has blockers a CPA should see first.",
      includes: [
        `Business: ${draft.profile.businessName || "Still needed"}`,
        `Tax year: ${draft.profile.taxYear || "Still needed"}`,
        `Lane: ${lane.title}`,
        `Start-path route: ${startPath.route}`,
        `Package check: ${packageReadiness.level.replace(/_/g, " ")}`,
      ],
      relatedReadinessItemIds: packageReadiness.items.map((item) => item.id),
      sourceDocumentIds: readinessDocumentIds,
    }),
    buildArtifact({
      id: "source-paper-index",
      title: "Source paper index",
      status: sourceIndexStatus,
      summary:
        sourceIndexStatus === "ready"
          ? "Tina has enough saved papers to hand a reviewer a clean starting stack."
          : "Tina still wants more papers before this source list feels complete.",
      includes: [
        formatCount(draft.documents.length, "saved paper"),
        draft.priorReturnDocumentId
          ? "Prior-year return is attached"
          : "Prior-year return is not attached yet",
        `${draft.documentReadings.filter((reading) => reading.status === "complete").length} paper read${draft.documentReadings.filter((reading) => reading.status === "complete").length === 1 ? "" : "s"} complete`,
        requiredChecklistItems.length > 0
          ? `${formatCount(requiredChecklistItems.length, "required ask")} still open`
          : "Required paper asks are covered",
      ],
      sourceDocumentIds: allDocumentIds,
    }),
    buildArtifact({
      id: "reviewer-learning-loop",
      title: "Reviewer learning loop",
      status: reviewerLearningLoopStatus,
      summary:
        reviewerLearningLoopStatus === "ready"
          ? "Tina has anchored reviewer lessons and is preserving them as reusable backend guardrails."
          : reviewerLearningLoopStatus === "waiting"
            ? "Tina has reviewer lessons queued for policy and regression reuse, but none are severe enough to stop the whole file."
            : "Tina has reviewer lessons that should become explicit policy and regression updates before confidence widens again.",
      includes: [
        `Overall status: ${reviewerLearningLoop.overallStatus}`,
        `Active lessons: ${reviewerLearningLoop.activeLessonCount}`,
        `Anchored lessons: ${reviewerLearningLoop.anchoredLessonCount}`,
        `Policy candidates: ${reviewerLearningLoop.policyCandidateCount}`,
        ...reviewerLearningLoop.policyCandidates
          .slice(0, 3)
          .map((candidate) => `${candidate.title} [${candidate.priority}]`),
        ...reviewerLearningLoop.regressionTargets
          .slice(0, 2)
          .map(
            (target) =>
              `${target.title}${target.fixtureId ? ` (${target.fixtureId})` : ""}`
          ),
      ],
      sourceDocumentIds: allDocumentIds,
    }),
    buildArtifact({
      id: "workpaper-trace",
      title: "Workpaper trace",
      status: workpaperTraceStatus,
      summary:
        workpaperTraceStatus === "ready"
          ? "Tina can show how the return-facing lines trace back to saved papers."
          : "Tina still needs return-facing lines before the workpaper trace is useful.",
      includes: [
        formatCount(draft.reviewerFinal.lines.length, "review line"),
        formatCount(draft.scheduleCDraft.fields.length, "Schedule C field"),
        formatCount(draft.scheduleCDraft.notes.length, "review note"),
      ],
      relatedFieldIds: draft.scheduleCDraft.fields.map((field) => field.id),
      relatedNoteIds: draft.scheduleCDraft.notes.map((note) => note.id),
      sourceDocumentIds: reviewerFinalDocumentIds,
    }),
    buildArtifact({
      id: "authority-and-risk",
      title: "Authority and risk summary",
      status: authorityStatus,
      summary:
        authorityStatus === "ready"
          ? "Tina does not see authority blockers in the current packet."
          : authorityStatus === "waiting"
            ? "Tina still has authority notes or review calls that should travel with the packet."
            : "Tina still has tax moves that need proof before a reviewer should trust them.",
      includes: [
        formatCount(draft.authorityWork.length, "authority work item"),
        formatCount(citationCount, "citation"),
        formatCount(authorityBlockedAdjustments.length, "authority blocker"),
        formatCount(reviewAdjustments.length, "tax move waiting on review"),
      ],
      relatedReadinessItemIds: draft.packageReadiness.items
        .filter((item) => item.id.startsWith("adjustment-"))
        .map((item) => item.id),
      sourceDocumentIds: uniqueIds(
        draft.taxAdjustments.adjustments.flatMap((adjustment) => adjustment.sourceDocumentIds)
      ),
    }),
    buildArtifact({
      id: "schedule-c-draft",
      title: "Schedule C draft",
      status: scheduleDraftStatus,
      summary:
        scheduleDraftStatus === "ready"
          ? "Tina has a first supported Schedule C draft ready for CPA review."
          : scheduleDraftStatus === "waiting"
            ? "Tina drafted part of Schedule C, but some boxes or notes still need review."
            : "Tina should not hand off the Schedule C draft until its blocking boxes or notes are cleared.",
      includes: [
        formatCount(draft.scheduleCDraft.fields.length, "draft field"),
        formatCount(draft.scheduleCDraft.notes.length, "draft note"),
        formatCount(fieldOrNoteBlockingItems.length, "blocking field or note"),
        formatCount(fieldOrNoteAttentionItems.length, "field or note needing review"),
      ],
      relatedFieldIds: draft.scheduleCDraft.fields.map((field) => field.id),
      relatedNoteIds: draft.scheduleCDraft.notes.map((note) => note.id),
      relatedReadinessItemIds: uniqueIds([
        ...fieldOrNoteBlockingItems.map((item) => item.id),
        ...fieldOrNoteAttentionItems.map((item) => item.id),
      ]),
      sourceDocumentIds: scheduleCDocumentIds,
    }),
    buildArtifact({
      id: "open-items-list",
      title: "Open items list",
      status: openItemsStatus,
      summary:
        openItemsStatus === "ready"
          ? "Tina does not see open blockers in the current packet."
          : openItemsStatus === "waiting"
            ? "Tina can hand over the packet, but the reviewer should see the open review list."
            : "Tina still has blocking items that belong at the front of the packet.",
      includes: [
        formatCount(blockingReadinessItems.length, "blocking item"),
        formatCount(attentionReadinessItems.length, "review item"),
      ],
      relatedReadinessItemIds: packageReadiness.items.map((item) => item.id),
      sourceDocumentIds: readinessDocumentIds,
    }),
    buildArtifact({
      id: "schedule-c-form-output",
      title: "Schedule C form output",
      status: formOutputStatus,
      summary:
        formOutputStatus === "ready"
          ? "Tina has a structured Schedule C form snapshot with no current readiness blockers."
          : formOutputStatus === "waiting"
            ? "Tina has form output, but a reviewer should clear the remaining readiness attention items before trusting it as final."
            : "Tina has form output, but blocking readiness issues still prevent treating it as printable final output.",
      includes: [
        `Form fields mapped: ${scheduleCReturn.fields.length}`,
        `Validation issues: ${scheduleCReturn.validationIssues.length}`,
        `Form readiness: ${formReadiness.level}`,
        ...scheduleCReturn.validationIssues.slice(0, 3).map((issue) => issue.title),
        ...formReadiness.reasons.slice(0, 2).map((reason) => `${reason.title} [${reason.severity}]`),
      ],
      relatedFieldIds: scheduleCReturn.fields.flatMap((field) => field.sourceFieldIds),
    }),
    buildArtifact({
      id: "official-form-coverage",
      title: "Official-form coverage",
      status: formCoverageStatus,
      summary:
        formCoverageStatus === "ready"
          ? "Tina covers the currently relevant sections of the supported Schedule C output."
          : formCoverageStatus === "waiting"
            ? "Tina covers the core supported sections, but some Schedule C sections still need reviewer attention."
            : "Tina still has unsupported Schedule C sections, so she should not imply full official-form support yet.",
      includes: [
        `Coverage items: ${formCoverage.items.length}`,
        ...formCoverage.items.slice(0, 4).map((item) => `${item.title} [${item.status}]`),
      ],
    }),
    buildArtifact({
      id: "official-form-fill-plan",
      title: "Official-form fill plan",
      status: officialFormFillStatus,
      summary:
        officialFormFillStatus === "ready"
          ? "Tina mapped the stored official Schedule C blank with a clean placement plan."
          : officialFormFillStatus === "waiting"
            ? "Tina mapped the official blank, but some placements still need reviewer attention."
            : "Tina cannot yet treat the official-form fill plan as ready because blocked placements remain.",
      includes: [
        `Template: ${officialFormFill.templateTitle ?? "Missing"}`,
        `Placements: ${officialFormFill.placements.length}`,
        ...officialFormFill.placements
          .slice(0, 4)
          .map((placement) => `${placement.label} [${placement.status}]`),
      ],
      sourceDocumentIds: uniqueIds(
        officialFormFill.placements.flatMap((placement) => placement.relatedDocumentIds)
      ),
    }),
    buildArtifact({
      id: "official-form-execution",
      title: "Official-form execution",
      status: officialFormExecutionStatus,
      summary:
        officialFormExecutionStatus === "ready"
          ? "Tina has a coherent render-plan-backed execution stack for the current federal lane."
          : officialFormExecutionStatus === "waiting"
            ? "Tina has a render-plan-backed execution stack, but some forms still need reviewer-controlled cleanup."
            : "Tina still has blocked form-execution work before she should act finished.",
      includes: [
        `Execution items: ${officialFormExecution.items.length}`,
        ...officialFormExecution.items
          .slice(0, 4)
          .map(
            (item) =>
              `${item.title} [${item.status}] ${item.readyPlacementCount}/${item.placementCount} placements ready`
          ),
      ],
      sourceDocumentIds: uniqueIds(
        officialFormExecution.items.flatMap((item) => item.relatedDocumentIds)
      ),
    }),
    buildArtifact({
      id: "form-traceability",
      title: "Source-to-form traceability",
      status: formTraceStatus,
      summary:
        formTraceStatus === "ready"
          ? "Tina can trace each Schedule C form line back to draft fields and evidence."
          : formTraceStatus === "waiting"
            ? "Tina has form traceability, but some lines still need cleaner evidence links."
            : "Tina does not have enough source-to-form traceability to call this reviewer-grade yet.",
      includes: [
        `Form trace lines: ${formTrace.lines.length}`,
        `Fully traced lines: ${traceableLineCount}`,
      ],
      relatedFieldIds: formTrace.lines.flatMap((line) => line.sourceFieldIds),
      sourceDocumentIds: uniqueIds(formTrace.lines.flatMap((line) => line.sourceDocumentIds)),
    }),
    buildArtifact({
      id: "books-reconciliation",
      title: "Books reconciliation",
      status: booksReconciliationStatus,
      summary:
        booksReconciliationStatus === "ready"
          ? "Tina reconciled the reviewer-final books picture to the return-facing Schedule C output."
          : booksReconciliationStatus === "waiting"
            ? "Tina has a reconciliation layer, but some checks still need reviewer attention."
            : "Tina still sees blocked books-to-return reconciliation checks.",
      includes: [
        `Reconciliation checks: ${booksReconciliation.checks.length}`,
        `Material variances: ${booksReconciliation.materialVarianceCount}`,
        `Unsupported balances: ${booksReconciliation.unsupportedBalanceCount}`,
        `Ledger blocked groups: ${ledgerReconstruction.blockedGroupCount}`,
        `Evidence credibility: ${evidenceCredibility.overallStatus}`,
        ...booksReconciliation.checks
          .slice(0, 4)
          .map((check) => `${check.title} [${check.status}]`),
      ],
      sourceDocumentIds: uniqueIds(
        booksReconciliation.checks.flatMap((check) => check.relatedDocumentIds)
      ),
    }),
    buildArtifact({
      id: "accounting-artifact-coverage",
      title: "Accounting artifact coverage",
      status: accountingArtifactCoverageStatus,
      summary:
        accountingArtifactCoverageStatus === "ready"
          ? "Tina has the critical bookkeeping artifacts she needs for a strong accounting-facing review pass."
          : accountingArtifactCoverageStatus === "waiting"
            ? "Tina has partial bookkeeping artifact coverage, but some accounting support is still thin."
            : "Tina is still missing critical bookkeeping artifacts that keep the accounting picture from feeling veteran-grade.",
      includes: [
        `Coverage items: ${accountingArtifactCoverage.items.length}`,
        `Ledger concentration groups: ${ledgerReconstruction.concentratedGroupCount}`,
        `Blocking credibility factors: ${evidenceCredibility.blockingFactorCount}`,
        ...accountingArtifactCoverage.items
          .slice(0, 4)
          .map((item) => `${item.title} [${item.status} | ${item.criticality}]`),
      ],
      sourceDocumentIds: uniqueIds(
        accountingArtifactCoverage.items.flatMap((item) => item.matchedDocumentIds)
      ),
    }),
    buildArtifact({
      id: "payroll-compliance-reconstruction",
      title: "Payroll compliance reconstruction",
      status:
        payrollCompliance.overallStatus === "not_applicable"
          ? "ready"
          : payrollComplianceStatus,
      summary:
        payrollCompliance.overallStatus === "not_applicable"
          ? "Tina does not currently see a payroll compliance story that should travel with the packet."
          : payrollComplianceStatus === "ready"
            ? "Tina sees a coherent payroll operations and compliance trail."
            : payrollComplianceStatus === "waiting"
              ? "Payroll support is present, but Tina still wants reviewer control over payroll compliance or labor classification."
              : "Payroll activity appears real, but filings, deposits, or owner-compensation proof are still broken.",
      includes: [
        `Posture: ${payrollCompliance.posture.replace(/_/g, " ")}`,
        `Worker classification: ${payrollCompliance.workerClassification.replace(/_/g, " ")}`,
        `Likely missing filings: ${payrollCompliance.likelyMissingFilings.join(", ") || "None"}`,
        ...payrollCompliance.questions.slice(0, 2),
      ],
      sourceDocumentIds: payrollCompliance.relatedDocumentIds,
    }),
    buildArtifact({
      id: "books-normalization",
      title: "Books normalization",
      status: booksNormalizationStatus,
      summary:
        booksNormalizationStatus === "ready"
          ? "Tina does not currently see messy-books normalization risks in saved facts."
          : booksNormalizationStatus === "waiting"
            ? "Tina sees bookkeeping classification issues that should travel with reviewer context."
            : "Tina still sees blocking ledger-normalization risks that should stay in front of the reviewer.",
      includes: [
        `Normalization issues: ${booksNormalization.issues.length}`,
        ...booksNormalization.issues.slice(0, 3).map((issue) => issue.title),
      ],
      sourceDocumentIds: uniqueIds(
        booksNormalization.issues.flatMap((issue) => issue.documentIds)
      ),
    }),
    buildArtifact({
      id: "attachment-statements",
      title: "Attachment statements",
      status: attachmentStatementStatus,
      summary:
        attachmentStatementStatus === "ready"
          ? "Tina has the needed attachment statements in view for the current file."
          : attachmentStatementStatus === "waiting"
            ? "Tina has attachment statements, but some still need reviewer cleanup."
            : "Attachment-grade statement work still blocks final-form confidence.",
      includes: [
        `Attachment statements: ${attachmentStatements.items.length}`,
        ...attachmentStatements.items
          .slice(0, 4)
          .map((item) => `${item.title} [${item.status}]`),
      ],
      sourceDocumentIds: uniqueIds(
        attachmentStatements.items.flatMap((item) => item.relatedDocumentIds)
      ),
    }),
    buildArtifact({
      id: "attachment-schedules",
      title: "Attachment schedules",
      status: attachmentScheduleStatus,
      summary:
        attachmentScheduleStatus === "ready"
          ? "Tina converted attachment-heavy areas into structured schedules the reviewer can inspect quickly."
          : attachmentScheduleStatus === "waiting"
            ? "Tina built structured schedules, but some still need reviewer cleanup."
            : "Structured attachment schedules still block final-form confidence.",
      includes: [
        `Structured schedules: ${attachmentSchedules.items.length}`,
        ...attachmentSchedules.items
          .slice(0, 4)
          .map((item) => `${item.title} [${item.status}]`),
      ],
      sourceDocumentIds: uniqueIds(
        attachmentSchedules.items.flatMap((item) => item.relatedDocumentIds)
      ),
    }),
    buildArtifact({
      id: "companion-form-calculations",
      title: "Companion form calculations",
      status: companionFormCalculationsStatus,
      summary:
        companionFormCalculationsStatus === "ready"
          ? "Tina has concrete carry or estimate calculations for the currently relevant companion forms."
          : companionFormCalculationsStatus === "waiting"
            ? "Tina has companion-form calculations, but some still need reviewer-controlled completion."
            : "Tina still lacks blocked companion-form inputs or support.",
      includes: [
        `Calculation items: ${companionFormCalculations.items.length}`,
        ...companionFormCalculations.items
          .slice(0, 4)
          .map((item) => `${item.title} [${item.status}]`),
      ],
      sourceDocumentIds: uniqueIds(
        companionFormCalculations.items.flatMap((item) => item.relatedDocumentIds)
      ),
    }),
    buildArtifact({
      id: "companion-form-render-plan",
      title: "Companion form render plan",
      status: companionFormRenderPlanStatus,
      summary:
        companionFormRenderPlanStatus === "ready"
          ? "Tina has explicit companion-form field payloads that are ready to drive preview rendering."
          : companionFormRenderPlanStatus === "waiting"
            ? "Tina has companion-form field payloads, but some still need reviewer-controlled completion."
            : "Tina still lacks enough support to trust the companion-form render payloads.",
      includes: [
        `Render-plan items: ${companionFormRenderPlan.items.length}`,
        ...companionFormRenderPlan.items
          .slice(0, 4)
          .map((item) => `${item.title} [${item.status}] (${item.fieldValues.length} fields)`),
      ],
      sourceDocumentIds: uniqueIds(
        companionFormRenderPlan.items.flatMap((item) => item.relatedDocumentIds)
      ),
    }),
    buildArtifact({
      id: "industry-playbooks",
      title: "Industry playbooks",
      status: industryPlaybookStatus,
      summary:
        industryPlaybookStatus === "ready"
          ? "Tina identified the primary industry playbook and can use it to sharpen treatment and planning."
          : "Tina only has a generic industry playbook so far.",
      includes: industryPlaybooks.items
        .slice(0, 3)
        .map((item) => `${item.title} [${item.fit}]`),
      sourceDocumentIds: uniqueIds(
        industryPlaybooks.items.flatMap((item) => item.relatedDocumentIds)
      ),
    }),
    buildArtifact({
      id: "industry-evidence-matrix",
      title: "Industry evidence matrix",
      status: industryEvidenceMatrixStatus,
      summary:
        industryEvidenceMatrixStatus === "ready"
          ? "Tina has the key primary-industry records covered by both facts and documents."
          : industryEvidenceMatrixStatus === "waiting"
            ? "Tina has partial industry-specific record coverage, but some needs are still thin."
            : "Tina is still missing industry-specific records that matter to reviewer confidence.",
      includes: [
        `Industry evidence items: ${industryEvidenceMatrix.items.length}`,
        ...industryEvidenceMatrix.items
          .slice(0, 4)
          .map((item) => `${item.requirement} [${item.status}]`),
      ],
      sourceDocumentIds: uniqueIds(
        industryEvidenceMatrix.items.flatMap((item) => item.matchedDocumentIds)
      ),
    }),
    buildArtifact({
      id: "tax-opportunity-engine",
      title: "Tax opportunity engine",
      status: taxOpportunityStatus,
      summary:
        taxOpportunityStatus === "ready"
          ? "Tina sees reviewer-usable tax opportunities instead of only speculative ideas."
          : taxOpportunityStatus === "waiting"
            ? "Tina sees opportunities, but most still need facts or authority before they feel usable."
            : "Tina does not currently have a credible usable opportunity queue.",
      includes: [
        `Ready opportunities: ${readyTaxOpportunityCount}`,
        ...taxOpportunityEngine.items
          .slice(0, 4)
          .map((item) => `${item.title} [${item.status}]`),
      ],
      sourceDocumentIds: uniqueIds(
        taxOpportunityEngine.items.flatMap((item) => item.relatedDocumentIds)
      ),
    }),
    buildArtifact({
      id: "tax-planning-memo",
      title: "Tax planning memo",
      status: taxPlanningMemoStatus,
      summary:
        taxPlanningMemoStatus === "ready"
          ? "Tina has a prioritized planning memo with actionable tax moves."
          : taxPlanningMemoStatus === "waiting"
            ? "Tina has a planning memo, but the best moves still need support."
            : "Tina's planning memo is still too thin to treat as a real advantage yet.",
      includes: [
        `Planning items: ${taxPlanningMemo.items.length}`,
        ...taxPlanningMemo.items
          .slice(0, 4)
          .map((item) => `${item.title} [${item.priority}]`),
      ],
      sourceDocumentIds: uniqueIds(
        taxPlanningMemo.items.flatMap((item) => item.relatedDocumentIds)
      ),
    }),
    buildArtifact({
      id: "planning-action-board",
      title: "Planning action board",
      status: planningActionBoardStatus,
      summary:
        planningActionBoardStatus === "ready"
          ? "Tina has a ranked board of planning moves that are close to reviewer-usable now."
          : planningActionBoardStatus === "waiting"
            ? "Tina has a ranked planning board, but most moves still need review or stronger proof."
            : "Tina's planning board is still too thin to treat as a serious advantage yet.",
      includes: [
        `Planning actions: ${planningActionBoard.items.length}`,
        ...planningActionBoard.items
          .slice(0, 4)
          .map((item) => `${item.title} [${item.priority} | ${item.status}]`),
      ],
      sourceDocumentIds: uniqueIds(
        planningActionBoard.items.flatMap((item) => item.relatedDocumentIds)
      ),
    }),
    buildArtifact({
      id: "authority-position-matrix",
      title: "Authority position matrix",
      status: authorityPositionMatrixStatus,
      summary:
        authorityPositionMatrixStatus === "ready"
          ? "Tina sees authority-backed positions that are close to reviewer-usable now."
          : authorityPositionMatrixStatus === "waiting"
            ? "Tina has a mixed authority-backed position matrix, but some items still need facts, law, or reviewer control."
            : "Tina's authority-backed position matrix is still too thin to trust as a real planning advantage.",
      includes: [
        `Authority positions: ${authorityPositionMatrix.items.length}`,
        ...authorityPositionMatrix.items
          .slice(0, 4)
          .map((item) => `${item.title} [${item.recommendation}]`),
      ],
      sourceDocumentIds: uniqueIds(
        authorityPositionMatrix.items.flatMap((item) => item.relatedDocumentIds)
      ),
    }),
    buildArtifact({
      id: "disclosure-readiness",
      title: "Disclosure readiness",
      status: disclosureReadinessStatus,
      summary:
        disclosureReadinessStatus === "ready"
          ? "Tina does not currently see positions that need separate disclosure handling."
          : disclosureReadinessStatus === "waiting"
            ? "Tina sees positions whose disclosure posture still needs reviewer judgment."
            : "Tina sees positions that likely require disclosure handling before they should move forward.",
      includes: [
        `Disclosure items: ${disclosureReadiness.items.length}`,
        ...disclosureReadiness.items
          .slice(0, 4)
          .map((item) => `${item.title} [${item.status}]`),
      ],
      sourceDocumentIds: uniqueIds(
        disclosureReadiness.items.flatMap((item) => item.relatedDocumentIds)
      ),
    }),
    buildArtifact({
      id: "reviewer-acceptance-forecast",
      title: "Reviewer acceptance forecast",
      status: reviewerAcceptanceForecastStatus,
      summary:
        reviewerAcceptanceForecastStatus === "ready"
          ? "Tina expects most non-routine positions to survive skeptical reviewer scrutiny cleanly."
          : reviewerAcceptanceForecastStatus === "waiting"
            ? "Tina expects reviewer pushback on some non-routine positions, but not blanket rejection."
            : "Tina expects a skeptical reviewer to stop or reject too many non-routine positions right now.",
      includes: [
        `Acceptance items: ${reviewerAcceptanceForecast.items.length}`,
        ...reviewerAcceptanceForecast.items
          .slice(0, 4)
          .map((item) => `${item.title} [${item.status}]`),
      ],
      sourceDocumentIds: uniqueIds(
        reviewerAcceptanceForecast.items.flatMap((item) => item.relatedDocumentIds)
      ),
    }),
    buildArtifact({
      id: "document-request-plan",
      title: "Document request plan",
      status: documentRequestPlanStatus,
      summary:
        documentRequestPlanStatus === "ready"
          ? "Tina does not currently see a missing-proof or missing-document action queue."
          : documentRequestPlanStatus === "waiting"
            ? "Tina has a queued document follow-up plan, but the file is not fully blocked by it."
            : "Tina still has immediate owner or reviewer requests before she should act finished.",
      includes: [
        `Request items: ${documentRequestPlan.items.length}`,
        ...documentRequestPlan.items
          .slice(0, 4)
          .map((item) => `${item.title} [${item.priority}]`),
      ],
      sourceDocumentIds: uniqueIds(
        documentRequestPlan.items.flatMap((item) => item.relatedDocumentIds)
      ),
    }),
    buildArtifact({
      id: "companion-form-plan",
      title: "Companion form plan",
      status: companionFormPlanStatus,
      summary:
        companionFormPlanStatus === "ready"
          ? "Tina mapped the companion form set cleanly for the current lane."
          : companionFormPlanStatus === "waiting"
            ? "Tina mapped the companion form set, but reviewer-controlled completion is still needed."
            : "The companion form set still has blocked required items.",
      includes: companionFormPlan.items
        .slice(0, 5)
        .map((item) => `${item.title} [${item.status}]`),
    }),
    buildArtifact({
      id: "cross-form-consistency",
      title: "Cross-form consistency",
      status: crossFormConsistencyStatus,
      summary:
        crossFormConsistencyStatus === "ready"
          ? "Tina's route, form plan, evidence, and package signals currently agree."
          : crossFormConsistencyStatus === "waiting"
            ? "Tina sees cross-form mismatches that still need reviewer attention."
            : "Tina sees blocking cross-form mismatches that should stay in front of the reviewer.",
      includes: [
        `Consistency issues: ${crossFormConsistency.issues.length}`,
        ...crossFormConsistency.issues
          .slice(0, 4)
          .map((issue) => `${issue.title} [${issue.severity}]`),
      ],
      sourceDocumentIds: uniqueIds(
        crossFormConsistency.issues.flatMap((issue) => issue.relatedDocumentIds)
      ),
    }),
    buildArtifact({
      id: "reviewer-challenge-forecast",
      title: "Reviewer challenge forecast",
      status: reviewerChallengeStatus,
      summary:
        reviewerChallengeStatus === "ready"
          ? "Tina does not currently see obvious skeptical-CPA challenge points beyond the normal packet review."
          : reviewerChallengeStatus === "waiting"
            ? "Tina sees challenge points that a reviewer is likely to ask about, but they are not all hard blockers."
            : "Tina sees blocking challenge points that would likely force a reviewer to stop or reroute the package.",
      includes: [
        `Challenge items: ${reviewerChallenges.items.length}`,
        ...reviewerChallenges.items.slice(0, 4).map((item) => `${item.title} [${item.severity}]`),
      ],
      relatedFieldIds: [],
      relatedNoteIds: [],
      relatedReadinessItemIds: [],
      sourceDocumentIds: uniqueIds(
        reviewerChallenges.items.flatMap((item) => item.relatedDocumentIds)
      ),
    }),
    buildArtifact({
      id: "decision-briefings",
      title: "Decision briefings",
      status: decisionBriefingsStatus,
      summary:
        decisionBriefingsStatus === "ready"
          ? "Tina has clean reviewer and owner briefings ready to travel with the file."
          : "Tina has briefings, but they still carry open questions that should stay visible.",
      includes: [
        `Reviewer questions: ${decisionBriefings.reviewer.openQuestions.length}`,
        `Owner questions: ${decisionBriefings.owner.openQuestions.length}`,
        ...decisionBriefings.reviewer.keyPoints.slice(0, 2),
        ...decisionBriefings.owner.keyPoints.slice(0, 2),
      ],
    }),
    buildArtifact({
      id: "review-bundle-export",
      title: "Reviewer bundle export",
      status: reviewBundleStatus,
      summary:
        reviewBundleStatus === "ready"
          ? "Tina can export one coherent reviewer bundle with packet, form output, trace, and route context."
          : reviewBundleStatus === "waiting"
            ? "Tina can export the reviewer bundle, but some companion artifacts still need cleanup before it feels final."
            : "Tina should not treat the reviewer bundle as final because blocked artifacts still sit inside it.",
      includes: [
        `Bundle files: ${reviewBundleFileCount}`,
        `Source mode: ${reviewBundleSourceMode}`,
        `Snapshot id: ${draft.reviewerSignoff.activeSnapshotId ?? "None"}`,
      ],
    }),
    buildArtifact({
      id: "reviewer-signoff-state",
      title: "Reviewer signoff state",
      status: signoffStatus,
      summary:
        signoffStatus === "ready"
          ? "A reviewer-approved package snapshot exists and still matches the live package."
          : signoffStatus === "waiting"
            ? "Tina can capture a stable snapshot next, but reviewer signoff is not locked yet."
            : "Reviewer signoff is blocked or stale, so Tina should not present this as a frozen reviewer-approved package.",
      includes: [
        `Package state: ${draft.reviewerSignoff.packageState.replace(/_/g, " ")}`,
        draft.reviewerSignoff.activeSnapshotId
          ? `Active snapshot: ${draft.reviewerSignoff.activeSnapshotId}`
          : "No active reviewer-approved snapshot",
        draft.reviewerSignoff.hasDriftSinceSignoff
          ? "Live draft drift detected after signoff"
          : "No drift detected after signoff",
        `${draft.packageSnapshots.length} snapshot${draft.packageSnapshots.length === 1 ? "" : "s"} captured`,
      ],
    }),
    buildArtifact({
      id: "reviewer-appendix",
      title: "Reviewer appendix",
      status: appendixStatus,
      summary:
        appendixStatus === "ready"
          ? "Tina does not see any appendix-only ideas that still need reviewer attention."
          : "Tina preserved unusual but plausible ideas for reviewer review without letting them silently affect the return.",
      includes: [
        formatCount(draft.appendix.items.length, "appendix item"),
        ...draft.appendix.items.slice(0, 3).map((item) => item.title),
      ],
      sourceDocumentIds: uniqueIds(draft.appendix.items.flatMap((item) => item.documentIds)),
    }),
  ];

  const readyCount = artifacts.filter((artifact) => artifact.status === "ready").length;
  const waitingCount = artifacts.filter((artifact) => artifact.status === "waiting").length;
  const blockedCount = artifacts.filter((artifact) => artifact.status === "blocked").length;

  let summary = `Tina prepared ${formatCount(artifacts.length, "packet section")}. ${formatCount(
    readyCount,
    "section"
  )} ready, ${formatCount(waitingCount, "section")} waiting, ${formatCount(
    blockedCount,
    "section"
  )} blocked.`;

  if (blockedCount === 0 && waitingCount === 0) {
    summary =
      "Tina prepared a full first CPA handoff packet. Nothing in the packet is still marked waiting or blocked.";
  }

  let nextStep =
    "Read through the packet once, then hand it to a CPA reviewer with the source papers attached.";
  if (blockedCount > 0) {
    nextStep =
      "Start with the blocked packet sections first. Tina should not hand this packet to a CPA yet.";
  } else if (waitingCount > 0) {
    nextStep =
      "Clear the waiting packet sections next so Tina can hand over a cleaner first review packet.";
  }

  return {
    lastRunAt: now,
    status: "complete",
    summary,
    nextStep,
    artifacts,
  };
}
