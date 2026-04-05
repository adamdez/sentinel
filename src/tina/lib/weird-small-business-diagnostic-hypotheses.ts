import { rankDiagnosticHypothesis } from "@/tina/lib/diagnostic-hypothesis-ranking";
import type {
  TinaWeirdSmallBusinessBenchmarkConfidence,
  TinaWeirdSmallBusinessDiagnosticHypothesis,
  TinaWeirdSmallBusinessDiagnosticHypothesisCategory,
  TinaWeirdSmallBusinessDiagnosticHypothesisSnapshot,
  TinaWeirdSmallBusinessDiagnosticPreflight,
  TinaWeirdSmallBusinessScenario,
} from "@/tina/lib/weird-small-business-benchmark-contracts";

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

function includesSignal(
  preflight: TinaWeirdSmallBusinessDiagnosticPreflight,
  signalId: string
): boolean {
  return preflight.signalIds.includes(signalId);
}

function pushHypothesis(
  target: TinaWeirdSmallBusinessDiagnosticHypothesis[],
  hypothesis: TinaWeirdSmallBusinessDiagnosticHypothesis
) {
  target.push({
    ...hypothesis,
    whyPlausible: unique(hypothesis.whyPlausible),
    whatCouldChange: unique(hypothesis.whatCouldChange),
    requiredProof: unique(hypothesis.requiredProof),
    relatedSignalIds: unique(hypothesis.relatedSignalIds),
  });
}

function buildHypothesis(
  args: {
    id: string;
    category: TinaWeirdSmallBusinessDiagnosticHypothesisCategory;
    conclusion: string;
    title: string;
    summary: string;
    whyPlausible: string[];
    whatCouldChange: string[];
    requiredProof: string[];
    relatedSignalIds: string[];
    baseScore?: number;
  }
): TinaWeirdSmallBusinessDiagnosticHypothesis {
  const ranking = rankDiagnosticHypothesis({
    whyPlausible: args.whyPlausible,
    whatCouldChange: args.whatCouldChange,
    requiredProof: args.requiredProof,
    baseScore: args.baseScore,
  });

  return {
    id: args.id,
    category: args.category,
    conclusion: args.conclusion,
    title: args.title,
    status: "fallback",
    confidence: ranking.confidence as TinaWeirdSmallBusinessBenchmarkConfidence,
    stabilityScore: ranking.stabilityScore,
    summary: args.summary,
    whyPlausible: unique(args.whyPlausible),
    whatCouldChange: unique(args.whatCouldChange),
    requiredProof: unique(args.requiredProof),
    supportingSignalCount: ranking.supportingSignalCount,
    contradictingSignalCount: ranking.contradictingSignalCount,
    recommendedFirstQuestion: ranking.recommendedFirstQuestion,
    relatedSignalIds: unique(args.relatedSignalIds),
  };
}

function buildClassificationHypotheses(
  _scenario: TinaWeirdSmallBusinessScenario,
  preflight: TinaWeirdSmallBusinessDiagnosticPreflight
): TinaWeirdSmallBusinessDiagnosticHypothesis[] {
  return preflight.entityAmbiguity.paths.map((path) => ({
    id: `classification-${path.id}`,
    category: "tax_classification",
    conclusion: path.conclusion,
    title: path.title,
    status: path.status,
    confidence: path.confidence,
    stabilityScore: path.stabilityScore,
    summary: path.summary,
    whyPlausible: path.whyPlausible,
    whatCouldChange: path.whatCouldChange,
    requiredProof: path.requiredProof,
    supportingSignalCount: path.whyPlausible.length,
    contradictingSignalCount: path.whatCouldChange.length,
    recommendedFirstQuestion: path.recommendedFirstQuestion,
    relatedSignalIds: path.relatedSignalIds,
  }));
}

function buildReturnFamilyHypotheses(
  preflight: TinaWeirdSmallBusinessDiagnosticPreflight
): TinaWeirdSmallBusinessDiagnosticHypothesis[] {
  const hypotheses: TinaWeirdSmallBusinessDiagnosticHypothesis[] = [];
  const filings = preflight.likelyReturnsAndForms.join(" | ");

  const families = [
    {
      id: "schedule-c",
      match: /schedule c|1040/i,
      conclusion: "schedule_c_return_family",
      title: "Schedule C Return Family",
      whyPlausible: includesSignal(preflight, "single_member_llc")
        ? ["Single-owner facts support a Schedule C posture unless corporate-election proof replaces it."]
        : [],
      whatCouldChange:
        includesSignal(preflight, "multi_owner") || includesSignal(preflight, "s_election")
          ? ["Multi-owner or corporate-election facts can displace the Schedule C family."]
          : [],
      relatedSignalIds: unique(
        ["single_member_llc", "multi_owner", "s_election"].filter((id) =>
          includesSignal(preflight, id)
        )
      ),
      baseScore: includesSignal(preflight, "single_member_llc") ? 62 : 36,
    },
    {
      id: "1065",
      match: /1065|k-1/i,
      conclusion: "partnership_return_family",
      title: "Partnership Return Family",
      whyPlausible: includesSignal(preflight, "multi_owner")
        ? ["Multi-owner facts point toward a Form 1065 and K-1 package by default."]
        : [],
      whatCouldChange: includesSignal(preflight, "s_election")
        ? ["A valid S-election could convert the family from partnership to 1120-S."]
        : [],
      relatedSignalIds: unique(
        ["multi_owner", "s_election"].filter((id) => includesSignal(preflight, id))
      ),
      baseScore: includesSignal(preflight, "multi_owner") ? 64 : 36,
    },
    {
      id: "1120-s",
      match: /1120-s|2553/i,
      conclusion: "s_corporation_return_family",
      title: "S Corporation Return Family",
      whyPlausible: includesSignal(preflight, "s_election")
        ? ["Election signals and payroll clues keep the 1120-S family in play."]
        : [],
      whatCouldChange: ["The family falls back if the S-election trail is invalid or relief is unavailable."],
      relatedSignalIds: ["s_election"],
      baseScore: includesSignal(preflight, "s_election") ? 61 : 34,
    },
    {
      id: "1120",
      match: /1120(?!-s)/i,
      conclusion: "c_corporation_return_family",
      title: "C Corporation Return Family",
      whyPlausible: includesSignal(preflight, "c_corp")
        ? ["Corporate-election clues keep a Form 1120 family alive."]
        : [],
      whatCouldChange: ["The 1120 family fails if no valid corporate-election trail exists."],
      relatedSignalIds: ["c_corp"],
      baseScore: includesSignal(preflight, "c_corp") ? 58 : 32,
    },
  ];

  for (const family of families) {
    if (!family.match.test(filings) && family.whyPlausible.length === 0) {
      continue;
    }

    pushHypothesis(
      hypotheses,
      buildHypothesis({
        id: `return-family-${family.id}`,
        category: "return_family",
        conclusion: family.conclusion,
        title: family.title,
        summary: `${family.title} remains a plausible filing-family answer for this scenario.`,
        whyPlausible: family.whyPlausible.length > 0
          ? family.whyPlausible
          : ["The scenario's likely return/form signals keep this filing family alive."],
        whatCouldChange: family.whatCouldChange,
        requiredProof: preflight.factsToConfirmFirst.slice(0, 3),
        relatedSignalIds: family.relatedSignalIds,
        baseScore: family.baseScore,
      })
    );
  }

  return hypotheses;
}

function buildCleanupHypotheses(
  preflight: TinaWeirdSmallBusinessDiagnosticPreflight
): TinaWeirdSmallBusinessDiagnosticHypothesis[] {
  const hypotheses: TinaWeirdSmallBusinessDiagnosticHypothesis[] = [];

  const cleanupOptions: Array<{
    id: string;
    posture: TinaWeirdSmallBusinessDiagnosticPreflight["posture"];
    conclusion: string;
    title: string;
    whyPlausible: string[];
    whatCouldChange: string[];
    baseScore: number;
  }> = [
    {
      id: "records-first",
      posture: "records_first",
      conclusion: "records_reconstruction_before_return_prep",
      title: "Records-First Cleanup",
      whyPlausible: [
        "The scenario is behaving like a books-reconstruction or mixed-spend cleanup file before normal return prep.",
      ],
      whatCouldChange: [],
      baseScore: 72,
    },
    {
      id: "route-first",
      posture: "route_sensitive",
      conclusion: "route_proof_before_return_prep",
      title: "Route-First Proof Cleanup",
      whyPlausible: [
        "Entity, election, or ownership facts need to settle before Tina can trust the return family.",
      ],
      whatCouldChange: [],
      baseScore: 70,
    },
    {
      id: "compliance-first",
      posture: "compliance_risk",
      conclusion: "compliance_cleanup_before_income_tax_finish",
      title: "Compliance-First Cleanup",
      whyPlausible: [
        "Payroll, worker-classification, or information-return risk needs to be cleared early.",
      ],
      whatCouldChange: [],
      baseScore: 70,
    },
    {
      id: "asset-support-first",
      posture: "cleanup_heavy",
      conclusion: "asset_or_support_cleanup_before_final_treatment",
      title: "Support-First Asset Cleanup",
      whyPlausible: [
        "Depreciation, inventory, or property support has to be rebuilt before Tina can finish treatment work.",
      ],
      whatCouldChange: [],
      baseScore: 68,
    },
  ];

  for (const option of cleanupOptions) {
    pushHypothesis(
      hypotheses,
      buildHypothesis({
        id: `cleanup-${option.id}`,
        category: "cleanup_strategy",
        conclusion: option.conclusion,
        title: option.title,
        summary: `${option.title} is the best first cleanup posture for this scenario.`,
        whyPlausible:
          preflight.posture === option.posture
            ? option.whyPlausible
            : [],
        whatCouldChange:
          preflight.posture === option.posture
            ? []
            : ["A different evidence or route posture could move this cleanup item out of first place."],
        requiredProof: preflight.cleanupStepsFirst.slice(0, 3),
        relatedSignalIds: preflight.signalIds,
        baseScore: preflight.posture === option.posture ? option.baseScore : 28,
      })
    );
  }

  return hypotheses;
}

function buildDiagnosticLaneHypotheses(
  preflight: TinaWeirdSmallBusinessDiagnosticPreflight
): TinaWeirdSmallBusinessDiagnosticHypothesis[] {
  return [
    buildHypothesis({
      id: `diagnostic-lane-${preflight.diagnosticLane.laneId}`,
      category: "diagnostic_lane",
      conclusion: preflight.diagnosticLane.laneId,
      title: preflight.diagnosticLane.label,
      summary: preflight.diagnosticLane.summary,
      whyPlausible: [
        preflight.diagnosticLane.summary,
        ...preflight.diagnosticLane.filingLadder.slice(0, 2).map((item) => item.whyItMatters),
      ],
      whatCouldChange:
        preflight.diagnosticLane.entityRole === "entity_primary"
          ? []
          : [
              "Entity-route proof can still narrow the answer further after the first diagnostic lane is cleared.",
            ],
      requiredProof: preflight.diagnosticLane.factBuckets.flatMap((bucket) => bucket.facts).slice(0, 4),
      relatedSignalIds: preflight.signalIds,
      baseScore:
        preflight.diagnosticLane.entityRole === "entity_deferred_until_cleanup"
          ? 76
          : preflight.diagnosticLane.entityRole === "entity_secondary"
            ? 70
            : 74,
    }),
  ];
}

function buildStateBoundaryHypotheses(
  preflight: TinaWeirdSmallBusinessDiagnosticPreflight
): TinaWeirdSmallBusinessDiagnosticHypothesis[] {
  const hypotheses: TinaWeirdSmallBusinessDiagnosticHypothesis[] = [];
  const hasMaterialStateSplit =
    includesSignal(preflight, "multi_state") ||
    includesSignal(preflight, "community_property") ||
    preflight.stateIssues.some((item) => /nexus|sales-tax|community-property|registration|payroll/i.test(item));

  pushHypothesis(
    hypotheses,
    buildHypothesis({
      id: "state-boundary-federal-first",
      category: "state_boundary",
      conclusion: "federal_route_with_state_follow_through",
      title: "Federal Route First, Then State Cleanup",
      summary: "The federal return-family question can be separated from later state cleanup work.",
      whyPlausible: hasMaterialStateSplit
        ? ["The state issues look real, but they should not hide the first federal route question."]
        : ["The scenario looks mostly federal-first with lighter state follow-through."],
      whatCouldChange: hasMaterialStateSplit
        ? ["State-law posture could still change how the federal facts are interpreted if registration, community-property, or nexus facts are stronger than expected."]
        : [],
      requiredProof: preflight.stateIssues.slice(0, 2),
      relatedSignalIds: preflight.signalIds.filter((id) => id === "multi_state" || id === "community_property"),
      baseScore: hasMaterialStateSplit ? 58 : 70,
    })
  );

  if (hasMaterialStateSplit) {
    pushHypothesis(
      hypotheses,
      buildHypothesis({
        id: "state-boundary-state-can-change-answer",
        category: "state_boundary",
        conclusion: "state_law_can_change_federal_answer",
        title: "State-Law Facts Can Change the Answer",
        summary: "The state-law or registration posture may materially change the federal diagnostic answer.",
        whyPlausible: [
          "The scenario includes state-law, nexus, community-property, payroll, or registration facts that can change how Tina should answer.",
        ],
        whatCouldChange: ["If state-law and nexus facts are cleaner than feared, Tina can narrow back to a more federal-first answer."],
        requiredProof: preflight.factsToConfirmFirst.filter((item) =>
          /state|sales-tax|registration|formation state|property-law/i.test(item)
        ),
        relatedSignalIds: preflight.signalIds.filter((id) => id === "multi_state" || id === "community_property"),
        baseScore: 60,
      })
    );
  }

  return hypotheses;
}

function applyStatuses(
  hypotheses: TinaWeirdSmallBusinessDiagnosticHypothesis[]
): TinaWeirdSmallBusinessDiagnosticHypothesis[] {
  return hypotheses
    .sort((left, right) => right.stabilityScore - left.stabilityScore)
    .map((hypothesis, index) => ({
      ...hypothesis,
      status:
        index === 0
          ? "leading"
          : index === 1
            ? "plausible"
            : "fallback",
    }));
}

function buildOverallStatus(
  classificationHypotheses: TinaWeirdSmallBusinessDiagnosticHypothesis[],
  preflight: TinaWeirdSmallBusinessDiagnosticPreflight
): {
  overallStatus: TinaWeirdSmallBusinessDiagnosticHypothesisSnapshot["overallStatus"];
  answerStyle: TinaWeirdSmallBusinessDiagnosticHypothesisSnapshot["answerStyle"];
} {
  const [leading, alternate] = classificationHypotheses;
  const competingPaths =
    leading &&
    alternate &&
    Math.abs(leading.stabilityScore - alternate.stabilityScore) <= 12;
  const electionDependentCompetition =
    classificationHypotheses.length > 1 &&
    (includesSignal(preflight, "s_election") ||
      classificationHypotheses.some((item) =>
        /if_election_failed|if_valid_or_relieved_election|if_valid_election_exists/i.test(
          item.conclusion
        )
      ));
  const routeSensitiveCompetition =
    preflight.posture === "route_sensitive" &&
    (preflight.entityAmbiguity.overallStatus !== "stable_route" ||
      competingPaths ||
      electionDependentCompetition);

  if (routeSensitiveCompetition) {
    return {
      overallStatus: "competing_paths",
      answerStyle: "conditional_multi_path",
    };
  }

  if (preflight.diagnosticLane.entityRole === "entity_deferred_until_cleanup") {
    return {
      overallStatus: "cleanup_before_conclusion",
      answerStyle: "cleanup_first",
    };
  }

  if (
    preflight.posture === "records_first" ||
    (preflight.posture === "cleanup_heavy" && preflight.confidenceCeiling === "low")
  ) {
    return {
      overallStatus: "cleanup_before_conclusion",
      answerStyle: "cleanup_first",
    };
  }

  if (
    preflight.entityAmbiguity.overallStatus !== "stable_route" ||
    competingPaths ||
    electionDependentCompetition ||
    preflight.confidenceCeiling === "low"
  ) {
    return {
      overallStatus: "competing_paths",
      answerStyle: "conditional_multi_path",
    };
  }

  return {
    overallStatus: "stable_path",
    answerStyle: "single_path_with_caveat",
  };
}

export function buildTinaWeirdSmallBusinessDiagnosticHypotheses(
  scenario: TinaWeirdSmallBusinessScenario,
  preflight: TinaWeirdSmallBusinessDiagnosticPreflight
): TinaWeirdSmallBusinessDiagnosticHypothesisSnapshot {
  const diagnosticLaneHypotheses = applyStatuses(
    buildDiagnosticLaneHypotheses(preflight)
  );
  const classificationHypotheses = buildClassificationHypotheses(scenario, preflight);
  const returnFamilyHypotheses = applyStatuses(buildReturnFamilyHypotheses(preflight));
  const cleanupHypotheses = applyStatuses(buildCleanupHypotheses(preflight));
  const stateBoundaryHypotheses = applyStatuses(buildStateBoundaryHypotheses(preflight));
  const allHypotheses = [
    ...diagnosticLaneHypotheses,
    ...classificationHypotheses,
    ...returnFamilyHypotheses,
    ...cleanupHypotheses,
    ...stateBoundaryHypotheses,
  ];
  const { overallStatus, answerStyle } = buildOverallStatus(
    classificationHypotheses,
    preflight
  );
  const leadingClassification = classificationHypotheses.find(
    (item) => item.status === "leading"
  );
  const alternateClassification = classificationHypotheses.find(
    (item) => item.status === "plausible"
  );
  const priorityQuestions = unique(
    [
      ...preflight.diagnosticLane.factBuckets.flatMap((bucket) => bucket.facts),
      ...preflight.entityAmbiguity.priorityQuestions,
      ...classificationHypotheses.map((item) => item.recommendedFirstQuestion),
      ...cleanupHypotheses.map((item) => item.recommendedFirstQuestion),
      ...preflight.factsToConfirmFirst,
    ].filter((item): item is string => Boolean(item))
  ).slice(0, 6);

  return {
    scenarioId: scenario.id,
    overallStatus,
    answerStyle,
    summary:
      overallStatus === "cleanup_before_conclusion"
        ? "Tina should answer this scenario as a cleanup-first diagnostic file, not as a settled return-prep fact pattern."
        : overallStatus === "competing_paths"
          ? `Tina should answer conditionally because ${leadingClassification?.title ?? "one path"} and ${alternateClassification?.title ?? "another path"} both remain plausible. ${preflight.entityAmbiguity.summary}`
          : `Tina can lead with ${leadingClassification?.title ?? "the leading path"} while still making the missing-fact caveats explicit.`,
    nextStep:
      overallStatus === "cleanup_before_conclusion"
        ? "Keep cleanup and proof requests ahead of any confident return-family answer."
        : overallStatus === "competing_paths"
          ? "Keep both leading classification paths alive until the highest-priority proof questions settle."
          : "Lead with the best-supported path and use the priority questions to keep certainty honest.",
    leadingHypothesisId: leadingClassification?.id ?? null,
    signalIds: preflight.signalIds,
    priorityQuestions,
    hypotheses: allHypotheses,
  };
}

export function buildTinaWeirdSmallBusinessDiagnosticHypothesisPromptSupport(
  snapshot: TinaWeirdSmallBusinessDiagnosticHypothesisSnapshot
): string {
  const leading = snapshot.hypotheses.find((item) => item.status === "leading");
  const plausible = snapshot.hypotheses.find(
    (item) => item.category === "tax_classification" && item.status === "plausible"
  );

  return [
    "Ranked diagnostic hypotheses from Tina's offline weird-case engine:",
    `- Overall status: ${titleCase(snapshot.overallStatus)}`,
    `- Answer style: ${titleCase(snapshot.answerStyle)}`,
    leading
      ? `- Leading hypothesis: ${leading.title} (${leading.confidence}, score ${leading.stabilityScore})`
      : "",
    plausible
      ? `- Plausible alternate: ${plausible.title} (${plausible.confidence}, score ${plausible.stabilityScore})`
      : "",
    ...snapshot.priorityQuestions.slice(0, 4).map((item) => `- Priority question: ${item}`),
  ]
    .filter(Boolean)
    .join("\n");
}
