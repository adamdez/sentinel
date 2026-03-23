import Papa from "papaparse";
import * as XLSX from "xlsx";

type JsonLike = string | number | boolean | null | JsonLike[] | { [key: string]: JsonLike | undefined };

export type ImportFileKind = "csv" | "xlsx";

export type ImportTargetField =
  | "owner_name"
  | "co_owner_name"
  | "property_address"
  | "property_city"
  | "property_state"
  | "property_zip"
  | "mailing_address"
  | "mailing_city"
  | "mailing_state"
  | "mailing_zip"
  | "apn"
  | "county"
  | "phone"
  | "phone2"
  | "email"
  | "notes"
  | "source_vendor"
  | "source_list_name"
  | "distress_text"
  | "inherited_flag"
  | "probate_flag"
  | "tax_delinquent_flag"
  | "absentee_owner_flag"
  | "tired_landlord_flag"
  | "vacant_flag"
  | "code_issue_flag"
  | "rural_flag"
  | "mobile_home_flag"
  | "possible_developer_flag"
  | "out_of_area_flag"
  | "do_not_call_flag"
  | "bad_data_flag";

export interface ParsedSheetPreview {
  name: string;
  rowCount: number;
  headerRowIndex: number;
  headers: string[];
  sampleRows: Record<string, string>[];
}

export interface ParsedWorkbookPreview {
  kind: ImportFileKind;
  fileName: string;
  sheetNames: string[];
  chosenSheet: string;
  sheets: ParsedSheetPreview[];
}

export interface ParsedImportRows {
  kind: ImportFileKind;
  fileName: string;
  sheetName: string;
  headerRowIndex: number;
  headers: string[];
  rows: Record<string, string>[];
}

export interface MappingSuggestion {
  field: ImportTargetField;
  label: string;
  group: string;
  header: string | null;
  confidence: number;
  confidenceLabel: "high" | "medium" | "low";
  reason: string;
  sampleValues: string[];
}

export interface FieldMappingResult {
  suggestions: MappingSuggestion[];
  mapped: Partial<Record<ImportTargetField, string>>;
  unmappedHeaders: string[];
  lowConfidenceFields: ImportTargetField[];
}

export interface ImportTemplateRecord {
  id: string;
  name: string;
  vendorKey: string | null;
  sheetName: string | null;
  headerSignature: string;
  mapping: Partial<Record<ImportTargetField, string>>;
  defaults: Record<string, JsonLike>;
  createdAt: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface NormalizationDefaults {
  sourceChannel: string;
  sourceVendor: string;
  sourceListName: string;
  sourcePullDate: string;
  county: string;
  nicheTag: string;
  importBatchId: string;
  outreachType: string;
  skipTraceStatus: string;
  templateName: string;
  templateId: string;
}

export interface DuplicateCandidate {
  level: "none" | "high" | "possible";
  reasons: string[];
  propertyId?: string | null;
  leadId?: string | null;
}

export interface NormalizedImportRecord {
  rowNumber: number;
  ownerName: string | null;
  coOwnerName: string | null;
  propertyAddress: string | null;
  propertyCity: string | null;
  propertyState: string | null;
  propertyZip: string | null;
  mailingAddress: string | null;
  mailingCity: string | null;
  mailingState: string | null;
  mailingZip: string | null;
  apn: string | null;
  county: string | null;
  phone: string | null;
  phone2: string | null;
  email: string | null;
  notes: string | null;
  sourceVendor: string | null;
  sourceListName: string | null;
  distressTags: string[];
  reviewStatus: string;
  warnings: string[];
  rawRowPayload: Record<string, string>;
  unmappedColumns: Record<string, string>;
  mappingWarnings: string[];
  duplicate: DuplicateCandidate;
}

type FieldDefinition = {
  field: ImportTargetField;
  label: string;
  group: string;
  aliases: string[];
};

const FIELD_DEFINITIONS: FieldDefinition[] = [
  { field: "owner_name", label: "Owner Name", group: "Identity", aliases: ["owner name", "owner", "owner full name", "taxpayer", "name"] },
  { field: "co_owner_name", label: "Co-Owner Name", group: "Identity", aliases: ["co owner", "co-owner", "secondary owner", "spouse", "owner 2"] },
  { field: "property_address", label: "Property Address", group: "Property", aliases: ["property address", "site address", "property street", "address", "street address", "property address line 1"] },
  { field: "property_city", label: "Property City", group: "Property", aliases: ["property city", "site city", "city"] },
  { field: "property_state", label: "Property State", group: "Property", aliases: ["property state", "state", "st"] },
  { field: "property_zip", label: "Property Zip", group: "Property", aliases: ["property zip", "zip", "zip code", "postal code"] },
  { field: "mailing_address", label: "Mailing Address", group: "Mailing", aliases: ["mailing address", "owner address", "tax mailing address", "mail address"] },
  { field: "mailing_city", label: "Mailing City", group: "Mailing", aliases: ["mailing city", "owner city", "mail city"] },
  { field: "mailing_state", label: "Mailing State", group: "Mailing", aliases: ["mailing state", "owner state", "mail state"] },
  { field: "mailing_zip", label: "Mailing Zip", group: "Mailing", aliases: ["mailing zip", "owner zip", "mail zip"] },
  { field: "apn", label: "APN / Parcel", group: "Property", aliases: ["apn", "parcel", "parcel id", "parcel number", "tax id", "pin"] },
  { field: "county", label: "County", group: "Property", aliases: ["county", "county name", "market"] },
  { field: "phone", label: "Primary Phone", group: "Contact", aliases: ["phone", "owner phone", "contact phone", "mobile", "cell", "phone 1"] },
  { field: "phone2", label: "Secondary Phone", group: "Contact", aliases: ["phone 2", "secondary phone", "other phone", "alternate phone"] },
  { field: "email", label: "Email", group: "Contact", aliases: ["email", "email address", "owner email", "contact email"] },
  { field: "notes", label: "Notes", group: "Context", aliases: ["notes", "comments", "remarks", "description", "situation"] },
  { field: "source_vendor", label: "Source Vendor", group: "Source", aliases: ["vendor", "source vendor", "provider", "source company"] },
  { field: "source_list_name", label: "List Name", group: "Source", aliases: ["list name", "campaign", "list", "audience"] },
  { field: "distress_text", label: "Distress / List Type", group: "Context", aliases: ["distress", "distress type", "list type", "category", "tags"] },
  { field: "inherited_flag", label: "Inherited Flag", group: "Tags", aliases: ["inherited", "inherited flag"] },
  { field: "probate_flag", label: "Probate Flag", group: "Tags", aliases: ["probate", "probate flag"] },
  { field: "tax_delinquent_flag", label: "Tax Delinquent Flag", group: "Tags", aliases: ["tax delinquent", "tax default", "tax lien", "delinquent"] },
  { field: "absentee_owner_flag", label: "Absentee Owner Flag", group: "Tags", aliases: ["absentee", "absentee owner", "non owner occupied"] },
  { field: "tired_landlord_flag", label: "Tired Landlord Flag", group: "Tags", aliases: ["tired landlord", "landlord"] },
  { field: "vacant_flag", label: "Vacant Flag", group: "Tags", aliases: ["vacant", "site vacant"] },
  { field: "code_issue_flag", label: "Code Issue Flag", group: "Tags", aliases: ["code issue", "code violation", "violation"] },
  { field: "rural_flag", label: "Rural Flag", group: "Tags", aliases: ["rural"] },
  { field: "mobile_home_flag", label: "Mobile Home Flag", group: "Tags", aliases: ["mobile home", "manufactured"] },
  { field: "possible_developer_flag", label: "Possible Developer Flag", group: "Tags", aliases: ["developer", "development", "subdivide"] },
  { field: "out_of_area_flag", label: "Out Of Area Flag", group: "Tags", aliases: ["out of area", "out-of-area"] },
  { field: "do_not_call_flag", label: "Do Not Call Flag", group: "Tags", aliases: ["do not call", "dnc"] },
  { field: "bad_data_flag", label: "Bad Data Flag", group: "Tags", aliases: ["bad data", "bad record", "invalid data"] },
];

const YES_VALUES = new Set(["1", "true", "yes", "y", "x", "checked"]);
const TWO_LETTER_STATE = /^[A-Z]{2}$/;
const ZIP_PATTERN = /^\d{5}(?:-\d{4})?$/;

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCell(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function scoreAliasMatch(header: string, alias: string): number {
  if (header === alias) return 1;
  if (header.startsWith(alias) || alias.startsWith(header)) return 0.9;
  if (header.includes(alias) || alias.includes(header)) return 0.84;
  const headerTokens = new Set(header.split(" "));
  const aliasTokens = alias.split(" ");
  const overlap = aliasTokens.filter((token) => headerTokens.has(token)).length;
  if (overlap === aliasTokens.length && overlap > 0) return 0.78;
  if (overlap >= Math.max(1, aliasTokens.length - 1)) return 0.64;
  return 0;
}

function scoreSampleValue(field: ImportTargetField, samples: string[]): number {
  const populated = samples.filter(Boolean).slice(0, 4);
  if (populated.length === 0) return 0;

  if (field === "email" && populated.some((value) => value.includes("@"))) return 0.08;
  if ((field === "phone" || field === "phone2") && populated.some((value) => value.replace(/\D/g, "").length >= 10)) return 0.08;
  if ((field === "property_zip" || field === "mailing_zip") && populated.some((value) => ZIP_PATTERN.test(value))) return 0.08;
  if ((field === "property_state" || field === "mailing_state") && populated.some((value) => TWO_LETTER_STATE.test(value.toUpperCase()))) return 0.08;
  if ((field === "property_address" || field === "mailing_address") && populated.some((value) => /\d/.test(value) && /[A-Za-z]/.test(value))) return 0.08;
  if (field === "apn" && populated.some((value) => /[A-Za-z0-9]/.test(value) && value.length >= 5)) return 0.07;
  if (field === "notes" && populated.some((value) => value.length > 12)) return 0.06;
  return 0;
}

function confidenceLabel(score: number): "high" | "medium" | "low" {
  if (score >= 0.88) return "high";
  if (score >= 0.68) return "medium";
  return "low";
}

function parseDelimitedRows(text: string): string[][] {
  const parsed = Papa.parse<string[]>(text, {
    skipEmptyLines: false,
  });
  return (parsed.data as unknown as string[][]).map((row) => row.map((cell) => normalizeCell(cell)));
}

function parseXlsxSheets(buffer: ArrayBuffer): ParsedSheetPreview[] {
  const workbook = XLSX.read(buffer, { type: "array", dense: true });
  return workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
      header: 1,
      blankrows: false,
      defval: "",
    }) as Array<Array<string | number | boolean | null>>;
    return buildSheetPreview(sheetName, rows.map((row) => row.map((cell) => normalizeCell(cell))));
  });
}

function buildSheetPreview(name: string, rows: string[][]): ParsedSheetPreview {
  const nonEmptyRows = rows.filter((row) => row.some((cell) => normalizeCell(cell).length > 0));
  const headerRowIndex = detectHeaderRow(nonEmptyRows.slice(0, 12));
  const headerRow = nonEmptyRows[headerRowIndex] ?? [];
  const headers = headerRow.map((header, index) => {
    const trimmed = normalizeCell(header);
    return trimmed.length > 0 ? trimmed : `Column ${index + 1}`;
  });
  const sampleRows = nonEmptyRows
    .slice(headerRowIndex + 1, headerRowIndex + 6)
    .map((row) => rowToRecord(headers, row));
  return {
    name,
    rowCount: Math.max(0, nonEmptyRows.length - (headerRowIndex + 1)),
    headerRowIndex,
    headers,
    sampleRows,
  };
}

function rowToRecord(headers: string[], row: string[]): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((header, index) => {
    record[header] = normalizeCell(row[index]);
  });
  return record;
}

export function detectHeaderRow(rows: string[][]): number {
  let bestIndex = 0;
  let bestScore = -1;

  rows.forEach((row, index) => {
    const populated = row.filter((cell) => normalizeCell(cell).length > 0);
    if (populated.length === 0) return;

    let score = populated.length;
    const unique = new Set(populated.map((cell) => normalizeHeader(cell)));
    score += unique.size * 0.3;

    for (const cell of populated) {
      const normalized = normalizeHeader(cell);
      if (!normalized) continue;
      if (FIELD_DEFINITIONS.some((def) => def.aliases.some((alias) => scoreAliasMatch(normalized, alias) >= 0.84))) {
        score += 4;
      }
      if (/[A-Za-z]/.test(cell) && !/^\d+$/.test(cell)) {
        score += 0.4;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex;
}

export async function parseImportWorkbook(file: File): Promise<ParsedWorkbookPreview> {
  const lowerName = file.name.toLowerCase();
  const isXlsx = lowerName.endsWith(".xlsx");
  const kind: ImportFileKind = isXlsx ? "xlsx" : "csv";

  let sheets: ParsedSheetPreview[];
  if (isXlsx) {
    sheets = parseXlsxSheets(await file.arrayBuffer());
  } else {
    sheets = [buildSheetPreview("Sheet1", parseDelimitedRows(await file.text()))];
  }

  const chosenSheet = sheets
    .slice()
    .sort((a, b) => b.rowCount - a.rowCount)[0]?.name ?? sheets[0]?.name ?? "Sheet1";

  return {
    kind,
    fileName: file.name,
    sheetNames: sheets.map((sheet) => sheet.name),
    chosenSheet,
    sheets,
  };
}

function buildRowsFromMatrix(headers: string[], matrix: string[][], headerRowIndex: number): Record<string, string>[] {
  return matrix
    .slice(headerRowIndex + 1)
    .filter((row) => row.some((cell) => normalizeCell(cell).length > 0))
    .map((row) => rowToRecord(headers, row));
}

export async function parseImportRows(file: File, sheetName?: string | null): Promise<ParsedImportRows> {
  const lowerName = file.name.toLowerCase();
  const isXlsx = lowerName.endsWith(".xlsx");
  const kind: ImportFileKind = isXlsx ? "xlsx" : "csv";

  if (isXlsx) {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", dense: true });
    const chosen = sheetName && workbook.SheetNames.includes(sheetName) ? sheetName : workbook.SheetNames[0];
    const sheet = workbook.Sheets[chosen];
    const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
      header: 1,
      blankrows: false,
      defval: "",
    }) as Array<Array<string | number | boolean | null>>;
    const rows = matrix.map((row) => row.map((cell) => normalizeCell(cell)));
    const nonEmptyRows = rows.filter((row) => row.some((cell) => cell.length > 0));
    const headerRowIndex = detectHeaderRow(nonEmptyRows.slice(0, 12));
    const headerRow = nonEmptyRows[headerRowIndex] ?? [];
    const headers = headerRow.map((header, index) => normalizeCell(header) || `Column ${index + 1}`);
    return {
      kind,
      fileName: file.name,
      sheetName: chosen,
      headerRowIndex,
      headers,
      rows: buildRowsFromMatrix(headers, nonEmptyRows, headerRowIndex),
    };
  }

  const matrix = parseDelimitedRows(await file.text());
  const nonEmptyRows = matrix.filter((row) => row.some((cell) => cell.length > 0));
  const headerRowIndex = detectHeaderRow(nonEmptyRows.slice(0, 12));
  const headerRow = nonEmptyRows[headerRowIndex] ?? [];
  const headers = headerRow.map((header, index) => normalizeCell(header) || `Column ${index + 1}`);
  return {
    kind,
    fileName: file.name,
    sheetName: sheetName ?? "Sheet1",
    headerRowIndex,
    headers,
    rows: buildRowsFromMatrix(headers, nonEmptyRows, headerRowIndex),
  };
}

export function inferFieldMappings(headers: string[], sampleRows: Record<string, string>[]): FieldMappingResult {
  const mapped: Partial<Record<ImportTargetField, string>> = {};
  const suggestions: MappingSuggestion[] = [];
  const usedHeaders = new Set<string>();

  const sampleLookup = new Map<string, string[]>();
  headers.forEach((header) => {
    sampleLookup.set(
      header,
      sampleRows
        .map((row) => normalizeCell(row[header]))
        .filter(Boolean)
        .slice(0, 3),
    );
  });

  const candidates: Array<{ field: ImportTargetField; header: string; score: number; reason: string }> = [];
  for (const definition of FIELD_DEFINITIONS) {
    for (const header of headers) {
      const normalized = normalizeHeader(header);
      let bestAliasScore = 0;
      let bestAlias = "";
      for (const alias of definition.aliases) {
        const aliasScore = scoreAliasMatch(normalized, alias);
        if (aliasScore > bestAliasScore) {
          bestAliasScore = aliasScore;
          bestAlias = alias;
        }
      }
      if (bestAliasScore < 0.45) continue;
      const score = Math.min(1, bestAliasScore + scoreSampleValue(definition.field, sampleLookup.get(header) ?? []));
      candidates.push({
        field: definition.field,
        header,
        score,
        reason: bestAliasScore >= 0.9 ? `Matched "${bestAlias}" closely` : `Looks similar to "${bestAlias}"`,
      });
    }
  }

  candidates
    .sort((a, b) => b.score - a.score)
    .forEach((candidate) => {
      if (mapped[candidate.field] || usedHeaders.has(candidate.header)) return;
      mapped[candidate.field] = candidate.header;
      usedHeaders.add(candidate.header);
    });

  for (const definition of FIELD_DEFINITIONS) {
    const header = mapped[definition.field] ?? null;
    const candidate = header
      ? candidates.find((item) => item.field === definition.field && item.header === header)
      : null;
    const confidence = candidate?.score ?? 0;
    suggestions.push({
      field: definition.field,
      label: definition.label,
      group: definition.group,
      header,
      confidence,
      confidenceLabel: confidenceLabel(confidence),
      reason: candidate?.reason ?? "No confident match found",
      sampleValues: header ? (sampleLookup.get(header) ?? []) : [],
    });
  }

  return {
    suggestions,
    mapped,
    unmappedHeaders: headers.filter((header) => !usedHeaders.has(header)),
    lowConfidenceFields: suggestions
      .filter((suggestion) => suggestion.header && suggestion.confidence < 0.78)
      .map((suggestion) => suggestion.field),
  };
}

function coerceBoolean(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return YES_VALUES.has(normalized);
}

function cleanPhone(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits.slice(-10);
}

function cleanEmail(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.includes("@") ? trimmed : null;
}

function cleanString(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeCountyValue(value: string | null): string | null {
  if (!value) return null;
  return value.trim().toLowerCase().replace(/\s+county$/i, "");
}

function tagIf(condition: boolean, tag: string, tags: Set<string>) {
  if (condition) tags.add(tag);
}

const DISTRESS_TEXT_RULES: Array<{ pattern: RegExp; tag: string }> = [
  { pattern: /\bprobate\b/i, tag: "probate" },
  { pattern: /\binherit/i, tag: "inherited" },
  { pattern: /\btax\b|\bdelinq/i, tag: "tax_delinquent" },
  { pattern: /\babsentee\b/i, tag: "absentee_owner" },
  { pattern: /\btired landlord\b|\blandlord\b/i, tag: "tired_landlord" },
  { pattern: /\bvacant\b/i, tag: "vacant" },
  { pattern: /\bcode\b|\bviolation\b/i, tag: "code_issue" },
  { pattern: /\brural\b/i, tag: "rural" },
  { pattern: /\bmobile\b|\bmanufactured\b/i, tag: "mobile_home" },
  { pattern: /\bdeveloper\b|\bsubdivide\b/i, tag: "possible_developer" },
  { pattern: /\bout.?of.?area\b/i, tag: "out_of_area" },
  { pattern: /\bdo not call\b|\bdnc\b/i, tag: "do_not_call" },
  { pattern: /\bbad data\b|\bbad record\b/i, tag: "bad_data" },
];

export function buildTemplateSignature(headers: string[], sheetName?: string | null): string {
  const normalizedHeaders = headers
    .map((header) => normalizeHeader(header))
    .filter(Boolean)
    .sort();
  return `${normalizeHeader(sheetName ?? "")}::${normalizedHeaders.join("|")}`;
}

export function scoreTemplateMatch(
  headers: string[],
  sheetName: string,
  template: Pick<ImportTemplateRecord, "headerSignature" | "sheetName">
): number {
  const [templateSheet, templateHeadersRaw] = template.headerSignature.split("::");
  const templateHeaders = new Set((templateHeadersRaw ?? "").split("|").filter(Boolean));
  const incomingHeaders = new Set(headers.map((header) => normalizeHeader(header)).filter(Boolean));
  const overlap = [...incomingHeaders].filter((header) => templateHeaders.has(header)).length;
  const union = new Set([...incomingHeaders, ...templateHeaders]).size || 1;
  const headerScore = overlap / union;
  const sheetScore = templateSheet && templateSheet === normalizeHeader(template.sheetName ?? sheetName) ? 0.1 : 0;
  return Math.min(1, headerScore + sheetScore);
}

export function normalizeImportedRow(args: {
  row: Record<string, string>;
  rowNumber: number;
  mapping: Partial<Record<ImportTargetField, string>>;
  defaults: NormalizationDefaults;
  duplicate?: DuplicateCandidate;
  lowConfidenceFields?: ImportTargetField[];
}): NormalizedImportRecord {
  const { row, rowNumber, mapping, defaults, duplicate, lowConfidenceFields = [] } = args;
  const pick = (field: ImportTargetField) => cleanString(mapping[field] ? row[mapping[field] as string] ?? null : null);

  const distressText = pick("distress_text");
  const tags = new Set<string>();

  tagIf(coerceBoolean(pick("inherited_flag")), "inherited", tags);
  tagIf(coerceBoolean(pick("probate_flag")), "probate", tags);
  tagIf(coerceBoolean(pick("tax_delinquent_flag")), "tax_delinquent", tags);
  tagIf(coerceBoolean(pick("absentee_owner_flag")), "absentee_owner", tags);
  tagIf(coerceBoolean(pick("tired_landlord_flag")), "tired_landlord", tags);
  tagIf(coerceBoolean(pick("vacant_flag")), "vacant", tags);
  tagIf(coerceBoolean(pick("code_issue_flag")), "code_issue", tags);
  tagIf(coerceBoolean(pick("rural_flag")), "rural", tags);
  tagIf(coerceBoolean(pick("mobile_home_flag")), "mobile_home", tags);
  tagIf(coerceBoolean(pick("possible_developer_flag")), "possible_developer", tags);
  tagIf(coerceBoolean(pick("out_of_area_flag")), "out_of_area", tags);
  tagIf(coerceBoolean(pick("do_not_call_flag")), "do_not_call", tags);
  tagIf(coerceBoolean(pick("bad_data_flag")), "bad_data", tags);

  if (defaults.nicheTag) {
    tags.add(defaults.nicheTag);
  }

  if (distressText) {
    DISTRESS_TEXT_RULES.forEach((rule) => {
      if (rule.pattern.test(distressText)) tags.add(rule.tag);
    });
  }

  const ownerName = pick("owner_name");
  const propertyAddress = pick("property_address");
  const propertyCity = pick("property_city");
  const propertyState = pick("property_state")?.toUpperCase() ?? null;
  const propertyZip = pick("property_zip");
  const county = normalizeCountyValue(pick("county") ?? defaults.county ?? null);
  const phone = cleanPhone(pick("phone"));
  const phone2 = cleanPhone(pick("phone2"));
  const email = cleanEmail(pick("email"));
  const warnings: string[] = [];
  const mappingWarnings: string[] = [];

  if (!propertyAddress) warnings.push("Missing property address");
  if (!county) warnings.push("Missing county");
  if (!ownerName) warnings.push("Missing owner name");
  if (!phone) warnings.push("Missing phone");
  if (!pick("apn")) warnings.push("Missing APN");

  lowConfidenceFields.forEach((field) => {
    if (mapping[field]) {
      const label = FIELD_DEFINITIONS.find((definition) => definition.field === field)?.label ?? field;
      mappingWarnings.push(`${label} mapping needs review`);
    }
  });

  const duplicateLevel = duplicate?.level ?? "none";
  const doNotCall = tags.has("do_not_call");
  const badData = tags.has("bad_data");
  const outOfArea = tags.has("out_of_area");

  let reviewStatus = "new_import";
  if (!propertyAddress) reviewStatus = "missing_property_address";
  else if (duplicateLevel === "possible") reviewStatus = "possible_duplicate";
  else if (duplicateLevel === "high") reviewStatus = "needs_review";
  else if (doNotCall) reviewStatus = "do_not_call";
  else if (badData || outOfArea) reviewStatus = "junk";
  else if (!phone) reviewStatus = "missing_phone";
  else if (mappingWarnings.length > 0 || warnings.length > 1) reviewStatus = "needs_review";
  else reviewStatus = "ready_to_call";

  const unmappedColumns: Record<string, string> = {};
  Object.entries(row).forEach(([header, value]) => {
    if (!Object.values(mapping).includes(header) && normalizeCell(value).length > 0) {
      unmappedColumns[header] = value;
    }
  });

  return {
    rowNumber,
    ownerName,
    coOwnerName: pick("co_owner_name"),
    propertyAddress,
    propertyCity,
    propertyState,
    propertyZip,
    mailingAddress: pick("mailing_address"),
    mailingCity: pick("mailing_city"),
    mailingState: pick("mailing_state")?.toUpperCase() ?? null,
    mailingZip: pick("mailing_zip"),
    apn: pick("apn"),
    county,
    phone,
    phone2,
    email,
    notes: pick("notes"),
    sourceVendor: pick("source_vendor") ?? cleanString(defaults.sourceVendor),
    sourceListName: pick("source_list_name") ?? cleanString(defaults.sourceListName),
    distressTags: [...tags],
    reviewStatus,
    warnings,
    rawRowPayload: row,
    unmappedColumns,
    mappingWarnings,
    duplicate: duplicate ?? { level: "none", reasons: [] },
  };
}

export function buildProspectPayload(record: NormalizedImportRecord, defaults: NormalizationDefaults) {
  const mergedNotes = [record.notes, `Imported via ${defaults.importBatchId || "batch import"}`]
    .filter(Boolean)
    .join("\n\n");

  return {
    owner_name: record.ownerName ?? "",
    address: record.propertyAddress ?? "",
    city: record.propertyCity ?? "",
    state: record.propertyState ?? "WA",
    zip: record.propertyZip ?? "",
    apn: record.apn ?? "",
    county: record.county ?? defaults.county,
    owner_phone: record.phone,
    owner_email: record.email,
    notes: mergedNotes,
    distress_tags: record.distressTags,
    source: defaults.sourceChannel,
    source_channel: defaults.sourceChannel,
    source_vendor: record.sourceVendor ?? defaults.sourceVendor,
    source_list_name: record.sourceListName ?? defaults.sourceListName,
    source_pull_date: defaults.sourcePullDate || null,
    niche_tag: defaults.nicheTag || null,
    import_batch_id: defaults.importBatchId || null,
    outreach_type: defaults.outreachType || "cold_call",
    skip_trace_status: defaults.skipTraceStatus || "not_started",
    outbound_status: record.reviewStatus,
    mailing_address: record.mailingAddress,
    mailing_city: record.mailingCity,
    mailing_state: record.mailingState,
    mailing_zip: record.mailingZip,
    co_owner_name: record.coOwnerName,
    // Bulk imports skip auto-Bricked to avoid cost/latency — Bricked fires when lead is opened
    skip_auto_bricked: true,
    source_metadata: {
      import_batch_id: defaults.importBatchId,
      template_id: defaults.templateId || null,
      file_row_number: record.rowNumber,
      raw_row_payload: record.rawRowPayload,
      unmapped_columns: record.unmappedColumns,
      warnings: [...record.warnings, ...record.mappingWarnings, ...record.duplicate.reasons],
      duplicate: record.duplicate,
    },
  };
}

export const IMPORT_FIELD_DEFINITIONS = FIELD_DEFINITIONS;
