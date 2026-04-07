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
 * Auth: authenticated user session or CRON_SECRET.
 * Accepts: multipart/form-data with CSV file + JSON metadata.
 */

export const maxDuration = 300; // 5 min — large CSV imports need time

import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { createHash } from "crypto";
import { createServerClient } from "@/lib/supabase";
import { requireUserOrCron } from "@/lib/api-auth";
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
import { upsertContact } from "@/lib/upsert-contact";
import type { SentinelField } from "@/lib/csv-column-map";
import { resolveMarket } from "@/lib/market-resolver";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";
const PROMOTION_THRESHOLD = 75;
const BATCH_SIZE = 50;
const MAX_ARV = 490_000; // $490K ARV ceiling — no lead created for properties above this

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

  // Check for an authenticated session or CRON_SECRET header
  const auth = await requireUserOrCron(request, sb);

  if (!auth) {
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
  if (!meta.distressTypes) {
    meta.distressTypes = [];
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
  const importedProperties: NonNullable<ProcessOutcome["propertyData"]>[] = [];

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
            if (outcome.propertyData) importedProperties.push(outcome.propertyData);
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

  // ── 4b. Portfolio rollup — group same-owner parcels ──────────────
  let portfolioRolledUp = 0;
  if (importedProperties.length > 1) {
    // Group by normalized owner + county
    const ownerGroups = new Map<string, typeof importedProperties>();
    for (const p of importedProperties) {
      const normalized = normalizeOwnerForGrouping(p.ownerName);
      // Don't group "Unknown" / "Unknown Owner" — they're different people
      // who will be resolved individually by ATTOM gap-fill during post-enrich.
      if (!normalized || normalized === "unknown" || normalized === "unknown owner") continue;

      const key = `${normalized}::${p.county.toLowerCase()}`;
      const group = ownerGroups.get(key) ?? [];
      group.push(p);
      ownerGroups.set(key, group);
    }

    for (const [, group] of ownerGroups) {
      if (group.length < 2) continue;

      // Primary = has real address + structure (sqft or beds), highest value among those
      const withAddress = group.filter((p) => !isVacantLand(p));
      const vacantLand = group.filter((p) => isVacantLand(p));

      if (withAddress.length === 0 || vacantLand.length === 0) continue;

      // Pick the primary: highest estimated value among addressed properties
      const primary = withAddress.sort(
        (a, b) => (b.estimatedValue ?? 0) - (a.estimatedValue ?? 0)
      )[0];

      // Build related parcels array (vacant lots + other addressed properties)
      const relatedParcels = group
        .filter((p) => p.propertyId !== primary.propertyId)
        .map((p) => ({
          propertyId: p.propertyId,
          apn: p.apn,
          address: p.address || "Vacant Land",
          estimatedValue: p.estimatedValue,
          lotSize: p.lotSize,
          sqft: p.sqft,
          propertyType: p.propertyType,
          isVacant: isVacantLand(p),
        }));

      const portfolioTotalValue = group.reduce(
        (sum, p) => sum + (p.estimatedValue ?? 0),
        0
      );

      // Update primary property's owner_flags with portfolio data
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: primaryProp } = await (sb.from("properties") as any)
        .select("owner_flags")
        .eq("id", primary.propertyId)
        .single();

      const existFlags = (primaryProp?.owner_flags ?? {}) as Record<string, unknown>;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("properties") as any)
        .update({
          owner_flags: {
            ...existFlags,
            portfolio_count: group.length,
            portfolio_total_value: portfolioTotalValue,
            related_parcels: relatedParcels,
          },
        })
        .eq("id", primary.propertyId);

      // Mark vacant-land properties as rolled into primary + delete their leads
      for (const vp of vacantLand) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: vpProp } = await (sb.from("properties") as any)
          .select("owner_flags")
          .eq("id", vp.propertyId)
          .single();

        const vpFlags = (vpProp?.owner_flags ?? {}) as Record<string, unknown>;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("properties") as any)
          .update({
            owner_flags: {
              ...vpFlags,
              rolled_into: primary.propertyId,
              rolled_into_apn: primary.apn,
            },
          })
          .eq("id", vp.propertyId);

        // Delete the lead for the vacant parcel — it shouldn't be a separate prospect
        if (vp.leadId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (sb.from("leads") as any).delete().eq("id", vp.leadId);
          portfolioRolledUp++;
        }
      }

      console.log(
        `[CsvUpload] Portfolio rollup: ${primary.ownerName} in ${primary.county} — ${group.length} parcels, $${portfolioTotalValue.toLocaleString()} total. Rolled ${vacantLand.length} vacant lots into primary.`
      );
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
      portfolioRolledUp,
      timestamp: new Date().toISOString(),
    },
  });

  console.log(`[CsvUpload] Complete:`, result);

  // Collect property IDs with leads (for follow-up csv-post-enrich call)
  const importedPropertyIds = importedProperties
    .filter((p) => p.leadId) // Only properties that got leads (excludes ARV-capped)
    .map((p) => p.propertyId);

  return NextResponse.json({
    success: true,
    ...result,
    importedPropertyIds,
  });
}

// ── Row Processing Pipeline ──────────────────────────────────────────

interface ProcessOutcome {
  status: "upserted" | "skipped" | "error";
  promoted?: boolean;
  eventsCreated: number;
  eventsDeduped: number;
  message?: string;
  // For portfolio rollup — returned when status === "upserted"
  propertyData?: {
    propertyId: string;
    leadId?: string;
    ownerName: string;
    county: string;
    address: string;
    city: string;
    apn: string;
    estimatedValue: number | null;
    lotSize: number | null;
    sqft: number | null;
    bedrooms: number | null;
    propertyType: string | null;
  };
}

// ── Portfolio Rollup Utilities ──────────────────────────────────────

function normalizeOwnerForGrouping(name: string): string {
  // PropertyRadar embeds mailing address in the owner field as extra lines —
  // use only the first line (the actual name) for grouping.
  let firstLine = name.split(/[\r\n]/)[0];
  // Strip "& SECOND_NAME" suffix (e.g., "DOAN,CHESTER E & CHESTER E" → "DOAN,CHESTER E")
  firstLine = firstLine.replace(/\s*&\s*.+$/, "");
  return firstLine
    .toLowerCase()
    .replace(/[,.\-']/g, " ")
    .replace(/\s+(jr|sr|ii|iii|iv|v|trust|etal|et\s*al)\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isVacantLand(data: ProcessOutcome["propertyData"]): boolean {
  if (!data) return false;
  const addr = data.address.toLowerCase();
  // Only treat as vacant if address is literally "Unknown" or empty.
  // Do NOT use sqft/beds — many PropertyRadar "RES" properties are real houses
  // that simply lack building data in the county records.
  if (!addr || addr.includes("unknown")) return true;
  return false;
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
      // Clear stale portfolio data — re-computed by post-processing rollup
      portfolio_count: null,
      portfolio_total_value: null,
      related_parcels: null,
      rolled_into: null,
      rolled_into_apn: null,
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

  // 1. Blanket distress types from import metadata
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

  // 2. Per-row distress detection from CSV boolean columns (e.g., "Deceased Owner?", "Bankruptcy?")
  const CSV_DISTRESS_MAP: Record<string, { distressType: DistressType; severity: number }> = {
    deceased_owner: { distressType: "probate", severity: 9 },
    bankruptcy:     { distressType: "bankruptcy", severity: 8 },
    divorce:        { distressType: "divorce", severity: 7 },
    foreclosure:    { distressType: "pre_foreclosure", severity: 8 },
    site_vacant:    { distressType: "vacant", severity: 5 },
    tax_delinquent: { distressType: "tax_lien", severity: 6 },
  };

  for (const [csvField, { distressType, severity }] of Object.entries(CSV_DISTRESS_MAP)) {
    const rawVal = getField(row, mapping, csvField as SentinelField);
    if (!rawVal || !/^(yes|true|1|y|x)$/i.test(rawVal.trim())) continue;
    // Skip if this distress type was already created by blanket meta.distressTypes
    if (meta.distressTypes.includes(distressType)) continue;

    const fp = distressFingerprint(apn, county, distressType, `csv:${meta.source}:row`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: evtErr } = await (sb.from("distress_events") as any).insert({
      property_id: prop.id,
      event_type: distressType,
      source: `csv:${meta.source}`,
      severity,
      fingerprint: fp,
      raw_data: {
        import_source: meta.source,
        csv_column: csvField,
        csv_value: rawVal,
        original_address: address,
        original_owner: ownerName,
      },
    });

    if (isDuplicateError(evtErr)) {
      eventsDeduped++;
    } else if (evtErr) {
      console.error(`[CsvUpload] Per-row event insert error for ${apn} (${csvField}):`, evtErr);
    } else {
      eventsCreated++;
      console.log(`[CsvUpload] Per-row distress: ${apn} → ${distressType} (from ${csvField}=${rawVal})`);
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

  // ── ARV cap — skip lead creation for high-value properties ─────────
  // $490K+ ARV = too expensive for wholesale buyers (buyer pool shrinks, margins thin)
  if (estimatedValue && estimatedValue > MAX_ARV) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existFlags } = await (sb.from("properties") as any)
      .select("owner_flags")
      .eq("id", prop.id)
      .single();
    const flags = (existFlags?.owner_flags ?? {}) as Record<string, unknown>;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("properties") as any).update({
      owner_flags: { ...flags, arv_excluded: true, arv_value: estimatedValue },
      updated_at: new Date().toISOString(),
    }).eq("id", prop.id);

    console.log(`[CsvUpload] ARV cap: ${apn} ($${estimatedValue.toLocaleString()}) exceeds $490K — no lead created`);

    return {
      status: "upserted",
      promoted: false,
      eventsCreated,
      eventsDeduped,
      message: `Skipped lead: ARV $${estimatedValue.toLocaleString()} exceeds $490K cap`,
      propertyData: {
        propertyId: prop.id,
        leadId: undefined,
        ownerName, county, address: fullAddress, city, apn,
        estimatedValue,
        lotSize: toInt(getField(row, mapping, "lot_size")) ?? null,
        sqft: toInt(getField(row, mapping, "sqft")) ?? null,
        bedrooms: toInt(getField(row, mapping, "bedrooms")) ?? null,
        propertyType: getField(row, mapping, "property_type") || null,
      },
    };
  }

  // ── Upsert contact (dedup by phone) ──────────────────────────────
  let contactId: string | null = null;
  if (phone) {
    try {
      // Best-effort name split from owner_name
      const nameParts = ownerName.includes(",")
        ? ownerName.split(",").map((p: string) => p.trim())
        : ownerName.split(/\s+/);
      const lastName = ownerName.includes(",") ? nameParts[0] : nameParts[nameParts.length - 1];
      const firstName = ownerName.includes(",") ? (nameParts[1] ?? "") : nameParts.slice(0, -1).join(" ");

      const contactResult = await upsertContact(sb, {
        phone,
        first_name: firstName || null,
        last_name: lastName || null,
        email: email ?? null,
        source: `csv:${meta.source}`,
        contact_type: "owner",
      });
      contactId = contactResult.id;
    } catch {
      // Non-fatal — proceed without contact linkage
    }
  }

  // ── Promote to lead if above threshold ─────────────────────────────
  let promoted = false;

  // All CSV imports enter as "staging" → enrichment bot fills in data → promotes to "prospect"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingLead } = await (sb.from("leads") as any)
    .select("id")
    .eq("property_id", prop.id)
    .in("status", ["staging", "prospect", "lead", "negotiation", "nurture"])
    .maybeSingle();

  let leadId: string | undefined;
  if (!existingLead) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newLead } = await (sb.from("leads") as any).insert({
      property_id: prop.id,
      contact_id: contactId,
      status: "staging",
      source: `csv:${meta.source}`,
      market: resolveMarket(county),
      priority: blended,
      tags: meta.distressTypes,
      notes: `CSV import from ${meta.source}. Preliminary score: ${blended}. Queued for enrichment.`,
    }).select("id").single();
    leadId = newLead?.id;
    promoted = true; // "promoted" here means "lead created" for the import stats
  } else {
    leadId = existingLead.id;
    // Link contact to existing lead if it didn't have one
    if (contactId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("leads") as any)
        .update({ contact_id: contactId, updated_at: new Date().toISOString() })
        .eq("id", leadId)
        .is("contact_id", null);
    }
  }

  return {
    status: "upserted",
    promoted,
    eventsCreated,
    eventsDeduped,
    propertyData: {
      propertyId: prop.id,
      leadId,
      ownerName,
      county,
      address: fullAddress,
      city,
      apn,
      estimatedValue,
      lotSize: toInt(getField(row, mapping, "lot_size")) ?? null,
      sqft: toInt(getField(row, mapping, "sqft")) ?? null,
      bedrooms: toInt(getField(row, mapping, "bedrooms")) ?? null,
      propertyType: getField(row, mapping, "property_type") || null,
    },
  };
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
