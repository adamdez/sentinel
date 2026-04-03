import { buildTinaBooksNormalization } from "@/tina/lib/books-normalization";
import { buildTinaBooksReconciliation } from "@/tina/lib/books-reconciliation";
import { buildTinaAttachmentStatements } from "@/tina/lib/attachment-statements";
import { buildTinaAuthorityPositionMatrix } from "@/tina/lib/authority-position-matrix";
import { buildTinaCompanionFormCalculations } from "@/tina/lib/companion-form-calculations";
import { buildTinaDisclosureReadiness } from "@/tina/lib/disclosure-readiness";
import { buildTinaEntityJudgment } from "@/tina/lib/entity-judgment";
import { buildTinaIndustryEvidenceMatrix } from "@/tina/lib/industry-evidence-matrix";
import { buildTinaOfficialFormFill } from "@/tina/lib/official-form-fill";
import { buildTinaPackageState } from "@/tina/lib/package-state";
import { buildTinaReviewerAcceptanceForecast } from "@/tina/lib/reviewer-acceptance-forecast";
import { buildTinaScheduleCFormCoverage } from "@/tina/lib/schedule-c-form-coverage";
import { buildTinaScheduleCFormTrace } from "@/tina/lib/schedule-c-form-trace";
import { buildTinaScheduleCReturn } from "@/tina/lib/schedule-c-return";
import { buildTinaStartPathAssessment } from "@/tina/lib/start-path";
import { buildTinaTreatmentJudgment } from "@/tina/lib/treatment-judgment";
import type {
  TinaFormReadinessReason,
  TinaFormReadinessSnapshot,
  TinaWorkspaceDraft,
} from "@/tina/types";

function createReason(args: {
  id: string;
  title: string;
  summary: string;
  severity: TinaFormReadinessReason["severity"];
}): TinaFormReadinessReason {
  return {
    id: args.id,
    title: args.title,
    summary: args.summary,
    severity: args.severity,
  };
}

function lineIsTraceable(line: ReturnType<typeof buildTinaScheduleCFormTrace>["lines"][number]): boolean {
  return (
    line.sourceFieldIds.length > 0 ||
    line.reviewerFinalLineIds.length > 0 ||
    line.sourceDocumentIds.length > 0 ||
    (line.amount === 0 && line.status === "ready")
  );
}

function lineNeedsEvidenceBlocking(
  line: ReturnType<typeof buildTinaScheduleCFormTrace>["lines"][number]
): boolean {
  return (
    typeof line.amount === "number" &&
    line.amount !== 0 &&
    (line.evidenceSupportLevel === "missing" || line.evidenceSupportLevel === "weak")
  );
}

function lineNeedsEvidenceAttention(
  line: ReturnType<typeof buildTinaScheduleCFormTrace>["lines"][number]
): boolean {
  return (
    typeof line.amount === "number" &&
    line.amount !== 0 &&
    line.evidenceSupportLevel === "moderate"
  );
}

export function buildTinaFormReadiness(
  draft: TinaWorkspaceDraft
): TinaFormReadinessSnapshot {
  const now = new Date().toISOString();
  const scheduleCReturn = buildTinaScheduleCReturn(draft);
  const formCoverage = buildTinaScheduleCFormCoverage(draft);
  const formTrace = buildTinaScheduleCFormTrace(draft);
  const officialFormFill = buildTinaOfficialFormFill(draft);
  const companionFormCalculations = buildTinaCompanionFormCalculations(draft);
  const attachmentStatements = buildTinaAttachmentStatements(draft);
  const authorityPositionMatrix = buildTinaAuthorityPositionMatrix(draft);
  const disclosureReadiness = buildTinaDisclosureReadiness(draft);
  const reviewerAcceptanceForecast = buildTinaReviewerAcceptanceForecast(draft);
  const industryEvidenceMatrix = buildTinaIndustryEvidenceMatrix(draft);
  const startPath = buildTinaStartPathAssessment(draft);
  const entityJudgment = buildTinaEntityJudgment(draft);
  const treatmentJudgment = buildTinaTreatmentJudgment(draft);
  const booksNormalization = buildTinaBooksNormalization(draft);
  const booksReconciliation = buildTinaBooksReconciliation(draft);
  const packageState = buildTinaPackageState(draft);
  const readinessRelevantPositionIds = new Set(
    authorityPositionMatrix.items
      .filter(
        (item) => item.recommendation === "use_now" || item.recommendation === "review_first"
      )
      .map((item) => item.id)
  );
  const reasons: TinaFormReadinessReason[] = [];

  if (startPath.route === "blocked") {
    reasons.push(
      createReason({
        id: "start-path-blocked",
        title: "Start path is blocked",
        summary:
          "Tina should not call official-form output ready while the starting filing path is still blocked.",
        severity: "blocking",
      })
    );
  } else if (startPath.route === "review_only") {
    reasons.push(
      createReason({
        id: "start-path-review-only",
        title: "Start path still needs reviewer judgment",
        summary:
          "Tina has a likely path, but a reviewer still needs to confirm the filing posture before final-form output is trusted.",
        severity: "needs_attention",
      })
    );
  }

  startPath.proofRequirements.forEach((requirement) => {
    if (requirement.status !== "needed") return;
    reasons.push(
      createReason({
        id: `proof-${requirement.id}`,
        title: `${requirement.label} still needed`,
        summary: requirement.reason,
        severity: startPath.route === "blocked" ? "blocking" : "needs_attention",
      })
    );
  });

  entityJudgment.questions.forEach((question) => {
    reasons.push(
      createReason({
        id: `entity-${question.id}`,
        title: question.title,
        summary: question.summary,
        severity: question.severity,
      })
    );
  });

  treatmentJudgment.items.forEach((judgment) => {
    if (judgment.taxPositionBucket === "use") return;
    reasons.push(
      createReason({
        id: `treatment-${judgment.id}`,
        title: judgment.title,
        summary: `${judgment.summary} ${judgment.nextStep}`.trim(),
        severity: judgment.taxPositionBucket === "reject" ? "blocking" : "needs_attention",
      })
    );
  });

  scheduleCReturn.validationIssues.forEach((issue) => {
    reasons.push(
      createReason({
        id: `validation-${issue.id}`,
        title: issue.title,
        summary: issue.summary,
        severity: issue.severity,
      })
    );
  });

  booksNormalization.issues.forEach((issue) => {
    if (issue.severity === "watch") return;
    reasons.push(
      createReason({
        id: `books-${issue.id}`,
        title: issue.title,
        summary: issue.summary,
        severity: issue.severity === "blocking" ? "blocking" : "needs_attention",
      })
    );
  });

  booksReconciliation.checks.forEach((check) => {
    if (check.status === "reconciled") return;
    reasons.push(
      createReason({
        id: `books-reconciliation-${check.id}`,
        title: check.title,
        summary: check.summary,
        severity: check.status === "blocked" ? "blocking" : "needs_attention",
      })
    );
  });

  formCoverage.items.forEach((item) => {
    if (item.status === "covered") return;
    reasons.push(
      createReason({
        id: `coverage-${item.id}`,
        title: item.title,
        summary: item.summary,
        severity:
          item.status === "unsupported" ? "blocking" : "needs_attention",
      })
    );
  });

  const tracedLineCount = formTrace.lines.filter(lineIsTraceable).length;
  if (formTrace.lines.length === 0) {
    reasons.push(
      createReason({
        id: "missing-form-trace",
        title: "Form trace is missing",
        summary:
          "Tina should not call official-form output reviewer-ready without a source-to-form trace.",
        severity: "blocking",
      })
    );
  } else if (tracedLineCount < formTrace.lines.length) {
    reasons.push(
      createReason({
        id: "partial-form-trace",
        title: "Some form lines still have incomplete traceability",
        summary:
          "Tina has a form trace, but not every line is linked back to draft fields or evidence cleanly yet.",
        severity: "needs_attention",
      })
    );
  }

  formTrace.lines.filter(lineNeedsEvidenceBlocking).forEach((line) => {
    reasons.push(
      createReason({
        id: `evidence-${line.id}`,
        title: `${line.lineNumber} still has thin evidence support`,
        summary: `${line.evidenceSupportSummary} Tina should not call this line reviewer-ready yet.`,
        severity: "blocking",
      })
    );
  });

  formTrace.lines.filter(lineNeedsEvidenceAttention).forEach((line) => {
    reasons.push(
      createReason({
        id: `evidence-review-${line.id}`,
        title: `${line.lineNumber} still needs stronger evidence support`,
        summary: `${line.evidenceSupportSummary} A reviewer may still want tighter fact coverage before trusting this line as final.`,
        severity: "needs_attention",
      })
    );
  });

  if (officialFormFill.overallStatus === "blocked") {
    reasons.push(
      createReason({
        id: "official-form-fill-blocked",
        title: "Official-form fill plan is still blocked",
        summary:
          officialFormFill.blockedReasons[0] ??
          "Tina does not yet have a clean official-form fill plan for the stored Schedule C blank.",
        severity: "blocking",
      })
    );
  } else if (officialFormFill.overallStatus === "needs_review") {
    reasons.push(
      createReason({
        id: "official-form-fill-review",
        title: "Official-form fill plan still needs reviewer attention",
        summary:
          "Tina mapped the official-form placements, but some fields still have review-only or thin-support status.",
        severity: "needs_attention",
      })
    );
  }

  companionFormCalculations.items.forEach((item) => {
    if (item.status === "ready" || item.status === "not_applicable") return;
    reasons.push(
      createReason({
        id: `companion-form-${item.id}`,
        title: item.title,
        summary: item.summary,
        severity: item.status === "blocked" ? "blocking" : "needs_attention",
      })
    );
  });

  attachmentStatements.items.forEach((item) => {
    if (item.status === "ready") return;
    reasons.push(
      createReason({
        id: `attachment-${item.id}`,
        title: item.title,
        summary: item.summary,
        severity: item.status === "blocked" ? "blocking" : "needs_attention",
      })
    );
  });

  disclosureReadiness.items
    .filter(
      (item) =>
        item.status === "required" ||
        item.relatedPositionIds.some((id) => readinessRelevantPositionIds.has(id))
    )
    .forEach((item) => {
      reasons.push(
        createReason({
          id: `disclosure-${item.id}`,
          title: item.title,
          summary: item.summary,
          severity: item.status === "required" ? "blocking" : "needs_attention",
        })
      );
    });

  reviewerAcceptanceForecast.items
    .filter((item) => item.relatedPositionIds.some((id) => readinessRelevantPositionIds.has(id)))
    .forEach((item) => {
      reasons.push(
        createReason({
          id: `reviewer-acceptance-${item.id}`,
          title: item.title,
          summary: item.summary,
          severity: item.status === "likely_reject" ? "blocking" : "needs_attention",
        })
      );
    });

  industryEvidenceMatrix.items.forEach((item) => {
    if (item.status !== "partial" || item.materiality !== "high") return;
    reasons.push(
      createReason({
        id: `industry-evidence-${item.id}`,
        title: `${item.playbookTitle}: ${item.requirement}`,
        summary: item.summary,
        severity: "needs_attention",
      })
    );
  });

  if (packageState === "blocked" || packageState === "signed_off_stale") {
    reasons.push(
      createReason({
        id: "package-state-blocked",
        title: "Package state still blocks final-form confidence",
        summary:
          "Tina should not call official-form output ready while the package state is blocked or stale after signoff.",
        severity: "blocking",
      })
    );
  }

  const blockingCount = reasons.filter((reason) => reason.severity === "blocking").length;
  const attentionCount = reasons.filter((reason) => reason.severity === "needs_attention").length;
  const level =
    blockingCount > 0
      ? "not_ready"
      : attentionCount > 0
        ? "provisional"
        : "reviewer_ready";

  let summary = "Tina has not evaluated official-form readiness yet.";
  let nextStep = "Build the official-form readiness snapshot after return mapping and traceability.";

  if (level === "reviewer_ready") {
    summary = "Tina sees no current blockers between the supported Schedule C output and reviewer-ready form output.";
    nextStep = "Render the form output, preserve the snapshot, and send it to reviewer signoff.";
  } else if (level === "provisional") {
    summary = `Tina has form output, but ${attentionCount} review item${
      attentionCount === 1 ? "" : "s"
    } still keep it provisional.`;
    nextStep = "Clear the remaining review items before calling the form reviewer-ready.";
  } else {
    summary = `Tina still sees ${blockingCount} blocker${blockingCount === 1 ? "" : "s"} before she can call this form output ready.`;
    nextStep = "Clear the blockers before treating the form output as reviewer-ready or final.";
  }

  return {
    lastBuiltAt: now,
    level,
    summary,
    nextStep,
    reasons,
  };
}
