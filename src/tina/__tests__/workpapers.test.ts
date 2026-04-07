import { describe, expect, it } from "vitest";
import {
  buildTinaWorkpaperSnapshot,
  createDefaultTinaWorkpaperSnapshot,
  markTinaWorkpapersStale,
} from "@/tina/lib/workpapers";
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

describe("buildTinaWorkpaperSnapshot", () => {
  it("builds a first money story from book clues", () => {
    const draft = buildDraft({
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
          uploadedAt: "2026-03-26T22:10:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "payroll",
          sourceDocumentId: "books-doc",
          label: "Payroll clue",
          value: "This paper mentions payroll.",
          confidence: "medium",
          capturedAt: "2026-03-26T22:12:00.000Z",
        },
      ],
      issueQueue: {
        lastRunAt: "2026-03-26T22:15:00.000Z",
        status: "complete",
        summary: "Checked",
        nextStep: "Keep going",
        items: [],
        records: [],
      },
      bookTieOut: {
        lastRunAt: "2026-03-26T22:14:00.000Z",
        status: "complete",
        summary: "Tie-out built",
        nextStep: "Keep going",
        totalMoneyIn: 18000,
        totalMoneyOut: 4000,
        totalNet: 14000,
        entries: [
          {
            id: "book-tie-out-books-doc",
            documentId: "books-doc",
            label: "QuickBooks or your profit-and-loss report",
            status: "ready",
            moneyIn: 18000,
            moneyOut: 4000,
            net: 14000,
            dateCoverage: "2025-01-01 through 2025-12-31",
            sourceFactIds: ["money-in", "money-out", "date-range"],
            issueIds: [],
          },
        ],
        variances: [],
      },
    });

    const snapshot = buildTinaWorkpaperSnapshot(draft);

    expect(snapshot.status).toBe("complete");
    expect(snapshot.summary).toContain("$18,000 coming in");
    expect(snapshot.summary).toContain("$4,000 going out");
    expect(snapshot.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "income",
          amount: 18000,
          label: "QuickBooks or your profit-and-loss report money in",
        }),
        expect.objectContaining({
          kind: "expense",
          amount: 4000,
        }),
        expect.objectContaining({
          kind: "net",
          amount: 14000,
        }),
        expect.objectContaining({
          kind: "coverage",
          amount: null,
        }),
        expect.objectContaining({
          kind: "signal",
          label: "Payroll clue",
        }),
      ])
    );
  });

  it("marks lines that are tied to open book issues", () => {
    const draft = buildDraft({
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
          uploadedAt: "2026-03-26T22:10:00.000Z",
        },
      ],
      sourceFacts: [],
      issueQueue: {
        lastRunAt: "2026-03-26T22:15:00.000Z",
        status: "complete",
        summary: "Found something",
        nextStep: "Check it",
        items: [
          {
            id: "books-year",
            title: "Wrong year",
            summary: "This may be the wrong year.",
            severity: "needs_attention",
            status: "open",
            category: "books",
            requestId: null,
            documentId: "books-doc",
            factId: "money-in",
          },
        ],
        records: [],
      },
      bookTieOut: {
        lastRunAt: "2026-03-26T22:14:00.000Z",
        status: "complete",
        summary: "Tie-out built",
        nextStep: "Keep going",
        totalMoneyIn: 18000,
        totalMoneyOut: null,
        totalNet: 18000,
        entries: [
          {
            id: "book-tie-out-books-doc",
            documentId: "books-doc",
            label: "QuickBooks or your profit-and-loss report",
            status: "needs_attention",
            moneyIn: 18000,
            moneyOut: null,
            net: 18000,
            dateCoverage: null,
            sourceFactIds: ["money-in"],
            issueIds: ["books-year"],
          },
        ],
        variances: [],
      },
    });

    const snapshot = buildTinaWorkpaperSnapshot(draft);
    const incomeLine = snapshot.lines.find((line) => line.kind === "income");

    expect(incomeLine?.status).toBe("needs_attention");
    expect(incomeLine?.issueIds).toEqual(["books-year"]);
    expect(snapshot.nextStep).toContain("Review the book-side conflicts first");
  });

  it("keeps the money story idle until the deterministic tie-out exists", () => {
    const draft = buildDraft({
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
          uploadedAt: "2026-03-26T22:10:00.000Z",
        },
      ],
      sourceFacts: [],
      issueQueue: {
        lastRunAt: null,
        status: "idle",
        summary: "Not checked",
        nextStep: "Run it",
        items: [],
        records: [],
      },
    });

    const snapshot = buildTinaWorkpaperSnapshot(draft);

    expect(snapshot.status).toBe("idle");
    expect(snapshot.summary).toContain("build the deterministic tie-out first");
    expect(snapshot.nextStep).toContain("Build the books tie-out first");
    expect(snapshot.lines).toHaveLength(0);
  });

  it("keeps workpapers stale when the tie-out still has blocking gaps", () => {
    const draft = buildDraft({
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
          uploadedAt: "2026-03-26T22:10:00.000Z",
        },
      ],
      issueQueue: {
        lastRunAt: "2026-03-26T22:15:00.000Z",
        status: "complete",
        summary: "Checked",
        nextStep: "Keep going",
        items: [],
        records: [],
      },
      bookTieOut: {
        lastRunAt: "2026-03-26T22:14:00.000Z",
        status: "complete",
        summary: "Tie-out built",
        nextStep: "Keep going",
        totalMoneyIn: null,
        totalMoneyOut: null,
        totalNet: null,
        entries: [
          {
            id: "book-tie-out-books-doc",
            documentId: "books-doc",
            label: "QuickBooks or your profit-and-loss report",
            status: "needs_attention",
            moneyIn: null,
            moneyOut: null,
            net: null,
            dateCoverage: null,
            sourceFactIds: [],
            issueIds: [],
          },
        ],
        variances: [
          {
            id: "missing-money-clues-books-doc",
            title: "A money paper still lacks usable totals",
            severity: "blocking",
            summary: "Still missing totals.",
            documentIds: ["books-doc"],
            sourceFactIds: [],
          },
        ],
      },
    });

    const snapshot = buildTinaWorkpaperSnapshot(draft);

    expect(snapshot.status).toBe("stale");
    expect(snapshot.summary).toContain("blocking tie-out gap");
    expect(snapshot.nextStep).toContain("Resolve the blocking tie-out gaps");
  });

  it("does not mark an empty build as complete", () => {
    const snapshot = buildTinaWorkpaperSnapshot(createDefaultTinaWorkspaceDraft());

    expect(snapshot.status).toBe("idle");
    expect(snapshot.summary).toContain("needs your main money papers");
    expect(snapshot.lines).toHaveLength(0);
  });

  it("surfaces owner-flow and transfer clues and changes the next step for messy books patterns", () => {
    const draft = buildDraft({
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
          uploadedAt: "2026-03-26T22:10:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "owner-flow",
          sourceDocumentId: "books-doc",
          label: "Owner draw clue",
          value: "Owner draws detected.",
          confidence: "medium",
          capturedAt: "2026-03-26T22:12:00.000Z",
        },
        {
          id: "transfer",
          sourceDocumentId: "books-doc",
          label: "Intercompany transfer clue",
          value: "Transfers detected.",
          confidence: "medium",
          capturedAt: "2026-03-26T22:12:00.000Z",
        },
      ],
      issueQueue: {
        lastRunAt: "2026-03-26T22:15:00.000Z",
        status: "complete",
        summary: "Checked",
        nextStep: "Keep going",
        items: [],
        records: [],
      },
      bookTieOut: {
        lastRunAt: "2026-03-26T22:14:00.000Z",
        status: "complete",
        summary: "Tie-out built",
        nextStep: "Keep going",
        totalMoneyIn: 18000,
        totalMoneyOut: 4000,
        totalNet: 14000,
        entries: [
          {
            id: "book-tie-out-books-doc",
            documentId: "books-doc",
            label: "QuickBooks or your profit-and-loss report",
            status: "ready",
            moneyIn: 18000,
            moneyOut: 4000,
            net: 14000,
            dateCoverage: "2025-01-01 through 2025-12-31",
            sourceFactIds: ["money-in", "money-out", "date-range"],
            issueIds: [],
          },
        ],
        variances: [
          {
            id: "owner-flow-contamination",
            title: "Books may include owner-flow contamination",
            severity: "needs_attention",
            summary: "Owner draws may be mixed in.",
            documentIds: ["books-doc"],
            sourceFactIds: ["owner-flow"],
          },
        ],
      },
    });

    const snapshot = buildTinaWorkpaperSnapshot(draft);

    expect(snapshot.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "signal", label: "Owner draw clue" }),
        expect.objectContaining({ kind: "signal", label: "Intercompany transfer clue" }),
      ])
    );
    expect(snapshot.nextStep).toContain("Separate owner draws or distributions");
  });

  it("changes the next step when Tina sees possible duplicate income", () => {
    const draft = buildDraft({
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
          uploadedAt: "2026-03-26T22:10:00.000Z",
        },
      ],
      issueQueue: {
        lastRunAt: "2026-03-26T22:15:00.000Z",
        status: "complete",
        summary: "Checked",
        nextStep: "Keep going",
        items: [],
        records: [],
      },
      bookTieOut: {
        lastRunAt: "2026-03-26T22:14:00.000Z",
        status: "complete",
        summary: "Tie-out built",
        nextStep: "Keep going",
        totalMoneyIn: 18000,
        totalMoneyOut: 4000,
        totalNet: 14000,
        entries: [
          {
            id: "book-tie-out-books-doc",
            documentId: "books-doc",
            label: "QuickBooks or your profit-and-loss report",
            status: "ready",
            moneyIn: 18000,
            moneyOut: 4000,
            net: 14000,
            dateCoverage: "2025-01-01 through 2025-12-31",
            sourceFactIds: ["money-in", "money-out", "date-range"],
            issueIds: [],
          },
        ],
        variances: [
          {
            id: "duplicate-income-18000",
            title: "Money papers may be double-counting the same income",
            severity: "needs_attention",
            summary: "Same income may be showing up twice.",
            documentIds: ["books-doc"],
            sourceFactIds: ["money-in"],
          },
        ],
      },
    });

    const snapshot = buildTinaWorkpaperSnapshot(draft);

    expect(snapshot.nextStep).toContain("duplicate-income");
  });
});

describe("markTinaWorkpapersStale", () => {
  it("marks built workpapers as stale", () => {
    const stale = markTinaWorkpapersStale({
      ...createDefaultTinaWorkpaperSnapshot(),
      status: "complete",
      summary: "Built",
      nextStep: "Done",
    });

    expect(stale.status).toBe("stale");
    expect(stale.summary).toContain("changed");
  });
});
