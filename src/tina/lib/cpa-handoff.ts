import { buildTinaAttachmentStatements } from "@/tina/lib/attachment-statements";
import { buildTinaAttachmentSchedules } from "@/tina/lib/attachment-schedules";
import { buildTinaAccountingArtifactCoverage } from "@/tina/lib/accounting-artifact-coverage";
import { buildTinaAuthorityPositionMatrix } from "@/tina/lib/authority-position-matrix";
import { buildTinaBooksNormalization } from "@/tina/lib/books-normalization";
import { buildTinaBooksReconciliation } from "@/tina/lib/books-reconciliation";
import { buildTinaChecklist } from "@/tina/lib/checklist";
import { buildTinaCompanionFormCalculations } from "@/tina/lib/companion-form-calculations";
import { buildTinaCompanionFormPlan } from "@/tina/lib/companion-form-plan";
import { buildTinaCrossFormConsistency } from "@/tina/lib/cross-form-consistency";
import { buildTinaDecisionBriefings } from "@/tina/lib/decision-briefings";
import { buildTinaDocumentRequestPlan } from "@/tina/lib/document-request-plan";
import { buildTinaDisclosureReadiness } from "@/tina/lib/disclosure-readiness";
import { buildTinaEntityEconomicsReadiness } from "@/tina/lib/entity-economics-readiness";
import { buildTinaEntityJudgment } from "@/tina/lib/entity-judgment";
import { buildTinaEntityRecordMatrix } from "@/tina/lib/entity-record-matrix";
import { buildTinaEntityReturnRunbook } from "@/tina/lib/entity-return-runbook";
import { buildTinaFederalReturnRequirements } from "@/tina/lib/federal-return-requirements";
import { buildTinaFormReadiness } from "@/tina/lib/form-readiness";
import { buildTinaIndustryPlaybooks } from "@/tina/lib/industry-playbooks";
import { buildTinaIndustryEvidenceMatrix } from "@/tina/lib/industry-evidence-matrix";
import { buildTinaOfficialFormFill } from "@/tina/lib/official-form-fill";
import { buildTinaOfficialFormExecution } from "@/tina/lib/official-form-execution";
import { buildTinaOwnershipTimeline } from "@/tina/lib/ownership-timeline";
import { buildTinaPackageReadiness } from "@/tina/lib/package-readiness";
import { buildTinaPackageState } from "@/tina/lib/package-state";
import { buildTinaReviewerChallenges } from "@/tina/lib/reviewer-challenges";
import { buildTinaReviewerAcceptanceForecast } from "@/tina/lib/reviewer-acceptance-forecast";
import { buildTinaScheduleCFormCoverage } from "@/tina/lib/schedule-c-form-coverage";
import { buildTinaScheduleCFormTrace } from "@/tina/lib/schedule-c-form-trace";
import { buildTinaScheduleCReturn } from "@/tina/lib/schedule-c-return";
import { buildTinaStartPathAssessment } from "@/tina/lib/start-path";
import { buildTinaTaxOpportunityEngine } from "@/tina/lib/tax-opportunity-engine";
import { buildTinaPlanningActionBoard } from "@/tina/lib/planning-action-board";
import { buildTinaTaxPlanningMemo } from "@/tina/lib/tax-planning-memo";
import { buildTinaTreatmentJudgment } from "@/tina/lib/treatment-judgment";
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
  const entityReturnRunbook = buildTinaEntityReturnRunbook(draft);
  const federalReturnRequirements = buildTinaFederalReturnRequirements(draft);
  const ownershipTimeline = buildTinaOwnershipTimeline(draft);
  const treatmentJudgment = buildTinaTreatmentJudgment(draft);
  const lane = startPath.recommendation;
  const booksNormalization = buildTinaBooksNormalization(draft);
  const booksReconciliation = buildTinaBooksReconciliation(draft);
  const accountingArtifactCoverage = buildTinaAccountingArtifactCoverage(draft);
  const industryPlaybooks = buildTinaIndustryPlaybooks(draft);
  const industryEvidenceMatrix = buildTinaIndustryEvidenceMatrix(draft);
  const taxOpportunityEngine = buildTinaTaxOpportunityEngine(draft);
  const companionFormPlan = buildTinaCompanionFormPlan(draft);
  const companionFormCalculations = buildTinaCompanionFormCalculations(draft);
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
  const reviewBundleFileCount = officialFormFill.formId ? 45 : 44;
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
          ? "Tina has a coherent blank-form execution stack for the current federal lane."
          : officialFormExecutionStatus === "waiting"
            ? "Tina has an execution stack, but some forms still need reviewer-controlled cleanup."
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
        ...accountingArtifactCoverage.items
          .slice(0, 4)
          .map((item) => `${item.title} [${item.status} | ${item.criticality}]`),
      ],
      sourceDocumentIds: uniqueIds(
        accountingArtifactCoverage.items.flatMap((item) => item.matchedDocumentIds)
      ),
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
