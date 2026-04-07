import { describe, expect, it } from "vitest";
import { buildTinaBookTieOutSnapshot } from "@/tina/lib/book-tie-out";
import { buildTinaIssueQueue } from "@/tina/lib/issue-queue";
import { buildTinaWorkpaperSnapshot } from "@/tina/lib/workpapers";
import { deriveTinaSourceFactsFromReading } from "@/tina/lib/source-facts";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";
import type { TinaDocumentReading, TinaStoredDocument, TinaWorkspaceDraft } from "@/tina/types";

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

function buildReading(documentId: string, facts: TinaDocumentReading["facts"]): TinaDocumentReading {
  return {
    documentId,
    status: "complete",
    kind: "spreadsheet",
    summary: "Smoke reading",
    nextStep: "Keep going",
    facts,
    detailLines: [],
    rowCount: 10,
    headers: ["Date", "Description", "Amount"],
    sheetNames: ["Sheet1"],
    lastReadAt: "2026-04-07T09:00:00.000Z",
  };
}

function withDerivedFacts(draft: TinaWorkspaceDraft, readings: TinaDocumentReading[]): TinaWorkspaceDraft {
  return {
    ...draft,
    documentReadings: readings,
    sourceFacts: readings.flatMap((reading) => {
      const document = draft.documents.find((item) => item.id === reading.documentId);
      return document ? deriveTinaSourceFactsFromReading(document, reading) : [];
    }),
  };
}

function runMoneyStory(baseDraft: TinaWorkspaceDraft) {
  const issueQueue = buildTinaIssueQueue(baseDraft);
  const withIssues = { ...baseDraft, issueQueue };
  const bookTieOut = buildTinaBookTieOutSnapshot(withIssues);
  const withTieOut = { ...withIssues, bookTieOut };
  const workpapers = buildTinaWorkpaperSnapshot(withTieOut);
  return { ...withTieOut, workpapers };
}

describe("tina messy-books smoke", () => {
  it("keeps partial-year and mixed-coverage files out of a trusted money story", () => {
    const documents: TinaStoredDocument[] = [
      {
        id: "qb-doc",
        name: "qb-export.csv",
        size: 2500,
        mimeType: "text/csv",
        storagePath: "tina/qb-export.csv",
        category: "supporting_document",
        requestId: "quickbooks",
        requestLabel: "QuickBooks export",
        uploadedAt: "2026-04-07T09:00:00.000Z",
      },
      {
        id: "bank-doc",
        name: "bank-export.csv",
        size: 2500,
        mimeType: "text/csv",
        storagePath: "tina/bank-export.csv",
        category: "supporting_document",
        requestId: "bank-support",
        requestLabel: "Bank support",
        uploadedAt: "2026-04-07T09:01:00.000Z",
      },
    ];

    const pipeline = runMoneyStory(
      withDerivedFacts(buildDraft({ documents }), [
        buildReading("qb-doc", [
          { id: "f1", label: "Money in clue", value: "$12,000.00", confidence: "high" },
          { id: "f2", label: "Money out clue", value: "$4,000.00", confidence: "high" },
          { id: "f3", label: "Date range clue", value: "2025-01-01 through 2025-03-31", confidence: "high" },
        ]),
        buildReading("bank-doc", [
          { id: "f4", label: "Money in clue", value: "$40,000.00", confidence: "high" },
          { id: "f5", label: "Money out clue", value: "$15,000.00", confidence: "high" },
          { id: "f6", label: "Date range clue", value: "2025-01-01 through 2025-12-31", confidence: "high" },
        ]),
      ])
    );

    expect(pipeline.bookTieOut.variances.some((item) => item.id === "date-coverage-mismatch")).toBe(true);
    expect(pipeline.workpapers.nextStep).toContain("Review the tie-out variances first");
    expect(pipeline.workpapers.summary).toContain("tie-out variance");
  });

  it("flags duplicated-export style inflows before Tina trusts gross receipts", () => {
    const documents: TinaStoredDocument[] = [
      {
        id: "qb-doc",
        name: "qb-export.csv",
        size: 2500,
        mimeType: "text/csv",
        storagePath: "tina/qb-export.csv",
        category: "supporting_document",
        requestId: "quickbooks",
        requestLabel: "QuickBooks export",
        uploadedAt: "2026-04-07T09:00:00.000Z",
      },
      {
        id: "bank-doc",
        name: "bank-export.csv",
        size: 2500,
        mimeType: "text/csv",
        storagePath: "tina/bank-export.csv",
        category: "supporting_document",
        requestId: "bank-support",
        requestLabel: "Bank support",
        uploadedAt: "2026-04-07T09:01:00.000Z",
      },
    ];

    const pipeline = runMoneyStory(
      withDerivedFacts(buildDraft({ documents }), [
        buildReading("qb-doc", [
          { id: "f1", label: "Money in clue", value: "$18,000.00", confidence: "high" },
          { id: "f2", label: "Money out clue", value: "$4,000.00", confidence: "high" },
          { id: "f3", label: "Date range clue", value: "2025-01-01 through 2025-12-31", confidence: "high" },
        ]),
        buildReading("bank-doc", [
          { id: "f4", label: "Money in clue", value: "$18,000.00", confidence: "high" },
          { id: "f5", label: "Money out clue", value: "$4,200.00", confidence: "high" },
          { id: "f6", label: "Date range clue", value: "2025-01-01 through 2025-12-31", confidence: "high" },
        ]),
      ])
    );

    expect(
      pipeline.bookTieOut.variances.some((item) =>
        item.title.includes("double-counting the same income")
      )
    ).toBe(true);
    expect(pipeline.workpapers.nextStep).toContain("duplicate-income");
  });

  it("keeps bad-date-range support from becoming a complete tie-out", () => {
    const documents: TinaStoredDocument[] = [
      {
        id: "qb-doc",
        name: "qb-export.csv",
        size: 2500,
        mimeType: "text/csv",
        storagePath: "tina/qb-export.csv",
        category: "supporting_document",
        requestId: "quickbooks",
        requestLabel: "QuickBooks export",
        uploadedAt: "2026-04-07T09:00:00.000Z",
      },
    ];

    const pipeline = runMoneyStory(
      withDerivedFacts(buildDraft({ documents }), [
        buildReading("qb-doc", [
          { id: "f1", label: "Money in clue", value: "$18,000.00", confidence: "high" },
          { id: "f2", label: "Money out clue", value: "$4,000.00", confidence: "high" },
        ]),
      ])
    );

    expect(pipeline.bookTieOut.variances.some((item) => item.id === "missing-date-coverage")).toBe(true);
    expect(pipeline.workpapers.nextStep).toContain("Review the tie-out variances first");
  });
});
