import { NextRequest, NextResponse } from "next/server";
import type { IngestPayload } from "@/lib/types";

/**
 * POST /api/ingest
 *
 * Webhook endpoint for automatic prospect creation from scrapers/API keys.
 * Validates the webhook secret, deduplicates by APN+county fingerprint,
 * and queues records for identity resolution and scoring.
 *
 * Domain: Signal Domain — writes raw_signals and distress_events only.
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

    // TODO: Validate each record has apn, county, address, owner_name, distress_type
    // TODO: Generate fingerprint hash for dedup (SHA256 of apn+county+event_type+source)
    // TODO: Upsert into properties table (ON CONFLICT DO UPDATE — identity model)
    // TODO: Insert into distress_events (append-only, dedup by fingerprint)
    // TODO: Queue for scoring engine (incremental scoring)
    // TODO: Queue for promotion evaluation
    // TODO: Log audit entry (ingest.received)

    const processed = payload.records.map((record) => ({
      apn: record.apn,
      county: record.county,
      status: "queued",
      fingerprint: `${record.apn}:${record.county}:${record.distress_type}:${payload.source}`,
    }));

    return NextResponse.json({
      success: true,
      source: payload.source,
      received: payload.records.length,
      processed: processed.length,
      records: processed,
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
