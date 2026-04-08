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

// Spokane County & Kootenai County cities and zip codes for county inference
const SPOKANE_ZIPS = new Set(["99001","99003","99004","99005","99006","99009","99011","99012","99016","99018","99019","99020","99021","99022","99023","99025","99026","99027","99029","99030","99031","99036","99037","99039","99110","99148","99170","99173","99201","99202","99203","99204","99205","99206","99207","99208","99209","99210","99211","99212","99213","99214","99215","99216","99217","99218","99219","99220","99223","99224","99228","99251","99252","99256","99258","99260"]);
const KOOTENAI_ZIPS = new Set(["83801","83810","83814","83815","83835","83843","83854","83858","83864","83869","83871","83876"]);
const SPOKANE_CITIES = new Set(["spokane","spokane valley","liberty lake","cheney","airway heights","medical lake","millwood","deer park","colbert","mead","nine mile falls","greenacres","otis orchards","veradale","newman lake","four lakes","marshall","latah","fairfield","rockford","spangle","waverly"]);
const KOOTENAI_CITIES = new Set(["coeur d'alene","post falls","hayden","rathdrum","dalton gardens","spirit lake","athol","hauser","worley","harrison","huetter"]);
const GENERIC_MARKET_CITIES = new Set(["spokane", "coeur d'alene", "coeur d alene"]);
const ZIP_TO_CITY: Record<string, string> = {
  "99201": "Spokane", "99202": "Spokane", "99203": "Spokane", "99204": "Spokane",
  "99205": "Spokane", "99206": "Spokane", "99207": "Spokane", "99208": "Spokane",
  "99209": "Spokane", "99210": "Spokane", "99211": "Spokane", "99212": "Spokane",
  "99213": "Spokane", "99214": "Spokane", "99215": "Spokane Valley", "99216": "Spokane",
  "99217": "Spokane", "99218": "Spokane", "99219": "Spokane", "99220": "Spokane",
  "99223": "Spokane", "99224": "Spokane", "99228": "Spokane",
  "99001": "Airway Heights", "99003": "Chattaroy", "99004": "Cheney",
  "99005": "Colbert", "99006": "Deer Park", "99009": "Elk",
  "99011": "Fairchild AFB", "99012": "Fairfield", "99016": "Greenacres",
  "99018": "Latah", "99019": "Liberty Lake", "99020": "Marshall",
  "99021": "Mead", "99022": "Medical Lake", "99023": "Mica",
  "99025": "Newman Lake", "99026": "Nine Mile Falls", "99027": "Otis Orchards",
  "99029": "Reardan", "99030": "Rockford", "99031": "Spangle",
  "99036": "Valleyford", "99037": "Veradale", "99039": "Waverly",
  "99170": "Sprague",
  "83801": "Athol", "83810": "Cataldo", "83814": "Coeur d'Alene", "83815": "Coeur d'Alene",
  "83835": "Hayden", "83843": "Post Falls", "83854": "Post Falls", "83858": "Rathdrum",
  "83864": "Sandpoint", "83869": "Spirit Lake", "83871": "Tensed", "83876": "Worley",
};

const STREET_SUFFIX_TOKENS = new Set([
  "st", "street", "ave", "avenue", "rd", "road", "dr", "drive", "ln", "lane", "ct", "court",
  "cir", "circle", "blvd", "boulevard", "pl", "place", "way", "ter", "terrace", "trl", "trail",
  "hwy", "highway",
]);

const STREET_CONTINUATION_TOKENS = new Set([
  "n", "s", "e", "w", "ne", "nw", "se", "sw",
  "apt", "unit", "ste", "suite", "trlr", "lot",
]);

function splitStreetAndCityPrefix(value: string): { streetAddress: string | null; city: string | null } {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return { streetAddress: null, city: null };

  const colonParts = normalized.split(":");
  if (colonParts.length === 2) {
    return {
      streetAddress: cleanString(colonParts[0]),
      city: normalizeCityString(colonParts[1]),
    };
  }

  const tokens = normalized.split(" ");
  let boundaryIndex = -1;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i].replace(/[.,]/g, "").toLowerCase();
    if (!STREET_SUFFIX_TOKENS.has(token)) continue;
    boundaryIndex = i;
    while (boundaryIndex + 1 < tokens.length) {
      const nextToken = tokens[boundaryIndex + 1].replace(/[.,]/g, "").toLowerCase();
      if (STREET_CONTINUATION_TOKENS.has(nextToken) || /^\d+[a-z]?$/i.test(nextToken)) {
        boundaryIndex += 1;
        continue;
      }
      break;
    }
  }

  if (boundaryIndex === -1 || boundaryIndex >= tokens.length - 1) {
    return { streetAddress: cleanString(normalized), city: null };
  }

  return {
    streetAddress: cleanString(tokens.slice(0, boundaryIndex + 1).join(" ")),
    city: normalizeCityString(tokens.slice(boundaryIndex + 1).join(" ")),
  };
}

function parseAddressTail(
  address: string | null | undefined,
  fallbackZip?: string | null,
): {
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
} {
  const cleaned = cleanString(address);
  if (!cleaned) {
    return { streetAddress: null, city: null, state: null, zip: null };
  }

  const normalized = cleaned.replace(/\s+/g, " ").trim();
  const withZipMatch = normalized.match(/^(.*)\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (withZipMatch) {
    const prefix = splitStreetAndCityPrefix(withZipMatch[1] ?? "");
    const streetAddress = prefix.streetAddress ?? cleanString(withZipMatch[1]?.replace(/[:;,]\s*$/, "")) ?? normalized;
    const city = prefix.city ?? null;
    const state = cleanString(withZipMatch[2])?.toUpperCase() ?? null;
    const zip = cleanString(withZipMatch[3]) ?? null;

    return { streetAddress, city, state, zip };
  }

  const withoutZipMatch = normalized.match(/^(.*)\s+([A-Za-z]{2})$/);
  if (!withoutZipMatch) {
    return { streetAddress: normalized, city: null, state: null, zip: cleanString(fallbackZip) };
  }

  const prefix = splitStreetAndCityPrefix(withoutZipMatch[1] ?? "");
  const streetAddress = prefix.streetAddress ?? cleanString(withoutZipMatch[1]?.replace(/[:;,]\s*$/, "")) ?? normalized;
  const city = prefix.city ?? null;
  const state = cleanString(withoutZipMatch[2])?.toUpperCase() ?? null;
  const zip = cleanString(fallbackZip) ?? null;

  return { streetAddress, city, state, zip };
}

function inferCountyFromCityOrZip(city: string | null, zip: string | null): string | null {
  if (zip) {
    const z = zip.trim().slice(0, 5);
    if (SPOKANE_ZIPS.has(z)) return "spokane";
    if (KOOTENAI_ZIPS.has(z)) return "kootenai";
  }
  if (city) {
    const c = city.trim().toLowerCase();
    if (SPOKANE_CITIES.has(c)) return "spokane";
    if (KOOTENAI_CITIES.has(c)) return "kootenai";
  }
  return null;
}

function inferCounty(rawText: string | null): string | null {
  if (!rawText) return null;
  const county = rawText.match(/\b(Spokane|Kootenai)\b/i)?.[1] ?? null;
  return county ? county.toLowerCase() : null;
}

function normalizeCityString(city: string | null | undefined): string | null {
  const cleaned = cleanString(city);
  if (!cleaned) return null;
  return cleaned
    .replace(/\s+/g, " ")
    .replace(/,\s*$/, "")
    .replace(/\s*,\s*[A-Z]{2}$/i, "")
    .trim();
}

function isUnknownCity(city: string | null): boolean {
  if (!city) return true;
  const normalized = city.trim().toLowerCase();
  return normalized === "" || normalized === "unknown" || normalized === "n/a" || normalized === "none" || normalized === "null";
}

export function resolveMarketCity(
  city: string | null | undefined,
  zip: string | null | undefined,
): { city: string | null; source: "original" | "zip_lookup" | "none" } {
  const normalizedCity = normalizeCityString(city);
  const normalizedZip = cleanString(zip)?.replace(/\D/g, "").slice(0, 5) ?? null;
  const zipCity = normalizedZip ? ZIP_TO_CITY[normalizedZip] ?? null : null;

  if (!zipCity) {
    return normalizedCity ? { city: normalizedCity, source: "original" } : { city: null, source: "none" };
  }

  if (isUnknownCity(normalizedCity)) {
    return { city: zipCity, source: "zip_lookup" };
  }

  const lowerCity = normalizedCity!.toLowerCase();
  if (lowerCity === zipCity.toLowerCase()) {
    return { city: normalizedCity, source: "original" };
  }

  if (GENERIC_MARKET_CITIES.has(lowerCity)) {
    return { city: zipCity, source: "zip_lookup" };
  }

  return { city: normalizedCity, source: "original" };
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
  const rawPropertyAddress = cleanString(input.propertyAddress) ?? inferAddress(rawText);
  const parsedAddressTail = parseAddressTail(rawPropertyAddress, cleanString(input.propertyZip));
  const normalizedZip = cleanString(input.propertyZip) ?? parsedAddressTail.zip;
  const normalizedState = cleanString(input.propertyState)?.toUpperCase() ?? parsedAddressTail.state;
  const propertyAddress = parsedAddressTail.streetAddress ?? rawPropertyAddress;
  const phone = cleanPhone(cleanString(input.phone) ?? inferPhone(rawText));
  const email = cleanEmail(cleanString(input.email) ?? inferEmail(rawText));
  const propertyCityResolution = resolveMarketCity(parsedAddressTail.city ?? input.propertyCity ?? null, normalizedZip);
  const county = cleanString(input.county)?.toLowerCase()
    ?? inferCountyFromCityOrZip(propertyCityResolution.city, normalizedZip)
    ?? inferCounty(rawText);
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
    propertyCity: propertyCityResolution.city,
    propertyState: normalizedState,
    propertyZip: normalizedZip,
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
    ownerSuffix: null,
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
    phone3: null,
    phone4: null,
    phone5: null,
    phone6: null,
    phone7: null,
    phone8: null,
    phone9: null,
    phone10: null,
    email: candidate.email,
    email2: null,
    email3: null,
    notes: candidate.notes,
    estimatedValue: null,
    propertyType: null,
    bedrooms: null,
    bathrooms: null,
    sqft: null,
    yearBuilt: null,
    lienAmount: null,
    equityAmount: null,
    annualTaxes: null,
    estimatedTaxRate: null,
    purchaseAmount: null,
    purchaseDate: null,
    ownerOccupied: null,
    mailVacant: null,
    preProbate: null,
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
    documentType: null,
    caseNumber: null,
    fileDate: null,
    dateOfDeath: null,
    deceasedFirstName: null,
    deceasedLastName: null,
    deceasedMiddleName: null,
    survivorFirstName: null,
    survivorLastName: null,
    survivorMiddleName: null,
    survivorAddress: null,
    survivorCity: null,
    survivorState: null,
    survivorZip: null,
    survivorPhone: null,
    survivorEmail: null,
    petitionerFirstName: null,
    petitionerLastName: null,
    petitionerMiddleName: null,
    petitionerAddress: null,
    petitionerCity: null,
    petitionerState: null,
    petitionerZip: null,
    petitionerPhone: null,
    petitionerEmail: null,
    attorneyFirstName: null,
    attorneyLastName: null,
    attorneyMiddleName: null,
    attorneyAddress: null,
    attorneyCity: null,
    attorneyState: null,
    attorneyZip: null,
    attorneyPhone: null,
    attorneyEmail: null,
    attorneyBarNumber: null,
  };
}
