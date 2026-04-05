import { describe, expect, it } from "vitest";
import { TINA_SKILL_REVIEW_DRAFTS } from "@/tina/data/skill-review-fixtures";
import { buildTinaEntityReturnScheduleFamilyFinalizations } from "@/tina/lib/entity-return-schedule-family-finalizations";

describe("entity-return-schedule-family-finalizations", () => {
  it("builds line-oriented partnership schedule-family finalizations for reviewer-controlled 1065 lanes", () => {
    const snapshot = buildTinaEntityReturnScheduleFamilyFinalizations(
      TINA_SKILL_REVIEW_DRAFTS["uneven-multi-owner"]
    );

    expect(snapshot.laneId).toBe("1065");
    expect(snapshot.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "schedule_k1_family",
          status: "blocked",
          finalizationReadiness: "blocked",
        }),
        expect.objectContaining({
          kind: "schedule_l_family",
          officialScheduleTargets: expect.arrayContaining(["Schedule L"]),
        }),
      ])
    );
    expect(
      snapshot.items.find((item) => item.kind === "schedule_k1_family")?.lineItems
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: "Schedule K-1 recipient roster",
        }),
        expect.objectContaining({
          target: "Schedule K-1 capital and basis support",
        }),
      ])
    );
  });

  it("keeps weak s-corp shareholder-flow finalizations blocked when compensation support is still missing", () => {
    const snapshot = buildTinaEntityReturnScheduleFamilyFinalizations(
      TINA_SKILL_REVIEW_DRAFTS["s-corp-election"]
    );

    expect(snapshot.laneId).toBe("1120_s");
    expect(snapshot.overallStatus).toBe("blocked");
    expect(snapshot.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "shareholder_flow_family",
          status: "blocked",
          finalizationReadiness: "blocked",
        }),
      ])
    );
  });
});
