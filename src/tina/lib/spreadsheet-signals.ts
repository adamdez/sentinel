import { parseImportRows } from "@/lib/import-normalization";
import type { TinaDocumentFactConfidence, TinaDocumentReadingFact, TinaStoredDocument } from "@/tina/types";

interface TinaSpreadsheetAmountSnapshot {
  moneyInTotal: number | null;
  moneyOutTotal: number | null;
}

interface TinaSpreadsheetDateSnapshot {
  start: Date;
  end: Date;
}

export interface TinaSpreadsheetSignals {
  facts: TinaDocumentReadingFact[];
  detailLines: string[];
  summary: string;
  nextStep: string;
}

interface TinaTransactionAnchorClue {
  label: string;
  value: string;
  confidence: TinaDocumentFactConfidence;
}

interface TinaLedgerBucket {
  name: string;
  rowCount: number;
  net: number;
}

interface TinaTransactionGroup {
  label: string;
  rowCount: number;
  total: number;
  startDate: Date | null;
  endDate: Date | null;
}

interface TinaTransactionLineageCluster {
  label: string;
  rowCount: number;
  total: number;
  startDate: Date | null;
  endDate: Date | null;
}

interface SpreadsheetColumnStats {
  header: string;
  normalizedHeader: string;
  nonEmptyCount: number;
  numericCount: number;
  dateCount: number;
  samples: string[];
}

const DATE_HEADER_HINTS = ["date", "month", "posted", "transaction", "day"];
const TEXT_HEADER_HINTS = [
  "account",
  "category",
  "description",
  "memo",
  "detail",
  "name",
  "vendor",
  "payee",
  "class",
  "item",
  "type",
];
const AMOUNT_HEADER_PRIORITY = [
  "amount",
  "total",
  "net",
  "credit",
  "debit",
  "payment",
  "deposit",
  "sales",
  "revenue",
  "income",
];
const IGNORED_NUMERIC_HEADERS = ["balance", "beginning balance", "ending balance", "year"];

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[_\-]+/g, " ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

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

function parseDateValue(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) return new Date(parsed);

  const numericDate = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!numericDate) return null;

  const [, monthRaw, dayRaw, yearRaw] = numericDate;
  const year = yearRaw.length === 2 ? Number(`20${yearRaw}`) : Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;

  return new Date(Date.UTC(year, month - 1, day));
}

function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatFactDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function buildColumnStats(rows: Record<string, string>[], headers: string[]): SpreadsheetColumnStats[] {
  return headers.map((header) => {
    const values = rows.map((row) => row[header] ?? "").filter((value) => value.trim().length > 0);
    const samples = values.slice(0, 5);
    const numericCount = values.filter((value) => parseMoneyValue(value) !== null).length;
    const dateCount = values.filter((value) => parseDateValue(value) !== null).length;

    return {
      header,
      normalizedHeader: normalizeHeader(header),
      nonEmptyCount: values.length,
      numericCount,
      dateCount,
      samples,
    };
  });
}

function pickDateHeader(stats: SpreadsheetColumnStats[]): string | null {
  const headerHintMatch = stats
    .filter(
      (stat) =>
        stat.dateCount > 0 &&
        DATE_HEADER_HINTS.some((hint) => stat.normalizedHeader.includes(hint))
    )
    .sort((left, right) => right.dateCount - left.dateCount)[0];

  if (headerHintMatch) return headerHintMatch.header;

  const ratioMatch = stats
    .filter((stat) => stat.nonEmptyCount > 0 && stat.dateCount / stat.nonEmptyCount >= 0.6)
    .sort((left, right) => right.dateCount - left.dateCount)[0];

  return ratioMatch?.header ?? null;
}

function headerPriorityScore(header: string): number {
  const normalized = normalizeHeader(header);
  if (IGNORED_NUMERIC_HEADERS.some((hint) => normalized.includes(hint))) return -1;
  const matchedIndex = AMOUNT_HEADER_PRIORITY.findIndex((hint) => normalized.includes(hint));
  if (matchedIndex !== -1) return 10 - matchedIndex;
  return 0;
}

function pickAmountHeaders(stats: SpreadsheetColumnStats[]): {
  amountHeader: string | null;
  creditHeader: string | null;
  debitHeader: string | null;
} {
  const numericStats = stats.filter((stat) => stat.numericCount > 0 && headerPriorityScore(stat.header) >= 0);
  const creditHeader =
    numericStats.find((stat) => stat.normalizedHeader.includes("credit"))?.header ?? null;
  const debitHeader =
    numericStats.find((stat) => stat.normalizedHeader.includes("debit"))?.header ?? null;

  if (creditHeader || debitHeader) {
    return {
      amountHeader: null,
      creditHeader,
      debitHeader,
    };
  }

  const bestAmountHeader = numericStats
    .slice()
    .sort((left, right) => {
      const scoreDelta = headerPriorityScore(right.header) - headerPriorityScore(left.header);
      if (scoreDelta !== 0) return scoreDelta;
      return right.numericCount - left.numericCount;
    })[0];

  if (bestAmountHeader && (headerPriorityScore(bestAmountHeader.header) > 0 || numericStats.length === 1)) {
    return {
      amountHeader: bestAmountHeader.header,
      creditHeader: null,
      debitHeader: null,
    };
  }

  return {
    amountHeader: null,
    creditHeader: null,
    debitHeader: null,
  };
}

function buildAmountSnapshot(
  rows: Record<string, string>[],
  headers: ReturnType<typeof pickAmountHeaders>
): TinaSpreadsheetAmountSnapshot {
  let moneyInTotal = 0;
  let moneyOutTotal = 0;
  let sawAnyAmount = false;

  rows.forEach((row) => {
    if (headers.creditHeader || headers.debitHeader) {
      if (headers.creditHeader) {
        const creditValue = parseMoneyValue(row[headers.creditHeader] ?? "");
        if (creditValue !== null) {
          moneyInTotal += Math.abs(creditValue);
          sawAnyAmount = true;
        }
      }
      if (headers.debitHeader) {
        const debitValue = parseMoneyValue(row[headers.debitHeader] ?? "");
        if (debitValue !== null) {
          moneyOutTotal += Math.abs(debitValue);
          sawAnyAmount = true;
        }
      }
      return;
    }

    if (!headers.amountHeader) return;

    const amountValue = parseMoneyValue(row[headers.amountHeader] ?? "");
    if (amountValue === null) return;

    sawAnyAmount = true;
    if (amountValue >= 0) {
      moneyInTotal += amountValue;
    } else {
      moneyOutTotal += Math.abs(amountValue);
    }
  });

  if (!sawAnyAmount) {
    return {
      moneyInTotal: null,
      moneyOutTotal: null,
    };
  }

  return {
    moneyInTotal,
    moneyOutTotal,
  };
}

function buildDateSnapshot(rows: Record<string, string>[], dateHeader: string | null): TinaSpreadsheetDateSnapshot | null {
  if (!dateHeader) return null;

  const parsedDates = rows
    .map((row) => parseDateValue(row[dateHeader] ?? ""))
    .filter((value): value is Date => value !== null)
    .sort((left, right) => left.getTime() - right.getTime());

  if (parsedDates.length === 0) return null;

  return {
    start: parsedDates[0],
    end: parsedDates[parsedDates.length - 1],
  };
}

function pickTextHeaders(stats: SpreadsheetColumnStats[]): string[] {
  const hintedHeaders = stats
    .filter((stat) => TEXT_HEADER_HINTS.some((hint) => stat.normalizedHeader.includes(hint)))
    .map((stat) => stat.header);

  if (hintedHeaders.length > 0) return hintedHeaders;

  const fallback = stats.find(
    (stat) =>
      stat.nonEmptyCount > 0 &&
      stat.numericCount / Math.max(stat.nonEmptyCount, 1) < 0.25 &&
      stat.dateCount / Math.max(stat.nonEmptyCount, 1) < 0.25
  );

  return fallback ? [fallback.header] : [];
}

function buildTransactionAnchorClues(
  rows: Record<string, string>[],
  textHeaders: string[]
): TinaTransactionAnchorClue[] {
  if (textHeaders.length === 0) return [];

  const samples = rows
    .map((row) =>
      textHeaders
        .map((header) => (row[header] ?? "").trim())
        .filter((value) => value.length > 0)
        .join(" | ")
    )
    .filter((value) => value.length > 0);

  const uniqueSamples = Array.from(new Set(samples)).slice(0, 3);
  const clues: TinaTransactionAnchorClue[] = [];

  uniqueSamples.forEach((sample) => {
    clues.push({
      label: "Transaction sample clue",
      value: sample.slice(0, 160),
      confidence: "medium",
    });
  });

  textHeaders.slice(0, 2).forEach((header) => {
    clues.push({
      label: "Transaction column clue",
      value: header.slice(0, 160),
      confidence: "medium",
    });
  });

  return clues;
}

function buildLedgerBucketClues(
  rows: Record<string, string>[],
  textHeaders: string[],
  amountHeaders: ReturnType<typeof pickAmountHeaders>
): TinaTransactionAnchorClue[] {
  if (textHeaders.length === 0) return [];
  const bucketHeader = textHeaders[0];
  const buckets = new Map<string, TinaLedgerBucket>();

  rows.forEach((row) => {
    const bucketName = (row[bucketHeader] ?? "").trim();
    if (!bucketName) return;

    let amount = 0;
    let sawAmount = false;
    if (amountHeaders.creditHeader || amountHeaders.debitHeader) {
      const credit = amountHeaders.creditHeader
        ? parseMoneyValue(row[amountHeaders.creditHeader] ?? "")
        : null;
      const debit = amountHeaders.debitHeader
        ? parseMoneyValue(row[amountHeaders.debitHeader] ?? "")
        : null;
      if (credit !== null) {
        amount += Math.abs(credit);
        sawAmount = true;
      }
      if (debit !== null) {
        amount -= Math.abs(debit);
        sawAmount = true;
      }
    } else if (amountHeaders.amountHeader) {
      const parsed = parseMoneyValue(row[amountHeaders.amountHeader] ?? "");
      if (parsed !== null) {
        amount = parsed;
        sawAmount = true;
      }
    }

    if (!sawAmount) return;

    const current = buckets.get(bucketName) ?? {
      name: bucketName,
      rowCount: 0,
      net: 0,
    };
    current.rowCount += 1;
    current.net += amount;
    buckets.set(bucketName, current);
  });

  return Array.from(buckets.values())
    .sort((left, right) => Math.abs(right.net) - Math.abs(left.net))
    .slice(0, 3)
    .map((bucket) => ({
      label: "Ledger bucket clue",
      value: `${bucket.name}: ${bucket.rowCount} row${bucket.rowCount === 1 ? "" : "s"}, net ${formatMoney(bucket.net)}`,
      confidence: "medium" as const,
    }));
}

function buildTransactionGroupClues(
  rows: Record<string, string>[],
  textHeaders: string[],
  amountHeaders: ReturnType<typeof pickAmountHeaders>,
  dateHeader: string | null
): TinaTransactionAnchorClue[] {
  if (textHeaders.length === 0) return [];
  const groupHeaders = textHeaders.slice(0, 2);
  const groups = new Map<string, TinaTransactionGroup>();

  rows.forEach((row) => {
    const labelParts = groupHeaders
      .map((header) => (row[header] ?? "").trim())
      .filter((value) => value.length > 0)
      .slice(0, 2);
    if (labelParts.length === 0) return;

    let total = 0;
    let sawAmount = false;
    if (amountHeaders.creditHeader || amountHeaders.debitHeader) {
      const credit = amountHeaders.creditHeader
        ? parseMoneyValue(row[amountHeaders.creditHeader] ?? "")
        : null;
      const debit = amountHeaders.debitHeader
        ? parseMoneyValue(row[amountHeaders.debitHeader] ?? "")
        : null;
      if (credit !== null) {
        total += Math.abs(credit);
        sawAmount = true;
      }
      if (debit !== null) {
        total -= Math.abs(debit);
        sawAmount = true;
      }
    } else if (amountHeaders.amountHeader) {
      const parsed = parseMoneyValue(row[amountHeaders.amountHeader] ?? "");
      if (parsed !== null) {
        total = parsed;
        sawAmount = true;
      }
    }

    if (!sawAmount) return;

    const direction = total >= 0 ? "inflow" : "outflow";
    const label = labelParts.join(" | ").slice(0, 120);
    const key = `${label.toLowerCase()}::${direction}`;
    const parsedDate = dateHeader ? parseDateValue(row[dateHeader] ?? "") : null;
    const current = groups.get(key) ?? {
      label: `${label} (${direction})`,
      rowCount: 0,
      total: 0,
      startDate: parsedDate,
      endDate: parsedDate,
    };

    current.rowCount += 1;
    current.total += total;
    if (parsedDate) {
      current.startDate =
        !current.startDate || parsedDate.getTime() < current.startDate.getTime()
          ? parsedDate
          : current.startDate;
      current.endDate =
        !current.endDate || parsedDate.getTime() > current.endDate.getTime()
          ? parsedDate
          : current.endDate;
    }
    groups.set(key, current);
  });

  return Array.from(groups.values())
    .sort((left, right) => Math.abs(right.total) - Math.abs(left.total))
    .slice(0, 5)
    .map((group) => {
      const dateRange =
        group.startDate && group.endDate
          ? `, dates ${formatShortDate(group.startDate)} to ${formatShortDate(group.endDate)}`
          : "";
      return {
        label: "Transaction group clue",
        value: `${group.label}: ${group.rowCount} row${
          group.rowCount === 1 ? "" : "s"
        }, total ${formatMoney(group.total)}${dateRange}`,
        confidence: "medium" as const,
      };
    });
}

function buildTransactionLineageClues(
  rows: Record<string, string>[],
  textHeaders: string[],
  amountHeaders: ReturnType<typeof pickAmountHeaders>,
  dateHeader: string | null
): TinaTransactionAnchorClue[] {
  if (textHeaders.length === 0 || !dateHeader) return [];

  const primaryHeader = textHeaders[0];
  const clusters = new Map<string, TinaTransactionLineageCluster>();

  rows.forEach((row) => {
    const primaryValue = (row[primaryHeader] ?? "").trim();
    const parsedDate = parseDateValue(row[dateHeader] ?? "");
    if (!primaryValue || !parsedDate) return;

    let total = 0;
    let sawAmount = false;
    if (amountHeaders.creditHeader || amountHeaders.debitHeader) {
      const credit = amountHeaders.creditHeader
        ? parseMoneyValue(row[amountHeaders.creditHeader] ?? "")
        : null;
      const debit = amountHeaders.debitHeader
        ? parseMoneyValue(row[amountHeaders.debitHeader] ?? "")
        : null;
      if (credit !== null) {
        total += Math.abs(credit);
        sawAmount = true;
      }
      if (debit !== null) {
        total -= Math.abs(debit);
        sawAmount = true;
      }
    } else if (amountHeaders.amountHeader) {
      const parsed = parseMoneyValue(row[amountHeaders.amountHeader] ?? "");
      if (parsed !== null) {
        total = parsed;
        sawAmount = true;
      }
    }

    if (!sawAmount) return;

    const direction = total >= 0 ? "inflow" : "outflow";
    const monthBucket = formatFactDate(parsedDate).slice(0, 7);
    const label = `${primaryValue.slice(0, 80)} | ${monthBucket} (${direction})`;
    const key = `${label.toLowerCase()}::${direction}`;
    const current = clusters.get(key) ?? {
      label,
      rowCount: 0,
      total: 0,
      startDate: parsedDate,
      endDate: parsedDate,
    };

    current.rowCount += 1;
    current.total += total;
    current.startDate =
      !current.startDate || parsedDate.getTime() < current.startDate.getTime()
        ? parsedDate
        : current.startDate;
    current.endDate =
      !current.endDate || parsedDate.getTime() > current.endDate.getTime()
        ? parsedDate
        : current.endDate;

    clusters.set(key, current);
  });

  return Array.from(clusters.values())
    .sort((left, right) => Math.abs(right.total) - Math.abs(left.total))
    .slice(0, 6)
    .map((cluster) => ({
      label: "Transaction lineage clue",
      value: `${cluster.label}: ${cluster.rowCount} row${
        cluster.rowCount === 1 ? "" : "s"
      }, total ${formatMoney(cluster.total)}, dates ${formatShortDate(
        cluster.startDate ?? new Date(0)
      )} to ${formatShortDate(cluster.endDate ?? new Date(0))}`,
      confidence: "medium" as const,
    }));
}

function detectKeywordClues(rows: Record<string, string>[], textHeaders: string[]): Array<{
  label: string;
  value: string;
  confidence: TinaDocumentFactConfidence;
}> {
  if (textHeaders.length === 0) return [];

  const haystack = rows
    .flatMap((row) => textHeaders.map((header) => row[header] ?? ""))
    .join(" ")
    .toLowerCase();

  const clues: Array<{ label: string; value: string; confidence: TinaDocumentFactConfidence }> = [];

  if (/\b(payroll|wages|salary|employee|941|w-2)\b/.test(haystack)) {
    clues.push({
      label: "Payroll clue",
      value: "This paper mentions payroll, wages, or employees.",
      confidence: "medium",
    });
  }

  if (/\b(sales tax|wa sales tax|retail sales tax|tax collected|tax payable)\b/.test(haystack)) {
    clues.push({
      label: "Sales tax clue",
      value: "This paper mentions sales tax activity.",
      confidence: "medium",
    });
  }

  if (/\b(contractor|subcontractor|1099|freelance)\b/.test(haystack)) {
    clues.push({
      label: "Contractor clue",
      value: "This paper mentions contractors or 1099-style payments.",
      confidence: "medium",
    });
  }

  if (/\b(inventory|cogs|cost of goods|stock)\b/.test(haystack)) {
    clues.push({
      label: "Inventory clue",
      value: "This paper mentions inventory or cost of goods.",
      confidence: "medium",
    });
  }

  if (
    /\b(owner draw|owners draw|owner withdrawal|member draw|partner draw|distribution to owner|shareholder distribution)\b/.test(
      haystack
    )
  ) {
    clues.push({
      label: "Owner draw clue",
      value: "This paper mentions owner draws, owner withdrawals, or owner distributions.",
      confidence: "medium",
    });
  }

  const hasEntityNameToken = /\b(llc|inc|corp|corporation|company|co\.|lp|l\.p\.)\b/.test(
    haystack
  );
  if (
    /\b(intercompany|due to|due from|inter-company)\b/.test(haystack) ||
    (hasEntityNameToken && /\b(transfer to|transfer from|loan to|loan from)\b/.test(haystack))
  ) {
    clues.push({
      label: "Intercompany transfer clue",
      value:
        "This paper may include transfers, loans, or due-to/due-from activity between entities.",
      confidence: "medium",
    });
  }

  if (
    /\b(related party|shareholder loan|officer loan|loan from owner|loan to owner|family loan|due from shareholder|due to shareholder|due from member|due to member)\b/.test(
      haystack
    )
  ) {
    clues.push({
      label: "Related-party clue",
      value:
        "This paper mentions related-party balances or owner/shareholder/member loan activity.",
      confidence: "medium",
    });
  }

  const normalizeEin = (value: string): string => {
    const digits = value.replace(/[^0-9]/g, "");
    if (digits.length !== 9) return value;
    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  };

  const dashedEinMatches = haystack.match(/\b\d{2}-\d{7}\b/g) ?? [];
  const contextualUndashedEinMatches = Array.from(
    haystack.matchAll(/\bein(?:\s*(?:number|#|no\.?))?\s*[:#-]?\s*(\d{2}-?\d{7})\b/g)
  ).map((match) => match[1]);

  const einMatches = Array.from(
    new Set([...dashedEinMatches, ...contextualUndashedEinMatches].map(normalizeEin))
  );

  einMatches.slice(0, 3).forEach((ein) => {
    clues.push({
      label: "EIN clue",
      value: `This paper references EIN ${ein}.`,
      confidence: "medium",
    });
  });

  if (/\bidaho\b/.test(haystack)) {
    clues.push({
      label: "State clue",
      value: "This paper mentions Idaho.",
      confidence: "medium",
    });
  }

  return clues;
}

function summarizeSpreadsheetPurpose(document: TinaStoredDocument): string {
  switch (document.requestId) {
    case "quickbooks":
      return "This looks like the money report Tina can use to start the numbers side of your taxes.";
    case "bank-support":
      return "This looks like a bank or card export Tina can use to check money moving in and out.";
    case "payroll":
      return "This looks like payroll support Tina can use to check wages and payroll costs.";
    case "contractors":
      return "This looks like contractor support Tina can use to check vendor payments and 1099 work.";
    case "inventory":
      return "This looks like inventory support Tina can use to understand what was left at year end.";
    case "sales-tax":
      return "This looks like sales tax support Tina can use to check what was collected and paid.";
    default:
      return "This looks like a spreadsheet Tina can use as a structured source paper.";
  }
}

export async function analyzeTinaSpreadsheetSignals(
  document: TinaStoredDocument,
  file: File,
  chosenSheet: string
): Promise<TinaSpreadsheetSignals> {
  const parsedRows = await parseImportRows(file, chosenSheet);
  const stats = buildColumnStats(parsedRows.rows, parsedRows.headers);
  const dateHeader = pickDateHeader(stats);
  const amountHeaders = pickAmountHeaders(stats);
  const dateSnapshot = buildDateSnapshot(parsedRows.rows, dateHeader);
  const amountSnapshot = buildAmountSnapshot(parsedRows.rows, amountHeaders);
  const textHeaders = pickTextHeaders(stats);
  const keywordClues = detectKeywordClues(parsedRows.rows, textHeaders);
  const transactionAnchorClues = buildTransactionAnchorClues(parsedRows.rows, textHeaders);
  const ledgerBucketClues = buildLedgerBucketClues(parsedRows.rows, textHeaders, amountHeaders);
  const transactionGroupClues = buildTransactionGroupClues(
    parsedRows.rows,
    textHeaders,
    amountHeaders,
    dateHeader
  );
  const transactionLineageClues = buildTransactionLineageClues(
    parsedRows.rows,
    textHeaders,
    amountHeaders,
    dateHeader
  );

  const facts: TinaDocumentReadingFact[] = [];
  const detailLines: string[] = [];

  if (dateSnapshot) {
    facts.push({
      id: "date-range-clue",
      label: "Date range clue",
      value: `${formatFactDate(dateSnapshot.start)} through ${formatFactDate(dateSnapshot.end)}`,
      confidence: "high",
    });
    detailLines.push(
      `Tina found dates from ${formatShortDate(dateSnapshot.start)} through ${formatShortDate(dateSnapshot.end)}.`
    );
  }

  if (amountSnapshot.moneyInTotal !== null && amountSnapshot.moneyInTotal > 0) {
    facts.push({
      id: "money-in-clue",
      label: "Money in clue",
      value: formatMoney(amountSnapshot.moneyInTotal),
      confidence: "medium",
    });
  }

  if (amountSnapshot.moneyOutTotal !== null && amountSnapshot.moneyOutTotal > 0) {
    facts.push({
      id: "money-out-clue",
      label: "Money out clue",
      value: formatMoney(amountSnapshot.moneyOutTotal),
      confidence: "medium",
    });
  }

  if (amountSnapshot.moneyInTotal !== null || amountSnapshot.moneyOutTotal !== null) {
    const moneyParts: string[] = [];
    if (amountSnapshot.moneyInTotal !== null && amountSnapshot.moneyInTotal > 0) {
      moneyParts.push(`${formatMoney(amountSnapshot.moneyInTotal)} coming in`);
    }
    if (amountSnapshot.moneyOutTotal !== null && amountSnapshot.moneyOutTotal > 0) {
      moneyParts.push(`${formatMoney(amountSnapshot.moneyOutTotal)} going out`);
    }

    if (moneyParts.length > 0) {
      detailLines.push(`Tina sees about ${moneyParts.join(" and ")} in this file.`);
    }
  }

  keywordClues.forEach((clue) => {
    facts.push({
      id: clue.label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      label: clue.label,
      value: clue.value,
      confidence: clue.confidence,
    });
    detailLines.push(clue.value);
  });

  transactionAnchorClues.forEach((clue, index) => {
    facts.push({
      id: `${clue.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${index + 1}`,
      label: clue.label,
      value: clue.value,
      confidence: clue.confidence,
    });
  });

  ledgerBucketClues.forEach((clue, index) => {
    facts.push({
      id: `ledger-bucket-clue-${index + 1}`,
      label: clue.label,
      value: clue.value,
      confidence: clue.confidence,
    });
  });

  transactionGroupClues.forEach((clue, index) => {
    facts.push({
      id: `transaction-group-clue-${index + 1}`,
      label: clue.label,
      value: clue.value,
      confidence: clue.confidence,
    });
  });

  transactionLineageClues.forEach((clue, index) => {
    facts.push({
      id: `transaction-lineage-clue-${index + 1}`,
      label: clue.label,
      value: clue.value,
      confidence: clue.confidence,
    });
  });

  if (transactionAnchorClues.length > 0) {
    const sampleSummary = transactionAnchorClues
      .filter((clue) => clue.label === "Transaction sample clue")
      .map((clue) => clue.value)
      .slice(0, 2);

    if (sampleSummary.length > 0) {
      detailLines.push(`Tina found transaction-style anchors like ${sampleSummary.join(" and ")}.`);
    }
  }

  if (ledgerBucketClues.length > 0) {
    detailLines.push(
      `Tina grouped rows into ledger buckets like ${ledgerBucketClues
        .map((clue) => clue.value)
        .slice(0, 2)
        .join(" and ")}.`
    );
  }

  if (transactionGroupClues.length > 0) {
    detailLines.push(
      `Tina grouped transaction flows like ${transactionGroupClues
        .map((clue) => clue.value)
        .slice(0, 2)
        .join(" and ")}.`
    );
  }

  if (transactionLineageClues.length > 0) {
    detailLines.push(
      `Tina traced row clusters like ${transactionLineageClues
        .map((clue) => clue.value)
        .slice(0, 2)
        .join(" and ")}.`
    );
  }

  let summary = summarizeSpreadsheetPurpose(document);
  if (dateSnapshot && (amountSnapshot.moneyInTotal !== null || amountSnapshot.moneyOutTotal !== null)) {
    summary += " Tina found dates and a first money picture she can compare with your other papers.";
  } else if (dateSnapshot) {
    summary += " Tina found a useful date range she can line up with your tax year.";
  } else if (amountSnapshot.moneyInTotal !== null || amountSnapshot.moneyOutTotal !== null) {
    summary += " Tina found a first money picture she can compare with your other papers.";
  }

  const nextStep =
    amountSnapshot.moneyInTotal !== null ||
    amountSnapshot.moneyOutTotal !== null ||
    dateSnapshot !== null
      ? "Tina can compare this money picture with your other papers next."
      : "Tina can use this structured paper in the next extraction step and compare it against your other records.";

  return {
    facts,
    detailLines,
    summary,
    nextStep,
  };
}
