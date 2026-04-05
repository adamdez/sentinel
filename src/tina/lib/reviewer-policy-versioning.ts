import {
  TINA_WEIRD_SMALL_BUSINESS_SCENARIOS,
  TINA_WEIRD_SMALL_BUSINESS_TOP_PRIORITY_IDS,
} from "@/tina/data/weird-small-business-scenarios";
import type {
  TinaReviewerAcceptanceDelta,
  TinaReviewerLearningLesson,
  TinaReviewerLearningTheme,
  TinaReviewerObservedDeltaItem,
  TinaReviewerOverrideGovernanceItem,
  TinaReviewerPolicyCandidate,
  TinaReviewerPolicyVersionTrack,
  TinaReviewerPolicyVersioningSnapshot,
  TinaReviewerRegressionTarget,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaReviewerLearningLoop } from "@/tina/lib/reviewer-learning-loop";
import { buildTinaReviewerObservedDeltas } from "@/tina/lib/reviewer-observed-deltas";
import { buildTinaReviewerOverrideGovernance } from "@/tina/lib/reviewer-override-governance";
import type { TinaWorkspaceDraft } from "@/tina/types";

const reviewerPolicyVersioningCache = new WeakMap<
  TinaWorkspaceDraft,
  TinaReviewerPolicyVersioningSnapshot
>();

const scenarioIdSet = new Set(
  TINA_WEIRD_SMALL_BUSINESS_SCENARIOS.map((scenario) => scenario.id)
);
const topPriorityScenarioIdSet = new Set<string>(TINA_WEIRD_SMALL_BUSINESS_TOP_PRIORITY_IDS);

const BENCHMARK_ALIAS_MAP: Record<string, string[]> = {
  "buyout-year": ["midyear-ownership-change", "basisless-distributions"],
  "dirty-books": [
    "mixed-personal-business-spend",
    "no-bookkeeping-until-tax-time",
    "cash-business-incomplete-sales",
  ],
  "drifted-package": ["prior-returns-vs-current-books-drift"],
  "heavy-depreciation-year": ["capitalization-vs-expense", "disposed-assets-no-basis"],
  "inventory-heavy-retailer": ["inventory-with-weak-tracking"],
  "mixed-use-home-office-vehicle": ["mixed-use-vehicles", "mixed-personal-business-spend"],
  "payroll-contractor-overlap": ["contractor-vs-employee", "missing-w9-1099"],
  "prior-return-drift": [
    "prior-returns-vs-current-books-drift",
    "single-member-llc-unclear-tax",
    "late-missing-s-election",
  ],
  "related-party-payments": ["personal-helpers-through-business"],
  "sales-tax-authority": ["multi-state-entity-registration"],
  "s-corp-election": ["late-missing-s-election", "s-corp-no-payroll"],
  "spouse-community-property": ["spouse-owned-unclear-treatment"],
};

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

function normalizeBenchmarkScenarioIds(ids: string[]): string[] {
  const normalized: string[] = [];

  ids.forEach((id) => {
    if (scenarioIdSet.has(id)) {
      normalized.push(id);
      return;
    }

    const aliasTargets = BENCHMARK_ALIAS_MAP[id];
    if (aliasTargets) {
      aliasTargets.forEach((target) => {
        if (scenarioIdSet.has(target)) {
          normalized.push(target);
        }
      });
    }
  });

  return unique(normalized);
}

function buildVersionId(args: {
  theme: TinaReviewerLearningTheme;
  stage: "active" | "candidate";
  primaryCount: number;
  benchmarkCount: number;
}): string {
  return [
    "tina-policy",
    args.theme,
    args.stage,
    `v${Math.max(1, args.primaryCount)}.${Math.max(1, args.benchmarkCount)}`,
  ].join("-");
}

function buildTrack(args: {
  theme: TinaReviewerLearningTheme;
  lessons: TinaReviewerLearningLesson[];
  policyCandidates: TinaReviewerPolicyCandidate[];
  regressionTargets: TinaReviewerRegressionTarget[];
  governanceItems: TinaReviewerOverrideGovernanceItem[];
  acceptanceDeltas: TinaReviewerAcceptanceDelta[];
  observedItems: TinaReviewerObservedDeltaItem[];
}): TinaReviewerPolicyVersionTrack {
  const anchoredLessons = args.lessons.filter((lesson) => lesson.status === "anchored");
  const queuedLessons = args.lessons.filter((lesson) => lesson.status === "queued");
  const openGovernanceItems = args.governanceItems.filter((item) => item.status === "open");
  const blockingAcceptanceDeltas = args.acceptanceDeltas.filter(
    (delta) => delta.severity === "blocking"
  );
  const blockingObservedItems = args.observedItems.filter(
    (item) =>
      item.kind === "rejected" ||
      item.kind === "stale_after_acceptance" ||
      item.severity === "blocking"
  );
  const openObservedItems = args.observedItems.filter(
    (item) => item.kind === "change_requested"
  );
  const benchmarkScenarioIds = normalizeBenchmarkScenarioIds([
    ...args.governanceItems.flatMap((item) => item.benchmarkScenarioIds),
    ...args.acceptanceDeltas.flatMap((delta) => delta.benchmarkScenarioIds),
    ...args.observedItems.flatMap((item) => item.benchmarkScenarioIds),
    ...args.regressionTargets.flatMap((target) =>
      target.fixtureId ? [target.fixtureId] : []
    ),
  ]);
  const topPriorityBenchmarkScenarioIds = benchmarkScenarioIds.filter((scenarioId) =>
    topPriorityScenarioIdSet.has(scenarioId)
  );
  const benchmarkCoverageStatus: TinaReviewerPolicyVersionTrack["benchmarkCoverageStatus"] =
    topPriorityBenchmarkScenarioIds.length > 0 || benchmarkScenarioIds.length >= 2
      ? "covered"
      : benchmarkScenarioIds.length > 0
        ? "partial"
        : "missing";

  const status: TinaReviewerPolicyVersionTrack["status"] =
    blockingAcceptanceDeltas.length > 0 ||
    blockingObservedItems.length > 0 ||
    openGovernanceItems.length > 0 ||
    openObservedItems.length > 0
      ? "blocked"
      : anchoredLessons.length > 0 && benchmarkCoverageStatus === "covered"
        ? "active"
        : anchoredLessons.length > 0 && benchmarkCoverageStatus === "partial"
          ? "ready_to_promote"
          : anchoredLessons.length > 0
            ? "benchmarking"
            : "candidate";

  const currentVersionId =
    status === "active" || status === "ready_to_promote" || status === "benchmarking"
      ? buildVersionId({
          theme: args.theme,
          stage: "active",
          primaryCount: anchoredLessons.length,
          benchmarkCount: benchmarkScenarioIds.length,
        })
      : null;
  const candidateVersionId =
    status === "candidate" || status === "blocked"
      ? buildVersionId({
          theme: args.theme,
          stage: "candidate",
          primaryCount:
            args.policyCandidates.length +
            queuedLessons.length +
            openGovernanceItems.length +
            openObservedItems.length,
          benchmarkCount: benchmarkScenarioIds.length,
        })
      : null;

  const title =
    args.policyCandidates[0]?.title ??
    args.governanceItems[0]?.title ??
    args.lessons[0]?.title ??
    titleCase(args.theme);
  const blockers = unique([
    ...openGovernanceItems.map((item) => item.title),
    ...blockingAcceptanceDeltas.map((delta) => delta.title),
    ...openObservedItems.map((item) => item.title),
    ...blockingObservedItems.map((item) => item.title),
    ...(benchmarkCoverageStatus === "missing"
      ? ["No mapped weird-case benchmark scenarios back this reviewer policy track yet."]
      : []),
    ...(anchoredLessons.length === 0
      ? ["No anchored reviewer lesson exists yet for this policy track."]
      : []),
  ]);

  const summary =
    status === "blocked"
      ? "Reviewer policy maturity is still blocked by open overrides or acceptance failures."
      : status === "active"
        ? "Reviewer-approved lessons and benchmark coverage are strong enough to behave like bounded reusable policy."
        : status === "ready_to_promote"
          ? "Anchored lessons exist and benchmark coverage is present, but the policy track still needs a tighter release pass."
          : status === "benchmarking"
            ? "Anchored reviewer lessons exist, but benchmark coverage is still too thin to treat them as durable policy."
            : "Reviewer lessons and policy candidates exist, but they still need stronger anchors before Tina should widen certainty.";
  const nextStep =
    status === "blocked"
      ? "Resolve the open override or blocking reviewer delta before widening Tina's certainty on this theme."
      : status === "active"
        ? "Preserve this policy track as a bounded reusable rule and keep its benchmark coverage green."
        : status === "ready_to_promote"
          ? "Turn the anchored lesson into an explicit released policy track with stronger top-priority benchmark coverage."
          : status === "benchmarking"
            ? "Add explicit weird-case benchmark coverage before this anchored lesson is treated as stable policy."
            : "Promote the queued reviewer lesson into an anchored policy track with benchmark coverage and regression protection.";

  return {
    id: `reviewer-policy-version-${args.theme}`,
    theme: args.theme,
    title,
    status,
    currentVersionId,
    candidateVersionId,
    benchmarkCoverageStatus,
    summary,
    nextStep,
    ownerEngines: unique([
      ...args.lessons.flatMap((lesson) => lesson.ownerEngines),
      ...args.policyCandidates.flatMap((candidate) => candidate.ownerEngines),
      ...args.regressionTargets.flatMap((target) => target.ownerEngines),
      ...args.governanceItems.flatMap((item) => item.ownerEngines),
      "reviewer-policy-versioning",
      "weird-small-business-benchmark",
    ]),
    anchoredLessonCount: anchoredLessons.length,
    queuedLessonCount: queuedLessons.length,
    policyCandidateCount: args.policyCandidates.length,
    openOverrideCount: openGovernanceItems.length,
    blockingAcceptanceDeltaCount: blockingAcceptanceDeltas.length + blockingObservedItems.length,
    relatedLessonIds: args.lessons.map((lesson) => lesson.id),
    relatedPolicyCandidateIds: args.policyCandidates.map((candidate) => candidate.id),
    relatedRegressionTargetIds: args.regressionTargets.map((target) => target.id),
    relatedGovernanceItemIds: args.governanceItems.map((item) => item.id),
    relatedAcceptanceDeltaIds: args.acceptanceDeltas.map((delta) => delta.id),
    benchmarkScenarioIds,
    topPriorityBenchmarkScenarioIds,
    blockers,
    releaseNotes: unique([
      `${anchoredLessons.length} anchored lesson${anchoredLessons.length === 1 ? "" : "s"}`,
      `${queuedLessons.length} queued lesson${queuedLessons.length === 1 ? "" : "s"}`,
      `${args.policyCandidates.length} policy candidate${args.policyCandidates.length === 1 ? "" : "s"}`,
      `${args.regressionTargets.length} regression target${args.regressionTargets.length === 1 ? "" : "s"}`,
      `${benchmarkScenarioIds.length} mapped weird-case benchmark scenario${benchmarkScenarioIds.length === 1 ? "" : "s"}`,
      ...(topPriorityBenchmarkScenarioIds.length > 0
        ? [
            `${topPriorityBenchmarkScenarioIds.length} top-priority benchmark scenario${
              topPriorityBenchmarkScenarioIds.length === 1 ? "" : "s"
            }`,
          ]
        : []),
    ]),
  };
}

export function buildTinaReviewerPolicyVersioning(
  draft: TinaWorkspaceDraft
): TinaReviewerPolicyVersioningSnapshot {
  const cached = reviewerPolicyVersioningCache.get(draft);
  if (cached) {
    return cached;
  }

  const reviewerLearningLoop = buildTinaReviewerLearningLoop(draft);
  const reviewerOverrideGovernance = buildTinaReviewerOverrideGovernance(draft);
  const reviewerObservedDeltas = buildTinaReviewerObservedDeltas(draft);
  const themeIds = unique([
    ...reviewerLearningLoop.lessons.map((lesson) => lesson.theme),
    ...reviewerLearningLoop.policyCandidates.map((candidate) => candidate.theme),
    ...reviewerLearningLoop.regressionTargets.map((target) => target.theme),
    ...reviewerOverrideGovernance.items.map((item) => item.theme),
    ...reviewerOverrideGovernance.acceptanceDeltas.map((delta) => delta.theme),
    ...reviewerObservedDeltas.items.map((item) => item.theme),
  ]) as TinaReviewerLearningTheme[];

  if (themeIds.length === 0) {
    const emptySnapshot: TinaReviewerPolicyVersioningSnapshot = {
      lastBuiltAt: new Date().toISOString(),
      status: "complete",
      overallStatus: "stable",
      summary: "Tina does not have reviewer policy tracks to version yet.",
      nextStep:
        "Preserve reviewer approvals, changes, and weird-case benchmark mappings so Tina can promote them into durable policy tracks.",
      activePolicyCount: 0,
      readyToPromoteCount: 0,
      candidatePolicyCount: 0,
      benchmarkingPolicyCount: 0,
      blockedPolicyCount: 0,
      benchmarkCoverageGapCount: 0,
      topPriorityBenchmarkCoverageCount: 0,
      items: [],
    };
    reviewerPolicyVersioningCache.set(draft, emptySnapshot);
    return emptySnapshot;
  }

  const items = themeIds
    .map((theme) =>
      buildTrack({
        theme,
        lessons: reviewerLearningLoop.lessons.filter((lesson) => lesson.theme === theme),
        policyCandidates: reviewerLearningLoop.policyCandidates.filter(
          (candidate) => candidate.theme === theme
        ),
        regressionTargets: reviewerLearningLoop.regressionTargets.filter(
          (target) => target.theme === theme
        ),
        governanceItems: reviewerOverrideGovernance.items.filter((item) => item.theme === theme),
        acceptanceDeltas: reviewerOverrideGovernance.acceptanceDeltas.filter(
          (delta) => delta.theme === theme
        ),
        observedItems: reviewerObservedDeltas.items.filter((item) => item.theme === theme),
      })
    )
    .sort((left, right) => {
      const statusRank: Record<TinaReviewerPolicyVersionTrack["status"], number> = {
        blocked: 0,
        candidate: 1,
        benchmarking: 2,
        ready_to_promote: 3,
        active: 4,
      };
      return statusRank[left.status] - statusRank[right.status];
    });

  const activePolicyCount = items.filter((item) => item.status === "active").length;
  const readyToPromoteCount = items.filter(
    (item) => item.status === "ready_to_promote"
  ).length;
  const candidatePolicyCount = items.filter((item) => item.status === "candidate").length;
  const benchmarkingPolicyCount = items.filter(
    (item) => item.status === "benchmarking"
  ).length;
  const blockedPolicyCount = items.filter((item) => item.status === "blocked").length;
  const benchmarkCoverageGapCount = items.filter(
    (item) => item.benchmarkCoverageStatus !== "covered"
  ).length;
  const topPriorityBenchmarkCoverageCount = items.filter(
    (item) => item.topPriorityBenchmarkScenarioIds.length > 0
  ).length;
  const overallStatus: TinaReviewerPolicyVersioningSnapshot["overallStatus"] =
    blockedPolicyCount > 0
      ? "blocked"
      : readyToPromoteCount > 0 || candidatePolicyCount > 0 || benchmarkingPolicyCount > 0
        ? "release_queue"
        : "stable";

  const snapshot: TinaReviewerPolicyVersioningSnapshot = {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    overallStatus,
    summary:
      overallStatus === "blocked"
        ? "Tina has reviewer policy tracks that are still blocked by open overrides, blocking deltas, or unabsorbed benchmark gaps."
        : overallStatus === "release_queue"
          ? "Tina has reviewer policy tracks that are anchored enough to matter, but still need benchmark or release work before certainty widens."
          : "Tina's current reviewer policy tracks are stable and benchmark-backed enough to act like bounded reusable policy.",
    nextStep:
      overallStatus === "blocked"
        ? "Resolve blocked reviewer policy tracks before widening Tina's reviewer-ready posture."
        : overallStatus === "release_queue"
          ? "Promote the queued reviewer policy tracks with stronger benchmark coverage and explicit release ownership."
          : "Keep the active policy tracks benchmark-backed and stable as Tina expands.",
    activePolicyCount,
    readyToPromoteCount,
    candidatePolicyCount,
    benchmarkingPolicyCount,
    blockedPolicyCount,
    benchmarkCoverageGapCount,
    topPriorityBenchmarkCoverageCount,
    items,
  };

  reviewerPolicyVersioningCache.set(draft, snapshot);
  return snapshot;
}
