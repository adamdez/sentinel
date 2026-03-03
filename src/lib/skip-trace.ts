/**
 * Unified Dual-Source Skip-Trace Service
 *
 * Charter v3.1 — Calls PropertyRadar Persons + BatchData in parallel,
 * merges and deduplicates phone numbers and emails, returns compliance flags.
 *
 * Each phone number is enriched with:
 *   - source ("propertyradar" | "batchdata")
 *   - lineType (mobile / landline / voip / unknown)
 *   - confidence score (0-100)
 *   - DNC flag
 *
 * Results are sorted: highest confidence first, DNC numbers last.
 * Capped at 8 phones, 6 emails per property.
 */

import { skipTraceByAddress, type BatchDataPhone, type BatchDataEmail } from "@/lib/batchdata";

const PR_API_BASE = "https://api.propertyradar.com/v1/properties";
const MAX_PHONES = 8;
const MAX_EMAILS = 6;

// ── Unified Types ────────────────────────────────────────────────────

export interface UnifiedPhone {
  number: string;
  normalized: string;
  lineType: "mobile" | "landline" | "voip" | "unknown";
  confidence: number;
  dnc: boolean;
  carrier?: string;
  source: "propertyradar" | "batchdata";
}

export interface UnifiedEmail {
  email: string;
  deliverable: boolean;
  source: "propertyradar" | "batchdata";
}

export interface UnifiedPerson {
  name: string;
  role: string;
  age: number | null;
  phones: string[];
  emails: string[];
  mailingAddress: string | null;
  occupation: string | null;
  isPrimary: boolean;
  source: "propertyradar" | "batchdata";
}

export interface SkipTraceResult {
  phones: UnifiedPhone[];
  emails: UnifiedEmail[];
  persons: UnifiedPerson[];
  primaryPhone: string | null;
  primaryEmail: string | null;
  isLitigator: boolean;
  hasDncNumbers: boolean;
  providers: ("propertyradar" | "batchdata")[];
  prSuccess: boolean;
  bdSuccess: boolean;
  totalPhoneCount: number;
  totalEmailCount: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _debugSources?: Record<string, any>;
}

// ── Property Input ───────────────────────────────────────────────────

export interface SkipTracePropertyInput {
  id: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  owner_name?: string;
  mailingAddress?: string;
  mailingCity?: string;
  mailingState?: string;
  mailingZip?: string;
}

// ── Main Entry Point ─────────────────────────────────────────────────

/**
 * Run dual-source skip-trace: PR Persons + PR County + BatchData in parallel.
 * If radarId is provided, PR Persons + PR County phone fields are called.
 * BatchData is called for both property address and mailing address.
 */
export async function dualSkipTrace(
  property: SkipTracePropertyInput,
  radarId?: string,
): Promise<SkipTraceResult> {
  const t0 = Date.now();
  const prApiKey = process.env.PROPERTYRADAR_API_KEY;

  // Fire all providers in parallel — includes PR county phone fields + mailing address BatchData
  const [prResult, prCountyResult, bdResult, bdMailResult] = await Promise.all([
    radarId && prApiKey
      ? fetchPRPersons(prApiKey, radarId).catch((err) => {
          console.error("[DualSkip] PR Persons error:", err);
          return null;
        })
      : Promise.resolve(null),
    radarId && prApiKey
      ? fetchPRCountyPhones(prApiKey, radarId).catch((err) => {
          console.error("[DualSkip] PR County phones error:", err);
          return null;
        })
      : Promise.resolve(null),
    fetchBatchData(property).catch((err) => {
      console.error("[DualSkip] BatchData (property) error:", err);
      return null;
    }),
    // Also try BatchData with mailing address if it differs from property address
    fetchBatchDataMailing(property).catch((err) => {
      console.error("[DualSkip] BatchData (mailing) error:", err);
      return null;
    }),
  ]);

  console.log(`[DualSkip] Parallel calls completed in ${Date.now() - t0}ms (PR Persons: ${!!prResult}, PR County: ${!!prCountyResult}, BD Property: ${!!bdResult}, BD Mailing: ${!!bdMailResult})`);

  // Merge results
  const allPhones: UnifiedPhone[] = [];
  const allEmails: UnifiedEmail[] = [];
  const allPersons: UnifiedPerson[] = [];
  const seenPhones = new Set<string>();
  const seenEmails = new Set<string>();
  let isLitigator = false;
  let hasDncNumbers = false;
  const providers: ("propertyradar" | "batchdata")[] = [];

  // ── Merge PropertyRadar Persons results ───────────────────────
  if (prResult) {
    if (!providers.includes("propertyradar")) providers.push("propertyradar");
    for (const phone of prResult.phones) {
      const norm = normalizePhone(phone.number);
      if (seenPhones.has(norm)) continue;
      seenPhones.add(norm);
      allPhones.push(phone);
    }
    for (const email of prResult.emails) {
      const norm = email.email.toLowerCase().trim();
      if (seenEmails.has(norm)) continue;
      seenEmails.add(norm);
      allEmails.push(email);
    }
    allPersons.push(...prResult.persons);
  }

  // ── Merge PropertyRadar County phone/email records ──────────────
  if (prCountyResult) {
    if (!providers.includes("propertyradar")) providers.push("propertyradar");
    for (const phone of prCountyResult.phones) {
      const norm = normalizePhone(phone.number);
      if (seenPhones.has(norm)) continue;
      seenPhones.add(norm);
      allPhones.push(phone);
    }
    for (const email of prCountyResult.emails) {
      const norm = email.email.toLowerCase().trim();
      if (seenEmails.has(norm)) continue;
      seenEmails.add(norm);
      allEmails.push(email);
    }
  }

  // ── Helper to merge BatchData-shaped result ────────────────────
  const mergeBatchData = (bd: NonNullable<typeof bdResult>, label: string) => {
    if (!providers.includes("batchdata")) providers.push("batchdata");
    if (bd.isLitigator) isLitigator = true;
    if (bd.hasDncNumbers) hasDncNumbers = true;

    for (const phone of bd.phones) {
      const norm = normalizePhone(phone.number);
      if (seenPhones.has(norm)) continue;
      seenPhones.add(norm);
      allPhones.push({
        number: phone.number,
        normalized: norm,
        lineType: phone.lineType,
        confidence: phone.confidence,
        dnc: phone.dnc,
        carrier: phone.carrier,
        source: "batchdata",
      });
      if (phone.dnc) hasDncNumbers = true;
    }

    for (const email of bd.emails) {
      const norm = email.email.toLowerCase().trim();
      if (seenEmails.has(norm)) continue;
      seenEmails.add(norm);
      allEmails.push({
        email: email.email,
        deliverable: email.deliverable,
        source: "batchdata",
      });
    }

    for (const person of bd.persons) {
      allPersons.push({
        name: person.fullName ?? ([person.firstName, person.lastName].filter(Boolean).join(" ") || "Unknown"),
        role: "Owner",
        age: null,
        phones: person.phones.map((p) => p.number),
        emails: person.emails.map((e) => e.email),
        mailingAddress: person.mailingAddress ?? null,
        occupation: null,
        isPrimary: false,
        source: "batchdata",
      });
    }
    console.log(`[DualSkip] Merged ${label}: +${bd.phones.length} phones, +${bd.emails.length} emails`);
  };

  // ── Merge BatchData results (property address) ──────────────────
  if (bdResult) mergeBatchData(bdResult, "BD Property");

  // ── Merge BatchData results (mailing address) ──────────────────
  if (bdMailResult) mergeBatchData(bdMailResult, "BD Mailing");

  // ── Sort: highest confidence first, DNC numbers last ───────────
  allPhones.sort((a, b) => {
    if (a.dnc && !b.dnc) return 1;
    if (!a.dnc && b.dnc) return -1;
    return b.confidence - a.confidence;
  });

  // Prefer deliverable emails first
  allEmails.sort((a, b) => {
    if (a.deliverable && !b.deliverable) return -1;
    if (!a.deliverable && b.deliverable) return 1;
    return 0;
  });

  // Cap results
  const phones = allPhones.slice(0, MAX_PHONES);
  const emails = allEmails.slice(0, MAX_EMAILS);

  // Pick best primary (highest confidence, not DNC)
  const bestPhone = phones.find((p) => !p.dnc) ?? phones[0] ?? null;
  const bestEmail = emails.find((e) => e.deliverable) ?? emails[0] ?? null;

  const result: SkipTraceResult = {
    phones,
    emails,
    persons: allPersons,
    primaryPhone: bestPhone?.number ?? null,
    primaryEmail: bestEmail?.email ?? null,
    isLitigator,
    hasDncNumbers,
    providers,
    prSuccess: !!prResult || !!prCountyResult,
    bdSuccess: !!bdResult || !!bdMailResult,
    totalPhoneCount: phones.length,
    totalEmailCount: emails.length,
    _debugSources: {
      prPersons: prResult ? { phones: prResult.phones.length, emails: prResult.emails.length, persons: prResult.persons.length } : "null/error",
      prCounty: prCountyResult ? { phones: prCountyResult.phones.length, emails: prCountyResult.emails.length, phoneNumbers: prCountyResult.phones.map(p => p.number) } : "null/error",
      bdProperty: bdResult ? { phones: bdResult.phones.length, emails: bdResult.emails.length, persons: bdResult.persons.length } : "null/error",
      bdMailing: bdMailResult ? { phones: bdMailResult.phones.length, emails: bdMailResult.emails.length } : "null/error",
      hasBDToken: !!process.env.BATCHDATA_API_TOKEN,
      inputAddress: property.address,
      inputMailing: property.mailingAddress,
    },
  };

  console.log(`[DualSkip] Result: ${phones.length} phones, ${emails.length} emails, providers: [${providers.join(",")}], litigator: ${isLitigator}, DNC: ${hasDncNumbers} (${Date.now() - t0}ms)`);
  return result;
}

// ── PropertyRadar Persons Fetch ──────────────────────────────────────

interface PRPersonsResult {
  phones: UnifiedPhone[];
  emails: UnifiedEmail[];
  persons: UnifiedPerson[];
}

async function fetchPRPersons(apiKey: string, radarId: string): Promise<PRPersonsResult> {
  const personsUrl = `${PR_API_BASE}/${radarId}/persons?Purchase=1&Fields=default`;
  const res = await fetch(personsUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`PR Persons API returned ${res.status}`);
  }

  const data = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawPersons: any[] = data.results ?? data ?? [];
  console.log(`[DualSkip/PR] Persons response for radarId ${radarId}: ${rawPersons.length} persons found`,
    rawPersons.length > 0 ? JSON.stringify({
      personNames: rawPersons.map((p: Record<string, unknown>) => p.FirstName ?? p.EntityName ?? p.Name ?? "?"),
      hasPhoneArrays: rawPersons.map((p: Record<string, unknown>) => Array.isArray(p.Phone) ? (p.Phone as unknown[]).length : typeof p.Phone),
      hasEmailArrays: rawPersons.map((p: Record<string, unknown>) => Array.isArray(p.Email) ? (p.Email as unknown[]).length : typeof p.Email),
    }).slice(0, 500) : "(empty)",
  );

  const phones: UnifiedPhone[] = [];
  const emails: UnifiedEmail[] = [];
  const persons: UnifiedPerson[] = [];
  const seenPhones = new Set<string>();
  const seenEmails = new Set<string>();

  for (const person of rawPersons) {
    const name = [person.FirstName, person.LastName].filter(Boolean).join(" ")
      || person.EntityName || person.Name || "Unknown";

    const personPhoneNumbers: string[] = [];
    // PR Phone: array of { href, linktext, phoneType, status, source }
    if (Array.isArray(person.Phone)) {
      for (const ph of person.Phone) {
        const num = ph?.linktext ?? ph?.href?.replace("tel:", "");
        if (!num || typeof num !== "string" || num.length < 7) continue;
        if (num.startsWith("/") || /v\d+\//.test(num) || num.includes("persons")) continue;
        const norm = normalizePhone(num);
        if (norm.length < 10) continue;
        if (seenPhones.has(norm)) continue;
        seenPhones.add(norm);

        personPhoneNumbers.push(num);
        phones.push({
          number: num,
          normalized: norm,
          lineType: classifyPRPhoneType(ph?.phoneType),
          confidence: ph?.status === "Connected" ? 85 : 65,
          dnc: false,
          source: "propertyradar",
        });
      }
    } else if (typeof person.Phone === "string" && person.Phone.length >= 7) {
      const norm = normalizePhone(person.Phone);
      if (!seenPhones.has(norm)) {
        seenPhones.add(norm);
        personPhoneNumbers.push(person.Phone);
        phones.push({
          number: person.Phone,
          normalized: norm,
          lineType: "unknown",
          confidence: 60,
          dnc: false,
          source: "propertyradar",
        });
      }
    }

    const personEmailAddresses: string[] = [];
    // PR Email: array of { href, linktext, status, source }
    if (Array.isArray(person.Email)) {
      for (const em of person.Email) {
        const addr = em?.linktext ?? em?.href?.replace("mailto:", "");
        if (!addr || typeof addr !== "string" || !addr.includes("@")) continue;
        const norm = addr.toLowerCase().trim();
        if (seenEmails.has(norm)) continue;
        seenEmails.add(norm);
        personEmailAddresses.push(addr);
        emails.push({ email: addr, deliverable: true, source: "propertyradar" });
      }
    } else if (typeof person.Email === "string" && person.Email.includes("@")) {
      const norm = person.Email.toLowerCase().trim();
      if (!seenEmails.has(norm)) {
        seenEmails.add(norm);
        personEmailAddresses.push(person.Email);
        emails.push({ email: person.Email, deliverable: true, source: "propertyradar" });
      }
    }

    let mailingAddr: string | null = null;
    if (Array.isArray(person.MailAddress) && person.MailAddress.length > 0) {
      mailingAddr = person.MailAddress[0]?.Address ?? null;
    } else if (typeof person.MailAddress === "string") {
      mailingAddr = person.MailAddress;
    }

    persons.push({
      name,
      role: person.OwnershipRole ?? person.PersonType ?? "Owner",
      age: person.Age ?? null,
      phones: personPhoneNumbers,
      emails: personEmailAddresses,
      mailingAddress: mailingAddr,
      occupation: person.Occupation ?? null,
      isPrimary: person.isPrimaryContact === 1,
      source: "propertyradar",
    });
  }

  return { phones, emails, persons };
}

function classifyPRPhoneType(raw: string | undefined | null): UnifiedPhone["lineType"] {
  if (!raw) return "unknown";
  const lower = raw.toLowerCase();
  if (lower.includes("mobile") || lower.includes("wireless") || lower.includes("cell")) return "mobile";
  if (lower.includes("landline") || lower.includes("land")) return "landline";
  if (lower.includes("voip")) return "voip";
  return "unknown";
}

// ── BatchData Fetch ──────────────────────────────────────────────────

async function fetchBatchData(
  property: SkipTracePropertyInput,
): Promise<{
  phones: BatchDataPhone[];
  emails: BatchDataEmail[];
  persons: { firstName?: string; lastName?: string; fullName?: string; phones: BatchDataPhone[]; emails: BatchDataEmail[]; mailingAddress?: string }[];
  isLitigator: boolean;
  hasDncNumbers: boolean;
} | null> {
  const address = property.address ?? "";
  if (!address || address === "Unknown") return null;

  // Parse street from full address (take first comma-separated part)
  const parts = address.split(",").map((s) => s.trim());
  const street = parts[0] ?? address;
  const city = property.city ?? parts[1] ?? "";
  const state = property.state ?? parts[2]?.replace(/\d/g, "").trim() ?? "";
  const zip = property.zip ?? "";

  if (!street || !city || !state) {
    console.log("[DualSkip/BD] Insufficient address for BatchData:", { street, city, state, rawAddress: address });
    return null;
  }

  console.log(`[DualSkip/BD] Calling BatchData with: street="${street}", city="${city}", state="${state}", zip="${zip}"`);
  const result = await skipTraceByAddress(street, city, state, zip || undefined);
  console.log(`[DualSkip/BD] BatchData returned: success=${result.success}, phones=${result.phones.length}, emails=${result.emails.length}, persons=${result.persons.length}, error=${result.error ?? "none"}`);

  if (!result.success && result.phones.length === 0 && result.emails.length === 0) {
    return null;
  }

  return {
    phones: result.phones,
    emails: result.emails,
    persons: result.persons,
    isLitigator: result.isLitigator,
    hasDncNumbers: result.hasDncNumbers,
  };
}

// ── PropertyRadar County Phone/Email Fetch ──────────────────────────

/**
 * Fetch Phone1, Phone2, Email directly from the PropertyRadar property record.
 * These are county-level records that often have phone data even for LLC-owned properties.
 */
async function fetchPRCountyPhones(
  apiKey: string,
  radarId: string,
): Promise<{ phones: UnifiedPhone[]; emails: UnifiedEmail[] }> {
  const url = `${PR_API_BASE}/${radarId}?Fields=Phone1,Phone2,Email,PhoneAvailability,EmailAvailability&Purchase=1`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`PR County phones API returned ${res.status}`);
  }

  const data = await res.json();
  const results = data.results ?? data ?? [];
  const prop = Array.isArray(results) ? results[0] : results;
  console.log(`[DualSkip/PR County] Raw response keys: ${prop ? Object.keys(prop).join(", ") : "null"}`,
    `Phone1=${prop?.Phone1 ?? "N/A"}, Phone2=${prop?.Phone2 ?? "N/A"}, Email=${prop?.Email ?? "N/A"}, PhoneAvail=${prop?.PhoneAvailability ?? "N/A"}`);

  const phones: UnifiedPhone[] = [];
  const emails: UnifiedEmail[] = [];

  // Extract Phone1 and Phone2 from county records
  for (const fieldName of ["Phone1", "Phone2"] as const) {
    const raw = prop?.[fieldName];
    if (raw && typeof raw === "string" && raw.length >= 7) {
      const norm = raw.replace(/\D/g, "").slice(-10);
      if (norm.length >= 10) {
        phones.push({
          number: raw,
          normalized: norm,
          lineType: "unknown",
          confidence: 50, // County records — lower confidence
          dnc: false,
          source: "propertyradar",
        });
      }
    }
  }

  // Extract Email from county records
  const rawEmail = prop?.Email;
  if (rawEmail && typeof rawEmail === "string" && rawEmail.includes("@")) {
    emails.push({
      email: rawEmail,
      deliverable: true,
      source: "propertyradar",
    });
  }

  console.log(`[DualSkip/PR County] radarId=${radarId}: ${phones.length} phones, ${emails.length} emails`,
    phones.length > 0 ? `(${phones.map(p => p.number).join(", ")})` : "(none)");

  return { phones, emails };
}

// ── BatchData Mailing Address Fetch ─────────────────────────────────

/**
 * Try BatchData with the mailing address instead of the property address.
 * Only fires if mailing address is different from property address.
 */
async function fetchBatchDataMailing(
  property: SkipTracePropertyInput,
): Promise<{
  phones: BatchDataPhone[];
  emails: BatchDataEmail[];
  persons: { firstName?: string; lastName?: string; fullName?: string; phones: BatchDataPhone[]; emails: BatchDataEmail[]; mailingAddress?: string }[];
  isLitigator: boolean;
  hasDncNumbers: boolean;
} | null> {
  const mailStreet = property.mailingAddress;
  const mailCity = property.mailingCity;
  const mailState = property.mailingState;
  const mailZip = property.mailingZip;

  if (!mailStreet || !mailCity || !mailState) {
    console.log("[DualSkip/BD Mailing] No mailing address available, skipping");
    return null;
  }

  // Don't duplicate if mailing address is same as property address
  const propStreet = (property.address ?? "").split(",")[0]?.trim().toUpperCase();
  if (mailStreet.toUpperCase().trim() === propStreet) {
    console.log("[DualSkip/BD Mailing] Mailing address same as property, skipping");
    return null;
  }

  // Skip PO Boxes — BatchData can't skip-trace PO Boxes
  if (/^\s*p\.?\s*o\.?\s*box/i.test(mailStreet)) {
    console.log("[DualSkip/BD Mailing] PO Box detected, skipping BatchData for mailing address");
    return null;
  }

  console.log(`[DualSkip/BD Mailing] Calling BatchData with mailing: street="${mailStreet}", city="${mailCity}", state="${mailState}", zip="${mailZip}"`);
  const result = await skipTraceByAddress(mailStreet, mailCity, mailState, mailZip || undefined);
  console.log(`[DualSkip/BD Mailing] BatchData mailing returned: success=${result.success}, phones=${result.phones.length}, emails=${result.emails.length}, persons=${result.persons.length}`);

  if (!result.success && result.phones.length === 0 && result.emails.length === 0) {
    return null;
  }

  return {
    phones: result.phones,
    emails: result.emails,
    persons: result.persons,
    isLitigator: result.isLitigator,
    hasDncNumbers: result.hasDncNumbers,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "").slice(-10);
}

/**
 * Convert a SkipTraceResult into the owner_flags shape for DB storage.
 */
export function skipTraceResultToOwnerFlags(result: SkipTraceResult): Record<string, unknown> {
  return {
    skip_traced: true,
    skip_trace_date: new Date().toISOString(),
    skip_trace_providers: result.providers,
    all_phones: result.phones.map((p) => ({
      number: p.number,
      lineType: p.lineType,
      confidence: p.confidence,
      dnc: p.dnc,
      carrier: p.carrier,
      source: p.source,
    })),
    all_emails: result.emails.map((e) => ({
      email: e.email,
      deliverable: e.deliverable,
      source: e.source,
    })),
    persons: result.persons.map((p) => ({
      name: p.name,
      relation: p.role,
      age: p.age,
      phones: p.phones,
      emails: p.emails,
      mailing_address: p.mailingAddress,
      occupation: p.occupation,
      is_primary: p.isPrimary,
      source: p.source,
    })),
    is_litigator: result.isLitigator,
    has_dnc_numbers: result.hasDncNumbers,
    phone_count: result.totalPhoneCount,
    email_count: result.totalEmailCount,
  };
}
