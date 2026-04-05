import {
  TINA_WEIRD_SMALL_BUSINESS_SCENARIOS,
  TINA_WEIRD_SMALL_BUSINESS_TOP_PRIORITY_IDS,
} from "@/tina/data/weird-small-business-scenarios";
import type {
  TinaWeirdSmallBusinessBenchmarkSnapshot,
  TinaWeirdSmallBusinessScenarioGroup,
} from "@/tina/lib/weird-small-business-benchmark-contracts";

const BENCHMARK_QUESTIONS = [
  "What is the likely current tax classification?",
  "What filings may be missing?",
  "What are the biggest risk areas?",
  "What facts must be confirmed before preparing a return?",
  "What cleanup steps should happen first?",
  "Which issues are federal versus state?",
];

const BENCHMARK_PROMPT_TEMPLATE = `Here is the business fact pattern.

What is the likely current tax classification?
What filings may be missing?
What are the biggest risk areas?
What facts must be confirmed before preparing a return?
What cleanup steps should happen first?
Which issues are federal versus state?`;

export function buildTinaWeirdSmallBusinessBenchmarkSnapshot(): TinaWeirdSmallBusinessBenchmarkSnapshot {
  const groupCounts = TINA_WEIRD_SMALL_BUSINESS_SCENARIOS.reduce<
    Record<TinaWeirdSmallBusinessScenarioGroup, number>
  >(
    (counts, scenario) => {
      counts[scenario.group] += 1;
      return counts;
    },
    {
      entity_and_election_problems: 0,
      ownership_and_basis_problems: 0,
      worker_classification_and_payroll_problems: 0,
      recordkeeping_and_cleanup_problems: 0,
      assets_depreciation_and_property_problems: 0,
    }
  );

  return {
    generatedAt: new Date().toISOString(),
    runMode: "offline_first",
    offlineReady: true,
    scenarioCount: TINA_WEIRD_SMALL_BUSINESS_SCENARIOS.length,
    topPriorityScenarioIds: [...TINA_WEIRD_SMALL_BUSINESS_TOP_PRIORITY_IDS],
    benchmarkQuestions: [...BENCHMARK_QUESTIONS],
    benchmarkPromptTemplate: BENCHMARK_PROMPT_TEMPLATE,
    groupCounts,
    scenarios: TINA_WEIRD_SMALL_BUSINESS_SCENARIOS.map((scenario) => ({
      ...scenario,
      diagnosticProblems: [...scenario.diagnosticProblems],
      likelyTaxClassifications: [...scenario.likelyTaxClassifications],
      likelyReturnsAndForms: [...scenario.likelyReturnsAndForms],
      missingFactsToConfirm: [...scenario.missingFactsToConfirm],
      federalIssues: [...scenario.federalIssues],
      stateIssues: [...scenario.stateIssues],
      cleanupStepsFirst: [...scenario.cleanupStepsFirst],
      forwardPlanningAngles: [...scenario.forwardPlanningAngles],
      targetedSkills: [...scenario.targetedSkills],
      targetedOutcomes: [...scenario.targetedOutcomes],
    })),
  };
}
