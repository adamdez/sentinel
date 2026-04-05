import { describe, expect, it } from "vitest";
import { TINA_SKILL_REVIEW_DRAFTS } from "@/tina/data/skill-review-fixtures";
import { buildTinaEntityReturnScheduleFamilyArtifacts } from "@/tina/lib/entity-return-schedule-family-artifacts";

describe("entity-return-schedule-family-artifacts", () => {
  it("builds explicit partnership schedule families behind reviewer-controlled 1065 lanes", () => {
    const snapshot = buildTinaEntityReturnScheduleFamilyArtifacts(
      TINA_SKILL_REVIEW_DRAFTS["uneven-multi-owner"]
    );

    expect(snapshot.laneId).toBe("1065");
    expect(snapshot.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "schedule_k1_family",
          title: "Partnership Schedule K-1 family",
        }),
        expect.objectContaining({
          kind: "schedule_l_family",
          title: "Partnership Schedule L family",
        }),
        expect.objectContaining({
          kind: "capital_family",
          title: "Partner capital family",
        }),
      ])
    );
    expect(
      snapshot.items.find((item) => item.kind === "schedule_k1_family")?.fields
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldKey: "likely_k1_recipient_count",
        }),
        expect.objectContaining({
          fieldKey: "capital_rollforward_support",
        }),
      ])
    );
  });

  it("keeps blocked shareholder-flow families explicit for weak s-corp files", () => {
    const snapshot = buildTinaEntityReturnScheduleFamilyArtifacts(
      TINA_SKILL_REVIEW_DRAFTS["s-corp-election"]
    );

    expect(snapshot.laneId).toBe("1120_s");
    expect(snapshot.overallStatus).toBe("blocked");
    expect(snapshot.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "shareholder_flow_family",
          status: "blocked",
        }),
      ])
    );
  });
});
