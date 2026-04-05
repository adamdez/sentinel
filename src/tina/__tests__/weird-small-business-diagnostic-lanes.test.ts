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

describe("weird-small-business-diagnostic-lanes", () => {
  it("builds a worker/payroll lane with a real filing ladder on 1099 cleanup files", () => {
    const preflight = buildTinaWeirdSmallBusinessDiagnosticPreflight(
      getScenario("missing-w9-1099")
    );

    expect(preflight.diagnosticLane.laneId).toBe("worker_and_payroll_compliance");
    expect(preflight.diagnosticLane.entityRole).toBe("entity_secondary");
    expect(preflight.diagnosticLane.filingLadder.some((item) => item.label === "Form 1099-NEC")).toBe(true);
    expect(
      preflight.diagnosticLane.filingLadder.some(
        (item) => item.label === "possible payroll filings if workers were misclassified"
      )
    ).toBe(true);
    expect(
      preflight.diagnosticLane.factBuckets.some((bucket) =>
        bucket.facts.some((fact) => /threshold|card|direct/i.test(fact))
      )
    ).toBe(true);
  });

  it("builds a books-reconstruction lane on cash-business files", () => {
    const preflight = buildTinaWeirdSmallBusinessDiagnosticPreflight(
      getScenario("cash-business-incomplete-sales")
    );

    expect(preflight.diagnosticLane.laneId).toBe("books_and_reconstruction");
    expect(preflight.diagnosticLane.entityRole).toBe("entity_deferred_until_cleanup");
    expect(
      preflight.diagnosticLane.filingLadder.some(
        (item) => item.label === "income reconstruction support schedules"
      )
    ).toBe(true);
    expect(
      preflight.diagnosticLane.factBuckets.some((bucket) =>
        bucket.facts.some((fact) => /cash handling|point-of-sale|notebook/i.test(fact))
      )
    ).toBe(true);
  });

  it("builds a multi-year filing backlog lane on missed-years cleanup files", () => {
    const preflight = buildTinaWeirdSmallBusinessDiagnosticPreflight(
      getScenario("years-of-missed-filings")
    );

    expect(preflight.diagnosticLane.laneId).toBe("multi_year_filing_backlog");
    expect(preflight.diagnosticLane.classificationAnchor).toBe("depends_on_actual_entity_history");
    expect(preflight.diagnosticLane.confidenceCeiling).toBe("low");
    expect(
      preflight.diagnosticLane.filingLadder.some(
        (item) => item.label === "Schedule C or 1065 or 1120-S or 1120"
      )
    ).toBe(true);
    expect(
      preflight.diagnosticLane.factBuckets.some((bucket) =>
        bucket.facts.some((fact) => /which years|entity elections|registrations/i.test(fact))
      )
    ).toBe(true);
  });

  it("builds an asset-support lane on capitalization files and keeps certainty low", () => {
    const preflight = buildTinaWeirdSmallBusinessDiagnosticPreflight(
      getScenario("capitalization-vs-expense")
    );

    expect(preflight.diagnosticLane.laneId).toBe("asset_support_and_property_treatment");
    expect(preflight.diagnosticLane.classificationAnchor).toBe("depends_on_entity");
    expect(preflight.diagnosticLane.confidenceCeiling).toBe("low");
    expect(
      preflight.diagnosticLane.filingLadder.some(
        (item) => item.label === "supporting fixed-asset schedules"
      )
    ).toBe(true);
    expect(
      preflight.diagnosticLane.factBuckets.some((bucket) =>
        bucket.facts.some((fact) => /invoice|useful life|placed-in-service/i.test(fact))
      )
    ).toBe(true);
  });
});
