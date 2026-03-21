import { NextRequest, NextResponse } from "next/server";
import type { IngestPayload } from "@/lib/types";
import { createServerClient } from "@/lib/supabase";
import { distressFingerprint, isDuplicateError } from "@/lib/dedup";
import { upsertContact } from "@/lib/upsert-contact";
import { deduplicateByProperty } from "@/lib/dedup-property";
import { resolveMarket } from "@/lib/market-resolver";

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
    let propertyDeduped = 0;
    let errors = 0;

    for (const record of payload.records) {
      if (!record.apn || !record.county || !record.address || !record.owner_name) {
        results.push({ apn: record.apn, county: record.county, status: "invalid", fingerprint: "" });
        errors++;
        continue;
      }

      // ── Property-level dedup: check if this property already exists ──
      const dedupResult = await deduplicateByProperty(sb, {
        address: record.address,
        apn: record.apn,
        city: typeof record.raw_data?.city === "string" ? record.raw_data.city : null,
        state: typeof record.raw_data?.state === "string" ? record.raw_data.state : null,
        zip: typeof record.raw_data?.zip === "string" ? record.raw_data.zip : null,
      });

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

      const fingerprint = distressFingerprint(record.apn, record.county, record.distress_type, payload.source);

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
        if (isDuplicateError(eventError)) {
          deduped++;
          results.push({ apn: record.apn, county: record.county, status: "duplicate", fingerprint });
        } else {
          errors++;
          results.push({ apn: record.apn, county: record.county, status: "event_failed", fingerprint });
        }
        continue;
      }

      // Upsert contact if phone data is available (dedup by phone)
      let contactId: string | null = null;
      if (record.owner_phone) {
        try {
          const nameParts = record.owner_name.includes(",")
            ? record.owner_name.split(",").map((p: string) => p.trim())
            : record.owner_name.split(/\s+/);
          const lastName = record.owner_name.includes(",") ? nameParts[0] : nameParts[nameParts.length - 1];
          const firstName = record.owner_name.includes(",") ? (nameParts[1] ?? "") : nameParts.slice(0, -1).join(" ");

          const contactResult = await upsertContact(sb, {
            phone: record.owner_phone,
            first_name: firstName || null,
            last_name: lastName || null,
            email: record.owner_email ?? null,
            source: payload.source,
            contact_type: "owner",
          });
          contactId = contactResult.id;
        } catch {
          // Non-fatal — proceed without contact linkage
        }
      }

      // ── Property-based dedup for lead creation ──────────────────
      // Use dedup result to find existing leads for this property
      // (covers both APN match and address match scenarios)
      const existingLeadIds = dedupResult.existingLeadIds.length > 0
        ? dedupResult.existingLeadIds
        : [];

      // Also check leads by the just-upserted property_id (handles APN+county upsert case)
      if (existingLeadIds.length === 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: existingLead } = await (sb.from("leads") as any)
          .select("id")
          .eq("property_id", property.id)
          .in("status", ["staging", "prospect", "lead", "negotiation", "nurture"])
          .maybeSingle();
        if (existingLead) existingLeadIds.push(existingLead.id);
      }

      if (existingLeadIds.length === 0) {
        // No existing lead for this property — create new
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("leads") as any).insert({
          property_id: property.id,
          contact_id: contactId,
          status: "staging",
          source: payload.source,
          market: resolveMarket(record.county),
          priority: 0,
          tags: [record.distress_type],
          notes: `Webhook ingest from ${payload.source}. Queued for enrichment.`,
        });
      } else {
        // Existing lead(s) found — merge new source attribution into the first active lead
        propertyDeduped++;
        const targetLeadId = existingLeadIds[0];
        const leadUpdate: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
          notes: `Re-ingested from ${payload.source} (property dedup merge).`,
        };
        if (contactId) leadUpdate.contact_id = contactId;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("leads") as any)
          .update(leadUpdate)
          .eq("id", targetLeadId);
      }

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
        property_deduped: propertyDeduped,
        errors,
      },
    });

    return NextResponse.json({
      success: true,
      source: payload.source,
      received: payload.records.length,
      upserted,
      deduped,
      property_deduped: propertyDeduped,
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
    sub_endpoints: {
      "/api/ingest/propertyradar": {
        method: "POST",
        description: "Single-property ingestion from PropertyRadar with automatic AI scoring",
        body: "{ address: string } or { apn: string }",
        requires: "PROPERTYRADAR_API_KEY env var",
      },
      "/api/ranger-push": {
        method: "POST",
        description: "Dominion Ranger prowler push — receives scored leads from Dominion",
        body: "Charter Section 7 payload",
      },
    },
  });
}
