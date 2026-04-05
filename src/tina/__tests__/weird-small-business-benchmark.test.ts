import { describe, expect, it } from "vitest";
import {
  TINA_WEIRD_SMALL_BUSINESS_SCENARIOS,
  TINA_WEIRD_SMALL_BUSINESS_TOP_PRIORITY_IDS,
} from "@/tina/data/weird-small-business-scenarios";
import { buildTinaWeirdSmallBusinessBenchmarkSnapshot } from "@/tina/lib/weird-small-business-benchmark";

describe("weird-small-business-benchmark", () => {
  it("builds a 25-scenario offline-first benchmark catalog", () => {
    const snapshot = buildTinaWeirdSmallBusinessBenchmarkSnapshot();

    expect(snapshot.runMode).toBe("offline_first");
    expect(snapshot.offlineReady).toBe(true);
    expect(snapshot.scenarioCount).toBe(25);
    expect(snapshot.scenarios).toHaveLength(25);
    expect(snapshot.groupCounts.entity_and_election_problems).toBe(5);
    expect(snapshot.groupCounts.ownership_and_basis_problems).toBe(5);
    expect(snapshot.groupCounts.worker_classification_and_payroll_problems).toBe(5);
    expect(snapshot.groupCounts.recordkeeping_and_cleanup_problems).toBe(5);
    expect(snapshot.groupCounts.assets_depreciation_and_property_problems).toBe(5);
  });

  it("preserves the top 10 priority weird cases for fast pilot runs", () => {
    const snapshot = buildTinaWeirdSmallBusinessBenchmarkSnapshot();

    expect(snapshot.topPriorityScenarioIds).toEqual([...TINA_WEIRD_SMALL_BUSINESS_TOP_PRIORITY_IDS]);
    expect(snapshot.topPriorityScenarioIds).toHaveLength(10);
    expect(snapshot.topPriorityScenarioIds).toContain("contractor-vs-employee");
    expect(snapshot.topPriorityScenarioIds).toContain("late-missing-s-election");
    expect(snapshot.topPriorityScenarioIds).toContain("mixed-use-vehicles");
  });

  it("gives every scenario the core diagnostic fields needed for Tina evaluation", () => {
    for (const scenario of TINA_WEIRD_SMALL_BUSINESS_SCENARIOS) {
      expect(scenario.summary.length).toBeGreaterThan(20);
      expect(scenario.factPattern.length).toBeGreaterThan(30);
      expect(scenario.diagnosticProblems.length).toBeGreaterThan(0);
      expect(scenario.likelyReturnsAndForms.length).toBeGreaterThan(0);
      expect(scenario.missingFactsToConfirm.length).toBeGreaterThan(0);
      expect(scenario.cleanupStepsFirst.length).toBeGreaterThan(0);
      expect(scenario.targetedSkills.length).toBeGreaterThan(0);
      expect(scenario.targetedOutcomes.length).toBeGreaterThan(0);
    }
  });

  it("includes the benchmark prompt format for offline Tina answer reviews", () => {
    const snapshot = buildTinaWeirdSmallBusinessBenchmarkSnapshot();

    expect(snapshot.benchmarkQuestions).toContain("What is the likely current tax classification?");
    expect(snapshot.benchmarkQuestions).toContain("What filings may be missing?");
    expect(snapshot.benchmarkPromptTemplate).toContain("What cleanup steps should happen first?");
    expect(snapshot.benchmarkPromptTemplate).toContain("Which issues are federal versus state?");
  });
});
