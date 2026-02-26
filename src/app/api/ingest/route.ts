import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import type { IngestPayload } from "@/lib/types";
import { createServerClient } from "@/lib/supabase";

type SbResult<T> = { data: T | null; error: { code?: string; message: string } | null };

/**
 * POST /api/ingest
 *
 * Webhook endpoint for automatic prospect creation from scrapers/API keys.
 * Validates the webhook secret, deduplicates by fingerprint hash,
 * upserts into properties, appends distress_events, queues scoring.
 *
 * Domain: Signal Domain — writes properties and distress_events only.
 */
export async function POST(request: NextRequest) {
  try {
    const secret = request.headers.get("x-webhook-secret");
    const expectedSecret = process.env.INGEST_WEBHOOK_SECRET;

    if (!secret || secret !== expectedSecret) {
      return NextResponse.json(
        { error: "Unauthorized — invalid webhook secret" },
        { status: 401 }
      );
    }

    const payload: IngestPayload = await request.json();

    if (!payload.source || !Array.isArray(payload.records) || payload.records.length === 0) {
      return NextResponse.json(
        { error: "Invalid payload — source and records[] required" },
        { status: 400 }
      );
    }

    const sb = createServerClient();
    const results: { apn: string; county: string; status: string; fingerprint: string }[] = [];
    let upserted = 0;
    let deduped = 0;
    let errors = 0;

    for (const record of payload.records) {
      if (!record.apn || !record.county || !record.address || !record.owner_name) {
        results.push({ apn: record.apn, county: record.county, status: "invalid", fingerprint: "" });
        errors++;
        continue;
      }

      // Idempotent property upsert (APN + county = canonical identity)
      // TODO: Replace `as any` when types are auto-generated via `supabase gen types`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: property, error: propError } = await (sb.from("properties") as any)
        .upsert(
          {
            apn: record.apn,
            county: record.county,
            address: record.address,
            owner_name: record.owner_name,
            owner_flags: record.raw_data?.owner_flags ?? {},
          },
          { onConflict: "apn,county" }
        )
        .select("id")
        .single() as SbResult<{ id: string }>;

      if (propError || !property) {
        results.push({ apn: record.apn, county: record.county, status: "upsert_failed", fingerprint: "" });
        errors++;
        continue;
      }
      upserted++;

      const fingerprint = createHash("sha256")
        .update(`${record.apn}:${record.county}:${record.distress_type}:${payload.source}`)
        .digest("hex");

      // Append distress event (dedup by fingerprint unique index)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: eventError } = await (sb.from("distress_events") as any)
        .insert({
          property_id: property.id,
          event_type: record.distress_type,
          source: payload.source,
          severity: record.raw_data?.severity ?? 5,
          fingerprint,
          raw_data: record.raw_data ?? {},
          confidence: record.raw_data?.confidence ?? null,
        }) as SbResult<unknown>;

      if (eventError) {
        if (eventError.code === "23505") {
          deduped++;
          results.push({ apn: record.apn, county: record.county, status: "duplicate", fingerprint });
        } else {
          errors++;
          results.push({ apn: record.apn, county: record.county, status: "event_failed", fingerprint });
        }
        continue;
      }

      // TODO: Queue property for incremental scoring (background job)
      // TODO: Queue property for promotion evaluation

      results.push({ apn: record.apn, county: record.county, status: "ingested", fingerprint });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("event_log") as any).insert({
      user_id: "00000000-0000-0000-0000-000000000000",
      action: "ingest.received",
      entity_type: "ingest_batch",
      entity_id: payload.source,
      details: {
        source: payload.source,
        total: payload.records.length,
        upserted,
        deduped,
        errors,
      },
    });

    return NextResponse.json({
      success: true,
      source: payload.source,
      received: payload.records.length,
      upserted,
      deduped,
      errors,
      records: results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Ingest] Error processing webhook:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: "/api/ingest",
    method: "POST",
    description: "Sentinel ingest webhook — send property/distress data for automatic prospect creation",
    headers: {
      "x-webhook-secret": "Required — your webhook secret from Settings",
      "Content-Type": "application/json",
    },
    payload: {
      source: "string — e.g. 'probate_scraper', 'tax_lien_api', 'manual'",
      records: [
        {
          apn: "string — Assessor Parcel Number (primary key with county)",
          county: "string — County name",
          address: "string — Full property address",
          owner_name: "string — Property owner name",
          distress_type: "string — probate|pre_foreclosure|tax_lien|etc",
          raw_data: "object — Additional source-specific data",
        },
      ],
    },
  });
}
