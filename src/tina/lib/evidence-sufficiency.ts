import { buildTinaBooksNormalization } from "@/tina/lib/books-normalization";
import { buildTinaScheduleCFormTrace } from "@/tina/lib/schedule-c-form-trace";
import { buildTinaStartPathAssessment } from "@/tina/lib/start-path";
import type {
  TinaEvidenceSufficiencyIssue,
  TinaEvidenceSufficiencyLine,
  TinaEvidenceSufficiencySnapshot,
  TinaWorkspaceDraft,
} from "@/tina/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildLine(args: TinaEvidenceSufficiencyLine): TinaEvidenceSufficiencyLine {
  return {
    ...args,
    relatedFactIds: unique(args.relatedFactIds),
    relatedDocumentIds: unique(args.relatedDocumentIds),
  };
}

function buildIssue(args: TinaEvidenceSufficiencyIssue): TinaEvidenceSufficiencyIssue {
  return {
    ...args,
    relatedFactIds: unique(args.relatedFactIds),
    relatedDocumentIds: unique(args.relatedDocumentIds),
  };
}

export function buildTinaEvidenceSufficiency(
  draft: TinaWorkspaceDraft
): TinaEvidenceSufficiencySnapshot {
  const formTrace = buildTinaScheduleCFormTrace(draft);
  const startPath = buildTinaStartPathAssessment(draft);
  const booksNormalization = buildTinaBooksNormalization(draft);
  const nonZeroLines = formTrace.lines.filter(
    (line) => typeof line.amount === "number" && line.amount !== 0
  );
  const counts = nonZeroLines.reduce(
    (totals, line) => {
      totals[line.evidenceSupportLevel] += 1;
      return totals;
    },
    { strong: 0, moderate: 0, weak: 0, missing: 0 }
  );

  const lines = nonZeroLines.map((line) =>
    buildLine({
      id: line.id,
      lineNumber: line.lineNumber,
      label: line.label,
      amount: line.amount,
      level: line.evidenceSupportLevel,
      summary: line.evidenceSupportSummary,
      relatedFactIds: line.sourceFactIds,
      relatedDocumentIds: line.sourceDocumentIds,
    })
  );

  const issues: TinaEvidenceSufficiencyIssue[] = [
    ...startPath.proofRequirements
      .filter((requirement) => requirement.status === "needed")
      .map((requirement) =>
        buildIssue({
          id: `proof-${requirement.id}`,
          title: `${requirement.label} still weakens evidence sufficiency`,
          summary: requirement.reason,
          severity: "blocking",
          relatedFactIds: requirement.relatedFactIds,
          relatedDocumentIds: requirement.relatedDocumentIds,
        })
      ),
    ...booksNormalization.issues
      .filter((issue) => issue.severity !== "watch")
      .map((issue) =>
        buildIssue({
          id: `books-${issue.id}`,
          title: issue.title,
          summary: issue.summary,
          severity: issue.severity === "blocking" ? "blocking" : "needs_attention",
          relatedFactIds: issue.factIds,
          relatedDocumentIds: issue.documentIds,
        })
      ),
    ...lines
      .filter((line) => line.level === "weak" || line.level === "missing")
      .map((line) =>
        buildIssue({
          id: `line-${line.id}`,
          title: `${line.lineNumber} still has weak evidence support`,
          summary: line.summary,
          severity: "blocking",
          relatedFactIds: line.relatedFactIds,
          relatedDocumentIds: line.relatedDocumentIds,
        })
      ),
    ...lines
      .filter((line) => line.level === "moderate")
      .map((line) =>
        buildIssue({
          id: `line-review-${line.id}`,
          title: `${line.lineNumber} still needs deeper evidence support`,
          summary: line.summary,
          severity: "needs_attention",
          relatedFactIds: line.relatedFactIds,
          relatedDocumentIds: line.relatedDocumentIds,
        })
      ),
  ];

  const blockingCount = issues.filter((issue) => issue.severity === "blocking").length;
  const attentionCount = issues.filter((issue) => issue.severity === "needs_attention").length;
  const overallStatus: TinaEvidenceSufficiencySnapshot["overallStatus"] =
    blockingCount > 0
      ? "blocked"
      : attentionCount > 0 || counts.strong === 0
        ? "provisional"
        : "reviewer_grade";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    overallStatus,
    summary:
      overallStatus === "reviewer_grade"
        ? "Tina sees reviewer-grade evidence sufficiency on the current non-zero return lines."
        : overallStatus === "provisional"
          ? `Tina sees provisional evidence sufficiency with ${attentionCount} attention item${attentionCount === 1 ? "" : "s"}.`
          : `Tina still sees ${blockingCount} blocker${blockingCount === 1 ? "" : "s"} in package-wide evidence sufficiency.`,
    nextStep:
      overallStatus === "reviewer_grade"
        ? "Carry this evidence sufficiency score into final reviewer prep and packet confidence."
        : overallStatus === "provisional"
          ? "Strengthen the moderate support areas before calling the package reviewer-grade."
          : "Clear the blocked evidence sufficiency issues before trusting the file as reviewer-ready.",
    counts,
    lines,
    issues: issues.filter(
      (issue, index) => issues.findIndex((candidate) => candidate.id === issue.id) === index
    ),
  };
}
