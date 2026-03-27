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
          id: "money-in",
          sourceDocumentId: "books-doc",
          label: "Money in clue",
          value: "$18,000.00",
          confidence: "medium",
          capturedAt: "2026-03-26T22:12:00.000Z",
        },
        {
          id: "money-out",
          sourceDocumentId: "books-doc",
          label: "Money out clue",
          value: "$4,000.00",
          confidence: "medium",
          capturedAt: "2026-03-26T22:12:00.000Z",
        },
        {
          id: "date-range",
          sourceDocumentId: "books-doc",
          label: "Date range clue",
          value: "2025-01-01 through 2025-12-31",
          confidence: "high",
          capturedAt: "2026-03-26T22:12:00.000Z",
        },
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
      sourceFacts: [
        {
          id: "money-in",
          sourceDocumentId: "books-doc",
          label: "Money in clue",
          value: "$18,000.00",
          confidence: "medium",
          capturedAt: "2026-03-26T22:12:00.000Z",
        },
      ],
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
    });

    const snapshot = buildTinaWorkpaperSnapshot(draft);
    const incomeLine = snapshot.lines.find((line) => line.kind === "income");

    expect(incomeLine?.status).toBe("needs_attention");
    expect(incomeLine?.issueIds).toEqual(["books-year"]);
    expect(snapshot.nextStep).toContain("Review the book-side conflicts first");
  });

  it("keeps the money story stale until the conflict check is current", () => {
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
          id: "money-in",
          sourceDocumentId: "books-doc",
          label: "Money in clue",
          value: "$18,000.00",
          confidence: "medium",
          capturedAt: "2026-03-26T22:12:00.000Z",
        },
      ],
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
    const incomeLine = snapshot.lines.find((line) => line.kind === "income");

    expect(snapshot.status).toBe("stale");
    expect(snapshot.summary).toContain("current conflict check");
    expect(snapshot.nextStep).toContain("Run the conflict check first");
    expect(incomeLine?.status).toBe("waiting");
  });

  it("does not mark an empty build as complete", () => {
    const snapshot = buildTinaWorkpaperSnapshot(createDefaultTinaWorkspaceDraft());

    expect(snapshot.status).toBe("idle");
    expect(snapshot.summary).toContain("needs your main money papers");
    expect(snapshot.lines).toHaveLength(0);
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
