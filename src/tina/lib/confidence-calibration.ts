import type {
  TinaConfidenceCalibrationCheck,
  TinaConfidenceCalibrationSnapshot,
  TinaConfidenceDebt,
  TinaConfidenceLevel,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaAuthorityPositionMatrix } from "@/tina/lib/authority-position-matrix";
import { buildTinaCrossFormConsistency } from "@/tina/lib/cross-form-consistency";
import {
  buildTinaDocumentIntelligence,
  listTinaDocumentIntelligenceDistinctValues,
} from "@/tina/lib/document-intelligence";
import { buildTinaDisclosureReadiness } from "@/tina/lib/disclosure-readiness";
import { buildTinaEvidenceCredibility } from "@/tina/lib/evidence-credibility";
import { buildTinaEvidenceSufficiency } from "@/tina/lib/evidence-sufficiency";
import { buildTinaEntityFilingRemediation } from "@/tina/lib/entity-filing-remediation";
import { buildTinaFederalReturnClassification } from "@/tina/lib/federal-return-classification";
import { buildTinaFormReadiness } from "@/tina/lib/form-readiness";
import { buildTinaOfficialFormExecution } from "@/tina/lib/official-form-execution";
import { buildTinaOfficialFormFill } from "@/tina/lib/official-form-fill";
import { buildTinaOwnerFlowBasisAdjudication } from "@/tina/lib/owner-flow-basis-adjudication";
import { buildTinaPackageReadiness } from "@/tina/lib/package-readiness";
import { buildTinaPayrollComplianceReconstruction } from "@/tina/lib/payroll-compliance-reconstruction";
import { buildTinaPlanningActionBoard } from "@/tina/lib/planning-action-board";
import { buildTinaReviewerAcceptanceForecast } from "@/tina/lib/reviewer-acceptance-forecast";
import { buildTinaReviewerAcceptanceReality } from "@/tina/lib/reviewer-acceptance-reality";
import { buildTinaReviewerObservedDeltas } from "@/tina/lib/reviewer-observed-deltas";
import { buildTinaReviewerOverrideGovernance } from "@/tina/lib/reviewer-override-governance";
import { buildTinaReviewerPolicyVersioning } from "@/tina/lib/reviewer-policy-versioning";
import { buildTinaSingleMemberEntityHistoryProof } from "@/tina/lib/single-member-entity-history-proof";
import { buildTinaSingleOwnerCorporateRouteProof } from "@/tina/lib/single-owner-corporate-route-proof";
import { buildTinaStartPathAssessment } from "@/tina/lib/start-path";
import { buildTinaTaxPlanningMemo } from "@/tina/lib/tax-planning-memo";
import { buildTinaTreatmentJudgment } from "@/tina/lib/treatment-judgment";
import { buildTinaUnknownPatternEngine } from "@/tina/lib/unknown-pattern-engine";
import type { TinaWorkspaceDraft } from "@/tina/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function rankConfidence(confidence: TinaConfidenceLevel): number {
  return confidence === "high" ? 3 : confidence === "medium" ? 2 : 1;
}

type AuthorityPosition = ReturnType<typeof buildTinaAuthorityPositionMatrix>["items"][number];

function isDefinedAuthorityPosition(
  position: AuthorityPosition | undefined
): position is AuthorityPosition {
  return Boolean(position);
}

function buildCheck(check: TinaConfidenceCalibrationCheck): TinaConfidenceCalibrationCheck {
  return {
    ...check,
    ownerEngines: unique(check.ownerEngines),
    relatedFactIds: unique(check.relatedFactIds),
    relatedDocumentIds: unique(check.relatedDocumentIds),
  };
}

function buildDebt(debt: TinaConfidenceDebt): TinaConfidenceDebt {
  return {
    ...debt,
    relatedCheckIds: unique(debt.relatedCheckIds),
    relatedFactIds: unique(debt.relatedFactIds),
    relatedDocumentIds: unique(debt.relatedDocumentIds),
  };
}

function buildDebtForCheck(
  check: TinaConfidenceCalibrationCheck,
  title: string,
  ownerEngine: string
): TinaConfidenceDebt {
  const severity =
    check.status === "blocked"
      ? "blocking"
      : check.status === "overstated"
        ? "major"
        : "moderate";

  return buildDebt({
    id: `${check.id}-debt`,
    title,
    severity,
    summary: check.summary,
    currentClaim: `Claimed confidence is ${check.claimedConfidence}; earned support is ${check.supportedConfidence}.`,
    safePosture: check.nextStep,
    ownerEngine,
    relatedCheckIds: [check.id],
    relatedFactIds: check.relatedFactIds,
    relatedDocumentIds: check.relatedDocumentIds,
  });
}

export function buildTinaConfidenceCalibration(
  draft: TinaWorkspaceDraft
): TinaConfidenceCalibrationSnapshot {
  const startPath = buildTinaStartPathAssessment(draft);
  const federalReturnClassification = buildTinaFederalReturnClassification(draft);
  const entityFilingRemediation = buildTinaEntityFilingRemediation(draft);
  const unknownPatternEngine = buildTinaUnknownPatternEngine(draft);
  const documentIntelligence = buildTinaDocumentIntelligence(draft);
  const evidenceCredibility = buildTinaEvidenceCredibility(draft);
  const ownerFlowBasis = buildTinaOwnerFlowBasisAdjudication(draft);
  const payrollCompliance = buildTinaPayrollComplianceReconstruction(draft);
  const singleMemberEntityHistory = buildTinaSingleMemberEntityHistoryProof(draft);
  const singleOwnerCorporateRoute = buildTinaSingleOwnerCorporateRouteProof(draft);
  const distinctEinValues = listTinaDocumentIntelligenceDistinctValues({
    snapshot: documentIntelligence,
    kind: "identity_signal",
    label: "Employer identification number",
  });
  const distinctEntityNameValues = listTinaDocumentIntelligenceDistinctValues({
    snapshot: documentIntelligence,
    kind: "entity_name_signal",
    label: "Entity name signal",
  });
  const evidenceSufficiency = buildTinaEvidenceSufficiency(draft);
  const treatmentJudgment = buildTinaTreatmentJudgment(draft);
  const authorityPositionMatrix = buildTinaAuthorityPositionMatrix(draft);
  const planningActionBoard = buildTinaPlanningActionBoard(draft);
  const taxPlanningMemo = buildTinaTaxPlanningMemo(draft);
  const officialFormExecution = buildTinaOfficialFormExecution(draft);
  const officialFormFill = buildTinaOfficialFormFill(draft);
  const formReadiness = buildTinaFormReadiness(draft);
  const reviewerAcceptanceForecast = buildTinaReviewerAcceptanceForecast(draft);
  const reviewerAcceptanceReality = buildTinaReviewerAcceptanceReality(draft);
  const reviewerObservedDeltas = buildTinaReviewerObservedDeltas(draft);
  const reviewerOverrideGovernance = buildTinaReviewerOverrideGovernance(draft);
  const reviewerPolicyVersioning = buildTinaReviewerPolicyVersioning(draft);
  const crossFormConsistency = buildTinaCrossFormConsistency(draft);
  const disclosureReadiness = buildTinaDisclosureReadiness(draft);
  const packageReadiness = buildTinaPackageReadiness(draft);
  const authorityPositionMap = new Map(
    authorityPositionMatrix.items.map((item) => [item.id, item])
  );
  const isSubstantivePosition = (
    position: AuthorityPosition
  ) =>
    position.sourceType !== "tax_opportunity" ||
    position.recommendation === "use_now" ||
    position.recommendation === "review_first" ||
    position.recommendation === "appendix_only";
  const substantiveAcceptanceEntries = reviewerAcceptanceForecast.items
    .map((item) => ({
      item,
      positions: item.relatedPositionIds
        .map((positionId) => authorityPositionMap.get(positionId))
        .filter(isDefinedAuthorityPosition),
    }))
    .filter((entry) => entry.positions.some(isSubstantivePosition));
  const substantiveLikelyAcceptCount = substantiveAcceptanceEntries.filter(
    (entry) => entry.item.status === "likely_accept"
  ).length;
  const substantiveLikelyPushbackCount = substantiveAcceptanceEntries.filter(
    (entry) => entry.item.status === "likely_pushback"
  ).length;
  const substantiveLikelyRejectCount = substantiveAcceptanceEntries.filter(
    (entry) => entry.item.status === "likely_reject"
  ).length;
  const planningAdvanceEntries = planningActionBoard.items
    .map((item) => ({
      item,
      position: authorityPositionMap.get(item.id),
    }))
    .filter((entry) => entry.item.status === "advance");
  const substantivePlanningAdvanceCount = planningAdvanceEntries.filter(
    (entry) => entry.position && isSubstantivePosition(entry.position)
  ).length;
  const riskySubstantiveAdvanceCount = planningAdvanceEntries.filter((entry) => {
    if (!entry.position || !isSubstantivePosition(entry.position)) {
      return false;
    }

    return (
      entry.item.authorityStrength === "thin" ||
      entry.item.authorityStrength === "missing" ||
      entry.item.factStrength === "missing" ||
      entry.item.disclosureReadiness === "required" ||
      entry.item.reviewerAcceptance === "likely_reject"
    );
  }).length;

  const routeClaimedConfidence: TinaConfidenceLevel =
    startPath.route === "supported" &&
    federalReturnClassification.confidence === "high" &&
    entityFilingRemediation.overallStatus === "aligned" &&
    entityFilingRemediation.historyStatus === "aligned" &&
    entityFilingRemediation.electionStatus !== "relief_candidate" &&
    entityFilingRemediation.electionStatus !== "unproved" &&
    (singleMemberEntityHistory.overallStatus === "clear" ||
      singleMemberEntityHistory.overallStatus === "not_applicable") &&
    (singleOwnerCorporateRoute.overallStatus === "clear" ||
      singleOwnerCorporateRoute.overallStatus === "not_applicable") &&
    entityFilingRemediation.amendmentStatus === "not_applicable"
      ? "high"
      : startPath.route === "blocked" ||
          federalReturnClassification.confidence === "blocked" ||
          entityFilingRemediation.overallStatus === "blocked" ||
          entityFilingRemediation.historyStatus === "blocked" ||
          entityFilingRemediation.electionStatus === "relief_candidate" ||
          entityFilingRemediation.electionStatus === "unproved" ||
          singleMemberEntityHistory.overallStatus === "blocked" ||
          singleOwnerCorporateRoute.overallStatus === "blocked" ||
          entityFilingRemediation.amendmentStatus === "sequencing_required"
        ? "low"
        : "medium";
  const routeSupportedConfidence: TinaConfidenceLevel =
    unknownPatternEngine.overallStatus === "known_pattern" &&
    federalReturnClassification.confidence === "high" &&
    entityFilingRemediation.overallStatus === "aligned" &&
    entityFilingRemediation.historyStatus === "aligned" &&
    entityFilingRemediation.electionStatus !== "relief_candidate" &&
    entityFilingRemediation.electionStatus !== "unproved" &&
    (singleMemberEntityHistory.overallStatus === "clear" ||
      singleMemberEntityHistory.overallStatus === "not_applicable") &&
    (singleOwnerCorporateRoute.overallStatus === "clear" ||
      singleOwnerCorporateRoute.overallStatus === "not_applicable") &&
    entityFilingRemediation.amendmentStatus === "not_applicable" &&
    documentIntelligence.identityConflictCount === 0 &&
    documentIntelligence.continuityConflictCount === 0 &&
    distinctEinValues.length <= 1 &&
    distinctEntityNameValues.length <= 1
      ? "high"
      : unknownPatternEngine.overallStatus === "novel_pattern" ||
          entityFilingRemediation.overallStatus === "blocked" ||
          entityFilingRemediation.historyStatus === "blocked" ||
          entityFilingRemediation.electionStatus === "relief_candidate" ||
          entityFilingRemediation.electionStatus === "unproved" ||
          singleMemberEntityHistory.overallStatus === "blocked" ||
          singleOwnerCorporateRoute.overallStatus === "blocked" ||
          entityFilingRemediation.amendmentStatus === "sequencing_required" ||
          documentIntelligence.identityConflictCount > 0 ||
          documentIntelligence.continuityConflictCount > 0 ||
          distinctEinValues.length > 1 ||
          distinctEntityNameValues.length > 1 ||
          federalReturnClassification.confidence === "blocked"
        ? "low"
        : "medium";
  const routeStatus: TinaConfidenceCalibrationCheck["status"] =
    startPath.route === "blocked" ||
    federalReturnClassification.confidence === "blocked" ||
    entityFilingRemediation.overallStatus === "blocked" ||
    entityFilingRemediation.historyStatus === "blocked" ||
    entityFilingRemediation.electionStatus === "relief_candidate" ||
    entityFilingRemediation.electionStatus === "unproved" ||
    singleMemberEntityHistory.overallStatus === "blocked" ||
    singleOwnerCorporateRoute.overallStatus === "blocked" ||
    entityFilingRemediation.amendmentStatus === "sequencing_required" ||
    unknownPatternEngine.overallStatus === "novel_pattern"
      ? "blocked"
      : rankConfidence(routeClaimedConfidence) > rankConfidence(routeSupportedConfidence)
        ? "overstated"
        : unknownPatternEngine.overallStatus === "ambiguous_pattern" ||
            entityFilingRemediation.overallStatus === "review_required" ||
            entityFilingRemediation.historyStatus === "review_required" ||
            entityFilingRemediation.amendmentStatus === "possible" ||
            singleMemberEntityHistory.overallStatus === "review_required" ||
            singleOwnerCorporateRoute.overallStatus === "review_required" ||
            federalReturnClassification.confidence === "low" ||
            startPath.route === "review_only"
          ? "watch"
          : "calibrated";

  const evidenceClaimedConfidence: TinaConfidenceLevel =
    officialFormExecution.overallStatus === "ready_to_fill" ||
    formReadiness.level === "reviewer_ready"
      ? "high"
      : officialFormExecution.overallStatus === "review_required" ||
          formReadiness.level === "provisional"
        ? "medium"
        : "low";
  const ownerFlowEvidenceBlocked =
    ownerFlowBasis.overallStatus === "blocked" ||
    ownerFlowBasis.openingFootingStatus === "blocked" ||
    ownerFlowBasis.basisRollforwardStatus === "blocked" ||
    ownerFlowBasis.transitionEconomicsStatus === "blocked";
  const ownerFlowEvidenceWatch =
    ownerFlowBasis.overallStatus === "review_required" ||
    ownerFlowBasis.openingFootingStatus === "review_required" ||
    ownerFlowBasis.basisRollforwardStatus === "review_required" ||
    ownerFlowBasis.transitionEconomicsStatus === "review_required";
  const evidenceSupportedConfidence: TinaConfidenceLevel =
    evidenceSufficiency.overallStatus === "reviewer_grade" &&
    evidenceCredibility.overallStatus !== "blocked" &&
    !ownerFlowEvidenceBlocked &&
    !ownerFlowEvidenceWatch &&
    evidenceCredibility.blockingFactorCount === 0 &&
    evidenceCredibility.materialVarianceCount === 0 &&
    payrollCompliance.overallStatus !== "blocked" &&
    singleMemberEntityHistory.overallStatus !== "blocked" &&
    singleOwnerCorporateRoute.overallStatus !== "blocked" &&
    payrollCompliance.reviewIssueCount === 0 &&
    documentIntelligence.overallStatus !== "conflicted" &&
    documentIntelligence.missingCriticalRoleCount === 0 &&
    documentIntelligence.identityConflictCount === 0 &&
    documentIntelligence.continuityConflictCount === 0
      ? "high"
      : evidenceSufficiency.overallStatus === "blocked" ||
          evidenceCredibility.overallStatus === "blocked" ||
          ownerFlowEvidenceBlocked ||
          payrollCompliance.overallStatus === "blocked" ||
          singleMemberEntityHistory.overallStatus === "blocked" ||
          singleOwnerCorporateRoute.overallStatus === "blocked" ||
          distinctEinValues.length > 1 ||
          distinctEntityNameValues.length > 1 ||
          documentIntelligence.identityConflictCount > 0 ||
          documentIntelligence.continuityConflictCount > 0
        ? "low"
        : "medium";
  const evidenceStatus: TinaConfidenceCalibrationCheck["status"] =
    evidenceSufficiency.overallStatus === "blocked" ||
    evidenceCredibility.overallStatus === "blocked" ||
    payrollCompliance.overallStatus === "blocked" ||
    ownerFlowEvidenceBlocked ||
    formReadiness.level === "not_ready" ||
    officialFormExecution.overallStatus === "blocked" ||
    (evidenceClaimedConfidence === "high" && evidenceSupportedConfidence === "low")
      ? "blocked"
      : rankConfidence(evidenceClaimedConfidence) > rankConfidence(evidenceSupportedConfidence)
        ? "overstated"
        : evidenceSupportedConfidence === "medium"
          ? "watch"
          : "calibrated";

  const rejectTreatmentCount = treatmentJudgment.items.filter(
    (item) => item.taxPositionBucket === "reject"
  ).length;
  const reviewTreatmentCount = treatmentJudgment.items.filter(
    (item) => item.taxPositionBucket === "review"
  ).length;
  const ownerFlowTreatmentBlocked =
    ownerFlowBasis.overallStatus === "blocked" ||
    ownerFlowBasis.loanEquityStatus === "blocked" ||
    ownerFlowBasis.distributionTaxabilityStatus === "blocked" ||
    ownerFlowBasis.transitionEconomicsStatus === "blocked";
  const ownerFlowTreatmentWatch =
    ownerFlowBasis.overallStatus === "review_required" ||
    ownerFlowBasis.loanEquityStatus === "review_required" ||
    ownerFlowBasis.distributionTaxabilityStatus === "review_required" ||
    ownerFlowBasis.transitionEconomicsStatus === "review_required" ||
    ownerFlowBasis.ownerFlowCharacterizationStatus === "review_required";
  const treatmentClaimedConfidence: TinaConfidenceLevel =
    rejectTreatmentCount > 0
      ? "low"
      : substantiveLikelyAcceptCount > 0 &&
          authorityPositionMatrix.overallStatus === "actionable" &&
          substantiveLikelyPushbackCount === 0 &&
          substantiveLikelyRejectCount === 0
      ? "high"
        : substantiveLikelyAcceptCount > 0 ||
            substantiveLikelyPushbackCount > 0 ||
            reviewTreatmentCount > 0
          ? "medium"
          : "low";
  const treatmentSupportedConfidence: TinaConfidenceLevel =
    rejectTreatmentCount > 0 ||
    substantiveLikelyRejectCount > 0 ||
    ownerFlowTreatmentBlocked
      ? "low"
      : reviewTreatmentCount > 0 ||
          ownerFlowTreatmentWatch ||
          substantiveLikelyPushbackCount > 0 ||
          (substantiveLikelyAcceptCount > 0 && authorityPositionMatrix.overallStatus !== "actionable")
        ? "medium"
        : "high";
  const treatmentStatus: TinaConfidenceCalibrationCheck["status"] =
    rejectTreatmentCount > 0 || substantiveLikelyRejectCount > 0 || ownerFlowTreatmentBlocked
      ? "blocked"
      : rankConfidence(treatmentClaimedConfidence) > rankConfidence(treatmentSupportedConfidence)
        ? "overstated"
        : treatmentSupportedConfidence === "medium"
          ? "watch"
          : "calibrated";

  const actionablePlanningCount = planningActionBoard.items.filter(
    (item) => item.status === "advance"
  ).length;
  const planningClaimedConfidence: TinaConfidenceLevel =
    substantivePlanningAdvanceCount > 0
      ? "high"
      : actionablePlanningCount > 0
        ? "medium"
        : "low";
  const planningSupportedConfidence: TinaConfidenceLevel =
    riskySubstantiveAdvanceCount > 0
      ? "low"
      : substantivePlanningAdvanceCount > 0 &&
          taxPlanningMemo.overallStatus === "actionable" &&
          authorityPositionMatrix.overallStatus === "actionable"
      ? "high"
      : actionablePlanningCount > 0 ||
          taxPlanningMemo.overallStatus !== "thin" ||
          authorityPositionMatrix.overallStatus !== "thin"
        ? "medium"
        : "low";
  const planningStatus: TinaConfidenceCalibrationCheck["status"] =
    riskySubstantiveAdvanceCount > 0
      ? "blocked"
      : rankConfidence(planningClaimedConfidence) > rankConfidence(planningSupportedConfidence)
        ? "overstated"
        : planningSupportedConfidence === "medium"
          ? "watch"
          : "calibrated";

  const formClaimedConfidence: TinaConfidenceLevel =
    officialFormExecution.overallStatus === "ready_to_fill"
      ? "high"
      : officialFormExecution.overallStatus === "review_required"
        ? "medium"
        : "low";
  const formSupportedConfidence: TinaConfidenceLevel =
    officialFormExecution.overallStatus === "ready_to_fill" &&
    crossFormConsistency.overallStatus === "aligned" &&
    officialFormFill.overallStatus === "ready" &&
    formReadiness.level === "reviewer_ready" &&
    disclosureReadiness.overallStatus === "clear"
      ? "high"
      : crossFormConsistency.overallStatus === "blocked" ||
          disclosureReadiness.overallStatus === "required" ||
          officialFormFill.overallStatus === "blocked" ||
          formReadiness.level === "not_ready"
        ? "low"
        : "medium";
  const formExecutionStatus: TinaConfidenceCalibrationCheck["status"] =
    (formClaimedConfidence === "high" && formSupportedConfidence === "low") ||
    officialFormExecution.overallStatus === "blocked"
      ? "blocked"
      : rankConfidence(formClaimedConfidence) > rankConfidence(formSupportedConfidence)
        ? "overstated"
        : formSupportedConfidence === "medium"
          ? "watch"
          : "calibrated";

  const reviewerClaimedConfidence: TinaConfidenceLevel =
    packageReadiness.level === "ready_for_cpa"
      ? "high"
      : packageReadiness.level === "needs_review"
        ? "medium"
        : "low";
  const reviewerGovernanceBlocked =
    reviewerOverrideGovernance.overallStatus === "policy_update_required" ||
    reviewerOverrideGovernance.blockingAcceptanceDeltaCount > 0;
  const reviewerGovernanceWatch =
    reviewerOverrideGovernance.overallStatus === "active_overrides" ||
    reviewerOverrideGovernance.openOverrideCount > 0;
  const reviewerObservedBlocked =
    reviewerObservedDeltas.overallStatus === "regressing" ||
    reviewerObservedDeltas.overallStatus === "policy_update_required";
  const reviewerObservedWatch =
    reviewerObservedDeltas.overallStatus === "watch" ||
    reviewerObservedDeltas.acceptedAfterAdjustmentCount > 0;
  const reviewerRealityBlocked = reviewerAcceptanceReality.overallStatus === "regressing";
  const reviewerRealityWatch =
    reviewerAcceptanceReality.overallStatus === "watch" &&
    reviewerAcceptanceReality.totalObservedThemeCount > 0;
  const reviewerPolicyBlocked = reviewerPolicyVersioning.overallStatus === "blocked";
  const reviewerPolicyWatch =
    reviewerPolicyVersioning.overallStatus === "release_queue" ||
    reviewerPolicyVersioning.readyToPromoteCount > 0 ||
    reviewerPolicyVersioning.benchmarkingPolicyCount > 0 ||
    reviewerPolicyVersioning.candidatePolicyCount > 0;
  const reviewerSupportedConfidence: TinaConfidenceLevel =
    unknownPatternEngine.overallStatus === "novel_pattern" ||
    substantiveLikelyRejectCount > 0 ||
    reviewerObservedBlocked ||
    reviewerGovernanceBlocked ||
    reviewerRealityBlocked ||
    reviewerPolicyBlocked
      ? "low"
      : packageReadiness.level === "ready_for_cpa" &&
          substantiveLikelyPushbackCount === 0 &&
          unknownPatternEngine.overallStatus === "known_pattern" &&
          !reviewerObservedWatch &&
          !reviewerGovernanceWatch &&
          !reviewerRealityWatch &&
          !reviewerPolicyWatch
      ? "high"
        : substantiveLikelyPushbackCount > 0 ||
            reviewerObservedWatch ||
            reviewerGovernanceWatch ||
            reviewerRealityWatch ||
            reviewerPolicyWatch ||
            packageReadiness.level === "needs_review" ||
            packageReadiness.level === "blocked"
          ? "medium"
          : "high";
  const reviewerAcceptanceStatus: TinaConfidenceCalibrationCheck["status"] =
    (reviewerClaimedConfidence === "high" && reviewerSupportedConfidence === "low") ||
    unknownPatternEngine.overallStatus === "novel_pattern" ||
    substantiveLikelyRejectCount > 0 ||
    reviewerObservedBlocked ||
    reviewerGovernanceBlocked ||
    reviewerRealityBlocked ||
    reviewerPolicyBlocked
      ? "blocked"
      : rankConfidence(reviewerClaimedConfidence) > rankConfidence(reviewerSupportedConfidence)
        ? "overstated"
        : reviewerSupportedConfidence === "medium"
          ? "watch"
          : "calibrated";

  const checks: TinaConfidenceCalibrationCheck[] = [
    buildCheck({
      id: "route-confidence",
      title: "Route confidence calibration",
      domain: "route",
      status: routeStatus,
      claimedConfidence: routeClaimedConfidence,
      supportedConfidence: routeSupportedConfidence,
      summary:
        routeStatus === "calibrated"
          ? "Lane posture, route confidence, and novelty handling are aligned."
          : routeStatus === "watch"
            ? "Tina has a plausible route, but the route language should stay reviewer-controlled."
            : routeStatus === "overstated"
              ? "The current lane posture sounds firmer than the route evidence really earns."
              : "Tina should not let the current lane posture outrun the route and novelty evidence.",
      nextStep:
        routeStatus === "calibrated"
          ? "Carry the current lane forward without widening the claim."
          : "Keep route choice under reviewer control until route proof and novelty pressure settle.",
      ownerEngines: [
        "start-path",
        "federal-return-classification",
        "entity-filing-remediation",
        "single-member-entity-history-proof",
        "single-owner-corporate-route-proof",
        "unknown-pattern-engine",
      ],
      relatedFactIds: unique([
        ...startPath.relatedFactIds,
        ...entityFilingRemediation.relatedFactIds,
        ...singleMemberEntityHistory.relatedFactIds,
        ...singleOwnerCorporateRoute.relatedFactIds,
        ...unknownPatternEngine.signals.flatMap((signal) => signal.relatedFactIds),
        ...documentIntelligence.items.flatMap((item) => item.relatedFactIds),
      ]),
      relatedDocumentIds: unique([
        ...startPath.relatedDocumentIds,
        ...entityFilingRemediation.relatedDocumentIds,
        ...singleMemberEntityHistory.relatedDocumentIds,
        ...singleOwnerCorporateRoute.relatedDocumentIds,
        ...unknownPatternEngine.signals.flatMap((signal) => signal.relatedDocumentIds),
        ...documentIntelligence.items.flatMap((item) => item.documentId),
      ]),
    }),
    buildCheck({
      id: "evidence-confidence",
      title: "Evidence confidence calibration",
      domain: "evidence",
      status: evidenceStatus,
      claimedConfidence: evidenceClaimedConfidence,
      supportedConfidence: evidenceSupportedConfidence,
      summary:
        evidenceStatus === "calibrated"
          ? "Evidence strength, credibility, and execution posture are aligned."
          : evidenceStatus === "watch"
            ? "Evidence is usable, but Tina should keep the posture provisional instead of sounding final."
            : evidenceStatus === "overstated"
              ? "The execution stack sounds stronger than the evidence quality currently supports."
              : "Thin or blocked evidence means Tina should not act as if the current numbers are reviewer-grade.",
      nextStep:
        evidenceStatus === "calibrated"
          ? "Preserve the current evidence bar as the return artifacts move forward."
          : "Strengthen independent support before Tina lets the current evidence posture sound final.",
      ownerEngines: [
        "evidence-sufficiency",
        "evidence-credibility",
        "owner-flow-basis-adjudication",
        "payroll-compliance-reconstruction",
        "single-member-entity-history-proof",
        "single-owner-corporate-route-proof",
        "official-form-execution",
        "document-intelligence",
      ],
      relatedFactIds: unique(
        [
          ...evidenceSufficiency.lines.flatMap((line) => line.relatedFactIds),
          ...evidenceCredibility.factors.flatMap((factor) => factor.relatedFactIds),
          ...ownerFlowBasis.items.flatMap((item) => item.relatedFactIds),
          ...payrollCompliance.relatedFactIds,
          ...singleMemberEntityHistory.relatedFactIds,
          ...singleOwnerCorporateRoute.relatedFactIds,
          ...documentIntelligence.items.flatMap((item) => item.relatedFactIds),
        ]
      ),
      relatedDocumentIds: unique(
        [
          ...evidenceSufficiency.lines.flatMap((line) => line.relatedDocumentIds),
          ...evidenceCredibility.factors.flatMap((factor) => factor.relatedDocumentIds),
          ...ownerFlowBasis.items.flatMap((item) => item.relatedDocumentIds),
          ...payrollCompliance.relatedDocumentIds,
          ...singleMemberEntityHistory.relatedDocumentIds,
          ...singleOwnerCorporateRoute.relatedDocumentIds,
          ...documentIntelligence.items.map((item) => item.documentId),
        ]
      ),
    }),
    buildCheck({
      id: "treatment-confidence",
      title: "Treatment confidence calibration",
      domain: "treatment",
      status: treatmentStatus,
      claimedConfidence: treatmentClaimedConfidence,
      supportedConfidence: treatmentSupportedConfidence,
      summary:
        treatmentStatus === "calibrated"
          ? "Treatment posture matches the law, facts, and reviewer acceptance signals."
          : treatmentStatus === "watch"
            ? "Treatment calls are plausible, but reviewer pressure still matters."
            : treatmentStatus === "overstated"
              ? "Treatment language is getting ahead of the actual authority or reviewer acceptance support."
              : "Blocked or likely-rejected treatment calls mean Tina should fail closed.",
      nextStep:
        treatmentStatus === "calibrated"
          ? "Carry the current treatment posture into reviewer artifacts without widening the claim."
          : "Keep non-routine treatment under reviewer control until authority, facts, and likely acceptance align.",
      ownerEngines: [
        "treatment-judgment",
        "owner-flow-basis-adjudication",
        "authority-position-matrix",
        "reviewer-acceptance-forecast",
      ],
      relatedFactIds: unique([
        ...treatmentJudgment.items.flatMap((item) => item.relatedFactIds),
        ...ownerFlowBasis.items.flatMap((item) => item.relatedFactIds),
        ...authorityPositionMatrix.items.flatMap((item) => item.relatedFactIds),
      ]),
      relatedDocumentIds: unique([
        ...treatmentJudgment.items.flatMap((item) => item.relatedDocumentIds),
        ...ownerFlowBasis.items.flatMap((item) => item.relatedDocumentIds),
        ...authorityPositionMatrix.items.flatMap((item) => item.relatedDocumentIds),
        ...reviewerAcceptanceForecast.items.flatMap((item) => item.relatedDocumentIds),
      ]),
    }),
    buildCheck({
      id: "planning-confidence",
      title: "Planning confidence calibration",
      domain: "planning",
      status: planningStatus,
      claimedConfidence: planningClaimedConfidence,
      supportedConfidence: planningSupportedConfidence,
      summary:
        planningStatus === "calibrated"
          ? "Planning advances are backed strongly enough to sound real."
          : planningStatus === "watch"
            ? "Planning moves are worth preserving, but they still need tighter backing before Tina sounds forceful."
            : planningStatus === "overstated"
              ? "Planning language is outrunning the current authority, fact, or reviewer-acceptance support."
              : "At least one planning advance is too risky to keep in the immediate lane.",
      nextStep:
        planningStatus === "calibrated"
          ? "Keep the strongest planning moves live and contained."
          : "Demote or clarify planning claims until the best moves are authority-backed and reviewer-safe.",
      ownerEngines: ["planning-action-board", "tax-planning-memo", "authority-position-matrix"],
      relatedFactIds: unique(
        authorityPositionMatrix.items.flatMap((item) => item.relatedFactIds)
      ),
      relatedDocumentIds: unique([
        ...planningActionBoard.items.flatMap((item) => item.relatedDocumentIds),
        ...authorityPositionMatrix.items.flatMap((item) => item.relatedDocumentIds),
      ]),
    }),
    buildCheck({
      id: "form-execution-confidence",
      title: "Form-execution confidence calibration",
      domain: "form_execution",
      status: formExecutionStatus,
      claimedConfidence: formClaimedConfidence,
      supportedConfidence: formSupportedConfidence,
      summary:
        formExecutionStatus === "calibrated"
          ? "Form execution posture matches readiness, fill support, disclosure posture, and cross-form consistency."
          : formExecutionStatus === "watch"
            ? "Form execution is moving in the right direction, but the confidence should stay provisional."
            : formExecutionStatus === "overstated"
              ? "Execution language is stronger than the real fill, readiness, or consistency support."
              : "Tina should not let the form-execution layer sound final yet.",
      nextStep:
        formExecutionStatus === "calibrated"
          ? "Preserve the current execution posture as Tina moves toward blank-form rendering."
          : "Keep form execution reviewer-controlled until readiness, fill support, consistency, and disclosure posture align.",
      ownerEngines: [
        "official-form-execution",
        "official-form-fill",
        "cross-form-consistency",
        "disclosure-readiness",
      ],
      relatedFactIds: [],
      relatedDocumentIds: unique([
        ...officialFormExecution.items.flatMap((item) => item.relatedDocumentIds),
        ...crossFormConsistency.issues.flatMap((issue) => issue.relatedDocumentIds),
        ...disclosureReadiness.items.flatMap((item) => item.relatedDocumentIds),
      ]),
    }),
    buildCheck({
      id: "reviewer-acceptance-confidence",
      title: "Reviewer-acceptance confidence calibration",
      domain: "review_acceptance",
      status: reviewerAcceptanceStatus,
      claimedConfidence: reviewerClaimedConfidence,
      supportedConfidence: reviewerSupportedConfidence,
      summary:
        reviewerAcceptanceStatus === "calibrated"
          ? "Package readiness, likely reviewer acceptance, observed reviewer acceptance reality, reviewer-override governance, and reviewer policy maturity are aligned."
          : reviewerAcceptanceStatus === "watch"
            ? "The package can keep moving, but it should not sound more reviewer-ready than the forecast, observed acceptance reality, override-governance, and policy-maturity posture earns."
            : reviewerAcceptanceStatus === "overstated"
              ? "Readiness language is getting ahead of the likely reviewer reaction, observed acceptance reality, override-governance posture, or policy-maturity state."
              : "The file should not be presented as reviewer-ready while likely acceptance, observed reviewer acceptance reality, reviewer-override governance, or reviewer policy maturity remains weak.",
      nextStep:
        reviewerAcceptanceStatus === "calibrated"
          ? "Keep the package posture aligned with the likely reviewer outcome."
          : "Keep the file in reviewer-controlled posture until likely acceptance, observed reviewer outcomes, reviewer-override governance, and reviewer policy maturity improve.",
      ownerEngines: [
        "package-readiness",
        "reviewer-acceptance-forecast",
        "reviewer-acceptance-reality",
        "reviewer-override-governance",
        "reviewer-policy-versioning",
        "unknown-pattern-engine",
      ],
      relatedFactIds: unique(
        unknownPatternEngine.signals.flatMap((signal) => signal.relatedFactIds)
      ),
      relatedDocumentIds: unique([
        ...reviewerAcceptanceForecast.items.flatMap((item) => item.relatedDocumentIds),
        ...unknownPatternEngine.signals.flatMap((signal) => signal.relatedDocumentIds),
      ]),
    }),
  ];

  const debts: TinaConfidenceDebt[] = [];

  if (routeStatus !== "calibrated") {
    debts.push(
      buildDebtForCheck(
        checks[0],
        "Route certainty still needs reviewer-controlled posture",
        "unknown-pattern-engine"
      )
    );
  }
  if (evidenceStatus !== "calibrated") {
    debts.push(
      buildDebtForCheck(
        checks[1],
        "Evidence posture is stronger than the support stack really earns",
        "evidence-sufficiency"
      )
    );
  }
  if (treatmentStatus !== "calibrated") {
    debts.push(
      buildDebtForCheck(
        checks[2],
        "Treatment confidence still needs stronger authority and reviewer support",
        "treatment-judgment"
      )
    );
  }
  if (planningStatus !== "calibrated") {
    debts.push(
      buildDebtForCheck(
        checks[3],
        "Planning claims still need tighter backing before Tina sounds forceful",
        "planning-action-board"
      )
    );
  }
  if (formExecutionStatus !== "calibrated") {
    debts.push(
      buildDebtForCheck(
        checks[4],
        "Form execution still sounds more finished than the backend proof stack allows",
        "official-form-execution"
      )
    );
  }
  if (reviewerAcceptanceStatus !== "calibrated") {
    debts.push(
      buildDebtForCheck(
        checks[5],
        "Reviewer-ready posture still needs stronger acceptance support",
        "reviewer-acceptance-forecast"
      )
    );
  }

  const overallStatus: TinaConfidenceCalibrationSnapshot["overallStatus"] = checks.some(
    (check) => check.status === "blocked"
  )
    ? "blocked"
    : checks.some((check) => check.status === "overstated")
      ? "overstated"
      : checks.some((check) => check.status === "watch")
        ? "watch"
        : "calibrated";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    overallStatus,
    recommendedPosture:
      overallStatus === "calibrated"
        ? "normal_use"
        : overallStatus === "watch" || overallStatus === "overstated"
          ? "reviewer_controlled"
          : "hold_until_proved",
    summary:
      overallStatus === "calibrated"
        ? "Tina's claimed confidence and earned support are aligned across the major backend judgment domains."
        : overallStatus === "watch"
          ? "Tina is mostly calibrated, but some domains still need reviewer-controlled confidence language."
          : overallStatus === "overstated"
            ? "Some Tina artifacts are sounding stronger than the current facts, law, or execution stack actually support."
            : "Tina should fail closed because confidence debt is still blocking safe reviewer-grade posture.",
    nextStep:
      overallStatus === "calibrated"
        ? "Preserve the current confidence bar as Tina pushes toward deeper execution."
        : overallStatus === "watch"
          ? "Keep reviewer-facing language honest and avoid widening claims while the remaining confidence debt settles."
          : overallStatus === "overstated"
            ? "Demote the overstated domains back into reviewer-controlled posture before Tina sounds more certain than she is."
            : "Clear the blocking confidence debt before Tina behaves like the current output is reviewer-trustworthy.",
    checks,
    debts,
  };
}
