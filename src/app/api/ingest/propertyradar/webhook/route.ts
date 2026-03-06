import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  normalizeCounty, distressFingerprint, isDuplicateError,
  isTruthy, toNumber, toInt,
} from "@/lib/dedup";
import { detectDistressSignals, type DetectedSignal } from "@/lib/distress-signals";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";
const SOURCE_TAG = "Webhook_PR_Zapier";

const COUNTY_STATE_MAP: Record<string, string> = {
  spokane: "WA", kootenai: "ID", bonner: "ID", latah: "ID",
  whitman: "WA", lincoln: "WA", stevens: "WA",
};

// ── Field name helpers ──────────────────────────────────────────────
// Zapier payloads may use different field names than the raw PR API.
// These helpers extract values from whichever field name variant is present.

function pick(pr: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (pr[k] !== undefined && pr[k] !== null && pr[k] !== "") return pr[k];
  }
  return undefined;
}

function pickStr(pr: Record<string, unknown>, ...keys: string[]): string {
  const v = pick(pr, ...keys);
  return v != null ? String(v).trim() : "";
}

// ── POST Handler ────────────────────────────────────────────────────

/**
 * POST /api/ingest/propertyradar/webhook
 *
 * Receives PropertyRadar property data from Zapier automations.
 * Accepts a single property object or an array of property objects.
 * Upserts into properties table, inserts distress events, and
 * creates/updates leads in "staging" status for enrichment pickup.
 */
export async function POST(req: NextRequest) {
  // ── Auth check ──────────────────────────────────────────────────
  const bearerToken = req.headers.get("authorization")?.replace("Bearer ", "");
  const cronSecret = process.env.CRON_SECRET;
  const webhookToken = process.env.PR_WEBHOOK_TOKEN;

  const isAuthed =
    (cronSecret && bearerToken === cronSecret) ||
    (webhookToken && bearerToken === webhookToken);

  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse payload ───────────────────────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Accept single object or array
  const records: Record<string, unknown>[] = Array.isArray(rawBody)
    ? rawBody
    : rawBody && typeof rawBody === "object"
      ? [rawBody as Record<string, unknown>]
      : [];

  if (records.length === 0) {
    return NextResponse.json({ error: "No records provided" }, { status: 400 });
  }

  const sb = createServerClient();

  let received = 0;
  let inserted = 0;
  let updated = 0;
  let errored = 0;
  let eventsInserted = 0;
  let eventsDeduped = 0;

  // ── Process each record ─────────────────────────────────────────
  for (const pr of records) {
    received++;

    try {
      // ── Extract core fields ───────────────────────────────────
      const apn = pickStr(pr, "APN", "apn", "Apn", "parcel_number", "ParcelNumber");
      if (!apn) {
        console.warn(`[Webhook] Skipping record ${received}: no APN found`);
        errored++;
        continue;
      }

      const rawCounty = pickStr(pr, "County", "county", "CountyName", "county_name");
      const county = normalizeCounty(rawCounty, "Spokane");

      const state = pickStr(pr, "State", "state", "PropertyState")
        || COUNTY_STATE_MAP[county.toLowerCase()]
        || "WA";

      const address = pickStr(pr, "Address", "address", "StreetAddress", "street_address");
      const city = pickStr(pr, "City", "city");
      const zip = pickStr(pr, "ZipFive", "Zip", "zip", "ZipCode", "zip_code", "postal_code");
      const ownerName = pickStr(pr, "Owner", "owner", "OwnerName", "owner_name", "Taxpayer");

      // ── Detect distress signals ─────────────────────────────
      const det = detectDistressSignals(pr);
      const signals: DetectedSignal[] = det.signals;

      // ── Fetch & merge existing owner_flags ──────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existingProp } = await (sb.from("properties") as any)
        .select("owner_flags").eq("apn", apn).eq("county", county).maybeSingle();
      const existingFlags = (existingProp?.owner_flags ?? {}) as Record<string, unknown>;

      const ownerFlags: Record<string, unknown> = {
        ...existingFlags,
        source: "propertyradar",
        radar_id: pick(pr, "RadarID", "radar_id", "radarId") ?? null,
        webhook_import: true,
        pr_raw: pr,
        last_enriched: new Date().toISOString(),
      };
      if (isTruthy(pr.isNotSameMailingOrExempt)) ownerFlags.absentee = true;
      if (isTruthy(pr.isSiteVacant)) ownerFlags.vacant = true;
      if (isTruthy(pr.isHighEquity)) ownerFlags.highEquity = true;
      if (isTruthy(pr.isFreeAndClear)) ownerFlags.freeAndClear = true;
      if (isTruthy(pr.isCashBuyer)) ownerFlags.cashBuyer = true;

      // Extract phone/email from PR data
      const countyPhone = pickStr(pr, "Phone1", "Phone2", "phone", "phone1") || null;
      const countyEmail = pickStr(pr, "Email", "email") || null;

      // ── Upsert property ─────────────────────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: property, error: propErr } = await (sb.from("properties") as any)
        .upsert({
          apn, county,
          address, city, state, zip,
          owner_name: ownerName || null,
          owner_phone: countyPhone,
          owner_email: countyEmail,
          estimated_value: toNumber(pick(pr, "AVM", "avm", "estimated_value")) != null
            ? Math.round(toNumber(pick(pr, "AVM", "avm", "estimated_value"))!)
            : null,
          equity_percent: toNumber(pick(pr, "EquityPercent", "equity_percent")) ?? null,
          bedrooms: toInt(pick(pr, "Beds", "beds", "bedrooms")) ?? null,
          bathrooms: toNumber(pick(pr, "Baths", "baths", "bathrooms")) ?? null,
          sqft: toInt(pick(pr, "SqFt", "sqft", "square_feet")) ?? null,
          year_built: toInt(pick(pr, "YearBuilt", "year_built")) ?? null,
          lot_size: toInt(pick(pr, "LotSize", "lot_size")) ?? null,
          property_type: pickStr(pr, "PType", "property_type", "PropertyType") || null,
          owner_flags: ownerFlags,
          updated_at: new Date().toISOString(),
        }, { onConflict: "apn,county" })
        .select("id")
        .single();

      if (propErr || !property) {
        console.error(`[Webhook] Property upsert failed for APN ${apn}:`, propErr?.message);
        errored++;
        continue;
      }

      // ── Insert distress events with fingerprint dedup ───────
      for (const signal of signals) {
        const fp = distressFingerprint(apn, county, signal.type, "propertyradar");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: evtErr } = await (sb.from("distress_events") as any).insert({
          property_id: property.id,
          event_type: signal.type,
          source: "propertyradar",
          severity: signal.severity,
          fingerprint: fp,
          raw_data: {
            detected_from: signal.detectedFrom,
            radar_id: pick(pr, "RadarID", "radar_id", "radarId"),
            webhook_import: true,
          },
          confidence: signal.severity >= 7 ? "0.900" : "0.600",
        });

        if (evtErr && isDuplicateError(evtErr)) eventsDeduped++;
        else if (evtErr) { /* log but continue */ console.warn(`[Webhook] Event insert error:`, evtErr.message); }
        else eventsInserted++;
      }

      // ── Create/update lead in staging ───────────────────────
      // Build tags from signals
      const signalTags = signals.map((s) => s.type);
      const allTags = [SOURCE_TAG, ...signalTags];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existingLead } = await (sb.from("leads") as any)
        .select("id")
        .eq("property_id", property.id)
        .in("status", ["staging", "prospect", "lead", "negotiation", "nurture"])
        .maybeSingle();

      if (!existingLead) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("leads") as any).insert({
          property_id: property.id,
          status: "staging",
          priority: 0, // will be scored by enrichment batch
          source: SOURCE_TAG,
          tags: allTags,
          notes: `Webhook import — ${signals.length} signal(s) detected. Awaiting enrichment scoring.`,
        });
        inserted++;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("leads") as any)
          .update({ tags: allTags, source: SOURCE_TAG })
          .eq("id", existingLead.id);
        updated++;
      }

      // ── Log event ─────────────────────────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("event_log") as any).insert({
        user_id: SYSTEM_USER_ID,
        action: "webhook.property_ingested",
        entity_type: "property",
        entity_id: property.id,
        details: {
          apn, county, address,
          signals_count: signals.length,
          signal_types: signalTags,
          source: SOURCE_TAG,
          is_new: !existingLead,
        },
      });

    } catch (err) {
      console.error(`[Webhook] Unexpected error processing record ${received}:`, err);
      errored++;
    }
  }

  console.log(`[Webhook] Complete: ${received} received, ${inserted} inserted, ${updated} updated, ${errored} errored, ${eventsInserted} events (${eventsDeduped} deduped)`);

  return NextResponse.json({
    success: true,
    received,
    inserted,
    updated,
    errored,
    events_inserted: eventsInserted,
    events_deduped: eventsDeduped,
  });
}
