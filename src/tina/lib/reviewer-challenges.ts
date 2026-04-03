import { buildTinaBooksNormalization } from "@/tina/lib/books-normalization";
import { buildTinaScheduleCFormCoverage } from "@/tina/lib/schedule-c-form-coverage";
import { buildTinaScheduleCFormTrace } from "@/tina/lib/schedule-c-form-trace";
import { buildTinaScheduleCReturn } from "@/tina/lib/schedule-c-return";
import { buildTinaStartPathAssessment } from "@/tina/lib/start-path";
import type {
  TinaReviewerChallengeItem,
  TinaReviewerChallengeSnapshot,
  TinaWorkspaceDraft,
} from "@/tina/types";

function createEmptySnapshot(): TinaReviewerChallengeSnapshot {
  return {
    lastBuiltAt: null,
    status: "idle",
    summary: "Tina has not built a reviewer-challenge forecast yet.",
    nextStep: "Build the route, return, and trace layers first so Tina can predict reviewer pushback.",
    items: [],
  };
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildItem(args: TinaReviewerChallengeItem): TinaReviewerChallengeItem {
  return args;
}

export function buildTinaReviewerChallenges(
  draft: TinaWorkspaceDraft
): TinaReviewerChallengeSnapshot {
  const startPath = buildTinaStartPathAssessment(draft);
  const scheduleCReturn = buildTinaScheduleCReturn(draft);
  const formTrace = buildTinaScheduleCFormTrace(draft);
  const formCoverage = buildTinaScheduleCFormCoverage(draft);
  const booksNormalization = buildTinaBooksNormalization(draft);
  const items: TinaReviewerChallengeItem[] = [];

  if (
    startPath.route !== "supported" ||
    startPath.proofRequirements.some((requirement) => requirement.status === "needed")
  ) {
    items.push(
      buildItem({
        id: "route-judgment-challenge",
        title: "Reviewer is likely to challenge the starting filing path",
        summary:
          startPath.route === "blocked"
            ? "Tina still has a blocked start path, so a skeptical CPA would push on entity classification before trusting any downstream numbers."
            : "Tina has a likely start path, but missing ownership or election proof still gives a reviewer a reason to challenge the route.",
        severity: startPath.route === "blocked" ? "blocking" : "needs_attention",
        category: "start_path",
        relatedLineNumbers: [],
        relatedFactIds: startPath.relatedFactIds,
        relatedDocumentIds: startPath.relatedDocumentIds,
      })
    );
  }

  startPath.proofRequirements
    .filter((requirement) => requirement.status === "needed")
    .forEach((requirement) => {
      items.push(
        buildItem({
          id: `proof-${requirement.id}`,
          title: `${requirement.label} could trigger reviewer pushback`,
          summary: requirement.reason,
          severity: requirement.priority === "required" ? "blocking" : "needs_attention",
          category: "start_path",
          relatedLineNumbers: [],
          relatedFactIds: requirement.relatedFactIds,
          relatedDocumentIds: requirement.relatedDocumentIds,
        })
      );
    });

  formTrace.lines.forEach((line) => {
    if (line.evidenceSupportLevel === "strong") return;
    if (typeof line.amount !== "number" || line.amount === 0) return;

    items.push(
      buildItem({
        id: `evidence-${line.id}`,
        title: `${line.lineNumber} ${line.label} may not survive skeptical review cleanly`,
        summary: line.evidenceSupportSummary,
        severity:
          line.evidenceSupportLevel === "missing" ? "blocking" : "needs_attention",
        category: "evidence",
        relatedLineNumbers: [line.lineNumber],
        relatedFactIds: line.sourceFactIds,
        relatedDocumentIds: line.sourceDocumentIds,
      })
    );
  });

  const strongEvidenceCount = formTrace.lines.filter(
    (line) => typeof line.amount === "number" && line.amount !== 0 && line.evidenceSupportLevel === "strong"
  ).length;
  const nonZeroEvidenceLineCount = formTrace.lines.filter(
    (line) => typeof line.amount === "number" && line.amount !== 0
  ).length;
  if (nonZeroEvidenceLineCount > 0 && strongEvidenceCount === 0) {
    items.push(
      buildItem({
        id: "whole-return-thin-evidence",
        title: "Reviewer is likely to challenge the whole return because support is still thin",
        summary:
          "Tina does not yet have any non-zero form lines with strong evidence support, so a skeptical reviewer may question the whole draft even if the math foots.",
        severity: "blocking",
        category: "evidence",
        relatedLineNumbers: formTrace.lines
          .filter((line) => typeof line.amount === "number" && line.amount !== 0)
          .map((line) => line.lineNumber),
        relatedFactIds: unique(formTrace.lines.flatMap((line) => line.sourceFactIds)),
        relatedDocumentIds: unique(formTrace.lines.flatMap((line) => line.sourceDocumentIds)),
      })
    );
  }

  scheduleCReturn.validationIssues.forEach((issue) => {
    items.push(
      buildItem({
        id: `validation-${issue.id}`,
        title: issue.title,
        summary: issue.summary,
        severity: issue.severity,
        category: "validation",
        relatedLineNumbers: issue.relatedLineNumbers,
        relatedFactIds: [],
        relatedDocumentIds: [],
      })
    );
  });

  formCoverage.items
    .filter((item) => item.status !== "covered")
    .forEach((item) => {
      items.push(
        buildItem({
          id: `coverage-${item.id}`,
          title: `${item.title} still invites reviewer challenge`,
          summary: item.summary,
          severity: item.status === "unsupported" ? "blocking" : "needs_attention",
          category: "coverage",
          relatedLineNumbers: item.relatedLineNumbers,
          relatedFactIds: [],
          relatedDocumentIds: [],
        })
      );
    });

  booksNormalization.issues
    .filter((issue) => issue.severity !== "watch")
    .forEach((issue) => {
      items.push(
        buildItem({
          id: `books-${issue.id}`,
          title: issue.title,
          summary: issue.summary,
          severity: issue.severity === "blocking" ? "blocking" : "needs_attention",
          category: "books",
          relatedLineNumbers: [],
          relatedFactIds: issue.factIds,
          relatedDocumentIds: issue.documentIds,
        })
      );
    });

  const uniqueItems = items.filter(
    (item, index) => items.findIndex((candidate) => candidate.id === item.id) === index
  );
  const blockingCount = uniqueItems.filter((item) => item.severity === "blocking").length;
  const attentionCount = uniqueItems.filter((item) => item.severity === "needs_attention").length;

  let summary = "Tina does not yet see likely reviewer pushback points.";
  let nextStep =
    "Use this forecast as a final skeptical-CPA scan before calling the package reviewer-ready.";

  if (blockingCount > 0) {
    summary = `Tina sees ${blockingCount} blocking reviewer challenge${
      blockingCount === 1 ? "" : "s"
    } that could force a CPA to stop or reroute the file.`;
    nextStep =
      "Clear the blocking challenge points first so Tina is not asking a reviewer to rescue the package.";
  } else if (attentionCount > 0) {
    summary = `Tina sees ${attentionCount} reviewer challenge point${
      attentionCount === 1 ? "" : "s"
    } worth tightening before final handoff.`;
    nextStep =
      "Tighten the attention-level challenge points so the reviewer mostly confirms rather than reconstructs.";
  }

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    summary,
    nextStep,
    items: uniqueItems.map((item) => ({
      ...item,
      relatedFactIds: unique(item.relatedFactIds),
      relatedDocumentIds: unique(item.relatedDocumentIds),
    })),
  };
}
