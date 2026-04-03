import { describe, expect, it } from "vitest";
import { buildTinaOfficialFormExecution } from "@/tina/lib/official-form-execution";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("official-form-execution", () => {
  it("keeps supported schedule c execution visible with real placements", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Execution Ready LLC",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "sole_prop" as const,
      },
      documents: [
        {
          id: "doc-income",
          name: "income-summary.pdf",
          size: 100,
          mimeType: "application/pdf",
          storagePath: "tina/income.pdf",
          category: "supporting_document" as const,
          requestId: "income",
          requestLabel: "Income summary",
          uploadedAt: "2026-04-03T12:00:00.000Z",
        },
        {
          id: "doc-expense",
          name: "advertising-ledger.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "tina/expense.csv",
          category: "supporting_document" as const,
          requestId: "expense",
          requestLabel: "Advertising detail",
          uploadedAt: "2026-04-03T12:01:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "fact-income",
          sourceDocumentId: "doc-income",
          label: "Income support",
          value: "Gross receipts support is complete.",
          confidence: "high" as const,
          capturedAt: "2026-04-03T12:02:00.000Z",
        },
        {
          id: "fact-expense",
          sourceDocumentId: "doc-expense",
          label: "Advertising support",
          value: "Advertising support is complete.",
          confidence: "high" as const,
          capturedAt: "2026-04-03T12:03:00.000Z",
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
            label: "Gross receipts candidate",
            amount: 22000,
            status: "ready" as const,
            summary: "Ready",
            sourceDocumentIds: ["doc-income"],
            sourceFactIds: ["fact-income"],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: [],
          },
          {
            id: "rf-advertising",
            kind: "expense" as const,
            layer: "reviewer_final" as const,
            label: "Advertising expense candidate",
            amount: 1400,
            status: "ready" as const,
            summary: "Ready",
            sourceDocumentIds: ["doc-expense"],
            sourceFactIds: ["fact-expense"],
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
            amount: 22000,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: ["rf-income"],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-income"],
          },
          {
            id: "line-8-advertising",
            lineNumber: "Line 8",
            label: "Advertising",
            amount: 1400,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: ["rf-advertising"],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-expense"],
          },
        ],
        notes: [],
      },
    };

    const snapshot = buildTinaOfficialFormExecution(draft);
    const scheduleCItem = snapshot.items.find((item) => item.formId === "f1040sc");

    expect(scheduleCItem?.templateReady).toBe(true);
    expect((scheduleCItem?.placementCount ?? 0) > 0).toBe(true);
  });

  it("blocks execution when the file routes away from the supported schedule c lane", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Blocked Route LLC",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "multi_member_llc" as const,
        ownerCount: 2,
      },
      sourceFacts: [
        {
          id: "fact-multi-owner",
          sourceDocumentId: "doc-owners",
          label: "Multi-owner clue",
          value: "This paper may show more than one owner, partner, member, K-1, or ownership split.",
          confidence: "high" as const,
          capturedAt: "2026-04-03T12:04:00.000Z",
        },
      ],
    };

    const snapshot = buildTinaOfficialFormExecution(draft);

    expect(snapshot.overallStatus).toBe("blocked");
  });
});
