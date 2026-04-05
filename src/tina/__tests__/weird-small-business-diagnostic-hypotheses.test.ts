import { describe, expect, it } from "vitest";
import { TINA_WEIRD_SMALL_BUSINESS_SCENARIOS } from "@/tina/data/weird-small-business-scenarios";
import { buildTinaWeirdSmallBusinessDiagnosticHypotheses } from "@/tina/lib/weird-small-business-diagnostic-hypotheses";
import { buildTinaWeirdSmallBusinessDiagnosticPreflight } from "@/tina/lib/weird-small-business-diagnostic-preflight";

function buildScenarioHypotheses(id: string) {
  const scenario = TINA_WEIRD_SMALL_BUSINESS_SCENARIOS.find((item) => item.id === id);
  if (!scenario) {
    throw new Error(`Scenario ${id} not found in weird small-business catalog.`);
  }

  const preflight = buildTinaWeirdSmallBusinessDiagnosticPreflight(scenario);
  return buildTinaWeirdSmallBusinessDiagnosticHypotheses(scenario, preflight);
}

describe("weird-small-business-diagnostic-hypotheses", () => {
  it("keeps competing classification paths alive on late S-election scenarios", () => {
    const snapshot = buildScenarioHypotheses("late-missing-s-election");
    const classificationHypotheses = snapshot.hypotheses.filter(
      (item) => item.category === "tax_classification"
    );

    expect(snapshot.overallStatus).toBe("competing_paths");
    expect(snapshot.answerStyle).toBe("conditional_multi_path");
    expect(classificationHypotheses.length).toBeGreaterThan(1);
    expect(classificationHypotheses.some((item) => /s corporation/i.test(item.title))).toBe(true);
    expect(classificationHypotheses.some((item) => /default llc or/i.test(item.title))).toBe(true);
    expect(snapshot.priorityQuestions.some((item) => /2553|IRS acceptance/i.test(item))).toBe(true);
  });

  it("forces cleanup-first posture on mixed-spend recordkeeping files", () => {
    const snapshot = buildScenarioHypotheses("mixed-personal-business-spend");
    const cleanupLeading = snapshot.hypotheses.find(
      (item) => item.category === "cleanup_strategy" && item.status === "leading"
    );

    expect(snapshot.overallStatus).toBe("cleanup_before_conclusion");
    expect(snapshot.answerStyle).toBe("cleanup_first");
    expect(cleanupLeading?.title).toBe("Records-First Cleanup");
    expect(cleanupLeading?.recommendedFirstQuestion).toBeTruthy();
  });

  it("elevates state-law diagnostic pressure on multi-state registration files", () => {
    const snapshot = buildScenarioHypotheses("multi-state-entity-registration");
    const stateHypothesis = snapshot.hypotheses.find(
      (item) =>
        item.category === "state_boundary" &&
        item.conclusion === "state_law_can_change_federal_answer"
    );

    expect(stateHypothesis).toBeTruthy();
    expect(stateHypothesis?.supportingSignalCount).toBeGreaterThan(0);
    expect(stateHypothesis?.requiredProof.some((item) => /state|registration|formation/i.test(item))).toBe(true);
  });
});
