import { describe, expect, it } from "vitest";
import { buildTinaOwnershipTimeline } from "@/tina/lib/ownership-timeline";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("ownership-timeline", () => {
  it("shows a simple single-owner opening picture for the supported lane", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Single Owner LLC",
        entityType: "single_member_llc" as const,
      },
    };

    const snapshot = buildTinaOwnershipTimeline(draft);
    expect(snapshot.likelyOwnerCount).toBe(1);
    expect(snapshot.events.find((event) => event.id === "opening-owners")?.status).toBe("known");
  });

  it("captures buyout and former-owner payment events as proof-sensitive timeline items", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Buyout LLC",
        entityType: "multi_member_llc" as const,
        ownerCount: 3,
        hasOwnerBuyoutOrRedemption: true,
        hasFormerOwnerPayments: true,
      },
      sourceFacts: [
        {
          id: "former-owner-fact",
          sourceDocumentId: "doc-buyout",
          label: "Former owner payment clue",
          value: "This paper may show payments to a former owner or retiring owner.",
          confidence: "high" as const,
          capturedAt: "2026-04-02T20:05:00.000Z",
        },
      ],
    };

    const snapshot = buildTinaOwnershipTimeline(draft);
    expect(snapshot.hasFormerOwnerPayments).toBe(true);
    expect(snapshot.events.some((event) => event.id === "buyout-or-redemption")).toBe(true);
    expect(snapshot.events.some((event) => event.id === "former-owner-payments")).toBe(true);
  });
});
