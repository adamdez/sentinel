import { describe, expect, it } from "vitest";
import { buildTinaEntityEconomicsReadiness } from "@/tina/lib/entity-economics-readiness";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("entity-economics-readiness", () => {
  it("blocks a partnership lane when capital and transfer economics are still thin", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Buyout Partnership LLC",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "multi_member_llc" as const,
        ownerCount: 2,
        ownershipChangedDuringYear: true,
        hasOwnerBuyoutOrRedemption: true,
        hasFormerOwnerPayments: true,
      },
      documents: [
        {
          id: "doc-operating",
          name: "operating-agreement.pdf",
          size: 100,
          mimeType: "application/pdf",
          storagePath: "tina/operating-agreement.pdf",
          category: "supporting_document" as const,
          requestId: "ownership",
          requestLabel: "Operating agreement",
          uploadedAt: "2026-04-03T08:00:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "fact-owners",
          sourceDocumentId: "doc-operating",
          label: "Ownership breakdown clue",
          value: "Operating agreement shows two partners.",
          confidence: "high" as const,
          capturedAt: "2026-04-03T08:01:00.000Z",
        },
        {
          id: "fact-1065",
          sourceDocumentId: "doc-operating",
          label: "Return type clue",
          value: "Form 1065 and K-1 references appear in the papers.",
          confidence: "high" as const,
          capturedAt: "2026-04-03T08:02:00.000Z",
        },
        {
          id: "fact-former-owner",
          sourceDocumentId: "doc-operating",
          label: "Former owner payment clue",
          value: "Former owner payments continue after the buyout.",
          confidence: "high" as const,
          capturedAt: "2026-04-03T08:03:00.000Z",
        },
      ],
    };

    const readiness = buildTinaEntityEconomicsReadiness(draft);

    expect(readiness.laneId).toBe("1065");
    expect(readiness.overallStatus).toBe("blocked");
    expect(readiness.checks.find((check) => check.id === "partner-capital")?.status).toBe("blocked");
    expect(readiness.checks.find((check) => check.id === "partner-transfers")?.status).toBe("blocked");
    expect(
      readiness.checks
        .find((check) => check.id === "partner-capital")
        ?.relatedDocumentIds.includes("doc-operating")
    ).toBe(true);
  });
});
