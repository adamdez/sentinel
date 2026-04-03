import { describe, expect, it } from "vitest";
import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import { createDefaultTinaProfile } from "@/tina/lib/workspace-draft";

describe("recommendTinaFilingLane", () => {
  it("supports the schedule c pilot lane for a single-member llc", () => {
    const result = recommendTinaFilingLane({
      ...createDefaultTinaProfile(),
      businessName: "Tina Test LLC",
      entityType: "single_member_llc",
    });

    expect(result.laneId).toBe("schedule_c_single_member_llc");
    expect(result.support).toBe("supported");
    expect(result.blockers).toHaveLength(0);
  });

  it("fails closed when the entity type is unknown", () => {
    const result = recommendTinaFilingLane({
      ...createDefaultTinaProfile(),
      businessName: "Unknown Co",
      entityType: "unsure",
    });

    expect(result.support).toBe("blocked");
    expect(result.blockers[0]).toContain("classify the return path correctly");
  });

  it("marks s-corp as a future lane", () => {
    const result = recommendTinaFilingLane({
      ...createDefaultTinaProfile(),
      businessName: "S Corp Co",
      entityType: "s_corp",
    });

    expect(result.laneId).toBe("1120_s");
    expect(result.support).toBe("future");
  });

  it("routes multi-owner intake to the partnership future lane", () => {
    const result = recommendTinaFilingLane({
      ...createDefaultTinaProfile(),
      businessName: "Two Owner LLC",
      entityType: "single_member_llc",
      ownerCount: 2,
    });

    expect(result.laneId).toBe("1065");
    expect(result.support).toBe("future");
  });

  it("routes c-corp election to the 1120 future lane", () => {
    const result = recommendTinaFilingLane({
      ...createDefaultTinaProfile(),
      businessName: "C Corp Co",
      entityType: "single_member_llc",
      taxElection: "c_corp",
    });

    expect(result.laneId).toBe("1120");
    expect(result.support).toBe("future");
  });

  it("fails closed when ownership changed during the year", () => {
    const result = recommendTinaFilingLane({
      ...createDefaultTinaProfile(),
      businessName: "Changing Owners LLC",
      entityType: "single_member_llc",
      ownershipChangedDuringYear: true,
    });

    expect(result.laneId).toBe("schedule_c_single_member_llc");
    expect(result.support).toBe("blocked");
    expect(result.blockers.join(" ")).toContain("Ownership changed");
  });

  it("keeps the likely lane visible when idaho activity is present", () => {
    const result = recommendTinaFilingLane({
      ...createDefaultTinaProfile(),
      businessName: "Border Business",
      entityType: "sole_prop",
      hasIdahoActivity: true,
    });

    expect(result.laneId).toBe("schedule_c_single_member_llc");
    expect(result.support).toBe("blocked");
    expect(result.blockers.join(" ")).toContain("Idaho");
  });

  it("keeps a three-owner buyout file on the likely partnership lane while blocking prep", () => {
    const result = recommendTinaFilingLane({
      ...createDefaultTinaProfile(),
      businessName: "Buyout LLC",
      entityType: "multi_member_llc",
      ownerCount: 3,
      hasOwnerBuyoutOrRedemption: true,
      hasFormerOwnerPayments: true,
    });

    expect(result.laneId).toBe("1065");
    expect(result.support).toBe("future");
    expect(result.blockers.join(" ")).toContain("buyout");
    expect(result.blockers.join(" ")).toContain("former owner");
  });

  it("keeps spouse community-property cases on a review-only schedule c path instead of flattening them to unknown", () => {
    const result = recommendTinaFilingLane({
      ...createDefaultTinaProfile(),
      businessName: "Community Property LLC",
      entityType: "single_member_llc",
      ownerCount: 2,
      spouseCommunityPropertyTreatment: "confirmed",
    });

    expect(result.laneId).toBe("schedule_c_single_member_llc");
    expect(result.support).toBe("future");
    expect(result.reasons.join(" ")).toContain("community-property");
  });
});
