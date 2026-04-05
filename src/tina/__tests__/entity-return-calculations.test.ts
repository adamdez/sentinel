import { describe, expect, it } from "vitest";
import { TINA_SKILL_REVIEW_DRAFTS } from "@/tina/data/skill-review-fixtures";
import { buildTinaEntityReturnCalculations } from "@/tina/lib/entity-return-calculations";

describe("entity-return-calculations", () => {
  it("builds structured partnership return values for reviewer-controlled 1065 lanes", () => {
    const snapshot = buildTinaEntityReturnCalculations(
      TINA_SKILL_REVIEW_DRAFTS["uneven-multi-owner"]
    );
    const primary = snapshot.items.find((item) => item.formId === "f1065");

    expect(snapshot.laneId).toBe("1065");
    expect(primary?.status).toBe("blocked");
    expect(primary?.fields.length).toBeGreaterThan(0);
    expect(primary?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Likely partner count",
          value: "2",
        }),
        expect.objectContaining({
          label: "Ownership split signal",
          value: "70/30",
        }),
        expect.objectContaining({
          label: "Books and balance-sheet support",
          value: "Missing or blocked",
        }),
        expect.objectContaining({
          label: "Owner-flow characterization",
        }),
        expect.objectContaining({
          label: "Distribution taxability and basis footing",
        }),
      ])
    );
  });

  it("keeps blocked s-corp entity values visible without pretending they are stable", () => {
    const snapshot = buildTinaEntityReturnCalculations(
      TINA_SKILL_REVIEW_DRAFTS["s-corp-election"]
    );
    const primary = snapshot.items.find((item) => item.formId === "f1120s");

    expect(snapshot.laneId).toBe("1120_s");
    expect(snapshot.overallStatus).toBe("blocked");
    expect(primary?.status).toBe("blocked");
    expect(primary?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "S-election proof",
        }),
        expect.objectContaining({
          label: "Shareholder basis footing",
        }),
      ])
    );
  });
});
