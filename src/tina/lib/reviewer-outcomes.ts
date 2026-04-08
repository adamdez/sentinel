import type {
  TinaReviewerAcceptanceConfidenceImpact,
  TinaReviewerAcceptanceScorecard,
  TinaReviewerAcceptanceTrustLevel,
  TinaReviewerOutcomeMemory,
  TinaReviewerOutcomeRecord,
  TinaReviewerOverrideRecord,
  TinaReviewerOverrideTargetType,
} from "@/tina/types";

function createRandomId(prefix: string): string {
  const generated =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${generated}`;
}

export function createDefaultTinaReviewerOutcomeMemory(): TinaReviewerOutcomeMemory {
  return {
    overrides: [],
    outcomes: [],
    ...buildTinaReviewerOutcomeMemoryState([], []),
  };
}

export function createTinaReviewerOverrideRecord(
  input: Omit<TinaReviewerOverrideRecord, "id">
): TinaReviewerOverrideRecord {
  return {
    ...input,
    id: createRandomId("reviewer-override"),
  };
}

export function createTinaReviewerOutcomeRecord(
  input: Omit<TinaReviewerOutcomeRecord, "id">
): TinaReviewerOutcomeRecord {
  return {
    ...input,
    id: createRandomId("reviewer-outcome"),
  };
}

function formatTargetType(targetType: TinaReviewerOverrideTargetType): string {
  return targetType.replace(/_/g, " ");
}

function formatPhase(phase: TinaReviewerOutcomeRecord["phase"] | "all"): string {
  return phase === "all" ? "all review phases" : phase.replace(/_/g, " ");
}

function buildAcceptanceScore(args: {
  acceptedCount: number;
  revisedCount: number;
  rejectedCount: number;
}): number {
  const totalOutcomes = args.acceptedCount + args.revisedCount + args.rejectedCount;
  if (totalOutcomes === 0) return 0;

  const weighted = args.acceptedCount + args.revisedCount * 0.45;
  let score = Math.round((weighted / totalOutcomes) * 100);

  if (totalOutcomes === 1) score = Math.min(score, 70);
  if (totalOutcomes === 2) score = Math.min(score, 82);
  if (args.rejectedCount > 0) score = Math.min(score, 58);

  return Math.max(0, Math.min(100, score));
}

function buildTrustLevel(args: {
  totalOutcomes: number;
  acceptedCount: number;
  revisedCount: number;
  rejectedCount: number;
  acceptanceScore: number;
}): TinaReviewerAcceptanceTrustLevel {
  if (args.totalOutcomes === 0) return "insufficient_history";
  if (
    args.rejectedCount > 0 ||
    args.acceptanceScore < 55 ||
    (args.totalOutcomes >= 3 && args.revisedCount + args.rejectedCount >= args.acceptedCount)
  ) {
    return "fragile";
  }

  if (args.totalOutcomes >= 4 && args.acceptanceScore >= 85 && args.rejectedCount === 0) {
    return "strong";
  }

  return "mixed";
}

function buildConfidenceImpact(
  trustLevel: TinaReviewerAcceptanceTrustLevel
): TinaReviewerAcceptanceConfidenceImpact {
  if (trustLevel === "strong") return "raise";
  if (trustLevel === "fragile") return "lower";
  return "hold";
}

function updatedAtFromRecords(
  records: Array<{ decidedAt?: string | null }>
): string | null {
  const timestamps = records
    .map((record) => (typeof record.decidedAt === "string" ? record.decidedAt : null))
    .filter((value): value is string => value !== null)
    .sort();
  return timestamps.at(-1) ?? null;
}

function buildPatternLessons(args: {
  overrides: TinaReviewerOverrideRecord[];
  outcomes: TinaReviewerOutcomeRecord[];
}): string[] {
  return Array.from(
    new Set([
      ...args.overrides.map((item) => item.lesson.trim()).filter((item) => item.length > 0),
      ...args.outcomes.flatMap((item) => item.lessons.map((lesson) => lesson.trim())),
    ])
  );
}

function buildPatternNextStep(args: {
  label: string;
  trustLevel: TinaReviewerAcceptanceTrustLevel;
  rejectedCount: number;
  revisedCount: number;
  acceptedCount: number;
}): string {
  if (args.trustLevel === "insufficient_history") {
    return `Capture real reviewer calls for ${args.label} before Tina leans on that pattern.`;
  }

  if (args.rejectedCount > 0) {
    return `Treat ${args.label} as unstable until Tina proves why reviewers are still rejecting it.`;
  }

  if (args.revisedCount >= args.acceptedCount) {
    return `Review the repeated revision lessons for ${args.label} before trusting Tina's first-pass output.`;
  }

  if (args.trustLevel === "strong") {
    return `Keep feeding ${args.label} outcomes back in so Tina can protect this strong pattern without drifting.`;
  }

  return `Keep measuring ${args.label}; the pattern is useful, but not strong enough to over-trust yet.`;
}

function buildPatternScore(args: {
  targetType: TinaReviewerOverrideTargetType;
  phase: TinaReviewerOutcomeRecord["phase"] | "all";
  outcomes: TinaReviewerOutcomeRecord[];
  overrides: TinaReviewerOverrideRecord[];
}) {
  const acceptedCount = args.outcomes.filter((item) => item.verdict === "accepted").length;
  const revisedCount = args.outcomes.filter((item) => item.verdict === "revised").length;
  const rejectedCount = args.outcomes.filter((item) => item.verdict === "rejected").length;
  const totalOutcomes = args.outcomes.length;
  const acceptanceScore = buildAcceptanceScore({
    acceptedCount,
    revisedCount,
    rejectedCount,
  });
  const trustLevel = buildTrustLevel({
    totalOutcomes,
    acceptedCount,
    revisedCount,
    rejectedCount,
    acceptanceScore,
  });
  const label =
    args.phase === "all"
      ? `${formatTargetType(args.targetType)} overall`
      : `${formatTargetType(args.targetType)} in ${formatPhase(args.phase)}`;

  return {
    patternId: `${args.targetType}:${args.phase}`,
    label,
    targetType: args.targetType,
    phase: args.phase,
    totalOutcomes,
    acceptedCount,
    revisedCount,
    rejectedCount,
    acceptanceScore,
    trustLevel,
    confidenceImpact: buildConfidenceImpact(trustLevel),
    nextStep: buildPatternNextStep({
      label,
      trustLevel,
      rejectedCount,
      revisedCount,
      acceptedCount,
    }),
    lessons: buildPatternLessons({
      overrides: args.overrides,
      outcomes: args.outcomes,
    }),
    updatedAt: updatedAtFromRecords(args.outcomes),
  };
}

function buildAcceptanceScorecard(
  overrides: TinaReviewerOverrideRecord[],
  outcomes: TinaReviewerOutcomeRecord[]
): TinaReviewerAcceptanceScorecard {
  const acceptedCount = outcomes.filter((item) => item.verdict === "accepted").length;
  const revisedCount = outcomes.filter((item) => item.verdict === "revised").length;
  const rejectedCount = outcomes.filter((item) => item.verdict === "rejected").length;
  const totalOutcomes = outcomes.length;
  const acceptanceScore = buildAcceptanceScore({
    acceptedCount,
    revisedCount,
    rejectedCount,
  });
  const trustLevel = buildTrustLevel({
    totalOutcomes,
    acceptedCount,
    revisedCount,
    rejectedCount,
    acceptanceScore,
  });

  const targetTypes = Array.from(new Set(outcomes.map((item) => item.targetType))).sort();
  const patterns = targetTypes.flatMap((targetType) => {
    const targetOutcomes = outcomes.filter((item) => item.targetType === targetType);
    const phaseScores = Array.from(new Set(targetOutcomes.map((item) => item.phase)))
      .sort()
      .map((phase) =>
        buildPatternScore({
          targetType,
          phase,
          outcomes: targetOutcomes.filter((item) => item.phase === phase),
          overrides: overrides.filter((item) => item.targetType === targetType),
        })
      );

    return [
      buildPatternScore({
        targetType,
        phase: "all",
        outcomes: targetOutcomes,
        overrides: overrides.filter((item) => item.targetType === targetType),
      }),
      ...phaseScores,
    ];
  });

  let nextStep =
    "Keep recording reviewer accepts, revisions, and rejections so Tina can keep recalibrating her confidence.";
  if (rejectedCount > 0) {
    nextStep =
      "Start with the rejected patterns first. They are the clearest signal that Tina is still breaking reviewer trust.";
  } else if (revisedCount >= acceptedCount && totalOutcomes > 0) {
    nextStep =
      "Tina is still being revised more than accepted. Tighten the repeated patterns before claiming stronger reviewer trust.";
  } else if (trustLevel === "strong") {
    nextStep =
      "Reviewer acceptance is currently strong. Keep feeding fresh outcomes back in so Tina does not drift into false confidence.";
  }

  return {
    totalOutcomes,
    acceptedCount,
    revisedCount,
    rejectedCount,
    acceptanceScore,
    trustLevel,
    nextStep,
    patterns,
  };
}

export function buildTinaReviewerOutcomeMemoryState(
  overrides: TinaReviewerOverrideRecord[],
  outcomes: TinaReviewerOutcomeRecord[]
): Pick<TinaReviewerOutcomeMemory, "updatedAt" | "summary" | "nextStep" | "scorecard"> {
  if (overrides.length === 0 && outcomes.length === 0) {
    return {
      updatedAt: null,
      summary: "Tina has not saved any reviewer outcomes yet.",
      nextStep:
        "Record real reviewer accepts, revisions, and rejections so Tina can learn from them.",
      scorecard: {
        totalOutcomes: 0,
        acceptedCount: 0,
        revisedCount: 0,
        rejectedCount: 0,
        acceptanceScore: 0,
        trustLevel: "insufficient_history",
        nextStep:
          "Record real reviewer accepts, revisions, and rejections so Tina can learn from them.",
        patterns: [],
      },
    };
  }

  const latestTimestamp =
    [updatedAtFromRecords(overrides), updatedAtFromRecords(outcomes)].sort().at(-1) ?? null;
  const scorecard = buildAcceptanceScorecard(overrides, outcomes);

  let summary = `Tina has ${outcomes.length} saved reviewer outcome`;
  summary += outcomes.length === 1 ? "" : "s";
  summary += ` and ${overrides.length} explicit override`;
  summary += overrides.length === 1 ? "." : "s.";
  summary += ` Acceptance score: ${scorecard.acceptanceScore}/100.`;

  return {
    updatedAt: latestTimestamp,
    summary,
    nextStep: scorecard.nextStep,
    scorecard,
  };
}

export function upsertTinaReviewerOutcomeMemory(
  current: TinaReviewerOutcomeMemory,
  input: {
    override?: TinaReviewerOverrideRecord;
    outcome?: TinaReviewerOutcomeRecord;
  }
): TinaReviewerOutcomeMemory {
  const overrides = input.override
    ? [
        input.override,
        ...current.overrides.filter((item) => item.id !== input.override?.id),
      ].sort((left, right) => right.decidedAt.localeCompare(left.decidedAt))
    : current.overrides;

  const outcomes = input.outcome
    ? [
        input.outcome,
        ...current.outcomes.filter((item) => item.id !== input.outcome?.id),
      ].sort((left, right) => right.decidedAt.localeCompare(left.decidedAt))
    : current.outcomes;

  return {
    ...current,
    ...buildTinaReviewerOutcomeMemoryState(overrides, outcomes),
    overrides,
    outcomes,
  };
}

export function ingestTinaReviewerTraffic(
  current: TinaReviewerOutcomeMemory,
  input: {
    overrides?: TinaReviewerOverrideRecord[];
    outcomes?: TinaReviewerOutcomeRecord[];
  }
): TinaReviewerOutcomeMemory {
  const incomingOverrides = input.overrides ?? [];
  const incomingOutcomes = input.outcomes ?? [];

  const overrides = [...incomingOverrides, ...current.overrides]
    .filter(
      (item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index
    )
    .sort((left, right) => right.decidedAt.localeCompare(left.decidedAt));

  const outcomes = [...incomingOutcomes, ...current.outcomes]
    .filter(
      (item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index
    )
    .sort((left, right) => right.decidedAt.localeCompare(left.decidedAt));

  return {
    ...current,
    ...buildTinaReviewerOutcomeMemoryState(overrides, outcomes),
    overrides,
    outcomes,
  };
}

export function findTinaReviewerPatternScore(
  memory: TinaReviewerOutcomeMemory,
  input: {
    targetType: TinaReviewerOverrideTargetType;
    phase?: TinaReviewerOutcomeRecord["phase"];
  }
) {
  if (input.phase) {
    const exactMatch = memory.scorecard.patterns.find(
      (pattern) => pattern.targetType === input.targetType && pattern.phase === input.phase
    );
    if (exactMatch) return exactMatch;
  }

  return (
    memory.scorecard.patterns.find(
      (pattern) => pattern.targetType === input.targetType && pattern.phase === "all"
    ) ?? null
  );
}

export function collectTinaReviewerLessons(
  memory: TinaReviewerOutcomeMemory
): string[] {
  return buildPatternLessons({
    overrides: memory.overrides,
    outcomes: memory.outcomes,
  });
}
