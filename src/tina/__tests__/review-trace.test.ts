import { describe, expect, it } from "vitest";
import { buildTinaReviewTraceRows } from "@/tina/lib/review-trace";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("buildTinaReviewTraceRows", () => {
  it("maps schedule c fields back to reviewer-final lines, tax positions, and source documents", () => {
    const baseDraft = createDefaultTinaWorkspaceDraft();
    const draft = {
      ...baseDraft,
      documents: [
        {
          id: "doc-1",
          name: "qb-export.csv",
          size: 1200,
          mimeType: "text/csv",
          storagePath: "tina/qb-export.csv",
          category: "supporting_document" as const,
          requestId: "quickbooks",
          requestLabel: "QuickBooks export",
          uploadedAt: "2026-04-07T08:00:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "fact-group-1",
          sourceDocumentId: "doc-1",
          label: "Transaction group clue",
          value:
            "Client receipts (inflow): 2 rows, total $18,000.00, dates Apr 1, 2026 to Apr 30, 2026",
          confidence: "medium" as const,
          capturedAt: "2026-04-07T08:05:00.000Z",
        },
        {
          id: "fact-lineage-1",
          sourceDocumentId: "doc-1",
          label: "Transaction lineage clue",
          value:
            "Client receipts | 2026-04 (inflow): 2 rows, total $18,000.00, dates Apr 1, 2026 to Apr 30, 2026",
          confidence: "medium" as const,
          capturedAt: "2026-04-07T08:05:30.000Z",
        },
      ],
      taxAdjustments: {
        ...baseDraft.taxAdjustments,
        status: "complete" as const,
        adjustments: [
          {
            id: "adj-1",
            kind: "carryforward_line" as const,
            status: "approved" as const,
            risk: "low" as const,
            requiresAuthority: false,
            title: "Carry receipts",
            summary: "Approved.",
            suggestedTreatment: "Carry to line 1.",
            whyItMatters: "Traceability.",
            amount: 18000,
            authorityWorkIdeaIds: [],
            aiCleanupLineIds: [],
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: ["fact-group-1", "fact-lineage-1"],
            reviewerNotes: "",
          },
        ],
      },
      reviewerFinal: {
        ...baseDraft.reviewerFinal,
        status: "complete" as const,
        lines: [
          {
            id: "rf-1",
            kind: "income" as const,
            layer: "reviewer_final" as const,
            label: "Gross receipts candidate",
            amount: 18000,
            status: "ready" as const,
            summary: "Ready.",
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: [],
            issueIds: [],
            derivedFromLineIds: ["ai-1"],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: ["adj-1"],
          },
        ],
      },
      taxPositionMemory: {
        ...baseDraft.taxPositionMemory,
        status: "complete" as const,
        records: [
          {
            id: "position-1",
            adjustmentId: "adj-1",
            title: "Carry receipts",
            status: "ready" as const,
            confidence: "high" as const,
            summary: "Supported.",
            treatmentSummary: "Carry to line 1.",
            reviewerGuidance: "Strong.",
            authorityWorkIdeaIds: [],
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: [],
            reviewerOutcomeIds: [],
            reviewerOverrideIds: [],
            updatedAt: "2026-04-07T08:10:00.000Z",
          },
        ],
      },
      scheduleCDraft: {
        ...baseDraft.scheduleCDraft,
        status: "complete" as const,
        fields: [
          {
            id: "line-1",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 18000,
            status: "ready" as const,
            summary: "Mapped safely.",
            reviewerFinalLineIds: ["rf-1"],
            taxAdjustmentIds: ["adj-1"],
            sourceDocumentIds: ["doc-1"],
          },
        ],
      },
    };

    const rows = buildTinaReviewTraceRows(draft);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.reviewerFinalLabels).toEqual(["Gross receipts candidate"]);
    expect(rows[0]?.taxPositionTitles).toEqual(["Carry receipts"]);
    expect(rows[0]?.sourceDocumentNames).toEqual(["qb-export.csv"]);
    expect(rows[0]?.reconciliationStatus).toBe("needs_review");
    expect(rows[0]?.lineageCount).toBe(1);
    expect(rows[0]?.summary).toContain("Tax positions: Carry receipts.");
    expect(rows[0]?.summary).toContain("Transaction reconciliation: needs review");
  });
});
