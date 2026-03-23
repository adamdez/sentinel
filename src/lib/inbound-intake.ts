import type { DuplicateCandidate, NormalizedImportRecord } from "@/lib/import-normalization";

export interface InboundIntakeInput {
  sourceChannel: string;
  sourceVendor?: string | null;
  sourceCampaign?: string | null;
  intakeMethod?: string | null;
  rawSourceRef?: string | null;
  ownerName?: string | null;
  phone?: string | null;
  email?: string | null;
  propertyAddress?: string | null;
  propertyCity?: string | null;
  propertyState?: string | null;
  propertyZip?: string | null;
  mailingAddress?: string | null;
  mailingCity?: string | null;
  mailingState?: string | null;
  mailingZip?: string | null;
  county?: string | null;
  apn?: string | null;
  notes?: string | null;
  rawText?: string | null;
  rawPayload?: Record<string, unknown> | null;
  receivedAt?: string | null;
  gclid?: string | null;
  landingPage?: string | null;
}

export interface NormalizedInboundCandidate {
  ownerName: string | null;
  phone: string | null;
  email: string | null;
  propertyAddress: string | null;
  propertyCity: string | null;
  propertyState: string | null;
  propertyZip: string | null;
  mailingAddress: string | null;
  mailingCity: string | null;
  mailingState: string | null;
  mailingZip: string | null;
  county: string | null;
  apn: string | null;
  notes: string | null;
  sourceChannel: string;
  sourceVendor: string | null;
  sourceCampaign: string | null;
  intakeMethod: string | null;
  rawSourceRef: string | null;
  receivedAt: string;
  warnings: string[];
  confidence: "high" | "medium" | "low";
  reviewStatus: string;
  rawPayload: Record<string, unknown> | null;
  duplicate: DuplicateCandidate;
  gclid: string | null;
  landingPage: string | null;
}

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_REGEX = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?){2}\d{4}/g;
const ADDRESS_REGEX = /\b\d{1,6}\s+[A-Za-z0-9.'#-]+(?:\s+[A-Za-z0-9.'#-]+){0,5}\s(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|pl|place|way|ter|terrace|trl|trail)\b/i;

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function cleanPhone(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits.length >= 10 ? digits.slice(-10) : null;
}

function cleanEmail(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized.includes("@") ? normalized : null;
}

function inferName(rawText: string | null): string | null {
  if (!rawText) return null;
  const labeled = rawText.match(/(?:owner|name|seller)\s*[:\-]\s*([^\n\r]+)/i);
  if (labeled?.[1]) return cleanString(labeled[1]);
  return null;
}

function inferAddress(rawText: string | null): string | null {
  if (!rawText) return null;
  const labeled = rawText.match(/(?:property|address|property address)\s*[:\-]\s*([^\n\r]+)/i);
  if (labeled?.[1]) return cleanString(labeled[1]);
  const matched = rawText.match(ADDRESS_REGEX);
  return cleanString(matched?.[0] ?? null);
}

function inferPhone(rawText: string | null): string | null {
  if (!rawText) return null;
  const match = rawText.match(PHONE_REGEX)?.[0] ?? null;
  return cleanPhone(match);
}

function inferEmail(rawText: string | null): string | null {
  if (!rawText) return null;
  const match = rawText.match(EMAIL_REGEX)?.[0] ?? null;
  return cleanEmail(match);
}

function inferCounty(rawText: string | null): string | null {
  if (!rawText) return null;
  const county = rawText.match(/\b(Spokane|Kootenai)\b/i)?.[1] ?? null;
  return county ? county.toLowerCase() : null;
}

function inferSpam(input: InboundIntakeInput, text: string | null): boolean {
  const source = `${input.sourceVendor ?? ""} ${input.sourceCampaign ?? ""} ${text ?? ""}`.toLowerCase();
  if (source.includes("unsubscribe") && !source.includes("property")) return true;
  if (source.includes("seo services") || source.includes("guest post") || source.includes("bitcoin")) return true;
  return false;
}

function confidenceLabel(score: number): "high" | "medium" | "low" {
  if (score >= 0.8) return "high";
  if (score >= 0.55) return "medium";
  return "low";
}

export function normalizeInboundCandidate(input: InboundIntakeInput): NormalizedInboundCandidate {
  const rawText = cleanString(input.rawText) ?? null;
  const ownerName = cleanString(input.ownerName) ?? inferName(rawText);
  const propertyAddress = cleanString(input.propertyAddress) ?? inferAddress(rawText);
  const phone = cleanPhone(cleanString(input.phone) ?? inferPhone(rawText));
  const email = cleanEmail(cleanString(input.email) ?? inferEmail(rawText));
  const county = cleanString(input.county)?.toLowerCase() ?? inferCounty(rawText);
  const warnings: string[] = [];

  let score = 0.1;
  if (cleanString(input.ownerName)) score += 0.25; else if (ownerName) score += 0.12;
  if (cleanString(input.propertyAddress)) score += 0.28; else if (propertyAddress) score += 0.15;
  if (cleanString(input.phone)) score += 0.2; else if (phone) score += 0.1;
  if (cleanString(input.email)) score += 0.12; else if (email) score += 0.06;
  if (cleanString(input.county)) score += 0.1; else if (county) score += 0.05;

  if (!propertyAddress) warnings.push("Missing property address");
  if (!phone) warnings.push("Missing phone");
  if (!ownerName) warnings.push("Missing owner name");

  const isSpam = inferSpam(input, rawText);
  const confidence = confidenceLabel(score);
  let reviewStatus = "ready_for_first_call";
  if (isSpam) reviewStatus = "junk";
  else if (!propertyAddress) reviewStatus = "missing_property_address";
  else if (!phone) reviewStatus = "missing_phone";
  else if (confidence === "low") reviewStatus = "needs_review";

  return {
    ownerName,
    phone,
    email,
    propertyAddress,
    propertyCity: cleanString(input.propertyCity),
    propertyState: cleanString(input.propertyState)?.toUpperCase() ?? null,
    propertyZip: cleanString(input.propertyZip),
    mailingAddress: cleanString(input.mailingAddress),
    mailingCity: cleanString(input.mailingCity),
    mailingState: cleanString(input.mailingState)?.toUpperCase() ?? null,
    mailingZip: cleanString(input.mailingZip),
    county,
    apn: cleanString(input.apn),
    notes: cleanString(input.notes) ?? rawText,
    sourceChannel: cleanString(input.sourceChannel) ?? "manual",
    sourceVendor: cleanString(input.sourceVendor),
    sourceCampaign: cleanString(input.sourceCampaign),
    intakeMethod: cleanString(input.intakeMethod),
    rawSourceRef: cleanString(input.rawSourceRef),
    receivedAt: cleanString(input.receivedAt) ?? new Date().toISOString(),
    warnings,
    confidence,
    reviewStatus,
    rawPayload: input.rawPayload ?? null,
    duplicate: { level: "none", reasons: [] },
    gclid: cleanString(input.gclid),
    landingPage: cleanString(input.landingPage),
  };
}

export function withDuplicateStatus(
  candidate: NormalizedInboundCandidate,
  duplicate: DuplicateCandidate,
): NormalizedInboundCandidate {
  let reviewStatus = candidate.reviewStatus;
  if (duplicate.level === "possible") reviewStatus = "possible_duplicate";
  if (duplicate.level === "high" && reviewStatus === "ready_for_first_call") reviewStatus = "needs_review";
  return {
    ...candidate,
    duplicate,
    reviewStatus,
  };
}

export function inboundCandidateToRecord(candidate: NormalizedInboundCandidate): NormalizedImportRecord {
  return {
    rowNumber: 1,
    ownerName: candidate.ownerName,
    coOwnerName: null,
    propertyAddress: candidate.propertyAddress,
    propertyCity: candidate.propertyCity,
    propertyState: candidate.propertyState,
    propertyZip: candidate.propertyZip,
    mailingAddress: candidate.mailingAddress,
    mailingCity: candidate.mailingCity,
    mailingState: candidate.mailingState,
    mailingZip: candidate.mailingZip,
    apn: candidate.apn,
    county: candidate.county,
    phone: candidate.phone,
    phone2: null,
    email: candidate.email,
    notes: candidate.notes,
    estimatedValue: null,
    propertyType: null,
    bedrooms: null,
    bathrooms: null,
    sqft: null,
    yearBuilt: null,
    lienAmount: null,
    sourceVendor: candidate.sourceVendor,
    sourceListName: candidate.sourceCampaign,
    distressTags: [],
    reviewStatus: candidate.reviewStatus,
    warnings: candidate.warnings,
    rawRowPayload: Object.fromEntries(
      Object.entries(candidate.rawPayload ?? {}).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)]),
    ),
    unmappedColumns: {},
    mappingWarnings: candidate.confidence === "low" ? ["Low-confidence inbound parse"] : [],
    duplicate: candidate.duplicate,
  };
}
