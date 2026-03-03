/**
 * BatchData Skip-Trace API Client
 *
 * Charter v3.1 — Dual-source skip-trace provider alongside PropertyRadar.
 * Returns 5-6 phone numbers + emails per property with confidence scores,
 * DNC status, litigator flags, and line type classification.
 *
 * Endpoint: POST https://api.batchdata.com/api/v1/property/skip-trace
 * Auth: Bearer token via BATCHDATA_API_TOKEN env var.
 * Pricing: $0.07/match pay-as-you-go.
 */

const BATCHDATA_BASE = "https://api.batchdata.com/api/v1";

// ── Error Class ──────────────────────────────────────────────────────

export class BatchDataApiError extends Error {
  status: number;
  endpoint: string;
  constructor(message: string, status: number, endpoint: string) {
    super(message);
    this.name = "BatchDataApiError";
    this.status = status;
    this.endpoint = endpoint;
  }
}

// ── Types ────────────────────────────────────────────────────────────

export interface BatchDataPhone {
  number: string;
  lineType: "mobile" | "landline" | "voip" | "unknown";
  confidence: number;
  dnc: boolean;
  carrier?: string;
  source: "batchdata";
}

export interface BatchDataEmail {
  email: string;
  deliverable: boolean;
  source: "batchdata";
}

export interface BatchDataPerson {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  phones: BatchDataPhone[];
  emails: BatchDataEmail[];
  mailingAddress?: string;
  isLitigator?: boolean;
}

export interface BatchDataSkipTraceResult {
  success: boolean;
  persons: BatchDataPerson[];
  phones: BatchDataPhone[];
  emails: BatchDataEmail[];
  isLitigator: boolean;
  hasDncNumbers: boolean;
  error?: string;
}

// ── Core Client ──────────────────────────────────────────────────────

function getApiToken(): string {
  const token = process.env.BATCHDATA_API_TOKEN;
  if (!token) throw new BatchDataApiError("BATCHDATA_API_TOKEN not configured", 0, "init");
  return token;
}

/**
 * Skip-trace a single property by address.
 * Returns persons with phones, emails, DNC status, and litigator flags.
 */
export async function skipTraceByAddress(
  street: string,
  city: string,
  state: string,
  zip?: string,
): Promise<BatchDataSkipTraceResult> {
  const token = getApiToken();
  const endpoint = "/property/skip-trace";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requestBody: Record<string, any> = {
    requests: [
      {
        propertyAddress: {
          street,
          city,
          state,
          ...(zip ? { zip } : {}),
        },
      },
    ],
  };

  try {
    const res = await fetch(`${BATCHDATA_BASE}${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[BatchData] Skip-trace HTTP ${res.status}:`, body.slice(0, 500));
      throw new BatchDataApiError(
        `BatchData ${endpoint} returned ${res.status}: ${body.slice(0, 300)}`,
        res.status,
        endpoint,
      );
    }

    const data = await res.json();
    console.log(`[BatchData] Raw response for ${street}, ${city}, ${state}:`,
      JSON.stringify({
        hasResults: !!data?.results,
        resultsType: Array.isArray(data?.results) ? "array" : typeof data?.results,
        resultsLength: Array.isArray(data?.results) ? data.results.length : 0,
        firstPersonKeys: Array.isArray(data?.results) && data.results[0]?.persons?.[0]
          ? Object.keys(data.results[0].persons[0]).slice(0, 15)
          : data?.results?.persons?.[0] ? Object.keys(data.results.persons[0]).slice(0, 15) : [],
        firstPersonPhoneField: Array.isArray(data?.results) && data.results[0]?.persons?.[0]
          ? (data.results[0].persons[0].phoneNumbers ?? data.results[0].persons[0].phones ?? data.results[0].persons[0].phone_numbers ?? "NONE")
          : "N/A",
      }).slice(0, 1000),
    );
    return parseSkipTraceResponse(data);
  } catch (err) {
    if (err instanceof BatchDataApiError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    console.error("[BatchData] Skip-trace error:", message);
    return {
      success: false,
      persons: [],
      phones: [],
      emails: [],
      isLitigator: false,
      hasDncNumbers: false,
      error: message,
    };
  }
}

// ── Response Parser ──────────────────────────────────────────────────

function normalizeLineType(raw: string | undefined | null): BatchDataPhone["lineType"] {
  if (!raw) return "unknown";
  const lower = raw.toLowerCase();
  if (lower.includes("mobile") || lower.includes("wireless") || lower.includes("cell")) return "mobile";
  if (lower.includes("landline") || lower.includes("land")) return "landline";
  if (lower.includes("voip")) return "voip";
  return "unknown";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseSkipTraceResponse(data: any): BatchDataSkipTraceResult {
  const allPhones: BatchDataPhone[] = [];
  const allEmails: BatchDataEmail[] = [];
  const persons: BatchDataPerson[] = [];
  let isLitigator = false;
  let hasDncNumbers = false;

  // BatchData response can have different shapes; handle both
  // Shape 1: { results: { persons: [...] } }
  // Shape 2: { results: [{ persons: [...] }] }
  const results = data?.results;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let personsList: any[] = [];

  if (Array.isArray(results)) {
    // Array of results (one per request)
    for (const r of results) {
      if (r?.persons && Array.isArray(r.persons)) {
        personsList.push(...r.persons);
      }
      if (r?.isLitigator || r?.litigator) isLitigator = true;
    }
  } else if (results?.persons && Array.isArray(results.persons)) {
    personsList = results.persons;
    if (results.isLitigator || results.litigator) isLitigator = true;
  }

  const seenPhones = new Set<string>();
  const seenEmails = new Set<string>();

  for (const person of personsList) {
    const firstName = person.firstName ?? person.first_name ?? "";
    const lastName = person.lastName ?? person.last_name ?? "";
    const fullName = person.fullName ?? person.full_name
      ?? ([firstName, lastName].filter(Boolean).join(" ") || "Unknown");

    const personPhones: BatchDataPhone[] = [];
    const personEmails: BatchDataEmail[] = [];

    // Parse phone numbers (array of objects or strings)
    const rawPhones = person.phoneNumbers ?? person.phones ?? person.phone_numbers ?? [];
    for (const ph of Array.isArray(rawPhones) ? rawPhones : []) {
      const num = typeof ph === "string" ? ph : (ph?.number ?? ph?.phoneNumber ?? ph?.phone ?? "");
      const normalized = num.replace(/\D/g, "").slice(-10);
      if (normalized.length < 7 || seenPhones.has(normalized)) continue;
      seenPhones.add(normalized);

      const isDnc = ph?.dnc === true || ph?.doNotCall === true || ph?.dncFlag === true;
      if (isDnc) hasDncNumbers = true;

      const phone: BatchDataPhone = {
        number: num,
        lineType: normalizeLineType(ph?.lineType ?? ph?.line_type ?? ph?.type),
        confidence: typeof ph?.confidence === "number" ? ph.confidence
          : typeof ph?.score === "number" ? ph.score : 70,
        dnc: isDnc,
        carrier: ph?.carrier ?? ph?.carrierName ?? undefined,
        source: "batchdata",
      };
      personPhones.push(phone);
      allPhones.push(phone);
    }

    // Parse emails (array of objects or strings)
    const rawEmails = person.emails ?? person.emailAddresses ?? person.email_addresses ?? [];
    for (const em of Array.isArray(rawEmails) ? rawEmails : []) {
      const addr = typeof em === "string" ? em : (em?.email ?? em?.address ?? em?.emailAddress ?? "");
      const lower = addr.toLowerCase().trim();
      if (!lower.includes("@") || seenEmails.has(lower)) continue;
      seenEmails.add(lower);

      const email: BatchDataEmail = {
        email: addr,
        deliverable: em?.deliverable !== false && em?.status !== "undeliverable",
        source: "batchdata",
      };
      personEmails.push(email);
      allEmails.push(email);
    }

    // Check litigator at person level too
    if (person.isLitigator || person.litigator) isLitigator = true;

    persons.push({
      firstName,
      lastName,
      fullName,
      phones: personPhones,
      emails: personEmails,
      mailingAddress: person.mailingAddress ?? person.mailing_address ?? undefined,
      isLitigator: person.isLitigator ?? person.litigator ?? false,
    });
  }

  return {
    success: allPhones.length > 0 || allEmails.length > 0,
    persons,
    phones: allPhones,
    emails: allEmails,
    isLitigator,
    hasDncNumbers,
  };
}
