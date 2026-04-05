import { describe, expect, it } from "vitest";
import { TINA_WEIRD_SMALL_BUSINESS_SCENARIOS } from "@/tina/data/weird-small-business-scenarios";
import {
  buildTinaWeirdSmallBusinessBenchmarkAnswerFromPreflight,
  buildTinaWeirdSmallBusinessDiagnosticPreflight,
} from "@/tina/lib/weird-small-business-diagnostic-preflight";

function getScenario(id: string) {
  const scenario = TINA_WEIRD_SMALL_BUSINESS_SCENARIOS.find((item) => item.id === id);
  if (!scenario) {
    throw new Error(`Scenario ${id} not found in weird small-business catalog.`);
  }
  return scenario;
}

describe("weird-small-business-diagnostic-preflight", () => {
  it("treats unfiled multi-owner LLC facts as a route-sensitive partnership diagnosis", () => {
    const preflight = buildTinaWeirdSmallBusinessDiagnosticPreflight(
      getScenario("multi-owner-llc-no-1065")
    );
    const answer = buildTinaWeirdSmallBusinessBenchmarkAnswerFromPreflight(preflight);

    expect(preflight.posture).toBe("route_sensitive");
    expect(preflight.signalIds).toContain("multi_owner");
    expect(preflight.likelyTaxClassifications).toContain("partnership");
    expect(preflight.likelyTaxClassifications).toContain("s_corporation_if_valid_election_exists");
    expect(preflight.likelyReturnsAndForms).toContain("Form 1065");
    expect(preflight.likelyReturnsAndForms).toContain("Schedule K-1");
    expect(preflight.entityAmbiguity.overallStatus).toBe("competing_routes");
    expect(preflight.entityAmbiguity.paths[0]?.conclusion).toBe("partnership");
    expect(preflight.factsToConfirmFirst).toContain("How many owners existed during the year and when");
    expect(preflight.factsToConfirmFirst).toContain("Any election documents");
    expect(preflight.factsToConfirmFirst).toContain("Ownership timeline and percentages");
    expect(preflight.biggestRiskAreas).toContain("Prior filings may have been omitted completely.");
    expect(preflight.cleanupStepsFirst[0]).toContain("ownership timeline");
    expect(answer.likelyCurrentTaxClassification).toMatch(/partnership unless a valid s-corporation election applies/i);
  });

  it("keeps unclear single-member LLC files conditional across disregarded and corporate election paths", () => {
    const preflight = buildTinaWeirdSmallBusinessDiagnosticPreflight(
      getScenario("single-member-llc-unclear-tax")
    );
    const answer = buildTinaWeirdSmallBusinessBenchmarkAnswerFromPreflight(preflight);

    expect(preflight.posture).toBe("route_sensitive");
    expect(preflight.likelyTaxClassifications).toContain("disregarded_entity");
    expect(preflight.likelyTaxClassifications).toContain("s_corporation_if_elected");
    expect(preflight.likelyTaxClassifications).toContain("c_corporation_if_elected");
    expect(preflight.likelyReturnsAndForms).toEqual(
      expect.arrayContaining(["Form 1040 Schedule C", "Form 2553", "Form 1120-S", "Form 1120"])
    );
    expect(preflight.factsToConfirmFirst).toContain("EIN notices and IRS correspondence");
    expect(preflight.factsToConfirmFirst).toContain(
      "How many owners existed at opening and closing, and did that change during the year"
    );
    expect(preflight.factsToConfirmFirst).toContain(
      "Whether payroll was run as if it were an S corp"
    );
    expect(
      preflight.stateIssues.some((item) => /annual report posture|classification history/i.test(item))
    ).toBe(true);
    expect(answer.likelyCurrentTaxClassification).toMatch(
      /disregarded entity unless a valid s- or c-corporation election applies/i
    );
  });

  it("keeps late-election files conditional across relief and fallback paths", () => {
    const preflight = buildTinaWeirdSmallBusinessDiagnosticPreflight(
      getScenario("late-missing-s-election")
    );
    const answer = buildTinaWeirdSmallBusinessBenchmarkAnswerFromPreflight(preflight);

    expect(preflight.likelyTaxClassifications).toContain(
      "s_corporation_if_valid_or_relieved_election"
    );
    expect(preflight.likelyTaxClassifications).toContain("default_llc_or_c_corp_if_not");
    expect(preflight.factsToConfirmFirst).toContain("Initial entity type");
    expect(preflight.factsToConfirmFirst).toContain("Prior-year filed returns");
    expect(preflight.federalIssues).toContain(
      "Return family changes completely if the election was invalid."
    );
    expect(answer.likelyCurrentTaxClassification).toMatch(
      /s_corporation_if_valid_or_relieved_election or default_llc_or_c_corp_if_not/i
    );
  });

  it("treats worker-classification facts as compliance-risk with payroll and state exposure", () => {
    const preflight = buildTinaWeirdSmallBusinessDiagnosticPreflight(
      getScenario("contractor-vs-employee")
    );

    expect(preflight.posture).toBe("compliance_risk");
    expect(preflight.signalIds).toContain("worker_classification");
    expect(preflight.diagnosticLane.laneId).toBe("worker_and_payroll_compliance");
    expect(preflight.diagnosticLane.classificationAnchor).toBe(
      "worker_classification_issue_inside_any_entity_type"
    );
    expect(preflight.confidenceCeiling).toBe("low");
    expect(preflight.likelyReturnsAndForms).toContain("Employment tax filings");
    expect(preflight.federalIssues.some((item) => item.includes("Employment-tax exposure"))).toBe(true);
    expect(preflight.stateIssues.some((item) => item.includes("payroll") || item.includes("unemployment"))).toBe(true);
    expect(preflight.cleanupStepsFirst.some((item) => item.includes("employee-versus-contractor"))).toBe(true);
  });

  it("keeps missed-payroll files focused on quarters, deposits, and wage-form cleanup", () => {
    const preflight = buildTinaWeirdSmallBusinessDiagnosticPreflight(
      getScenario("missed-payroll-filings")
    );

    expect(preflight.posture).toBe("compliance_risk");
    expect(preflight.signalIds).toContain("payroll");
    expect(preflight.likelyReturnsAndForms).toEqual(
      expect.arrayContaining(["Form 941", "Form W-2", "Form W-3"])
    );
    expect(
      preflight.factsToConfirmFirst.some((item) => /quarters were run through payroll|deposits actually cleared/i.test(item))
    ).toBe(true);
    expect(
      preflight.cleanupStepsFirst.some((item) => /payroll filings|deposits|annual wage forms/i.test(item))
    ).toBe(true);
  });

  it("treats no-payroll s-corp files as payroll-risk and owner-pay cleanup pressure", () => {
    const preflight = buildTinaWeirdSmallBusinessDiagnosticPreflight(
      getScenario("s-corp-no-payroll")
    );
    const answer = buildTinaWeirdSmallBusinessBenchmarkAnswerFromPreflight(preflight);

    expect(preflight.signalIds).toContain("s_corp_no_payroll");
    expect(preflight.factsToConfirmFirst).toEqual(
      expect.arrayContaining([
        "What work the owner performed in the business",
        "Whether any payroll account or provider ever existed",
      ])
    );
    expect(
      preflight.cleanupStepsFirst.some((item) =>
        /resolve payroll posture before trusting shareholder distribution characterization/i.test(item)
      )
    ).toBe(true);
    expect(
      preflight.federalIssues.some((item) =>
        /reasonable compensation and payroll compliance are still open/i.test(item)
      )
    ).toBe(true);
    expect(answer.filingsThatMayBeMissing).toEqual(
      expect.arrayContaining(["Form 941", "Form W-2", "Form W-3"])
    );
  });

  it("treats mixed-spend cleanup files as records-first and lowers certainty", () => {
    const preflight = buildTinaWeirdSmallBusinessDiagnosticPreflight(
      getScenario("mixed-personal-business-spend")
    );
    const answer = buildTinaWeirdSmallBusinessBenchmarkAnswerFromPreflight(preflight);

    expect(preflight.posture).toBe("records_first");
    expect(preflight.signalIds).toContain("mixed_spend");
    expect(preflight.diagnosticLane.laneId).toBe("books_and_reconstruction");
    expect(preflight.needsMoreFactsBeforePreparation).toBe(true);
    expect(preflight.confidenceCeiling).toBe("low");
    expect(answer.summary).toContain("books-and-records reconstruction");
    expect(answer.cleanupStepsFirst.some((item) => item.includes("personal") || item.includes("owner"))).toBe(true);
  });

  it("separates multi-state scenarios into federal and state diagnostic lanes", () => {
    const preflight = buildTinaWeirdSmallBusinessDiagnosticPreflight(
      getScenario("multi-state-entity-registration")
    );

    expect(preflight.signalIds).toContain("multi_state");
    expect(preflight.posture).toBe("route_sensitive");
    expect(preflight.cleanupStepsFirst.some((item) => item.includes("federal return-family"))).toBe(true);
    expect(preflight.stateIssues.some((item) => item.includes("nexus") || item.includes("sales-tax"))).toBe(true);
    expect(preflight.factsToConfirmFirst.some((item) => item.includes("Formation state"))).toBe(true);
  });

  it("uses the shared treatment resolver to elevate cancellation-of-debt proof and cleanup pressure", () => {
    const preflight = buildTinaWeirdSmallBusinessDiagnosticPreflight(
      getScenario("cancellation-of-debt-surprise")
    );

    expect(preflight.diagnosticLane.laneId).toBe("asset_support_and_property_treatment");
    expect(preflight.confidenceCeiling).toBe("low");
    expect(preflight.likelyReturnsAndForms).toContain("Form 982");
    expect(
      preflight.factsToConfirmFirst.some((item) => /settlement documents|solvency|lender/i.test(item))
    ).toBe(true);
    expect(
      preflight.cleanupStepsFirst.some((item) => /debt forgiveness|taxable cod income|supportable exclusion/i.test(item))
    ).toBe(true);
  });

  it("elevates undocumented owner-loan files into basis-sensitive proof and cleanup pressure", () => {
    const preflight = buildTinaWeirdSmallBusinessDiagnosticPreflight(
      getScenario("undocumented-owner-loans")
    );
    const answer = buildTinaWeirdSmallBusinessBenchmarkAnswerFromPreflight(preflight);

    expect(preflight.signalIds).toContain("basis_or_capital");
    expect(preflight.factsToConfirmFirst.some((item) => /promissory|repayment|capital/i.test(item))).toBe(
      true
    );
    expect(
      preflight.cleanupStepsFirst.some((item) => /true loans|capital infusions|basis-sensitive/i.test(item))
    ).toBe(true);
    expect(answer.summary).toContain("route-sensitive");
  });

  it("treats uneven owner-contribution files as basis rollforward and labor-for-equity cleanup pressure", () => {
    const preflight = buildTinaWeirdSmallBusinessDiagnosticPreflight(
      getScenario("unequal-owner-contributions")
    );

    expect(preflight.signalIds).toContain("basis_or_capital");
    expect(
      preflight.biggestRiskAreas.some((item) =>
        /cash, labor, and property contributions may not line up cleanly/i.test(item)
      )
    ).toBe(true);
    expect(
      preflight.cleanupStepsFirst.some((item) =>
        /cash, property, and labor contributions/i.test(item)
      )
    ).toBe(true);
  });

  it("keeps entity-change files focused on transition timing before trusting the new filing posture", () => {
    const preflight = buildTinaWeirdSmallBusinessDiagnosticPreflight(
      getScenario("entity-changed-books-never-caught-up")
    );
    const answer = buildTinaWeirdSmallBusinessBenchmarkAnswerFromPreflight(preflight);

    expect(preflight.signalIds).toContain("prior_return_drift");
    expect(preflight.likelyTaxClassifications).toContain("depends_on_transition_timeline");
    expect(preflight.factsToConfirmFirst).toContain(
      "Whether prior preparers changed return families correctly"
    );
    expect(
      preflight.factsToConfirmFirst.some((item) => /conversion dates|election|payroll actually started/i.test(item))
    ).toBe(true);
    expect(
      preflight.cleanupStepsFirst.some((item) => /transition timeline|entity continuity timeline/i.test(item))
    ).toBe(true);
    expect(
      preflight.biggestRiskAreas.some((item) =>
        /changed midstream without operational follow-through/i.test(item)
      )
    ).toBe(true);
    expect(preflight.stateIssues).toContain("State accounts may still reflect the old operating posture.");
    expect(preflight.confidenceCeiling).toBe("low");
    expect(answer.likelyCurrentTaxClassification).toBe("depends_on_transition_timeline");
  });

  it("treats prior-return drift files as entity-dependent and amendment-sensitive", () => {
    const preflight = buildTinaWeirdSmallBusinessDiagnosticPreflight(
      getScenario("prior-returns-vs-current-books-drift")
    );
    const answer = buildTinaWeirdSmallBusinessBenchmarkAnswerFromPreflight(preflight);

    expect(preflight.likelyTaxClassifications).toContain("depends_on_entity");
    expect(preflight.biggestRiskAreas).toContain("Beginning balances may be wrong.");
    expect(
      preflight.cleanupStepsFirst.some((item) =>
        /tie beginning balances to filed returns|amended-return issue/i.test(item)
      )
    ).toBe(true);
    expect(preflight.stateIssues).toContain(
      "State amended-return posture may follow the federal decision."
    );
    expect(answer.likelyCurrentTaxClassification).toBe("depends_on_entity");
  });

  it("keeps spouse-owned files explicit about the narrow single-member exception versus partnership paths", () => {
    const preflight = buildTinaWeirdSmallBusinessDiagnosticPreflight(
      getScenario("spouse-owned-unclear-treatment")
    );
    const answer = buildTinaWeirdSmallBusinessBenchmarkAnswerFromPreflight(preflight);

    expect(preflight.signalIds).toContain("spouse_owned");
    expect(preflight.factsToConfirmFirst).toContain("Whether both spouses materially participate");
    expect(answer.likelyCurrentTaxClassification).toMatch(
      /sole_proprietorship_in_narrow_cases or partnership or qualified_joint_venture_in_narrow_cases/i
    );
  });
});
