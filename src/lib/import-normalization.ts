import Papa from "papaparse";
import * as XLSX from "xlsx";

type JsonLike = string | number | boolean | null | JsonLike[] | { [key: string]: JsonLike | undefined };

export type ImportFileKind = "csv" | "xlsx";

export type ImportTargetField =
  | "owner_name"
  | "owner_first_name"
  | "owner_last_name"
  | "owner_middle_name"
  | "owner_suffix"
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
  | "phone3"
  | "phone4"
  | "phone5"
  | "phone6"
  | "phone7"
  | "phone8"
  | "phone9"
  | "phone10"
  | "email"
  | "email2"
  | "email3"
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
  | "bad_data_flag"
  | "lien_amount"
  | "amount_due"
  | "foreclosure_flag"
  | "pre_foreclosure_flag"
  | "list_type"
  | "estimated_value"
  | "property_type"
  | "bedrooms"
  | "bathrooms"
  | "sqft"
  | "year_built"
  // Legal / Probate
  | "document_type"
  | "case_number"
  | "file_date"
  | "date_of_death"
  // Deceased
  | "deceased_first_name"
  | "deceased_last_name"
  | "deceased_middle_name"
  // Survivor
  | "survivor_first_name"
  | "survivor_last_name"
  | "survivor_middle_name"
  | "survivor_address"
  | "survivor_city"
  | "survivor_state"
  | "survivor_zip"
  | "survivor_phone"
  | "survivor_email"
  // Petitioner / Personal Representative
  | "petitioner_first_name"
  | "petitioner_last_name"
  | "petitioner_middle_name"
  | "petitioner_address"
  | "petitioner_city"
  | "petitioner_state"
  | "petitioner_zip"
  | "petitioner_phone"
  | "petitioner_email"
  // Attorney
  | "attorney_first_name"
  | "attorney_last_name"
  | "attorney_middle_name"
  | "attorney_address"
  | "attorney_city"
  | "attorney_state"
  | "attorney_zip"
  | "attorney_phone"
  | "attorney_email"
  | "attorney_bar_number";

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
  ownerSuffix: string | null;
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
  phone3: string | null;
  phone4: string | null;
  phone5: string | null;
  phone6: string | null;
  phone7: string | null;
  phone8: string | null;
  phone9: string | null;
  phone10: string | null;
  email: string | null;
  email2: string | null;
  email3: string | null;
  notes: string | null;
  estimatedValue: string | null;
  propertyType: string | null;
  bedrooms: string | null;
  bathrooms: string | null;
  sqft: string | null;
  yearBuilt: string | null;
  lienAmount: string | null;
  sourceVendor: string | null;
  sourceListName: string | null;
  distressTags: string[];
  reviewStatus: string;
  warnings: string[];
  rawRowPayload: Record<string, string>;
  unmappedColumns: Record<string, string>;
  mappingWarnings: string[];
  duplicate: DuplicateCandidate;
  // Legal / Probate
  documentType: string | null;
  caseNumber: string | null;
  fileDate: string | null;
  dateOfDeath: string | null;
  // Deceased
  deceasedFirstName: string | null;
  deceasedLastName: string | null;
  deceasedMiddleName: string | null;
  // Survivor
  survivorFirstName: string | null;
  survivorLastName: string | null;
  survivorMiddleName: string | null;
  survivorAddress: string | null;
  survivorCity: string | null;
  survivorState: string | null;
  survivorZip: string | null;
  survivorPhone: string | null;
  survivorEmail: string | null;
  // Petitioner
  petitionerFirstName: string | null;
  petitionerLastName: string | null;
  petitionerMiddleName: string | null;
  petitionerAddress: string | null;
  petitionerCity: string | null;
  petitionerState: string | null;
  petitionerZip: string | null;
  petitionerPhone: string | null;
  petitionerEmail: string | null;
  // Attorney
  attorneyFirstName: string | null;
  attorneyLastName: string | null;
  attorneyMiddleName: string | null;
  attorneyAddress: string | null;
  attorneyCity: string | null;
  attorneyState: string | null;
  attorneyZip: string | null;
  attorneyPhone: string | null;
  attorneyEmail: string | null;
  attorneyBarNumber: string | null;
}

type FieldDefinition = {
  field: ImportTargetField;
  label: string;
  group: string;
  aliases: string[];
};

const FIELD_DEFINITIONS: FieldDefinition[] = [
  { field: "owner_name", label: "Owner Name", group: "Identity", aliases: ["owner name", "owner", "owner full name", "taxpayer", "name", "full name"] },
  { field: "owner_first_name", label: "Owner First Name", group: "Identity", aliases: ["owner first name", "first name", "first", "given name"] },
  { field: "owner_last_name", label: "Owner Last Name", group: "Identity", aliases: ["owner last name", "last name", "last", "surname", "family name"] },
  { field: "owner_middle_name", label: "Owner Middle Name", group: "Identity", aliases: ["owner middle name", "middle name", "middle", "middle initial"] },
  { field: "owner_suffix", label: "Owner Suffix", group: "Identity", aliases: ["suffix", "owner suffix", "name suffix"] },
  { field: "co_owner_name", label: "Co-Owner Name", group: "Identity", aliases: ["co owner", "co-owner", "secondary owner", "spouse", "owner 2"] },
  { field: "property_address", label: "Property Address", group: "Property", aliases: ["property address", "site address", "property street", "address", "street address", "property address line 1"] },
  { field: "property_city", label: "Property City", group: "Property", aliases: ["property city", "site city", "city"] },
  { field: "property_state", label: "Property State", group: "Property", aliases: ["property state", "state", "st"] },
  { field: "property_zip", label: "Property Zip", group: "Property", aliases: ["property zip", "property zipcode", "zip", "zip code", "postal code"] },
  { field: "mailing_address", label: "Mailing Address", group: "Mailing", aliases: ["mailing address", "owner address", "tax mailing address", "mail address"] },
  { field: "mailing_city", label: "Mailing City", group: "Mailing", aliases: ["mailing city", "owner city", "mail city"] },
  { field: "mailing_state", label: "Mailing State", group: "Mailing", aliases: ["mailing state", "owner state", "mail state"] },
  { field: "mailing_zip", label: "Mailing Zip", group: "Mailing", aliases: ["mailing zip", "owner zip", "mail zip"] },
  { field: "apn", label: "APN / Parcel", group: "Property", aliases: ["apn", "parcel", "parcel id", "parcel number", "tax id", "pin"] },
  { field: "county", label: "County", group: "Property", aliases: ["county", "county name", "market"] },
  { field: "phone", label: "Primary Phone", group: "Contact", aliases: ["phone", "owner phone", "contact phone", "mobile", "cell", "phone 1", "wireless 1"] },
  { field: "phone2", label: "Phone 2", group: "Contact", aliases: ["phone 2", "secondary phone", "other phone", "alternate phone", "wireless 2", "mobile 2", "mobile-2"] },
  { field: "phone3", label: "Phone 3", group: "Contact", aliases: ["phone 3", "wireless 3", "mobile 3", "mobile-3"] },
  { field: "phone4", label: "Phone 4", group: "Contact", aliases: ["phone 4", "wireless 4", "mobile 4", "mobile-4"] },
  { field: "phone5", label: "Phone 5", group: "Contact", aliases: ["phone 5", "wireless 5", "mobile 5", "mobile-5"] },
  { field: "phone6", label: "Phone 6", group: "Contact", aliases: ["phone 6", "landline 1", "landline-1"] },
  { field: "phone7", label: "Phone 7", group: "Contact", aliases: ["phone 7", "landline 2", "landline-2"] },
  { field: "phone8", label: "Phone 8", group: "Contact", aliases: ["phone 8", "landline 3", "landline-3"] },
  { field: "phone9", label: "Phone 9", group: "Contact", aliases: ["phone 9", "landline 4", "landline-4"] },
  { field: "phone10", label: "Phone 10", group: "Contact", aliases: ["phone 10", "landline 5", "landline-5"] },
  { field: "email", label: "Email", group: "Contact", aliases: ["email", "email address", "owner email", "contact email", "email 1", "email id 1"] },
  { field: "email2", label: "Email 2", group: "Contact", aliases: ["email 2", "email id 2", "secondary email", "alternate email"] },
  { field: "email3", label: "Email 3", group: "Contact", aliases: ["email 3", "email id 3"] },
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
  { field: "lien_amount", label: "Lien Amount", group: "Financial", aliases: ["lien amount", "lien balance", "tax lien amount", "lien"] },
  { field: "amount_due", label: "Amount Due", group: "Financial", aliases: ["amount due", "amount owed", "total due", "balance due", "delinquent amount", "tax due"] },
  { field: "foreclosure_flag", label: "Foreclosure Flag", group: "Tags", aliases: ["foreclosure", "in foreclosure", "foreclosure status"] },
  { field: "pre_foreclosure_flag", label: "Pre-Foreclosure Flag", group: "Tags", aliases: ["pre foreclosure", "pre-foreclosure", "preforeclosure", "lis pendens", "notice of default"] },
  { field: "list_type", label: "List Type", group: "Context", aliases: ["list type", "record type", "lead type", "category type"] },
  { field: "estimated_value", label: "Estimated Value", group: "Property", aliases: ["estimated value", "total assessment", "assessed value", "avm", "market value", "appraised value", "total value", "property value", "property value last assessed", "last assessed value", "last assessed"] },
  { field: "property_type", label: "Property Type", group: "Property", aliases: ["property type", "prop type", "land use", "property class", "use code", "property use"] },
  { field: "bedrooms", label: "Bedrooms", group: "Property", aliases: ["bedrooms", "beds", "bed count", "br"] },
  { field: "bathrooms", label: "Bathrooms", group: "Property", aliases: ["bathrooms", "baths", "bath count", "ba"] },
  { field: "sqft", label: "Square Footage", group: "Property", aliases: ["square footage", "sqft", "sq ft", "living area", "building area", "gla"] },
  { field: "year_built", label: "Year Built", group: "Property", aliases: ["year built", "yr built", "built year", "construction year"] },
  // Legal / Probate
  { field: "document_type", label: "Document Type", group: "Legal", aliases: ["document type", "record type", "filing type", "doc type"] },
  { field: "case_number", label: "Case Number", group: "Legal", aliases: ["case number", "case no", "case id", "docket number", "court case"] },
  { field: "file_date", label: "File Date", group: "Legal", aliases: ["file date", "filing date", "recorded date", "record date"] },
  { field: "date_of_death", label: "Date of Death", group: "Legal", aliases: ["date of death", "dod", "death date", "decedent date of death"] },
  // Deceased
  { field: "deceased_first_name", label: "Deceased First Name", group: "Deceased", aliases: ["first name deceased", "deceased first name", "decedent first name"] },
  { field: "deceased_last_name", label: "Deceased Last Name", group: "Deceased", aliases: ["deceased last name", "decedent last name", "last name deceased"] },
  { field: "deceased_middle_name", label: "Deceased Middle Name", group: "Deceased", aliases: ["deceased middle name", "decedent middle name", "middle name deceased"] },
  // Survivor
  { field: "survivor_first_name", label: "Survivor First Name", group: "Survivor", aliases: ["survivor first name", "survivor first"] },
  { field: "survivor_last_name", label: "Survivor Last Name", group: "Survivor", aliases: ["survivor last name", "survivor last"] },
  { field: "survivor_middle_name", label: "Survivor Middle Name", group: "Survivor", aliases: ["survivor middle name", "survivor middle"] },
  { field: "survivor_address", label: "Survivor Address", group: "Survivor", aliases: ["survivor address", "survivor street"] },
  { field: "survivor_city", label: "Survivor City", group: "Survivor", aliases: ["survivor city"] },
  { field: "survivor_state", label: "Survivor State", group: "Survivor", aliases: ["survivor state"] },
  { field: "survivor_zip", label: "Survivor Zip", group: "Survivor", aliases: ["survivor zip", "survivor zipcode"] },
  { field: "survivor_phone", label: "Survivor Phone", group: "Survivor", aliases: ["survivor phone", "sr wireless 1", "sr landline 1"] },
  { field: "survivor_email", label: "Survivor Email", group: "Survivor", aliases: ["survivor email", "sr email id 1", "sr email 1"] },
  // Petitioner / Personal Representative
  { field: "petitioner_first_name", label: "Petitioner First Name", group: "Petitioner", aliases: ["petitioner first name", "petitioner first", "pr first name"] },
  { field: "petitioner_last_name", label: "Petitioner Last Name", group: "Petitioner", aliases: ["petitioner last name", "petitioner last", "pr last name"] },
  { field: "petitioner_middle_name", label: "Petitioner Middle Name", group: "Petitioner", aliases: ["petitioner middle name", "petitioner middle", "pr middle name"] },
  { field: "petitioner_address", label: "Petitioner Address", group: "Petitioner", aliases: ["petitioner address", "petitioner street", "pr address"] },
  { field: "petitioner_city", label: "Petitioner City", group: "Petitioner", aliases: ["petitioner city", "pr city"] },
  { field: "petitioner_state", label: "Petitioner State", group: "Petitioner", aliases: ["petitioner state", "pr state"] },
  { field: "petitioner_zip", label: "Petitioner Zip", group: "Petitioner", aliases: ["petitioner zip", "petitioner zipcode", "pr zip"] },
  { field: "petitioner_phone", label: "Petitioner Phone", group: "Petitioner", aliases: ["petitioner phone", "pr wireless 1", "pr landline 1", "pr phone"] },
  { field: "petitioner_email", label: "Petitioner Email", group: "Petitioner", aliases: ["petitioner email", "pr email id 1", "pr email 1"] },
  // Attorney
  { field: "attorney_first_name", label: "Attorney First Name", group: "Attorney", aliases: ["attorney first name", "attorney first", "atty first name"] },
  { field: "attorney_last_name", label: "Attorney Last Name", group: "Attorney", aliases: ["attorney last name", "attorney last", "atty last name"] },
  { field: "attorney_middle_name", label: "Attorney Middle Name", group: "Attorney", aliases: ["attorney middle name", "attorney middle", "atty middle name"] },
  { field: "attorney_address", label: "Attorney Address", group: "Attorney", aliases: ["attorney address", "attorney street", "atty address"] },
  { field: "attorney_city", label: "Attorney City", group: "Attorney", aliases: ["attorney city", "atty city"] },
  { field: "attorney_state", label: "Attorney State", group: "Attorney", aliases: ["attorney state", "atty state"] },
  { field: "attorney_zip", label: "Attorney Zip", group: "Attorney", aliases: ["attorney zip", "attorney zipcode", "atty zip"] },
  { field: "attorney_phone", label: "Attorney Phone", group: "Attorney", aliases: ["attorney phone", "attorney ph number", "atty phone"] },
  { field: "attorney_email", label: "Attorney Email", group: "Attorney", aliases: ["attorney email", "attorney email id", "atty email"] },
  { field: "attorney_bar_number", label: "Attorney Bar No", group: "Attorney", aliases: ["attorney bar no", "attorney bar number", "bar number", "bar no"] },
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

  const emailFields = new Set<ImportTargetField>(["email", "email2", "email3", "survivor_email", "petitioner_email", "attorney_email"]);
  const phoneFields = new Set<ImportTargetField>(["phone", "phone2", "phone3", "phone4", "phone5", "phone6", "phone7", "phone8", "phone9", "phone10", "survivor_phone", "petitioner_phone", "attorney_phone"]);
  if (emailFields.has(field) && populated.some((value) => value.includes("@"))) return 0.08;
  if (phoneFields.has(field) && populated.some((value) => value.replace(/\D/g, "").length >= 10)) return 0.08;
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
  tagIf(coerceBoolean(pick("foreclosure_flag")), "pre_foreclosure", tags);
  tagIf(coerceBoolean(pick("pre_foreclosure_flag")), "pre_foreclosure", tags);

  // Lien amount or amount due > 0 implies tax_lien distress
  const lienAmt = pick("lien_amount");
  const amtDue = pick("amount_due");
  if (lienAmt && parseFloat(lienAmt) > 0) tags.add("tax_lien");
  if (amtDue && parseFloat(amtDue) > 0) tags.add("tax_lien");

  // List type column (e.g., "Pre-Foreclosures", "Tax Liens", "Probate")
  const listType = pick("list_type");
  if (listType) {
    const lt = listType.toLowerCase();
    if (lt.includes("probate")) tags.add("probate");
    if (lt.includes("pre-foreclosure") || lt.includes("preforeclosure") || lt.includes("pre foreclosure")) tags.add("pre_foreclosure");
    if (lt.includes("foreclosure") && !lt.includes("pre")) tags.add("pre_foreclosure");
    if (lt.includes("tax lien") || lt.includes("tax late") || lt.includes("tax delinq")) tags.add("tax_lien");
    if (lt.includes("vacant")) tags.add("vacant");
    if (lt.includes("inherit")) tags.add("inherited");
    if (lt.includes("bankrupt")) tags.add("bankruptcy");
    if (lt.includes("divorce")) tags.add("divorce");
    if (lt.includes("absentee")) tags.add("absentee");
  }
  tagIf(coerceBoolean(pick("do_not_call_flag")), "do_not_call", tags);
  tagIf(coerceBoolean(pick("bad_data_flag")), "bad_data", tags);

  const docType = pick("document_type");
  if (docType) {
    const dt = docType.toLowerCase();
    if (dt.includes("probate")) tags.add("probate");
    if (dt.includes("pre-probate") || dt.includes("pre probate")) tags.add("inherited");
    if (dt.includes("tax")) tags.add("tax_delinquent");
  }

  if (pick("date_of_death") || pick("deceased_first_name")) {
    tags.add("probate");
  }

  if (defaults.nicheTag) {
    tags.add(defaults.nicheTag);
  }

  // Infer tags from the user-entered list name (e.g. "Spokane absentee probate tax delq")
  // Uses the same keyword rules as listType column detection above.
  const sourceListName = defaults.sourceListName;
  if (sourceListName) {
    const sln = sourceListName.toLowerCase();
    if (sln.includes("probate")) tags.add("probate");
    if (sln.includes("pre-foreclosure") || sln.includes("preforeclosure") || sln.includes("pre foreclosure")) tags.add("pre_foreclosure");
    if (sln.includes("foreclosure") && !sln.includes("pre")) tags.add("pre_foreclosure");
    if (sln.includes("tax lien") || sln.includes("tax late") || sln.includes("tax delinq") || sln.includes("tax delq") || sln.includes("tax tlq")) tags.add("tax_delinquent");
    if (sln.includes("vacant")) tags.add("vacant");
    if (sln.includes("inherit")) tags.add("inherited");
    if (sln.includes("bankrupt")) tags.add("bankruptcy");
    if (sln.includes("divorce")) tags.add("divorce");
    if (sln.includes("absentee") || sln.includes("absent")) tags.add("absentee");
  }

  if (distressText) {
    DISTRESS_TEXT_RULES.forEach((rule) => {
      if (rule.pattern.test(distressText)) tags.add(rule.tag);
    });
  }

  // Auto-concat first/middle/last name if owner_name isn't directly mapped
  let ownerName = pick("owner_name");
  if (!ownerName) {
    const first = pick("owner_first_name");
    const middle = pick("owner_middle_name");
    const last = pick("owner_last_name");
    if (first || last) {
      ownerName = [last, [first, middle].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null;
    }
  }
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
    ownerSuffix: pick("owner_suffix"),
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
    phone3: cleanPhone(pick("phone3")),
    phone4: cleanPhone(pick("phone4")),
    phone5: cleanPhone(pick("phone5")),
    phone6: cleanPhone(pick("phone6")),
    phone7: cleanPhone(pick("phone7")),
    phone8: cleanPhone(pick("phone8")),
    phone9: cleanPhone(pick("phone9")),
    phone10: cleanPhone(pick("phone10")),
    email,
    email2: cleanEmail(pick("email2")),
    email3: cleanEmail(pick("email3")),
    notes: pick("notes"),
    estimatedValue: pick("estimated_value"),
    propertyType: pick("property_type"),
    bedrooms: pick("bedrooms"),
    bathrooms: pick("bathrooms"),
    sqft: pick("sqft"),
    yearBuilt: pick("year_built"),
    lienAmount: lienAmt ?? amtDue ?? null,
    sourceVendor: pick("source_vendor") ?? cleanString(defaults.sourceVendor),
    sourceListName: pick("source_list_name") ?? cleanString(defaults.sourceListName),
    distressTags: [...tags],
    reviewStatus,
    warnings,
    rawRowPayload: row,
    unmappedColumns,
    mappingWarnings,
    duplicate: duplicate ?? { level: "none", reasons: [] },
    // Legal / Probate
    documentType: pick("document_type"),
    caseNumber: pick("case_number"),
    fileDate: pick("file_date"),
    dateOfDeath: pick("date_of_death"),
    // Deceased
    deceasedFirstName: pick("deceased_first_name"),
    deceasedLastName: pick("deceased_last_name"),
    deceasedMiddleName: pick("deceased_middle_name"),
    // Survivor
    survivorFirstName: pick("survivor_first_name"),
    survivorLastName: pick("survivor_last_name"),
    survivorMiddleName: pick("survivor_middle_name"),
    survivorAddress: pick("survivor_address"),
    survivorCity: pick("survivor_city"),
    survivorState: pick("survivor_state")?.toUpperCase() ?? null,
    survivorZip: pick("survivor_zip"),
    survivorPhone: cleanPhone(pick("survivor_phone")),
    survivorEmail: cleanEmail(pick("survivor_email")),
    // Petitioner
    petitionerFirstName: pick("petitioner_first_name"),
    petitionerLastName: pick("petitioner_last_name"),
    petitionerMiddleName: pick("petitioner_middle_name"),
    petitionerAddress: pick("petitioner_address"),
    petitionerCity: pick("petitioner_city"),
    petitionerState: pick("petitioner_state")?.toUpperCase() ?? null,
    petitionerZip: pick("petitioner_zip"),
    petitionerPhone: cleanPhone(pick("petitioner_phone")),
    petitionerEmail: cleanEmail(pick("petitioner_email")),
    // Attorney
    attorneyFirstName: pick("attorney_first_name"),
    attorneyLastName: pick("attorney_last_name"),
    attorneyMiddleName: pick("attorney_middle_name"),
    attorneyAddress: pick("attorney_address"),
    attorneyCity: pick("attorney_city"),
    attorneyState: pick("attorney_state")?.toUpperCase() ?? null,
    attorneyZip: pick("attorney_zip"),
    attorneyPhone: cleanPhone(pick("attorney_phone")),
    attorneyEmail: cleanEmail(pick("attorney_email")),
    attorneyBarNumber: pick("attorney_bar_number"),
  };
}

function buildPersonObject(first: string | null, last: string | null, middle: string | null, extra?: Record<string, string | null>) {
  if (!first && !last) return null;
  const obj: Record<string, string | null> = { first_name: first, last_name: last, middle_name: middle };
  if (extra) Object.assign(obj, extra);
  return obj;
}

export function buildProspectPayload(record: NormalizedImportRecord, defaults: NormalizationDefaults) {
  const mergedNotes = [record.notes, `Imported via ${defaults.importBatchId || "batch import"}`]
    .filter(Boolean)
    .join("\n\n");

  const importPhones = [record.phone3, record.phone4, record.phone5, record.phone6, record.phone7, record.phone8, record.phone9, record.phone10].filter(Boolean) as string[];
  const importEmails = [record.email2, record.email3].filter(Boolean) as string[];

  const legalMetadata = (record.documentType || record.caseNumber || record.fileDate || record.dateOfDeath)
    ? { document_type: record.documentType, case_number: record.caseNumber, file_date: record.fileDate, date_of_death: record.dateOfDeath }
    : null;

  const deceasedPerson = buildPersonObject(record.deceasedFirstName, record.deceasedLastName, record.deceasedMiddleName);

  const survivorContact = buildPersonObject(record.survivorFirstName, record.survivorLastName, record.survivorMiddleName, {
    address: record.survivorAddress, city: record.survivorCity, state: record.survivorState, zip: record.survivorZip,
    phone: record.survivorPhone, email: record.survivorEmail,
  });

  const petitionerContact = buildPersonObject(record.petitionerFirstName, record.petitionerLastName, record.petitionerMiddleName, {
    address: record.petitionerAddress, city: record.petitionerCity, state: record.petitionerState, zip: record.petitionerZip,
    phone: record.petitionerPhone, email: record.petitionerEmail,
  });

  const attorneyContact = buildPersonObject(record.attorneyFirstName, record.attorneyLastName, record.attorneyMiddleName, {
    address: record.attorneyAddress, city: record.attorneyCity, state: record.attorneyState, zip: record.attorneyZip,
    phone: record.attorneyPhone, email: record.attorneyEmail, bar_number: record.attorneyBarNumber,
  });

  return {
    owner_name: record.ownerName ?? "",
    owner_suffix: record.ownerSuffix || undefined,
    address: record.propertyAddress ?? "",
    city: record.propertyCity ?? "",
    state: record.propertyState ?? "WA",
    zip: record.propertyZip ?? "",
    apn: record.apn ?? "",
    county: record.county ?? defaults.county,
    owner_phone: record.phone,
    owner_phone2: record.phone2 || undefined,
    owner_email: record.email,
    notes: record.lienAmount
      ? `${mergedNotes}\nLien/Amount Due: $${Number(record.lienAmount).toLocaleString()}`
      : mergedNotes,
    distress_tags: record.distressTags,
    estimated_value: record.estimatedValue || undefined,
    property_type: record.propertyType || undefined,
    bedrooms: record.bedrooms || undefined,
    bathrooms: record.bathrooms || undefined,
    sqft: record.sqft || undefined,
    year_built: record.yearBuilt || undefined,
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
    skip_auto_bricked: true,
    import_phones: importPhones.length > 0 ? importPhones : undefined,
    import_emails: importEmails.length > 0 ? importEmails : undefined,
    legal_metadata: legalMetadata || undefined,
    deceased_person: deceasedPerson || undefined,
    survivor_contact: survivorContact || undefined,
    petitioner_contact: petitionerContact || undefined,
    attorney_contact: attorneyContact || undefined,
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
