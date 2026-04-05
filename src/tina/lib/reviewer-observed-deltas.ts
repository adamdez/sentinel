import { TINA_WEIRD_SMALL_BUSINESS_TOP_PRIORITY_IDS } from "@/tina/data/weird-small-business-scenarios";
import type {
  TinaReviewerObservedDeltaItem,
  TinaReviewerObservedDeltasSnapshot,
} from "@/tina/lib/acceleration-contracts";
import {
  inferTinaReviewerLearningTheme,
  TINA_REVIEWER_THEME_BENCHMARK_SCENARIOS,
} from "@/tina/lib/reviewer-learning-themes";
import type {
  TinaReviewerObservedDeltaDomain,
  TinaReviewerObservedDeltaKind,
  TinaReviewerObservedDeltaRecord,
  TinaReviewerObservedDeltaSeverity,
  TinaWorkspaceDraft,
} from "@/tina/types";

const reviewerObservedDeltasCache = new WeakMap<
  TinaWorkspaceDraft,
  TinaReviewerObservedDeltasSnapshot
>();

const topPriorityScenarioIdSet = new Set<string>(TINA_WEIRD_SMALL_BUSINESS_TOP_PRIORITY_IDS);

function parseTimestamp(value: string | null | undefined): number {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function toSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return slug || "reviewer-delta";
}

function defaultSeverity(
  kind: TinaReviewerObservedDeltaKind
): TinaReviewerObservedDeltaSeverity {
  if (kind === "rejected" || kind === "stale_after_acceptance") {
    return "blocking";
  }

  if (kind === "change_requested") {
    return "needs_attention";
  }

  return "info";
}

function defaultTrustEffect(kind: TinaReviewerObservedDeltaKind): string {
  if (kind === "accepted_first_pass") {
    return "Treat this as direct evidence that the current posture can stay bounded and reusable while the facts match.";
  }

  if (kind === "accepted_after_adjustment") {
    return "Preserve the accepted reviewer adjustment as a governed pattern before Tina widens certainty further.";
  }

  if (kind === "change_requested") {
    return "Keep the affected posture under reviewer control until the reviewer adjustment is absorbed into policy or explicit proof.";
  }

  if (kind === "rejected") {
    return "Fail closed on the affected posture until Tina has a stronger replacement backed by reviewer truth.";
  }

  return "Treat prior reviewer acceptance as stale until Tina captures a fresh package state and reruns reviewer review.";
}

export function recordTinaReviewerObservedDelta(input: {
  title: string;
  domain: TinaReviewerObservedDeltaDomain;
  kind: TinaReviewerObservedDeltaKind;
  severity?: TinaReviewerObservedDeltaSeverity;
  occurredAt?: string;
  reviewerName?: string | null;
  summary?: string;
  trustEffect?: string;
  ownerEngines?: string[];
  benchmarkScenarioIds?: string[];
  relatedDecisionId?: string | null;
  relatedSnapshotId?: string | null;
  relatedAuthorityWorkIdeaId?: string | null;
}): TinaReviewerObservedDeltaRecord {
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const id = `tina-observed-delta-${occurredAt.replace(/[^0-9]/g, "").slice(0, 14)}-${toSlug(input.title)}`;

  return {
    id,
    title: input.title,
    domain: input.domain,
    kind: input.kind,
    severity: input.severity ?? defaultSeverity(input.kind),
    occurredAt,
    reviewerName: input.reviewerName ?? null,
    summary: input.summary?.trim() || input.title,
    trustEffect: input.trustEffect?.trim() || defaultTrustEffect(input.kind),
    ownerEngines: unique(input.ownerEngines ?? ["reviewer-observed-deltas"]),
    benchmarkScenarioIds: unique(input.benchmarkScenarioIds ?? []),
    relatedDecisionId: input.relatedDecisionId ?? null,
    relatedSnapshotId: input.relatedSnapshotId ?? null,
    relatedAuthorityWorkIdeaId: input.relatedAuthorityWorkIdeaId ?? null,
  };
}

function toItem(record: TinaReviewerObservedDeltaRecord): TinaReviewerObservedDeltaItem {
  const theme = inferTinaReviewerLearningTheme(
    `${record.title} ${record.summary} ${record.trustEffect}`
  );
  const benchmarkScenarioIds = unique([
    ...record.benchmarkScenarioIds,
    ...TINA_REVIEWER_THEME_BENCHMARK_SCENARIOS[theme],
  ]);
  const topPriorityBenchmarkScenarioIds = benchmarkScenarioIds.filter((scenarioId) =>
    topPriorityScenarioIdSet.has(scenarioId)
  );

  return {
    id: record.id,
    title: record.title,
    theme,
    domain: record.domain,
    kind: record.kind,
    severity: record.severity,
    occurredAt: record.occurredAt,
    reviewerName: record.reviewerName,
    summary: record.summary,
    trustEffect: record.trustEffect,
    ownerEngines: unique([...record.ownerEngines, "reviewer-observed-deltas"]),
    relatedDecisionId: record.relatedDecisionId,
    relatedSnapshotId: record.relatedSnapshotId,
    relatedAuthorityWorkIdeaId: record.relatedAuthorityWorkIdeaId,
    benchmarkScenarioIds,
    topPriorityBenchmarkScenarioIds,
  };
}

export function buildTinaReviewerObservedDeltas(
  draft: TinaWorkspaceDraft
): TinaReviewerObservedDeltasSnapshot {
  const cached = reviewerObservedDeltasCache.get(draft);
  if (cached) {
    return cached;
  }

  if (draft.reviewerObservedDeltas.length === 0) {
    const emptySnapshot: TinaReviewerObservedDeltasSnapshot = {
      lastBuiltAt: new Date().toISOString(),
      status: "complete",
      overallStatus: "quiet",
      summary:
        "Tina does not have raw reviewer-observed deltas recorded yet, so live acceptance still depends on inferred reviewer history.",
      nextStep:
        "Record actual reviewer edits, clean accepts, rejections, and stale-anchor events so Tina can measure live acceptance against reality directly.",
      totalDeltaCount: 0,
      acceptedFirstPassCount: 0,
      acceptedAfterAdjustmentCount: 0,
      changeRequestedCount: 0,
      rejectedCount: 0,
      staleCount: 0,
      blockingCount: 0,
      benchmarkScenarioCoverageCount: 0,
      topPriorityCoverageCount: 0,
      items: [],
    };
    reviewerObservedDeltasCache.set(draft, emptySnapshot);
    return emptySnapshot;
  }

  const items = draft.reviewerObservedDeltas
    .map(toItem)
    .sort((left, right) => parseTimestamp(right.occurredAt) - parseTimestamp(left.occurredAt));
  const acceptedFirstPassCount = items.filter(
    (item) => item.kind === "accepted_first_pass"
  ).length;
  const acceptedAfterAdjustmentCount = items.filter(
    (item) => item.kind === "accepted_after_adjustment"
  ).length;
  const changeRequestedCount = items.filter(
    (item) => item.kind === "change_requested"
  ).length;
  const rejectedCount = items.filter((item) => item.kind === "rejected").length;
  const staleCount = items.filter(
    (item) => item.kind === "stale_after_acceptance"
  ).length;
  const blockingCount = items.filter((item) => item.severity === "blocking").length;
  const benchmarkScenarioCoverageCount = items.filter(
    (item) => item.benchmarkScenarioIds.length > 0
  ).length;
  const topPriorityCoverageCount = items.filter(
    (item) => item.topPriorityBenchmarkScenarioIds.length > 0
  ).length;
  const overallStatus: TinaReviewerObservedDeltasSnapshot["overallStatus"] =
    rejectedCount > 0 || staleCount > 0
      ? "regressing"
      : blockingCount > 0 || changeRequestedCount > 0
        ? "policy_update_required"
        : acceptedAfterAdjustmentCount > 0
          ? "watch"
          : "quiet";

  const snapshot: TinaReviewerObservedDeltasSnapshot = {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    overallStatus,
    summary:
      overallStatus === "quiet"
        ? "Recorded reviewer deltas are clean enough that Tina can treat them as a bounded live acceptance signal."
        : overallStatus === "watch"
          ? "Recorded reviewer deltas show accepted outcomes, but some of them still required reviewer adjustment first."
          : overallStatus === "policy_update_required"
            ? "Recorded reviewer deltas still include active change pressure, so Tina should keep the affected themes reviewer-controlled."
            : "Recorded reviewer deltas include rejection or stale-acceptance pressure, so Tina should fail closed on the affected themes.",
    nextStep:
      overallStatus === "quiet"
        ? "Keep recording clean reviewer outcomes so Tina can widen live acceptance confidence without bluffing."
        : overallStatus === "watch"
          ? "Promote the adjusted-but-accepted themes into explicit policy and regression coverage before widening certainty."
          : overallStatus === "policy_update_required"
            ? "Resolve the active reviewer deltas before Tina sounds reviewer-ready on the affected themes."
            : "Replace or refresh the affected reviewer anchors before Tina treats them as current trust evidence again.",
    totalDeltaCount: items.length,
    acceptedFirstPassCount,
    acceptedAfterAdjustmentCount,
    changeRequestedCount,
    rejectedCount,
    staleCount,
    blockingCount,
    benchmarkScenarioCoverageCount,
    topPriorityCoverageCount,
    items,
  };

  reviewerObservedDeltasCache.set(draft, snapshot);
  return snapshot;
}
