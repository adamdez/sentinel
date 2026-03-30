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
        "Date,Account,Description,Amount\n2025-01-01,Tax Setup Note,Form 2553 election accepted for S corporation treatment,0\n2025-01-01,Income,January income,1200\n2025-01-02,Payroll Expense,January payroll,-120\n2025-01-03,Sales Tax Payable,January sales tax,-55",
      ],
      document.name,
      { type: document.mimeType }
    );

    const reading = await readTinaDocument(document, file);

    expect(reading.status).toBe("complete");
    expect(reading.kind).toBe("spreadsheet");
    expect(reading.rowCount).toBe(4);
    expect(reading.headers).toEqual(["Date", "Account", "Description", "Amount"]);
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
        expect.objectContaining({
          label: "LLC election clue",
        }),
        expect.objectContaining({
          label: "LLC tax treatment clue",
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

  it("detects partnership-style llc clues from spreadsheet notes", async () => {
    const document: TinaStoredDocument = {
      id: "doc-partnership-csv",
      name: "partnership-profit-loss.csv",
      size: 96,
      mimeType: "text/csv",
      storagePath: "user/2025/doc-partnership-csv.csv",
      category: "supporting_document",
      requestId: "quickbooks",
      requestLabel: "QuickBooks or your profit-and-loss report",
      uploadedAt: "2026-03-28T20:00:00.000Z",
    };

    const file = new File(
      [
        "Date,Account,Description,Amount\n2025-01-01,Tax Setup Note,Form 1065 partnership return for two-member LLC with Schedule K-1s,0\n2025-01-02,Income,January consulting income,2400\n2025-01-03,Software,Planning software,-120",
      ],
      document.name,
      { type: document.mimeType }
    );

    const reading = await readTinaDocument(document, file);

    expect(reading.status).toBe("complete");
    expect(reading.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "LLC tax treatment clue",
          value: "This paper mentions partnership return treatment for the LLC.",
        }),
      ])
    );
  });

  it("detects spouse community-property llc clues from spreadsheet notes", async () => {
    const document: TinaStoredDocument = {
      id: "doc-community-property-csv",
      name: "community-property-profit-loss.csv",
      size: 112,
      mimeType: "text/csv",
      storagePath: "user/2025/doc-community-property-csv.csv",
      category: "supporting_document",
      requestId: "quickbooks",
      requestLabel: "QuickBooks or your profit-and-loss report",
      uploadedAt: "2026-03-28T21:05:00.000Z",
    };

    const file = new File(
      [
        "Date,Account,Description,Amount\n2025-01-01,Tax Setup Note,Schedule C owner return for husband and wife community property LLC,0\n2025-01-02,Income,January design income,2400\n2025-01-03,Supplies,Sample boards,-120",
      ],
      document.name,
      { type: document.mimeType }
    );

    const reading = await readTinaDocument(document, file);

    expect(reading.status).toBe("complete");
    expect(reading.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "LLC tax treatment clue",
          value: "This paper mentions owner-return treatment for the LLC.",
        }),
        expect.objectContaining({
          label: "Community property clue",
          value: "This paper mentions spouses and community-property treatment.",
        }),
      ])
    );
  });

  it("detects corporation-style llc clues from spreadsheet notes", async () => {
    const document: TinaStoredDocument = {
      id: "doc-c-corp-csv",
      name: "c-corp-profit-loss.csv",
      size: 120,
      mimeType: "text/csv",
      storagePath: "user/2025/doc-c-corp-csv.csv",
      category: "supporting_document",
      requestId: "quickbooks",
      requestLabel: "QuickBooks or your profit-and-loss report",
      uploadedAt: "2026-03-28T22:15:00.000Z",
    };

    const file = new File(
      [
        "Date,Account,Description,Amount\n2025-01-01,Tax Setup Note,Form 8832 corporation election with Form 1120 return treatment,0\n2025-01-02,Income,January software income,2400\n2025-01-03,Software,Developer tools,-120",
      ],
      document.name,
      { type: document.mimeType }
    );

    const reading = await readTinaDocument(document, file);

    expect(reading.status).toBe("complete");
    expect(reading.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "LLC election clue",
          value: "This paper mentions a Form 8832 corporation election.",
        }),
        expect.objectContaining({
          label: "LLC tax treatment clue",
          value: "This paper mentions corporation return treatment for the LLC.",
        }),
      ])
    );
  });

  it("detects fixed-asset, repair, and small-equipment clues from fringe books", async () => {
    const document: TinaStoredDocument = {
      id: "doc-fringe-csv",
      name: "fringe-books.csv",
      size: 164,
      mimeType: "text/csv",
      storagePath: "user/2025/doc-fringe-csv.csv",
      category: "supporting_document",
      requestId: "quickbooks",
      requestLabel: "QuickBooks or your profit-and-loss report",
      uploadedAt: "2026-03-29T10:10:00.000Z",
    };

    const file = new File(
      [
        "Date,Account,Description,Amount\n2025-01-10,Equipment,Portable extraction machine package,-2480\n2025-01-12,Repairs & Maintenance,Vacuum motor rebuild and service,-860\n2025-02-08,Tools,Meters hoses nozzles filters,-1425",
      ],
      document.name,
      { type: document.mimeType }
    );

    const reading = await readTinaDocument(document, file);

    expect(reading.status).toBe("complete");
    expect(reading.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Fixed asset clue",
          value: expect.stringContaining('Equipment: Portable extraction machine package'),
        }),
        expect.objectContaining({
          label: "Repair clue",
          value: expect.stringContaining('Repairs & Maintenance: Vacuum motor rebuild and service'),
        }),
        expect.objectContaining({
          label: "Small equipment clue",
          value: expect.stringContaining('Tools: Meters hoses nozzles filters'),
        }),
      ])
    );
  });
});
