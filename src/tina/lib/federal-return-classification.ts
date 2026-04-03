import { buildTinaEntityJudgment } from "@/tina/lib/entity-judgment";
import { buildTinaFederalReturnRequirements } from "@/tina/lib/federal-return-requirements";
import { buildTinaStartPathAssessment, formatTinaLaneList } from "@/tina/lib/start-path";
import type {
  TinaFederalReturnClassificationIssue,
  TinaFederalReturnClassificationSignal,
  TinaFederalReturnClassificationSnapshot,
  TinaWorkspaceDraft,
} from "@/tina/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildSignal(
  args: TinaFederalReturnClassificationSignal
): TinaFederalReturnClassificationSignal {
  return {
    ...args,
    relatedFactIds: unique(args.relatedFactIds),
    relatedDocumentIds: unique(args.relatedDocumentIds),
  };
}

function buildIssue(args: TinaFederalReturnClassificationIssue): TinaFederalReturnClassificationIssue {
  return {
    ...args,
    relatedFactIds: unique(args.relatedFactIds),
    relatedDocumentIds: unique(args.relatedDocumentIds),
  };
}

export function buildTinaFederalReturnClassification(
  draft: TinaWorkspaceDraft
): TinaFederalReturnClassificationSnapshot {
  const startPath = buildTinaStartPathAssessment(draft);
  const entityJudgment = buildTinaEntityJudgment(draft);
  const federalReturnRequirements = buildTinaFederalReturnRequirements(draft);

  const signals: TinaFederalReturnClassificationSignal[] = [
    buildSignal({
      id: "organizer-posture",
      title: "Organizer and profile posture",
      summary:
        draft.profile.ownerCount === null
          ? `Profile currently points toward ${startPath.recommendation.title}, but owner count is still unresolved.`
          : `Profile currently points toward ${startPath.recommendation.title} with ${draft.profile.ownerCount} known owner${draft.profile.ownerCount === 1 ? "" : "s"}.`,
      strength:
        startPath.recommendation.laneId === "unknown" || draft.profile.ownerCount === null
          ? "weak"
          : "moderate",
      relatedFactIds: [],
      relatedDocumentIds: [],
    }),
  ];

  if (startPath.returnTypeHintFacts.length > 0) {
    signals.push(
      buildSignal({
        id: "paper-trail-hints",
        title: "Paper-trail filing hints",
        summary: startPath.hasMixedHintedLanes
          ? `Source papers point to multiple lanes: ${formatTinaLaneList(startPath.hintedLanes)}.`
          : `Source papers point toward ${formatTinaLaneList(startPath.hintedLanes)}.`,
        strength: startPath.hasMixedHintedLanes ? "weak" : "strong",
        relatedFactIds: startPath.returnTypeHintFacts.map((fact) => fact.id),
        relatedDocumentIds: startPath.returnTypeHintFacts.map((fact) => fact.sourceDocumentId),
      })
    );
  }

  if (startPath.proofRequirements.length > 0) {
    signals.push(
      buildSignal({
        id: "route-proof-coverage",
        title: "Route-critical proof coverage",
        summary: `${startPath.proofRequirements.filter((item) => item.status === "covered").length} proof item(s) covered and ${startPath.proofRequirements.filter((item) => item.status === "needed").length} still needed for the current lane.`,
        strength:
          startPath.proofRequirements.some((item) => item.status === "needed") ? "weak" : "moderate",
        relatedFactIds: startPath.proofRequirements.flatMap((item) => item.relatedFactIds),
        relatedDocumentIds: startPath.proofRequirements.flatMap((item) => item.relatedDocumentIds),
      })
    );
  }

  const issues: TinaFederalReturnClassificationIssue[] = [
    ...startPath.blockingReasons.map((reason, index) =>
      buildIssue({
        id: `start-path-blocking-${index + 1}`,
        title: "Federal return classification is blocked",
        summary: reason,
        severity: "blocking",
        relatedFactIds: startPath.relatedFactIds,
        relatedDocumentIds: startPath.relatedDocumentIds,
      })
    ),
    ...startPath.reviewReasons.map((reason, index) =>
      buildIssue({
        id: `start-path-review-${index + 1}`,
        title: "Federal return classification still needs reviewer judgment",
        summary: reason,
        severity: "needs_attention",
        relatedFactIds: startPath.relatedFactIds,
        relatedDocumentIds: startPath.relatedDocumentIds,
      })
    ),
    ...entityJudgment.questions.map((question) =>
      buildIssue({
        id: `entity-${question.id}`,
        title: question.title,
        summary: question.summary,
        severity: question.severity,
        relatedFactIds: question.relatedFactIds,
        relatedDocumentIds: question.relatedDocumentIds,
      })
    ),
  ];

  const confidence: TinaFederalReturnClassificationSnapshot["confidence"] =
    startPath.route === "blocked"
      ? "blocked"
      : startPath.route === "supported" &&
          !startPath.hasMixedHintedLanes &&
          startPath.proofRequirements.every((requirement) => requirement.status === "covered")
        ? "high"
        : startPath.hasMixedHintedLanes || startPath.hasHintVsOrganizerConflict
          ? "low"
          : "medium";

  const blockingCount = issues.filter((issue) => issue.severity === "blocking").length;
  const attentionCount = issues.filter((issue) => issue.severity === "needs_attention").length;
  const summary =
    confidence === "high"
      ? `Tina has a high-confidence federal return classification on ${startPath.recommendation.title}.`
      : confidence === "medium"
        ? `Tina has a likely federal return classification on ${startPath.recommendation.title}, but ${attentionCount} judgment item${attentionCount === 1 ? "" : "s"} still remain.`
        : confidence === "low"
          ? `Tina sees a likely federal return family, but conflicting route signals still weaken confidence.`
          : `Tina still sees ${blockingCount} blocker${blockingCount === 1 ? "" : "s"} before the federal return family can be trusted.`;
  const nextStep =
    confidence === "high"
      ? "Carry this classification through every downstream treatment and form decision."
      : confidence === "blocked"
        ? "Resolve the blocking route and proof issues before Tina builds more tax work on this file."
        : "Keep the likely return family visible, but hold the file under reviewer control until the remaining judgment questions are resolved.";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    laneId: startPath.recommendation.laneId,
    returnFamily: federalReturnRequirements.returnFamily,
    route: startPath.route,
    confidence,
    summary,
    nextStep,
    signals,
    issues: issues.filter(
      (issue, index) => issues.findIndex((candidate) => candidate.id === issue.id) === index
    ),
  };
}
