import { describe, expect, it } from "vitest";
import { TINA_SKILL_REVIEW_DRAFTS } from "@/tina/data/skill-review-fixtures";
import { buildTinaEightFloorGate } from "@/tina/lib/eight-floor-gate";
import { buildTinaSkillReportCard } from "@/tina/lib/skill-report-card";
import { buildTinaSmokeCaseReport } from "@/tina/lib/smoke-report";

const reports = Object.fromEntries(
  [
    "payroll-contractor-overlap",
    "heavy-depreciation-year",
    "inventory-heavy-retailer",
    "mixed-use-home-office-vehicle",
    "related-party-payments",
    "prior-return-drift",
  ].map((id) => [id, buildTinaSmokeCaseReport(TINA_SKILL_REVIEW_DRAFTS[id])])
);

const gate = buildTinaEightFloorGate();
const card = buildTinaSkillReportCard();

function report(id: keyof typeof reports) {
  return reports[id];
}

describe("eight-floor gate", () => {
  it("expands the gold dataset with harder accounting, treatment, and route fixtures", () => {
    expect(
      report("payroll-contractor-overlap").ledgerReconstruction.groups.some(
        (group) => group.category === "payroll" && group.status === "partial"
      )
    ).toBe(true);
    expect(
      report("payroll-contractor-overlap").ledgerReconstruction.groups.some(
        (group) => group.category === "contractors" && group.status === "partial"
      )
    ).toBe(true);

    expect(
      report("heavy-depreciation-year").returnPackageArtifacts.attachments.some(
        (artifact) => artifact.category === "depreciation_support"
      )
    ).toBe(true);
    expect(
      report("inventory-heavy-retailer").ledgerReconstruction.groups.some(
        (group) => group.category === "inventory" && group.status === "reconstructed"
      )
    ).toBe(true);
    expect(
      report("mixed-use-home-office-vehicle").returnPackageArtifacts.attachments.some(
        (artifact) => artifact.category === "home_office_support"
      )
    ).toBe(true);
    expect(
      report("related-party-payments").treatmentJudgment.items.some(
        (item) =>
          item.taxPositionBucket === "review" && /related-party|intercompany/i.test(item.title)
      )
    ).toBe(true);
    expect(report("prior-return-drift").startPath.recommendation.laneId).toBe("1120_s");
    expect(report("prior-return-drift").startPath.route).toBe("review_only");
  });

  it("builds a machine-readable gate and drives the report card scores from it", () => {
    expect(gate.results).toHaveLength(16);
    expect(gate.results.every((result) => result.requiredFixtureIds.length > 0)).toBe(true);

    const accounting = gate.results.find((result) => result.skillId === "accounting_fluency");
    const entityPath = gate.results.find(
      (result) => result.skillId === "entity_and_filing_path_classification"
    );
    const forms = gate.results.find(
      (result) => result.skillId === "form_and_compliance_execution"
    );

    expect(accounting?.requiredFixtureIds).toEqual(
      expect.arrayContaining([
        "payroll-contractor-overlap",
        "heavy-depreciation-year",
        "inventory-heavy-retailer",
      ])
    );
    expect(entityPath?.requiredFixtureIds).toEqual(
      expect.arrayContaining(["prior-return-drift"])
    );
    expect(forms?.requiredFixtureIds).toEqual(
      expect.arrayContaining(["heavy-depreciation-year", "mixed-use-home-office-vehicle"])
    );

    card.skills.forEach((skill) => {
      const gateResult = gate.results.find((result) => result.skillId === skill.skillId);
      expect(gateResult?.score).toBe(skill.score);
    });
  }, 300000);
});
