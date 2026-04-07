import { describe, expect, it } from "vitest";
import {
  buildTinaBookTieOutSnapshot,
  createDefaultTinaBookTieOutSnapshot,
  markTinaBookTieOutStale,
} from "@/tina/lib/book-tie-out";
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

describe("buildTinaBookTieOutSnapshot", () => {
  it("builds a first deterministic tie-out spine from money papers", () => {
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
          requestLabel: "QuickBooks",
          uploadedAt: "2026-04-06T21:00:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "money-in",
          sourceDocumentId: "books-doc",
          label: "Money in clue",
          value: "$18,000.00",
          confidence: "medium",
          capturedAt: "2026-04-06T21:10:00.000Z",
        },
        {
          id: "money-out",
          sourceDocumentId: "books-doc",
          label: "Money out clue",
          value: "$4,000.00",
          confidence: "medium",
          capturedAt: "2026-04-06T21:10:00.000Z",
        },
        {
          id: "date-range",
          sourceDocumentId: "books-doc",
          label: "Date range clue",
          value: "2025-01-01 through 2025-12-31",
          confidence: "high",
          capturedAt: "2026-04-06T21:10:00.000Z",
        },
      ],
      issueQueue: {
        lastRunAt: "2026-04-06T21:15:00.000Z",
        status: "complete",
        summary: "Checked",
        nextStep: "Keep going",
        items: [],
        records: [],
      },
    });

    const snapshot = buildTinaBookTieOutSnapshot(draft);

    expect(snapshot.status).toBe("complete");
    expect(snapshot.totalMoneyIn).toBe(18000);
    expect(snapshot.totalMoneyOut).toBe(4000);
    expect(snapshot.totalNet).toBe(14000);
    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.variances).toHaveLength(0);
    expect(snapshot.entries[0]?.status).toBe("ready");
  });

  it("creates a blocking variance when a money paper has no usable totals yet", () => {
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
          requestLabel: "QuickBooks",
          uploadedAt: "2026-04-06T21:00:00.000Z",
        },
      ],
      sourceFacts: [],
      issueQueue: {
        lastRunAt: "2026-04-06T21:15:00.000Z",
        status: "complete",
        summary: "Checked",
        nextStep: "Keep going",
        items: [],
        records: [],
      },
    });

    const snapshot = buildTinaBookTieOutSnapshot(draft);

    expect(snapshot.variances).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "blocking",
          title: "A money paper still lacks usable totals",
        }),
      ])
    );
    expect(snapshot.nextStep).toContain("Resolve the blocking tie-out gaps");
  });

  it("creates a variance when money totals diverge sharply across papers", () => {
    const draft = buildDraft({
      documents: [
        {
          id: "books-a",
          name: "books-a.csv",
          size: 1024,
          mimeType: "text/csv",
          storagePath: "tax/books-a.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks",
          uploadedAt: "2026-04-06T21:00:00.000Z",
        },
        {
          id: "books-b",
          name: "books-b.csv",
          size: 1024,
          mimeType: "text/csv",
          storagePath: "tax/books-b.csv",
          category: "supporting_document",
          requestId: "bank-support",
          requestLabel: "Bank support",
          uploadedAt: "2026-04-06T21:01:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "money-in-a",
          sourceDocumentId: "books-a",
          label: "Money in clue",
          value: "$10,000.00",
          confidence: "medium",
          capturedAt: "2026-04-06T21:10:00.000Z",
        },
        {
          id: "money-in-b",
          sourceDocumentId: "books-b",
          label: "Money in clue",
          value: "$30,000.00",
          confidence: "medium",
          capturedAt: "2026-04-06T21:11:00.000Z",
        },
      ],
      issueQueue: {
        lastRunAt: "2026-04-06T21:15:00.000Z",
        status: "complete",
        summary: "Checked",
        nextStep: "Keep going",
        items: [],
        records: [],
      },
    });

    const snapshot = buildTinaBookTieOutSnapshot(draft);

    expect(snapshot.variances).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "money-in-spread",
          severity: "needs_attention",
        }),
      ])
    );
  });

  it("flags missing date coverage, duplicate income, owner flows, transfers, and conflicting money stories", () => {
    const draft = buildDraft({
      documents: [
        {
          id: "books-a",
          name: "books-a.csv",
          size: 1024,
          mimeType: "text/csv",
          storagePath: "tax/books-a.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks",
          uploadedAt: "2026-04-06T21:00:00.000Z",
        },
        {
          id: "books-b",
          name: "books-b.csv",
          size: 1024,
          mimeType: "text/csv",
          storagePath: "tax/books-b.csv",
          category: "supporting_document",
          requestId: "bank-support",
          requestLabel: "Bank support",
          uploadedAt: "2026-04-06T21:01:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "money-in-a",
          sourceDocumentId: "books-a",
          label: "Money in clue",
          value: "$18,000.00",
          confidence: "medium",
          capturedAt: "2026-04-06T21:10:00.000Z",
        },
        {
          id: "money-out-a",
          sourceDocumentId: "books-a",
          label: "Money out clue",
          value: "$5,000.00",
          confidence: "medium",
          capturedAt: "2026-04-06T21:10:00.000Z",
        },
        {
          id: "date-a",
          sourceDocumentId: "books-a",
          label: "Date range clue",
          value: "2025-01-01 through 2025-12-31",
          confidence: "high",
          capturedAt: "2026-04-06T21:10:00.000Z",
        },
        {
          id: "money-in-b",
          sourceDocumentId: "books-b",
          label: "Money in clue",
          value: "$18,000.00",
          confidence: "medium",
          capturedAt: "2026-04-06T21:11:00.000Z",
        },
        {
          id: "money-out-b",
          sourceDocumentId: "books-b",
          label: "Money out clue",
          value: "$22,000.00",
          confidence: "medium",
          capturedAt: "2026-04-06T21:11:00.000Z",
        },
        {
          id: "owner-flow",
          sourceDocumentId: "books-a",
          label: "Owner draw clue",
          value: "Owner draws detected.",
          confidence: "medium",
          capturedAt: "2026-04-06T21:12:00.000Z",
        },
        {
          id: "transfer",
          sourceDocumentId: "books-b",
          label: "Intercompany transfer clue",
          value: "Transfer activity detected.",
          confidence: "medium",
          capturedAt: "2026-04-06T21:12:00.000Z",
        },
      ],
      issueQueue: {
        lastRunAt: "2026-04-06T21:15:00.000Z",
        status: "complete",
        summary: "Checked",
        nextStep: "Keep going",
        items: [],
        records: [],
      },
    });

    const snapshot = buildTinaBookTieOutSnapshot(draft);

    expect(snapshot.variances).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "missing-date-coverage" }),
        expect.objectContaining({ id: "owner-flow-contamination" }),
        expect.objectContaining({ id: "uncategorized-transfer-activity" }),
        expect.objectContaining({ id: "conflicting-money-story" }),
        expect.objectContaining({ title: "Money papers may be double-counting the same income" }),
      ])
    );
    expect(snapshot.nextStep).toContain("tie-out variances");
  });
});

describe("markTinaBookTieOutStale", () => {
  it("marks a built tie-out snapshot as stale", () => {
    const stale = markTinaBookTieOutStale({
      ...createDefaultTinaBookTieOutSnapshot(),
      status: "complete",
      summary: "Built",
      nextStep: "Done",
    });

    expect(stale.status).toBe("stale");
    expect(stale.summary).toContain("changed");
  });
});
