import { describe, expect, it } from "vitest";
import { buildTinaIssueQueue, markTinaIssueQueueStale } from "@/tina/lib/issue-queue";
import { buildTinaProfileFingerprint } from "@/tina/lib/profile-fingerprint";
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

  it("blocks the filing lane when intake already shows multiple owners", () => {
    const draft = buildDraft({
      profile: {
        businessName: "Two Owner LLC",
        entityType: "single_member_llc",
        ownerCount: 2,
      },
    });

    const issueQueue = buildTinaIssueQueue(draft);
    expect(issueQueue.items.some((item) => item.id === "owner-count-multi-owner")).toBe(true);
    expect(issueQueue.records.find((record) => record.id === "filing-lane")?.status).toBe(
      "needs_attention"
    );
  });

  it("blocks when papers suggest an ownership change during the year", () => {
    const draft = buildDraft({
      sourceFacts: [
        {
          id: "ownership-change-fact",
          sourceDocumentId: "doc-1",
          label: "Ownership change clue",
          value: "This paper may show an ownership change.",
          confidence: "medium",
          capturedAt: "2026-03-26T21:10:00.000Z",
        },
      ],
    });

    const issueQueue = buildTinaIssueQueue(draft);
    const item = issueQueue.items.find((candidate) => candidate.id === "ownership-change-review");
    expect(item?.severity).toBe("blocking");
  });

  it("blocks when papers suggest payments to a former owner", () => {
    const draft = buildDraft({
      sourceFacts: [
        {
          id: "former-owner-payment-fact",
          sourceDocumentId: "doc-1",
          label: "Former owner payment clue",
          value: "This paper may show payments to a former owner.",
          confidence: "medium",
          capturedAt: "2026-03-26T21:10:00.000Z",
        },
      ],
    });

    const issueQueue = buildTinaIssueQueue(draft);
    const item = issueQueue.items.find(
      (candidate) => candidate.id === "former-owner-payment-review"
    );
    expect(item?.severity).toBe("blocking");
  });

  it("flags return-type conflict when paper hints Schedule C but organizer points to S-corp lane", () => {
    const draft = buildDraft({
      profile: {
        businessName: "Tina Test Corp",
        entityType: "s_corp",
      },
      sourceFacts: [
        {
          id: "return-type",
          sourceDocumentId: "prior-doc",
          label: "Return type hint",
          value: "Schedule C / 1040",
          confidence: "high",
          capturedAt: "2026-03-26T21:10:00.000Z",
        },
      ],
    });

    const issueQueue = buildTinaIssueQueue(draft);
    expect(issueQueue.items.some((item) => item.id === "return-type-hint-conflict")).toBe(true);
  });

  it("does not flag return-type conflict when paper and organizer both indicate Schedule C lane", () => {
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
          value: "Schedule C / 1040",
          confidence: "high",
          capturedAt: "2026-03-26T21:10:00.000Z",
        },
      ],
    });

    const issueQueue = buildTinaIssueQueue(draft);
    expect(issueQueue.items.some((item) => item.id === "return-type-hint-conflict")).toBe(false);
  });

  it("flags return-type conflict when one hint matches but another hint conflicts", () => {
    const draft = buildDraft({
      profile: {
        businessName: "Tina Test LLC",
        entityType: "single_member_llc",
      },
      sourceFacts: [
        {
          id: "return-type-aligned",
          sourceDocumentId: "prior-doc-a",
          label: "Return type hint",
          value: "Schedule C / 1040",
          confidence: "high",
          capturedAt: "2026-03-26T21:10:00.000Z",
        },
        {
          id: "return-type-conflict",
          sourceDocumentId: "prior-doc-b",
          label: "Return type hint",
          value: "1120-S election noted",
          confidence: "high",
          capturedAt: "2026-03-26T21:11:00.000Z",
        },
      ],
    });

    const issueQueue = buildTinaIssueQueue(draft);
    expect(issueQueue.items.some((item) => item.id === "return-type-hint-conflict")).toBe(true);
  });

  it("flags return-type conflict when papers point to multiple different lanes", () => {
    const draft = buildDraft({
      profile: {
        businessName: "Tina Mixed Signals LLC",
        entityType: "unsure",
      },
      sourceFacts: [
        {
          id: "return-type-c",
          sourceDocumentId: "prior-doc-a",
          label: "Return type hint",
          value: "Schedule C / 1040",
          confidence: "high",
          capturedAt: "2026-03-26T21:10:00.000Z",
        },
        {
          id: "return-type-1065",
          sourceDocumentId: "prior-doc-b",
          label: "Return type hint",
          value: "Partnership / 1065",
          confidence: "high",
          capturedAt: "2026-03-26T21:11:00.000Z",
        },
      ],
    });

    const issueQueue = buildTinaIssueQueue(draft);
    expect(issueQueue.items.some((item) => item.id === "return-type-hint-conflict")).toBe(true);
  });

  it("downgrades return-type conflict to attention when all hints are low confidence", () => {
    const draft = buildDraft({
      profile: {
        businessName: "Tina Mixed Signals LLC",
        entityType: "unsure",
      },
      sourceFacts: [
        {
          id: "return-type-c",
          sourceDocumentId: "prior-doc-a",
          label: "Return type hint",
          value: "Schedule C / 1040",
          confidence: "low",
          capturedAt: "2026-03-26T21:10:00.000Z",
        },
        {
          id: "return-type-1065",
          sourceDocumentId: "prior-doc-b",
          label: "Return type hint",
          value: "Partnership / 1065",
          confidence: "low",
          capturedAt: "2026-03-26T21:11:00.000Z",
        },
      ],
    });

    const issueQueue = buildTinaIssueQueue(draft);
    const item = issueQueue.items.find((candidate) => candidate.id === "return-type-hint-conflict");
    expect(item?.severity).toBe("needs_attention");
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

  it("flags mixed-year money papers even when the target tax year is present", () => {
    const draft = buildDraft({
      profile: {
        taxYear: "2025",
      },
      documents: [
        {
          id: "books-doc",
          name: "mixed-year-books.csv",
          size: 2048,
          mimeType: "text/csv",
          storagePath: "tax/mixed-year-books.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks or your profit-and-loss report",
          uploadedAt: "2026-03-26T21:15:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "books-range-2024",
          sourceDocumentId: "books-doc",
          label: "Date range clue",
          value: "2024-01-01 through 2024-12-31",
          confidence: "high",
          capturedAt: "2026-03-26T21:20:00.000Z",
        },
        {
          id: "books-range-2025",
          sourceDocumentId: "books-doc",
          label: "Date range clue",
          value: "2025-01-01 through 2025-01-03",
          confidence: "high",
          capturedAt: "2026-03-26T21:21:00.000Z",
        },
      ],
    });

    const issueQueue = buildTinaIssueQueue(draft);

    expect(issueQueue.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "books-multi-year-mix",
          category: "books",
          severity: "needs_attention",
        }),
      ])
    );
  });

  it("does not flag a mixed-year issue when all money-paper date clues are the target year", () => {
    const draft = buildDraft({
      profile: {
        taxYear: "2025",
      },
      documents: [
        {
          id: "books-doc",
          name: "single-year-books.csv",
          size: 2048,
          mimeType: "text/csv",
          storagePath: "tax/single-year-books.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks or your profit-and-loss report",
          uploadedAt: "2026-03-26T21:15:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "books-range-q1",
          sourceDocumentId: "books-doc",
          label: "Date range clue",
          value: "2025-01-01 through 2025-03-31",
          confidence: "high",
          capturedAt: "2026-03-26T21:20:00.000Z",
        },
        {
          id: "books-range-q2",
          sourceDocumentId: "books-doc",
          label: "Date range clue",
          value: "2025-04-01 through 2025-06-30",
          confidence: "high",
          capturedAt: "2026-03-26T21:21:00.000Z",
        },
      ],
    });

    const issueQueue = buildTinaIssueQueue(draft);
    expect(issueQueue.items.some((item) => item.id === "books-multi-year-mix")).toBe(false);
    expect(issueQueue.items.some((item) => item.id === "books-tax-year-mismatch")).toBe(false);
  });

  it("flags Idaho scope when any matching state clue says Idaho", () => {
    const draft = buildDraft({
      profile: {
        hasIdahoActivity: false,
      },
      sourceFacts: [
        {
          id: "state-clue-generic",
          sourceDocumentId: "doc-1",
          label: "State clue",
          value: "This paper mentions Washington.",
          confidence: "medium",
          capturedAt: "2026-03-26T21:20:00.000Z",
        },
        {
          id: "state-clue-idaho",
          sourceDocumentId: "doc-2",
          label: "State clue",
          value: "This paper mentions Idaho.",
          confidence: "medium",
          capturedAt: "2026-03-26T21:21:00.000Z",
        },
      ],
    });

    const issueQueue = buildTinaIssueQueue(draft);
    expect(issueQueue.items.some((item) => item.id === "idaho-state-clue")).toBe(true);
  });

  it("flags likely scale mismatch when money clues vary by extreme ratios", () => {
    const draft = buildDraft({
      documents: [
        {
          id: "books-a",
          name: "books-a.csv",
          size: 2048,
          mimeType: "text/csv",
          storagePath: "tax/books-a.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks or your profit-and-loss report",
          uploadedAt: "2026-03-26T21:15:00.000Z",
        },
        {
          id: "books-b",
          name: "books-b.csv",
          size: 2048,
          mimeType: "text/csv",
          storagePath: "tax/books-b.csv",
          category: "supporting_document",
          requestId: "bank-support",
          requestLabel: "Business bank and card statements",
          uploadedAt: "2026-03-26T21:16:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "money-in-a",
          sourceDocumentId: "books-a",
          label: "Money in clue",
          value: "$1,200.00",
          confidence: "medium",
          capturedAt: "2026-03-26T21:20:00.000Z",
        },
        {
          id: "money-in-b",
          sourceDocumentId: "books-b",
          label: "Money in clue",
          value: "$120,000.00",
          confidence: "medium",
          capturedAt: "2026-03-26T21:21:00.000Z",
        },
      ],
    });

    const issueQueue = buildTinaIssueQueue(draft);
    expect(issueQueue.items.some((item) => item.id === "books-money-scale-mismatch")).toBe(true);
  });

  it("flags scale mismatch when one money clue is zero and another is large", () => {
    const draft = buildDraft({
      documents: [
        {
          id: "books-a",
          name: "books-a.csv",
          size: 2048,
          mimeType: "text/csv",
          storagePath: "tax/books-a.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks or your profit-and-loss report",
          uploadedAt: "2026-03-26T21:15:00.000Z",
        },
        {
          id: "books-b",
          name: "books-b.csv",
          size: 2048,
          mimeType: "text/csv",
          storagePath: "tax/books-b.csv",
          category: "supporting_document",
          requestId: "bank-support",
          requestLabel: "Business bank and card statements",
          uploadedAt: "2026-03-26T21:16:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "money-in-a",
          sourceDocumentId: "books-a",
          label: "Money in clue",
          value: "$0.00",
          confidence: "medium",
          capturedAt: "2026-03-26T21:20:00.000Z",
        },
        {
          id: "money-in-b",
          sourceDocumentId: "books-b",
          label: "Money in clue",
          value: "$95,000.00",
          confidence: "medium",
          capturedAt: "2026-03-26T21:21:00.000Z",
        },
      ],
    });

    const issueQueue = buildTinaIssueQueue(draft);
    expect(issueQueue.items.some((item) => item.id === "books-money-scale-mismatch")).toBe(true);
  });

  it("escalates commingled multi-entity clues with blocking integrity issues", () => {
    const draft = buildDraft({
      profile: {
        entityType: "s_corp",
      },
      documents: [
        {
          id: "books-a",
          name: "books-a.csv",
          size: 2048,
          mimeType: "text/csv",
          storagePath: "tax/books-a.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks or your profit-and-loss report",
          uploadedAt: "2026-03-26T21:15:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "intercompany-fact",
          sourceDocumentId: "books-a",
          label: "Intercompany transfer clue",
          value: "Due to/from affiliate entity activity detected.",
          confidence: "medium",
          capturedAt: "2026-03-26T21:20:00.000Z",
        },
        {
          id: "owner-flow-fact",
          sourceDocumentId: "books-a",
          label: "Owner draw clue",
          value: "Owner draw distributions posted.",
          confidence: "medium",
          capturedAt: "2026-03-26T21:20:30.000Z",
        },
        {
          id: "related-party-fact",
          sourceDocumentId: "books-a",
          label: "Related-party clue",
          value: "Due from shareholder loan balance.",
          confidence: "medium",
          capturedAt: "2026-03-26T21:20:40.000Z",
        },
        {
          id: "ein-a",
          sourceDocumentId: "books-a",
          label: "EIN clue",
          value: "This paper references EIN 12-3456789.",
          confidence: "medium",
          capturedAt: "2026-03-26T21:21:00.000Z",
        },
        {
          id: "ein-b",
          sourceDocumentId: "books-a",
          label: "EIN clue",
          value: "This paper references EIN 98-7654321.",
          confidence: "medium",
          capturedAt: "2026-03-26T21:21:10.000Z",
        },
      ],
    });

    const issueQueue = buildTinaIssueQueue(draft);

    expect(issueQueue.profileFingerprint).toBe(buildTinaProfileFingerprint(draft.profile));
    expect(issueQueue.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "books-intercompany-transfer-clue",
          severity: "blocking",
        }),
        expect.objectContaining({
          id: "books-owner-flow-clue",
          severity: "blocking",
        }),
        expect.objectContaining({
          id: "books-related-party-clue",
          severity: "needs_attention",
        }),
        expect.objectContaining({
          id: "books-multi-ein-conflict",
          severity: "blocking",
        }),
      ])
    );
  });

  it("uses the strongest intercompany clue evidence when multiple clues exist", () => {
    const draft = buildDraft({
      documents: [
        {
          id: "books-a",
          name: "books-a.csv",
          size: 2048,
          mimeType: "text/csv",
          storagePath: "tax/books-a.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks or your profit-and-loss report",
          uploadedAt: "2026-03-26T21:15:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "intercompany-low",
          sourceDocumentId: "books-a",
          label: "Intercompany transfer clue",
          value: "Possible intercompany movement.",
          confidence: "low",
          capturedAt: "2026-03-26T21:20:00.000Z",
        },
        {
          id: "intercompany-high",
          sourceDocumentId: "books-a",
          label: "Intercompany transfer clue",
          value: "Confirmed due-to/due-from affiliate flow.",
          confidence: "high",
          capturedAt: "2026-03-26T21:20:30.000Z",
        },
      ],
    });

    const issueQueue = buildTinaIssueQueue(draft);
    const item = issueQueue.items.find((candidate) => candidate.id === "books-intercompany-transfer-clue");
    expect(item?.severity).toBe("blocking");
    expect(item?.factId).toBe("intercompany-high");
  });

  it("uses the strongest owner-flow clue evidence when multiple clues exist", () => {
    const draft = buildDraft({
      profile: {
        entityType: "s_corp",
      },
      documents: [
        {
          id: "books-a",
          name: "books-a.csv",
          size: 2048,
          mimeType: "text/csv",
          storagePath: "tax/books-a.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks or your profit-and-loss report",
          uploadedAt: "2026-03-26T21:15:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "owner-flow-low",
          sourceDocumentId: "books-a",
          label: "Owner draw clue",
          value: "Possible owner draw.",
          confidence: "low",
          capturedAt: "2026-03-26T21:20:00.000Z",
        },
        {
          id: "owner-flow-high",
          sourceDocumentId: "books-a",
          label: "Owner draw clue",
          value: "Confirmed shareholder distribution ledger activity.",
          confidence: "high",
          capturedAt: "2026-03-26T21:21:00.000Z",
        },
      ],
    });

    const issueQueue = buildTinaIssueQueue(draft);
    const item = issueQueue.items.find((candidate) => candidate.id === "books-owner-flow-clue");
    expect(item?.severity).toBe("blocking");
    expect(item?.factId).toBe("owner-flow-high");
  });

  it("downgrades multi-ein issue to attention when no corroborating boundary clues exist", () => {
    const draft = buildDraft({
      documents: [
        {
          id: "books-a",
          name: "books-a.csv",
          size: 2048,
          mimeType: "text/csv",
          storagePath: "tax/books-a.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks or your profit-and-loss report",
          uploadedAt: "2026-03-26T21:15:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "ein-a",
          sourceDocumentId: "books-a",
          label: "EIN clue",
          value: "This paper references EIN 12-3456789.",
          confidence: "medium",
          capturedAt: "2026-03-26T21:21:00.000Z",
        },
        {
          id: "ein-b",
          sourceDocumentId: "books-a",
          label: "EIN clue",
          value: "This paper references EIN 98-7654321.",
          confidence: "medium",
          capturedAt: "2026-03-26T21:21:10.000Z",
        },
      ],
    });

    const issueQueue = buildTinaIssueQueue(draft);
    const item = issueQueue.items.find((candidate) => candidate.id === "books-multi-ein-conflict");
    expect(item?.severity).toBe("needs_attention");
  });

  it("blocks multi-ein issue when strong-evidence EIN clues exist even without other boundary clues", () => {
    const draft = buildDraft({
      documents: [
        {
          id: "books-a",
          name: "books-a.csv",
          size: 2048,
          mimeType: "text/csv",
          storagePath: "tax/books-a.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks or your profit-and-loss report",
          uploadedAt: "2026-03-26T21:15:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "ein-a",
          sourceDocumentId: "books-a",
          label: "EIN clue",
          value: "This paper references EIN 12-3456789.",
          confidence: "high",
          capturedAt: "2026-03-26T21:21:00.000Z",
        },
        {
          id: "ein-b",
          sourceDocumentId: "books-a",
          label: "EIN clue",
          value: "This paper references EIN 98-7654321.",
          confidence: "high",
          capturedAt: "2026-03-26T21:21:10.000Z",
        },
      ],
    });

    const issueQueue = buildTinaIssueQueue(draft);
    const item = issueQueue.items.find((candidate) => candidate.id === "books-multi-ein-conflict");
    expect(item?.severity).toBe("blocking");
  });

  it("detects multi-ein conflicts when EIN clues are undashed", () => {
    const draft = buildDraft({
      documents: [
        {
          id: "books-a",
          name: "books-a.csv",
          size: 2048,
          mimeType: "text/csv",
          storagePath: "tax/books-a.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks or your profit-and-loss report",
          uploadedAt: "2026-03-26T21:15:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "ein-a-undashed",
          sourceDocumentId: "books-a",
          label: "EIN clue",
          value: "Books include EIN 123456789 for prior payroll setup.",
          confidence: "high",
          capturedAt: "2026-03-26T21:21:00.000Z",
        },
        {
          id: "ein-b-undashed",
          sourceDocumentId: "books-a",
          label: "EIN clue",
          value: "Legacy mapping table includes EIN 987654321.",
          confidence: "high",
          capturedAt: "2026-03-26T21:21:10.000Z",
        },
      ],
    });

    const issueQueue = buildTinaIssueQueue(draft);
    const item = issueQueue.items.find((candidate) => candidate.id === "books-multi-ein-conflict");

    expect(item?.severity).toBe("blocking");
    expect(item?.summary).toContain("12-3456789");
    expect(item?.summary).toContain("98-7654321");
  });

  it("downgrades owner-flow clue for high-risk entity when confidence is low", () => {
    const draft = buildDraft({
      profile: {
        entityType: "s_corp",
      },
      documents: [
        {
          id: "books-a",
          name: "books-a.csv",
          size: 2048,
          mimeType: "text/csv",
          storagePath: "tax/books-a.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks or your profit-and-loss report",
          uploadedAt: "2026-03-26T21:15:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "owner-flow-fact",
          sourceDocumentId: "books-a",
          label: "Owner draw clue",
          value: "Owner draw distributions posted.",
          confidence: "low",
          capturedAt: "2026-03-26T21:20:30.000Z",
        },
      ],
    });

    const issueQueue = buildTinaIssueQueue(draft);
    const ownerIssue = issueQueue.items.find((item) => item.id === "books-owner-flow-clue");
    expect(ownerIssue?.severity).toBe("needs_attention");
  });

  it("does not raise a multi-ein conflict from a single EIN clue", () => {
    const draft = buildDraft({
      documents: [
        {
          id: "books-a",
          name: "books-a.csv",
          size: 2048,
          mimeType: "text/csv",
          storagePath: "tax/books-a.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks or your profit-and-loss report",
          uploadedAt: "2026-03-26T21:15:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "ein-a",
          sourceDocumentId: "books-a",
          label: "EIN clue",
          value: "This paper references EIN 12-3456789.",
          confidence: "medium",
          capturedAt: "2026-03-26T21:21:00.000Z",
        },
      ],
    });

    const issueQueue = buildTinaIssueQueue(draft);
    expect(issueQueue.items.some((item) => item.id === "books-multi-ein-conflict")).toBe(false);
  });

  it("treats owner draw clues as attention-level for sole-prop lanes", () => {
    const draft = buildDraft({
      profile: {
        entityType: "sole_prop",
      },
      documents: [
        {
          id: "books-a",
          name: "books-a.csv",
          size: 2048,
          mimeType: "text/csv",
          storagePath: "tax/books-a.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks or your profit-and-loss report",
          uploadedAt: "2026-03-26T21:15:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "owner-flow-fact",
          sourceDocumentId: "books-a",
          label: "Owner draw clue",
          value: "Owner draw distributions posted.",
          confidence: "medium",
          capturedAt: "2026-03-26T21:20:30.000Z",
        },
      ],
    });

    const issueQueue = buildTinaIssueQueue(draft);
    const ownerIssue = issueQueue.items.find((item) => item.id === "books-owner-flow-clue");
    expect(ownerIssue?.severity).toBe("needs_attention");
  });

  it("does not flag scale mismatch for normal money clue variance", () => {
    const draft = buildDraft({
      documents: [
        {
          id: "books-a",
          name: "books-a.csv",
          size: 2048,
          mimeType: "text/csv",
          storagePath: "tax/books-a.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks or your profit-and-loss report",
          uploadedAt: "2026-03-26T21:15:00.000Z",
        },
        {
          id: "books-b",
          name: "books-b.csv",
          size: 2048,
          mimeType: "text/csv",
          storagePath: "tax/books-b.csv",
          category: "supporting_document",
          requestId: "bank-support",
          requestLabel: "Business bank and card statements",
          uploadedAt: "2026-03-26T21:16:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "money-out-a",
          sourceDocumentId: "books-a",
          label: "Money out clue",
          value: "$8,500.00",
          confidence: "medium",
          capturedAt: "2026-03-26T21:20:00.000Z",
        },
        {
          id: "money-out-b",
          sourceDocumentId: "books-b",
          label: "Money out clue",
          value: "$11,200.00",
          confidence: "medium",
          capturedAt: "2026-03-26T21:21:00.000Z",
        },
      ],
    });

    const issueQueue = buildTinaIssueQueue(draft);
    expect(issueQueue.items.some((item) => item.id === "books-money-scale-mismatch")).toBe(false);
  });

  it("does not flag scale mismatch from a single money clue with no comparison point", () => {
    const draft = buildDraft({
      documents: [
        {
          id: "books-a",
          name: "books-a.csv",
          size: 2048,
          mimeType: "text/csv",
          storagePath: "tax/books-a.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks or your profit-and-loss report",
          uploadedAt: "2026-03-26T21:15:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "money-in-a",
          sourceDocumentId: "books-a",
          label: "Money in clue",
          value: "$95,000.00",
          confidence: "medium",
          capturedAt: "2026-03-26T21:20:00.000Z",
        },
      ],
    });

    const issueQueue = buildTinaIssueQueue(draft);
    expect(issueQueue.items.some((item) => item.id === "books-money-scale-mismatch")).toBe(false);
  });

  it("blocks when books hint at mixed personal and business spending", () => {
    const draft = buildDraft({
      documents: [
        {
          id: "books-a",
          name: "books-a.csv",
          size: 2048,
          mimeType: "text/csv",
          storagePath: "tax/books-a.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks or your profit-and-loss report",
          uploadedAt: "2026-03-26T21:15:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "mixed-use-fact",
          sourceDocumentId: "books-a",
          label: "Mixed personal/business clue",
          value: "This paper may include mixed personal and business spending.",
          confidence: "medium",
          capturedAt: "2026-03-26T21:20:00.000Z",
        },
      ],
    });

    const issueQueue = buildTinaIssueQueue(draft);
    expect(issueQueue.items.some((item) => item.id === "books-mixed-use-clue")).toBe(true);
  });

  it("blocks when depreciation support clues appear in books", () => {
    const draft = buildDraft({
      profile: {
        hasFixedAssets: true,
      },
      documents: [
        {
          id: "books-a",
          name: "books-a.csv",
          size: 2048,
          mimeType: "text/csv",
          storagePath: "tax/books-a.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks or your profit-and-loss report",
          uploadedAt: "2026-03-26T21:15:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "depreciation-fact",
          sourceDocumentId: "books-a",
          label: "Depreciation clue",
          value: "This paper mentions depreciation.",
          confidence: "medium",
          capturedAt: "2026-03-26T21:20:00.000Z",
        },
      ],
    });

    const issueQueue = buildTinaIssueQueue(draft);
    expect(issueQueue.items.some((item) => item.id === "books-depreciation-support-clue")).toBe(
      true
    );
  });

  it("blocks when papers show both payroll and contractor signals", () => {
    const draft = buildDraft({
      documents: [
        {
          id: "books-a",
          name: "books-a.csv",
          size: 2048,
          mimeType: "text/csv",
          storagePath: "tax/books-a.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks or your profit-and-loss report",
          uploadedAt: "2026-03-26T21:15:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "payroll-fact",
          sourceDocumentId: "books-a",
          label: "Payroll clue",
          value: "This paper mentions payroll.",
          confidence: "medium",
          capturedAt: "2026-03-26T21:20:00.000Z",
        },
        {
          id: "contractor-fact",
          sourceDocumentId: "books-a",
          label: "Contractor clue",
          value: "This paper mentions contractors.",
          confidence: "medium",
          capturedAt: "2026-03-26T21:20:30.000Z",
        },
      ],
    });

    const issueQueue = buildTinaIssueQueue(draft);
    expect(issueQueue.items.some((item) => item.id === "worker-classification-overlap")).toBe(
      true
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
