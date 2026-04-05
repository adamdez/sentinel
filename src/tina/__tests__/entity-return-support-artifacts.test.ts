import { describe, expect, it } from "vitest";
import { TINA_SKILL_REVIEW_DRAFTS } from "@/tina/data/skill-review-fixtures";
import { buildTinaEntityReturnSupportArtifacts } from "@/tina/lib/entity-return-support-artifacts";

describe("entity-return-support-artifacts", () => {
  it("builds structured support artifacts for reviewer-controlled partnership families", () => {
    const snapshot = buildTinaEntityReturnSupportArtifacts(
      TINA_SKILL_REVIEW_DRAFTS["uneven-multi-owner"]
    );

    expect(snapshot.laneId).toBe("1065");
    expect(snapshot.items.some((item) => item.kind === "k1_package")).toBe(true);
    expect(snapshot.items.some((item) => item.kind === "capital_workpaper")).toBe(true);
    expect(snapshot.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Partner Schedule K-1 set",
          kind: "k1_package",
        }),
      ])
    );
  });

  it("keeps blocked s-corp support artifacts explicit when compensation and flow support are still missing", () => {
    const snapshot = buildTinaEntityReturnSupportArtifacts(
      TINA_SKILL_REVIEW_DRAFTS["s-corp-election"]
    );

    expect(snapshot.laneId).toBe("1120_s");
    expect(snapshot.overallStatus).toBe("blocked");
    expect(snapshot.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "compensation_workpaper",
          status: "blocked",
        }),
      ])
    );
  });
});
