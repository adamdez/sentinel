import type {
  TinaReviewerOutcomeRecord,
  TinaReviewerOverrideTargetType,
  TinaReviewerOutcomeCaseTag,
  TinaWorkspaceDraft,
} from "@/tina/types";
import { deriveCurrentFileTags } from "@/tina/lib/live-acceptance";

export interface TinaCurrentFileReviewerPattern {
  outcomeId: string;
  title: string;
  targetType: TinaReviewerOverrideTargetType;
  verdict: TinaReviewerOutcomeRecord["verdict"];
  phase: TinaReviewerOutcomeRecord["phase"];
  sourceDocumentIds: string[];
  matchedCaseTags: TinaReviewerOutcomeCaseTag[];
  matchType: "direct_document" | "cohort";
  lessons: string[];
  summary: string;
}

export interface TinaCurrentFileReviewerRealityReport {
  status: "strong" | "mixed" | "fragile";
  summary: string;
  nextStep: string;
  lessons: string[];
  patterns: TinaCurrentFileReviewerPattern[];
}

function buildPattern(args: {
  outcome: TinaReviewerOutcomeRecord;
  sourceDocumentIds: string[];
  matchedCaseTags: TinaReviewerOutcomeCaseTag[];
  matchType: TinaCurrentFileReviewerPattern["matchType"];
  summary: string;
}): TinaCurrentFileReviewerPattern {
  return {
    outcomeId: args.outcome.id,
    title: args.outcome.title,
    targetType: args.outcome.targetType,
    verdict: args.outcome.verdict,
    phase: args.outcome.phase,
    sourceDocumentIds: args.sourceDocumentIds,
    matchedCaseTags: args.matchedCaseTags,
    matchType: args.matchType,
    lessons: args.outcome.lessons,
    summary: args.summary,
  };
}

function resolveOutcomeDocumentIds(
  draft: TinaWorkspaceDraft,
  outcome: TinaReviewerOutcomeRecord
): string[] {
  switch (outcome.targetType) {
    case "tax_adjustment":
      return (
        draft.taxAdjustments.adjustments.find((item) => item.id === outcome.targetId)?.sourceDocumentIds ?? []
      );
    case "reviewer_final_line":
      return draft.reviewerFinal.lines.find((item) => item.id === outcome.targetId)?.sourceDocumentIds ?? [];
    case "schedule_c_field":
      return draft.scheduleCDraft.fields.find((item) => item.id === outcome.targetId)?.sourceDocumentIds ?? [];
    case "package_readiness_item":
      return draft.packageReadiness.items.find((item) => item.id === outcome.targetId)?.sourceDocumentIds ?? [];
    case "cpa_handoff_artifact":
      return draft.cpaHandoff.artifacts.find((item) => item.id === outcome.targetId)?.sourceDocumentIds ?? [];
    case "cleanup_suggestion":
      return draft.cleanupPlan.suggestions.find((item) => item.id === outcome.targetId)?.sourceDocumentIds ?? [];
    case "review_item":
      return [
        ...(draft.bootstrapReview.items.find((item) => item.id === outcome.targetId)?.documentId
          ? [draft.bootstrapReview.items.find((item) => item.id === outcome.targetId)?.documentId as string]
          : []),
        ...(draft.issueQueue.items.find((item) => item.id === outcome.targetId)?.documentId
          ? [draft.issueQueue.items.find((item) => item.id === outcome.targetId)?.documentId as string]
          : []),
      ];
    default:
      return [];
  }
}

export function buildTinaCurrentFileReviewerReality(
  draft: TinaWorkspaceDraft
): TinaCurrentFileReviewerRealityReport {
  const currentDocumentIds = new Set(draft.documents.map((document) => document.id));
  const currentFileTags = new Set(deriveCurrentFileTags(draft));
  const patterns: TinaCurrentFileReviewerPattern[] = draft.reviewerOutcomeMemory.outcomes.flatMap(
    (outcome): TinaCurrentFileReviewerPattern[] => {
      const sourceDocumentIds = resolveOutcomeDocumentIds(draft, outcome).filter((documentId) =>
        currentDocumentIds.has(documentId)
      );
      const matchedCaseTags = outcome.caseTags.filter((tag) => currentFileTags.has(tag));

      if (sourceDocumentIds.length > 0) {
        return [
          buildPattern({
            outcome,
            sourceDocumentIds,
            matchedCaseTags,
            matchType: "direct_document",
            summary: `${outcome.title}: ${outcome.verdict} during ${outcome.phase.replace(
              /_/g,
              " "
            )}.`,
          }),
        ];
      }

      if (matchedCaseTags.length > 0) {
        return [
          buildPattern({
            outcome,
            sourceDocumentIds: [],
            matchedCaseTags,
            matchType: "cohort",
            summary: `${outcome.title}: ${outcome.verdict} during ${outcome.phase.replace(
              /_/g,
              " "
            )} on a matching ${matchedCaseTags.join(", ").replace(/_/g, " ")} cohort.`,
          }),
        ];
      }

      return [];
    }
  );

  if (patterns.length === 0) {
    return {
      status: "mixed",
      summary: "Tina does not have current-file reviewer outcomes tied directly to this paper stack yet.",
      nextStep:
        "Record reviewer decisions against the current file so Tina can learn from the exact packet she is preparing.",
      lessons: [],
      patterns: [],
    };
  }

  const rejectedCount = patterns.filter((pattern) => pattern.verdict === "rejected").length;
  const revisedCount = patterns.filter((pattern) => pattern.verdict === "revised").length;
  const lessons = Array.from(new Set(patterns.flatMap((pattern) => pattern.lessons)));
  const cohortPatternCount = patterns.filter((pattern) => pattern.matchType === "cohort").length;
  const directPatternCount = patterns.filter(
    (pattern) => pattern.matchType === "direct_document"
  ).length;

  let status: TinaCurrentFileReviewerRealityReport["status"] = "strong";
  let summary = `Tina matched ${patterns.length} reviewer outcome${
    patterns.length === 1 ? "" : "s"
  } to the current file or its closest measured cohorts.`;
  let nextStep =
    "Keep this reviewer reality visible while Tina finalizes the packet so repeated corrections stay explicit.";

  if (rejectedCount > 0) {
    status = "fragile";
    summary = `Tina matched ${rejectedCount} rejected reviewer outcome${
      rejectedCount === 1 ? "" : "s"
    } to the current file or its closest measured cohorts, so trust is still fragile.`;
    nextStep =
      "Start with the rejected current-file patterns first. Tina should not overstate readiness while those corrections are still live.";
  } else if (revisedCount > 0) {
    status = "mixed";
    summary = `Tina matched ${revisedCount} revised reviewer outcome${
      revisedCount === 1 ? "" : "s"
    } to the current file or its closest measured cohorts, so some packet behavior still needs human caution.`;
    nextStep =
      "Review the revised current-file patterns and make sure the packet shows the lessons instead of burying them.";
  }

  if (cohortPatternCount > 0 && directPatternCount === 0) {
    summary +=
      " Tina is learning from matched file cohorts even when the exact paper stack has not been reviewed before.";
  }

  return {
    status,
    summary,
    nextStep,
    lessons,
    patterns,
  };
}
