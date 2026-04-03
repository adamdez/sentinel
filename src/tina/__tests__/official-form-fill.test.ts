import { describe, expect, it } from "vitest";
import { buildTinaOfficialFormFill } from "@/tina/lib/official-form-fill";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("official-form-fill", () => {
  it("builds a Schedule C overlay plan for the supported lane", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Overlay Ready LLC",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "sole_prop" as const,
      },
      reviewerFinal: {
        ...createDefaultTinaWorkspaceDraft().reviewerFinal,
        status: "complete" as const,
        lines: [
          {
            id: "rf-income",
            kind: "income" as const,
            layer: "reviewer_final" as const,
            label: "Gross receipts candidate",
            amount: 15000,
            status: "ready" as const,
            summary: "Ready",
            sourceDocumentIds: ["doc-income", "doc-bank"],
            sourceFactIds: ["fact-income"],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: ["tax-income"],
          },
        ],
      },
      scheduleCDraft: {
        ...createDefaultTinaWorkspaceDraft().scheduleCDraft,
        status: "complete" as const,
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 15000,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: ["rf-income"],
            taxAdjustmentIds: ["tax-income"],
            sourceDocumentIds: ["doc-income", "doc-bank"],
          },
        ],
        notes: [],
      },
      packageReadiness: {
        ...createDefaultTinaWorkspaceDraft().packageReadiness,
        status: "complete" as const,
        level: "ready_for_cpa" as const,
        items: [],
      },
    };

    const snapshot = buildTinaOfficialFormFill(draft);

    expect(snapshot.formId).toBe("f1040sc");
    expect(snapshot.mode).toBe("overlay_plan");
    expect(snapshot.overallStatus).toBe("ready");
    expect(snapshot.placements.some((placement) => placement.fieldKey === "grossReceipts")).toBe(
      true
    );
    expect(snapshot.placements.some((placement) => placement.fieldKey === "businessName")).toBe(
      true
    );
  });

  it("blocks the fill plan when the file routes away from supported Schedule C", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Blocked Overlay LLC",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "multi_member_llc" as const,
        ownerCount: 2,
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
      ],
    };

    const snapshot = buildTinaOfficialFormFill(draft);

    expect(snapshot.overallStatus).toBe("blocked");
    expect(snapshot.mode).toBe("blocked_route");
    expect(snapshot.placements).toHaveLength(0);
  });
});
