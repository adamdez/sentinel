import { describe, expect, it } from "vitest";
import { buildTinaFederalReturnClassification } from "@/tina/lib/federal-return-classification";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("federal-return-classification", () => {
  it("builds a high-confidence supported Schedule C classification when the lane is clean", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const snapshot = buildTinaFederalReturnClassification({
      ...base,
      profile: {
        ...base.profile,
        businessName: "Clean Sole Prop",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "sole_prop",
      },
    });

    expect(snapshot.route).toBe("supported");
    expect(snapshot.confidence).toBe("high");
    expect(snapshot.returnFamily).toBe("Form 1040 Schedule C");
    expect(snapshot.issues).toHaveLength(0);
    expect(snapshot.signals.some((signal) => signal.id === "organizer-posture")).toBe(true);
  });

  it("blocks classification when ownership-change and buyout facts make the route unsafe", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const snapshot = buildTinaFederalReturnClassification({
      ...base,
      profile: {
        ...base.profile,
        businessName: "Buyout Year LLC",
        taxYear: "2025",
        entityType: "multi_member_llc",
        ownerCount: 3,
        ownershipChangedDuringYear: true,
        hasOwnerBuyoutOrRedemption: true,
        hasFormerOwnerPayments: true,
      },
      documents: [
        {
          id: "doc-1065",
          name: "2025-Form-1065.pdf",
          size: 120,
          mimeType: "application/pdf",
          storagePath: "tina/2025-Form-1065.pdf",
          category: "prior_return",
          requestId: "prior-return",
          requestLabel: "Prior return",
          uploadedAt: "2026-04-02T09:00:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "return-type-1065",
          sourceDocumentId: "doc-1065",
          label: "Return type hint",
          value: "Form 1065 partnership return",
          confidence: "high",
          capturedAt: "2026-04-02T09:01:00.000Z",
        },
      ],
    });

    expect(snapshot.route).toBe("blocked");
    expect(snapshot.confidence).toBe("blocked");
    expect(snapshot.returnFamily).toBe("Partnership return");
    expect(snapshot.signals.some((signal) => signal.id === "paper-trail-hints")).toBe(true);
    expect(snapshot.issues.some((issue) => issue.severity === "blocking")).toBe(true);
  });
});
