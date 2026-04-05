import { buildTinaEntityAmbiguityResolver } from "@/tina/lib/entity-ambiguity-resolver";
import { buildTinaOwnershipTimeline } from "@/tina/lib/ownership-timeline";
import { buildTinaStartPathAssessment, formatTinaLaneList } from "@/tina/lib/start-path";
import type {
  TinaEntityJudgmentQuestion,
  TinaEntityJudgmentSnapshot,
  TinaFilingLaneId,
  TinaWorkspaceDraft,
} from "@/tina/types";

function describeFederalTreatment(laneId: TinaFilingLaneId): string {
  switch (laneId) {
    case "schedule_c_single_member_llc":
      return "Likely disregarded federal treatment flowing to Schedule C.";
    case "1065":
      return "Likely partnership federal treatment requiring a 1065-style path.";
    case "1120_s":
      return "Likely S-corp federal treatment requiring an 1120-S-style path.";
    case "1120":
      return "Likely C-corp federal treatment requiring an 1120-style path.";
    default:
      return "Federal treatment is still unresolved from the current facts.";
  }
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildQuestion(args: TinaEntityJudgmentQuestion): TinaEntityJudgmentQuestion {
  return {
    ...args,
    relatedFactIds: unique(args.relatedFactIds),
    relatedDocumentIds: unique(args.relatedDocumentIds),
  };
}

export function buildTinaEntityJudgment(
  draft: TinaWorkspaceDraft
): TinaEntityJudgmentSnapshot {
  const startPath = buildTinaStartPathAssessment(draft);
  const entityAmbiguity = buildTinaEntityAmbiguityResolver(draft);
  const ownershipTimeline = buildTinaOwnershipTimeline(draft);
  const leadingLaneId =
    entityAmbiguity.hypotheses.find((hypothesis) => hypothesis.status === "leading")?.laneId ??
    startPath.recommendation.laneId;
  const reasons = [...startPath.recommendation.reasons];
  const questions: TinaEntityJudgmentQuestion[] = [];

  if (startPath.hintedLanes.length > 0) {
    reasons.push(`Paper hints currently point to: ${formatTinaLaneList(startPath.hintedLanes)}.`);
  }
  reasons.push(ownershipTimeline.summary);
  reasons.push(entityAmbiguity.summary);

  ownershipTimeline.events
    .filter((event) => event.status !== "known")
    .forEach((event) => {
      questions.push(
        buildQuestion({
          id: `ownership-${event.id}`,
          title: event.title,
          summary: event.summary,
          severity: event.status === "needs_proof" ? "blocking" : "needs_attention",
          relatedFactIds: event.relatedFactIds,
          relatedDocumentIds: event.relatedDocumentIds,
        })
      );
    });

  startPath.proofRequirements
    .filter((requirement) => requirement.status === "needed")
    .forEach((requirement) => {
      questions.push(
        buildQuestion({
          id: `proof-${requirement.id}`,
          title: `${requirement.label} still needs judgment`,
          summary: requirement.reason,
          severity: requirement.priority === "required" ? "blocking" : "needs_attention",
          relatedFactIds: requirement.relatedFactIds,
          relatedDocumentIds: requirement.relatedDocumentIds,
        })
      );
    });

  startPath.blockingReasons.forEach((reason, index) => {
    questions.push(
      buildQuestion({
        id: `blocking-${index + 1}`,
        title: "Entity treatment is still blocked",
        summary: reason,
        severity: "blocking",
        relatedFactIds: startPath.relatedFactIds,
        relatedDocumentIds: startPath.relatedDocumentIds,
      })
    );
  });

  startPath.reviewReasons.forEach((reason, index) => {
    questions.push(
      buildQuestion({
        id: `review-${index + 1}`,
        title: "Entity treatment still needs reviewer judgment",
        summary: reason,
        severity: "needs_attention",
        relatedFactIds: startPath.relatedFactIds,
        relatedDocumentIds: startPath.relatedDocumentIds,
      })
    );
  });

  entityAmbiguity.priorityQuestions.forEach((question, index) => {
    questions.push(
      buildQuestion({
        id: `ambiguity-${index + 1}`,
        title:
          entityAmbiguity.overallStatus === "blocked"
            ? "Entity route is still blocked by ambiguity"
            : "Entity route still has a competing-path question",
        summary: question,
        severity:
          entityAmbiguity.overallStatus === "blocked"
            ? "blocking"
            : "needs_attention",
        relatedFactIds: entityAmbiguity.signals.flatMap((signal) => signal.relatedFactIds),
        relatedDocumentIds: entityAmbiguity.signals.flatMap(
          (signal) => signal.relatedDocumentIds
        ),
      })
    );
  });

  let judgmentStatus: TinaEntityJudgmentSnapshot["judgmentStatus"];
  if (
    startPath.route === "supported" &&
    startPath.recommendation.support === "supported" &&
    entityAmbiguity.overallStatus === "stable_route"
  ) {
    judgmentStatus = "clear_supported";
  } else if (startPath.route === "blocked" || entityAmbiguity.overallStatus === "blocked") {
    judgmentStatus = "blocked";
  } else if (
    startPath.recommendation.support === "future" &&
    entityAmbiguity.overallStatus === "stable_route"
  ) {
    judgmentStatus = "clear_but_unsupported";
  } else {
    judgmentStatus = "review_required";
  }

  const blockingCount = questions.filter((question) => question.severity === "blocking").length;
  const attentionCount = questions.filter(
    (question) => question.severity === "needs_attention"
  ).length;

  let summary = "Tina has not formed a strong entity-treatment judgment yet.";
  let nextStep =
    "Keep collecting ownership, election, and prior-return evidence until Tina can defend the entity treatment cleanly.";

  if (judgmentStatus === "clear_supported") {
    summary = "Tina sees a clean supported entity treatment and does not currently need to reroute the file.";
    nextStep = "Keep building the supported lane, but preserve the evidence trail for reviewer confirmation.";
  } else if (judgmentStatus === "clear_but_unsupported") {
    summary =
      "Tina sees a likely entity treatment with reasonable clarity, but that return lane is not first-class built yet.";
    nextStep =
      "Hold the likely treatment visible for the reviewer and avoid pretending Tina can finish that return type automatically.";
  } else if (judgmentStatus === "review_required") {
    summary = `Tina sees a likely entity treatment, but ${attentionCount} reviewer judgment point${
      attentionCount === 1 ? "" : "s"
    } still need to be resolved.`;
    nextStep =
      "Resolve the reviewer-judgment questions before trusting the treatment enough to optimize the return.";
  } else if (judgmentStatus === "blocked") {
    summary = `Tina still sees ${blockingCount} blocking entity-treatment question${
      blockingCount === 1 ? "" : "s"
    } and should not let prep continue as if the path were settled.`;
    nextStep =
      "Clear the blocking entity-treatment questions first so Tina does not build downstream work on the wrong tax posture.";
  }

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    judgmentStatus,
    laneId: leadingLaneId,
    likelyFederalTreatment: describeFederalTreatment(leadingLaneId),
    summary,
    nextStep,
    reasons,
    questions: questions.filter(
      (question, index) => questions.findIndex((candidate) => candidate.id === question.id) === index
    ),
  };
}
