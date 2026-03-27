import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { readTinaDocument } from "@/tina/lib/document-reading";
import type { TinaStoredDocument } from "@/tina/types";

describe("readTinaDocument", () => {
  it("reads a csv spreadsheet into a structured Tina document reading", async () => {
    const document: TinaStoredDocument = {
      id: "doc-csv",
      name: "profit-loss.csv",
      size: 72,
      mimeType: "text/csv",
      storagePath: "user/2025/doc-csv.csv",
      category: "supporting_document",
      requestId: "quickbooks",
      requestLabel: "QuickBooks or your profit-and-loss report",
      uploadedAt: "2026-03-26T21:00:00.000Z",
    };

    const file = new File(
      [
        "Date,Account,Amount,Month\n2025-01-01,Income,1200,January\n2025-01-02,Payroll Expense,-120,January\n2025-01-03,Sales Tax Payable,-55,January",
      ],
      document.name,
      { type: document.mimeType }
    );

    const reading = await readTinaDocument(document, file);

    expect(reading.status).toBe("complete");
    expect(reading.kind).toBe("spreadsheet");
    expect(reading.rowCount).toBe(3);
    expect(reading.headers).toEqual(["Date", "Account", "Amount", "Month"]);
    expect(reading.summary).toContain("money report");
    expect(reading.summary).toContain("money picture");
    expect(reading.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Date range clue",
          value: "2025-01-01 through 2025-01-03",
        }),
        expect.objectContaining({
          label: "Money in clue",
          value: "$1,200.00",
        }),
        expect.objectContaining({
          label: "Money out clue",
          value: "$175.00",
        }),
        expect.objectContaining({
          label: "Payroll clue",
        }),
        expect.objectContaining({
          label: "Sales tax clue",
        }),
      ])
    );
  });

  it("marks pdf files as waiting for deeper reading", async () => {
    const document: TinaStoredDocument = {
      id: "doc-pdf",
      name: "2024-return.pdf",
      size: 5120,
      mimeType: "application/pdf",
      storagePath: "user/2025/doc-pdf.pdf",
      category: "prior_return",
      requestId: "prior-return",
      requestLabel: "Last year's tax return",
      uploadedAt: "2026-03-26T21:10:00.000Z",
    };

    const file = new File(["pretend pdf"], document.name, { type: document.mimeType });

    const reading = await readTinaDocument(document, file);

    expect(reading.status).toBe("waiting_for_ai");
    expect(reading.kind).toBe("pdf");
    expect(reading.nextStep.toLowerCase()).toContain("deeper reading");
  });

  it("reads legacy xls spreadsheets too", async () => {
    const document: TinaStoredDocument = {
      id: "doc-xls",
      name: "general-ledger.xls",
      size: 4096,
      mimeType: "application/vnd.ms-excel",
      storagePath: "user/2025/doc-xls.xls",
      category: "supporting_document",
      requestId: "bank-support",
      requestLabel: "Business bank and card statements",
      uploadedAt: "2026-03-26T21:12:00.000Z",
    };

    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Date", "Description", "Amount"],
      ["2025-01-02", "Deposit", 1200],
      ["2025-01-03", "Supplies", -45],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Ledger");
    const binary = XLSX.write(workbook, { type: "buffer", bookType: "xls" });
    const file = new File([binary], document.name, { type: document.mimeType });

    const reading = await readTinaDocument(document, file);

    expect(reading.status).toBe("complete");
    expect(reading.kind).toBe("spreadsheet");
    expect(reading.sheetNames).toEqual(["Ledger"]);
    expect(reading.headers).toEqual(["Date", "Description", "Amount"]);
  });
});
