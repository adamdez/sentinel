import { describe, expect, it } from "vitest";
import { buildTinaEntityAmbiguityResolver } from "@/tina/lib/entity-ambiguity-resolver";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("entity-ambiguity-resolver", () => {
  it("stays stable on a clean supported single-owner route", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const snapshot = buildTinaEntityAmbiguityResolver({
      ...base,
      profile: {
        ...base.profile,
        businessName: "Clean Sole Prop",
        taxYear: "2025",
        entityType: "single_member_llc",
        ownerCount: 1,
      },
    });

    expect(snapshot.overallStatus).toBe("stable_route");
    expect(snapshot.recommendedHandling).toBe("continue");
    expect(snapshot.hypotheses[0]?.laneId).toBe("schedule_c_single_member_llc");
  });

  it("keeps spouse-owned route ambiguity alive when community-property facts could preserve Schedule C", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const snapshot = buildTinaEntityAmbiguityResolver({
      ...base,
      profile: {
        ...base.profile,
        businessName: "Married Couple LLC",
        taxYear: "2025",
        entityType: "single_member_llc",
        ownerCount: 2,
        spouseCommunityPropertyTreatment: "confirmed",
      },
      sourceFacts: [
        {
          id: "multi-owner-fact",
          sourceDocumentId: "doc-spouse",
          label: "Multi-owner clue",
          value: "Ownership percentage 50% / 50% between spouses.",
          confidence: "high",
          capturedAt: "2026-04-04T09:00:00.000Z",
        },
      ],
    });

    expect(snapshot.overallStatus).toBe("competing_routes");
    expect(snapshot.hypotheses.some((hypothesis) => hypothesis.laneId === "1065")).toBe(true);
    expect(
      snapshot.hypotheses.some(
        (hypothesis) => hypothesis.laneId === "schedule_c_single_member_llc"
      )
    ).toBe(true);
    expect(snapshot.signals.some((signal) => signal.category === "spouse_exception")).toBe(true);
  });

  it("blocks the route when buyout-year economics and ownership transition proof are still open", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const snapshot = buildTinaEntityAmbiguityResolver({
      ...base,
      profile: {
        ...base.profile,
        businessName: "Transition LLC",
        taxYear: "2025",
        entityType: "multi_member_llc",
        ownerCount: 3,
        ownershipChangedDuringYear: true,
        hasOwnerBuyoutOrRedemption: true,
        hasFormerOwnerPayments: true,
      },
    });

    expect(snapshot.overallStatus).toBe("blocked");
    expect(snapshot.recommendedHandling).toBe("blocked_until_proved");
    expect(snapshot.signals.some((signal) => signal.category === "transition_timeline")).toBe(true);
    expect(snapshot.signals.some((signal) => signal.category === "buyout_economics")).toBe(true);
    expect(snapshot.priorityQuestions.some((question) => /ownership change|buyout/i.test(question))).toBe(true);
  });
});
