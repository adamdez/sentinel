import { buildTinaAttachmentStatements } from "@/tina/lib/attachment-statements";
import { buildTinaAttachmentSchedules } from "@/tina/lib/attachment-schedules";
import { buildTinaAccountingArtifactCoverage } from "@/tina/lib/accounting-artifact-coverage";
import { buildTinaAuthorityPositionMatrix } from "@/tina/lib/authority-position-matrix";
import { buildTinaBooksNormalization } from "@/tina/lib/books-normalization";
import { buildTinaBooksReconciliation } from "@/tina/lib/books-reconciliation";
import { buildTinaEvidenceCredibility } from "@/tina/lib/evidence-credibility";
import { buildTinaLedgerReconstruction } from "@/tina/lib/ledger-reconstruction";
import { buildTinaCaseMemoryLedger } from "@/tina/lib/case-memory-ledger";
import { buildTinaCompanionFormPlan } from "@/tina/lib/companion-form-plan";
import { buildTinaCompanionFormCalculations } from "@/tina/lib/companion-form-calculations";
import { buildTinaConfidenceCalibration } from "@/tina/lib/confidence-calibration";
import { buildTinaCrossFormConsistency } from "@/tina/lib/cross-form-consistency";
import { buildTinaDecisionBriefings } from "@/tina/lib/decision-briefings";
import {
  buildTinaDocumentIntelligence,
  listTinaDocumentIntelligenceDistinctValues,
} from "@/tina/lib/document-intelligence";
import { buildTinaDocumentRequestPlan } from "@/tina/lib/document-request-plan";
import { buildTinaDisclosureReadiness } from "@/tina/lib/disclosure-readiness";
import { buildTinaEntityEconomicsReadiness } from "@/tina/lib/entity-economics-readiness";
import { buildTinaEntityFilingRemediation } from "@/tina/lib/entity-filing-remediation";
import { buildTinaEntityJudgment } from "@/tina/lib/entity-judgment";
import { buildTinaEntityReturnCalculations } from "@/tina/lib/entity-return-calculations";
import { buildTinaEntityReturnScheduleFamilyFinalizations } from "@/tina/lib/entity-return-schedule-family-finalizations";
import { buildTinaEntityReturnPackagePlan } from "@/tina/lib/entity-return-package-plan";
import { buildTinaEntityReturnScheduleFamilyPayloads } from "@/tina/lib/entity-return-schedule-family-payloads";
import { buildTinaEntityReturnScheduleFamilyArtifacts } from "@/tina/lib/entity-return-schedule-family-artifacts";
import { buildTinaEntityReturnSupportArtifacts } from "@/tina/lib/entity-return-support-artifacts";
import { buildTinaEntityRecordMatrix } from "@/tina/lib/entity-record-matrix";
import { buildTinaEntityReturnRunbook } from "@/tina/lib/entity-return-runbook";
import { buildTinaFederalReturnRequirements } from "@/tina/lib/federal-return-requirements";
import { buildTinaFormReadiness } from "@/tina/lib/form-readiness";
import { buildTinaIndustryPlaybooks } from "@/tina/lib/industry-playbooks";
import { buildTinaIndustryEvidenceMatrix } from "@/tina/lib/industry-evidence-matrix";
import { buildTinaOfficialFormFill } from "@/tina/lib/official-form-fill";
import { buildTinaOfficialFormExecution } from "@/tina/lib/official-form-execution";
import { buildTinaOwnerFlowBasisAdjudication } from "@/tina/lib/owner-flow-basis-adjudication";
import { buildTinaOwnershipTimeline } from "@/tina/lib/ownership-timeline";
import { buildTinaPayrollComplianceReconstruction } from "@/tina/lib/payroll-compliance-reconstruction";
import { buildTinaPackageState } from "@/tina/lib/package-state";
import { buildTinaReviewerChallenges } from "@/tina/lib/reviewer-challenges";
import { buildTinaReviewerAcceptanceForecast } from "@/tina/lib/reviewer-acceptance-forecast";
import { buildTinaReviewerAcceptanceReality } from "@/tina/lib/reviewer-acceptance-reality";
import { buildTinaReviewerLearningLoop } from "@/tina/lib/reviewer-learning-loop";
import { buildTinaReviewerObservedDeltas } from "@/tina/lib/reviewer-observed-deltas";
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
import type { TinaOperationalMaturity, TinaOperationalStatusSnapshot, TinaWorkspaceDraft } from "@/tina/types";

export function createDefaultTinaOperationalStatus(): TinaOperationalStatusSnapshot {
  return {
    lastRunAt: null,
    maturity: "foundation",
    packageState: "provisional",
    summary: "Tina is still in foundation mode.",
    nextStep: "Keep building durable reviewer workflow and truthful readiness signals.",
    truths: ["Supported lane today: schedule_c_single_member_llc."],
    blockers: [],
  };
}

function determineMaturity(draft: TinaWorkspaceDraft): TinaOperationalMaturity {
  const hasScheduleCCore =
    draft.reviewerFinal.status === "complete" &&
    draft.scheduleCDraft.status === "complete" &&
    draft.packageReadiness.status === "complete" &&
    draft.cpaHandoff.status === "complete";
  const hasReviewerGradeCore =
    draft.packageSnapshots.length > 0 &&
    draft.reviewerDecisions.length > 0 &&
    draft.appendix.status === "complete";

  if (hasReviewerGradeCore) return "reviewer_grade_core";
  if (hasScheduleCCore) return "schedule_c_core";
  return "foundation";
}

export function buildTinaOperationalStatus(draft: TinaWorkspaceDraft): TinaOperationalStatusSnapshot {
  const packageState = buildTinaPackageState(draft);
  const entityJudgment = buildTinaEntityJudgment(draft);
  const entityRecordMatrix = buildTinaEntityRecordMatrix(draft);
  const entityEconomicsReadiness = buildTinaEntityEconomicsReadiness(draft);
  const entityFilingRemediation = buildTinaEntityFilingRemediation(draft);
  const entityReturnCalculations = buildTinaEntityReturnCalculations(draft);
  const entityReturnPackagePlan = buildTinaEntityReturnPackagePlan(draft);
  const entityReturnScheduleFamilyFinalizations =
    buildTinaEntityReturnScheduleFamilyFinalizations(draft);
  const entityReturnScheduleFamilyPayloads = buildTinaEntityReturnScheduleFamilyPayloads(draft);
  const entityReturnScheduleFamilies = buildTinaEntityReturnScheduleFamilyArtifacts(draft);
  const entityReturnSupportArtifacts = buildTinaEntityReturnSupportArtifacts(draft);
  const entityReturnRunbook = buildTinaEntityReturnRunbook(draft);
  const federalReturnRequirements = buildTinaFederalReturnRequirements(draft);
  const ownershipTimeline = buildTinaOwnershipTimeline(draft);
  const scheduleCReturn = buildTinaScheduleCReturn(draft);
  const formCoverage = buildTinaScheduleCFormCoverage(draft);
  const formTrace = buildTinaScheduleCFormTrace(draft);
  const formReadiness = buildTinaFormReadiness(draft);
  const officialFormFill = buildTinaOfficialFormFill(draft);
  const officialFormExecution = buildTinaOfficialFormExecution(draft);
  const ownerFlowBasis = buildTinaOwnerFlowBasisAdjudication(draft);
  const payrollCompliance = buildTinaPayrollComplianceReconstruction(draft);
  const singleMemberEntityHistory = buildTinaSingleMemberEntityHistoryProof(draft);
  const singleOwnerCorporateRoute = buildTinaSingleOwnerCorporateRouteProof(draft);
  const companionFormCalculations = buildTinaCompanionFormCalculations(draft);
  const booksNormalization = buildTinaBooksNormalization(draft);
  const ledgerReconstruction = buildTinaLedgerReconstruction(draft);
  const booksReconciliation = buildTinaBooksReconciliation(draft);
  const evidenceCredibility = buildTinaEvidenceCredibility(draft);
  const accountingArtifactCoverage = buildTinaAccountingArtifactCoverage(draft);
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
  const companionFormPlan = buildTinaCompanionFormPlan(draft);
  const crossFormConsistency = buildTinaCrossFormConsistency(draft);
  const reviewerChallenges = buildTinaReviewerChallenges(draft);
  const treatmentJudgment = buildTinaTreatmentJudgment(draft);
  const unknownPatternEngine = buildTinaUnknownPatternEngine(draft);
  const confidenceCalibration = buildTinaConfidenceCalibration(draft);
  const caseMemoryLedger = buildTinaCaseMemoryLedger(draft);
  const reviewerLearningLoop = buildTinaReviewerLearningLoop(draft);
  const reviewerObservedDeltas = buildTinaReviewerObservedDeltas(draft);
  const reviewerOverrideGovernance = buildTinaReviewerOverrideGovernance(draft);
  const reviewerPolicyVersioning = buildTinaReviewerPolicyVersioning(draft);
  const reviewerAcceptanceReality = buildTinaReviewerAcceptanceReality(draft);
  const maturity = determineMaturity(draft);
  const startPath = buildTinaStartPathAssessment(draft);
  const documentIdentityValues = listTinaDocumentIntelligenceDistinctValues({
    snapshot: documentIntelligence,
    kind: "identity_signal",
    label: "Employer identification number",
  });
  const documentEntityNameValues = listTinaDocumentIntelligenceDistinctValues({
    snapshot: documentIntelligence,
    kind: "entity_name_signal",
    label: "Entity name signal",
  });
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
  const supportedExpenseBoxCount = scheduleCReturn.fields.filter(
    (field) =>
      supportedExpenseFieldKeys.includes(field.formKey) &&
      typeof field.amount === "number" &&
      field.amount > 0
  ).length;
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
  const blockers = draft.packageReadiness.items
    .filter((item) => item.severity === "blocking")
    .map((item) => item.title);
  const combinedBlockers = Array.from(
    new Set([
      ...blockers,
      ...startPath.blockingReasons,
      ...startPath.proofRequirements
        .filter((requirement) => requirement.status === "needed" && requirement.priority === "required")
        .map((requirement) => requirement.label),
      ...entityFilingRemediation.issues
        .filter((issue) => issue.severity === "blocking")
        .map((issue) => issue.title),
      ...singleMemberEntityHistory.issues
        .filter((issue) => issue.severity === "blocking")
        .map((issue) => issue.title),
      ...singleOwnerCorporateRoute.issues
        .filter((issue) => issue.severity === "blocking")
        .map((issue) => issue.title),
      ...entityJudgment.questions
        .filter((question) => question.severity === "blocking")
        .map((question) => question.title),
      ...entityRecordMatrix.items
        .filter((item) => item.criticality === "critical" && item.status === "missing")
        .map((item) => item.title),
      ...entityEconomicsReadiness.checks
        .filter((check) => check.status === "blocked")
        .map((check) => check.title),
      ...ownerFlowBasis.items
        .filter((item) => item.status === "blocked")
        .map((item) => item.title),
      ...federalReturnRequirements.items
        .filter((item) => item.status === "blocked")
        .map((item) => item.title),
      ...entityReturnSupportArtifacts.items
        .filter((item) => item.status === "blocked")
        .map((item) => item.title),
      ...entityReturnScheduleFamilies.items
        .filter((item) => item.status === "blocked")
        .map((item) => item.title),
      ...entityReturnScheduleFamilyFinalizations.items
        .filter((item) => item.status === "blocked")
        .map((item) => item.title),
      ...entityReturnScheduleFamilyPayloads.items
        .filter((item) => item.status === "blocked")
        .map((item) => item.title),
      ...treatmentJudgment.items
        .filter((item) => item.taxPositionBucket === "reject")
        .map((item) => item.title),
      ...officialFormFill.blockedReasons,
      ...officialFormExecution.items
        .filter((item) => item.status === "blocked")
        .map((item) => item.title),
      ...booksReconciliation.checks
        .filter((check) => check.status === "blocked")
        .map((check) => check.title),
      ...booksReconciliation.variances
        .filter((variance) => variance.severity === "material")
        .map((variance) => variance.title),
      ...payrollCompliance.issues
        .filter((issue) => issue.status === "blocked")
        .map((issue) => issue.title),
      ...evidenceCredibility.factors
        .filter((factor) => factor.status === "blocked")
        .map((factor) => factor.title),
      ...accountingArtifactCoverage.items
        .filter((item) => item.criticality === "critical" && item.status === "missing")
        .map((item) => item.title),
      ...booksNormalization.issues
        .filter((issue) => issue.severity === "blocking")
        .map((issue) => issue.title),
      ...attachmentStatements.items
        .filter((item) => item.status === "blocked")
        .map((item) => item.title),
      ...attachmentSchedules.items
        .filter((item) => item.status === "blocked")
        .map((item) => item.title),
      ...companionFormCalculations.items
        .filter((item) => item.status === "blocked")
        .map((item) => item.title),
      ...companionFormPlan.items
        .filter((item) => item.status === "required_blocked")
        .map((item) => item.title),
      ...crossFormConsistency.issues
        .filter((issue) => issue.severity === "blocking")
        .map((issue) => issue.title),
      ...disclosureReadiness.items
        .filter((item) => item.status === "required")
        .map((item) => item.title),
      ...reviewerAcceptanceForecast.items
        .filter((item) => item.status === "likely_reject")
        .map((item) => item.title),
      ...planningActionBoard.items
        .filter((item) => item.status === "reject")
        .map((item) => item.title),
      ...unknownPatternEngine.signals
        .filter((signal) => signal.severity === "blocking")
        .map((signal) => signal.title),
      ...confidenceCalibration.debts
        .filter((debt) => debt.severity === "blocking" || debt.severity === "major")
        .map((debt) => debt.title),
      ...caseMemoryLedger.driftReasons,
      ...caseMemoryLedger.overrides
        .filter((override) => override.status === "open")
        .map((override) => override.summary),
      ...reviewerLearningLoop.policyCandidates
        .filter((candidate) => candidate.priority === "high" || candidate.priority === "medium")
        .map((candidate) => candidate.title),
      ...reviewerObservedDeltas.items
        .filter(
          (item) =>
            item.kind === "change_requested" ||
            item.kind === "rejected" ||
            item.kind === "stale_after_acceptance"
        )
        .map((item) => item.title),
      ...reviewerOverrideGovernance.items
        .filter(
          (item) =>
            item.status === "open" && (item.priority === "high" || item.priority === "medium")
        )
        .map((item) => item.title),
      ...reviewerOverrideGovernance.acceptanceDeltas
        .filter((delta) => delta.severity === "blocking")
        .map((delta) => delta.title),
      ...reviewerPolicyVersioning.items
        .filter((item) => item.status === "blocked")
        .map((item) => item.title),
      ...reviewerPolicyVersioning.items
        .filter(
          (item) =>
            item.status === "candidate" || item.status === "benchmarking"
        )
        .flatMap((item) => item.blockers),
      ...reviewerAcceptanceReality.items
        .filter(
          (item) =>
            item.outcome === "blocked_by_reviewer" ||
            item.outcome === "rejected" ||
            item.outcome === "stale_after_acceptance"
        )
        .map((item) => item.title),
      ...documentIntelligence.missingCriticalRoles.map(
        (role) => `Missing structured paper: ${role}`
      ),
      ...documentRequestPlan.items
        .filter((item) => item.priority === "immediate")
        .map((item) => item.title),
    ])
  );

  return {
    lastRunAt: new Date().toISOString(),
    maturity,
    packageState,
    summary:
      maturity === "reviewer_grade_core"
        ? "Tina has the backend pieces for reviewer-grade operation."
        : maturity === "schedule_c_core"
          ? "Tina has a strong Schedule C core but still needs reviewer-grade hardening."
          : "Tina is still in foundation mode.",
    nextStep:
      packageState === "ready_for_cpa_review"
        ? "Capture an immutable package snapshot and route it to reviewer signoff."
        : packageState === "signed_off"
          ? "Preserve the signed snapshot unless facts or numbers change."
          : "Clear the remaining blockers and continue reviewer-grade hardening.",
    truths: [
      "Supported lane today: schedule_c_single_member_llc.",
      startPath.route === "supported"
        ? `Start path currently points to ${startPath.recommendation.title} with high confidence.`
        : startPath.route === "review_only"
          ? "Start path is review-only right now because Tina sees ownership or lane signals that still need a human decision."
          : "Start path is blocked right now because Tina does not have a clean, defensible lane decision yet.",
      startPath.proofRequirements.some((requirement) => requirement.status === "needed")
        ? `Start-path proof still needed: ${startPath.proofRequirements
            .filter((requirement) => requirement.status === "needed")
            .map((requirement) => requirement.label)
            .join(", ")}.`
        : "Start-path proof requirements are currently covered.",
      `Unknown-pattern engine: ${unknownPatternEngine.overallStatus.replace(/_/g, " ")} / ${unknownPatternEngine.recommendedHandling.replace(/_/g, " ")}.`,
      unknownPatternEngine.customProofRequests.length > 0
        ? `Unknown-pattern proof requests: ${unknownPatternEngine.customProofRequests.length}.`
        : "No custom unknown-pattern proof requests are currently active.",
      ownerFlowBasis.overallStatus === "clear"
        ? "Owner-flow and basis adjudication is coherent enough to travel through calculations and reviewer artifacts."
        : ownerFlowBasis.overallStatus === "review_required"
          ? `Owner-flow and basis adjudication still has ${ownerFlowBasis.reviewItemCount} reviewer-controlled area${
              ownerFlowBasis.reviewItemCount === 1 ? "" : "s"
            }.`
          : `Owner-flow and basis adjudication still has ${ownerFlowBasis.blockedItemCount} blocked area${
              ownerFlowBasis.blockedItemCount === 1 ? "" : "s"
            } that can change owner-level taxability or allocation.`,
      `Owner-flow footing / rollforward / transition economics: ${ownerFlowBasis.openingFootingStatus.replace(/_/g, " ")} / ${ownerFlowBasis.basisRollforwardStatus.replace(/_/g, " ")} / ${ownerFlowBasis.transitionEconomicsStatus.replace(/_/g, " ")}.`,
      `Confidence calibration: ${confidenceCalibration.overallStatus} / ${confidenceCalibration.recommendedPosture.replace(/_/g, " ")}.`,
      confidenceCalibration.debts.length > 0
        ? `Confidence debt items: ${confidenceCalibration.debts.length}.`
        : "No active confidence debt items are currently open.",
      `Case memory ledger: ${caseMemoryLedger.overallStatus.replace(/_/g, " ")}.`,
      caseMemoryLedger.activeAnchorSnapshotId
        ? `Active reviewer anchor: ${caseMemoryLedger.activeAnchorSnapshotId}.`
        : "No active reviewer anchor is currently set.",
      caseMemoryLedger.openOverrideCount > 0
        ? `Open reviewer overrides: ${caseMemoryLedger.openOverrideCount}.`
        : "No open reviewer overrides are currently active.",
      `Reviewer learning loop: ${reviewerLearningLoop.overallStatus.replace(/_/g, " ")}.`,
      reviewerLearningLoop.activeLessonCount > 0
        ? `Queued reviewer lessons: ${reviewerLearningLoop.activeLessonCount}.`
        : "No queued reviewer lessons are currently open.",
      `Reviewer observed deltas: ${reviewerObservedDeltas.overallStatus.replace(/_/g, " ")}.`,
      reviewerObservedDeltas.totalDeltaCount > 0
        ? `Observed reviewer deltas recorded: ${reviewerObservedDeltas.totalDeltaCount}.`
        : "No raw reviewer-observed deltas are currently recorded.",
      reviewerObservedDeltas.acceptedAfterAdjustmentCount > 0
        ? `Accepted-after-adjustment reviewer deltas: ${reviewerObservedDeltas.acceptedAfterAdjustmentCount}.`
        : "No accepted-after-adjustment reviewer deltas are currently active.",
      reviewerObservedDeltas.topPriorityCoverageCount > 0
        ? `Observed reviewer deltas tied to top-priority weird scenarios: ${reviewerObservedDeltas.topPriorityCoverageCount}.`
        : "No observed reviewer deltas are tied to top-priority weird scenarios yet.",
      `Reviewer override governance: ${reviewerOverrideGovernance.overallStatus.replace(/_/g, " ")}.`,
      reviewerOverrideGovernance.openOverrideCount > 0
        ? `Governed override items still open: ${reviewerOverrideGovernance.openOverrideCount}.`
        : "No governed override items are currently open.",
      reviewerOverrideGovernance.blockingAcceptanceDeltaCount > 0
        ? `Blocking acceptance deltas: ${reviewerOverrideGovernance.blockingAcceptanceDeltaCount}.`
        : "No blocking reviewer acceptance deltas are currently active.",
      reviewerOverrideGovernance.recommendedBenchmarkScenarioIds.length > 0
        ? `Recommended override benchmark scenarios: ${reviewerOverrideGovernance.recommendedBenchmarkScenarioIds.join(", ")}.`
        : "No override-driven benchmark scenarios are currently queued.",
      `Reviewer policy versioning: ${reviewerPolicyVersioning.overallStatus.replace(/_/g, " ")}.`,
      reviewerPolicyVersioning.activePolicyCount > 0
        ? `Active reviewer policy tracks: ${reviewerPolicyVersioning.activePolicyCount}.`
        : "No reviewer policy tracks are fully active yet.",
      reviewerPolicyVersioning.readyToPromoteCount > 0
        ? `Reviewer policy tracks ready to promote: ${reviewerPolicyVersioning.readyToPromoteCount}.`
        : "No reviewer policy tracks are currently at the ready-to-promote stage.",
      reviewerPolicyVersioning.benchmarkCoverageGapCount > 0
        ? `Reviewer policy benchmark coverage gaps: ${reviewerPolicyVersioning.benchmarkCoverageGapCount}.`
        : "No reviewer policy benchmark coverage gaps are currently open.",
      reviewerPolicyVersioning.topPriorityBenchmarkCoverageCount > 0
        ? `Reviewer policy tracks mapped to top-priority weird scenarios: ${reviewerPolicyVersioning.topPriorityBenchmarkCoverageCount}.`
        : "No reviewer policy tracks are mapped to top-priority weird scenarios yet.",
      `Reviewer acceptance reality: ${reviewerAcceptanceReality.overallStatus}.`,
      reviewerAcceptanceReality.totalObservedThemeCount > 0
        ? `Observed reviewer acceptance rate: ${reviewerAcceptanceReality.observedAcceptanceRate}%.`
        : "No observed reviewer acceptance themes are recorded yet.",
      reviewerAcceptanceReality.durableAcceptanceRate > 0
        ? `Durable reviewer acceptance rate: ${reviewerAcceptanceReality.durableAcceptanceRate}%.`
        : "No durable reviewer acceptance rate is established yet.",
      reviewerAcceptanceReality.topPriorityAcceptedCoverageCount > 0
        ? `Accepted themes with top-priority weird-scenario coverage: ${reviewerAcceptanceReality.topPriorityAcceptedCoverageCount}.`
        : "No accepted themes are benchmark-backed by top-priority weird scenarios yet.",
      `Document intelligence: ${documentIntelligence.overallStatus.replace(/_/g, " ")}.`,
      documentIntelligence.structuredDocumentCount > 0
        ? `Structured document artifacts: ${documentIntelligence.structuredDocumentCount}.`
        : "No deeply classified document artifacts are currently available.",
      `Document-intelligence extracted facts: ${documentIntelligence.extractedFactCount}.`,
      documentIdentityValues.length > 1
        ? `Multiple EINs detected in structured papers: ${documentIdentityValues.join(", ")}.`
        : "No multi-EIN structured document conflict is currently active.",
      documentEntityNameValues.length > 1
        ? `Multiple entity names detected in structured papers: ${documentEntityNameValues.join(", ")}.`
        : "No multi-entity-name structured document conflict is currently active.",
      documentIntelligence.continuityQuestions.length > 0
        ? `Document continuity questions still open: ${documentIntelligence.continuityQuestions.length}.`
        : "No structured document continuity questions are currently open.",
      documentIntelligence.missingCriticalRoleCount > 0
        ? `Missing structured paper types: ${documentIntelligence.missingCriticalRoles.join(", ")}.`
        : "No critical structured paper types are currently missing.",
      `Entity treatment judgment: ${entityJudgment.judgmentStatus.replace(/_/g, " ")}.`,
      `Entity filing remediation: ${entityFilingRemediation.overallStatus.replace(/_/g, " ")} / ${entityFilingRemediation.posture.replace(/_/g, " ")}.`,
      `Entity filing history status: ${entityFilingRemediation.historyStatus.replace(/_/g, " ")}.`,
      `Entity filing election status: ${entityFilingRemediation.electionStatus.replace(/_/g, " ")}.`,
      `Entity filing amendment status: ${entityFilingRemediation.amendmentStatus.replace(/_/g, " ")}.`,
      `Single-member entity-history proof: ${singleMemberEntityHistory.overallStatus.replace(/_/g, " ")} / ${singleMemberEntityHistory.posture.replace(/_/g, " ")}.`,
      `Single-member owner history / spouse exception / prior filing alignment / transition year / books posture: ${singleMemberEntityHistory.ownerHistoryStatus.replace(/_/g, " ")} / ${singleMemberEntityHistory.spouseExceptionStatus.replace(/_/g, " ")} / ${singleMemberEntityHistory.priorFilingAlignmentStatus.replace(/_/g, " ")} / ${singleMemberEntityHistory.transitionYearStatus.replace(/_/g, " ")} / ${singleMemberEntityHistory.booksPostureStatus.replace(/_/g, " ")}.`,
      singleMemberEntityHistory.questions.length > 0
        ? `Single-member entity-history questions still open: ${singleMemberEntityHistory.questions.length}.`
        : "No single-member entity-history questions are currently open.",
      `Single-owner corporate route: ${singleOwnerCorporateRoute.overallStatus.replace(/_/g, " ")} / ${singleOwnerCorporateRoute.posture.replace(/_/g, " ")}.`,
      `Single-owner election proof / payroll requirement / owner services: ${singleOwnerCorporateRoute.electionProofStatus.replace(/_/g, " ")} / ${singleOwnerCorporateRoute.payrollRequirementStatus.replace(/_/g, " ")} / ${singleOwnerCorporateRoute.ownerServiceStatus.replace(/_/g, " ")}.`,
      singleOwnerCorporateRoute.questions.length > 0
        ? `Single-owner corporate route questions still open: ${singleOwnerCorporateRoute.questions.length}.`
        : "No single-owner corporate route questions are currently open.",
      entityFilingRemediation.likelyPriorLaneIds.length > 0
        ? `Likely prior entity-filing lanes: ${entityFilingRemediation.likelyPriorLaneIds.join(", ")}.`
        : "No likely prior entity-filing lane drift is currently flagged.",
      entityFilingRemediation.priorityQuestions.length > 0
        ? `Entity-filing continuity questions still open: ${entityFilingRemediation.priorityQuestions.length}.`
        : "No entity-filing continuity questions are currently open.",
      `Federal return family: ${federalReturnRequirements.returnFamily}.`,
      `Entity record matrix: ${entityRecordMatrix.overallStatus}.`,
      `Entity economics readiness: ${entityEconomicsReadiness.overallStatus.replace(/_/g, " ")}.`,
      `Entity return calculations: ${entityReturnCalculations.overallStatus.replace(/_/g, " ")}.`,
      `Entity return calculation items: ${entityReturnCalculations.items.length}.`,
      `Entity return package plan: ${entityReturnPackagePlan.overallStatus.replace(/_/g, " ")} / ${entityReturnPackagePlan.executionMode.replace(/_/g, " ")}.`,
      `Entity return package items: ${entityReturnPackagePlan.items.length}.`,
      `Entity return schedule families: ${entityReturnScheduleFamilies.overallStatus.replace(/_/g, " ")} (${entityReturnScheduleFamilies.items.length} items).`,
      `Entity return schedule-family finalizations: ${entityReturnScheduleFamilyFinalizations.overallStatus.replace(/_/g, " ")} (${entityReturnScheduleFamilyFinalizations.items.length} items).`,
      `Entity return schedule-family payloads: ${entityReturnScheduleFamilyPayloads.overallStatus.replace(/_/g, " ")} (${entityReturnScheduleFamilyPayloads.items.length} items).`,
      `Entity return support artifacts: ${entityReturnSupportArtifacts.overallStatus.replace(/_/g, " ")} (${entityReturnSupportArtifacts.items.length} items).`,
      `Entity return runbook: ${entityReturnRunbook.executionMode.replace(/_/g, " ")} / ${entityReturnRunbook.overallStatus.replace(/_/g, " ")}.`,
      `Ledger reconstruction: ${ledgerReconstruction.overallStatus} (${ledgerReconstruction.blockedGroupCount} blocked, ${ledgerReconstruction.partialGroupCount} partial).`,
      `Payroll compliance: ${payrollCompliance.overallStatus.replace(/_/g, " ")} / ${payrollCompliance.posture.replace(/_/g, " ")}.`,
      payrollCompliance.likelyMissingFilings.length > 0
        ? `Likely missing payroll filings: ${payrollCompliance.likelyMissingFilings.join(", ")}.`
        : "No likely missing payroll filings are currently flagged.",
      `Ledger concentration groups: ${ledgerReconstruction.concentratedGroupCount}.`,
      `Evidence credibility: ${evidenceCredibility.overallStatus} (${evidenceCredibility.blockingFactorCount} blocking factors).`,
      `Books reconciliation: ${booksReconciliation.overallStatus} (${booksReconciliation.materialVarianceCount} material variances, ${booksReconciliation.unsupportedBalanceCount} unsupported balances).`,
      federalReturnRequirements.canTinaFinishLane
        ? "Tina can finish the current federal return lane."
        : "Tina cannot finish the current federal return lane automatically yet.",
      ownershipTimeline.events.length > 0
        ? `Ownership timeline events: ${ownershipTimeline.events.length}.`
        : "Ownership timeline is currently quiet.",
      draft.packageSnapshots.length > 0
        ? `${draft.packageSnapshots.length} immutable package snapshot${draft.packageSnapshots.length === 1 ? "" : "s"} saved.`
        : "Immutable package snapshots are not captured yet.",
      draft.quickBooksConnection.status === "connected" ||
      draft.quickBooksConnection.status === "syncing"
        ? `QuickBooks connection: ${draft.quickBooksConnection.companyName || "connected"} (${draft.quickBooksConnection.status}).`
        : "QuickBooks live connection is not set up yet.",
      scheduleCReturn.validationIssues.length > 0
        ? `Schedule C form validation issues: ${scheduleCReturn.validationIssues.length}.`
        : "Schedule C form output has no current validation issues.",
      supportedExpenseBoxCount > 0
        ? `Supported Part II expense boxes with amounts: ${supportedExpenseBoxCount}.`
        : "No supported Part II expense boxes currently carry non-zero amounts.",
      otherExpensesAmount > 0
        ? `Uncategorized other expenses still remain on line 27a: ${otherExpensesAmount}.`
        : "No uncategorized other expenses currently remain on line 27a.",
      `Official-form coverage items: ${formCoverage.items.length}.`,
      `Official-form readiness: ${formReadiness.level.replace(/_/g, " ")}.`,
      `Official-form fill plan: ${officialFormFill.overallStatus.replace(/_/g, " ")}.`,
      `Official-form execution: ${officialFormExecution.overallStatus.replace(/_/g, " ")}.`,
      `Companion-form calculations: ${companionFormCalculations.overallStatus.replace(/_/g, " ")}.`,
      `Accounting artifact coverage: ${accountingArtifactCoverage.overallStatus}.`,
      `Attachment statements: ${attachmentStatements.items.length}.`,
      `Structured attachment schedules: ${attachmentSchedules.items.length}.`,
      formTrace.lines.length > 0
        ? `Schedule C form trace lines available: ${formTrace.lines.length}.`
        : "Schedule C form traceability has not been built yet.",
      formTrace.lines.length > 0
        ? `Non-zero line evidence support: ${evidenceSupportCounts.strong} strong, ${evidenceSupportCounts.moderate} moderate, ${evidenceSupportCounts.weak} weak, ${evidenceSupportCounts.missing} missing.`
        : "Non-zero line evidence support is not available yet.",
      `Books reconciliation: ${booksReconciliation.overallStatus}.`,
      booksNormalization.issues.length > 0
        ? `Books-normalization issues detected: ${booksNormalization.issues.length}.`
        : "No current books-normalization issues detected from saved facts.",
      industryPlaybooks.primaryIndustryId
        ? `Primary industry playbook: ${industryPlaybooks.primaryIndustryId.replace(/_/g, " ")}.`
        : "Industry playbook is still generic.",
      `Industry evidence matrix: ${industryEvidenceMatrix.overallStatus}.`,
      `Tax opportunities ready to pursue: ${taxOpportunityEngine.items.filter(
        (item) => item.status === "ready_to_pursue"
      ).length}.`,
      `Tax planning memo status: ${taxPlanningMemo.overallStatus}.`,
      `Planning action board: ${planningActionBoard.overallStatus}.`,
      `Authority position matrix: ${authorityPositionMatrix.overallStatus}.`,
      `Disclosure readiness: ${disclosureReadiness.overallStatus}.`,
      `Reviewer acceptance forecast: ${reviewerAcceptanceForecast.overallStatus.replace(/_/g, " ")}.`,
      `Document request plan: ${documentRequestPlan.items.length} item${documentRequestPlan.items.length === 1 ? "" : "s"}.`,
      `Companion form plan items: ${companionFormPlan.items.length}.`,
      `Cross-form consistency: ${crossFormConsistency.overallStatus.replace(/_/g, " ")}.`,
      reviewerChallenges.items.length > 0
        ? `Reviewer challenge forecast items: ${reviewerChallenges.items.length}.`
        : "Reviewer challenge forecast is currently quiet.",
      `Reviewer briefing questions: ${decisionBriefings.reviewer.openQuestions.length}.`,
      `Owner briefing questions: ${decisionBriefings.owner.openQuestions.length}.`,
      treatmentJudgment.items.length > 0
        ? `Treatment judgment items: ${treatmentJudgment.items.length}.`
        : "Treatment judgment layer is currently quiet.",
      draft.reviewerDecisions.length > 0
        ? `${draft.reviewerDecisions.length} reviewer decision${draft.reviewerDecisions.length === 1 ? "" : "s"} recorded.`
        : "No reviewer decisions recorded yet.",
    ],
    blockers: combinedBlockers,
  };
}
