import { describe, expect, it } from "vitest";
import { buildTinaIssueQueue, markTinaIssueQueueStale } from "@/tina/lib/issue-queue";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";
import type { TinaWorkspaceDraft } from "@/tina/types";

function buildDraft(overrides?: Partial<TinaWorkspaceDraft>): TinaWorkspaceDraft {
  return {
    ...createDefaultTinaWorkspaceDraft(),
    ...overrides,
    profile: {
      ...createDefaultTinaWorkspaceDraft().profile,
      ...(overrides?.profile ?? {}),
    },
  };
}

describe("buildTinaIssueQueue", () => {
  it("flags a saved prior return that still needs reading", () => {
    const draft = buildDraft({
      priorReturnDocumentId: "prior-doc",
      documents: [
        {
          id: "prior-doc",
          name: "2024-return.pdf",
          size: 2048,
          mimeType: "application/pdf",
          storagePath: "tax/prior-doc.pdf",
          category: "prior_return",
          requestId: "prior-return",
          requestLabel: "Last year's tax return",
          uploadedAt: "2026-03-26T21:00:00.000Z",
        },
      ],
    });

    const issueQueue = buildTinaIssueQueue(draft);

    expect(issueQueue.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "prior-return-needs-reading",
          category: "continuity",
        }),
      ])
    );
    expect(issueQueue.records.find((record) => record.id === "prior-year")?.status).toBe(
      "needs_attention"
    );
  });

  it("blocks when a saved paper hints at a different return type", () => {
    const draft = buildDraft({
      profile: {
        businessName: "Tina Test LLC",
        entityType: "single_member_llc",
      },
      sourceFacts: [
        {
          id: "return-type",
          sourceDocumentId: "prior-doc",
          label: "Return type hint",
          value: "1120-S",
          confidence: "high",
          capturedAt: "2026-03-26T21:10:00.000Z",
        },
      ],
    });

    const issueQueue = buildTinaIssueQueue(draft);

    expect(issueQueue.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "return-type-hint-conflict",
          severity: "blocking",
        }),
      ])
    );
    expect(issueQueue.records.find((record) => record.id === "filing-lane")?.status).toBe(
      "needs_attention"
    );
  });

  it("uses money clues in the books prep summary and flags wrong-year books", () => {
    const draft = buildDraft({
      profile: {
        taxYear: "2025",
      },
      documents: [
        {
          id: "books-doc",
          name: "books.csv",
          size: 2048,
          mimeType: "text/csv",
          storagePath: "tax/books.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks or your profit-and-loss report",
          uploadedAt: "2026-03-26T21:15:00.000Z",
        },
        {
          id: "bank-doc",
          name: "bank.csv",
          size: 2048,
          mimeType: "text/csv",
          storagePath: "tax/bank.csv",
          category: "supporting_document",
          requestId: "bank-support",
          requestLabel: "Business bank and card statements",
          uploadedAt: "2026-03-26T21:16:00.000Z",
        },
      ],
      documentReadings: [
        {
          documentId: "books-doc",
          status: "complete",
          kind: "spreadsheet",
          summary: "Tina found a first money picture.",
          nextStep: "Keep going.",
          facts: [],
          detailLines: [],
          rowCount: 22,
          headers: ["Date", "Amount"],
          sheetNames: ["Sheet1"],
          lastReadAt: "2026-03-26T21:20:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "books-money-in",
          sourceDocumentId: "books-doc",
          label: "Money in clue",
          value: "$18,000.00",
          confidence: "medium",
          capturedAt: "2026-03-26T21:20:00.000Z",
        },
        {
          id: "books-money-out",
          sourceDocumentId: "books-doc",
          label: "Money out clue",
          value: "$4,000.00",
          confidence: "medium",
          capturedAt: "2026-03-26T21:20:00.000Z",
        },
        {
          id: "books-range",
          sourceDocumentId: "books-doc",
          label: "Date range clue",
          value: "2024-01-01 through 2024-12-31",
          confidence: "high",
          capturedAt: "2026-03-26T21:20:00.000Z",
        },
      ],
    });

    const issueQueue = buildTinaIssueQueue(draft);

    expect(issueQueue.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "books-tax-year-mismatch",
          category: "books",
        }),
      ])
    );

    const booksRecord = issueQueue.records.find((record) => record.id === "books");
    expect(booksRecord?.summary).toContain("read 1 money paper");
    expect(booksRecord?.summary).toContain("$18,000 coming in");
    expect(booksRecord?.summary).toContain("$4,000 going out");
    expect(booksRecord?.summary).toContain("2024");
  });
});

describe("markTinaIssueQueueStale", () => {
  it("marks a completed queue as stale", () => {
    const staleQueue = markTinaIssueQueueStale({
      lastRunAt: "2026-03-26T21:30:00.000Z",
      status: "complete",
      summary: "Checked",
      nextStep: "Done",
      items: [],
      records: [],
    });

    expect(staleQueue.status).toBe("stale");
    expect(staleQueue.summary).toContain("changed");
  });
});
