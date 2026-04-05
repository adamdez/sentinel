import type {
  TinaReviewerAcceptanceDelta,
  TinaReviewerAcceptanceDeltaSeverity,
  TinaReviewerAcceptanceDeltaStatus,
  TinaReviewerLearningLesson,
  TinaReviewerLearningTheme,
  TinaReviewerOverrideGovernanceItem,
  TinaReviewerOverrideGovernanceItemStatus,
  TinaReviewerOverrideGovernancePriority,
  TinaReviewerOverrideGovernanceSnapshot,
  TinaReviewerOverridePolicyState,
  TinaReviewerOverrideScope,
  TinaReviewerOverrideTrustBoundary,
} from "@/tina/lib/acceleration-contracts";
import {
  buildTinaReviewerSignoffSnapshot,
  pickLatestTinaReviewerDecision,
} from "@/tina/lib/package-state";
import { buildTinaReviewerLearningLoop } from "@/tina/lib/reviewer-learning-loop";
import { buildTinaReviewerObservedDeltas } from "@/tina/lib/reviewer-observed-deltas";
import { TINA_REVIEWER_THEME_BENCHMARK_SCENARIOS } from "@/tina/lib/reviewer-learning-themes";
import type { TinaAuthorityWorkItem, TinaReviewerDecisionRecord, TinaWorkspaceDraft } from "@/tina/types";

const reviewerOverrideGovernanceCache = new WeakMap<
  TinaWorkspaceDraft,
  TinaReviewerOverrideGovernanceSnapshot
>();

function parseTimestamp(value: string | null | undefined): number {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function addDays(value: string, days: number): string | null {
  const base = parseTimestamp(value);
  if (!base) {
    return null;
  }

  return new Date(base + days * 24 * 60 * 60 * 1000).toISOString();
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

const THEME_SCOPE_MAP: Record<TinaReviewerLearningTheme, TinaReviewerOverrideScope> = {
  ownership_transition: "entity_route",
  sales_tax_authority: "treatment_authority",
  depreciation_assets: "form_execution",
  inventory_cogs: "evidence_books",
  worker_classification: "treatment_authority",
  related_party: "treatment_authority",
  mixed_use: "evidence_books",
  snapshot_drift: "workflow_governance",
  unknown_route: "entity_route",
  general_review_control: "planning",
};

const THEME_PRIORITY_MAP: Record<TinaReviewerLearningTheme, TinaReviewerOverrideGovernancePriority> = {
  ownership_transition: "high",
  sales_tax_authority: "high",
  depreciation_assets: "medium",
  inventory_cogs: "medium",
  worker_classification: "high",
  related_party: "medium",
  mixed_use: "medium",
  snapshot_drift: "high",
  unknown_route: "high",
  general_review_control: "low",
};

function findLessonForDecision(
  lessons: TinaReviewerLearningLesson[],
  decisionId: string
): TinaReviewerLearningLesson | null {
  return lessons.find((lesson) => lesson.relatedDecisionId === decisionId) ?? null;
}

function findLessonForAuthorityWork(
  lessons: TinaReviewerLearningLesson[],
  ideaId: string
): TinaReviewerLearningLesson | null {
  return lessons.find((lesson) => lesson.relatedAuthorityWorkIdeaIds.includes(ideaId)) ?? null;
}

function resolvePolicyState(args: {
  theme: TinaReviewerLearningTheme;
  lesson: TinaReviewerLearningLesson | null;
  policyCandidateIds: string[];
  anchoredThemeCount: number;
}): TinaReviewerOverridePolicyState {
  if (
    args.lesson?.status === "anchored" ||
    args.anchoredThemeCount > 0
  ) {
    return "anchored";
  }

  if (args.policyCandidateIds.length > 0) {
    return "candidate";
  }

  return "unmodeled";
}

function resolveTrustBoundary(args: {
  status: TinaReviewerOverrideGovernanceItemStatus;
  policyState: TinaReviewerOverridePolicyState;
}): TinaReviewerOverrideTrustBoundary {
  if (args.status === "open") {
    return "reviewer_controlled";
  }

  if (args.policyState === "anchored") {
    return "bounded_reuse";
  }

  return "superseded";
}

function resolveRequiredAction(args: {
  theme: TinaReviewerLearningTheme;
  status: TinaReviewerOverrideGovernanceItemStatus;
  policyState: TinaReviewerOverridePolicyState;
}): string {
  const themeLabel = titleCase(args.theme);
  if (args.status === "open") {
    return `Keep ${themeLabel.toLowerCase()} under reviewer control until the override is absorbed into policy or explicitly cleared.`;
  }

  if (args.policyState === "candidate") {
    return `Promote the ${themeLabel.toLowerCase()} lesson into explicit policy and regression coverage before widening Tina's certainty.`;
  }

  if (args.policyState === "anchored") {
    return `Preserve the anchored ${themeLabel.toLowerCase()} lesson as bounded reusable policy.`;
  }

  return `Retain the ${themeLabel.toLowerCase()} override as traced reviewer history until a stronger policy anchor exists.`;
}

function buildGovernanceItem(args: {
  decision: TinaReviewerDecisionRecord;
  lesson: TinaReviewerLearningLesson | null;
  policyCandidateIds: string[];
  regressionTargetIds: string[];
  anchoredThemeCount: number;
  resolvedByApproval: boolean;
}): TinaReviewerOverrideGovernanceItem {
  const theme = args.lesson?.theme ?? "general_review_control";
  const status: TinaReviewerOverrideGovernanceItemStatus = !args.resolvedByApproval
    ? "open"
    : args.lesson?.status === "anchored" || args.anchoredThemeCount > 0
      ? "anchored"
      : "resolved";
  const policyState = resolvePolicyState({
    theme,
    lesson: args.lesson,
    policyCandidateIds: args.policyCandidateIds,
    anchoredThemeCount: args.anchoredThemeCount,
  });
  const priority =
    args.decision.decision === "revoked"
      ? "high"
      : THEME_PRIORITY_MAP[theme];

  return {
    id: `reviewer-override-governance-${args.decision.id}`,
    title:
      args.decision.decision === "changes_requested"
        ? `Reviewer change request: ${titleCase(theme)}`
        : `Reviewer revocation: ${titleCase(theme)}`,
    theme,
    scope: THEME_SCOPE_MAP[theme],
    status,
    policyState,
    trustBoundary: resolveTrustBoundary({ status, policyState }),
    priority,
    reviewerName: args.decision.reviewerName,
    decidedAt: args.decision.decidedAt,
    reviewByAt: addDays(
      args.decision.decidedAt,
      priority === "high" ? 14 : priority === "medium" ? 30 : 60
    ),
    summary:
      args.decision.notes.trim().length > 0
        ? args.decision.notes
        : `${args.decision.reviewerName} marked snapshot ${args.decision.snapshotId} as ${titleCase(
            args.decision.decision
          ).toLowerCase()}.`,
    requiredAction: resolveRequiredAction({
      theme,
      status,
      policyState,
    }),
    ownerEngines: unique(args.lesson?.ownerEngines ?? ["reviewer-learning-loop"]),
    relatedDecisionId: args.decision.id,
    relatedSnapshotId: args.decision.snapshotId,
    relatedPolicyCandidateIds: args.policyCandidateIds,
    relatedRegressionTargetIds: args.regressionTargetIds,
    benchmarkScenarioIds: TINA_REVIEWER_THEME_BENCHMARK_SCENARIOS[theme],
  };
}

function buildDecisionAcceptanceDelta(args: {
  decision: TinaReviewerDecisionRecord;
  lesson: TinaReviewerLearningLesson | null;
  signoffDrift: boolean;
  isLatestDecision: boolean;
  resolvedByApproval: boolean;
}): TinaReviewerAcceptanceDelta {
  const theme = args.lesson?.theme ?? "general_review_control";
  let status: TinaReviewerAcceptanceDeltaStatus;
  let severity: TinaReviewerAcceptanceDeltaSeverity;

  if (
    args.decision.decision === "approved" &&
    args.signoffDrift &&
    args.isLatestDecision
  ) {
    status = "stale";
    severity = "blocking";
  } else if (args.resolvedByApproval) {
    status = "accepted";
    severity = "info";
  } else if (args.decision.decision === "approved") {
    status = "accepted";
    severity = "info";
  } else if (args.decision.decision === "changes_requested") {
    status = "adjusted";
    severity = "needs_attention";
  } else {
    status = "rejected";
    severity = "blocking";
  }

  return {
    id: `reviewer-acceptance-delta-decision-${args.decision.id}`,
    title:
      status === "accepted"
        ? args.resolvedByApproval
          ? `Reviewer absorbed prior ${titleCase(theme)} override`
          : `Reviewer accepted ${titleCase(theme)} posture`
        : status === "stale"
          ? `Reviewer anchor for ${titleCase(theme)} is stale`
          : status === "adjusted"
            ? `Reviewer adjusted ${titleCase(theme)} posture`
            : `Reviewer rejected ${titleCase(theme)} posture`,
    theme,
    status,
    severity,
    occurredAt: args.decision.decidedAt,
    reviewerName: args.decision.reviewerName,
    summary:
      args.decision.notes.trim().length > 0
        ? args.decision.notes
        : `${args.decision.reviewerName} marked snapshot ${args.decision.snapshotId} as ${args.decision.decision.replace(
            /_/g,
            " "
          )}.`,
    consequence:
      status === "accepted"
        ? args.resolvedByApproval
          ? "The prior reviewer adjustment has been absorbed into an anchored pattern, so Tina can treat it as bounded reusable history."
          : "Tina can preserve this reviewed pattern as a bounded acceptance anchor while the facts stay matched."
        : status === "stale"
          ? "Reviewer acceptance should not be treated as current until Tina captures a fresh snapshot and re-runs signoff."
          : status === "adjusted"
            ? "Keep the affected posture reviewer-controlled until Tina absorbs the reviewer adjustment into explicit policy."
            : "Fail closed and hold the affected posture behind reviewer control until Tina has a replacement treatment or route.",
    ownerEngines: unique(args.lesson?.ownerEngines ?? ["reviewer-learning-loop"]),
    relatedDecisionId: args.decision.id,
    relatedSnapshotId: args.decision.snapshotId,
    benchmarkScenarioIds: TINA_REVIEWER_THEME_BENCHMARK_SCENARIOS[theme],
  };
}

function buildAuthorityAcceptanceDelta(
  item: TinaAuthorityWorkItem,
  lesson: TinaReviewerLearningLesson | null
): TinaReviewerAcceptanceDelta | null {
  if (item.reviewerDecision === "pending") {
    return null;
  }

  const theme = lesson?.theme ?? "general_review_control";
  const status: TinaReviewerAcceptanceDeltaStatus =
    item.reviewerDecision === "use_it"
      ? "accepted"
      : item.reviewerDecision === "need_more_support"
        ? "adjusted"
        : "rejected";
  const severity: TinaReviewerAcceptanceDeltaSeverity =
    status === "accepted"
      ? "info"
      : status === "adjusted"
        ? "needs_attention"
        : "blocking";

  return {
    id: `reviewer-acceptance-delta-authority-${item.ideaId}`,
    title:
      status === "accepted"
        ? `Reviewer accepted authority posture for ${titleCase(theme)}`
        : status === "adjusted"
          ? `Reviewer wants stronger authority support for ${titleCase(theme)}`
          : `Reviewer rejected authority posture for ${titleCase(theme)}`,
    theme,
    status,
    severity,
    occurredAt: item.updatedAt ?? item.lastAiRunAt ?? new Date().toISOString(),
    reviewerName: null,
    summary: item.reviewerNotes || item.memo || titleCase(item.reviewerDecision),
    consequence:
      status === "accepted"
        ? "Tina can preserve the approved authority posture as a bounded reusable pattern when the facts match."
        : status === "adjusted"
          ? "Do not promote the planning or treatment claim until authority support is stronger."
          : "Do not use this authority posture in the current or matching future files without a new reviewer-backed basis.",
    ownerEngines: unique(argsOrFallback(lesson?.ownerEngines, [
      "authority-position-matrix",
      "tax-planning-memo",
      "reviewer-learning-loop",
    ])),
    relatedDecisionId: null,
    relatedSnapshotId: null,
    benchmarkScenarioIds: TINA_REVIEWER_THEME_BENCHMARK_SCENARIOS[theme],
  };
}

function buildObservedAcceptanceDelta(
  item: ReturnType<typeof buildTinaReviewerObservedDeltas>["items"][number]
): TinaReviewerAcceptanceDelta {
  return {
    id: `reviewer-acceptance-delta-observed-${item.id}`,
    title: item.title,
    theme: item.theme,
    status:
      item.kind === "change_requested"
        ? "adjusted"
        : item.kind === "rejected"
          ? "rejected"
          : item.kind === "stale_after_acceptance"
            ? "stale"
            : "accepted",
    severity: item.severity,
    occurredAt: item.occurredAt,
    reviewerName: item.reviewerName,
    summary: item.summary,
    consequence: item.trustEffect,
    ownerEngines: item.ownerEngines,
    relatedDecisionId: item.relatedDecisionId,
    relatedSnapshotId: item.relatedSnapshotId,
    benchmarkScenarioIds: item.benchmarkScenarioIds,
  };
}

function argsOrFallback(value: string[] | undefined, fallback: string[]): string[] {
  return value && value.length > 0 ? value : fallback;
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

export function buildTinaReviewerOverrideGovernance(
  draft: TinaWorkspaceDraft
): TinaReviewerOverrideGovernanceSnapshot {
  const cached = reviewerOverrideGovernanceCache.get(draft);
  if (cached) {
    return cached;
  }

  const reviewerLearningLoop = buildTinaReviewerLearningLoop(draft);
  const reviewerObservedDeltas = buildTinaReviewerObservedDeltas(draft);
  const reviewerSignoff = buildTinaReviewerSignoffSnapshot(draft);
  const latestDecision = pickLatestTinaReviewerDecision(draft.reviewerDecisions);
  const sortedDecisions = [...draft.reviewerDecisions].sort(
    (left, right) => parseTimestamp(right.decidedAt) - parseTimestamp(left.decidedAt)
  );
  const lessons = reviewerLearningLoop.lessons;
  const policyCandidatesByTheme = new Map<TinaReviewerLearningTheme, string[]>();
  const regressionTargetsByTheme = new Map<TinaReviewerLearningTheme, string[]>();
  const anchoredLessonCountByTheme = new Map<TinaReviewerLearningTheme, number>();

  reviewerLearningLoop.policyCandidates.forEach((candidate) => {
    const existing = policyCandidatesByTheme.get(candidate.theme) ?? [];
    existing.push(candidate.id);
    policyCandidatesByTheme.set(candidate.theme, existing);
  });

  reviewerLearningLoop.regressionTargets.forEach((target) => {
    const existing = regressionTargetsByTheme.get(target.theme) ?? [];
    existing.push(target.id);
    regressionTargetsByTheme.set(target.theme, existing);
  });

  reviewerLearningLoop.lessons
    .filter((lesson) => lesson.status === "anchored")
    .forEach((lesson) => {
      anchoredLessonCountByTheme.set(
        lesson.theme,
        (anchoredLessonCountByTheme.get(lesson.theme) ?? 0) + 1
      );
    });
  const observedDecisionIds = new Set(
    reviewerObservedDeltas.items
      .flatMap((item) => (item.relatedDecisionId ? [item.relatedDecisionId] : []))
  );
  const observedAuthorityIdeaIds = new Set(
    reviewerObservedDeltas.items
      .flatMap((item) =>
        item.relatedAuthorityWorkIdeaId ? [item.relatedAuthorityWorkIdeaId] : []
      )
  );

  const items = sortedDecisions
    .filter(
      (decision) =>
        decision.decision === "changes_requested" || decision.decision === "revoked"
    )
    .map((decision) => {
      const lesson = findLessonForDecision(lessons, decision.id);
      const theme = lesson?.theme ?? "general_review_control";
      return buildGovernanceItem({
        decision,
        lesson,
        policyCandidateIds: policyCandidatesByTheme.get(theme) ?? [],
        regressionTargetIds: regressionTargetsByTheme.get(theme) ?? [],
        anchoredThemeCount: anchoredLessonCountByTheme.get(theme) ?? 0,
        resolvedByApproval: Boolean(latestApprovedAfter(sortedDecisions, decision)),
      });
    });

  const acceptanceDeltas: TinaReviewerAcceptanceDelta[] = [
    ...reviewerObservedDeltas.items.map((item) => buildObservedAcceptanceDelta(item)),
    ...sortedDecisions
      .filter((decision) => !observedDecisionIds.has(decision.id))
      .map((decision) =>
      buildDecisionAcceptanceDelta({
        decision,
        lesson: findLessonForDecision(lessons, decision.id),
        signoffDrift: reviewerSignoff.hasDriftSinceSignoff,
        isLatestDecision: latestDecision?.id === decision.id,
        resolvedByApproval: Boolean(
          decision.decision !== "approved" && latestApprovedAfter(sortedDecisions, decision)
        ),
      })
      ),
    ...draft.authorityWork
      .filter((item) => !observedAuthorityIdeaIds.has(item.ideaId))
      .map((item) =>
        buildAuthorityAcceptanceDelta(item, findLessonForAuthorityWork(lessons, item.ideaId))
      )
      .filter((delta): delta is TinaReviewerAcceptanceDelta => delta !== null),
  ].sort((left, right) => parseTimestamp(right.occurredAt) - parseTimestamp(left.occurredAt));

  const openOverrideCount = items.filter((item) => item.status === "open").length;
  const anchoredOverrideCount = items.filter((item) => item.status === "anchored").length;
  const policyUpdateRequiredCount = items.filter(
    (item) =>
      item.status === "open" ||
      item.policyState === "candidate" ||
      item.policyState === "unmodeled"
  ).length;
  const fixtureGapCount = reviewerLearningLoop.regressionTargets.filter(
    (target) =>
      target.status === "new_fixture_needed" &&
      items.some((item) => item.relatedRegressionTargetIds.includes(target.id))
  ).length;
  const blockingAcceptanceDeltaCount = acceptanceDeltas.filter(
    (delta) => delta.severity === "blocking"
  ).length;
  const recommendedBenchmarkScenarioIds = unique([
    ...items.flatMap((item) => item.benchmarkScenarioIds),
    ...acceptanceDeltas.flatMap((delta) => delta.benchmarkScenarioIds),
  ]);
  const hasObservedReviewerPressure =
    reviewerObservedDeltas.overallStatus === "watch" ||
    reviewerObservedDeltas.items.some(
      (item) => item.kind === "accepted_after_adjustment"
    );

  const overallStatus: TinaReviewerOverrideGovernanceSnapshot["overallStatus"] =
    blockingAcceptanceDeltaCount > 0 ||
    policyUpdateRequiredCount > 0 ||
    reviewerSignoff.hasDriftSinceSignoff ||
    reviewerObservedDeltas.overallStatus === "policy_update_required" ||
    reviewerObservedDeltas.overallStatus === "regressing"
      ? "policy_update_required"
      : openOverrideCount > 0 ||
          acceptanceDeltas.some(
            (delta) => delta.status === "adjusted" || delta.status === "stale"
          ) ||
          hasObservedReviewerPressure
        ? "active_overrides"
        : "stable";

  const snapshot: TinaReviewerOverrideGovernanceSnapshot = {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    overallStatus,
    summary:
      overallStatus === "stable"
        ? "Reviewer overrides are either anchored or quiet, so Tina can treat reviewer governance as stable."
        : overallStatus === "active_overrides"
          ? "Reviewer overrides are still active, so Tina should keep some postures bounded and reviewer-controlled."
          : "Reviewer overrides and acceptance deltas still demand explicit policy or regression follow-through before Tina widens certainty.",
    nextStep:
      overallStatus === "stable"
        ? "Preserve the anchored override lessons and bounded reuse rules."
        : overallStatus === "active_overrides"
          ? "Clear the open override queue and absorb the remaining reviewer adjustments into policy."
          : "Promote the open override themes into policy, regression coverage, and fresh reviewer signoff before widening Tina's trust language.",
    openOverrideCount,
    anchoredOverrideCount,
    policyUpdateRequiredCount,
    fixtureGapCount,
    blockingAcceptanceDeltaCount,
    recommendedBenchmarkScenarioIds,
    items,
    acceptanceDeltas,
  };

  reviewerOverrideGovernanceCache.set(draft, snapshot);
  return snapshot;
}
