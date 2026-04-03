import { describe, expect, it } from "vitest";
import { buildTinaOwnershipCapitalEvents } from "@/tina/lib/ownership-capital-events";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("ownership-capital-events", () => {
  it("surfaces blocked buyout-year ownership and capital events", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const snapshot = buildTinaOwnershipCapitalEvents({
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
      sourceFacts: [
        {
          id: "former-owner-fact",
          sourceDocumentId: "doc-buyout",
          label: "Former owner payment clue",
          value: "Company funds were used for payout to former owner.",
          confidence: "high",
          capturedAt: "2026-04-02T10:00:00.000Z",
        },
      ],
    });

    expect(snapshot.overallStatus).toBe("blocked");
    expect(snapshot.likelyOwnerCount).toBe(3);
    expect(snapshot.blockedEventCount).toBeGreaterThan(0);
    expect(snapshot.events.some((event) => event.id === "buyout-redemption")).toBe(true);
    expect(snapshot.events.some((event) => event.id === "former-owner-payments")).toBe(true);
    expect(snapshot.events.some((event) => event.id === "capital-economics")).toBe(true);
  });
});
