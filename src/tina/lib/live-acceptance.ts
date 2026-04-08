import type {
  TinaReviewerAcceptanceTrustLevel,
  TinaReviewerOutcomeCaseTag,
  TinaReviewerOutcomeMemory,
  TinaReviewerOutcomeRecord,
  TinaReviewerPatternScore,
  TinaWorkspaceDraft,
} from "@/tina/types";

export interface TinaLiveAcceptanceWindow {
  label: string;
  days: number | null;
  totalOutcomes: number;
  acceptedCount: number;
  revisedCount: number;
  rejectedCount: number;
  acceptanceScore: number | null;
  trustLevel: TinaReviewerAcceptanceTrustLevel;
}

export interface TinaLiveAcceptanceCohort {
  tag: TinaReviewerOutcomeCaseTag;
  label: string;
  totalOutcomes: number;
  acceptedCount: number;
  revisedCount: number;
  rejectedCount: number;
  acceptanceScore: number | null;
  trustLevel: TinaReviewerAcceptanceTrustLevel;
  nextStep: string;
}

export interface TinaLiveAcceptanceBenchmarkMovement {
  recommendation: "hold" | "raise_narrowly" | "raise_broadly";
  summary: string;
  nextStep: string;
}

export interface TinaLiveAcceptanceCurrentFileCohort {
  tag: TinaReviewerOutcomeCaseTag;
  label: string;
  trustLevel: TinaReviewerAcceptanceTrustLevel;
  acceptanceScore: number | null;
  nextStep: string;
}

export interface TinaLiveAcceptanceReport {
  summary: string;
  nextStep: string;
  windows: TinaLiveAcceptanceWindow[];
  cohorts: TinaLiveAcceptanceCohort[];
  currentFileTags: TinaReviewerOutcomeCaseTag[];
  currentFileCohorts: TinaLiveAcceptanceCurrentFileCohort[];
  benchmarkMovement: TinaLiveAcceptanceBenchmarkMovement;
  unstablePatterns: TinaReviewerPatternScore[];
  strongestPatterns: TinaReviewerPatternScore[];
}

function buildWindowLabel(days: number | null): string {
  if (days === null) return "all time";
  return `last ${days} days`;
}

function formatCaseTag(tag: TinaReviewerOutcomeCaseTag): string {
  return tag.replace(/_/g, " ");
}

function toTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildAcceptanceScore(outcomes: TinaReviewerOutcomeRecord[]): number | null {
  if (outcomes.length === 0) return null;

  const acceptedCount = outcomes.filter((item) => item.verdict === "accepted").length;
  const revisedCount = outcomes.filter((item) => item.verdict === "revised").length;
  const rejectedCount = outcomes.filter((item) => item.verdict === "rejected").length;
  const weighted = acceptedCount + revisedCount * 0.45;
  let score = Math.round((weighted / outcomes.length) * 100);

  if (outcomes.length === 1) score = Math.min(score, 70);
  if (outcomes.length === 2) score = Math.min(score, 82);
  if (rejectedCount > 0) score = Math.min(score, 58);

  return Math.max(0, Math.min(100, score));
}

function buildTrustLevel(outcomes: TinaReviewerOutcomeRecord[]): TinaReviewerAcceptanceTrustLevel {
  if (outcomes.length === 0) return "insufficient_history";

  const acceptedCount = outcomes.filter((item) => item.verdict === "accepted").length;
  const revisedCount = outcomes.filter((item) => item.verdict === "revised").length;
  const rejectedCount = outcomes.filter((item) => item.verdict === "rejected").length;
  const acceptanceScore = buildAcceptanceScore(outcomes) ?? 0;

  if (
    rejectedCount > 0 ||
    acceptanceScore < 55 ||
    (outcomes.length >= 3 && revisedCount + rejectedCount >= acceptedCount)
  ) {
    return "fragile";
  }

  if (outcomes.length >= 4 && acceptanceScore >= 85 && rejectedCount === 0) {
    return "strong";
  }

  return "mixed";
}

function buildCounts(outcomes: TinaReviewerOutcomeRecord[]) {
  return {
    acceptedCount: outcomes.filter((item) => item.verdict === "accepted").length,
    revisedCount: outcomes.filter((item) => item.verdict === "revised").length,
    rejectedCount: outcomes.filter((item) => item.verdict === "rejected").length,
  };
}

function buildWindow(
  memory: TinaReviewerOutcomeMemory,
  days: number | null,
  now: number
): TinaLiveAcceptanceWindow {
  const outcomes =
    days === null
      ? memory.outcomes
      : memory.outcomes.filter((item) => {
          const decidedAt = toTimestamp(item.decidedAt);
          return decidedAt > 0 && now - decidedAt <= days * 24 * 60 * 60 * 1000;
        });
  const counts = buildCounts(outcomes);

  return {
    label: buildWindowLabel(days),
    days,
    totalOutcomes: outcomes.length,
    acceptedCount: counts.acceptedCount,
    revisedCount: counts.revisedCount,
    rejectedCount: counts.rejectedCount,
    acceptanceScore: buildAcceptanceScore(outcomes),
    trustLevel: buildTrustLevel(outcomes),
  };
}

function buildCohortNextStep(
  label: string,
  trustLevel: TinaReviewerAcceptanceTrustLevel,
  totalOutcomes: number
): string {
  if (totalOutcomes === 0) {
    return `Capture real reviewer outcomes for ${label} before letting that cohort move benchmark scores.`;
  }

  if (trustLevel === "fragile") {
    return `Do not move ${label} scores up yet. Fix the repeated revision and rejection causes first.`;
  }

  if (trustLevel === "strong") {
    return `Keep extending ${label} outcomes so Tina can prove this strength is durable.`;
  }

  return `Keep measuring ${label}; the cohort is informative, but not strong enough for a broad score jump yet.`;
}

function buildCohorts(outcomes: TinaReviewerOutcomeRecord[]): TinaLiveAcceptanceCohort[] {
  const tags = Array.from(new Set(outcomes.flatMap((item) => item.caseTags))).sort();

  return tags.map((tag) => {
    const cohortOutcomes = outcomes.filter((item) => item.caseTags.includes(tag));
    const counts = buildCounts(cohortOutcomes);
    const trustLevel = buildTrustLevel(cohortOutcomes);
    const label = formatCaseTag(tag);

    return {
      tag,
      label,
      totalOutcomes: cohortOutcomes.length,
      acceptedCount: counts.acceptedCount,
      revisedCount: counts.revisedCount,
      rejectedCount: counts.rejectedCount,
      acceptanceScore: buildAcceptanceScore(cohortOutcomes),
      trustLevel,
      nextStep: buildCohortNextStep(label, trustLevel, cohortOutcomes.length),
    };
  });
}

export function deriveCurrentFileTags(draft: TinaWorkspaceDraft): TinaReviewerOutcomeCaseTag[] {
  const tags = new Set<TinaReviewerOutcomeCaseTag>();

  if (draft.profile.entityType === "sole_prop" || draft.profile.entityType === "single_member_llc") {
    tags.add("schedule_c");
  } else if (draft.profile.entityType === "s_corp") {
    tags.add("s_corp");
  } else if (draft.profile.entityType === "multi_member_llc" || draft.profile.entityType === "partnership") {
    tags.add("partnership");
  }

  if (
    draft.bookTieOut.variances.some((variance) =>
      [
        "date-coverage-mismatch",
        "missing-date-coverage",
        "duplicate-income-",
        "owner-flow-contamination",
        "uncategorized-transfer-activity",
        "conflicting-money-story",
      ].some((prefix) => variance.id.startsWith(prefix))
    )
  ) {
    tags.add("messy_books");
  }

  if (
    draft.bookTieOut.variances.some((variance) =>
      variance.id === "owner-flow-contamination" ||
      variance.id === "uncategorized-transfer-activity" ||
      variance.id === "conflicting-money-story"
    )
  ) {
    tags.add("commingled_entity");
  }

  if (
    draft.taxAdjustments.adjustments.some((adjustment) => adjustment.requiresAuthority) ||
    draft.authorityWork.length > 0 ||
    draft.taxPositionMemory.records.some((record) => record.authorityWorkIdeaIds.length > 0)
  ) {
    tags.add("authority_heavy");
  }

  if (draft.profile.hasIdahoActivity) {
    tags.add("state_scope");
  }

  return Array.from(tags).sort();
}

function buildCurrentFileCohorts(
  cohorts: TinaLiveAcceptanceCohort[],
  tags: TinaReviewerOutcomeCaseTag[]
): TinaLiveAcceptanceCurrentFileCohort[] {
  return tags.map((tag) => {
    const cohort = cohorts.find((item) => item.tag === tag);
    return {
      tag,
      label: formatCaseTag(tag),
      trustLevel: cohort?.trustLevel ?? "insufficient_history",
      acceptanceScore: cohort?.acceptanceScore ?? null,
      nextStep:
        cohort?.nextStep ??
        `Tina does not have enough live reviewer history for ${formatCaseTag(
          tag
        )} files yet.`,
    };
  });
}

function buildBenchmarkMovement(args: {
  windows: TinaLiveAcceptanceWindow[];
  cohorts: TinaLiveAcceptanceCohort[];
}): TinaLiveAcceptanceBenchmarkMovement {
  const recentWindow = args.windows[0];
  const fragileCohorts = args.cohorts.filter((cohort) => cohort.trustLevel === "fragile");
  const strongCohorts = args.cohorts.filter((cohort) => cohort.trustLevel === "strong");
  const broadCohortCoverage = args.cohorts.filter((cohort) => cohort.totalOutcomes >= 3).length;

  if (!recentWindow || recentWindow.totalOutcomes === 0) {
    return {
      recommendation: "hold",
      summary:
        "Do not move benchmark scores yet because Tina does not have enough recent live reviewer traffic.",
      nextStep:
        "Keep recording accepted, revised, and rejected reviewer outcomes on live files first.",
    };
  }

  if (recentWindow.trustLevel === "fragile" || fragileCohorts.length > 0) {
    const weakLabels = fragileCohorts.map((cohort) => cohort.label).slice(0, 3).join(", ");
    return {
      recommendation: "hold",
      summary:
        weakLabels.length > 0
          ? `Do not move benchmark scores up yet because reviewer trust is still fragile in ${weakLabels}.`
          : "Do not move benchmark scores up yet because recent reviewer trust is still fragile.",
      nextStep:
        "Fix the fragile cohorts and patterns first, then see whether the next live reviewer window improves.",
    };
  }

  if (
    recentWindow.trustLevel === "strong" &&
    strongCohorts.length >= 2 &&
    broadCohortCoverage >= 2
  ) {
    return {
      recommendation: "raise_broadly",
      summary:
        "Recent reviewer traffic is strong and Tina is holding that strength across multiple measured cohorts.",
      nextStep:
        "Review the measured cohorts skill by skill and only raise the benchmarks directly supported by those live outcomes.",
    };
  }

  if (recentWindow.trustLevel === "strong" || strongCohorts.length > 0) {
    return {
      recommendation: "raise_narrowly",
      summary:
        "Tina has pockets of strong live reviewer trust, but not enough cohort breadth for a broad benchmark jump.",
      nextStep:
        "Consider narrow score increases only in the measured cohorts and only where the engine changes support them.",
    };
  }

  return {
    recommendation: "hold",
    summary:
      "Recent reviewer traffic is useful, but it is still mixed and should not move benchmark scores broadly.",
    nextStep:
      "Keep measuring more live reviewer outcomes and build stronger cohort coverage before proposing score increases.",
  };
}

export function buildTinaLiveAcceptanceReport(
  draft: TinaWorkspaceDraft,
  nowIso: string = new Date().toISOString()
): TinaLiveAcceptanceReport {
  const now = toTimestamp(nowIso) || Date.now();
  const windows = [30, 90, null].map((days) =>
    buildWindow(draft.reviewerOutcomeMemory, days, now)
  );
  const unstablePatterns = draft.reviewerOutcomeMemory.scorecard.patterns
    .filter((pattern) => pattern.confidenceImpact === "lower")
    .sort((left, right) => left.acceptanceScore - right.acceptanceScore)
    .slice(0, 5);
  const strongestPatterns = draft.reviewerOutcomeMemory.scorecard.patterns
    .filter((pattern) => pattern.confidenceImpact === "raise")
    .sort((left, right) => right.acceptanceScore - left.acceptanceScore)
    .slice(0, 5);
  const cohorts = buildCohorts(draft.reviewerOutcomeMemory.outcomes);
  const currentFileTags = deriveCurrentFileTags(draft);
  const currentFileCohorts = buildCurrentFileCohorts(cohorts, currentFileTags);
  const benchmarkMovement = buildBenchmarkMovement({ windows, cohorts });

  const recentWindow = windows[0];
  let summary =
    "Tina does not have enough real reviewer outcome traffic yet to claim live acceptance strength.";
  let nextStep =
    "Keep recording accepted, revised, and rejected reviewer outcomes so Tina can be judged against real production-style decisions.";

  if (recentWindow && recentWindow.totalOutcomes > 0) {
    summary = `In the ${recentWindow.label}, Tina has ${recentWindow.totalOutcomes} real reviewer outcome${
      recentWindow.totalOutcomes === 1 ? "" : "s"
    } with a live acceptance score of ${recentWindow.acceptanceScore ?? 0}/100.`;

    if (recentWindow.trustLevel === "fragile") {
      nextStep =
        "Do not move benchmark scores up yet. Start with the unstable reviewer patterns and fix the repeated revision and rejection causes.";
    } else if (recentWindow.trustLevel === "strong") {
      nextStep =
        "Recent reviewer traffic is strong. Keep extending the outcome window and make sure the same result holds across more files.";
    } else {
      nextStep =
        "Recent reviewer traffic is useful but not yet elite. Keep expanding the live outcome window before claiming major benchmark movement.";
    }
  }

  return {
    summary,
    nextStep,
    windows,
    cohorts,
    currentFileTags,
    currentFileCohorts,
    benchmarkMovement,
    unstablePatterns,
    strongestPatterns,
  };
}
