import { describe, expect, it } from "vitest";
import { TINA_SKILL_REVIEW_DRAFTS } from "@/tina/data/skill-review-fixtures";
import { buildTinaOwnerFlowBasisAdjudication } from "@/tina/lib/owner-flow-basis-adjudication";

describe("owner-flow-basis-adjudication", () => {
  it("stays clear on supported Schedule C files without owner-flow pressure", () => {
    const snapshot = buildTinaOwnerFlowBasisAdjudication(
      TINA_SKILL_REVIEW_DRAFTS["supported-core"]
    );

    expect(snapshot.laneId).toBe("schedule_c_single_member_llc");
    expect(snapshot.overallStatus).toBe("clear");
    expect(snapshot.openingFootingStatus).toBe("not_applicable");
    expect(snapshot.basisRollforwardStatus).toBe("not_applicable");
    expect(snapshot.transitionEconomicsStatus).toBe("not_applicable");
    expect(snapshot.items).toHaveLength(0);
  });

  it("blocks buyout-year files when ownership-change and redemption economics are still thin", () => {
    const snapshot = buildTinaOwnerFlowBasisAdjudication(
      TINA_SKILL_REVIEW_DRAFTS["buyout-year"]
    );

    expect(snapshot.laneId).toBe("1065");
    expect(snapshot.overallStatus).toBe("blocked");
    expect(snapshot.blockedItemCount).toBeGreaterThan(0);
    expect(snapshot.transitionEconomicsStatus).toBe("blocked");
    expect(["blocked", "review_required"]).toContain(snapshot.basisRollforwardStatus);
    expect(snapshot.items.find((item) => item.id === "ownership-change-allocation")?.status).toBe(
      "blocked"
    );
    expect(snapshot.items.find((item) => item.id === "buyout-redemption")?.status).toBe(
      "blocked"
    );
  });

  it("keeps uneven multi-owner files under review for basis-sensitive distributions", () => {
    const snapshot = buildTinaOwnerFlowBasisAdjudication(
      TINA_SKILL_REVIEW_DRAFTS["uneven-multi-owner"]
    );

    expect(snapshot.laneId).toBe("1065");
    expect(["blocked", "review_required"]).toContain(snapshot.overallStatus);
    expect(snapshot.items.find((item) => item.id === "opening-basis-footing")).toBeTruthy();
    expect(snapshot.items.find((item) => item.id === "basis-rollforward-continuity")).toBeTruthy();
    expect(snapshot.items.find((item) => item.id === "distribution-taxability")).toBeTruthy();
    expect(["blocked", "review_required"]).toContain(snapshot.basisRollforwardStatus);
    expect(
      ["blocked", "needs_review"].includes(
        snapshot.items.find((item) => item.id === "distribution-taxability")?.status ?? ""
      )
    ).toBe(true);
  });
});
