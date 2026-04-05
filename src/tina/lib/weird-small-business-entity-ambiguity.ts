import { rankDiagnosticHypothesis } from "@/tina/lib/diagnostic-hypothesis-ranking";
import type {
  TinaWeirdSmallBusinessBenchmarkConfidence,
  TinaWeirdSmallBusinessEntityAmbiguityPath,
  TinaWeirdSmallBusinessEntityAmbiguitySnapshot,
  TinaWeirdSmallBusinessScenario,
} from "@/tina/lib/weird-small-business-benchmark-contracts";

interface TinaWeirdSmallBusinessEntityAmbiguityInput {
  scenarioId: string;
  posture: "route_sensitive" | "cleanup_heavy" | "compliance_risk" | "records_first";
  confidenceCeiling: TinaWeirdSmallBusinessBenchmarkConfidence;
  signalIds: string[];
  likelyTaxClassifications: string[];
  factsToConfirmFirst: string[];
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

function includesSignal(
  input: TinaWeirdSmallBusinessEntityAmbiguityInput,
  signalId: string
): boolean {
  return input.signalIds.includes(signalId);
}

function buildPath(
  args: Omit<TinaWeirdSmallBusinessEntityAmbiguityPath, "status"> & {
    status?: TinaWeirdSmallBusinessEntityAmbiguityPath["status"];
  }
): TinaWeirdSmallBusinessEntityAmbiguityPath {
  return {
    ...args,
    status: args.status ?? "fallback",
    whyPlausible: unique(args.whyPlausible),
    whatCouldChange: unique(args.whatCouldChange),
    requiredProof: unique(args.requiredProof),
    relatedSignalIds: unique(args.relatedSignalIds),
  };
}

function candidateClassifications(
  scenario: TinaWeirdSmallBusinessScenario,
  input: TinaWeirdSmallBusinessEntityAmbiguityInput
): string[] {
  const candidates = [...input.likelyTaxClassifications];

  if (includesSignal(input, "single_member_llc")) {
    candidates.push("disregarded_entity");
  }

  if (includesSignal(input, "multi_owner")) {
    candidates.push("partnership");
  }

  if (includesSignal(input, "s_election")) {
    candidates.push(
      includesSignal(input, "multi_owner")
        ? "default_llc_or_partnership_if_election_failed"
        : "default_llc_or_c_corp_if_election_failed"
    );
  }

  if (includesSignal(input, "spouse_owned")) {
    candidates.push("qualified_joint_venture_in_narrow_cases", "partnership");
  }

  if (
    includesSignal(input, "ownership_change") ||
    includesSignal(input, "prior_return_drift") ||
    scenario.id === "entity-changed-books-never-caught-up"
  ) {
    candidates.push("depends_on_transition_timeline");
  }

  return unique(candidates);
}

function buildClassificationPaths(
  scenario: TinaWeirdSmallBusinessScenario,
  input: TinaWeirdSmallBusinessEntityAmbiguityInput
): TinaWeirdSmallBusinessEntityAmbiguityPath[] {
  return candidateClassifications(scenario, input)
    .map((classification) => {
      const isPartnership = /partnership/.test(classification);
      const isDisregarded = /disregarded|sole_proprietorship/.test(classification);
      const isSCorp = /s_corporation/.test(classification);
      const isCCorp = /c_corporation/.test(classification);
      const isQjv = /qualified_joint_venture/.test(classification);
      const isTransition = /depends_on_transition_timeline/.test(classification);

      const whyPlausible: string[] = [];
      const whatCouldChange: string[] = [];
      const requiredProof: string[] = [];
      const relatedSignalIds: string[] = [];
      let baseScore = 48;

      if (isPartnership) {
        if (includesSignal(input, "multi_owner")) {
          whyPlausible.push("Multiple-owner facts keep default partnership treatment alive.");
          relatedSignalIds.push("multi_owner");
          baseScore += 18;
        }
        if (includesSignal(input, "ownership_change")) {
          whyPlausible.push("Ownership-change facts can still resolve into a partnership path.");
          relatedSignalIds.push("ownership_change");
          baseScore += 6;
        }
        if (includesSignal(input, "s_election")) {
          whatCouldChange.push("A valid S-election could displace the default partnership route.");
          relatedSignalIds.push("s_election");
        }
        if (includesSignal(input, "spouse_owned")) {
          whatCouldChange.push(
            "Married-couple facts can reopen whether the file really needs a partnership return."
          );
          relatedSignalIds.push("spouse_owned");
        }
      }

      if (isDisregarded) {
        if (includesSignal(input, "single_member_llc")) {
          whyPlausible.push(
            "Single-owner facts support default disregarded treatment unless a corporate election displaced it."
          );
          relatedSignalIds.push("single_member_llc");
          baseScore += 16;
        }
        if (includesSignal(input, "spouse_owned")) {
          whyPlausible.push(
            "Spouse-owned facts can still preserve a sole-prop style answer in narrow circumstances."
          );
          relatedSignalIds.push("spouse_owned");
          baseScore += 4;
        }
        if (includesSignal(input, "multi_owner")) {
          whatCouldChange.push(
            "Multi-owner clues can defeat a clean disregarded-entity answer unless a narrow exception is proved."
          );
          relatedSignalIds.push("multi_owner");
        }
        if (includesSignal(input, "s_election") || includesSignal(input, "c_corp")) {
          whatCouldChange.push("A valid corporate election would replace default disregarded treatment.");
        }
      }

      if (isSCorp) {
        if (includesSignal(input, "s_election")) {
          whyPlausible.push("Election and payroll signals keep S-corporation treatment plausible.");
          relatedSignalIds.push("s_election");
          baseScore += 18;
        }
        if (includesSignal(input, "payroll")) {
          whyPlausible.push("Payroll posture is consistent with an S-corporation operating story.");
          relatedSignalIds.push("payroll");
          baseScore += 6;
        }
        whatCouldChange.push(
          "The S-corporation route falls apart if Form 2553 was never validly filed or relieved."
        );
      }

      if (isCCorp) {
        if (includesSignal(input, "c_corp")) {
          whyPlausible.push("Corporate-election clues keep a C-corporation answer alive.");
          relatedSignalIds.push("c_corp");
          baseScore += 16;
        }
        if (includesSignal(input, "single_member_llc")) {
          whatCouldChange.push(
            "An LLC label alone does not preserve C-corporation treatment without a real election trail."
          );
        }
      }

      if (isQjv) {
        if (includesSignal(input, "spouse_owned")) {
          whyPlausible.push(
            "Married-couple ownership keeps a qualified-joint-venture style answer alive in narrow cases."
          );
          relatedSignalIds.push("spouse_owned");
          baseScore += 14;
        }
        if (includesSignal(input, "community_property")) {
          whyPlausible.push(
            "Community-property posture can materially change how the married-couple route is analyzed."
          );
          relatedSignalIds.push("community_property");
          baseScore += 5;
        }
        whatCouldChange.push(
          "The married-couple exception is narrow and can fail if legal ownership or state-law facts differ from the story."
        );
      }

      if (isTransition) {
        whyPlausible.push(
          "The file still behaves like a transition-year or stale-books problem rather than a stable entity answer."
        );
        relatedSignalIds.push(
          ...input.signalIds.filter((signalId) =>
            ["ownership_change", "prior_return_drift", "missed_filings"].includes(signalId)
          )
        );
        baseScore += 12;
        whatCouldChange.push(
          "Exact conversion dates, election dates, and prior-year filing history can collapse this into one real route."
        );
      }

      if (includesSignal(input, "multi_state")) {
        whatCouldChange.push(
          "State-law, registration, or community-property facts can still change how the federal answer is framed."
        );
        relatedSignalIds.push("multi_state");
      }

      const proofMatches = input.factsToConfirmFirst.filter((fact) => {
        if (isPartnership) {
          return /ownership|operating agreement|capital|allocation|draw/i.test(fact);
        }
        if (isDisregarded) {
          return /2553|8832|IRS election acceptance|prior-year filed return family/i.test(fact);
        }
        if (isSCorp) {
          return /2553|IRS acceptance|payroll|prior-year filed return family/i.test(fact);
        }
        if (isCCorp) {
          return /8832|IRS election acceptance|prior-year filed return family/i.test(fact);
        }
        if (isQjv) {
          return /state of residence|property-law posture|which spouse|prior years were filed/i.test(
            fact
          );
        }
        if (isTransition) {
          return /date|timeline|prior-year|election|payroll|conversion/i.test(fact);
        }
        return false;
      });

      requiredProof.push(...proofMatches);

      if (requiredProof.length === 0) {
        requiredProof.push(...input.factsToConfirmFirst.slice(0, 3));
      }

      if (whyPlausible.length === 0) {
        whyPlausible.push(
          "The scenario still leaves this classification alive as one plausible answer path."
        );
      }

      if (input.confidenceCeiling === "low") {
        baseScore -= 8;
      } else if (input.confidenceCeiling === "medium") {
        baseScore -= 3;
      }

      const ranking = rankDiagnosticHypothesis({
        whyPlausible,
        whatCouldChange,
        requiredProof,
        baseScore,
      });

      return buildPath({
        id: `entity-ambiguity-${classification}`,
        conclusion: classification,
        title: titleCase(classification),
        confidence: ranking.confidence as TinaWeirdSmallBusinessBenchmarkConfidence,
        stabilityScore: ranking.stabilityScore,
        summary: `${titleCase(classification)} remains a live entity-route answer for this scenario.`,
        whyPlausible,
        whatCouldChange,
        requiredProof,
        recommendedFirstQuestion: ranking.recommendedFirstQuestion,
        relatedSignalIds,
      });
    })
    .sort((left, right) => right.stabilityScore - left.stabilityScore)
    .map((path, index) =>
      buildPath({
        ...path,
        status:
          index === 0
            ? "leading"
            : index === 1
              ? "plausible"
              : "fallback",
      })
    );
}

export function buildTinaWeirdSmallBusinessEntityAmbiguity(
  scenario: TinaWeirdSmallBusinessScenario,
  input: TinaWeirdSmallBusinessEntityAmbiguityInput
): TinaWeirdSmallBusinessEntityAmbiguitySnapshot {
  const paths = buildClassificationPaths(scenario, input);
  const [leadingPath, alternatePath] = paths;
  const hardConflict =
    (includesSignal(input, "multi_owner") && includesSignal(input, "single_member_llc")) ||
    (includesSignal(input, "ownership_change") &&
      (includesSignal(input, "prior_return_drift") || includesSignal(input, "missed_filings"))) ||
    (includesSignal(input, "spouse_owned") &&
      includesSignal(input, "community_property") &&
      input.confidenceCeiling === "low");
  const closeCompetition =
    leadingPath &&
    alternatePath &&
    Math.abs(leadingPath.stabilityScore - alternatePath.stabilityScore) <= 14;

  const overallStatus: TinaWeirdSmallBusinessEntityAmbiguitySnapshot["overallStatus"] =
    hardConflict
      ? "blocked"
      : closeCompetition || paths.length > 1 || input.confidenceCeiling === "low"
        ? "competing_routes"
        : "stable_route";
  const priorityQuestions = unique(
    [
      leadingPath?.recommendedFirstQuestion ?? "",
      alternatePath?.recommendedFirstQuestion ?? "",
      ...paths.flatMap((path) => path.requiredProof.slice(0, 1)),
      ...input.factsToConfirmFirst,
    ].filter(Boolean)
  ).slice(0, 6);

  return {
    scenarioId: input.scenarioId,
    overallStatus,
    summary:
      overallStatus === "stable_route"
        ? `Tina sees ${leadingPath?.title ?? "one entity path"} as the best-supported route.`
        : overallStatus === "competing_routes"
          ? `Tina still sees competing entity paths here, led by ${leadingPath?.title ?? "one route"} and ${alternatePath?.title ?? "another route"}.`
          : "Tina should not collapse this file to one entity answer yet because the route facts still conflict too hard.",
    nextStep:
      overallStatus === "stable_route"
        ? "Lead with the best-supported route, but keep the missing-proof caveats visible."
        : overallStatus === "competing_routes"
          ? "Keep the leading and alternate entity answers alive until the highest-priority proof questions settle."
          : "Hold the route conditional and push the ownership, election, and transition proof questions first.",
    leadingPathId: leadingPath?.id ?? null,
    priorityQuestions,
    paths,
  };
}
