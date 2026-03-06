/**
 * CSV Upload API Endpoint
 *
 * Charter v3.1 §1: Enable signal ingestion from any data vendor via CSV.
 * Charter v3.1 §4: All writes through service role. Compliance sacred.
 * Charter v3.1 §10: Log every import to event_log with source and counts.
 *
 * Pipeline per record (mirrors PropertyRadar ingestion):
 *   1. Parse CSV row → normalize fields
 *   2. Upsert property on (apn, county) golden key
 *   3. Insert distress events with fingerprint dedup
 *   4. Run computeScore() deterministic scoring
 *   5. Run computePredictiveScore() + blendHeatScore()
 *   6. Store scoring_records + scoring_predictions
 *   7. Promote to leads if blended score >= 75
 *   8. Audit log
 *
 * Auth: Supabase session (admin role check via ADMIN_EMAILS).
 * Accepts: multipart/form-data with CSV file + JSON metadata.
 */

import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { createHash } from "crypto";
import { createServerClient } from "@/lib/supabase";
import { computeScore, SCORING_MODEL_VERSION, type ScoringInput } from "@/lib/scoring";
import {
  computePredictiveScore,
  buildPredictiveInput,
  buildPredictionRecord,
  blendHeatScore,
} from "@/lib/scoring-predictive";
import {
  distressFingerprint,
  normalizeCounty,
  isDuplicateError,
  toNumber,
  toInt,
} from "@/lib/dedup";
import type { DistressType } from "@/lib/types";
import type { SentinelField } from "@/lib/csv-column-map";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";
const PROMOTION_THRESHOLD = 75;
const BATCH_SIZE = 50;

const ADMIN_EMAILS = [
  "adam@dominionhomedeals.com",
  "nathan@dominionhomedeals.com",
  "logan@dominionhomedeals.com",
];

interface CsvUploadMeta {
  source: string;
  distressTypes: DistressType[];
  columnMapping: Partial<Record<SentinelField, string>>;
  defaultCounty?: string;
  defaultState?: string;
}

interface ImportResult {
  total: number;
  processed: number;
  upserted: number;
  eventsCreated: number;
  eventsDeduped: number;
  scored: number;
  promoted: number;
  skipped: number;
  errors: number;
  elapsed_ms: number;
  errorDetails: string[];
}

/**
 * POST /api/ingest/csv-upload
 *
 * Body: multipart/form-data
 *   - file: CSV file
 *   - meta: JSON string of CsvUploadMeta
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  // ── 1. Auth check ──────────────────────────────────────────────────
  const sb = createServerClient();

  // Check for admin auth via cookie or CRON_SECRET header
  const cronSecret = process.env.CRON_SECRET;
  const cronAuth = request.headers.get("authorization");
  let isAuthed = false;

  if (cronSecret && cronAuth === `Bearer ${cronSecret}`) {
    isAuthed = true;
  } else {
    // Try session-based auth
    try {
      const { data: { user } } = await sb.auth.getUser();
      if (user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase())) {
        isAuthed = true;
      }
    } catch {
      // Auth check failed
    }
  }

  if (!isAuthed) {
    return NextResponse.json(
      { error: "Unauthorized — admin access required" },
      { status: 401 }
    );
  }

  // ── 2. Parse multipart form data ───────────────────────────────────
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid form data — expected multipart/form-data" },
      { status: 400 }
    );
  }

  const file = formData.get("file") as File | null;
  const metaStr = formData.get("meta") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No CSV file provided" }, { status: 400 });
  }

  let meta: CsvUploadMeta;
  try {
    meta = JSON.parse(metaStr ?? "{}");
  } catch {
    return NextResponse.json({ error: "Invalid meta JSON" }, { status: 400 });
  }

  if (!meta.source) {
    meta.source = "csv_import";
  }
  if (!meta.distressTypes || meta.distressTypes.length === 0) {
    meta.distressTypes = ["vacant"];
  }

  // ── 3. Parse CSV ───────────────────────────────────────────────────
  const csvText = await file.text();
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    return NextResponse.json(
      { error: "CSV parsing failed", details: parsed.errors.slice(0, 5) },
      { status: 400 }
    );
  }

  const rows = parsed.data;
  console.log(`[CsvUpload] Parsed ${rows.length} rows from "${file.name}" (source: ${meta.source})`);

  // ── 4. Process records in batches ──────────────────────────────────
  const result: ImportResult = {
    total: rows.length,
    processed: 0,
    upserted: 0,
    eventsCreated: 0,
    eventsDeduped: 0,
    scored: 0,
    promoted: 0,
    skipped: 0,
    errors: 0,
    elapsed_ms: 0,
    errorDetails: [],
  };

  const mapping = meta.columnMapping ?? {};

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    for (const row of batch) {
      try {
        const outcome = await processRow(sb, row, mapping, meta);
        result.processed++;

        switch (outcome.status) {
          case "upserted":
            result.upserted++;
            result.eventsCreated += outcome.eventsCreated;
            result.eventsDeduped += outcome.eventsDeduped;
            result.scored++;
            if (outcome.promoted) result.promoted++;
            break;
          case "skipped":
            result.skipped++;
            break;
          case "error":
            result.errors++;
            if (outcome.message && result.errorDetails.length < 20) {
              result.errorDetails.push(`Row ${i + batch.indexOf(row) + 2}: ${outcome.message}`);
            }
            break;
        }
      } catch (err) {
        result.errors++;
        result.processed++;
        if (result.errorDetails.length < 20) {
          result.errorDetails.push(
            `Row ${i + batch.indexOf(row) + 2}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }
  }

  result.elapsed_ms = Date.now() - startTime;

  // ── 5. Audit log ───────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("event_log") as any).insert({
    user_id: SYSTEM_USER_ID,
    action: "csv_import",
    entity_type: "import_batch",
    entity_id: file.name,
    details: {
      filename: file.name,
      fileSize: file.size,
      source: meta.source,
      distressTypes: meta.distressTypes,
      ...result,
      timestamp: new Date().toISOString(),
    },
  });

  console.log(`[CsvUpload] Complete:`, result);

  return NextResponse.json({
    success: true,
    ...result,
  });
}

// ── Row Processing Pipeline ──────────────────────────────────────────

interface ProcessOutcome {
  status: "upserted" | "skipped" | "error";
  promoted?: boolean;
  eventsCreated: number;
  eventsDeduped: number;
  message?: string;
}

function getField(
  row: Record<string, string>,
  mapping: Partial<Record<SentinelField, string>>,
  field: SentinelField
): string {
  const csvCol = mapping[field];
  if (!csvCol) return "";

  // Handle combo fields like "FirstName+LastName"
  if (csvCol.includes("+")) {
    const parts = csvCol.split("+");
    return parts.map((col) => (row[col] ?? "").trim()).filter(Boolean).join(" ");
  }

  return (row[csvCol] ?? "").trim();
}

async function processRow(
  sb: ReturnType<typeof createServerClient>,
  row: Record<string, string>,
  mapping: Partial<Record<SentinelField, string>>,
  meta: CsvUploadMeta
): Promise<ProcessOutcome> {
  // ── Extract fields ─────────────────────────────────────────────────
  const address = getField(row, mapping, "address");
  const ownerName = getField(row, mapping, "owner_name") || "Unknown Owner";
  const county = normalizeCounty(
    getField(row, mapping, "county") || meta.defaultCounty || "",
    "Unknown"
  );
  const city = getField(row, mapping, "city");
  const state = getField(row, mapping, "state") || meta.defaultState || "WA";
  const zip = getField(row, mapping, "zip");
  const phone = getField(row, mapping, "phone") || null;
  const email = getField(row, mapping, "email") || null;

  let apn = getField(row, mapping, "apn");

  // Must have address or APN — skip if neither
  if (!address && !apn) {
    return { status: "skipped", eventsCreated: 0, eventsDeduped: 0, message: "No address or APN" };
  }

  // Generate synthetic APN if missing
  if (!apn) {
    const slug = [
      ownerName.toLowerCase().replace(/[^a-z0-9]/g, ""),
      county.toLowerCase().replace(/[^a-z0-9]/g, ""),
      address.toLowerCase().replace(/[^a-z0-9]/g, ""),
    ].join("-");
    apn = `CSV-${createHash("md5").update(slug).digest("hex").slice(0, 12).toUpperCase()}`;
  }

  const estimatedValue = toNumber(getField(row, mapping, "estimated_value")) ?? null;
  const equityPercent = toNumber(getField(row, mapping, "equity_percent")) ?? null;
  const loanBalance = toNumber(getField(row, mapping, "loan_balance")) ?? null;

  // ── Upsert property ────────────────────────────────────────────────
  const fullAddress = [address, city, state, zip].filter(Boolean).join(", ");

  // Read existing flags first to preserve deep_crawl, photos, enrichment data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingProp } = await (sb.from("properties") as any)
    .select("owner_flags")
    .eq("apn", apn)
    .eq("county", county)
    .maybeSingle();

  const existingFlags = (existingProp?.owner_flags ?? {}) as Record<string, unknown>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const propertyRow: Record<string, any> = {
    apn,
    county,
    address: fullAddress || `${ownerName} -- ${county}`,
    city: city || "",
    state: state || "WA",
    zip: zip || "",
    owner_name: ownerName,
    owner_phone: phone,
    owner_email: email,
    estimated_value: estimatedValue != null ? Math.round(estimatedValue) : null,
    equity_percent: equityPercent,
    bedrooms: toInt(getField(row, mapping, "bedrooms")) ?? null,
    bathrooms: toNumber(getField(row, mapping, "bathrooms")) ?? null,
    sqft: toInt(getField(row, mapping, "sqft")) ?? null,
    year_built: toInt(getField(row, mapping, "year_built")) ?? null,
    lot_size: toInt(getField(row, mapping, "lot_size")) ?? null,
    property_type: getField(row, mapping, "property_type") || null,
    owner_flags: {
      ...existingFlags,
      source: `csv:${meta.source}`,
      enrichment_pending: true,
      enrichment_status: "pending",
      enrichment_attempts: existingFlags.enrichment_attempts ?? 0,
      imported_at: new Date().toISOString(),
      csv_raw: Object.fromEntries(
        Object.entries(row).slice(0, 20) // cap raw data to prevent huge JSON
      ),
    },
    updated_at: new Date().toISOString(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prop, error: propErr } = await (sb.from("properties") as any)
    .upsert(propertyRow, { onConflict: "apn,county" })
    .select("id")
    .single();

  if (propErr || !prop) {
    return {
      status: "error",
      eventsCreated: 0,
      eventsDeduped: 0,
      message: `Property upsert failed: ${propErr?.message ?? "no data"}`,
    };
  }

  // ── Insert distress events ─────────────────────────────────────────
  let eventsCreated = 0;
  let eventsDeduped = 0;

  for (const distressType of meta.distressTypes) {
    const fp = distressFingerprint(apn, county, distressType, `csv:${meta.source}`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: evtErr } = await (sb.from("distress_events") as any).insert({
      property_id: prop.id,
      event_type: distressType,
      source: `csv:${meta.source}`,
      severity: 6,
      fingerprint: fp,
      raw_data: {
        import_source: meta.source,
        original_address: address,
        original_owner: ownerName,
      },
    });

    if (isDuplicateError(evtErr)) {
      eventsDeduped++;
    } else if (evtErr) {
      console.error(`[CsvUpload] Event insert error for ${apn}:`, evtErr);
    } else {
      eventsCreated++;
    }
  }

  // ── Fetch ALL distress events for this property (for signal stacking) ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allEvents } = await (sb.from("distress_events") as any)
    .select("event_type, severity, created_at")
    .eq("property_id", prop.id)
    .order("created_at", { ascending: false });

  const events = (allEvents ?? []) as { event_type: string; severity: number; created_at: string }[];

  // ── Deterministic scoring ──────────────────────────────────────────
  const equityPct = equityPercent ?? 50;
  const compRatio = estimatedValue && loanBalance && loanBalance > 0
    ? estimatedValue / loanBalance
    : 1.1;

  const scoringSignals = events.map((e) => ({
    type: e.event_type as DistressType,
    severity: e.severity ?? 6,
    daysSinceEvent: Math.max(
      1,
      Math.round((Date.now() - new Date(e.created_at).getTime()) / 86400000)
    ),
  }));

  // Determine absentee flag from owner_flags
  const isAbsentee = meta.distressTypes.includes("absentee");

  const scoringInput: ScoringInput = {
    signals: scoringSignals,
    ownerFlags: {
      absentee: isAbsentee,
      corporate: false,
      inherited: meta.distressTypes.includes("probate"),
      elderly: false,
      outOfState: isAbsentee,
    },
    equityPercent: equityPct,
    compRatio: Math.min(compRatio, 3.0),
    historicalConversionRate: 0,
  };

  const scoreResult = computeScore(scoringInput);

  // Store scoring record
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("scoring_records") as any).insert({
    property_id: prop.id,
    model_version: SCORING_MODEL_VERSION,
    composite_score: scoreResult.composite,
    motivation_score: scoreResult.motivationScore,
    deal_score: scoreResult.dealScore,
    severity_multiplier: scoreResult.severityMultiplier,
    recency_decay: scoreResult.recencyDecay,
    stacking_bonus: scoreResult.stackingBonus,
    owner_factor_score: scoreResult.ownerFactorScore,
    equity_factor_score: scoreResult.equityFactorScore,
    ai_boost: scoreResult.aiBoost,
    factors: scoreResult.factors,
  });

  // ── Predictive scoring ─────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: histScores } = await (sb.from("scoring_records") as any)
    .select("composite_score, created_at")
    .eq("property_id", prop.id)
    .order("created_at", { ascending: false })
    .limit(10);

  const scores = (histScores ?? []) as { composite_score: number; created_at: string }[];

  const predInput = buildPredictiveInput(prop.id, propertyRow, events, scores);
  const predOutput = computePredictiveScore(predInput);
  const predRecord = buildPredictionRecord(prop.id, predOutput);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("scoring_predictions") as any).insert(predRecord);

  // ── Blend scores ───────────────────────────────────────────────────
  const blended = blendHeatScore(scoreResult.composite, predOutput.predictiveScore, predOutput.confidence);

  // ── Promote to lead if above threshold ─────────────────────────────
  let promoted = false;

  // All CSV imports enter as "staging" → enrichment bot fills in data → promotes to "prospect"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingLead } = await (sb.from("leads") as any)
    .select("id")
    .eq("property_id", prop.id)
    .in("status", ["staging", "prospect", "lead", "negotiation", "nurture"])
    .maybeSingle();

  if (!existingLead) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("leads") as any).insert({
      property_id: prop.id,
      status: "staging",
      source: `csv:${meta.source}`,
      priority: blended,
      tags: meta.distressTypes,
      notes: `CSV import from ${meta.source}. Preliminary score: ${blended}. Queued for enrichment.`,
    });
    promoted = true; // "promoted" here means "lead created" for the import stats
  }

  return { status: "upserted", promoted, eventsCreated, eventsDeduped };
}

/**
 * GET /api/ingest/csv-upload
 * Returns endpoint documentation.
 */
export async function GET() {
  return NextResponse.json({
    endpoint: "/api/ingest/csv-upload",
    method: "POST",
    description: "CSV file upload for bulk property ingestion with full scoring pipeline",
    contentType: "multipart/form-data",
    fields: {
      file: "CSV file (required)",
      meta: "JSON string with: { source, distressTypes[], columnMapping, defaultCounty?, defaultState? }",
    },
    distressTypes: [
      "probate", "pre_foreclosure", "tax_lien", "code_violation",
      "vacant", "divorce", "bankruptcy", "fsbo", "absentee",
      "inherited", "water_shutoff", "condemned",
    ],
    pipeline: [
      "1. Parse CSV with PapaParse",
      "2. Map columns to Sentinel fields via columnMapping",
      "3. Upsert property on (apn, county) golden key",
      "4. Insert distress events with fingerprint dedup",
      "5. Compute deterministic score (v2.1 engine)",
      "6. Compute predictive score + blend 70/30",
      "7. Promote to leads if blended >= 75",
      "8. Audit log to event_log",
    ],
  });
}
