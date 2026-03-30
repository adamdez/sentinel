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
        llcFederalTaxTreatment: "owner_return",
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

  it("blocks when explicit LLC organizer treatment disagrees with saved election papers", () => {
    const draft = buildDraft({
      profile: {
        businessName: "Mismatch LLC",
        entityType: "single_member_llc",
        llcFederalTaxTreatment: "owner_return",
      },
      sourceFacts: [
        {
          id: "llc-election",
          sourceDocumentId: "doc-election",
          label: "LLC election clue",
          value: "Form 2553 election accepted for S corporation treatment.",
          confidence: "high",
          capturedAt: "2026-03-28T18:20:00.000Z",
        },
      ],
    });

    const issueQueue = buildTinaIssueQueue(draft);

    expect(issueQueue.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "llc-tax-treatment-conflict",
          severity: "blocking",
        }),
      ])
    );
    expect(issueQueue.records.find((record) => record.id === "filing-lane")?.status).toBe(
      "needs_attention"
    );
  });

  it("summarizes multiple blocking LLC return-type conflicts without changing the calm review record", () => {
    const draft = buildDraft({
      profile: {
        businessName: "Double Mismatch LLC",
        entityType: "single_member_llc",
        llcFederalTaxTreatment: "owner_return",
      },
      sourceFacts: [
        {
          id: "return-type",
          sourceDocumentId: "prior-doc",
          label: "Return type hint",
          value: "Form 1120-S / LLC taxed as S-corp",
          confidence: "high",
          capturedAt: "2026-03-28T23:15:00.000Z",
        },
        {
          id: "llc-election",
          sourceDocumentId: "prior-doc",
          label: "LLC election clue",
          value: "Form 2553 election accepted for S corporation treatment.",
          confidence: "high",
          capturedAt: "2026-03-28T23:16:00.000Z",
        },
      ],
    });

    const issueQueue = buildTinaIssueQueue(draft);

    expect(issueQueue.summary).toBe("Tina found 2 blocking conflicts in your saved papers and setup.");
    expect(issueQueue.nextStep).toBe("Fix the blocking conflict first before trusting deeper tax prep.");
    expect(issueQueue.records.find((record) => record.id === "filing-lane")).toEqual(
      expect.objectContaining({
        status: "needs_attention",
        summary: "A saved paper hints the current return type may not be right.",
      })
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

  it("uses the normalized books snapshot to flag waiting files and partial-year coverage", () => {
    const draft = buildDraft({
      profile: {
        taxYear: "2025",
        formationDate: "2025-01-01",
      },
      documents: [
        {
          id: "books-doc-1",
          name: "quarterly-p-and-l.xlsx",
          size: 2048,
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          storagePath: "tax/quarterly-p-and-l.xlsx",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks export",
          uploadedAt: "2026-03-26T21:15:00.000Z",
        },
        {
          id: "books-doc-2",
          name: "general-ledger.xlsx",
          size: 2048,
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          storagePath: "tax/general-ledger.xlsx",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks export",
          uploadedAt: "2026-03-26T21:16:00.000Z",
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
      booksImport: {
        lastRunAt: "2026-03-26T21:25:00.000Z",
        status: "complete",
        summary: "Tina stitched together 2 books files with coverage 2025-03-01 through 2025-10-31.",
        nextStep: "Check the missing parts of the year next.",
        documentCount: 2,
        coverageStart: "2025-03-01",
        coverageEnd: "2025-10-31",
        moneyInTotal: 24000,
        moneyOutTotal: 12000,
        clueLabels: ["sales tax"],
        documents: [
          {
            documentId: "books-doc-1",
            name: "quarterly-p-and-l.xlsx",
            status: "ready",
            summary: "Ready enough",
            rowCount: 60,
            coverageStart: "2025-03-01",
            coverageEnd: "2025-10-31",
            moneyIn: 24000,
            moneyOut: 12000,
            clueLabels: ["sales tax"],
            lastReadAt: "2026-03-26T21:24:00.000Z",
          },
          {
            documentId: "books-doc-2",
            name: "general-ledger.xlsx",
            status: "waiting",
            summary: "Still waiting on a first read.",
            rowCount: null,
            coverageStart: null,
            coverageEnd: null,
            moneyIn: null,
            moneyOut: null,
            clueLabels: [],
            lastReadAt: null,
          },
        ],
      },
    });

    const issueQueue = buildTinaIssueQueue(draft);

    expect(issueQueue.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "books-files-still-waiting", category: "books" }),
        expect.objectContaining({ id: "books-coverage-may-be-partial", category: "books" }),
      ])
    );

    const booksRecord = issueQueue.records.find((record) => record.id === "books");
    expect(booksRecord?.summary).toContain("Tina stitched together 2 books files");
    expect(booksRecord?.summary).toContain("still sees something to check");
  });

  it("flags fixed-asset-style book clues that the organizer did not mark yet", () => {
    const draft = buildDraft({
      sourceFacts: [
        {
          id: "fact-fixed-assets",
          sourceDocumentId: "books-doc",
          label: "Fixed asset clue",
          value: "This paper mentions equipment, depreciation, or other big-purchase treatment.",
          confidence: "medium",
          capturedAt: "2026-03-29T10:40:00.000Z",
        },
      ],
    });

    const issueQueue = buildTinaIssueQueue(draft);

    expect(issueQueue.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "fixed-assets-clue",
          category: "books",
        }),
      ])
    );
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
