import { describe, expect, it } from "vitest";
import { TINA_SKILL_REVIEW_DRAFTS } from "@/tina/data/skill-review-fixtures";
import { buildTinaEntityLaneExecution } from "@/tina/lib/entity-lane-execution";

describe("entity-lane-execution", () => {
  it("preserves partial economics proof on buyout-year partnership files instead of flattening everything to missing", () => {
    const snapshot = buildTinaEntityLaneExecution(TINA_SKILL_REVIEW_DRAFTS["buyout-year"]);

    expect(snapshot.laneId).toBe("1065");
    expect(snapshot.economicsProofs.length).toBeGreaterThan(0);
    expect(snapshot.economicsProofs.every((proof) => proof.status !== "missing")).toBe(true);
    expect(snapshot.economicsProofs.some((proof) => proof.status === "partial")).toBe(true);
  });
});
