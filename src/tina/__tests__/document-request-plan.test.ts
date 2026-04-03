import { describe, expect, it } from "vitest";
import { buildTinaDocumentRequestPlan } from "@/tina/lib/document-request-plan";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("document-request-plan", () => {
  it("prioritizes ownership proof and weak evidence asks", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Complex LLC",
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
          capturedAt: "2026-04-03T09:05:00.000Z",
        },
      ],
      reviewerFinal: {
        ...createDefaultTinaWorkspaceDraft().reviewerFinal,
        status: "complete" as const,
        lines: [
          {
            id: "rf-income",
            kind: "income" as const,
            layer: "reviewer_final" as const,
            label: "Income",
            amount: 12000,
            status: "ready" as const,
            summary: "Ready",
            sourceDocumentIds: [],
            sourceFactIds: [],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: [],
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
            amount: 12000,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: ["rf-income"],
            taxAdjustmentIds: [],
            sourceDocumentIds: [],
          },
        ],
        notes: [],
      },
    };

    const plan = buildTinaDocumentRequestPlan(draft);

    expect(plan.overallStatus).toBe("blocked");
    expect(plan.items.find((item) => item.id === "proof-ownership-agreement")?.priority).toBe(
      "immediate"
    );
    expect(plan.items.some((item) => item.id.startsWith("evidence-"))).toBe(true);
  });
});
