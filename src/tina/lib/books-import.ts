import { findTinaDocumentReading } from "@/tina/lib/document-readings";
import type {
  TinaBooksImportDocument,
  TinaBooksImportSnapshot,
  TinaDocumentReading,
  TinaStoredDocument,
  TinaWorkspaceDraft,
} from "@/tina/types";

const QUICKBOOKS_REQUEST_ID = "quickbooks";
const CLUE_LABELS = new Map<string, string>([
  ["Payroll clue", "payroll"],
  ["Sales tax clue", "sales tax"],
  ["Contractor clue", "contractors"],
  ["Inventory clue", "inventory"],
  ["Fixed asset clue", "big purchases"],
  ["Repair clue", "repairs"],
  ["Small equipment clue", "small equipment"],
  ["State clue", "state activity"],
]);

function parseMoneyValue(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const hasParens = trimmed.startsWith("(") && trimmed.endsWith(")");
  const sanitized = trimmed.replace(/[$,%\s]/g, "").replace(/,/g, "");
  const negativeSafe = hasParens ? `-${sanitized.slice(1, -1)}` : sanitized;
  if (!/^-?\d*\.?\d+$/.test(negativeSafe)) return null;

  const parsed = Number(negativeSafe);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDateRange(value: string): { start: string; end: string } | null {
  const match = value.match(/(\d{4}-\d{2}-\d{2})\s+through\s+(\d{4}-\d{2}-\d{2})/i);
  if (!match) return null;

  return {
    start: match[1],
    end: match[2],
  };
}

function formatMoney(value: number | null): string {
  if (value === null) return "unknown";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCoverage(start: string | null, end: string | null): string | null {
  if (!start && !end) return null;
  if (start && end) return `${start} through ${end}`;
  return start ?? end;
}

function buildDocumentSummary(args: {
  name: string;
  rowCount: number | null;
  coverageLabel: string | null;
  moneyIn: number | null;
  moneyOut: number | null;
  clueLabels: string[];
  status: TinaBooksImportDocument["status"];
  reading?: TinaDocumentReading | null;
}): string {
  if (args.status === "waiting") {
    if (args.reading?.status === "error") {
      return "Tina tried to read this books file but needs a cleaner copy or a different export.";
    }
    return "Tina still needs to read this books file.";
  }

  const pieces: string[] = [];
  if (args.rowCount !== null) {
    pieces.push(`${args.rowCount} ${args.rowCount === 1 ? "row" : "rows"}`);
  }
  if (args.coverageLabel) {
    pieces.push(`coverage ${args.coverageLabel}`);
  }
  if (args.moneyIn !== null || args.moneyOut !== null) {
    pieces.push(`money in ${formatMoney(args.moneyIn)} and money out ${formatMoney(args.moneyOut)}`);
  }
  if (args.clueLabels.length > 0) {
    pieces.push(`clues: ${args.clueLabels.join(", ")}`);
  }

  if (pieces.length === 0) {
    return "Tina read this books file but still needs a cleaner export before she can trust it.";
  }

  return `Tina pulled out ${pieces.join(" | ")}.`;
}

function buildImportDocument(
  document: TinaStoredDocument,
  reading: TinaDocumentReading | null
): TinaBooksImportDocument {
  if (!reading || reading.status === "not_started" || reading.status === "waiting_for_ai") {
    return {
      documentId: document.id,
      name: document.name,
      status: "waiting",
      summary: "Tina still needs to read this books file.",
      rowCount: null,
      coverageStart: null,
      coverageEnd: null,
      moneyIn: null,
      moneyOut: null,
      clueLabels: [],
      lastReadAt: reading?.lastReadAt ?? null,
    };
  }

  if (reading.status === "error") {
    return {
      documentId: document.id,
      name: document.name,
      status: "needs_attention",
      summary: "Tina could not read this books file cleanly yet.",
      rowCount: reading.rowCount,
      coverageStart: null,
      coverageEnd: null,
      moneyIn: null,
      moneyOut: null,
      clueLabels: [],
      lastReadAt: reading.lastReadAt,
    };
  }

  const dateRangeValue = reading.facts.find((fact) => fact.label === "Date range clue")?.value ?? "";
  const parsedRange = parseDateRange(dateRangeValue);
  const moneyIn = parseMoneyValue(
    reading.facts.find((fact) => fact.label === "Money in clue")?.value ?? ""
  );
  const moneyOut = parseMoneyValue(
    reading.facts.find((fact) => fact.label === "Money out clue")?.value ?? ""
  );
  const clueLabels = reading.facts
    .map((fact) => CLUE_LABELS.get(fact.label))
    .filter((label): label is string => Boolean(label));
  const coverageLabel = formatCoverage(parsedRange?.start ?? null, parsedRange?.end ?? null);
  const hasUsefulSignal =
    coverageLabel !== null ||
    moneyIn !== null ||
    moneyOut !== null ||
    clueLabels.length > 0 ||
    reading.rowCount !== null;

  const status: TinaBooksImportDocument["status"] = hasUsefulSignal ? "ready" : "needs_attention";

  return {
    documentId: document.id,
    name: document.name,
    status,
    summary: buildDocumentSummary({
      name: document.name,
      rowCount: reading.rowCount,
      coverageLabel,
      moneyIn,
      moneyOut,
      clueLabels,
      status,
      reading,
    }),
    rowCount: reading.rowCount,
    coverageStart: parsedRange?.start ?? null,
    coverageEnd: parsedRange?.end ?? null,
    moneyIn,
    moneyOut,
    clueLabels,
    lastReadAt: reading.lastReadAt,
  };
}

function compareNullableDate(left: string | null, right: string | null): number {
  if (left === right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.localeCompare(right);
}

function sumNullable(values: Array<number | null>): number | null {
  let total = 0;
  let sawAny = false;

  values.forEach((value) => {
    if (typeof value !== "number") return;
    total += value;
    sawAny = true;
  });

  return sawAny ? total : null;
}

function buildSnapshotSummary(snapshot: TinaBooksImportSnapshot): { summary: string; nextStep: string } {
  const waitingCount = snapshot.documents.filter((document) => document.status === "waiting").length;
  const attentionCount = snapshot.documents.filter(
    (document) => document.status === "needs_attention"
  ).length;

  if (snapshot.documentCount === 0) {
    return {
      summary: "Tina has not sorted any books files yet.",
      nextStep: "Add a QuickBooks export, profit-and-loss report, or general ledger first.",
    };
  }

  if (waitingCount > 0) {
    return {
      summary: `Tina lined up ${snapshot.documentCount} books ${snapshot.documentCount === 1 ? "file" : "files"}, but ${waitingCount} still ${waitingCount === 1 ? "needs" : "need"} a first read.`,
      nextStep: "Let Tina read the waiting books files, then rebuild this books snapshot.",
    };
  }

  if (attentionCount > 0) {
    return {
      summary: `Tina sorted ${snapshot.documentCount} books ${snapshot.documentCount === 1 ? "file" : "files"}, but ${attentionCount} still ${attentionCount === 1 ? "looks" : "look"} shaky.`,
      nextStep: "Open the marked books files and swap in a cleaner export if Tina still looks unsure.",
    };
  }

  const coverageLabel = formatCoverage(snapshot.coverageStart, snapshot.coverageEnd);
  if (coverageLabel) {
    return {
      summary: `Tina stitched together ${snapshot.documentCount} books ${snapshot.documentCount === 1 ? "file" : "files"} with coverage ${coverageLabel}.`,
      nextStep:
        snapshot.clueLabels.length > 0
          ? "Check the clue chips below before Tina carries these books into the money story."
          : "These books are ready for Tina's money story build.",
    };
  }

  return {
    summary: `Tina sorted ${snapshot.documentCount} books ${snapshot.documentCount === 1 ? "file" : "files"} and pulled out first money clues.`,
    nextStep:
      snapshot.clueLabels.length > 0
        ? "Check the clue chips below before Tina leans on them."
        : "These books are ready for Tina's next bookkeeping step.",
  };
}

export function createDefaultTinaBooksImport(): TinaBooksImportSnapshot {
  return {
    lastRunAt: null,
    status: "idle",
    summary: "Tina has not sorted your books yet.",
    nextStep: "Add one clear books file, then ask Tina to sort the books.",
    documentCount: 0,
    coverageStart: null,
    coverageEnd: null,
    moneyInTotal: null,
    moneyOutTotal: null,
    clueLabels: [],
    documents: [],
  };
}

export function markTinaBooksImportStale(
  booksImport: TinaBooksImportSnapshot
): TinaBooksImportSnapshot {
  if (booksImport.status === "idle" || booksImport.status === "stale") return booksImport;

  return {
    ...booksImport,
    status: "stale",
    summary: "Your books files changed, so Tina should sort them again.",
    nextStep: "Let Tina sort the books again so she does not lean on old book clues.",
  };
}

export function buildTinaBooksImport(draft: TinaWorkspaceDraft): TinaBooksImportSnapshot {
  const booksDocuments = draft.documents.filter((document) => document.requestId === QUICKBOOKS_REQUEST_ID);
  if (booksDocuments.length === 0) {
    return createDefaultTinaBooksImport();
  }

  const documents = booksDocuments.map((document) =>
    buildImportDocument(document, findTinaDocumentReading(draft.documentReadings, document.id))
  );
  const clueLabels = Array.from(
    new Set(documents.flatMap((document) => document.clueLabels))
  ).sort((left, right) => left.localeCompare(right));
  const coverageDates = documents.flatMap((document) => [document.coverageStart, document.coverageEnd]);
  const sortedStarts = documents
    .map((document) => document.coverageStart)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => left.localeCompare(right));
  const sortedEnds = documents
    .map((document) => document.coverageEnd)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => left.localeCompare(right));

  const snapshot: TinaBooksImportSnapshot = {
    lastRunAt: new Date().toISOString(),
    status: "complete",
    summary: "",
    nextStep: "",
    documentCount: documents.length,
    coverageStart: sortedStarts[0] ?? null,
    coverageEnd: sortedEnds[sortedEnds.length - 1] ?? null,
    moneyInTotal: sumNullable(documents.map((document) => document.moneyIn)),
    moneyOutTotal: sumNullable(documents.map((document) => document.moneyOut)),
    clueLabels,
    documents: documents.sort((left, right) => {
      const statusWeight = { needs_attention: 0, waiting: 1, ready: 2 } as const;
      const statusDelta = statusWeight[left.status] - statusWeight[right.status];
      if (statusDelta !== 0) return statusDelta;
      return compareNullableDate(right.lastReadAt, left.lastReadAt);
    }),
  };

  const summary = buildSnapshotSummary(snapshot);
  return {
    ...snapshot,
    summary: summary.summary,
    nextStep: summary.nextStep,
  };
}
