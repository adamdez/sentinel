import { describe, expect, it } from "vitest";
import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import { createDefaultTinaProfile } from "@/tina/lib/workspace-draft";

describe("recommendTinaFilingLane", () => {
  it("supports the schedule c pilot lane for a single-member llc", () => {
    const result = recommendTinaFilingLane({
      ...createDefaultTinaProfile(),
      businessName: "Tina Test LLC",
      entityType: "single_member_llc",
      ownerCount: 1,
      taxElection: "default",
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
    expect(result.blockers[0]).toContain("does not know");
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

  it("routes a two-owner business away from schedule c even if the owner split is uneven", () => {
    const result = recommendTinaFilingLane({
      ...createDefaultTinaProfile(),
      businessName: "Two Owner Shop LLC",
      entityType: "single_member_llc",
      ownerCount: 2,
      taxElection: "default",
      notes: "Ownership is 70/30, not 50/50.",
    });

    expect(result.laneId).toBe("1065");
    expect(result.support).toBe("future");
    expect(result.summary).toContain("more than one owner");
  });

  it("blocks when ownership changed during the year and Tina cannot trust the starting path yet", () => {
    const result = recommendTinaFilingLane({
      ...createDefaultTinaProfile(),
      businessName: "Changing Owners LLC",
      entityType: "single_member_llc",
      ownerCount: 1,
      taxElection: "default",
      ownershipChangedDuringYear: true,
    });

    expect(result.support).toBe("blocked");
    expect(result.title).toContain("ownership");
    expect(result.blockers.join(" ")).toContain("ownership timeline");
  });

  it("routes owner buyout scenarios into partnership-style ownership review", () => {
    const result = recommendTinaFilingLane({
      ...createDefaultTinaProfile(),
      businessName: "Three Owner Transition LLC",
      entityType: "multi_member_llc",
      ownerCount: 3,
      taxElection: "default",
      ownershipChangedDuringYear: true,
      hasOwnerBuyoutOrRedemption: true,
      hasFormerOwnerPayments: true,
    });

    expect(result.laneId).toBe("1065");
    expect(result.support).toBe("future");
    expect(result.title).toContain("ownership review");
  });

  it("blocks the pilot when idaho activity is present", () => {
    const result = recommendTinaFilingLane({
      ...createDefaultTinaProfile(),
      businessName: "Border Business",
      entityType: "sole_prop",
      hasIdahoActivity: true,
    });

    expect(result.support).toBe("blocked");
    expect(result.blockers.join(" ")).toContain("Idaho");
  });
});
