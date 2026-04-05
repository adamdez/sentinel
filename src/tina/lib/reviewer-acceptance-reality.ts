import { TINA_WEIRD_SMALL_BUSINESS_TOP_PRIORITY_IDS } from "@/tina/data/weird-small-business-scenarios";
import type {
  TinaReviewerAcceptanceDelta,
  TinaReviewerAcceptanceRealityItem,
  TinaReviewerAcceptanceRealityOutcome,
  TinaReviewerObservedDeltaItem,
  TinaReviewerAcceptanceRealitySnapshot,
  TinaReviewerLearningTheme,
  TinaReviewerOverrideGovernanceItem,
  TinaReviewerPolicyVersionTrack,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaReviewerObservedDeltas } from "@/tina/lib/reviewer-observed-deltas";
import { buildTinaReviewerOverrideGovernance } from "@/tina/lib/reviewer-override-governance";
import { buildTinaReviewerPolicyVersioning } from "@/tina/lib/reviewer-policy-versioning";
import type { TinaWorkspaceDraft } from "@/tina/types";

const reviewerAcceptanceRealityCache = new WeakMap<
  TinaWorkspaceDraft,
  TinaReviewerAcceptanceRealitySnapshot
>();

const topPriorityScenarioIdSet = new Set<string>(TINA_WEIRD_SMALL_BUSINESS_TOP_PRIORITY_IDS);

function parseTimestamp(value: string | null | undefined): number {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function pickOutcome(args: {
  observedItems: TinaReviewerObservedDeltaItem[];
  deltas: TinaReviewerAcceptanceDelta[];
  governanceItems: TinaReviewerOverrideGovernanceItem[];
  policyTrack: TinaReviewerPolicyVersionTrack | null;
}): TinaReviewerAcceptanceRealityOutcome {
  const sortedObservedItems = [...args.observedItems].sort(
    (left, right) => parseTimestamp(right.occurredAt) - parseTimestamp(left.occurredAt)
  );
  const latestObservedItem = sortedObservedItems[0] ?? null;

  if (latestObservedItem?.kind === "stale_after_acceptance") {
    return "stale_after_acceptance";
  }

  if (latestObservedItem?.kind === "rejected") {
    return "rejected";
  }

  if (latestObservedItem?.kind === "change_requested") {
    return "blocked_by_reviewer";
  }

  if (latestObservedItem?.kind === "accepted_after_adjustment") {
    return "accepted_after_adjustment";
  }

  if (latestObservedItem?.kind === "accepted_first_pass") {
    return "accepted_first_pass";
  }

  const sortedDeltas = [...args.deltas].sort(
    (left, right) => parseTimestamp(right.occurredAt) - parseTimestamp(left.occurredAt)
  );
  const latestDelta = sortedDeltas[0] ?? null;

  if (latestDelta?.status === "stale") {
    return "stale_after_acceptance";
  }

  if (latestDelta?.status === "rejected") {
    return "rejected";
  }

  if (latestDelta?.status === "adjusted") {
    return "blocked_by_reviewer";
  }

  if (latestDelta?.status === "accepted") {
    const hadEarlierReviewerResistance = sortedDeltas
      .slice(1)
      .some((delta) => delta.status === "adjusted" || delta.status === "rejected") ||
      args.governanceItems.some(
        (item) =>
          item.status === "anchored" || item.status === "resolved" || item.status === "open"
      );

    return hadEarlierReviewerResistance
      ? "accepted_after_adjustment"
      : "accepted_first_pass";
  }

  if (
    args.policyTrack &&
    (args.policyTrack.status === "active" ||
      args.policyTrack.status === "ready_to_promote" ||
      args.policyTrack.status === "benchmarking") &&
    !args.governanceItems.some((item) => item.status === "open")
  ) {
    const hadEarlierReviewerResistance =
      sortedDeltas.some((delta) => delta.status === "adjusted" || delta.status === "rejected") ||
      args.governanceItems.some((item) => item.status === "anchored");

    return hadEarlierReviewerResistance
      ? "accepted_after_adjustment"
      : "accepted_first_pass";
  }

  return args.governanceItems.some((item) => item.status === "open")
    ? "blocked_by_reviewer"
    : "accepted_first_pass";
}

function compareOutcomePriority(
  left: TinaReviewerAcceptanceRealityOutcome,
  right: TinaReviewerAcceptanceRealityOutcome
): number {
  const priority: Record<TinaReviewerAcceptanceRealityOutcome, number> = {
    stale_after_acceptance: 0,
    rejected: 1,
    blocked_by_reviewer: 2,
    accepted_after_adjustment: 3,
    accepted_first_pass: 4,
  };

  return priority[left] - priority[right];
}

function buildAcceptanceItem(args: {
  theme: TinaReviewerLearningTheme;
  observedItems: TinaReviewerObservedDeltaItem[];
  deltas: TinaReviewerAcceptanceDelta[];
  governanceItems: TinaReviewerOverrideGovernanceItem[];
  policyTrack: TinaReviewerPolicyVersionTrack | null;
}): TinaReviewerAcceptanceRealityItem {
  const sortedObservedItems = [...args.observedItems].sort(
    (left, right) => parseTimestamp(right.occurredAt) - parseTimestamp(left.occurredAt)
  );
  const sortedDeltas = [...args.deltas].sort(
    (left, right) => parseTimestamp(right.occurredAt) - parseTimestamp(left.occurredAt)
  );
  const latestObservedItem = sortedObservedItems[0] ?? null;
  const earliestObservedItem = sortedObservedItems[sortedObservedItems.length - 1] ?? null;
  const sortedGovernanceItems = [...args.governanceItems].sort(
    (left, right) => parseTimestamp(right.decidedAt) - parseTimestamp(left.decidedAt)
  );
  const latestDelta = sortedDeltas[0] ?? null;
  const earliestDelta = sortedDeltas[sortedDeltas.length - 1] ?? null;
  const latestGovernanceItem = sortedGovernanceItems[0] ?? null;
  const earliestGovernanceItem = sortedGovernanceItems[sortedGovernanceItems.length - 1] ?? null;
  const acceptedCount =
    sortedObservedItems.filter(
      (item) =>
        item.kind === "accepted_first_pass" || item.kind === "accepted_after_adjustment"
    ).length ||
    sortedDeltas.filter((delta) => delta.status === "accepted").length;
  const adjustedCount =
    sortedObservedItems.filter((item) => item.kind === "change_requested").length ||
    sortedDeltas.filter((delta) => delta.status === "adjusted").length;
  const rejectedCount =
    sortedObservedItems.filter((item) => item.kind === "rejected").length ||
    sortedDeltas.filter((delta) => delta.status === "rejected").length;
  const staleCount =
    sortedObservedItems.filter((item) => item.kind === "stale_after_acceptance").length ||
    sortedDeltas.filter((delta) => delta.status === "stale").length;
  const outcome = pickOutcome({
    observedItems: sortedObservedItems,
    deltas: sortedDeltas,
    governanceItems: sortedGovernanceItems,
    policyTrack: args.policyTrack,
  });
  const benchmarkScenarioIds = unique([
    ...(args.policyTrack?.benchmarkScenarioIds ?? []),
    ...sortedObservedItems.flatMap((item) => item.benchmarkScenarioIds),
    ...sortedDeltas.flatMap((delta) => delta.benchmarkScenarioIds),
    ...sortedGovernanceItems.flatMap((item) => item.benchmarkScenarioIds),
  ]);
  const topPriorityBenchmarkScenarioIds = benchmarkScenarioIds.filter((scenarioId) =>
    topPriorityScenarioIdSet.has(scenarioId)
  );
  const title =
    args.policyTrack?.title ??
    latestObservedItem?.title ??
    latestGovernanceItem?.title ??
    latestDelta?.title ??
    titleCase(args.theme);
  const firstObservedAt =
    earliestObservedItem?.occurredAt ??
    earliestDelta?.occurredAt ??
    earliestGovernanceItem?.decidedAt ??
    null;
  const lastObservedAt =
    latestObservedItem?.occurredAt ??
    latestDelta?.occurredAt ??
    latestGovernanceItem?.decidedAt ??
    null;
  const summary =
    outcome === "accepted_first_pass"
      ? "Reviewer acceptance is clean so far, with no recorded change-request cycle for this theme."
      : outcome === "accepted_after_adjustment"
        ? `Reviewer acceptance now exists, but only after ${adjustedCount + rejectedCount} earlier adjustment${adjustedCount + rejectedCount === 1 ? "" : "s"} or rejection${adjustedCount + rejectedCount === 1 ? "" : "s"}.`
        : outcome === "blocked_by_reviewer"
          ? "Reviewer adjustments are still open, so Tina should keep this theme under bounded reviewer control."
          : outcome === "rejected"
            ? "The latest reviewer-observed outcome for this theme is rejection, so Tina should fail closed."
            : "This theme was accepted before, but the current reviewer anchor is stale and should not be treated as current.";
  const nextStep =
    outcome === "accepted_first_pass"
      ? "Preserve this acceptance pattern as bounded reusable policy and keep its benchmark coverage green."
      : outcome === "accepted_after_adjustment"
        ? "Keep the accepted adjustment encoded in policy and regression coverage before widening certainty further."
        : outcome === "blocked_by_reviewer"
          ? "Resolve the open reviewer delta before Tina sounds fully reviewer-ready on this theme."
          : outcome === "rejected"
            ? "Replace or narrow the affected posture before Tina uses it again."
            : "Capture a fresh immutable snapshot and rerun reviewer signoff before reusing this acceptance anchor.";

  return {
    id: `reviewer-acceptance-reality-${args.theme}`,
    theme: args.theme,
    title,
    outcome,
    reviewerNames: unique([
      ...sortedObservedItems.flatMap((item) => (item.reviewerName ? [item.reviewerName] : [])),
      ...sortedDeltas.flatMap((delta) => (delta.reviewerName ? [delta.reviewerName] : [])),
      ...sortedGovernanceItems.flatMap((item) =>
        item.reviewerName ? [item.reviewerName] : []
      ),
    ]),
    firstObservedAt,
    lastObservedAt,
    summary,
    nextStep,
    ownerEngines: unique([
      ...sortedDeltas.flatMap((delta) => delta.ownerEngines),
      ...sortedGovernanceItems.flatMap((item) => item.ownerEngines),
      ...(args.policyTrack?.ownerEngines ?? []),
      "reviewer-acceptance-reality",
    ]),
    acceptedCount,
    adjustedCount,
    rejectedCount,
    staleCount,
    relatedDecisionIds: unique([
      ...sortedObservedItems.flatMap((item) =>
        item.relatedDecisionId ? [item.relatedDecisionId] : []
      ),
      ...sortedDeltas.flatMap((delta) => (delta.relatedDecisionId ? [delta.relatedDecisionId] : [])),
      ...sortedGovernanceItems.flatMap((item) =>
        item.relatedDecisionId ? [item.relatedDecisionId] : []
      ),
    ]),
    relatedSnapshotIds: unique([
      ...sortedDeltas.flatMap((delta) => (delta.relatedSnapshotId ? [delta.relatedSnapshotId] : [])),
      ...sortedGovernanceItems.flatMap((item) =>
        item.relatedSnapshotId ? [item.relatedSnapshotId] : []
      ),
      ...sortedObservedItems.flatMap((item) =>
        item.relatedSnapshotId ? [item.relatedSnapshotId] : []
      ),
    ]),
    relatedAcceptanceDeltaIds: sortedDeltas.map((delta) => delta.id),
    relatedGovernanceItemIds: sortedGovernanceItems.map((item) => item.id),
    policyTrackId: args.policyTrack?.id ?? null,
    policyTrackStatus: args.policyTrack?.status ?? null,
    benchmarkCoverageStatus: args.policyTrack?.benchmarkCoverageStatus ?? null,
    benchmarkScenarioIds,
    topPriorityBenchmarkScenarioIds,
  };
}

function roundPercent(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }

  return Math.round((numerator / denominator) * 100);
}

export function buildTinaReviewerAcceptanceReality(
  draft: TinaWorkspaceDraft
): TinaReviewerAcceptanceRealitySnapshot {
  const cached = reviewerAcceptanceRealityCache.get(draft);
  if (cached) {
    return cached;
  }

  const reviewerOverrideGovernance = buildTinaReviewerOverrideGovernance(draft);
  const reviewerObservedDeltas = buildTinaReviewerObservedDeltas(draft);
  const reviewerPolicyVersioning = buildTinaReviewerPolicyVersioning(draft);
  const themeIds = unique([
    ...reviewerObservedDeltas.items.map((item) => item.theme),
    ...reviewerOverrideGovernance.acceptanceDeltas.map((delta) => delta.theme),
    ...reviewerOverrideGovernance.items.map((item) => item.theme),
  ]) as TinaReviewerLearningTheme[];

  if (themeIds.length === 0) {
    const emptySnapshot: TinaReviewerAcceptanceRealitySnapshot = {
      lastBuiltAt: new Date().toISOString(),
      status: "complete",
      overallStatus: "unproven",
      summary: "Tina does not yet have enough observed reviewer acceptance history to treat acceptance against reality as proven.",
      nextStep:
        "Capture reviewer decisions and governed overrides so Tina can measure real acceptance drift over time.",
      totalObservedThemeCount: 0,
      acceptedFirstPassCount: 0,
      acceptedAfterAdjustmentCount: 0,
      blockedThemeCount: 0,
      rejectedThemeCount: 0,
      staleThemeCount: 0,
      observedAcceptanceRate: 0,
      durableAcceptanceRate: 0,
      benchmarkBackedAcceptedCount: 0,
      topPriorityAcceptedCoverageCount: 0,
      items: [],
    };
    reviewerAcceptanceRealityCache.set(draft, emptySnapshot);
    return emptySnapshot;
  }

  const items = themeIds
    .map((theme) =>
      buildAcceptanceItem({
        theme,
        observedItems: reviewerObservedDeltas.items.filter((item) => item.theme === theme),
        deltas: reviewerOverrideGovernance.acceptanceDeltas.filter((delta) => delta.theme === theme),
        governanceItems: reviewerOverrideGovernance.items.filter((item) => item.theme === theme),
        policyTrack:
          reviewerPolicyVersioning.items.find((item) => item.theme === theme) ?? null,
      })
    )
    .sort((left, right) => {
      const outcomeComparison = compareOutcomePriority(left.outcome, right.outcome);
      if (outcomeComparison !== 0) {
        return outcomeComparison;
      }

      return parseTimestamp(right.lastObservedAt) - parseTimestamp(left.lastObservedAt);
    });

  const acceptedFirstPassCount = items.filter(
    (item) => item.outcome === "accepted_first_pass"
  ).length;
  const acceptedAfterAdjustmentCount = items.filter(
    (item) => item.outcome === "accepted_after_adjustment"
  ).length;
  const blockedThemeCount = items.filter(
    (item) => item.outcome === "blocked_by_reviewer"
  ).length;
  const rejectedThemeCount = items.filter((item) => item.outcome === "rejected").length;
  const staleThemeCount = items.filter(
    (item) => item.outcome === "stale_after_acceptance"
  ).length;
  const acceptedCount = acceptedFirstPassCount + acceptedAfterAdjustmentCount;
  const durableAcceptedCount = items.filter(
    (item) =>
      (item.outcome === "accepted_first_pass" ||
        item.outcome === "accepted_after_adjustment") &&
      (item.policyTrackStatus === "active" || item.policyTrackStatus === "ready_to_promote")
  ).length;
  const benchmarkBackedAcceptedCount = items.filter(
    (item) =>
      (item.outcome === "accepted_first_pass" ||
        item.outcome === "accepted_after_adjustment") &&
      item.benchmarkScenarioIds.length > 0
  ).length;
  const topPriorityAcceptedCoverageCount = items.filter(
    (item) =>
      (item.outcome === "accepted_first_pass" ||
        item.outcome === "accepted_after_adjustment") &&
      item.topPriorityBenchmarkScenarioIds.length > 0
  ).length;
  const observedAcceptanceRate = roundPercent(acceptedCount, items.length);
  const durableAcceptanceRate = roundPercent(durableAcceptedCount, items.length);

  const overallStatus: TinaReviewerAcceptanceRealitySnapshot["overallStatus"] =
    rejectedThemeCount > 0 || staleThemeCount > 0
      ? "regressing"
      : acceptedCount === 0
        ? "unproven"
        : blockedThemeCount > 0 ||
            durableAcceptanceRate < 50 ||
            benchmarkBackedAcceptedCount < acceptedCount
          ? "watch"
          : "trusted";

  const snapshot: TinaReviewerAcceptanceRealitySnapshot = {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    overallStatus,
    summary:
      overallStatus === "trusted"
        ? "Observed reviewer outcomes are strong enough that Tina can treat acceptance against reality as a bounded trust signal."
        : overallStatus === "watch"
          ? "Tina has some real reviewer acceptance history, but the observed acceptance path is still incomplete or too adjustment-heavy."
          : overallStatus === "unproven"
            ? "Tina still needs more observed reviewer history before acceptance against reality should influence trust aggressively."
            : "Observed reviewer outcomes are regressing, stale, or rejected often enough that Tina should tighten trust language.",
    nextStep:
      overallStatus === "trusted"
        ? "Preserve the clean acceptance themes as durable policy and benchmark-backed regression coverage."
        : overallStatus === "watch"
        ? "Convert the accepted-but-fragile themes into more durable policy tracks and clear the remaining blocked themes."
        : overallStatus === "unproven"
            ? "Capture more governed reviewer outcomes so Tina can measure live acceptance against reality instead of relying mostly on forecasts."
            : "Resolve the regressing reviewer themes before Tina widens certainty or release posture.",
    totalObservedThemeCount: items.length,
    acceptedFirstPassCount,
    acceptedAfterAdjustmentCount,
    blockedThemeCount,
    rejectedThemeCount,
    staleThemeCount,
    observedAcceptanceRate,
    durableAcceptanceRate,
    benchmarkBackedAcceptedCount,
    topPriorityAcceptedCoverageCount,
    items,
  };

  reviewerAcceptanceRealityCache.set(draft, snapshot);
  return snapshot;
}
