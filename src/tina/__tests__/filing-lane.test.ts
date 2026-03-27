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
