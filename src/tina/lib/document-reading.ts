import { parseImportWorkbook } from "@/lib/import-normalization";
import { readTinaDocumentWithAi } from "@/tina/lib/document-reading-ai";
import { analyzeTinaSpreadsheetSignals } from "@/tina/lib/spreadsheet-signals";
import type {
  TinaDocumentReading,
  TinaDocumentReadingKind,
  TinaStoredDocument,
} from "@/tina/types";

function getLowerDocumentName(document: TinaStoredDocument): string {
  return document.name.toLowerCase();
}

export function inferTinaDocumentReadingKind(document: TinaStoredDocument): TinaDocumentReadingKind {
  const name = getLowerDocumentName(document);
  const type = document.mimeType.toLowerCase();

  if (
    type.includes("spreadsheet") ||
    type.includes("csv") ||
    name.endsWith(".csv") ||
    name.endsWith(".xlsx") ||
    name.endsWith(".xls")
  ) {
    return "spreadsheet";
  }

  if (type.includes("pdf") || name.endsWith(".pdf")) {
    return "pdf";
  }

  if (
    type.includes("word") ||
    type.includes("officedocument.wordprocessingml") ||
    name.endsWith(".doc") ||
    name.endsWith(".docx")
  ) {
    return "word";
  }

  if (type.startsWith("image/") || name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".heic")) {
    return "image";
  }

  return "unknown";
}

function createBaseReading(
  document: TinaStoredDocument,
  kind: TinaDocumentReadingKind
): TinaDocumentReading {
  return {
    documentId: document.id,
    status: "not_started",
    kind,
    summary: "Tina has not read this paper yet.",
    nextStep: "Ask Tina to read this paper when you are ready.",
    facts: [],
    detailLines: [],
    rowCount: null,
    headers: [],
    sheetNames: [],
    lastReadAt: null,
  };
}

function toFriendlyCountLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export async function readTinaDocument(
  document: TinaStoredDocument,
  file: File
): Promise<TinaDocumentReading> {
  const kind = inferTinaDocumentReadingKind(document);
  const now = new Date().toISOString();

  if (kind === "spreadsheet") {
    const workbook = await parseImportWorkbook(file);
    const chosenSheet = workbook.sheets.find((sheet) => sheet.name === workbook.chosenSheet) ?? workbook.sheets[0];
    const headers = chosenSheet?.headers.slice(0, 8) ?? [];
    const rowCount = chosenSheet?.rowCount ?? 0;
    const spreadsheetSignals = await analyzeTinaSpreadsheetSignals(document, file, workbook.chosenSheet);
    const detailLines = [
      `${toFriendlyCountLabel(workbook.sheetNames.length, "sheet", "sheets")} found in this file.`,
      `${toFriendlyCountLabel(rowCount, "data row", "data rows")} found on "${workbook.chosenSheet}".`,
    ];

    if (headers.length > 0) {
      detailLines.push(`First columns Tina found: ${headers.join(", ")}.`);
    }

    detailLines.push(...spreadsheetSignals.detailLines);

    return {
      documentId: document.id,
      status: "complete",
      kind,
      summary: spreadsheetSignals.summary,
      nextStep: spreadsheetSignals.nextStep,
      facts: [
        {
          id: "document-kind",
          label: "Paper type",
          value: "Spreadsheet",
          confidence: "high",
        },
        {
          id: "row-count",
          label: "Data rows found",
          value: String(rowCount),
          confidence: "high",
        },
        ...spreadsheetSignals.facts,
      ],
      detailLines,
      rowCount,
      headers,
      sheetNames: workbook.sheetNames,
      lastReadAt: now,
    };
  }

  if (kind === "pdf" || kind === "word" || kind === "image") {
    return readTinaDocumentWithAi(document, file);
  }

  return {
    ...createBaseReading(document, kind),
    status: "waiting_for_ai",
    summary: "Tina saved this paper, but she does not know this file type well enough yet.",
    nextStep: "You can keep the file here. Tina's deeper document reading will handle more file types next.",
    detailLines: ["The paper is safely saved in Tina's vault."],
    lastReadAt: now,
  };
}
