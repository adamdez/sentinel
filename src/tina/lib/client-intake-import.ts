import { parseImportWorkbook } from "@/lib/import-normalization";
import { readTinaDocument } from "@/tina/lib/document-reading";
import type {
  TinaBusinessTaxProfile,
  TinaDocumentReading,
  TinaFilingLaneId,
  TinaStoredDocument,
} from "@/tina/types";

export type TinaClientIntakeRequestId =
  | "prior-return"
  | "profit-loss"
  | "balance-sheet"
  | "general-ledger"
  | "bank-support"
  | "credit-card-support"
  | "payroll"
  | "contractors"
  | "loan-support"
  | "unusual-items"
  | "assets"
  | "sales-tax"
  | "inventory"
  | "trial-balance"
  | "entity-docs"
  | "business-description"
  | "unclassified";

export type TinaClientIntakeConfidence = "high" | "medium" | "low";

export interface TinaClientIntakeRequestOption {
  id: TinaClientIntakeRequestId;
  label: string;
  category: TinaStoredDocument["category"];
  markAsPriorReturn?: boolean;
}

export interface TinaClientIntakePreview {
  fileName: string;
  headers: string[];
  sampleRows: Record<string, string>[];
  rowCount: number;
}

export interface TinaClientIntakeCandidate {
  fileName: string;
  requestId: TinaClientIntakeRequestId;
  requestLabel: string;
  category: TinaStoredDocument["category"];
  markAsPriorReturn: boolean;
  confidence: TinaClientIntakeConfidence;
  score: number;
  reasons: string[];
  approvalNeeded: boolean;
  laneHints: TinaFilingLaneId[];
  businessNameHint: string | null;
  taxYearHint: string | null;
}

export interface TinaClientIntakeBatchReview {
  candidates: TinaClientIntakeCandidate[];
  summary: string;
  nextStep: string;
  likelyLane: TinaFilingLaneId | "mixed" | "unknown";
  approvalCount: number;
  unsupportedLane: boolean;
}

export interface TinaImportedClientIntakeDocument {
  document: TinaStoredDocument;
  reading: TinaDocumentReading;
  candidate: TinaClientIntakeCandidate;
}

export interface TinaClientIntakeImportResult {
  imported: TinaImportedClientIntakeDocument[];
  profilePatch: Partial<TinaBusinessTaxProfile>;
  review: TinaClientIntakeBatchReview;
}

export const TINA_CLIENT_INTAKE_REQUEST_OPTIONS: TinaClientIntakeRequestOption[] = [
  { id: "prior-return", label: "Prior-year filed return", category: "prior_return", markAsPriorReturn: true },
  { id: "profit-loss", label: "Full-year profit and loss", category: "supporting_document" },
  { id: "balance-sheet", label: "Year-end balance sheet", category: "supporting_document" },
  { id: "general-ledger", label: "General ledger export", category: "supporting_document" },
  { id: "bank-support", label: "Business bank statements", category: "supporting_document" },
  { id: "credit-card-support", label: "Business credit card statements", category: "supporting_document" },
  { id: "payroll", label: "Payroll reports and W-2 support", category: "supporting_document" },
  { id: "contractors", label: "Contractor and 1099 support", category: "supporting_document" },
  { id: "loan-support", label: "Loan statements and debt support", category: "supporting_document" },
  { id: "unusual-items", label: "Notes about unusual items", category: "supporting_document" },
  { id: "assets", label: "Fixed asset and depreciation support", category: "supporting_document" },
  { id: "sales-tax", label: "Sales tax support", category: "supporting_document" },
  { id: "inventory", label: "Inventory support", category: "supporting_document" },
  { id: "trial-balance", label: "Trial balance", category: "supporting_document" },
  { id: "entity-docs", label: "Entity and ownership documents", category: "supporting_document" },
  { id: "business-description", label: "Business description", category: "supporting_document" },
  { id: "unclassified", label: "Needs human mapping", category: "supporting_document" },
];

const REQUEST_LABELS = new Map(TINA_CLIENT_INTAKE_REQUEST_OPTIONS.map((item) => [item.id, item.label]));
const MONTH_HEADERS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[_\-]+/g, " ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function getRequestOption(requestId: TinaClientIntakeRequestId): TinaClientIntakeRequestOption {
  return (
    TINA_CLIENT_INTAKE_REQUEST_OPTIONS.find((item) => item.id === requestId) ??
    TINA_CLIENT_INTAKE_REQUEST_OPTIONS[TINA_CLIENT_INTAKE_REQUEST_OPTIONS.length - 1]
  );
}

function textFromPreview(preview: TinaClientIntakePreview): string {
  const sampleValues = preview.sampleRows.flatMap((row) => Object.values(row).slice(0, 8));
  return normalize([preview.fileName, ...preview.headers, ...sampleValues].join(" "));
}

function sampleValue(preview: TinaClientIntakePreview, key: string): string | null {
  for (const row of preview.sampleRows) {
    const direct = row[key];
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    const fallbackKey = Object.keys(row).find((header) => normalize(header) === normalize(key));
    if (fallbackKey) {
      const fallback = row[fallbackKey];
      if (typeof fallback === "string" && fallback.trim()) return fallback.trim();
    }
  }
  return null;
}

function countMonthHeaders(headers: string[]): number {
  return headers.filter((header) => MONTH_HEADERS.includes(normalize(header))).length;
}

function inferLaneHints(preview: TinaClientIntakePreview): TinaFilingLaneId[] {
  const hints = new Set<TinaFilingLaneId>();
  const haystack = textFromPreview(preview);

  const formType = sampleValue(preview, "form_type");
  if (formType) {
    const normalizedForm = normalize(formType);
    if (normalizedForm.includes("1120 s") || normalizedForm.includes("1120s")) hints.add("1120_s");
    if (normalizedForm.includes("1065")) hints.add("1065");
    if (normalizedForm.includes("1040") || normalizedForm.includes("schedule c")) {
      hints.add("schedule_c_single_member_llc");
    }
  }

  if (haystack.includes("shareholder distributions") || haystack.includes("officer compensation")) {
    hints.add("1120_s");
  }

  if (haystack.includes("partnership") || haystack.includes("partner capital")) {
    hints.add("1065");
  }

  if (haystack.includes("schedule c") || haystack.includes("sole prop")) {
    hints.add("schedule_c_single_member_llc");
  }

  return Array.from(hints);
}

function pushScore(
  scores: Map<TinaClientIntakeRequestId, { score: number; reasons: string[] }>,
  requestId: TinaClientIntakeRequestId,
  points: number,
  reason: string
) {
  const current = scores.get(requestId) ?? { score: 0, reasons: [] };
  current.score += points;
  current.reasons.push(reason);
  scores.set(requestId, current);
}

export function inferTinaClientIntakeCandidate(preview: TinaClientIntakePreview): TinaClientIntakeCandidate {
  const scores = new Map<TinaClientIntakeRequestId, { score: number; reasons: string[] }>();
  const normalizedHeaders = preview.headers.map((header) => normalize(header));
  const headerSet = new Set(normalizedHeaders);
  const haystack = textFromPreview(preview);
  const monthHeaderCount = countMonthHeaders(preview.headers);

  if (haystack.includes("prior") && haystack.includes("return")) {
    pushScore(scores, "prior-return", 5, "Filename or sample text looks like a prior-year return.");
  }
  if (headerSet.has("form type") || headerSet.has("filing status")) {
    pushScore(scores, "prior-return", 5, "Columns look like a return summary extract.");
  }
  if (headerSet.has("gross receipts") || headerSet.has("shareholder distributions")) {
    pushScore(scores, "prior-return", 3, "Rows contain return-line style totals.");
  }

  if (haystack.includes("pnl") || (haystack.includes("profit") && haystack.includes("loss"))) {
    pushScore(scores, "profit-loss", 5, "Filename or sample text looks like a P&L.");
  }
  if (monthHeaderCount >= 6 && headerSet.has("annual total")) {
    pushScore(scores, "profit-loss", 5, "Columns look like a monthly P&L with annual totals.");
  }
  if (headerSet.has("account group") && headerSet.has("account name")) {
    pushScore(scores, "profit-loss", 3, "Rows are grouped like a financial statement.");
  }

  if (haystack.includes("balance sheet")) {
    pushScore(scores, "balance-sheet", 6, "Filename or sample text looks like a balance sheet.");
  }
  if (headerSet.has("as of date") && headerSet.has("section") && headerSet.has("amount")) {
    pushScore(scores, "balance-sheet", 5, "Columns match a year-end balance sheet extract.");
  }

  if (haystack.includes("general ledger") || haystack.includes("ledger export")) {
    pushScore(scores, "general-ledger", 6, "Filename looks like a general ledger export.");
  }
  if (
    headerSet.has("txn id") &&
    headerSet.has("txn date") &&
    headerSet.has("account") &&
    (headerSet.has("debit") || headerSet.has("credit") || headerSet.has("signed amount"))
  ) {
    pushScore(scores, "general-ledger", 8, "Columns match transaction-level ledger detail.");
  }

  if (haystack.includes("bank statement") || haystack.includes("operating checking")) {
    pushScore(scores, "bank-support", 5, "Filename or sample text looks like bank activity.");
  }
  if (headerSet.has("statement month") && headerSet.has("running balance") && headerSet.has("source doc")) {
    pushScore(scores, "bank-support", 3, "Columns match a statement extract.");
  }
  if (haystack.includes("credit card") || haystack.includes("visa") || haystack.includes("amex")) {
    pushScore(scores, "credit-card-support", 5, "Filename or sample text looks like business card activity.");
  }
  if (haystack.includes("charge") && headerSet.has("running balance")) {
    pushScore(scores, "credit-card-support", 3, "Rows look like card charges instead of bank debits.");
  }

  if (haystack.includes("payroll") || haystack.includes("w 2") || haystack.includes("1099")) {
    pushScore(scores, "payroll", 4, "Filename or sample text looks like payroll or contractor support.");
    pushScore(scores, "contractors", 3, "The packet mentions contractor or 1099 support.");
  }
  if (headerSet.has("worker type") && headerSet.has("gross pay") && headerSet.has("form expected")) {
    pushScore(scores, "payroll", 5, "Columns match payroll summary detail.");
    pushScore(scores, "contractors", 4, "Worker-type and form columns can support 1099 review too.");
  }

  if (haystack.includes("loan statement") || haystack.includes("amortization") || haystack.includes("equipment loan")) {
    pushScore(scores, "loan-support", 5, "Filename or sample text looks like debt support.");
  }
  if (headerSet.has("beginning balance") && headerSet.has("interest portion") && headerSet.has("principal portion")) {
    pushScore(scores, "loan-support", 6, "Columns match monthly loan statement detail.");
  }

  if (haystack.includes("unusual item") || haystack.includes("owner draws") || haystack.includes("expected cpa attention")) {
    pushScore(scores, "unusual-items", 6, "Filename or sample text looks like client notes.");
  }
  if (headerSet.has("note id") && headerSet.has("topic") && headerSet.has("note text")) {
    pushScore(scores, "unusual-items", 6, "Columns match a note register.");
  }

  if (haystack.includes("fixed asset") || haystack.includes("placed in service") || haystack.includes("depreciation schedule")) {
    pushScore(scores, "assets", 6, "Filename or sample text looks like asset support.");
  }
  if (headerSet.has("asset name") && headerSet.has("placed in service")) {
    pushScore(scores, "assets", 6, "Columns match a fixed asset schedule.");
  }

  if (haystack.includes("sales tax")) {
    pushScore(scores, "sales-tax", 6, "Filename or sample text looks like sales tax support.");
  }

  if (haystack.includes("inventory") || haystack.includes("ending inventory")) {
    pushScore(scores, "inventory", 6, "Filename or sample text looks like inventory support.");
  }

  if (haystack.includes("trial balance") || (headerSet.has("account") && headerSet.has("ending balance") && headerSet.has("section"))) {
    pushScore(scores, "trial-balance", 4, "Filename or columns could be a trial balance.");
  }

  if (haystack.includes("entity") || haystack.includes("ownership") || haystack.includes("2553") || haystack.includes("ein letter")) {
    pushScore(scores, "entity-docs", 5, "Filename or sample text looks like entity support.");
  }

  if (haystack.includes("naics") || haystack.includes("business description")) {
    pushScore(scores, "business-description", 4, "Filename or sample text looks like a business description.");
  }

  const sorted = Array.from(scores.entries()).sort((left, right) => right[1].score - left[1].score);
  const [topRequestId, topDetails] = sorted[0] ?? ["unclassified", { score: 0, reasons: ["Tina could not confidently map this file yet."] }];
  const secondScore = sorted[1]?.[1].score ?? 0;
  const scoreGap = topDetails.score - secondScore;

  let confidence: TinaClientIntakeConfidence = "low";
  if (topDetails.score >= 8 && scoreGap >= 3) confidence = "high";
  else if (topDetails.score >= 5 && scoreGap >= 2) confidence = "medium";

  const option = getRequestOption(topRequestId);
  const laneHints = inferLaneHints(preview);
  const businessNameHint = sampleValue(preview, "entity_name");
  const taxYearHint = sampleValue(preview, "tax_year");

  return {
    fileName: preview.fileName,
    requestId: topRequestId,
    requestLabel: option.label,
    category: option.category,
    markAsPriorReturn: Boolean(option.markAsPriorReturn),
    confidence,
    score: topDetails.score,
    reasons: topDetails.reasons,
    approvalNeeded: confidence !== "high" || topRequestId === "unclassified",
    laneHints,
    businessNameHint,
    taxYearHint,
  };
}

export function buildTinaClientIntakeBatchReview(
  candidates: TinaClientIntakeCandidate[]
): TinaClientIntakeBatchReview {
  const approvalCount = candidates.filter((candidate) => candidate.approvalNeeded).length;
  const laneCounts = new Map<TinaFilingLaneId, number>();
  candidates.forEach((candidate) => {
    candidate.laneHints.forEach((lane) => laneCounts.set(lane, (laneCounts.get(lane) ?? 0) + 1));
  });

  const sortedLanes = Array.from(laneCounts.entries()).sort((left, right) => right[1] - left[1]);
  let likelyLane: TinaClientIntakeBatchReview["likelyLane"] = "unknown";
  if (sortedLanes.length === 1) likelyLane = sortedLanes[0][0];
  if (sortedLanes.length > 1 && sortedLanes[0][1] === sortedLanes[1][1]) likelyLane = "mixed";
  if (sortedLanes.length > 1 && sortedLanes[0][1] > sortedLanes[1][1]) likelyLane = sortedLanes[0][0];

  const unsupportedLane = likelyLane === "1120_s" || likelyLane === "1065";
  const highConfidenceCount = candidates.filter((candidate) => candidate.confidence === "high").length;

  let summary = `Tina mapped ${candidates.length} intake file${candidates.length === 1 ? "" : "s"}.`;
  let nextStep = "Approve the lower-confidence mappings and import the packet.";

  if (likelyLane === "1120_s") {
    summary = "This packet looks like an 1120-S / S-corp intake package.";
    nextStep =
      "Tina can organize and review the intake, but a human should confirm the lane because this branch is still Schedule C-first.";
  } else if (likelyLane === "1065") {
    summary = "This packet looks like a partnership / 1065 intake package.";
    nextStep =
      "Tina can organize the packet, but a human should confirm the lane before relying on Schedule C outputs.";
  } else if (likelyLane === "schedule_c_single_member_llc") {
    summary = "This packet looks like a Schedule C / single-member LLC intake package.";
    nextStep =
      approvalCount > 0
        ? "Approve the lower-confidence mappings, then import the packet into Tina."
        : "Import the packet and let Tina read the files into the current workspace.";
  }

  if (highConfidenceCount === candidates.length && likelyLane === "unknown") {
    nextStep = "Import the packet and let Tina derive more facts from the contents.";
  }

  return {
    candidates,
    summary,
    nextStep,
    likelyLane,
    approvalCount,
    unsupportedLane,
  };
}

export function buildTinaClientIntakeProfilePatch(
  candidates: TinaClientIntakeCandidate[]
): Partial<TinaBusinessTaxProfile> {
  const patch: Partial<TinaBusinessTaxProfile> = {};
  const likelyLane = buildTinaClientIntakeBatchReview(candidates).likelyLane;
  const businessNameHint = candidates.find((candidate) => candidate.businessNameHint)?.businessNameHint;
  const taxYearHint = candidates.find((candidate) => candidate.taxYearHint)?.taxYearHint;

  if (likelyLane === "1120_s") patch.entityType = "s_corp";
  if (likelyLane === "1065") patch.entityType = "partnership";
  if (likelyLane === "schedule_c_single_member_llc") patch.entityType = "single_member_llc";

  if (candidates.some((candidate) => candidate.requestId === "payroll")) patch.hasPayroll = true;
  if (candidates.some((candidate) => candidate.requestId === "contractors" || normalize(candidate.fileName).includes("1099"))) {
    patch.paysContractors = true;
  }
  if (candidates.some((candidate) => candidate.requestId === "assets")) patch.hasFixedAssets = true;
  if (candidates.some((candidate) => candidate.requestId === "sales-tax")) patch.collectsSalesTax = true;
  if (candidates.some((candidate) => candidate.requestId === "inventory")) patch.hasInventory = true;
  if (businessNameHint) patch.businessName = businessNameHint;
  if (taxYearHint) patch.taxYear = taxYearHint;

  return patch;
}

export async function analyzeTinaClientIntakeFiles(
  files: File[]
): Promise<TinaClientIntakeBatchReview> {
  const candidates: TinaClientIntakeCandidate[] = [];

  for (const file of files) {
    const workbook = await parseImportWorkbook(file);
    const chosenSheet =
      workbook.sheets.find((sheet) => sheet.name === workbook.chosenSheet) ?? workbook.sheets[0];

    candidates.push(
      inferTinaClientIntakeCandidate({
        fileName: file.name,
        headers: chosenSheet?.headers ?? [],
        sampleRows: chosenSheet?.sampleRows ?? [],
        rowCount: chosenSheet?.rowCount ?? 0,
      })
    );
  }

  return buildTinaClientIntakeBatchReview(candidates);
}

function inferMimeType(file: File): string {
  if (file.type) return file.type;
  const normalized = file.name.toLowerCase();
  if (normalized.endsWith(".csv")) return "text/csv";
  if (normalized.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (normalized.endsWith(".xls")) return "application/vnd.ms-excel";
  return "application/octet-stream";
}

function createImportedStoredDocument(file: File, candidate: TinaClientIntakeCandidate): TinaStoredDocument {
  const id = `intake-${crypto.randomUUID()}`;
  const uploadedAt = new Date().toISOString();

  return {
    id,
    name: file.name,
    size: file.size,
    mimeType: inferMimeType(file),
    storagePath: `local/tina-intake/${id}/${encodeURIComponent(file.name)}`,
    category: candidate.category,
    requestId: candidate.requestId === "unclassified" ? null : candidate.requestId,
    requestLabel: candidate.requestId === "unclassified" ? "Needs human mapping" : candidate.requestLabel,
    uploadedAt,
  };
}

export async function importTinaClientIntakeFiles(input: {
  files: File[];
  review: TinaClientIntakeBatchReview;
  overrides?: Partial<Record<string, TinaClientIntakeRequestId>>;
}): Promise<TinaClientIntakeImportResult> {
  const imported: TinaImportedClientIntakeDocument[] = [];
  const resolvedCandidates = input.review.candidates.map((candidate) => {
    const overrideRequestId = input.overrides?.[candidate.fileName];
    if (!overrideRequestId || overrideRequestId === candidate.requestId) return candidate;
    const option = getRequestOption(overrideRequestId);
    return {
      ...candidate,
      requestId: overrideRequestId,
      requestLabel: option.label,
      category: option.category,
      markAsPriorReturn: Boolean(option.markAsPriorReturn),
      approvalNeeded: false,
      reasons: [...candidate.reasons, `Human approved mapping to ${option.label}.`],
    };
  });

  for (const file of input.files) {
    const candidate = resolvedCandidates.find((item) => item.fileName === file.name);
    if (!candidate) continue;

    const document = createImportedStoredDocument(file, candidate);
    const reading = await readTinaDocument(document, file);
    imported.push({ document, reading, candidate });
  }

  return {
    imported,
    profilePatch: buildTinaClientIntakeProfilePatch(resolvedCandidates),
    review: buildTinaClientIntakeBatchReview(resolvedCandidates),
  };
}
