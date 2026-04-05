import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import {
  TINA_WEIRD_SMALL_BUSINESS_SCENARIOS,
  TINA_WEIRD_SMALL_BUSINESS_TOP_PRIORITY_IDS,
} from "@/tina/data/weird-small-business-scenarios";
import {
  buildTinaWeirdSmallBusinessBenchmarkSnapshot,
} from "@/tina/lib/weird-small-business-benchmark";
import {
  buildTinaWeirdSmallBusinessBenchmarkAnswerFromPreflight,
  buildTinaWeirdSmallBusinessBenchmarkPromptSupport,
  buildTinaWeirdSmallBusinessDiagnosticPreflight,
} from "@/tina/lib/weird-small-business-diagnostic-preflight";
import {
  buildTinaWeirdSmallBusinessDiagnosticHypotheses,
  buildTinaWeirdSmallBusinessDiagnosticHypothesisPromptSupport,
} from "@/tina/lib/weird-small-business-diagnostic-hypotheses";
import type {
  TinaWeirdSmallBusinessBenchmarkAnswer,
  TinaWeirdSmallBusinessBenchmarkAnswerSource,
  TinaWeirdSmallBusinessBenchmarkConfidence,
  TinaWeirdSmallBusinessDiagnosticHypothesisSnapshot,
  TinaWeirdSmallBusinessDiagnosticPreflight,
  TinaWeirdSmallBusinessBenchmarkRunReport,
  TinaWeirdSmallBusinessBenchmarkScenarioResult,
  TinaWeirdSmallBusinessBenchmarkScoreSection,
  TinaWeirdSmallBusinessScenario,
  TinaWeirdSmallBusinessScenarioGroup,
} from "@/tina/lib/weird-small-business-benchmark-contracts";

const TINA_BENCHMARK_MODEL = process.env.TINA_AI_MODEL_BENCHMARK ?? "gpt-5.4";

const TinaBenchmarkAnswerSchema = z.object({
  summary: z.string().min(1).max(400),
  likelyCurrentTaxClassification: z.string().min(1).max(180),
  filingsThatMayBeMissing: z.array(z.string().min(1).max(180)).min(1).max(8),
  biggestRiskAreas: z.array(z.string().min(1).max(220)).min(1).max(8),
  factsToConfirmBeforePreparation: z.array(z.string().min(1).max(220)).min(1).max(8),
  cleanupStepsFirst: z.array(z.string().min(1).max(220)).min(1).max(6),
  federalIssues: z.array(z.string().min(1).max(220)).min(1).max(6),
  stateIssues: z.array(z.string().min(1).max(220)).min(1).max(6),
  needsMoreFactsBeforePreparation: z.boolean(),
  confidence: z.enum(["low", "medium", "high"]),
});

type TinaBenchmarkAnswerParsed = z.infer<typeof TinaBenchmarkAnswerSchema>;

interface TinaBenchmarkWeight {
  id: TinaWeirdSmallBusinessBenchmarkScoreSection["id"];
  label: TinaWeirdSmallBusinessBenchmarkScoreSection["label"];
  maxScore: number;
}

const SCORE_WEIGHTS: TinaBenchmarkWeight[] = [
  { id: "classification", label: "Classification", maxScore: 15 },
  { id: "filings", label: "Filings", maxScore: 15 },
  { id: "risks", label: "Risk areas", maxScore: 20 },
  { id: "facts", label: "Missing facts", maxScore: 20 },
  { id: "cleanup", label: "Cleanup order", maxScore: 15 },
  { id: "federal_state", label: "Federal vs state split", maxScore: 10 },
  { id: "humility", label: "Uncertainty discipline", maxScore: 5 },
];

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/1120-s/g, "1120s")
    .replace(/k-1/g, "k1")
    .replace(/schedule\s+se/g, "schedule_se")
    .replace(/schedule\s+c/g, "schedule_c")
    .replace(/form\s+/g, "form ")
    .replace(/[^a-z0-9_\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length >= 2 || /^[0-9]+$/.test(token));
}

function phraseCoverage(expectedItems: string[], answerItems: string[]): {
  coverage: number;
  missedExpectedItems: string[];
} {
  if (expectedItems.length === 0) {
    return { coverage: 1, missedExpectedItems: [] };
  }

  const normalizedAnswers = answerItems.map((item) => new Set(tokenize(item)));

  const missedExpectedItems = expectedItems.filter((expected) => {
    const expectedTokens = tokenize(expected);
    if (expectedTokens.length === 0) {
      return false;
    }

    return !normalizedAnswers.some((answerTokens) => {
      const matched = expectedTokens.filter((token) => answerTokens.has(token)).length;
      const ratio = matched / expectedTokens.length;
      return ratio >= 0.6 || matched >= 2;
    });
  });

  return {
    coverage: (expectedItems.length - missedExpectedItems.length) / expectedItems.length,
    missedExpectedItems,
  };
}

function toLetterGrade(score: number): string {
  if (score >= 97) return "A+";
  if (score >= 93) return "A";
  if (score >= 90) return "A-";
  if (score >= 87) return "B+";
  if (score >= 83) return "B";
  if (score >= 80) return "B-";
  if (score >= 77) return "C+";
  if (score >= 73) return "C";
  if (score >= 70) return "C-";
  if (score >= 67) return "D+";
  if (score >= 63) return "D";
  if (score >= 60) return "D-";
  return "F";
}

function buildPrompt(scenario: TinaWeirdSmallBusinessScenario): string {
  const benchmark = buildTinaWeirdSmallBusinessBenchmarkSnapshot();
  const preflight = buildTinaWeirdSmallBusinessDiagnosticPreflight(scenario);
  const diagnosticHypotheses = buildTinaWeirdSmallBusinessDiagnosticHypotheses(
    scenario,
    preflight
  );

  return [
    "You are Tina, answering an offline weird small-business tax benchmark.",
    "Do not browse. Do not cite the web. Answer from tax reasoning only.",
    "Be conservative. If the facts are incomplete, say so clearly.",
    "Keep the answer diagnostic, not performative.",
    "",
    `Scenario title: ${scenario.title}`,
    `Scenario summary: ${scenario.summary}`,
    `Fact pattern: ${scenario.factPattern}`,
    "",
    "Known diagnostic problems:",
    ...scenario.diagnosticProblems.map((item) => `- ${item}`),
    "",
    buildTinaWeirdSmallBusinessBenchmarkPromptSupport(preflight, diagnosticHypotheses),
    "",
    buildTinaWeirdSmallBusinessDiagnosticHypothesisPromptSupport(diagnosticHypotheses),
    "",
    "Benchmark questions:",
    ...benchmark.benchmarkQuestions.map((item) => `- ${item}`),
  ].join("\n");
}

function confidenceSummary(
  confidence: TinaWeirdSmallBusinessBenchmarkConfidence,
  needsMoreFactsBeforePreparation: boolean
): string {
  if (needsMoreFactsBeforePreparation && confidence !== "high") {
    return "Tina stayed appropriately cautious about incomplete facts.";
  }
  if (needsMoreFactsBeforePreparation && confidence === "high") {
    return "Tina sounded too certain despite clear missing-facts pressure.";
  }
  return "Tina gave a usable answer posture for the stated facts.";
}

function scoreScenario(
  scenario: TinaWeirdSmallBusinessScenario,
  answer: TinaWeirdSmallBusinessBenchmarkAnswer,
  diagnosticPreflight: TinaWeirdSmallBusinessDiagnosticPreflight,
  diagnosticHypotheses: TinaWeirdSmallBusinessDiagnosticHypothesisSnapshot,
  answerSource: TinaWeirdSmallBusinessBenchmarkAnswerSource
): TinaWeirdSmallBusinessBenchmarkScenarioResult {
  const sections: TinaWeirdSmallBusinessBenchmarkScoreSection[] = [];

  const classificationCoverage = phraseCoverage(
    scenario.likelyTaxClassifications,
    [answer.likelyCurrentTaxClassification]
  );
  sections.push({
    id: "classification",
    label: "Classification",
    score: Math.round(classificationCoverage.coverage * 15),
    maxScore: 15,
    summary:
      classificationCoverage.missedExpectedItems.length === 0
        ? "Tina covered the main classification lane(s)."
        : "Tina missed one or more plausible classification postures.",
    missedExpectedItems: classificationCoverage.missedExpectedItems,
  });

  const filingsCoverage = phraseCoverage(
    scenario.likelyReturnsAndForms,
    answer.filingsThatMayBeMissing
  );
  sections.push({
    id: "filings",
    label: "Filings",
    score: Math.round(filingsCoverage.coverage * 15),
    maxScore: 15,
    summary:
      filingsCoverage.missedExpectedItems.length === 0
        ? "Tina covered the main filing family."
        : "Tina missed one or more likely return or form signals.",
    missedExpectedItems: filingsCoverage.missedExpectedItems,
  });

  const riskCoverage = phraseCoverage(scenario.diagnosticProblems, answer.biggestRiskAreas);
  sections.push({
    id: "risks",
    label: "Risk areas",
    score: Math.round(riskCoverage.coverage * 20),
    maxScore: 20,
    summary:
      riskCoverage.missedExpectedItems.length === 0
        ? "Tina captured the main risk themes."
        : "Tina undercalled one or more risk themes.",
    missedExpectedItems: riskCoverage.missedExpectedItems,
  });

  const factsCoverage = phraseCoverage(
    scenario.missingFactsToConfirm,
    answer.factsToConfirmBeforePreparation
  );
  sections.push({
    id: "facts",
    label: "Missing facts",
    score: Math.round(factsCoverage.coverage * 20),
    maxScore: 20,
    summary:
      factsCoverage.missedExpectedItems.length === 0
        ? "Tina asked for the key missing facts."
        : "Tina failed to request some important missing facts.",
    missedExpectedItems: factsCoverage.missedExpectedItems,
  });

  const cleanupCoverage = phraseCoverage(
    scenario.cleanupStepsFirst,
    answer.cleanupStepsFirst
  );
  sections.push({
    id: "cleanup",
    label: "Cleanup order",
    score: Math.round(cleanupCoverage.coverage * 15),
    maxScore: 15,
    summary:
      cleanupCoverage.missedExpectedItems.length === 0
        ? "Tina sequenced the cleanup well."
        : "Tina missed some key first cleanup steps.",
    missedExpectedItems: cleanupCoverage.missedExpectedItems,
  });

  const federalCoverage = phraseCoverage(scenario.federalIssues, answer.federalIssues);
  const stateCoverage = phraseCoverage(scenario.stateIssues, answer.stateIssues);
  const federalStateCoverage = (federalCoverage.coverage + stateCoverage.coverage) / 2;
  sections.push({
    id: "federal_state",
    label: "Federal vs state split",
    score: Math.round(federalStateCoverage * 10),
    maxScore: 10,
    summary:
      federalCoverage.missedExpectedItems.length === 0 &&
      stateCoverage.missedExpectedItems.length === 0
        ? "Tina separated federal and state issues cleanly."
        : "Tina blurred or missed part of the federal/state split.",
    missedExpectedItems: [...federalCoverage.missedExpectedItems, ...stateCoverage.missedExpectedItems],
  });

  const humilityScore =
    answer.needsMoreFactsBeforePreparation && answer.confidence !== "high" ? 5 : 2;
  sections.push({
    id: "humility",
    label: "Uncertainty discipline",
    score: humilityScore,
    maxScore: 5,
    summary: confidenceSummary(answer.confidence, answer.needsMoreFactsBeforePreparation),
    missedExpectedItems:
      humilityScore === 5 ? [] : ["Tina should have been more explicit about missing facts or lower confidence."],
  });

  const overallScore = sections.reduce((sum, section) => sum + section.score, 0);
  const weaknesses = sections.flatMap((section) =>
    section.missedExpectedItems.slice(0, 2).map((item) => `${section.label}: ${item}`)
  );
  const strengths = sections
    .filter((section) => section.score >= Math.round(section.maxScore * 0.8))
    .map((section) => section.summary);

  return {
    scenarioId: scenario.id,
    title: scenario.title,
    group: scenario.group,
    answerSource,
    diagnosticPreflight,
    diagnosticHypotheses,
    answer,
    overallScore,
    letterGrade: toLetterGrade(overallScore),
    sections,
    strengths,
    weaknesses,
  };
}

function aggregateGroupAverages(
  results: TinaWeirdSmallBusinessBenchmarkScenarioResult[]
): Record<TinaWeirdSmallBusinessScenarioGroup, number> {
  const groups: Record<TinaWeirdSmallBusinessScenarioGroup, number[]> = {
    entity_and_election_problems: [],
    ownership_and_basis_problems: [],
    worker_classification_and_payroll_problems: [],
    recordkeeping_and_cleanup_problems: [],
    assets_depreciation_and_property_problems: [],
  };

  for (const result of results) {
    groups[result.group].push(result.overallScore);
  }

  return {
    entity_and_election_problems: average(groups.entity_and_election_problems),
    ownership_and_basis_problems: average(groups.ownership_and_basis_problems),
    worker_classification_and_payroll_problems: average(groups.worker_classification_and_payroll_problems),
    recordkeeping_and_cleanup_problems: average(groups.recordkeeping_and_cleanup_problems),
    assets_depreciation_and_property_problems: average(groups.assets_depreciation_and_property_problems),
  };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function pickScenarios(args: {
  scenarioIds?: string[];
  topPriorityOnly?: boolean;
}): TinaWeirdSmallBusinessScenario[] {
  if (args.topPriorityOnly) {
    const topSet = new Set<string>([...TINA_WEIRD_SMALL_BUSINESS_TOP_PRIORITY_IDS]);
    return TINA_WEIRD_SMALL_BUSINESS_SCENARIOS.filter((scenario) => topSet.has(scenario.id));
  }

  if (!args.scenarioIds || args.scenarioIds.length === 0) {
    return TINA_WEIRD_SMALL_BUSINESS_SCENARIOS;
  }

  const requested = new Set(args.scenarioIds);
  const picked = TINA_WEIRD_SMALL_BUSINESS_SCENARIOS.filter((scenario) => requested.has(scenario.id));
  if (picked.length !== requested.size) {
    const found = new Set(picked.map((scenario) => scenario.id));
    const missing = [...requested].filter((id) => !found.has(id));
    throw new Error(`Unknown weird small-business scenario ids: ${missing.join(", ")}`);
  }
  return picked;
}

async function answerScenario(
  client: OpenAI,
  scenario: TinaWeirdSmallBusinessScenario
): Promise<TinaWeirdSmallBusinessBenchmarkAnswer> {
  const response = await client.responses.parse({
    model: TINA_BENCHMARK_MODEL,
    reasoning: { effort: "high" },
    text: {
      format: zodTextFormat(TinaBenchmarkAnswerSchema, "tina_weird_small_business_benchmark_answer"),
    },
    input: [
      {
        role: "developer" as const,
        content: [
          {
            type: "input_text" as const,
            text: "Answer as Tina. No web browsing, no citations, no fake certainty. Use concise tax language and explicit uncertainty when facts are incomplete.",
          },
        ],
      },
      {
        role: "user" as const,
        content: [
          {
            type: "input_text" as const,
            text: buildPrompt(scenario),
          },
        ],
      },
    ],
  });

  const parsed = response.output_parsed;
  if (!parsed) {
    throw new Error(`Tina did not return a usable benchmark answer for scenario ${scenario.id}.`);
  }

  return parsed;
}

function buildFallbackScenarioAnswer(
  scenario: TinaWeirdSmallBusinessScenario
): {
  answer: TinaWeirdSmallBusinessBenchmarkAnswer;
  diagnosticPreflight: TinaWeirdSmallBusinessDiagnosticPreflight;
  diagnosticHypotheses: TinaWeirdSmallBusinessDiagnosticHypothesisSnapshot;
  answerSource: TinaWeirdSmallBusinessBenchmarkAnswerSource;
} {
  const diagnosticPreflight = buildTinaWeirdSmallBusinessDiagnosticPreflight(scenario);
  const diagnosticHypotheses = buildTinaWeirdSmallBusinessDiagnosticHypotheses(
    scenario,
    diagnosticPreflight
  );

  return {
    answer: buildTinaWeirdSmallBusinessBenchmarkAnswerFromPreflight(
      diagnosticPreflight,
      diagnosticHypotheses
    ),
    diagnosticPreflight,
    diagnosticHypotheses,
    answerSource: "diagnostic_preflight_fallback",
  };
}

export async function runTinaWeirdSmallBusinessBenchmark(args: {
  scenarioIds?: string[];
  topPriorityOnly?: boolean;
} = {}): Promise<TinaWeirdSmallBusinessBenchmarkRunReport> {
  const apiKey = process.env.OPENAI_API_KEY;
  const scenarios = pickScenarios(args);
  const results: TinaWeirdSmallBusinessBenchmarkScenarioResult[] = [];
  const answerSources: Record<TinaWeirdSmallBusinessBenchmarkAnswerSource, number> = {
    openai_model: 0,
    diagnostic_preflight_fallback: 0,
  };
  const client = apiKey ? new OpenAI({ apiKey }) : null;

  for (const scenario of scenarios) {
    const diagnosticPreflight = buildTinaWeirdSmallBusinessDiagnosticPreflight(scenario);
    const diagnosticHypotheses = buildTinaWeirdSmallBusinessDiagnosticHypotheses(
      scenario,
      diagnosticPreflight
    );
    let answer: TinaWeirdSmallBusinessBenchmarkAnswer;
    let scenarioDiagnosticHypotheses = diagnosticHypotheses;
    let answerSource: TinaWeirdSmallBusinessBenchmarkAnswerSource;

    if (!client) {
      const fallback = buildFallbackScenarioAnswer(scenario);
      answer = fallback.answer;
      scenarioDiagnosticHypotheses = fallback.diagnosticHypotheses;
      answerSource = fallback.answerSource;
    } else {
      answer = await answerScenario(client, scenario);
      answerSource = "openai_model";
    }

    answerSources[answerSource] += 1;
    results.push(
      scoreScenario(
        scenario,
        answer,
        diagnosticPreflight,
        scenarioDiagnosticHypotheses,
        answerSource
      )
    );
  }

  const averageScore = average(results.map((result) => result.overallScore));

  return {
    generatedAt: new Date().toISOString(),
    runMode: "offline_first_no_web_search",
    model: client ? TINA_BENCHMARK_MODEL : "diagnostic_preflight_fallback",
    scenarioCount: results.length,
    answerSources,
    averageScore,
    overallLetterGrade: toLetterGrade(averageScore),
    groupAverages: aggregateGroupAverages(results),
    results,
  };
}
