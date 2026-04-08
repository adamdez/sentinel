import { describe, expect, it } from "vitest";
import { buildTinaNumericProofRows } from "@/tina/lib/numeric-proof";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("buildTinaNumericProofRows", () => {
  it("maps return fields to tie-out entries and support levels", () => {
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
      bookTieOut: {
        ...baseDraft.bookTieOut,
        status: "complete" as const,
        entries: [
          {
            id: "book-tie-out-doc-1",
            documentId: "doc-1",
            label: "QuickBooks export",
            status: "ready" as const,
            moneyIn: 18000,
            moneyOut: 4000,
            net: 14000,
            dateCoverage: "2025-01-01 through 2025-12-31",
            sourceFactIds: [],
            issueIds: [],
          },
        ],
        variances: [],
      },
      sourceFacts: [
        {
          id: "doc-1-transaction-sample-clue-1",
          sourceDocumentId: "doc-1",
          label: "Transaction sample clue",
          value: "Client deposit",
          confidence: "medium" as const,
          capturedAt: "2026-04-07T08:05:00.000Z",
        },
        {
          id: "doc-1-transaction-column-clue-1",
          sourceDocumentId: "doc-1",
          label: "Transaction column clue",
          value: "Description",
          confidence: "medium" as const,
          capturedAt: "2026-04-07T08:05:00.000Z",
        },
        {
          id: "doc-1-transaction-group-clue-1",
          sourceDocumentId: "doc-1",
          label: "Transaction group clue",
          value: "Client deposit (inflow): 2 rows, total $18,000, dates Jan 1, 2025 to Jan 30, 2025",
          confidence: "medium" as const,
          capturedAt: "2026-04-07T08:05:00.000Z",
        },
      ],
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
            reviewerFinalLineIds: [],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-1"],
          },
        ],
      },
    };

    const rows = buildTinaNumericProofRows(draft);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.supportLevel).toBe("strong");
    expect(rows[0]?.bookEntries[0]?.net).toBe(14000);
    expect(rows[0]?.transactionAnchors).toEqual(["Client deposit", "Description"]);
    expect(rows[0]?.transactionGroups).toEqual([
      "Client deposit (inflow): 2 rows, total $18,000, dates Jan 1, 2025 to Jan 30, 2025",
    ]);
    expect(rows[0]?.summary).toContain("Transaction groups");
    expect(rows[0]?.summary).toContain("Transaction anchors");
  });

  it("downgrades proof when transaction-group totals do not align with the field amount", () => {
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
      bookTieOut: {
        ...baseDraft.bookTieOut,
        status: "complete" as const,
        entries: [
          {
            id: "book-tie-out-doc-1",
            documentId: "doc-1",
            label: "QuickBooks export",
            status: "ready" as const,
            moneyIn: 18000,
            moneyOut: 4000,
            net: 14000,
            dateCoverage: "2025-01-01 through 2025-12-31",
            sourceFactIds: [],
            issueIds: [],
          },
        ],
        variances: [],
      },
      sourceFacts: [
        {
          id: "doc-1-transaction-group-clue-1",
          sourceDocumentId: "doc-1",
          label: "Transaction group clue",
          value: "Client deposit (inflow): 2 rows, total $12,000, dates Jan 1, 2025 to Jan 30, 2025",
          confidence: "medium" as const,
          capturedAt: "2026-04-07T08:05:00.000Z",
        },
      ],
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
            reviewerFinalLineIds: [],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-1"],
          },
        ],
      },
    };

    const rows = buildTinaNumericProofRows(draft);

    expect(rows[0]?.supportLevel).toBe("mixed");
    expect(rows[0]?.transactionGroupMatch).toBe("mismatch");
    expect(rows[0]?.summary).toContain("do not align cleanly");
  });
});
