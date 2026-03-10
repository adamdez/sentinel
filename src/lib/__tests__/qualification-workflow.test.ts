import { describe, expect, it } from "vitest";
import {
  computeQualificationScoreTotal,
  mergeQualificationScoreState,
  resolveQualificationTaskAssignee,
  type QualificationScoreState,
} from "@/lib/qualification-workflow";

describe("qualification workflow hardening", () => {
  it("fails fast when escalation target is missing", () => {
    const result = resolveQualificationTaskAssignee({
      escalationReviewOnly: true,
      escalationTargetUserId: "",
      effectiveAssignedTo: "owner-1",
      actorUserId: "actor-1",
    });

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("ESCALATION_TARGET_USER_ID");
    }
  });

  it("recomputes qualification score correctly on partial updates", () => {
    const current: QualificationScoreState = {
      motivationLevel: 3,
      sellerTimeline: "immediate",
      conditionLevel: 3,
      occupancyScore: 2,
      equityFlexibilityScore: 4,
      decisionMakerConfirmed: false,
      priceExpectation: 150000,
      estimatedValue: 200000,
    };

    const patch = { motivationLevel: 5 };
    const merged = mergeQualificationScoreState(current, patch);
    const total = computeQualificationScoreTotal(merged);

    // 5 + timeline(5) + 3 + 2 + dm(2) + price(4) + 4 = 25
    expect(total).toBe(25);
  });
});
