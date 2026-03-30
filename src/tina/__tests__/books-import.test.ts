import { describe, expect, it } from "vitest";
import { buildTinaBooksImport, createDefaultTinaBooksImport } from "@/tina/lib/books-import";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("books import builder", () => {
  it("stays idle when no books files are present", () => {
    const snapshot = buildTinaBooksImport(createDefaultTinaWorkspaceDraft());

    expect(snapshot).toEqual(createDefaultTinaBooksImport());
  });

  it("summarizes a ready QuickBooks-style spreadsheet reading", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const snapshot = buildTinaBooksImport({
      ...base,
      documents: [
        {
          id: "doc-quickbooks",
          name: "2025-p-and-l.xlsx",
          size: 2400,
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          storagePath: "tina/docs/2025-p-and-l.xlsx",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks export",
          uploadedAt: "2026-03-27T10:00:00.000Z",
        },
      ],
      documentReadings: [
        {
          documentId: "doc-quickbooks",
          status: "complete",
          kind: "spreadsheet",
          summary: "Tina found a clean spreadsheet.",
          nextStep: "Keep going.",
          facts: [
            {
              id: "fact-range",
              label: "Date range clue",
              value: "2025-01-01 through 2025-12-31",
              confidence: "high",
            },
            {
              id: "fact-in",
              label: "Money in clue",
              value: "$125,000.00",
              confidence: "high",
            },
            {
              id: "fact-out",
              label: "Money out clue",
              value: "$47,500.00",
              confidence: "high",
            },
            {
              id: "fact-payroll",
              label: "Payroll clue",
              value: "Payroll-like columns showed up in this sheet.",
              confidence: "medium",
            },
          ],
          detailLines: [],
          rowCount: 128,
          headers: ["Date", "Account", "Amount"],
          sheetNames: ["P&L"],
          lastReadAt: "2026-03-27T10:05:00.000Z",
        },
      ],
    });

    expect(snapshot.status).toBe("complete");
    expect(snapshot.documentCount).toBe(1);
    expect(snapshot.coverageStart).toBe("2025-01-01");
    expect(snapshot.coverageEnd).toBe("2025-12-31");
    expect(snapshot.moneyInTotal).toBe(125000);
    expect(snapshot.moneyOutTotal).toBe(47500);
    expect(snapshot.clueLabels).toEqual(["payroll"]);
    expect(snapshot.documents[0]?.status).toBe("ready");
  });

  it("marks unread books files as waiting", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const snapshot = buildTinaBooksImport({
      ...base,
      documents: [
        {
          id: "doc-quickbooks",
          name: "general-ledger.xlsx",
          size: 2400,
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          storagePath: "tina/docs/general-ledger.xlsx",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "General ledger",
          uploadedAt: "2026-03-27T10:00:00.000Z",
        },
      ],
    });

    expect(snapshot.status).toBe("complete");
    expect(snapshot.documents[0]?.status).toBe("waiting");
    expect(snapshot.nextStep).toContain("read");
  });
});
