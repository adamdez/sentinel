import { describe, expect, it } from "vitest";
import { TINA_WEIRD_SMALL_BUSINESS_SCENARIOS } from "@/tina/data/weird-small-business-scenarios";
import { buildTinaWeirdSmallBusinessDiagnosticPreflight } from "@/tina/lib/weird-small-business-diagnostic-preflight";

function getScenario(id: string) {
  const scenario = TINA_WEIRD_SMALL_BUSINESS_SCENARIOS.find((item) => item.id === id);
  if (!scenario) {
    throw new Error(`Scenario ${id} not found in weird small-business catalog.`);
  }
  return scenario;
}

describe("weird-small-business-entity-ambiguity", () => {
  it("keeps late-election scenarios in competing entity paths", () => {
    const preflight = buildTinaWeirdSmallBusinessDiagnosticPreflight(
      getScenario("late-missing-s-election")
    );

    expect(preflight.entityAmbiguity.overallStatus).toBe("competing_routes");
    expect(preflight.entityAmbiguity.paths.length).toBeGreaterThan(1);
    expect(
      preflight.entityAmbiguity.paths.some((path) => /s corporation/i.test(path.title))
    ).toBe(true);
    expect(
      preflight.entityAmbiguity.paths.some((path) => /default llc/i.test(path.title))
    ).toBe(true);
  });

  it("keeps spouse-owned scenarios conditional instead of flattening early", () => {
    const preflight = buildTinaWeirdSmallBusinessDiagnosticPreflight(
      getScenario("spouse-owned-unclear-treatment")
    );

    expect(preflight.entityAmbiguity.overallStatus).toBe("competing_routes");
    expect(
      preflight.entityAmbiguity.paths.some((path) => /qualified joint venture/i.test(path.title))
    ).toBe(true);
    expect(
      preflight.factsToConfirmFirst.some((item) => /state of residence|property-law posture/i.test(item))
    ).toBe(true);
  });
});
