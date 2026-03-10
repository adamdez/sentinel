import type { SellerTimeline } from "@/lib/types";

export type QualificationScoreState = {
  motivationLevel: number | null;
  sellerTimeline: SellerTimeline | null;
  conditionLevel: number | null;
  occupancyScore: number | null;
  equityFlexibilityScore: number | null;
  decisionMakerConfirmed: boolean;
  priceExpectation: number | null;
  estimatedValue: number | null;
};

export type QualificationScorePatch = Partial<QualificationScoreState>;

const TIMELINE_SCORE_MAP: Record<SellerTimeline, number> = {
  immediate: 5,
  "30_days": 4,
  "60_days": 3,
  flexible: 2,
  unknown: 1,
};

function computePriceRealismScore(priceExpectation: number | null, estimatedValue: number | null): number {
  if (priceExpectation == null || estimatedValue == null || estimatedValue <= 0) {
    return 3;
  }

  const ratio = Number(priceExpectation) / Number(estimatedValue);
  if (ratio <= 0.65) return 5;
  if (ratio <= 0.8) return 4;
  if (ratio <= 0.95) return 3;
  if (ratio <= 1.1) return 2;
  return 1;
}

export function mergeQualificationScoreState(
  current: QualificationScoreState,
  patch: QualificationScorePatch,
): QualificationScoreState {
  return {
    motivationLevel: patch.motivationLevel !== undefined ? patch.motivationLevel : current.motivationLevel,
    sellerTimeline: patch.sellerTimeline !== undefined ? patch.sellerTimeline : current.sellerTimeline,
    conditionLevel: patch.conditionLevel !== undefined ? patch.conditionLevel : current.conditionLevel,
    occupancyScore: patch.occupancyScore !== undefined ? patch.occupancyScore : current.occupancyScore,
    equityFlexibilityScore:
      patch.equityFlexibilityScore !== undefined ? patch.equityFlexibilityScore : current.equityFlexibilityScore,
    decisionMakerConfirmed:
      patch.decisionMakerConfirmed !== undefined ? patch.decisionMakerConfirmed : current.decisionMakerConfirmed,
    priceExpectation: patch.priceExpectation !== undefined ? patch.priceExpectation : current.priceExpectation,
    estimatedValue: patch.estimatedValue !== undefined ? patch.estimatedValue : current.estimatedValue,
  };
}

export function computeQualificationScoreTotal(state: QualificationScoreState): number | null {
  if (
    state.motivationLevel == null
    || state.sellerTimeline == null
    || state.conditionLevel == null
    || state.occupancyScore == null
    || state.equityFlexibilityScore == null
  ) {
    return null;
  }

  const timelineScore = TIMELINE_SCORE_MAP[state.sellerTimeline];
  const decisionMakerScore = state.decisionMakerConfirmed ? 5 : 2;
  const priceRealismScore = computePriceRealismScore(state.priceExpectation, state.estimatedValue);

  return (
    state.motivationLevel
    + timelineScore
    + state.conditionLevel
    + state.occupancyScore
    + decisionMakerScore
    + priceRealismScore
    + state.equityFlexibilityScore
  );
}

export function resolveQualificationTaskAssignee(input: {
  escalationReviewOnly: boolean;
  escalationTargetUserId?: string | null;
  effectiveAssignedTo: string | null;
  actorUserId: string;
}): { assignee: string } | { error: string } {
  if (input.escalationReviewOnly) {
    const escalationTarget = input.escalationTargetUserId?.trim();
    if (!escalationTarget) {
      return {
        error: "ESCALATION_TARGET_USER_ID is not configured. Escalation routing cannot proceed.",
      };
    }

    return { assignee: escalationTarget };
  }

  return { assignee: input.effectiveAssignedTo ?? input.actorUserId };
}
