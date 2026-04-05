import { buildTinaAttachmentStatements } from "@/tina/lib/attachment-statements";
import { buildTinaAttachmentSchedules } from "@/tina/lib/attachment-schedules";
import { buildTinaAccountingArtifactCoverage } from "@/tina/lib/accounting-artifact-coverage";
import { buildTinaAuthorityPositionMatrix } from "@/tina/lib/authority-position-matrix";
import { buildTinaBooksNormalization } from "@/tina/lib/books-normalization";
import { buildTinaBooksReconciliation } from "@/tina/lib/books-reconciliation";
import { buildTinaBooksReconstruction } from "@/tina/lib/books-reconstruction";
import { buildTinaCaseMemoryLedger } from "@/tina/lib/case-memory-ledger";
import { buildTinaCompanionFormPlan } from "@/tina/lib/companion-form-plan";
import { buildTinaCompanionFormCalculations } from "@/tina/lib/companion-form-calculations";
import { buildTinaCompanionFormRenderPlan } from "@/tina/lib/companion-form-render-plan";
import { buildTinaConfidenceCalibration } from "@/tina/lib/confidence-calibration";
import { buildTinaCpaPacketExport } from "@/tina/lib/cpa-packet-export";
import { buildTinaCrossFormConsistency } from "@/tina/lib/cross-form-consistency";
import { buildTinaDecisionBriefings } from "@/tina/lib/decision-briefings";
import { buildTinaDocumentIntelligence } from "@/tina/lib/document-intelligence";
import { buildTinaDocumentRequestPlan } from "@/tina/lib/document-request-plan";
import { buildTinaDisclosureReadiness } from "@/tina/lib/disclosure-readiness";
import { buildTinaEvidenceCredibility } from "@/tina/lib/evidence-credibility";
import { buildTinaEntityEconomicsReadiness } from "@/tina/lib/entity-economics-readiness";
import { buildTinaEntityFilingRemediation } from "@/tina/lib/entity-filing-remediation";
import { buildTinaEntityJudgment } from "@/tina/lib/entity-judgment";
import { buildTinaEntityReturnCalculations } from "@/tina/lib/entity-return-calculations";
import { buildTinaEntityReturnScheduleFamilyFinalizations } from "@/tina/lib/entity-return-schedule-family-finalizations";
import { buildTinaEntityReturnScheduleFamilyPayloads } from "@/tina/lib/entity-return-schedule-family-payloads";
import { buildTinaEntityReturnScheduleFamilyArtifacts } from "@/tina/lib/entity-return-schedule-family-artifacts";
import { buildTinaEntityReturnSupportArtifacts } from "@/tina/lib/entity-return-support-artifacts";
import { buildTinaEntityRecordMatrix } from "@/tina/lib/entity-record-matrix";
import { buildTinaEntityReturnRunbook } from "@/tina/lib/entity-return-runbook";
import { buildTinaEvidenceSufficiency } from "@/tina/lib/evidence-sufficiency";
import { buildTinaFederalReturnClassification } from "@/tina/lib/federal-return-classification";
import { buildTinaFederalReturnRequirements } from "@/tina/lib/federal-return-requirements";
import { buildTinaFormReadiness } from "@/tina/lib/form-readiness";
import { buildTinaIndustryPlaybooks } from "@/tina/lib/industry-playbooks";
import { buildTinaIndustryEvidenceMatrix } from "@/tina/lib/industry-evidence-matrix";
import { buildTinaOfficialFederalFormTemplateSnapshot } from "@/tina/lib/official-form-templates";
import { readTinaOfficialFederalFormTemplateAsset } from "@/tina/lib/official-form-templates-server";
import { buildTinaOfficialFormFill } from "@/tina/lib/official-form-fill";
import { buildTinaOfficialFormExecution } from "@/tina/lib/official-form-execution";
import { buildTinaOwnerFlowBasisAdjudication } from "@/tina/lib/owner-flow-basis-adjudication";
import { buildTinaOperationalStatus } from "@/tina/lib/operational-status";
import { buildTinaOwnershipCapitalEvents } from "@/tina/lib/ownership-capital-events";
import { buildTinaOwnershipTimeline } from "@/tina/lib/ownership-timeline";
import { buildTinaLedgerReconstruction } from "@/tina/lib/ledger-reconstruction";
import { buildTinaMaterialityPriority } from "@/tina/lib/materiality-priority";
import { buildTinaPayrollComplianceReconstruction } from "@/tina/lib/payroll-compliance-reconstruction";
import { buildTinaSingleMemberEntityHistoryProof } from "@/tina/lib/single-member-entity-history-proof";
import { buildTinaSingleOwnerCorporateRouteProof } from "@/tina/lib/single-owner-corporate-route-proof";
import { buildTinaReviewerChallenges } from "@/tina/lib/reviewer-challenges";
import { buildTinaReviewerAcceptanceForecast } from "@/tina/lib/reviewer-acceptance-forecast";
import { buildTinaReviewerAcceptanceReality } from "@/tina/lib/reviewer-acceptance-reality";
import { buildTinaReviewerLearningLoop } from "@/tina/lib/reviewer-learning-loop";
import { buildTinaReviewerObservedDeltas } from "@/tina/lib/reviewer-observed-deltas";
import { buildTinaReviewerOverrideGovernance } from "@/tina/lib/reviewer-override-governance";
import { buildTinaReviewerPolicyVersioning } from "@/tina/lib/reviewer-policy-versioning";
import { buildTinaScheduleCPdfExport } from "@/tina/lib/schedule-c-pdf";
import { buildTinaScheduleCFormCoverage } from "@/tina/lib/schedule-c-form-coverage";
import { buildTinaScheduleCFormTrace } from "@/tina/lib/schedule-c-form-trace";
import { buildTinaScheduleCReturn } from "@/tina/lib/schedule-c-return";
import { buildTinaStartPathAssessment } from "@/tina/lib/start-path";
import { buildTinaTaxOpportunityEngine } from "@/tina/lib/tax-opportunity-engine";
import { buildTinaPlanningActionBoard } from "@/tina/lib/planning-action-board";
import { buildTinaTaxPlanningMemo } from "@/tina/lib/tax-planning-memo";
import { buildTinaTaxTreatmentPolicy } from "@/tina/lib/tax-treatment-policy";
import { buildTinaTreatmentJudgment } from "@/tina/lib/treatment-judgment";
import { buildTinaUnknownPatternEngine } from "@/tina/lib/unknown-pattern-engine";
import type { TinaReviewBundleExport, TinaWorkspaceDraft } from "@/tina/types";

const reviewBundleCache = new WeakMap<TinaWorkspaceDraft, Map<string, TinaReviewBundleExport>>();

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "business"
  );
}

export function buildTinaReviewBundle(
  draft: TinaWorkspaceDraft,
  snapshotId?: string
): TinaReviewBundleExport {
  const cacheKey = snapshotId ?? "__live__";
  let draftCache = reviewBundleCache.get(draft);
  if (!draftCache) {
    draftCache = new Map<string, TinaReviewBundleExport>();
    reviewBundleCache.set(draft, draftCache);
  }

  const cached = draftCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const builtAt = new Date().toISOString();
  const businessName = draft.profile.businessName || "Unnamed business";
  const taxYear = draft.profile.taxYear || "tax-year";
  const slug = slugify(businessName);
  const selectedSnapshot =
    typeof snapshotId === "string"
      ? draft.packageSnapshots.find((snapshot) => snapshot.id === snapshotId) ?? null
      : null;
  const packet = selectedSnapshot
    ? {
        fileName: selectedSnapshot.exportFileName,
        mimeType: "text/markdown; charset=utf-8",
        contents: selectedSnapshot.exportContents,
      }
    : buildTinaCpaPacketExport(draft);
  const scheduleCPdf = buildTinaScheduleCPdfExport(draft);
  const scheduleCReturn = buildTinaScheduleCReturn(draft);
  const formCoverage = buildTinaScheduleCFormCoverage(draft);
  const formTrace = buildTinaScheduleCFormTrace(draft);
  const formReadiness = buildTinaFormReadiness(draft);
  const officialFormTemplates = buildTinaOfficialFederalFormTemplateSnapshot(draft);
  const officialFormFill = buildTinaOfficialFormFill(draft);
  const officialFormExecution = buildTinaOfficialFormExecution(draft);
  const federalReturnClassification = buildTinaFederalReturnClassification(draft);
  const entityFilingRemediation = buildTinaEntityFilingRemediation(draft);
  const singleMemberEntityHistory = buildTinaSingleMemberEntityHistoryProof(draft);
  const singleOwnerCorporateRoute = buildTinaSingleOwnerCorporateRouteProof(draft);
  const unknownPatternEngine = buildTinaUnknownPatternEngine(draft);
  const confidenceCalibration = buildTinaConfidenceCalibration(draft);
  const caseMemoryLedger = buildTinaCaseMemoryLedger(draft);
  const reviewerLearningLoop = buildTinaReviewerLearningLoop(draft);
  const reviewerObservedDeltas = buildTinaReviewerObservedDeltas(draft);
  const reviewerOverrideGovernance = buildTinaReviewerOverrideGovernance(draft);
  const reviewerPolicyVersioning = buildTinaReviewerPolicyVersioning(draft);
  const reviewerAcceptanceReality = buildTinaReviewerAcceptanceReality(draft);
  const entityJudgment = buildTinaEntityJudgment(draft);
  const entityRecordMatrix = buildTinaEntityRecordMatrix(draft);
  const entityEconomicsReadiness = buildTinaEntityEconomicsReadiness(draft);
  const entityReturnCalculations = buildTinaEntityReturnCalculations(draft);
  const ownerFlowBasis = buildTinaOwnerFlowBasisAdjudication(draft);
  const entityReturnScheduleFamilyFinalizations =
    buildTinaEntityReturnScheduleFamilyFinalizations(draft);
  const entityReturnScheduleFamilyPayloads = buildTinaEntityReturnScheduleFamilyPayloads(draft);
  const entityReturnScheduleFamilies = buildTinaEntityReturnScheduleFamilyArtifacts(draft);
  const entityReturnSupportArtifacts = buildTinaEntityReturnSupportArtifacts(draft);
  const entityReturnRunbook = buildTinaEntityReturnRunbook(draft);
  const federalReturnRequirements = buildTinaFederalReturnRequirements(draft);
  const ownershipCapitalEvents = buildTinaOwnershipCapitalEvents(draft);
  const ownershipTimeline = buildTinaOwnershipTimeline(draft);
  const treatmentJudgment = buildTinaTreatmentJudgment(draft);
  const reviewerChallenges = buildTinaReviewerChallenges(draft);
  const startPath = buildTinaStartPathAssessment(draft);
  const evidenceSufficiency = buildTinaEvidenceSufficiency(draft);
  const evidenceCredibility = buildTinaEvidenceCredibility(draft);
  const booksReconstruction = buildTinaBooksReconstruction(draft);
  const ledgerReconstruction = buildTinaLedgerReconstruction(draft);
  const booksReconciliation = buildTinaBooksReconciliation(draft);
  const booksNormalization = buildTinaBooksNormalization(draft);
  const accountingArtifactCoverage = buildTinaAccountingArtifactCoverage(draft);
  const payrollCompliance = buildTinaPayrollComplianceReconstruction(draft);
  const attachmentStatements = buildTinaAttachmentStatements(draft);
  const attachmentSchedules = buildTinaAttachmentSchedules(draft);
  const decisionBriefings = buildTinaDecisionBriefings(draft);
  const documentIntelligence = buildTinaDocumentIntelligence(draft);
  const industryPlaybooks = buildTinaIndustryPlaybooks(draft);
  const industryEvidenceMatrix = buildTinaIndustryEvidenceMatrix(draft);
  const taxOpportunityEngine = buildTinaTaxOpportunityEngine(draft);
  const planningActionBoard = buildTinaPlanningActionBoard(draft);
  const taxPlanningMemo = buildTinaTaxPlanningMemo(draft);
  const authorityPositionMatrix = buildTinaAuthorityPositionMatrix(draft);
  const disclosureReadiness = buildTinaDisclosureReadiness(draft);
  const reviewerAcceptanceForecast = buildTinaReviewerAcceptanceForecast(draft);
  const documentRequestPlan = buildTinaDocumentRequestPlan(draft);
  const companionFormCalculations = buildTinaCompanionFormCalculations(draft);
  const companionFormRenderPlan = buildTinaCompanionFormRenderPlan(draft);
  const companionFormPlan = buildTinaCompanionFormPlan(draft);
  const crossFormConsistency = buildTinaCrossFormConsistency(draft);
  const taxTreatmentPolicy = buildTinaTaxTreatmentPolicy(draft);
  const materialityPriority = buildTinaMaterialityPriority(draft);
  const operationalStatus = buildTinaOperationalStatus(draft);
  const supportedExpenseFieldKeys = [
    "advertising",
    "contractLabor",
    "depreciation",
    "officeExpense",
    "rentOrLease",
    "supplies",
    "taxesAndLicenses",
    "travel",
    "deductibleMeals",
    "wages",
  ];
  const supportedExpenseFieldsWithAmounts = scheduleCReturn.fields.filter(
    (field) =>
      supportedExpenseFieldKeys.includes(field.formKey) &&
      typeof field.amount === "number" &&
      field.amount > 0
  );
  const otherExpensesAmount =
    scheduleCReturn.fields.find((field) => field.formKey === "otherExpenses")?.amount ?? 0;
  const evidenceSupportCounts = formTrace.lines.reduce(
    (counts, line) => {
      if (typeof line.amount !== "number" || line.amount === 0) return counts;
      counts[line.evidenceSupportLevel] += 1;
      return counts;
    },
    { strong: 0, moderate: 0, weak: 0, missing: 0 }
  );
  const sourceMode = selectedSnapshot ? "immutable_snapshot" : "live_draft";
  const summary =
    sourceMode === "immutable_snapshot"
      ? "Tina built a reviewer bundle anchored to an immutable packet snapshot, with live companion artifacts for trace and form review."
      : "Tina built a live reviewer bundle from the current workspace draft.";
  const nextStep =
    sourceMode === "immutable_snapshot"
      ? "Hand the frozen packet to the reviewer first, then use the companion artifacts for deeper inspection."
      : "Capture a snapshot before reviewer signoff if you want this bundle frozen.";

  const manifest = {
    builtAt,
    businessName,
    taxYear,
    packageState: draft.reviewerSignoff.packageState,
    sourceMode,
    snapshotId: selectedSnapshot?.id ?? null,
    packetFileName: packet.fileName,
    scheduleCPdfFileName: scheduleCPdf.fileName,
    formTraceLines: formTrace.lines.length,
    formCoverageItems: formCoverage.items.length,
    formReadinessLevel: formReadiness.level,
    officialFormTemplateCount: officialFormTemplates.templates.length,
    primaryOfficialFormTemplateId: officialFormTemplates.primaryTemplateId,
    storedBlankTemplateIds: officialFormTemplates.storedBlankTemplateIds,
    officialFormFillStatus: officialFormFill.overallStatus,
    officialFormFillPlacementCount: officialFormFill.placements.length,
    officialFormFillBlockedCount: officialFormFill.placements.filter(
      (placement) => placement.status === "blocked"
    ).length,
    officialFormExecutionStatus: officialFormExecution.overallStatus,
    officialFormExecutionReadyCount: officialFormExecution.items.filter(
      (item) => item.status === "ready_to_fill"
    ).length,
    federalReturnClassificationConfidence: federalReturnClassification.confidence,
    federalReturnClassificationSignalCount: federalReturnClassification.signals.length,
    federalReturnClassificationIssueCount: federalReturnClassification.issues.length,
    entityFilingRemediationOverallStatus: entityFilingRemediation.overallStatus,
    entityFilingRemediationPosture: entityFilingRemediation.posture,
    entityFilingRemediationHistoryStatus: entityFilingRemediation.historyStatus,
    entityFilingRemediationElectionStatus: entityFilingRemediation.electionStatus,
    entityFilingRemediationAmendmentStatus: entityFilingRemediation.amendmentStatus,
    entityFilingRemediationBlockedIssueCount: entityFilingRemediation.blockedIssueCount,
    entityFilingRemediationReviewIssueCount: entityFilingRemediation.reviewIssueCount,
    entityFilingRemediationActionCount: entityFilingRemediation.actions.length,
    singleMemberEntityHistoryOverallStatus: singleMemberEntityHistory.overallStatus,
    singleMemberEntityHistoryPosture: singleMemberEntityHistory.posture,
    singleMemberEntityHistoryOwnerHistoryStatus: singleMemberEntityHistory.ownerHistoryStatus,
    singleMemberEntityHistorySpouseExceptionStatus:
      singleMemberEntityHistory.spouseExceptionStatus,
    singleMemberEntityHistoryPriorFilingAlignmentStatus:
      singleMemberEntityHistory.priorFilingAlignmentStatus,
    singleMemberEntityHistoryTransitionYearStatus:
      singleMemberEntityHistory.transitionYearStatus,
    singleMemberEntityHistoryBooksPostureStatus: singleMemberEntityHistory.booksPostureStatus,
    singleMemberEntityHistoryBlockedIssueCount: singleMemberEntityHistory.blockedIssueCount,
    singleMemberEntityHistoryReviewIssueCount: singleMemberEntityHistory.reviewIssueCount,
    singleOwnerCorporateRouteOverallStatus: singleOwnerCorporateRoute.overallStatus,
    singleOwnerCorporateRoutePosture: singleOwnerCorporateRoute.posture,
    singleOwnerCorporateRouteElectionProofStatus: singleOwnerCorporateRoute.electionProofStatus,
    singleOwnerCorporateRoutePayrollRequirementStatus:
      singleOwnerCorporateRoute.payrollRequirementStatus,
    singleOwnerCorporateRouteOwnerServiceStatus: singleOwnerCorporateRoute.ownerServiceStatus,
    singleOwnerCorporateRouteBlockedIssueCount: singleOwnerCorporateRoute.blockedIssueCount,
    singleOwnerCorporateRouteReviewIssueCount: singleOwnerCorporateRoute.reviewIssueCount,
    unknownPatternOverallStatus: unknownPatternEngine.overallStatus,
    unknownPatternHandling: unknownPatternEngine.recommendedHandling,
    unknownPatternSignalCount: unknownPatternEngine.signals.length,
    unknownPatternBlockingSignalCount: unknownPatternEngine.signals.filter(
      (signal) => signal.severity === "blocking"
    ).length,
    unknownPatternHypothesisCount: unknownPatternEngine.hypotheses.length,
    unknownPatternCustomProofRequestCount: unknownPatternEngine.customProofRequests.length,
    confidenceCalibrationStatus: confidenceCalibration.overallStatus,
    confidenceCalibrationPosture: confidenceCalibration.recommendedPosture,
    confidenceCalibrationCheckCount: confidenceCalibration.checks.length,
    confidenceCalibrationDebtCount: confidenceCalibration.debts.length,
    blockingConfidenceDebtCount: confidenceCalibration.debts.filter(
      (debt) => debt.severity === "blocking"
    ).length,
    caseMemoryLedgerStatus: caseMemoryLedger.overallStatus,
    caseMemoryActiveAnchorSnapshotId: caseMemoryLedger.activeAnchorSnapshotId,
    caseMemoryOpenOverrideCount: caseMemoryLedger.openOverrideCount,
    caseMemoryDriftReasonCount: caseMemoryLedger.driftReasons.length,
    caseMemoryEntryCount: caseMemoryLedger.entries.length,
    reviewerLearningLoopStatus: reviewerLearningLoop.overallStatus,
    reviewerLearningActiveLessonCount: reviewerLearningLoop.activeLessonCount,
    reviewerLearningAnchoredLessonCount: reviewerLearningLoop.anchoredLessonCount,
    reviewerLearningPolicyCandidateCount: reviewerLearningLoop.policyCandidateCount,
    reviewerLearningRegressionTargetCount: reviewerLearningLoop.regressionTargetCount,
    reviewerObservedDeltasOverallStatus: reviewerObservedDeltas.overallStatus,
    reviewerObservedDeltaCount: reviewerObservedDeltas.totalDeltaCount,
    reviewerObservedAcceptedAfterAdjustmentCount:
      reviewerObservedDeltas.acceptedAfterAdjustmentCount,
    reviewerObservedTopPriorityCoverageCount:
      reviewerObservedDeltas.topPriorityCoverageCount,
    reviewerOverrideGovernanceStatus: reviewerOverrideGovernance.status,
    reviewerOverrideGovernanceOverallStatus: reviewerOverrideGovernance.overallStatus,
    reviewerOverrideGovernanceOpenOverrideCount: reviewerOverrideGovernance.openOverrideCount,
    reviewerOverrideGovernanceAnchoredOverrideCount:
      reviewerOverrideGovernance.anchoredOverrideCount,
    reviewerOverrideGovernancePolicyUpdateRequiredCount:
      reviewerOverrideGovernance.policyUpdateRequiredCount,
    reviewerOverrideGovernanceBlockingAcceptanceDeltaCount:
      reviewerOverrideGovernance.blockingAcceptanceDeltaCount,
    reviewerOverrideGovernanceBenchmarkScenarioCount:
      reviewerOverrideGovernance.recommendedBenchmarkScenarioIds.length,
    reviewerPolicyVersioningOverallStatus: reviewerPolicyVersioning.overallStatus,
    reviewerPolicyVersioningActivePolicyCount: reviewerPolicyVersioning.activePolicyCount,
    reviewerPolicyVersioningReadyToPromoteCount:
      reviewerPolicyVersioning.readyToPromoteCount,
    reviewerPolicyVersioningCandidatePolicyCount:
      reviewerPolicyVersioning.candidatePolicyCount,
    reviewerPolicyVersioningBenchmarkingPolicyCount:
      reviewerPolicyVersioning.benchmarkingPolicyCount,
    reviewerPolicyVersioningBlockedPolicyCount: reviewerPolicyVersioning.blockedPolicyCount,
    reviewerPolicyVersioningBenchmarkCoverageGapCount:
      reviewerPolicyVersioning.benchmarkCoverageGapCount,
    reviewerPolicyVersioningTopPriorityBenchmarkCoverageCount:
      reviewerPolicyVersioning.topPriorityBenchmarkCoverageCount,
    reviewerAcceptanceRealityOverallStatus: reviewerAcceptanceReality.overallStatus,
    reviewerAcceptanceRealityObservedThemeCount:
      reviewerAcceptanceReality.totalObservedThemeCount,
    reviewerAcceptanceRealityObservedAcceptanceRate:
      reviewerAcceptanceReality.observedAcceptanceRate,
    reviewerAcceptanceRealityDurableAcceptanceRate:
      reviewerAcceptanceReality.durableAcceptanceRate,
    reviewerAcceptanceRealityRejectedThemeCount:
      reviewerAcceptanceReality.rejectedThemeCount,
    reviewerAcceptanceRealityStaleThemeCount:
      reviewerAcceptanceReality.staleThemeCount,
    reviewerAcceptanceRealityTopPriorityAcceptedCoverageCount:
      reviewerAcceptanceReality.topPriorityAcceptedCoverageCount,
    documentIntelligenceOverallStatus: documentIntelligence.overallStatus,
    documentIntelligenceStructuredDocumentCount: documentIntelligence.structuredDocumentCount,
    documentIntelligenceExtractedFactCount: documentIntelligence.extractedFactCount,
    documentIntelligenceIdentityConflictCount: documentIntelligence.identityConflictCount,
    documentIntelligenceContinuityConflictCount: documentIntelligence.continuityConflictCount,
    documentIntelligenceMissingCriticalRoleCount: documentIntelligence.missingCriticalRoleCount,
    documentIntelligenceContinuityQuestionCount: documentIntelligence.continuityQuestions.length,
    ownerFlowBasisOverallStatus: ownerFlowBasis.overallStatus,
    ownerFlowBasisOpeningFootingStatus: ownerFlowBasis.openingFootingStatus,
    ownerFlowBasisRollforwardStatus: ownerFlowBasis.basisRollforwardStatus,
    ownerFlowBasisCharacterizationStatus: ownerFlowBasis.ownerFlowCharacterizationStatus,
    ownerFlowBasisLoanEquityStatus: ownerFlowBasis.loanEquityStatus,
    ownerFlowBasisDistributionTaxabilityStatus:
      ownerFlowBasis.distributionTaxabilityStatus,
    ownerFlowBasisTransitionEconomicsStatus: ownerFlowBasis.transitionEconomicsStatus,
    ownerFlowBasisBlockedCount: ownerFlowBasis.blockedItemCount,
    ownerFlowBasisReviewCount: ownerFlowBasis.reviewItemCount,
    payrollComplianceOverallStatus: payrollCompliance.overallStatus,
    payrollCompliancePosture: payrollCompliance.posture,
    payrollComplianceWorkerClassification: payrollCompliance.workerClassification,
    payrollComplianceBlockedIssueCount: payrollCompliance.blockedIssueCount,
    payrollComplianceReviewIssueCount: payrollCompliance.reviewIssueCount,
    payrollComplianceLikelyMissingFilings: payrollCompliance.likelyMissingFilings,
    evidenceSupportCounts,
    evidenceSufficiencyStatus: evidenceSufficiency.overallStatus,
    evidenceSufficiencyCounts: evidenceSufficiency.counts,
    evidenceSufficiencyIssueCount: evidenceSufficiency.issues.length,
    entityJudgmentStatus: entityJudgment.judgmentStatus,
    entityJudgmentQuestionCount: entityJudgment.questions.length,
    federalReturnFamily: federalReturnRequirements.returnFamily,
    federalReturnRequirementCount: federalReturnRequirements.items.length,
    federalReturnBlockingCount: federalReturnRequirements.items.filter(
      (item) => item.status === "blocked"
    ).length,
    federalReturnCanTinaFinishLane: federalReturnRequirements.canTinaFinishLane,
    entityRecordMatrixStatus: entityRecordMatrix.overallStatus,
    entityRecordMissingCriticalCount: entityRecordMatrix.missingCriticalCount,
    entityRecordItemCount: entityRecordMatrix.items.length,
    entityEconomicsStatus: entityEconomicsReadiness.overallStatus,
    entityEconomicsCheckCount: entityEconomicsReadiness.checks.length,
    blockedEntityEconomicsCount: entityEconomicsReadiness.checks.filter(
      (check) => check.status === "blocked"
    ).length,
    entityReturnCalculationsStatus: entityReturnCalculations.overallStatus,
    entityReturnCalculationItemCount: entityReturnCalculations.items.length,
    readyEntityReturnCalculationCount: entityReturnCalculations.items.filter(
      (item) => item.status === "ready"
    ).length,
    entityReturnCalculationFieldCount: entityReturnCalculations.items.reduce(
      (sum, item) => sum + item.fields.length,
      0
    ),
    entityReturnScheduleFamiliesStatus: entityReturnScheduleFamilies.overallStatus,
    entityReturnScheduleFamilyCount: entityReturnScheduleFamilies.items.length,
    blockedEntityReturnScheduleFamilyCount: entityReturnScheduleFamilies.items.filter(
      (item) => item.status === "blocked"
    ).length,
    readyEntityReturnScheduleFamilyCount: entityReturnScheduleFamilies.items.filter(
      (item) => item.status === "ready"
    ).length,
    entityReturnScheduleFamilyFinalizationsStatus:
      entityReturnScheduleFamilyFinalizations.overallStatus,
    entityReturnScheduleFamilyFinalizationArtifactCount:
      entityReturnScheduleFamilyFinalizations.items.length,
    blockedEntityReturnScheduleFamilyFinalizationArtifactCount:
      entityReturnScheduleFamilyFinalizations.items.filter((item) => item.status === "blocked")
        .length,
    finalizationReadyEntityReturnScheduleFamilyArtifactCount:
      entityReturnScheduleFamilyFinalizations.items.filter(
        (item) => item.finalizationReadiness === "finalized_payload_ready"
      ).length,
    entityReturnScheduleFamilyPayloadsStatus: entityReturnScheduleFamilyPayloads.overallStatus,
    entityReturnScheduleFamilyPayloadArtifactCount: entityReturnScheduleFamilyPayloads.items.length,
    blockedEntityReturnScheduleFamilyPayloadArtifactCount:
      entityReturnScheduleFamilyPayloads.items.filter((item) => item.status === "blocked").length,
    payloadReadyEntityReturnScheduleFamilyPayloadArtifactCount:
      entityReturnScheduleFamilyPayloads.items.filter(
        (item) => item.payloadReadiness === "payload_ready"
      ).length,
    entityReturnSupportArtifactsStatus: entityReturnSupportArtifacts.overallStatus,
    entityReturnSupportArtifactCount: entityReturnSupportArtifacts.items.length,
    blockedEntityReturnSupportArtifactCount: entityReturnSupportArtifacts.items.filter(
      (item) => item.status === "blocked"
    ).length,
    readyEntityReturnSupportArtifactCount: entityReturnSupportArtifacts.items.filter(
      (item) => item.status === "ready"
    ).length,
    entityReturnRunbookStatus: entityReturnRunbook.overallStatus,
    entityReturnRunbookExecutionMode: entityReturnRunbook.executionMode,
    entityReturnRunbookStepCount: entityReturnRunbook.steps.length,
    ownershipCapitalOverallStatus: ownershipCapitalEvents.overallStatus,
    ownershipCapitalEventCount: ownershipCapitalEvents.eventCount,
    ownershipCapitalBlockedCount: ownershipCapitalEvents.blockedEventCount,
    ownershipTimelineEventCount: ownershipTimeline.events.length,
    ownershipTimelineNeedsProofCount: ownershipTimeline.events.filter(
      (event) => event.status === "needs_proof"
    ).length,
    booksReconstructionStatus: booksReconstruction.overallStatus,
    booksReconstructionSourceMode: booksReconstruction.sourceMode,
    booksReconstructionBlockedAreaCount: booksReconstruction.areas.filter(
      (area) => area.status === "blocked"
    ).length,
    ledgerReconstructionStatus: ledgerReconstruction.overallStatus,
    ledgerBlockedGroupCount: ledgerReconstruction.blockedGroupCount,
    ledgerConcentratedGroupCount: ledgerReconstruction.concentratedGroupCount,
    evidenceCredibilityStatus: evidenceCredibility.overallStatus,
    evidenceCredibilityBlockingFactorCount: evidenceCredibility.blockingFactorCount,
    booksReconciliationStatus: booksReconciliation.overallStatus,
    blockedBooksReconciliationCount: booksReconciliation.checks.filter(
      (check) => check.status === "blocked"
    ).length,
    materialBooksVarianceCount: booksReconciliation.materialVarianceCount,
    unsupportedBooksBalanceCount: booksReconciliation.unsupportedBalanceCount,
    accountingArtifactCoverageStatus: accountingArtifactCoverage.overallStatus,
    missingCriticalAccountingArtifactCount: accountingArtifactCoverage.items.filter(
      (item) => item.criticality === "critical" && item.status === "missing"
    ).length,
    primaryIndustryId: industryPlaybooks.primaryIndustryId,
    industryPlaybookCount: industryPlaybooks.items.length,
    industryEvidenceMatrixStatus: industryEvidenceMatrix.overallStatus,
    missingIndustryRequirementCount: industryEvidenceMatrix.items.filter(
      (item) => item.status === "missing"
    ).length,
    readyTaxOpportunityCount: taxOpportunityEngine.items.filter(
      (item) => item.status === "ready_to_pursue"
    ).length,
    reviewOnlyTaxOpportunityCount: taxOpportunityEngine.items.filter(
      (item) => item.status === "review_only"
    ).length,
    taxPlanningMemoStatus: taxPlanningMemo.overallStatus,
    taxPlanningNowCount: taxPlanningMemo.items.filter((item) => item.priority === "now").length,
    planningActionBoardStatus: planningActionBoard.overallStatus,
    planningActionAdvanceCount: planningActionBoard.items.filter(
      (item) => item.status === "advance"
    ).length,
    authorityPositionMatrixStatus: authorityPositionMatrix.overallStatus,
    authorityPositionUseNowCount: authorityPositionMatrix.items.filter(
      (item) => item.recommendation === "use_now"
    ).length,
    authorityPositionHoldCount: authorityPositionMatrix.items.filter(
      (item) =>
        item.recommendation === "hold_for_authority" || item.recommendation === "hold_for_facts"
    ).length,
    disclosureReadinessStatus: disclosureReadiness.overallStatus,
    requiredDisclosureCount: disclosureReadiness.items.filter((item) => item.status === "required")
      .length,
    reviewerAcceptanceStatus: reviewerAcceptanceForecast.overallStatus,
    likelyAcceptedPositionCount: reviewerAcceptanceForecast.items.filter(
      (item) => item.status === "likely_accept"
    ).length,
    likelyRejectedPositionCount: reviewerAcceptanceForecast.items.filter(
      (item) => item.status === "likely_reject"
    ).length,
    documentRequestPlanStatus: documentRequestPlan.overallStatus,
    immediateDocumentRequestCount: documentRequestPlan.items.filter(
      (item) => item.priority === "immediate"
    ).length,
    attachmentStatementCount: attachmentStatements.items.length,
    blockedAttachmentStatementCount: attachmentStatements.items.filter(
      (item) => item.status === "blocked"
    ).length,
    attachmentScheduleCount: attachmentSchedules.items.length,
    blockedAttachmentScheduleCount: attachmentSchedules.items.filter(
      (item) => item.status === "blocked"
    ).length,
    companionFormCalculationStatus: companionFormCalculations.overallStatus,
    readyCompanionCalculationCount: companionFormCalculations.items.filter(
      (item) => item.status === "ready"
    ).length,
    companionFormRenderPlanStatus: companionFormRenderPlan.overallStatus,
    readyCompanionRenderPlanCount: companionFormRenderPlan.items.filter(
      (item) => item.status === "ready_to_fill"
    ).length,
    companionFormRenderPayloadCount: companionFormRenderPlan.items.reduce(
      (sum, item) => sum + item.fieldValues.length,
      0
    ),
    reviewerBriefingOpenQuestionCount: decisionBriefings.reviewer.openQuestions.length,
    ownerBriefingOpenQuestionCount: decisionBriefings.owner.openQuestions.length,
    companionFormPlanCount: companionFormPlan.items.length,
    blockedCompanionFormCount: companionFormPlan.items.filter(
      (item) => item.status === "required_blocked"
    ).length,
    crossFormConsistencyStatus: crossFormConsistency.overallStatus,
    crossFormConsistencyIssueCount: crossFormConsistency.issues.length,
    taxTreatmentPolicyStatus: taxTreatmentPolicy.overallStatus,
    taxTreatmentPolicyDecisionCount: taxTreatmentPolicy.decisions.length,
    materialityPriorityStatus: materialityPriority.overallStatus,
    materialityImmediateCount: materialityPriority.items.filter(
      (item) => item.priority === "immediate"
    ).length,
    treatmentJudgmentItemCount: treatmentJudgment.items.length,
    treatmentJudgmentReviewCount: treatmentJudgment.items.filter(
      (item) => item.taxPositionBucket === "review"
    ).length,
    treatmentJudgmentRejectCount: treatmentJudgment.items.filter(
      (item) => item.taxPositionBucket === "reject"
    ).length,
    supportedExpenseBoxesWithAmounts: supportedExpenseFieldsWithAmounts.map((field) => field.formKey),
    uncategorizedOtherExpensesAmount: otherExpensesAmount,
    startPathRoute: startPath.route,
    reviewerChallengeCount: reviewerChallenges.items.length,
    blockingReviewerChallengeCount: reviewerChallenges.items.filter(
      (item) => item.severity === "blocking"
    ).length,
    startPathProofRequirements: startPath.proofRequirements.map((requirement) => ({
      id: requirement.id,
      status: requirement.status,
      priority: requirement.priority,
    })),
    missingStartPathProofIds: startPath.proofRequirements
      .filter((requirement) => requirement.status === "needed")
      .map((requirement) => requirement.id),
    booksNormalizationIssues: booksNormalization.issues.length,
    validationIssues: scheduleCReturn.validationIssues.length,
    truths: operationalStatus.truths,
    blockers: operationalStatus.blockers,
  };
  const primaryOfficialTemplate =
    officialFormTemplates.templates.find(
      (template) => template.id === officialFormTemplates.primaryTemplateId
    ) ?? null;
  const primaryOfficialTemplateBytes = primaryOfficialTemplate
    ? readTinaOfficialFederalFormTemplateAsset(primaryOfficialTemplate.id, primaryOfficialTemplate.taxYear)
    : null;

  const reviewBundle: TinaReviewBundleExport = {
    builtAt,
    businessName,
    taxYear,
    packageState: draft.reviewerSignoff.packageState,
    sourceMode,
    snapshotId: selectedSnapshot?.id ?? null,
    summary,
    nextStep,
    files: [
      {
        id: "bundle-manifest",
        fileName: `tina-review-bundle-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(manifest, null, 2),
      },
      {
        id: "cpa-packet",
        fileName: packet.fileName,
        mimeType: packet.mimeType,
        encoding: "utf8",
        contents: packet.contents,
      },
      {
        id: "schedule-c-pdf",
        fileName: scheduleCPdf.fileName,
        mimeType: scheduleCPdf.mimeType,
        encoding: "base64",
        contents: Buffer.from(scheduleCPdf.bytes).toString("base64"),
      },
      {
        id: "schedule-c-return",
        fileName: `tina-schedule-c-return-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(scheduleCReturn, null, 2),
      },
      {
        id: "schedule-c-trace",
        fileName: `tina-schedule-c-trace-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(formTrace, null, 2),
      },
      {
        id: "form-coverage",
        fileName: `tina-form-coverage-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(formCoverage, null, 2),
      },
      {
        id: "form-readiness",
        fileName: `tina-form-readiness-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(formReadiness, null, 2),
      },
      {
        id: "official-form-templates",
        fileName: `tina-official-form-templates-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(officialFormTemplates, null, 2),
      },
      {
        id: "official-form-fill",
        fileName: `tina-official-form-fill-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(officialFormFill, null, 2),
      },
      {
        id: "official-form-execution",
        fileName: `tina-official-form-execution-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(officialFormExecution, null, 2),
      },
      {
        id: "federal-return-classification",
        fileName: `tina-federal-return-classification-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(federalReturnClassification, null, 2),
      },
      {
        id: "entity-filing-remediation",
        fileName: `tina-entity-filing-remediation-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(entityFilingRemediation, null, 2),
      },
      {
        id: "single-member-entity-history-proof",
        fileName: `tina-single-member-entity-history-proof-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(singleMemberEntityHistory, null, 2),
      },
      {
        id: "single-owner-corporate-route-proof",
        fileName: `tina-single-owner-corporate-route-proof-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(singleOwnerCorporateRoute, null, 2),
      },
      {
        id: "unknown-pattern-engine",
        fileName: `tina-unknown-pattern-engine-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(unknownPatternEngine, null, 2),
      },
      {
        id: "confidence-calibration",
        fileName: `tina-confidence-calibration-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(confidenceCalibration, null, 2),
      },
      {
        id: "case-memory-ledger",
        fileName: `tina-case-memory-ledger-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(caseMemoryLedger, null, 2),
      },
      {
        id: "reviewer-learning-loop",
        fileName: `tina-reviewer-learning-loop-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(reviewerLearningLoop, null, 2),
      },
      {
        id: "reviewer-observed-deltas",
        fileName: `tina-reviewer-observed-deltas-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(reviewerObservedDeltas, null, 2),
      },
      {
        id: "reviewer-override-governance",
        fileName: `tina-reviewer-override-governance-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(reviewerOverrideGovernance, null, 2),
      },
      {
        id: "reviewer-policy-versioning",
        fileName: `tina-reviewer-policy-versioning-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(reviewerPolicyVersioning, null, 2),
      },
      {
        id: "reviewer-acceptance-reality",
        fileName: `tina-reviewer-acceptance-reality-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(reviewerAcceptanceReality, null, 2),
      },
      {
        id: "entity-judgment",
        fileName: `tina-entity-judgment-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(entityJudgment, null, 2),
      },
      {
        id: "entity-record-matrix",
        fileName: `tina-entity-record-matrix-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(entityRecordMatrix, null, 2),
      },
      {
        id: "entity-economics-readiness",
        fileName: `tina-entity-economics-readiness-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(entityEconomicsReadiness, null, 2),
      },
      {
        id: "owner-flow-basis-adjudication",
        fileName: `tina-owner-flow-basis-adjudication-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(ownerFlowBasis, null, 2),
      },
      {
        id: "entity-return-calculations",
        fileName: `tina-entity-return-calculations-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(entityReturnCalculations, null, 2),
      },
      {
        id: "entity-return-runbook",
        fileName: `tina-entity-return-runbook-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(entityReturnRunbook, null, 2),
      },
      {
        id: "federal-return-requirements",
        fileName: `tina-federal-return-requirements-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(federalReturnRequirements, null, 2),
      },
      {
        id: "ownership-capital-events",
        fileName: `tina-ownership-capital-events-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(ownershipCapitalEvents, null, 2),
      },
      {
        id: "ownership-timeline",
        fileName: `tina-ownership-timeline-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(ownershipTimeline, null, 2),
      },
      {
        id: "tax-treatment-policy",
        fileName: `tina-tax-treatment-policy-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(taxTreatmentPolicy, null, 2),
      },
      {
        id: "treatment-judgment",
        fileName: `tina-treatment-judgment-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(treatmentJudgment, null, 2),
      },
      {
        id: "start-path",
        fileName: `tina-start-path-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(startPath, null, 2),
      },
      {
        id: "evidence-sufficiency",
        fileName: `tina-evidence-sufficiency-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(evidenceSufficiency, null, 2),
      },
      {
        id: "materiality-priority",
        fileName: `tina-materiality-priority-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(materialityPriority, null, 2),
      },
      {
        id: "reviewer-challenges",
        fileName: `tina-reviewer-challenges-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(reviewerChallenges, null, 2),
      },
      {
        id: "books-reconstruction",
        fileName: `tina-books-reconstruction-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(booksReconstruction, null, 2),
      },
      {
        id: "ledger-reconstruction",
        fileName: `tina-ledger-reconstruction-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(ledgerReconstruction, null, 2),
      },
      {
        id: "evidence-credibility",
        fileName: `tina-evidence-credibility-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(evidenceCredibility, null, 2),
      },
      {
        id: "accounting-artifact-coverage",
        fileName: `tina-accounting-artifact-coverage-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(accountingArtifactCoverage, null, 2),
      },
      {
        id: "payroll-compliance-reconstruction",
        fileName: `tina-payroll-compliance-reconstruction-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(payrollCompliance, null, 2),
      },
      {
        id: "books-reconciliation",
        fileName: `tina-books-reconciliation-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(booksReconciliation, null, 2),
      },
      {
        id: "books-normalization",
        fileName: `tina-books-normalization-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(booksNormalization, null, 2),
      },
      {
        id: "industry-playbooks",
        fileName: `tina-industry-playbooks-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(industryPlaybooks, null, 2),
      },
      {
        id: "industry-evidence-matrix",
        fileName: `tina-industry-evidence-matrix-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(industryEvidenceMatrix, null, 2),
      },
      {
        id: "tax-opportunity-engine",
        fileName: `tina-tax-opportunity-engine-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(taxOpportunityEngine, null, 2),
      },
      {
        id: "tax-planning-memo",
        fileName: `tina-tax-planning-memo-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(taxPlanningMemo, null, 2),
      },
      {
        id: "planning-action-board",
        fileName: `tina-planning-action-board-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(planningActionBoard, null, 2),
      },
      {
        id: "authority-position-matrix",
        fileName: `tina-authority-position-matrix-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(authorityPositionMatrix, null, 2),
      },
      {
        id: "disclosure-readiness",
        fileName: `tina-disclosure-readiness-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(disclosureReadiness, null, 2),
      },
      {
        id: "reviewer-acceptance-forecast",
        fileName: `tina-reviewer-acceptance-forecast-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(reviewerAcceptanceForecast, null, 2),
      },
      {
        id: "document-request-plan",
        fileName: `tina-document-request-plan-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(documentRequestPlan, null, 2),
      },
      {
        id: "attachment-statements",
        fileName: `tina-attachment-statements-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(attachmentStatements, null, 2),
      },
      {
        id: "attachment-schedules",
        fileName: `tina-attachment-schedules-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(attachmentSchedules, null, 2),
      },
      {
        id: "entity-return-schedule-families",
        fileName: `tina-entity-return-schedule-families-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(entityReturnScheduleFamilies, null, 2),
      },
      {
        id: "entity-return-schedule-family-finalizations",
        fileName: `tina-entity-return-schedule-family-finalizations-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(entityReturnScheduleFamilyFinalizations, null, 2),
      },
      {
        id: "entity-return-schedule-family-payloads",
        fileName: `tina-entity-return-schedule-family-payloads-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(entityReturnScheduleFamilyPayloads, null, 2),
      },
      {
        id: "entity-return-support-artifacts",
        fileName: `tina-entity-return-support-artifacts-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(entityReturnSupportArtifacts, null, 2),
      },
      {
        id: "decision-briefings",
        fileName: `tina-decision-briefings-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(decisionBriefings, null, 2),
      },
      {
        id: "document-intelligence",
        fileName: `tina-document-intelligence-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(documentIntelligence, null, 2),
      },
      {
        id: "companion-form-calculations",
        fileName: `tina-companion-form-calculations-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(companionFormCalculations, null, 2),
      },
      {
        id: "companion-form-render-plan",
        fileName: `tina-companion-form-render-plan-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(companionFormRenderPlan, null, 2),
      },
      {
        id: "companion-form-plan",
        fileName: `tina-companion-form-plan-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(companionFormPlan, null, 2),
      },
      {
        id: "cross-form-consistency",
        fileName: `tina-cross-form-consistency-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(crossFormConsistency, null, 2),
      },
      {
        id: "operational-status",
        fileName: `tina-operational-status-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        encoding: "utf8",
        contents: JSON.stringify(operationalStatus, null, 2),
      },
      ...(primaryOfficialTemplate && primaryOfficialTemplateBytes
        ? [
            {
              id: "official-primary-blank-form",
              fileName: primaryOfficialTemplate.fileName,
              mimeType: "application/pdf",
              encoding: "base64" as const,
              contents: Buffer.from(primaryOfficialTemplateBytes).toString("base64"),
            },
          ]
        : []),
    ],
  };

  draftCache.set(cacheKey, reviewBundle);
  return reviewBundle;
}
