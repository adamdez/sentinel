import { describe, expect, it } from "vitest";
import { TINA_SKILL_REVIEW_DRAFTS } from "@/tina/data/skill-review-fixtures";
import { buildTinaEntityReturnScheduleFamilyPayloads } from "@/tina/lib/entity-return-schedule-family-payloads";

describe("entity-return-schedule-family-payloads", () => {
  it("builds sectioned partnership schedule-family payloads for reviewer-controlled 1065 lanes", () => {
    const snapshot = buildTinaEntityReturnScheduleFamilyPayloads(
      TINA_SKILL_REVIEW_DRAFTS["uneven-multi-owner"]
    );

    expect(snapshot.laneId).toBe("1065");
    expect(snapshot.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "schedule_k1_family",
          status: "blocked",
          payloadReadiness: "blocked",
        }),
        expect.objectContaining({
          kind: "schedule_l_family",
          officialScheduleTargets: expect.arrayContaining(["Schedule L"]),
        }),
      ])
    );
    expect(
      snapshot.items.find((item) => item.kind === "schedule_k1_family")?.sections
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Recipient roster payload",
        }),
        expect.objectContaining({
          title: "Capital and basis support payload",
        }),
      ])
    );
  });

  it("keeps weak s-corp schedule-family payloads blocked when compensation support is still missing", () => {
    const snapshot = buildTinaEntityReturnScheduleFamilyPayloads(
      TINA_SKILL_REVIEW_DRAFTS["s-corp-election"]
    );

    expect(snapshot.laneId).toBe("1120_s");
    expect(snapshot.overallStatus).toBe("blocked");
    expect(snapshot.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "shareholder_flow_family",
          status: "blocked",
          payloadReadiness: "blocked",
        }),
      ])
    );
  });
});
