import { buildTinaAttachmentStatements } from "@/tina/lib/attachment-statements";
import { buildTinaAttachmentSchedules } from "@/tina/lib/attachment-schedules";
import { buildTinaAccountingArtifactCoverage } from "@/tina/lib/accounting-artifact-coverage";
import { buildTinaAuthorityPositionMatrix } from "@/tina/lib/authority-position-matrix";
import { buildTinaBooksNormalization } from "@/tina/lib/books-normalization";
import { buildTinaBooksReconciliation } from "@/tina/lib/books-reconciliation";
import { buildTinaBooksReconstruction } from "@/tina/lib/books-reconstruction";
import { buildTinaCaseMemoryLedger } from "@/tina/lib/case-memory-ledger";
import { buildTinaCompanionFormPlan } from "@/tina/lib/companion-form-plan";
import { buildTinaCompanionFormRenderPlan } from "@/tina/lib/companion-form-render-plan";
import { buildTinaConfidenceCalibration } from "@/tina/lib/confidence-calibration";
import { buildTinaCpaHandoff } from "@/tina/lib/cpa-handoff";
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
import { buildTinaOfficialFormFill } from "@/tina/lib/official-form-fill";
import { buildTinaOfficialFormExecution } from "@/tina/lib/official-form-execution";
import { buildTinaOwnerFlowBasisAdjudication } from "@/tina/lib/owner-flow-basis-adjudication";
import { buildTinaOwnershipCapitalEvents } from "@/tina/lib/ownership-capital-events";
import { buildTinaOwnershipTimeline } from "@/tina/lib/ownership-timeline";
import { buildTinaPackageReadiness } from "@/tina/lib/package-readiness";
import { buildTinaPayrollComplianceReconstruction } from "@/tina/lib/payroll-compliance-reconstruction";
import { buildTinaMaterialityPriority } from "@/tina/lib/materiality-priority";
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
import { buildTinaStartPathAssessment, formatTinaLaneList } from "@/tina/lib/start-path";
import { buildTinaCompanionFormCalculations } from "@/tina/lib/companion-form-calculations";
import { buildTinaTaxOpportunityEngine } from "@/tina/lib/tax-opportunity-engine";
import { buildTinaPlanningActionBoard } from "@/tina/lib/planning-action-board";
import { buildTinaTaxPlanningMemo } from "@/tina/lib/tax-planning-memo";
import { buildTinaTaxTreatmentPolicy } from "@/tina/lib/tax-treatment-policy";
import { buildTinaTreatmentJudgment } from "@/tina/lib/treatment-judgment";
import { buildTinaUnknownPatternEngine } from "@/tina/lib/unknown-pattern-engine";
import type { TinaWorkspaceDraft } from "@/tina/types";

const cpaPacketExportCache = new WeakMap<TinaWorkspaceDraft, TinaCpaPacketExport>();

function formatMoney(value: number | null): string {
  if (value === null) return "No dollar amount yet";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export interface TinaCpaPacketExport {
  fileName: string;
  mimeType: string;
  contents: string;
}

export function buildTinaCpaPacketExport(draft: TinaWorkspaceDraft): TinaCpaPacketExport {
  const cached = cpaPacketExportCache.get(draft);
  if (cached) {
    return cached;
  }

  const packageReadiness = buildTinaPackageReadiness(draft);
  const effectiveDraft = {
    ...draft,
    packageReadiness,
  };
  const handoff = buildTinaCpaHandoff(effectiveDraft);
  const federalReturnClassification = buildTinaFederalReturnClassification(draft);
  const entityFilingRemediation = buildTinaEntityFilingRemediation(draft);
  const singleMemberEntityHistory = buildTinaSingleMemberEntityHistoryProof(draft);
  const singleOwnerCorporateRoute = buildTinaSingleOwnerCorporateRouteProof(draft);
  const unknownPatternEngine = buildTinaUnknownPatternEngine(draft);
  const confidenceCalibration = buildTinaConfidenceCalibration(draft);
  const documentIntelligence = buildTinaDocumentIntelligence(draft);
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
  const scheduleCReturn = buildTinaScheduleCReturn(draft);
  const formCoverage = buildTinaScheduleCFormCoverage(draft);
  const formTrace = buildTinaScheduleCFormTrace(draft);
  const formReadiness = buildTinaFormReadiness(draft);
  const officialFormTemplates = buildTinaOfficialFederalFormTemplateSnapshot(draft);
  const officialFormFill = buildTinaOfficialFormFill(draft);
  const officialFormExecution = buildTinaOfficialFormExecution(draft);
  const evidenceSufficiency = buildTinaEvidenceSufficiency(draft);
  const booksReconstruction = buildTinaBooksReconstruction(draft);
  const booksReconciliation = buildTinaBooksReconciliation(draft);
  const booksNormalization = buildTinaBooksNormalization(draft);
  const accountingArtifactCoverage = buildTinaAccountingArtifactCoverage(draft);
  const payrollCompliance = buildTinaPayrollComplianceReconstruction(draft);
  const attachmentStatements = buildTinaAttachmentStatements(draft);
  const attachmentSchedules = buildTinaAttachmentSchedules(draft);
  const decisionBriefings = buildTinaDecisionBriefings(draft);
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
  const reviewerChallenges = buildTinaReviewerChallenges(draft);
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
  const evidenceCounts = formTrace.lines.reduce(
    (counts, line) => {
      if (typeof line.amount !== "number" || line.amount === 0) return counts;
      counts[line.evidenceSupportLevel] += 1;
      return counts;
    },
    { strong: 0, moderate: 0, weak: 0, missing: 0 }
  );
  const lane = startPath.recommendation;
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
  const supportedExpenseFields = scheduleCReturn.fields.filter((field) =>
    supportedExpenseFieldKeys.includes(field.formKey)
  );
  const supportedExpenseFieldsWithAmounts = supportedExpenseFields.filter(
    (field) => typeof field.amount === "number" && field.amount > 0
  );
  const otherExpensesField =
    scheduleCReturn.fields.find((field) => field.formKey === "otherExpenses") ?? null;
  const businessName = draft.profile.businessName || "Unnamed business";
  const taxYear = draft.profile.taxYear || "tax-year";
  const slug = toSlug(businessName) || "tina-business";

  const lines: string[] = [
    "# Tina CPA Review Packet",
    "",
    `- Business: ${businessName}`,
    `- Tax year: ${taxYear}`,
    `- Filing lane: ${lane.title}`,
    `- Package state: ${draft.reviewerSignoff.packageState.replace(/_/g, " ")}`,
    `- Packet status: ${handoff.summary}`,
    `- Next step: ${handoff.nextStep}`,
    "",
    "## Start path assessment",
    `- Tina recommendation: ${startPath.recommendation.title}`,
    `- Lane support: ${startPath.recommendation.support}`,
    `- Route: ${startPath.route}`,
    `- Confidence: ${startPath.confidence}`,
    `- Why: ${startPath.recommendation.summary}`,
  ];

  startPath.recommendation.reasons.forEach((reason) => {
    lines.push(`- Start-path reason: ${reason}`);
  });
  startPath.recommendation.blockers.forEach((blocker) => {
    lines.push(`- Start-path blocker: ${blocker}`);
  });
  startPath.blockingReasons.forEach((reason) => {
    lines.push(`- Routing blocker: ${reason}`);
  });
  startPath.reviewReasons.forEach((reason) => {
    lines.push(`- Routing review item: ${reason}`);
  });
  if (startPath.hintedLanes.length > 0) {
    lines.push(`- Paper hints: ${formatTinaLaneList(startPath.hintedLanes)}`);
  }
  if (startPath.proofRequirements.length > 0) {
    lines.push("", "## Start path proof requirements");
    startPath.proofRequirements.forEach((requirement) => {
      lines.push(`- ${requirement.label} [${requirement.status}]`);
      lines.push(`  - ${requirement.reason}`);
    });
  }

  lines.push("", "## Federal return classification engine");
  lines.push(`- Return family: ${federalReturnClassification.returnFamily}`);
  lines.push(`- Lane id: ${federalReturnClassification.laneId}`);
  lines.push(`- Route: ${federalReturnClassification.route}`);
  lines.push(`- Confidence: ${federalReturnClassification.confidence}`);
  lines.push(`- ${federalReturnClassification.summary}`);
  lines.push(`- Next step: ${federalReturnClassification.nextStep}`);
  federalReturnClassification.signals.forEach((signal) => {
    lines.push(`- ${signal.title} [${signal.strength}]`);
    lines.push(`  - ${signal.summary}`);
  });
  federalReturnClassification.issues.forEach((issue) => {
    lines.push(`- ${issue.title} [${issue.severity}]`);
    lines.push(`  - ${issue.summary}`);
  });

  lines.push("", "## Entity filing continuity and remediation");
  lines.push(`- Status: ${entityFilingRemediation.overallStatus}`);
  lines.push(`- Posture: ${entityFilingRemediation.posture.replace(/_/g, " ")}`);
  lines.push(`- History status: ${entityFilingRemediation.historyStatus.replace(/_/g, " ")}`);
  lines.push(`- Election status: ${entityFilingRemediation.electionStatus.replace(/_/g, " ")}`);
  lines.push(`- Amendment status: ${entityFilingRemediation.amendmentStatus.replace(/_/g, " ")}`);
  lines.push(`- Current lane: ${entityFilingRemediation.currentLaneId}`);
  if (entityFilingRemediation.likelyPriorLaneIds.length > 0) {
    lines.push(`- Likely prior lanes: ${entityFilingRemediation.likelyPriorLaneIds.join(", ")}`);
  }
  if (entityFilingRemediation.alternateLaneIds.length > 0) {
    lines.push(`- Alternate lanes: ${entityFilingRemediation.alternateLaneIds.join(", ")}`);
  }
  lines.push(`- ${entityFilingRemediation.summary}`);
  lines.push(`- Next step: ${entityFilingRemediation.nextStep}`);
  entityFilingRemediation.signals.forEach((signal) => {
    lines.push(`- ${signal.title} [${signal.category} | ${signal.severity}]`);
    lines.push(`  - ${signal.summary}`);
  });
  entityFilingRemediation.priorityQuestions.forEach((question) => {
    lines.push(`- Priority question: ${question}`);
  });
  entityFilingRemediation.actions.forEach((action) => {
    lines.push(`- Action: ${action.title} [${action.kind} | ${action.status}]`);
    lines.push(`  - ${action.summary}`);
  });

  lines.push("", "## Single-member entity-history proof");
  lines.push(`- Status: ${singleMemberEntityHistory.overallStatus}`);
  lines.push(`- Posture: ${singleMemberEntityHistory.posture.replace(/_/g, " ")}`);
  lines.push(
    `- Owner history: ${singleMemberEntityHistory.ownerHistoryStatus.replace(/_/g, " ")}`
  );
  lines.push(
    `- Spouse exception: ${singleMemberEntityHistory.spouseExceptionStatus.replace(/_/g, " ")}`
  );
  lines.push(
    `- Prior filing alignment: ${singleMemberEntityHistory.priorFilingAlignmentStatus.replace(/_/g, " ")}`
  );
  lines.push(
    `- Transition year: ${singleMemberEntityHistory.transitionYearStatus.replace(/_/g, " ")}`
  );
  lines.push(
    `- Books posture: ${singleMemberEntityHistory.booksPostureStatus.replace(/_/g, " ")}`
  );
  lines.push(`- ${singleMemberEntityHistory.summary}`);
  lines.push(`- Next step: ${singleMemberEntityHistory.nextStep}`);
  singleMemberEntityHistory.issues.forEach((issue) => {
    lines.push(`- ${issue.severity === "blocking" ? "Blocking" : "Review"}: ${issue.summary}`);
  });
  singleMemberEntityHistory.questions.forEach((question) => {
    lines.push(`- Question: ${question}`);
  });

  lines.push("", "## Single-owner corporate route proof");
  lines.push(`- Status: ${singleOwnerCorporateRoute.overallStatus}`);
  lines.push(`- Posture: ${singleOwnerCorporateRoute.posture.replace(/_/g, " ")}`);
  lines.push(
    `- Election proof: ${singleOwnerCorporateRoute.electionProofStatus.replace(/_/g, " ")}`
  );
  lines.push(
    `- Payroll requirement: ${singleOwnerCorporateRoute.payrollRequirementStatus.replace(/_/g, " ")}`
  );
  lines.push(
    `- Owner services: ${singleOwnerCorporateRoute.ownerServiceStatus.replace(/_/g, " ")}`
  );
  lines.push(`- ${singleOwnerCorporateRoute.summary}`);
  lines.push(`- Next step: ${singleOwnerCorporateRoute.nextStep}`);
  singleOwnerCorporateRoute.issues.forEach((issue) => {
    lines.push(`- ${issue.title} [${issue.severity}]`);
    lines.push(`  - ${issue.summary}`);
  });
  singleOwnerCorporateRoute.questions.forEach((question) => {
    lines.push(`- Question: ${question}`);
  });

  lines.push("", "## Unknown-pattern resolution");
  lines.push(`- Status: ${unknownPatternEngine.overallStatus}`);
  lines.push(`- Handling: ${unknownPatternEngine.recommendedHandling.replace(/_/g, " ")}`);
  lines.push(`- ${unknownPatternEngine.summary}`);
  lines.push(`- Next step: ${unknownPatternEngine.nextStep}`);
  unknownPatternEngine.signals.forEach((signal) => {
    lines.push(`- ${signal.title} [${signal.category} | ${signal.severity}]`);
    lines.push(`  - ${signal.summary}`);
  });
  unknownPatternEngine.hypotheses.forEach((hypothesis) => {
    lines.push(`- ${hypothesis.title} [${hypothesis.status} | ${hypothesis.confidence}]`);
    lines.push(`  - ${hypothesis.summary}`);
    hypothesis.requiredProof.slice(0, 3).forEach((proof) => {
      lines.push(`  - Required proof: ${proof}`);
    });
  });
  unknownPatternEngine.customProofRequests.forEach((request) => {
    lines.push(`- Custom proof request: ${request}`);
  });

  lines.push("", "## Confidence calibration");
  lines.push(`- Status: ${confidenceCalibration.overallStatus}`);
  lines.push(
    `- Recommended posture: ${confidenceCalibration.recommendedPosture.replace(/_/g, " ")}`
  );
  lines.push(`- ${confidenceCalibration.summary}`);
  lines.push(`- Next step: ${confidenceCalibration.nextStep}`);
  confidenceCalibration.checks.forEach((check) => {
    lines.push(
      `- ${check.title} [${check.domain} | ${check.status}] claimed ${check.claimedConfidence}, earned ${check.supportedConfidence}`
    );
    lines.push(`  - ${check.summary}`);
  });
  confidenceCalibration.debts.forEach((debt) => {
    lines.push(`- Confidence debt: ${debt.title} [${debt.severity}]`);
    lines.push(`  - ${debt.summary}`);
    lines.push(`  - Safe posture: ${debt.safePosture}`);
  });

  lines.push("", "## Deep document intelligence and entity continuity");
  lines.push(`- Status: ${documentIntelligence.overallStatus}`);
  lines.push(`- ${documentIntelligence.summary}`);
  lines.push(`- Next step: ${documentIntelligence.nextStep}`);
  lines.push(`- Structured document artifacts: ${documentIntelligence.structuredDocumentCount}`);
  lines.push(`- Extracted facts: ${documentIntelligence.extractedFactCount}`);
  lines.push(`- Entity names detected: ${documentIntelligence.entityNameCount}`);
  lines.push(`- Distinct EINs detected: ${documentIntelligence.distinctEinCount}`);
  lines.push(`- Prior filing signals: ${documentIntelligence.priorFilingSignalCount}`);
  lines.push(`- Election timing signals: ${documentIntelligence.electionTimelineSignalCount}`);
  lines.push(`- Ownership timeline signals: ${documentIntelligence.ownershipTimelineSignalCount}`);
  lines.push(`- State registration signals: ${documentIntelligence.stateRegistrationSignalCount}`);
  if (documentEntityNameValues.length > 1) {
    lines.push(`- Conflicting entity names: ${documentEntityNameValues.join(", ")}`);
  }
  if (documentIdentityValues.length > 1) {
    lines.push(`- Conflicting EINs: ${documentIdentityValues.join(", ")}`);
  }
  documentIntelligence.missingCriticalRoles.forEach((role) => {
    lines.push(`- Missing structured paper: ${role}`);
  });
  documentIntelligence.continuityQuestions.forEach((question) => {
    lines.push(`- Continuity question: ${question}`);
  });

  lines.push("", "## Durable case memory and decision ledger");
  lines.push(`- Status: ${caseMemoryLedger.overallStatus}`);
  lines.push(`- ${caseMemoryLedger.summary}`);
  lines.push(`- Next step: ${caseMemoryLedger.nextStep}`);
  lines.push(`- Active anchor snapshot: ${caseMemoryLedger.activeAnchorSnapshotId ?? "None"}`);
  lines.push(`- Open overrides: ${caseMemoryLedger.openOverrideCount}`);
  caseMemoryLedger.driftReasons.forEach((reason) => {
    lines.push(`- Drift reason: ${reason}`);
  });
  caseMemoryLedger.overrides.slice(0, 5).forEach((override) => {
    lines.push(`- Override: ${override.summary} [${override.status}]`);
    if (override.notes) {
      lines.push(`  - Notes: ${override.notes}`);
    }
  });
  caseMemoryLedger.entries.slice(0, 6).forEach((entry) => {
    lines.push(`- Ledger entry: ${entry.title} [${entry.severity}]`);
    lines.push(`  - ${entry.summary}`);
    lines.push(`  - Trust effect: ${entry.effectOnTrust}`);
  });

  lines.push("", "## Reviewer learning loop");
  lines.push(`- Status: ${reviewerLearningLoop.overallStatus}`);
  lines.push(`- ${reviewerLearningLoop.summary}`);
  lines.push(`- Next step: ${reviewerLearningLoop.nextStep}`);
  lines.push(`- Active lessons: ${reviewerLearningLoop.activeLessonCount}`);
  lines.push(`- Policy candidates: ${reviewerLearningLoop.policyCandidateCount}`);
  reviewerLearningLoop.policyCandidates.forEach((candidate) => {
    lines.push(`- Policy candidate: ${candidate.title} [${candidate.priority}]`);
    lines.push(`  - ${candidate.summary}`);
    lines.push(`  - Recommended change: ${candidate.recommendedChange}`);
  });
  reviewerLearningLoop.regressionTargets.slice(0, 5).forEach((target) => {
    lines.push(
      `- Regression target: ${target.title} [${target.status}${target.fixtureId ? ` | ${target.fixtureId}` : ""}]`
    );
    lines.push(`  - ${target.targetBehavior}`);
  });
  reviewerLearningLoop.lessons.slice(0, 6).forEach((lesson) => {
    lines.push(
      `- Lesson: ${lesson.title} [${lesson.source} | ${lesson.status} | ${lesson.severity}]`
    );
    lines.push(`  - ${lesson.confidenceImpact}`);
  });

  lines.push("", "## Reviewer observed deltas");
  lines.push(`- Status: ${reviewerObservedDeltas.overallStatus}`);
  lines.push(`- ${reviewerObservedDeltas.summary}`);
  lines.push(`- Next step: ${reviewerObservedDeltas.nextStep}`);
  lines.push(`- Recorded deltas: ${reviewerObservedDeltas.totalDeltaCount}`);
  lines.push(
    `- Accepted after adjustment: ${reviewerObservedDeltas.acceptedAfterAdjustmentCount}`
  );
  lines.push(`- Top-priority coverage: ${reviewerObservedDeltas.topPriorityCoverageCount}`);
  reviewerObservedDeltas.items.slice(0, 6).forEach((item) => {
    lines.push(
      `- ${item.title} [${item.kind} | ${item.domain} | ${item.severity}]`
    );
    lines.push(`  - ${item.summary}`);
    lines.push(`  - Trust effect: ${item.trustEffect}`);
  });

  lines.push("", "## Reviewer override governance");
  lines.push(`- Status: ${reviewerOverrideGovernance.overallStatus}`);
  lines.push(`- ${reviewerOverrideGovernance.summary}`);
  lines.push(`- Next step: ${reviewerOverrideGovernance.nextStep}`);
  lines.push(`- Open overrides: ${reviewerOverrideGovernance.openOverrideCount}`);
  lines.push(`- Anchored overrides: ${reviewerOverrideGovernance.anchoredOverrideCount}`);
  lines.push(
    `- Policy updates still needed: ${reviewerOverrideGovernance.policyUpdateRequiredCount}`
  );
  lines.push(
    `- Blocking acceptance deltas: ${reviewerOverrideGovernance.blockingAcceptanceDeltaCount}`
  );
  reviewerOverrideGovernance.recommendedBenchmarkScenarioIds.forEach((scenarioId) => {
    lines.push(`- Benchmark scenario: ${scenarioId}`);
  });
  reviewerOverrideGovernance.items.slice(0, 6).forEach((item) => {
    lines.push(
      `- ${item.title} [${item.status} | ${item.policyState} | ${item.trustBoundary}]`
    );
    lines.push(`  - ${item.summary}`);
    lines.push(`  - Required action: ${item.requiredAction}`);
  });
  reviewerOverrideGovernance.acceptanceDeltas.slice(0, 6).forEach((delta) => {
    lines.push(`- Acceptance delta: ${delta.title} [${delta.status} | ${delta.severity}]`);
    lines.push(`  - ${delta.summary}`);
    lines.push(`  - Consequence: ${delta.consequence}`);
  });

  lines.push("", "## Reviewer policy versioning");
  lines.push(`- Status: ${reviewerPolicyVersioning.overallStatus}`);
  lines.push(`- ${reviewerPolicyVersioning.summary}`);
  lines.push(`- Next step: ${reviewerPolicyVersioning.nextStep}`);
  lines.push(`- Active policy tracks: ${reviewerPolicyVersioning.activePolicyCount}`);
  lines.push(`- Ready to promote: ${reviewerPolicyVersioning.readyToPromoteCount}`);
  lines.push(`- Candidate tracks: ${reviewerPolicyVersioning.candidatePolicyCount}`);
  lines.push(
    `- Benchmark coverage gaps: ${reviewerPolicyVersioning.benchmarkCoverageGapCount}`
  );
  reviewerPolicyVersioning.items.slice(0, 6).forEach((item) => {
    lines.push(
      `- ${item.title} [${item.status} | ${item.benchmarkCoverageStatus}${item.currentVersionId ? ` | ${item.currentVersionId}` : ""}]`
    );
    lines.push(`  - ${item.summary}`);
    lines.push(`  - Next step: ${item.nextStep}`);
    item.blockers.slice(0, 2).forEach((blocker) => {
      lines.push(`  - Blocker: ${blocker}`);
    });
    item.topPriorityBenchmarkScenarioIds.slice(0, 2).forEach((scenarioId) => {
      lines.push(`  - Top-priority benchmark: ${scenarioId}`);
    });
  });

  lines.push("", "## Reviewer acceptance reality");
  lines.push(`- Status: ${reviewerAcceptanceReality.overallStatus}`);
  lines.push(`- ${reviewerAcceptanceReality.summary}`);
  lines.push(`- Next step: ${reviewerAcceptanceReality.nextStep}`);
  lines.push(`- Observed themes: ${reviewerAcceptanceReality.totalObservedThemeCount}`);
  lines.push(`- Observed acceptance rate: ${reviewerAcceptanceReality.observedAcceptanceRate}%`);
  lines.push(`- Durable acceptance rate: ${reviewerAcceptanceReality.durableAcceptanceRate}%`);
  lines.push(
    `- Top-priority accepted coverage: ${reviewerAcceptanceReality.topPriorityAcceptedCoverageCount}`
  );
  reviewerAcceptanceReality.items.slice(0, 6).forEach((item) => {
    lines.push(
      `- ${item.title} [${item.outcome}${item.policyTrackStatus ? ` | ${item.policyTrackStatus}` : ""}]`
    );
    lines.push(`  - ${item.summary}`);
    lines.push(`  - Next step: ${item.nextStep}`);
    item.topPriorityBenchmarkScenarioIds.slice(0, 2).forEach((scenarioId) => {
      lines.push(`  - Top-priority benchmark: ${scenarioId}`);
    });
  });

  lines.push("", "## Entity treatment judgment");
  lines.push(`- ${entityJudgment.likelyFederalTreatment}`);
  lines.push(`- Status: ${entityJudgment.judgmentStatus}`);
  lines.push(`- ${entityJudgment.summary}`);
  entityJudgment.reasons.forEach((reason) => {
    lines.push(`- Reason: ${reason}`);
  });
  if (entityJudgment.questions.length > 0) {
    entityJudgment.questions.forEach((question) => {
      lines.push(`- ${question.title} [${question.severity}]`);
      lines.push(`  - ${question.summary}`);
    });
  }

  lines.push("", "## Federal return requirements");
  lines.push(`- Return family: ${federalReturnRequirements.returnFamily}`);
  lines.push(
    `- Tina can finish this lane automatically: ${federalReturnRequirements.canTinaFinishLane ? "Yes" : "No"}`
  );
  lines.push(`- ${federalReturnRequirements.summary}`);
  federalReturnRequirements.items.forEach((item) => {
    lines.push(`- ${item.title} [${item.status}]`);
    lines.push(`  - ${item.summary}`);
    item.requiredForms.forEach((form) => {
      lines.push(`  - Required form: ${form}`);
    });
    item.requiredRecords.forEach((record) => {
      lines.push(`  - Required record: ${record}`);
    });
    item.reviewerQuestions.forEach((question) => {
      lines.push(`  - Reviewer question: ${question}`);
    });
  });

  lines.push("", "## Entity record matrix");
  lines.push(`- Status: ${entityRecordMatrix.overallStatus}`);
  lines.push(`- ${entityRecordMatrix.summary}`);
  lines.push(`- Next step: ${entityRecordMatrix.nextStep}`);
  entityRecordMatrix.items.forEach((item) => {
    lines.push(`- ${item.title} [${item.status} | ${item.criticality}]`);
    lines.push(`  - ${item.summary}`);
    item.requiredForms.forEach((form) => {
      lines.push(`  - Required form context: ${form}`);
    });
  });

  lines.push("", "## Entity economics readiness");
  lines.push(`- Status: ${entityEconomicsReadiness.overallStatus}`);
  lines.push(`- ${entityEconomicsReadiness.summary}`);
  lines.push(`- Next step: ${entityEconomicsReadiness.nextStep}`);
  entityEconomicsReadiness.checks.forEach((check) => {
    lines.push(`- ${check.title} [${check.status}]`);
    lines.push(`  - ${check.summary}`);
    lines.push(`  - Why it matters: ${check.whyItMatters}`);
  });

  lines.push("", "## Owner-flow and basis adjudication");
  lines.push(`- Status: ${ownerFlowBasis.overallStatus}`);
  lines.push(
    `- Opening footing: ${ownerFlowBasis.openingFootingStatus.replace(/_/g, " ")}`
  );
  lines.push(
    `- Basis rollforward: ${ownerFlowBasis.basisRollforwardStatus.replace(/_/g, " ")}`
  );
  lines.push(
    `- Owner-flow characterization: ${ownerFlowBasis.ownerFlowCharacterizationStatus.replace(/_/g, " ")}`
  );
  lines.push(`- Loan versus equity: ${ownerFlowBasis.loanEquityStatus.replace(/_/g, " ")}`);
  lines.push(
    `- Distribution taxability: ${ownerFlowBasis.distributionTaxabilityStatus.replace(/_/g, " ")}`
  );
  lines.push(
    `- Transition economics: ${ownerFlowBasis.transitionEconomicsStatus.replace(/_/g, " ")}`
  );
  lines.push(`- ${ownerFlowBasis.summary}`);
  lines.push(`- Next step: ${ownerFlowBasis.nextStep}`);
  ownerFlowBasis.items.forEach((item) => {
    lines.push(`- ${item.title} [${item.status} | ${item.sensitivity}]`);
    lines.push(`  - ${item.summary}`);
    item.requiredProof.slice(0, 2).forEach((proof) => {
      lines.push(`  - Proof: ${proof}`);
    });
  });

  lines.push("", "## Entity return calculations");
  lines.push(`- Status: ${entityReturnCalculations.overallStatus}`);
  lines.push(`- ${entityReturnCalculations.summary}`);
  lines.push(`- Next step: ${entityReturnCalculations.nextStep}`);
  entityReturnCalculations.items.forEach((item) => {
    lines.push(`- ${item.title} [${item.status}]`);
    lines.push(`  - ${item.summary}`);
    item.fields.slice(0, 5).forEach((field) => {
      lines.push(`  - ${field.label}: ${field.value}`);
    });
    item.reviewerQuestions.slice(0, 3).forEach((question) => {
      lines.push(`  - Reviewer question: ${question}`);
    });
  });

  lines.push("", "## Entity return support artifacts");
  lines.push(`- Status: ${entityReturnSupportArtifacts.overallStatus}`);
  lines.push(`- ${entityReturnSupportArtifacts.summary}`);
  lines.push(`- Next step: ${entityReturnSupportArtifacts.nextStep}`);
  entityReturnSupportArtifacts.items.forEach((item) => {
    lines.push(`- ${item.title} [${item.status} | ${item.kind}]`);
    lines.push(`  - ${item.summary}`);
    lines.push(
      `  - Supported/derived/missing fields: ${item.supportedFieldCount}/${item.derivedFieldCount}/${item.missingFieldCount}`
    );
    item.reviewerQuestions.slice(0, 3).forEach((question) => {
      lines.push(`  - Reviewer question: ${question}`);
    });
  });

  lines.push("", "## Entity return schedule families");
  lines.push(`- Status: ${entityReturnScheduleFamilies.overallStatus}`);
  lines.push(`- ${entityReturnScheduleFamilies.summary}`);
  lines.push(`- Next step: ${entityReturnScheduleFamilies.nextStep}`);
  entityReturnScheduleFamilies.items.forEach((item) => {
    lines.push(`- ${item.title} [${item.status} | ${item.kind}]`);
    lines.push(`  - ${item.summary}`);
    lines.push(
      `  - Supported/derived/missing fields: ${item.supportedFieldCount}/${item.derivedFieldCount}/${item.missingFieldCount}`
    );
    item.reviewerQuestions.slice(0, 3).forEach((question) => {
      lines.push(`  - Reviewer question: ${question}`);
    });
  });

  lines.push("", "## Entity return schedule-family payloads");
  lines.push(`- Status: ${entityReturnScheduleFamilyPayloads.overallStatus}`);
  lines.push(`- ${entityReturnScheduleFamilyPayloads.summary}`);
  lines.push(`- Next step: ${entityReturnScheduleFamilyPayloads.nextStep}`);
  entityReturnScheduleFamilyPayloads.items.forEach((item) => {
    lines.push(
      `- ${item.title} [${item.status} | ${item.payloadReadiness} | ${item.completionPercent}% complete]`
    );
    lines.push(`  - ${item.summary}`);
    lines.push(`  - Official targets: ${item.officialScheduleTargets.join(", ")}`);
    item.sections.slice(0, 3).forEach((section) => {
      lines.push(`  - ${section.title} [${section.status}]`);
      lines.push(
        `    - Supported/derived/missing fields: ${section.supportedFieldCount}/${section.derivedFieldCount}/${section.missingFieldCount}`
      );
    });
  });

  lines.push("", "## Entity return schedule-family finalizations");
  lines.push(`- Status: ${entityReturnScheduleFamilyFinalizations.overallStatus}`);
  lines.push(`- ${entityReturnScheduleFamilyFinalizations.summary}`);
  lines.push(`- Next step: ${entityReturnScheduleFamilyFinalizations.nextStep}`);
  entityReturnScheduleFamilyFinalizations.items.forEach((item) => {
    lines.push(
      `- ${item.title} [${item.status} | ${item.finalizationReadiness} | ${item.completionPercent}% complete]`
    );
    lines.push(`  - ${item.summary}`);
    lines.push(`  - Official targets: ${item.officialScheduleTargets.join(", ")}`);
    item.lineItems.slice(0, 4).forEach((lineItem) => {
      lines.push(`  - ${lineItem.target}: ${lineItem.value} [${lineItem.status}]`);
    });
  });

  lines.push("", "## Entity return runbook");
  lines.push(`- Execution mode: ${entityReturnRunbook.executionMode}`);
  lines.push(`- Status: ${entityReturnRunbook.overallStatus}`);
  lines.push(`- ${entityReturnRunbook.summary}`);
  lines.push(`- Next step: ${entityReturnRunbook.nextStep}`);
  entityReturnRunbook.steps.forEach((step) => {
    lines.push(`- ${step.title} [${step.status} | ${step.audience}]`);
    lines.push(`  - ${step.summary}`);
    lines.push(`  - Deliverable: ${step.deliverable}`);
  });

  lines.push("", "## Ownership and capital events");
  lines.push(`- Status: ${ownershipCapitalEvents.overallStatus}`);
  lines.push(`- ${ownershipCapitalEvents.summary}`);
  lines.push(`- Next step: ${ownershipCapitalEvents.nextStep}`);
  ownershipCapitalEvents.events.forEach((event) => {
    lines.push(`- ${event.title} [${event.status}]`);
    lines.push(`  - ${event.summary}`);
  });

  lines.push("", "## Ownership timeline");
  lines.push(`- ${ownershipTimeline.summary}`);
  ownershipTimeline.events.forEach((event) => {
    lines.push(`- ${event.title} [${event.status}]`);
    lines.push(`  - ${event.summary}`);
  });

  lines.push("", "## Packet sections");

  handoff.artifacts.forEach((artifact) => {
    lines.push(`- ${artifact.title} [${artifact.status}]`);
    lines.push(`  - ${artifact.summary}`);
    artifact.includes.forEach((item) => {
      lines.push(`  - ${item}`);
    });
  });

  lines.push("", "## Schedule C draft");
  if (draft.scheduleCDraft.fields.length > 0) {
    draft.scheduleCDraft.fields.forEach((field) => {
      lines.push(
        `- ${field.lineNumber} ${field.label}: ${formatMoney(field.amount)} [${field.status}]`
      );
      lines.push(`  - ${field.summary}`);
    });
  } else {
    lines.push("- Tina has not built any Schedule C draft boxes yet.");
  }

  if (draft.scheduleCDraft.notes.length > 0) {
    lines.push("", "## Draft notes");
    draft.scheduleCDraft.notes.forEach((note) => {
      lines.push(`- ${note.title} [${note.severity}]`);
      lines.push(`  - ${note.summary}`);
    });
  }

  lines.push("", "## Schedule C form snapshot");
  lines.push(
    `- Header: ${scheduleCReturn.header.principalBusinessActivity || "Missing activity"} | ${
      scheduleCReturn.header.naicsCode || "Missing code"
    } | ${scheduleCReturn.header.accountingMethod}`
  );
  scheduleCReturn.fields.forEach((field) => {
    lines.push(`- ${field.lineNumber} ${field.label}: ${formatMoney(field.amount)} [${field.status}]`);
  });

  lines.push("", "## Form validation");
  if (scheduleCReturn.validationIssues.length > 0) {
    scheduleCReturn.validationIssues.forEach((issue) => {
      lines.push(`- ${issue.title} [${issue.severity}]`);
      lines.push(`  - ${issue.summary}`);
    });
  } else {
    lines.push("- Tina does not currently see Schedule C form validation issues.");
  }

  lines.push("", "## Official-form readiness");
  lines.push(`- Level: ${formReadiness.level}`);
  lines.push(`- ${formReadiness.summary}`);
  formReadiness.reasons.forEach((reason) => {
    lines.push(`- ${reason.title} [${reason.severity}]`);
    lines.push(`  - ${reason.summary}`);
  });

  lines.push("", "## Official federal form templates");
  lines.push(
    `- Primary blank form: ${
      officialFormTemplates.templates.find(
        (template) => template.id === officialFormTemplates.primaryTemplateId
      )?.title ?? "No primary blank form stored for this lane yet"
    }`
  );
  lines.push(`- ${officialFormTemplates.summary}`);
  officialFormTemplates.templates.forEach((template) => {
    lines.push(`- ${template.title} [${template.support}]`);
    lines.push(`  - ${template.summary}`);
    lines.push(`  - IRS URL: ${template.irsUrl}`);
  });

  lines.push("", "## Official-form fill plan");
  lines.push(`- Status: ${officialFormFill.overallStatus}`);
  lines.push(`- ${officialFormFill.summary}`);
  lines.push(`- Next step: ${officialFormFill.nextStep}`);
  officialFormFill.placements.slice(0, 10).forEach((placement) => {
    lines.push(`- ${placement.label}: ${placement.value || "blank"} [${placement.status}]`);
    lines.push(
      `  - Page ${placement.pageNumber} @ (${placement.x}, ${placement.y}) | evidence ${placement.evidenceSupportLevel}`
    );
  });

  lines.push("", "## Official-form execution");
  lines.push(`- Status: ${officialFormExecution.overallStatus}`);
  lines.push(`- ${officialFormExecution.summary}`);
  lines.push(`- Next step: ${officialFormExecution.nextStep}`);
  officialFormExecution.items.forEach((item) => {
    lines.push(`- ${item.title} [${item.status} | ${item.fillMode}]`);
    lines.push(`  - ${item.summary}`);
    lines.push(
      `  - Template ready: ${item.templateReady ? "Yes" : "No"} | placements ${item.readyPlacementCount}/${item.placementCount} ready | schedules ${item.scheduleCount}`
    );
  });

  lines.push("", "## Official-form coverage");
  formCoverage.items.forEach((item) => {
    lines.push(`- ${item.title} [${item.status}]`);
    lines.push(`  - ${item.summary}`);
  });

  lines.push("", "## Supported Part II expense boxes");
  if (supportedExpenseFieldsWithAmounts.length > 0) {
    supportedExpenseFieldsWithAmounts.forEach((field) => {
      lines.push(`- ${field.lineNumber} ${field.label}: ${formatMoney(field.amount)} [${field.status}]`);
    });
  } else {
    lines.push("- Tina does not currently carry supported Part II expense amounts in the current Schedule C output.");
  }
  if (typeof otherExpensesField?.amount === "number" && otherExpensesField.amount > 0) {
    lines.push(
      `- ${otherExpensesField.lineNumber} ${otherExpensesField.label}: ${formatMoney(otherExpensesField.amount)} [${otherExpensesField.status}]`
    );
    lines.push(
      "  - Tina still has uncategorized other expenses here, so the supported Part II surface is not yet fully category-specific."
    );
  }

  lines.push("", "## Form trace");
  lines.push(
    `- Evidence support on non-zero lines: ${evidenceCounts.strong} strong, ${evidenceCounts.moderate} moderate, ${evidenceCounts.weak} weak, ${evidenceCounts.missing} missing`
  );
  if (formTrace.lines.length > 0) {
    formTrace.lines.forEach((line) => {
      lines.push(`- ${line.lineNumber} ${line.label}: ${formatMoney(line.amount)} [${line.status}]`);
      lines.push(`  - Draft fields: ${line.sourceFieldIds.length}`);
      lines.push(`  - Reviewer-final lines: ${line.reviewerFinalLineIds.length}`);
      lines.push(`  - Tax adjustments: ${line.taxAdjustmentIds.length}`);
      lines.push(`  - Source documents: ${line.sourceDocumentIds.length}`);
      lines.push(`  - Source facts: ${line.sourceFactIds.length}`);
      lines.push(`  - Evidence support: ${line.evidenceSupportLevel}`);
    });
  } else {
    lines.push("- Tina has not built a source-to-form trace yet.");
  }

  lines.push("", "## Evidence sufficiency");
  lines.push(`- Status: ${evidenceSufficiency.overallStatus}`);
  lines.push(`- ${evidenceSufficiency.summary}`);
  lines.push(`- Next step: ${evidenceSufficiency.nextStep}`);
  lines.push(
    `- Line support counts: ${evidenceSufficiency.counts.strong} strong, ${evidenceSufficiency.counts.moderate} moderate, ${evidenceSufficiency.counts.weak} weak, ${evidenceSufficiency.counts.missing} missing`
  );
  evidenceSufficiency.issues.forEach((issue) => {
    lines.push(`- ${issue.title} [${issue.severity}]`);
    lines.push(`  - ${issue.summary}`);
  });

  lines.push("", "## Books reconciliation");
  lines.push(`- Status: ${booksReconciliation.overallStatus}`);
  lines.push(`- Source mode: ${booksReconciliation.sourceMode}`);
  lines.push(`- ${booksReconciliation.summary}`);
  lines.push(`- Next step: ${booksReconciliation.nextStep}`);
  booksReconciliation.checks.forEach((check) => {
    lines.push(`- ${check.title} [${check.status}]`);
    lines.push(`  - ${check.summary}`);
    if (typeof check.delta === "number") {
      lines.push(`  - Delta: ${formatMoney(check.delta)}`);
    }
  });

  lines.push("", "## Books-to-tax reconstruction");
  lines.push(`- Status: ${booksReconstruction.overallStatus}`);
  lines.push(`- Source mode: ${booksReconstruction.sourceMode}`);
  lines.push(`- ${booksReconstruction.summary}`);
  lines.push(`- Next step: ${booksReconstruction.nextStep}`);
  booksReconstruction.areas.forEach((area) => {
    lines.push(`- ${area.title} [${area.status}]`);
    lines.push(`  - ${area.summary}`);
  });

  lines.push("", "## Accounting artifact coverage");
  lines.push(`- Status: ${accountingArtifactCoverage.overallStatus}`);
  lines.push(`- Source mode: ${accountingArtifactCoverage.sourceMode}`);
  lines.push(`- ${accountingArtifactCoverage.summary}`);
  lines.push(`- Next step: ${accountingArtifactCoverage.nextStep}`);
  accountingArtifactCoverage.items.forEach((item) => {
    lines.push(`- ${item.title} [${item.status} | ${item.criticality}]`);
    lines.push(`  - ${item.summary}`);
    lines.push(`  - Request: ${item.request}`);
  });

  lines.push("", "## Payroll compliance reconstruction");
  lines.push(`- Status: ${payrollCompliance.overallStatus}`);
  lines.push(`- Posture: ${payrollCompliance.posture.replace(/_/g, " ")}`);
  lines.push(
    `- Worker classification: ${payrollCompliance.workerClassification.replace(/_/g, " ")}`
  );
  lines.push(`- ${payrollCompliance.summary}`);
  lines.push(`- Next step: ${payrollCompliance.nextStep}`);
  if (payrollCompliance.likelyMissingFilings.length > 0) {
    lines.push(`- Likely missing filings: ${payrollCompliance.likelyMissingFilings.join(", ")}`);
  }
  payrollCompliance.issues.forEach((issue) => {
    lines.push(`- ${issue.title} [${issue.status}]`);
    lines.push(`  - ${issue.summary}`);
  });
  payrollCompliance.questions.slice(0, 3).forEach((question) => {
    lines.push(`- Payroll question: ${question}`);
  });

  lines.push("", "## Industry playbooks");
  lines.push(`- ${industryPlaybooks.summary}`);
  lines.push(`- Next step: ${industryPlaybooks.nextStep}`);
  industryPlaybooks.items.forEach((item) => {
    lines.push(`- ${item.title} [${item.fit}]`);
    lines.push(`  - ${item.summary}`);
    item.keyRisks.slice(0, 2).forEach((risk) => {
      lines.push(`  - Risk: ${risk}`);
    });
    item.likelyOpportunities.slice(0, 2).forEach((opportunity) => {
      lines.push(`  - Opportunity: ${opportunity}`);
    });
  });

  lines.push("", "## Industry evidence matrix");
  lines.push(`- Status: ${industryEvidenceMatrix.overallStatus}`);
  lines.push(`- ${industryEvidenceMatrix.summary}`);
  lines.push(`- Next step: ${industryEvidenceMatrix.nextStep}`);
  industryEvidenceMatrix.items.slice(0, 8).forEach((item) => {
    lines.push(`- ${item.playbookTitle}: ${item.requirement} [${item.status} | ${item.materiality}]`);
    lines.push(`  - ${item.summary}`);
  });

  lines.push("", "## Books normalization");
  if (booksNormalization.issues.length > 0) {
    booksNormalization.issues.forEach((issue) => {
      lines.push(`- ${issue.title} [${issue.severity}]`);
      lines.push(`  - ${issue.summary}`);
      issue.sourceLabels.forEach((label) => {
        lines.push(`  - Signal: ${label}`);
      });
    });
  } else {
    lines.push("- Tina does not currently see books-normalization issues in saved facts.");
  }

  lines.push("", "## Reviewer challenge forecast");
  if (reviewerChallenges.items.length > 0) {
    reviewerChallenges.items.forEach((item) => {
      lines.push(`- ${item.title} [${item.severity}]`);
      lines.push(`  - ${item.summary}`);
    });
  } else {
    lines.push("- Tina does not currently see obvious skeptical-review challenge points beyond the normal packet review.");
  }

  lines.push("", "## Tax treatment judgment");
  if (treatmentJudgment.items.length > 0) {
    treatmentJudgment.items.forEach((item) => {
      lines.push(`- ${item.title} [${item.taxPositionBucket}]`);
      lines.push(`  - ${item.summary}`);
      lines.push(`  - Suggested treatment: ${item.suggestedTreatment}`);
    });
  } else {
    lines.push("- Tina does not currently see messy treatment calls that need separate use/review/reject classification.");
  }

  lines.push("", "## Tax treatment policy engine");
  lines.push(`- Status: ${taxTreatmentPolicy.overallStatus}`);
  lines.push(`- ${taxTreatmentPolicy.summary}`);
  lines.push(`- Next step: ${taxTreatmentPolicy.nextStep}`);
  taxTreatmentPolicy.decisions.forEach((decision) => {
    lines.push(`- ${decision.title} [${decision.status} | ${decision.materiality}]`);
    lines.push(`  - ${decision.summary}`);
    lines.push(`  - Next step: ${decision.nextStep}`);
  });

  lines.push("", "## Materiality and priority engine");
  lines.push(`- Status: ${materialityPriority.overallStatus}`);
  lines.push(`- ${materialityPriority.summary}`);
  lines.push(`- Next step: ${materialityPriority.nextStep}`);
  materialityPriority.items.slice(0, 12).forEach((item) => {
    lines.push(`- ${item.title} [${item.priority} | ${item.materiality}]`);
    lines.push(`  - ${item.summary}`);
  });

  lines.push("", "## Tax opportunity engine");
  lines.push(`- Status: ${taxOpportunityEngine.overallStatus}`);
  lines.push(`- ${taxOpportunityEngine.summary}`);
  lines.push(`- Next step: ${taxOpportunityEngine.nextStep}`);
  taxOpportunityEngine.items.slice(0, 8).forEach((item) => {
    lines.push(`- ${item.title} [${item.status} | ${item.impact}]`);
    lines.push(`  - ${item.summary}`);
    lines.push(`  - Action: ${item.recommendedAction}`);
  });

  lines.push("", "## Tax planning memo");
  lines.push(`- Status: ${taxPlanningMemo.overallStatus}`);
  lines.push(`- ${taxPlanningMemo.summary}`);
  lines.push(`- Next step: ${taxPlanningMemo.nextStep}`);
  taxPlanningMemo.items.slice(0, 6).forEach((item) => {
    lines.push(`- ${item.title} [${item.priority} | ${item.status} | ${item.impact}]`);
    lines.push(`  - ${item.whyNow}`);
    item.documentationNeeds.slice(0, 2).forEach((need) => {
      lines.push(`  - Documentation need: ${need}`);
    });
  });

  lines.push("", "## Planning action board");
  lines.push(`- Status: ${planningActionBoard.overallStatus}`);
  lines.push(`- ${planningActionBoard.summary}`);
  lines.push(`- Next step: ${planningActionBoard.nextStep}`);
  planningActionBoard.items.slice(0, 8).forEach((item) => {
    lines.push(`- ${item.title} [${item.priority} | ${item.status}]`);
    lines.push(`  - ${item.whyNow}`);
    lines.push(
      `  - Authority ${item.authorityStrength} | facts ${item.factStrength} | disclosure ${item.disclosureReadiness} | reviewer ${item.reviewerAcceptance}`
    );
  });

  lines.push("", "## Authority position matrix");
  lines.push(`- Status: ${authorityPositionMatrix.overallStatus}`);
  lines.push(`- ${authorityPositionMatrix.summary}`);
  lines.push(`- Next step: ${authorityPositionMatrix.nextStep}`);
  authorityPositionMatrix.items.slice(0, 8).forEach((item) => {
    lines.push(
      `- ${item.title} [${item.recommendation} | ${item.recommendedBucket} | ${item.priority}]`
    );
    lines.push(`  - Authority: ${item.authorityStrength}`);
    lines.push(`  - Facts: ${item.factStrength}`);
    lines.push(`  - Disclosure: ${item.disclosureReadiness}`);
    lines.push(`  - ${item.summary}`);
  });

  lines.push("", "## Disclosure readiness");
  lines.push(`- Status: ${disclosureReadiness.overallStatus}`);
  lines.push(`- ${disclosureReadiness.summary}`);
  lines.push(`- Next step: ${disclosureReadiness.nextStep}`);
  disclosureReadiness.items.forEach((item) => {
    lines.push(`- ${item.title} [${item.status}]`);
    lines.push(`  - ${item.summary}`);
    lines.push(`  - Required action: ${item.requiredAction}`);
  });

  lines.push("", "## Reviewer acceptance forecast");
  lines.push(`- Status: ${reviewerAcceptanceForecast.overallStatus}`);
  lines.push(`- ${reviewerAcceptanceForecast.summary}`);
  lines.push(`- Next step: ${reviewerAcceptanceForecast.nextStep}`);
  reviewerAcceptanceForecast.items.slice(0, 8).forEach((item) => {
    lines.push(`- ${item.title} [${item.status}]`);
    lines.push(`  - ${item.summary}`);
  });

  lines.push("", "## Document request plan");
  lines.push(`- Status: ${documentRequestPlan.overallStatus}`);
  lines.push(`- ${documentRequestPlan.summary}`);
  lines.push(`- Next step: ${documentRequestPlan.nextStep}`);
  documentRequestPlan.items.slice(0, 8).forEach((item) => {
    lines.push(`- ${item.title} [${item.priority} | ${item.audience}]`);
    lines.push(`  - ${item.request}`);
  });

  lines.push("", "## Attachment statements");
  lines.push(`- Status: ${attachmentStatements.overallStatus}`);
  lines.push(`- ${attachmentStatements.summary}`);
  lines.push(`- Next step: ${attachmentStatements.nextStep}`);
  if (attachmentStatements.items.length > 0) {
    attachmentStatements.items.forEach((item) => {
      lines.push(`- ${item.title} [${item.status}]`);
      lines.push(`  - ${item.summary}`);
      lines.push(`  - ${item.statement}`);
    });
  } else {
    lines.push("- Tina does not currently need extra attachment statements for this file.");
  }

  lines.push("", "## Structured attachment schedules");
  lines.push(`- Status: ${attachmentSchedules.overallStatus}`);
  lines.push(`- ${attachmentSchedules.summary}`);
  lines.push(`- Next step: ${attachmentSchedules.nextStep}`);
  if (attachmentSchedules.items.length > 0) {
    attachmentSchedules.items.forEach((item) => {
      lines.push(`- ${item.title} [${item.status}]`);
      lines.push(`  - ${item.summary}`);
      item.rows.slice(0, 4).forEach((scheduleRow) => {
        lines.push(
          `  - ${scheduleRow.label}: ${scheduleRow.value}${typeof scheduleRow.amount === "number" ? ` (${formatMoney(scheduleRow.amount)})` : ""} [${scheduleRow.supportLevel}]`
        );
      });
    });
  } else {
    lines.push("- Tina does not currently need structured attachment schedules for this file.");
  }

  lines.push("", "## Companion form calculations");
  lines.push(`- Status: ${companionFormCalculations.overallStatus}`);
  lines.push(`- ${companionFormCalculations.summary}`);
  lines.push(`- Next step: ${companionFormCalculations.nextStep}`);
  companionFormCalculations.items.forEach((item) => {
    lines.push(`- ${item.title} [${item.status}]`);
    lines.push(`  - ${item.summary}`);
    item.estimatedValues.forEach((value) => {
      lines.push(`  - ${value.label}: ${formatMoney(value.amount)}`);
    });
  });

  lines.push("", "## Companion form render plan");
  lines.push(`- Status: ${companionFormRenderPlan.overallStatus}`);
  lines.push(`- ${companionFormRenderPlan.summary}`);
  lines.push(`- Next step: ${companionFormRenderPlan.nextStep}`);
  companionFormRenderPlan.items.forEach((item) => {
    lines.push(`- ${item.title} [${item.status}]`);
    lines.push(`  - ${item.summary}`);
    lines.push(`  - Template ready: ${item.templateReady ? "Yes" : "No"}`);
    lines.push(`  - Field payloads: ${item.fieldValues.length}`);
    item.fieldValues.slice(0, 4).forEach((fieldValue) => {
      lines.push(
        `  - ${fieldValue.label}: ${fieldValue.value} [${fieldValue.supportLevel}]`
      );
    });
  });

  lines.push("", "## Companion form plan");
  lines.push(`- ${companionFormPlan.summary}`);
  lines.push(`- Next step: ${companionFormPlan.nextStep}`);
  companionFormPlan.items.forEach((item) => {
    lines.push(`- ${item.title} [${item.status}]`);
    lines.push(`  - ${item.summary}`);
    lines.push(`  - Fill mode: ${item.fillMode}`);
  });

  lines.push("", "## Cross-form consistency");
  lines.push(`- Status: ${crossFormConsistency.overallStatus}`);
  lines.push(`- ${crossFormConsistency.summary}`);
  lines.push(`- Next step: ${crossFormConsistency.nextStep}`);
  if (crossFormConsistency.issues.length > 0) {
    crossFormConsistency.issues.forEach((issue) => {
      lines.push(`- ${issue.title} [${issue.severity}]`);
      lines.push(`  - ${issue.summary}`);
    });
  } else {
    lines.push("- Tina does not currently see route/form/evidence mismatches across the companion form set.");
  }

  lines.push("", "## Decision briefings");
  lines.push(`- Reviewer headline: ${decisionBriefings.reviewer.headline}`);
  lines.push(`- Reviewer summary: ${decisionBriefings.reviewer.summary}`);
  decisionBriefings.reviewer.keyPoints.forEach((point) => {
    lines.push(`- Reviewer key point: ${point}`);
  });
  decisionBriefings.reviewer.openQuestions.forEach((question) => {
    lines.push(`- Reviewer open question: ${question}`);
  });
  lines.push(`- Owner headline: ${decisionBriefings.owner.headline}`);
  lines.push(`- Owner summary: ${decisionBriefings.owner.summary}`);
  decisionBriefings.owner.keyPoints.forEach((point) => {
    lines.push(`- Owner key point: ${point}`);
  });
  decisionBriefings.owner.openQuestions.forEach((question) => {
    lines.push(`- Owner open question: ${question}`);
  });

  lines.push("", "## Open items");
  if (packageReadiness.items.length > 0) {
    packageReadiness.items.forEach((item) => {
      lines.push(`- ${item.title} [${item.severity}]`);
      lines.push(`  - ${item.summary}`);
    });
  } else {
    lines.push("- Tina does not see any open filing-package items right now.");
  }

  lines.push("", "## Reviewer signoff");
  lines.push(`- Status: ${draft.reviewerSignoff.summary}`);
  lines.push(`  - Next step: ${draft.reviewerSignoff.nextStep}`);
  lines.push(
    `  - Active snapshot: ${draft.reviewerSignoff.activeSnapshotId ?? "None captured"}`
  );
  lines.push(
    `  - Drift after signoff: ${draft.reviewerSignoff.hasDriftSinceSignoff ? "Yes" : "No"}`
  );

  lines.push("", "## Reviewer appendix");
  if (draft.appendix.items.length > 0) {
    draft.appendix.items.forEach((item) => {
      lines.push(`- ${item.title} [${item.taxPositionBucket}]`);
      lines.push(`  - ${item.summary}`);
      lines.push(`  - Why it matters: ${item.whyItMatters}`);
      lines.push(`  - Reviewer question: ${item.reviewerQuestion}`);
    });
  } else {
    lines.push("- Tina does not see any appendix-only ideas right now.");
  }

  lines.push("", "## Saved papers");
  if (draft.documents.length > 0) {
    draft.documents.forEach((document) => {
      lines.push(`- ${document.name} (${document.category.replace(/_/g, " ")})`);
    });
  } else {
    lines.push("- No saved papers yet.");
  }

  lines.push("", "## Ledger source");
  if (
    draft.quickBooksConnection.status === "connected" ||
    draft.quickBooksConnection.status === "syncing"
  ) {
    lines.push(
      `- QuickBooks: ${draft.quickBooksConnection.companyName || "Connected company"} [${draft.quickBooksConnection.status}]`
    );
    lines.push(`  - ${draft.quickBooksConnection.summary}`);
    lines.push(
      `  - Imported ledger artifacts: ${draft.quickBooksConnection.importedDocumentIds.length}`
    );
  } else {
    lines.push("- QuickBooks live connection is not set up yet.");
  }

  lines.push("", "## Authority work");
  if (draft.authorityWork.length > 0) {
    draft.authorityWork.forEach((item) => {
      lines.push(`- ${item.ideaId} [${item.status}]`);
      if (item.memo) lines.push(`  - Tina note: ${item.memo}`);
      if (item.reviewerNotes) lines.push(`  - Reviewer note: ${item.reviewerNotes}`);
      lines.push(`  - Citations saved: ${item.citations.length}`);
    });
  } else {
    lines.push("- No saved authority work items yet.");
  }

  lines.push("", "## Tina note", "");
  lines.push(
    "This packet is a reviewer-ready brief from Tina. It is not a filed return, and it should travel with the source papers and human review notes."
  );

  const packetExport: TinaCpaPacketExport = {
    fileName: `tina-cpa-packet-${slug}-${taxYear}.md`,
    mimeType: "text/markdown; charset=utf-8",
    contents: lines.join("\n"),
  };

  cpaPacketExportCache.set(draft, packetExport);
  return packetExport;
}
