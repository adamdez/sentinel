import { describe, expect, it } from "vitest";
import { buildTinaReviewerChallenges } from "@/tina/lib/reviewer-challenges";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("reviewer-challenges", () => {
  it("flags blocked start-path and missing proof as likely reviewer challenges", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Complex LLC",
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
          capturedAt: "2026-04-02T19:20:00.000Z",
        },
      ],
    };

    const snapshot = buildTinaReviewerChallenges(draft);

    expect(snapshot.items.some((item) => item.id === "route-judgment-challenge")).toBe(true);
    expect(snapshot.items.some((item) => item.id === "proof-ownership-agreement")).toBe(true);
  });

  it("flags weak evidence support on non-zero form lines", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Weak Evidence LLC",
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
      packageReadiness: {
        ...createDefaultTinaWorkspaceDraft().packageReadiness,
        status: "complete" as const,
        level: "ready_for_cpa" as const,
        items: [],
      },
    };

    const snapshot = buildTinaReviewerChallenges(draft);
    expect(snapshot.items.some((item) => item.category === "evidence")).toBe(true);
  });

  it("flags the whole return when every non-zero line still has only thin evidence", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Paper Moon LLC",
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
      packageReadiness: {
        ...createDefaultTinaWorkspaceDraft().packageReadiness,
        status: "complete" as const,
        level: "ready_for_cpa" as const,
        items: [],
      },
    };

    const snapshot = buildTinaReviewerChallenges(draft);

    expect(snapshot.items.some((item) => item.id === "whole-return-thin-evidence")).toBe(true);
  });
});
