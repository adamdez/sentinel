import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  applyScoutIngestionPolicy,
  type ScoutIngestionContract,
  type ScoutIngestMode,
} from "@/lib/scout-ingest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

function normalizeContract(input: Record<string, unknown>, fallbackMode: ScoutIngestMode): ScoutIngestionContract {
  const propertyRaw = (input.property as Record<string, unknown> | undefined) ?? {};
  const mode = input.ingest_mode === "create" || input.ingest_mode === "enrich"
    ? input.ingest_mode
    : fallbackMode;
  return {
    source_system: String(input.source_system ?? "spokane_scout_crawler"),
    source_run_id: String(input.source_run_id ?? ""),
    source_record_id: String(input.source_record_id ?? ""),
    ingest_mode: mode,
    property: {
      apn: (propertyRaw.apn as string | undefined) ?? (input.apn as string | undefined) ?? null,
      county: (propertyRaw.county as string | undefined) ?? (input.county as string | undefined) ?? null,
      address: String(propertyRaw.address ?? input.address ?? ""),
      city: String(propertyRaw.city ?? input.city ?? ""),
      state: String(propertyRaw.state ?? input.state ?? ""),
      zip: String(propertyRaw.zip ?? input.zip ?? ""),
    },
    owner_name: (input.owner_name as string | undefined) ?? null,
    county_data: (input.county_data as Record<string, unknown> | undefined) ?? null,
    scout_data: (input.scout_data as Record<string, unknown> | undefined) ?? null,
    photos: Array.isArray(input.photos)
      ? (input.photos as Array<{ url: string; source?: string; capturedAt?: string }>)
      : undefined,
    buyer_signals: (input.buyer_signals as Record<string, unknown> | undefined) ?? null,
    tax_signals: (input.tax_signals as Record<string, unknown> | undefined) ?? null,
  };
}

function buildFailurePayload(input: ScoutIngestionContract, reason: string) {
  return {
    ok: false,
    ingest_status: "failed",
    persisted_updates: 0,
    failure_reason: reason,
    entity_ids: { property_id: null, lead_id: null },
    source_system: input.source_system,
    source_run_id: input.source_run_id,
    source_record_id: input.source_record_id,
  };
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-webhook-secret");
  const expectedSecret = process.env.INGEST_WEBHOOK_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const mode = body.ingest_mode === "enrich" ? "enrich" : "create";
  const recordsRaw = Array.isArray(body.records) ? body.records : [body];
  const records = recordsRaw
    .filter((value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object")
    .map((row: Record<string, unknown>) => normalizeContract(row, mode));

  if (records.length === 0) {
    return NextResponse.json({ error: "records[] is required" }, { status: 400 });
  }

  const sb = createServerClient();

  const results: Array<ReturnType<typeof buildFailurePayload> | Awaited<ReturnType<typeof applyScoutIngestionPolicy>>> = [];
  for (const contract of records) {
    if (!contract.source_run_id || !contract.source_record_id) {
      results.push(buildFailurePayload(contract, "missing_required_source_metadata"));
      continue;
    }
    results.push(await applyScoutIngestionPolicy(sb, contract));
  }

  const summary = {
    total: results.length,
    created: results.filter((r) => r.ingest_status === "created").length,
    enriched: results.filter((r) => r.ingest_status === "enriched").length,
    skipped: results.filter((r) => r.ingest_status === "skipped").length,
    failed: results.filter((r) => r.ingest_status === "failed").length,
    persisted_updates: results.reduce((sum, row) => sum + (row.persisted_updates ?? 0), 0),
  };

  return NextResponse.json({
    ok: true,
    source_system: records[0]?.source_system ?? null,
    source_run_id: records[0]?.source_run_id ?? null,
    ingest_mode: mode,
    summary,
    results,
  });
}
