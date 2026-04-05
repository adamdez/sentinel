import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runTinaWeirdSmallBusinessBenchmark } from "@/tina/lib/weird-small-business-benchmark-runner";

const mocks = vi.hoisted(() => ({
  parse: vi.fn(),
  OpenAI: vi.fn(),
  zodTextFormat: vi.fn(),
}));

vi.mock("openai", () => ({
  default: mocks.OpenAI,
}));

vi.mock("openai/helpers/zod", () => ({
  zodTextFormat: mocks.zodTextFormat,
}));

describe("weird-small-business-benchmark-runner", () => {
  const originalOpenAiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.OPENAI_API_KEY = "test-openai-key";

    mocks.OpenAI.mockImplementation(function MockOpenAI() {
      return {
        responses: {
          parse: mocks.parse,
        },
      };
    });

    mocks.zodTextFormat.mockReturnValue({ type: "json_schema" });
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalOpenAiKey;
  });

  it("runs offline-first with no web tools and returns a scored report", async () => {
    mocks.parse.mockResolvedValue({
      output_parsed: {
        summary: "Likely a partnership file with missing partnership compliance.",
        likelyCurrentTaxClassification: "Partnership",
        filingsThatMayBeMissing: ["Form 1065", "Schedule K-1"],
        biggestRiskAreas: [
          "Owners are splitting profit informally without partnership accounting.",
          "Capital accounts and allocations were never tracked.",
        ],
        factsToConfirmBeforePreparation: [
          "How many owners existed during the year and when",
          "Operating agreement or ownership breakdown",
          "Capital contributions, draws, and profit-sharing history",
        ],
        cleanupStepsFirst: [
          "Establish the real ownership timeline and percentages",
          "Reconstruct contributions, draws, and allocation intent before preparing the return",
        ],
        federalIssues: [
          "A multi-member LLC defaults to partnership treatment absent a valid election",
        ],
        stateIssues: ["State partnership returns or LLC fees may be missing too"],
        needsMoreFactsBeforePreparation: true,
        confidence: "medium",
      },
    });

    const report = await runTinaWeirdSmallBusinessBenchmark({
      scenarioIds: ["multi-owner-llc-no-1065"],
    });

    expect(report.runMode).toBe("offline_first_no_web_search");
    expect(report.scenarioCount).toBe(1);
    expect(report.averageScore).toBeGreaterThanOrEqual(68);
    expect(report.results[0]?.scenarioId).toBe("multi-owner-llc-no-1065");
    expect(report.results[0]?.answerSource).toBe("openai_model");
    expect(report.results[0]?.diagnosticHypotheses.leadingHypothesisId).toBeTruthy();
    expect(report.results[0]?.sections.some((section) => section.id === "humility")).toBe(true);
    expect(report.answerSources.openai_model).toBe(1);
    expect(report.answerSources.diagnostic_preflight_fallback).toBe(0);

    expect(mocks.parse).toHaveBeenCalledTimes(1);
    const call = mocks.parse.mock.calls[0]?.[0];
    expect(call?.tools).toBeUndefined();
    expect(call?.input?.[0]?.content?.[0]?.text).toContain("No web browsing");
    expect(call?.input?.[1]?.content?.[0]?.text).toContain("Diagnostic preflight from Tina's offline weird-case engine");
    expect(call?.input?.[1]?.content?.[0]?.text).toContain("Diagnostic lane:");
    expect(call?.input?.[1]?.content?.[0]?.text).toContain("Ranked diagnostic hypotheses from Tina's offline weird-case engine");
  });

  it("supports the top-10 pilot mode for fast diagnostic runs", async () => {
    mocks.parse.mockResolvedValue({
      output_parsed: {
        summary: "Conservative diagnostic answer.",
        likelyCurrentTaxClassification: "Depends on entity facts",
        filingsThatMayBeMissing: ["Form 2553"],
        biggestRiskAreas: ["Books and elections may not line up."],
        factsToConfirmBeforePreparation: ["Prior-year filed return family"],
        cleanupStepsFirst: ["Confirm the election trail before preparing any return."],
        federalIssues: ["Return family depends on actual election status."],
        stateIssues: ["State registration may not match federal history."],
        needsMoreFactsBeforePreparation: true,
        confidence: "low",
      },
    });

    const report = await runTinaWeirdSmallBusinessBenchmark({
      topPriorityOnly: true,
    });

    expect(report.scenarioCount).toBe(10);
    expect(mocks.parse).toHaveBeenCalledTimes(10);
  });

  it("falls back to the diagnostic preflight engine when OPENAI_API_KEY is missing", async () => {
    delete process.env.OPENAI_API_KEY;

    const report = await runTinaWeirdSmallBusinessBenchmark({
      scenarioIds: ["late-missing-s-election"],
    });

    expect(report.model).toBe("diagnostic_preflight_fallback");
    expect(report.scenarioCount).toBe(1);
    expect(report.answerSources.openai_model).toBe(0);
    expect(report.answerSources.diagnostic_preflight_fallback).toBe(1);
    expect(report.results[0]?.answerSource).toBe("diagnostic_preflight_fallback");
    expect(report.results[0]?.diagnosticPreflight.posture).toBe("route_sensitive");
    expect(report.results[0]?.diagnosticHypotheses.overallStatus).toBe("competing_paths");
    expect(report.results[0]?.answer.needsMoreFactsBeforePreparation).toBe(true);
    expect(report.results[0]?.answer.filingsThatMayBeMissing).toContain("Form 2553");
    expect(mocks.parse).not.toHaveBeenCalled();
  });
});
