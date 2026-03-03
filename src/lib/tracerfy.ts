/**
 * Tracerfy Skip-Trace API Client
 *
 * Async batch API: POST a 1-row CSV → poll for results (typically 30-60s for 1 record).
 * Returns up to 5 phones + 5 emails per record at $0.02/lookup.
 *
 * API docs: https://tracerfy.com/skip-tracing-api
 * Base URL: https://tracerfy.com/v1/api
 */

const TRACERFY_BASE = "https://tracerfy.com/v1/api";
const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_MS = 90_000; // 90 seconds max wait

// ── Types ────────────────────────────────────────────────────────────

export interface TracerfyPhone {
  number: string;
  lineType: "mobile" | "landline" | "unknown";
}

export interface TracerfyResult {
  success: boolean;
  phones: TracerfyPhone[];
  emails: string[];
  error?: string;
}

// ── Raw API response shape ───────────────────────────────────────────

interface TracerfyQueueResponse {
  message?: string;
  queue_id: number;
  status: string;
  created_at: string;
}

interface TracerfyRecord {
  primary_phone?: string;
  mobile_1?: string;
  mobile_2?: string;
  mobile_3?: string;
  mobile_4?: string;
  mobile_5?: string;
  landline_1?: string;
  landline_2?: string;
  landline_3?: string;
  email_1?: string;
  email_2?: string;
  email_3?: string;
  email_4?: string;
  email_5?: string;
  [key: string]: unknown;
}

// ── Main Entry ───────────────────────────────────────────────────────

export async function tracerfySkipTrace(
  firstName: string,
  lastName: string,
  street: string,
  city: string,
  state: string,
  mailAddress?: string,
  mailCity?: string,
  mailState?: string,
): Promise<TracerfyResult> {
  const apiKey = process.env.TRACERFY_API_KEY;
  if (!apiKey) {
    console.warn("[Tracerfy] No TRACERFY_API_KEY configured, skipping");
    return { success: false, phones: [], emails: [], error: "No API key" };
  }

  if (!street || !city || !state) {
    console.log("[Tracerfy] Insufficient address, skipping");
    return { success: false, phones: [], emails: [], error: "Insufficient address" };
  }

  const t0 = Date.now();

  try {
    // ── 1. Build single-row CSV ───────────────────────────────────────
    const csvHeader = "first_name,last_name,address,city,state,mail_address,mail_city,mail_state";
    const csvRow = [
      csvEscape(firstName),
      csvEscape(lastName),
      csvEscape(street),
      csvEscape(city),
      csvEscape(state),
      csvEscape(mailAddress ?? ""),
      csvEscape(mailCity ?? ""),
      csvEscape(mailState ?? ""),
    ].join(",");
    const csvContent = `${csvHeader}\n${csvRow}`;

    console.log(`[Tracerfy] Submitting trace for "${firstName} ${lastName}" at "${street}, ${city}, ${state}"`);

    // ── 2. POST to /trace/ ────────────────────────────────────────────
    const formData = new FormData();
    formData.append("address_column", "address");
    formData.append("city_column", "city");
    formData.append("state_column", "state");
    formData.append("first_name_column", "first_name");
    formData.append("last_name_column", "last_name");
    formData.append("mail_address_column", "mail_address");
    formData.append("mail_city_column", "mail_city");
    formData.append("mail_state_column", "mail_state");
    formData.append(
      "csv_file",
      new Blob([csvContent], { type: "text/csv" }),
      "skip-trace.csv",
    );

    const postRes = await fetch(`${TRACERFY_BASE}/trace/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!postRes.ok) {
      const body = await postRes.text().catch(() => "");
      console.error(`[Tracerfy] POST /trace/ returned ${postRes.status}: ${body}`);
      return { success: false, phones: [], emails: [], error: `HTTP ${postRes.status}` };
    }

    const queueData: TracerfyQueueResponse = await postRes.json();
    const queueId = queueData.queue_id;
    console.log(`[Tracerfy] Queue created: id=${queueId}, status=${queueData.status}`);

    // ── 3. Poll for results ───────────────────────────────────────────
    const records = await pollForResults(apiKey, queueId, t0);

    if (!records || records.length === 0) {
      console.warn(`[Tracerfy] No results returned for queue ${queueId} (${Date.now() - t0}ms)`);
      return { success: false, phones: [], emails: [], error: "No results" };
    }

    // ── 4. Parse first record ─────────────────────────────────────────
    const rec = records[0];
    const phones = extractPhones(rec);
    const emails = extractEmails(rec);

    console.log(`[Tracerfy] Success: ${phones.length} phones, ${emails.length} emails (${Date.now() - t0}ms)`);

    return { success: true, phones, emails };
  } catch (err) {
    console.error("[Tracerfy] Error:", err);
    return {
      success: false,
      phones: [],
      emails: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Poll loop ────────────────────────────────────────────────────────

async function pollForResults(
  apiKey: string,
  queueId: number,
  startTime: number,
): Promise<TracerfyRecord[] | null> {
  const url = `${TRACERFY_BASE}/queue/${queueId}`;

  while (Date.now() - startTime < MAX_POLL_MS) {
    await sleep(POLL_INTERVAL_MS);

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        console.warn(`[Tracerfy] Poll GET returned ${res.status}, retrying...`);
        continue;
      }

      const data = await res.json();

      // API returns an array of records when complete, or a status object while pending
      if (Array.isArray(data) && data.length > 0) {
        return data as TracerfyRecord[];
      }

      // Check for status object: { status: "pending" | "processing" | "completed" }
      if (data && typeof data === "object" && !Array.isArray(data)) {
        const status = (data as Record<string, unknown>).status;
        if (status === "completed") {
          // Results might be in a nested field
          const results = (data as Record<string, unknown>).results;
          if (Array.isArray(results) && results.length > 0) {
            return results as TracerfyRecord[];
          }
        }
        console.log(`[Tracerfy] Queue ${queueId} status: ${status} (${Date.now() - startTime}ms elapsed)`);
      }
    } catch (err) {
      console.warn(`[Tracerfy] Poll error (will retry):`, err);
    }
  }

  console.warn(`[Tracerfy] Timed out after ${MAX_POLL_MS}ms for queue ${queueId}`);
  return null;
}

// ── Phone extraction ─────────────────────────────────────────────────

function extractPhones(rec: TracerfyRecord): TracerfyPhone[] {
  const phones: TracerfyPhone[] = [];
  const seen = new Set<string>();

  // Primary phone
  addPhone(rec.primary_phone, "unknown", phones, seen);

  // Mobile phones (1-5)
  for (let i = 1; i <= 5; i++) {
    addPhone(rec[`mobile_${i}`] as string | undefined, "mobile", phones, seen);
  }

  // Landline phones (1-3)
  for (let i = 1; i <= 3; i++) {
    addPhone(rec[`landline_${i}`] as string | undefined, "landline", phones, seen);
  }

  return phones;
}

function addPhone(
  raw: string | undefined | null,
  lineType: TracerfyPhone["lineType"],
  phones: TracerfyPhone[],
  seen: Set<string>,
): void {
  if (!raw || typeof raw !== "string") return;
  const cleaned = raw.replace(/\D/g, "");
  const norm = cleaned.slice(-10);
  if (norm.length < 10) return;
  if (seen.has(norm)) return;
  seen.add(norm);

  // If primary_phone matches a mobile or landline, classify it properly
  phones.push({ number: raw, lineType });
}

// ── Email extraction ─────────────────────────────────────────────────

function extractEmails(rec: TracerfyRecord): string[] {
  const emails: string[] = [];
  const seen = new Set<string>();

  for (let i = 1; i <= 5; i++) {
    const email = rec[`email_${i}`];
    if (!email || typeof email !== "string" || !email.includes("@")) continue;
    const norm = email.toLowerCase().trim();
    if (seen.has(norm)) continue;
    seen.add(norm);
    emails.push(email);
  }

  return emails;
}

// ── Helpers ──────────────────────────────────────────────────────────

function csvEscape(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
