import { describe, expect, it } from "vitest";
import { buildTinaFederalReturnRequirements } from "@/tina/lib/federal-return-requirements";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("federal-return-requirements", () => {
  it("marks the supported schedule c lane as finishable when the path is clean", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Solo LLC",
        taxYear: "2025",
        entityType: "sole_prop" as const,
      },
    };

    const snapshot = buildTinaFederalReturnRequirements(draft);

    expect(snapshot.returnFamily).toBe("Form 1040 Schedule C");
    expect(snapshot.canTinaFinishLane).toBe(true);
    expect(snapshot.items[0]?.status).toBe("ready");
  });

  it("builds a blocked partnership requirement map for multi-owner llcs with missing proof", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Wild LLC",
        taxYear: "2025",
        entityType: "multi_member_llc" as const,
        ownerCount: 3,
        hasOwnerBuyoutOrRedemption: true,
      },
      sourceFacts: [
        {
          id: "multi-owner-fact",
          sourceDocumentId: "doc-owners",
          label: "Multi-owner clue",
          value: "This paper may show more than one owner, partner, member, K-1, or ownership split.",
          confidence: "high" as const,
          capturedAt: "2026-03-27T05:02:00.000Z",
        },
        {
          id: "ownership-change-fact",
          sourceDocumentId: "doc-owners",
          label: "Ownership change clue",
          value: "This paper may show an ownership change.",
          confidence: "high" as const,
          capturedAt: "2026-03-27T05:03:00.000Z",
        },
      ],
    };

    const snapshot = buildTinaFederalReturnRequirements(draft);

    expect(snapshot.returnFamily).toBe("Partnership return");
    expect(snapshot.canTinaFinishLane).toBe(false);
    expect(snapshot.items.some((item) => item.id === "partnership-core")).toBe(true);
    expect(snapshot.items.some((item) => item.status === "blocked")).toBe(true);
  });

  it("builds an s-corp requirement map when election clues point to 1120-s", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Election LLC",
        taxYear: "2025",
        entityType: "single_member_llc" as const,
      },
      sourceFacts: [
        {
          id: "return-hint-fact",
          sourceDocumentId: "doc-prior",
          label: "Return type hint",
          value: "Prior return looks like an 1120-S filing.",
          confidence: "high" as const,
          capturedAt: "2026-03-27T05:02:00.000Z",
        },
      ],
    };

    const snapshot = buildTinaFederalReturnRequirements(draft);

    expect(snapshot.returnFamily).toBe("S-corporation return");
    expect(snapshot.canTinaFinishLane).toBe(false);
    expect(snapshot.items.some((item) => item.id === "s-corp-core")).toBe(true);
    expect(snapshot.items[0]?.requiredForms).toContain("Form 1120-S");
  });
});
