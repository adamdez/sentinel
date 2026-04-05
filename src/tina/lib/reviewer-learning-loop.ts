import type {
  TinaReviewerLearningLesson,
  TinaReviewerLearningLoopSnapshot,
  TinaReviewerPolicyCandidate,
  TinaReviewerRegressionTarget,
  TinaReviewerLearningTheme,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaAuthorityPositionMatrix } from "@/tina/lib/authority-position-matrix";
import {
  buildTinaReviewerSignoffSnapshot,
  pickLatestTinaReviewerDecision,
} from "@/tina/lib/package-state";
import {
  inferTinaReviewerLearningTheme,
  TINA_REVIEWER_LEARNING_THEME_CONFIG,
} from "@/tina/lib/reviewer-learning-themes";
import type { TinaAuthorityWorkItem, TinaReviewerDecisionRecord, TinaWorkspaceDraft } from "@/tina/types";

const reviewerLearningLoopCache = new WeakMap<
  TinaWorkspaceDraft,
  TinaReviewerLearningLoopSnapshot
>();

function parseTimestamp(value: string | null | undefined): number {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function humanize(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function latestApprovedAfter(
  decisions: TinaReviewerDecisionRecord[],
  decision: TinaReviewerDecisionRecord
): TinaReviewerDecisionRecord | null {
  return (
    decisions.find(
      (candidate) =>
        candidate.decision === "approved" &&
        parseTimestamp(candidate.decidedAt) > parseTimestamp(decision.decidedAt)
    ) ?? null
  );
}

function buildDecisionLesson(args: {
  decision: TinaReviewerDecisionRecord;
  snapshotSummary: string | null;
  resolvedByApproval: boolean;
}): TinaReviewerLearningLesson {
  const theme = inferTinaReviewerLearningTheme(`${args.snapshotSummary ?? ""} ${args.decision.notes}`);
  const themeConfig = TINA_REVIEWER_LEARNING_THEME_CONFIG[theme];
  const anchored = args.decision.decision === "approved" || args.resolvedByApproval;

  return {
    id: `reviewer-learning-decision-${args.decision.id}`,
    source: "reviewer_decision",
    theme,
    status: anchored ? "anchored" : "queued",
    severity:
      args.decision.decision === "revoked"
        ? anchored
          ? "info"
          : "blocking"
        : args.decision.decision === "changes_requested"
          ? anchored
            ? "info"
            : "needs_attention"
          : "info",
    occurredAt: args.decision.decidedAt,
    title:
      args.decision.decision === "approved"
        ? `Reviewer anchored ${themeConfig.label}`
        : args.decision.decision === "changes_requested"
          ? anchored
            ? `Reviewer-forced ${themeConfig.label} lesson is now anchored`
            : `Reviewer requested a tighter rule for ${themeConfig.label}`
          : anchored
            ? `Revoked ${themeConfig.label} lesson is now anchored`
            : `Reviewer revoked trust in ${themeConfig.label}`,
    summary: args.decision.notes
      ? `${humanize(args.decision.decision)} on snapshot ${args.decision.snapshotId}. Notes: ${args.decision.notes}`
      : `${humanize(args.decision.decision)} on snapshot ${args.decision.snapshotId}.`,
    lesson: anchored
      ? `Preserve the reviewer-approved version of ${themeConfig.label} when the same fact pattern recurs.`
      : themeConfig.recommendedChange,
    confidenceImpact: anchored
      ? themeConfig.anchoredConfidenceImpact
      : themeConfig.queuedConfidenceImpact,
    ownerEngines: themeConfig.ownerEngines,
    relatedDecisionId: args.decision.id,
    relatedSnapshotId: args.decision.snapshotId,
    relatedAuthorityWorkIdeaIds: [],
  };
}

function buildAuthorityLesson(args: {
  item: TinaAuthorityWorkItem;
  matchedTitle: string;
}): TinaReviewerLearningLesson {
  const theme = inferTinaReviewerLearningTheme(
    `${args.matchedTitle} ${args.item.memo} ${args.item.reviewerNotes}`
  );
  const themeConfig = TINA_REVIEWER_LEARNING_THEME_CONFIG[theme];
  const anchored = args.item.reviewerDecision === "use_it";

  return {
    id: `reviewer-learning-authority-${args.item.ideaId}`,
    source: "authority_review",
    theme,
    status: anchored ? "anchored" : "queued",
    severity:
      args.item.reviewerDecision === "do_not_use"
        ? "blocking"
        : args.item.reviewerDecision === "need_more_support"
          ? "needs_attention"
          : "info",
    occurredAt:
      args.item.updatedAt ?? args.item.lastAiRunAt ?? new Date().toISOString(),
    title:
      args.item.reviewerDecision === "use_it"
        ? `Reviewer approved authority posture for ${args.matchedTitle}`
        : args.item.reviewerDecision === "need_more_support"
          ? `Reviewer wants stronger authority support for ${args.matchedTitle}`
          : `Reviewer rejected the authority posture for ${args.matchedTitle}`,
    summary:
      args.item.reviewerNotes ||
      args.item.memo ||
      `${humanize(args.item.reviewerDecision)} on authority work ${args.item.ideaId}.`,
    lesson: anchored
      ? `Preserve the reviewer-approved authority posture for ${args.matchedTitle} when the facts match.`
      : themeConfig.recommendedChange,
    confidenceImpact: anchored
      ? themeConfig.anchoredConfidenceImpact
      : themeConfig.queuedConfidenceImpact,
    ownerEngines: unique([
      ...themeConfig.ownerEngines,
      "authority-position-matrix",
      "tax-planning-memo",
    ]),
    relatedDecisionId: null,
    relatedSnapshotId: null,
    relatedAuthorityWorkIdeaIds: [args.item.ideaId],
  };
}

function buildDriftLesson(
  decidedAt: string,
  snapshotId: string | null
): TinaReviewerLearningLesson {
  const theme = "snapshot_drift";
  const themeConfig = TINA_REVIEWER_LEARNING_THEME_CONFIG[theme];

  return {
    id: `reviewer-learning-drift-${snapshotId ?? "live"}`,
    source: "signoff_drift",
    theme,
    status: "queued",
    severity: "needs_attention",
    occurredAt: decidedAt,
    title: "Reviewer anchor drifted after signoff",
    summary:
      "The live package changed after reviewer approval, so Tina should preserve that drift as a reusable governance lesson.",
    lesson: themeConfig.recommendedChange,
    confidenceImpact: themeConfig.queuedConfidenceImpact,
    ownerEngines: themeConfig.ownerEngines,
    relatedDecisionId: null,
    relatedSnapshotId: snapshotId,
    relatedAuthorityWorkIdeaIds: [],
  };
}

function buildPolicyCandidate(
  theme: TinaReviewerLearningTheme,
  lessons: TinaReviewerLearningLesson[]
): TinaReviewerPolicyCandidate {
  const themeConfig = TINA_REVIEWER_LEARNING_THEME_CONFIG[theme];
  const blockingCount = lessons.filter((lesson) => lesson.severity === "blocking").length;
  const priority: TinaReviewerPolicyCandidate["priority"] =
    blockingCount > 0 || theme === "snapshot_drift"
      ? "high"
      : lessons.length > 1
        ? "medium"
        : "low";

  return {
    id: `reviewer-policy-${theme}`,
    theme,
    title: `Policy update: ${humanize(themeConfig.label)}`,
    priority,
    summary: `${lessons.length} reviewer learning event${lessons.length === 1 ? "" : "s"} suggest Tina should tighten ${themeConfig.label}.`,
    recommendedChange: themeConfig.recommendedChange,
    ownerEngines: unique(lessons.flatMap((lesson) => lesson.ownerEngines)),
    triggeredByLessonIds: lessons.map((lesson) => lesson.id),
  };
}

function buildRegressionTarget(
  theme: TinaReviewerLearningTheme,
  lessons: TinaReviewerLearningLesson[]
): TinaReviewerRegressionTarget {
  const themeConfig = TINA_REVIEWER_LEARNING_THEME_CONFIG[theme];
  const anchoredCount = lessons.filter((lesson) => lesson.status === "anchored").length;
  const queuedCount = lessons.filter((lesson) => lesson.status === "queued").length;
  const status: TinaReviewerRegressionTarget["status"] = themeConfig.fixtureId
    ? "existing_fixture"
    : "new_fixture_needed";

  return {
    id: `reviewer-regression-${theme}`,
    theme,
    title: `Regression target: ${humanize(themeConfig.label)}`,
    status,
    fixtureId: themeConfig.fixtureId,
    summary:
      queuedCount > 0
        ? `${queuedCount} queued lesson${queuedCount === 1 ? "" : "s"} should harden this behavior in regression coverage.`
        : `${anchoredCount} anchored lesson${anchoredCount === 1 ? "" : "s"} should stay protected in regression coverage.`,
    targetBehavior:
      queuedCount > 0
        ? themeConfig.queuedTargetBehavior
        : themeConfig.anchoredTargetBehavior,
    ownerEngines: unique(lessons.flatMap((lesson) => lesson.ownerEngines)),
    triggeredByLessonIds: lessons.map((lesson) => lesson.id),
  };
}

export function buildTinaReviewerLearningLoop(
  draft: TinaWorkspaceDraft
): TinaReviewerLearningLoopSnapshot {
  const cached = reviewerLearningLoopCache.get(draft);
  if (cached) {
    return cached;
  }

  const reviewerSignoff = buildTinaReviewerSignoffSnapshot(draft);
  const hasReviewedAuthorityWork = draft.authorityWork.some(
    (item) => item.reviewerDecision !== "pending"
  );
  const hasReviewerDecisions = draft.reviewerDecisions.length > 0;
  const hasDrift = reviewerSignoff.hasDriftSinceSignoff;

  if (!hasReviewedAuthorityWork && !hasReviewerDecisions && !hasDrift) {
    const emptySnapshot: TinaReviewerLearningLoopSnapshot = {
      lastBuiltAt: new Date().toISOString(),
      status: "complete",
      overallStatus: "stable",
      summary: "Tina does not have reviewer learning events to absorb yet.",
      nextStep: "Preserve reviewer overrides when they appear so Tina can convert them into policy and regression coverage.",
      activeLessonCount: 0,
      anchoredLessonCount: 0,
      policyCandidateCount: 0,
      regressionTargetCount: 0,
      lessons: [],
      policyCandidates: [],
      regressionTargets: [],
    };
    reviewerLearningLoopCache.set(draft, emptySnapshot);
    return emptySnapshot;
  }

  const authorityPositionMatrix = hasReviewedAuthorityWork
    ? buildTinaAuthorityPositionMatrix(draft)
    : null;
  const latestDecision = hasReviewerDecisions
    ? pickLatestTinaReviewerDecision(draft.reviewerDecisions)
    : null;
  const snapshotSummaryById = hasReviewerDecisions
    ? new Map(draft.packageSnapshots.map((snapshot) => [snapshot.id, snapshot.summary] as const))
    : new Map<string, string>();
  const authorityTitleByIdeaId = new Map<string, string>();

  authorityPositionMatrix?.items.forEach((item) => {
    item.relatedAuthorityWorkIdeaIds.forEach((ideaId) => {
      if (!authorityTitleByIdeaId.has(ideaId)) {
        authorityTitleByIdeaId.set(ideaId, item.title);
      }
    });
  });

  const sortedDecisions = hasReviewerDecisions
    ? [...draft.reviewerDecisions].sort(
        (left, right) => parseTimestamp(right.decidedAt) - parseTimestamp(left.decidedAt)
      )
    : [];
  const lessons: TinaReviewerLearningLesson[] = [];

  if (reviewerSignoff.hasDriftSinceSignoff) {
    lessons.push(
      buildDriftLesson(
        reviewerSignoff.lastEvaluatedAt ?? new Date().toISOString(),
        reviewerSignoff.activeSnapshotId
      )
    );
  }

  sortedDecisions.forEach((decision) => {
    const resolvedByApproval = Boolean(
      decision.decision !== "approved" && latestApprovedAfter(sortedDecisions, decision)
    );
    lessons.push(
      buildDecisionLesson({
        decision,
        snapshotSummary: snapshotSummaryById.get(decision.snapshotId) ?? null,
        resolvedByApproval,
      })
    );
  });

  draft.authorityWork
    .filter((item) => item.reviewerDecision !== "pending")
    .forEach((item) => {
      lessons.push(
        buildAuthorityLesson({
          item,
          matchedTitle: authorityTitleByIdeaId.get(item.ideaId) ?? humanize(item.ideaId),
        })
      );
    });

  lessons.sort(
    (left, right) => parseTimestamp(right.occurredAt) - parseTimestamp(left.occurredAt)
  );

  const activeLessons = lessons.filter((lesson) => lesson.status === "queued");
  const anchoredLessons = lessons.filter((lesson) => lesson.status === "anchored");
  const queuedByTheme = new Map<TinaReviewerLearningTheme, TinaReviewerLearningLesson[]>();
  const allByTheme = new Map<TinaReviewerLearningTheme, TinaReviewerLearningLesson[]>();

  lessons.forEach((lesson) => {
    const existingAll = allByTheme.get(lesson.theme) ?? [];
    existingAll.push(lesson);
    allByTheme.set(lesson.theme, existingAll);

    if (lesson.status === "queued") {
      const existingQueued = queuedByTheme.get(lesson.theme) ?? [];
      existingQueued.push(lesson);
      queuedByTheme.set(lesson.theme, existingQueued);
    }
  });

  const policyCandidates = Array.from(queuedByTheme.entries()).map(([theme, themeLessons]) =>
    buildPolicyCandidate(theme, themeLessons)
  );
  const regressionTargets = Array.from(allByTheme.entries()).map(([theme, themeLessons]) =>
    buildRegressionTarget(theme, themeLessons)
  );

  const highPriorityPolicyCount = policyCandidates.filter(
    (candidate) => candidate.priority === "high"
  ).length;
  const overallStatus: TinaReviewerLearningLoopSnapshot["overallStatus"] =
    highPriorityPolicyCount > 0
      ? "policy_update_required"
      : activeLessons.length > 0
        ? "active_learning"
        : "stable";

  const snapshot: TinaReviewerLearningLoopSnapshot = {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    overallStatus,
    summary:
      overallStatus === "stable"
        ? lessons.length > 0
          ? "Tina has reviewer lessons anchored and protected without an active policy queue."
          : "Tina does not have reviewer learning events to absorb yet."
        : overallStatus === "active_learning"
          ? "Tina has reviewer lessons queued for reuse, but none are severe enough to demand an immediate policy rewrite."
          : "Tina has reviewer lessons that should become explicit policy and regression updates before confidence language widens again.",
    nextStep:
      overallStatus === "stable"
        ? "Preserve the anchored reviewer lessons in regression coverage as Tina expands."
        : overallStatus === "active_learning"
          ? "Absorb the queued reviewer lessons into policy and regression coverage before the next confidence-widening pass."
          : "Promote the high-priority reviewer lessons into policy changes and regression fixtures immediately.",
    activeLessonCount: activeLessons.length,
    anchoredLessonCount: anchoredLessons.length,
    policyCandidateCount: policyCandidates.length,
    regressionTargetCount: regressionTargets.length,
    lessons,
    policyCandidates,
    regressionTargets,
  };

  reviewerLearningLoopCache.set(draft, snapshot);
  return snapshot;
}
