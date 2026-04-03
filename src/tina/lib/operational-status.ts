import { buildTinaAttachmentStatements } from "@/tina/lib/attachment-statements";
import { buildTinaAttachmentSchedules } from "@/tina/lib/attachment-schedules";
import { buildTinaAccountingArtifactCoverage } from "@/tina/lib/accounting-artifact-coverage";
import { buildTinaAuthorityPositionMatrix } from "@/tina/lib/authority-position-matrix";
import { buildTinaBooksNormalization } from "@/tina/lib/books-normalization";
import { buildTinaBooksReconciliation } from "@/tina/lib/books-reconciliation";
import { buildTinaCompanionFormPlan } from "@/tina/lib/companion-form-plan";
import { buildTinaCompanionFormCalculations } from "@/tina/lib/companion-form-calculations";
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
  const entityReturnRunbook = buildTinaEntityReturnRunbook(draft);
  const federalReturnRequirements = buildTinaFederalReturnRequirements(draft);
  const ownershipTimeline = buildTinaOwnershipTimeline(draft);
  const scheduleCReturn = buildTinaScheduleCReturn(draft);
  const formCoverage = buildTinaScheduleCFormCoverage(draft);
  const formTrace = buildTinaScheduleCFormTrace(draft);
  const formReadiness = buildTinaFormReadiness(draft);
  const officialFormFill = buildTinaOfficialFormFill(draft);
  const officialFormExecution = buildTinaOfficialFormExecution(draft);
  const companionFormCalculations = buildTinaCompanionFormCalculations(draft);
  const booksNormalization = buildTinaBooksNormalization(draft);
  const booksReconciliation = buildTinaBooksReconciliation(draft);
  const accountingArtifactCoverage = buildTinaAccountingArtifactCoverage(draft);
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
  const companionFormPlan = buildTinaCompanionFormPlan(draft);
  const crossFormConsistency = buildTinaCrossFormConsistency(draft);
  const reviewerChallenges = buildTinaReviewerChallenges(draft);
  const treatmentJudgment = buildTinaTreatmentJudgment(draft);
  const maturity = determineMaturity(draft);
  const startPath = buildTinaStartPathAssessment(draft);
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
      ...entityJudgment.questions
        .filter((question) => question.severity === "blocking")
        .map((question) => question.title),
      ...entityRecordMatrix.items
        .filter((item) => item.criticality === "critical" && item.status === "missing")
        .map((item) => item.title),
      ...entityEconomicsReadiness.checks
        .filter((check) => check.status === "blocked")
        .map((check) => check.title),
      ...federalReturnRequirements.items
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
      `Entity treatment judgment: ${entityJudgment.judgmentStatus.replace(/_/g, " ")}.`,
      `Federal return family: ${federalReturnRequirements.returnFamily}.`,
      `Entity record matrix: ${entityRecordMatrix.overallStatus}.`,
      `Entity economics readiness: ${entityEconomicsReadiness.overallStatus.replace(/_/g, " ")}.`,
      `Entity return runbook: ${entityReturnRunbook.executionMode.replace(/_/g, " ")} / ${entityReturnRunbook.overallStatus.replace(/_/g, " ")}.`,
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
