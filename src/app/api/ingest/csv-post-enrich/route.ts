/**
 * CSV Post-Import Enrichment Endpoint
 *
 * Self-contained batch enrichment for CSV-imported properties.
 * Takes property IDs from a csv-upload response and runs the full
 * enrichment pipeline on each: PR API lookup → signal detection →
 * scoring → auto-promote to prospect.
 *
 * Separate from the core enrichment cron — does not modify the
 * main enrichment pipeline. Safe to leave unused when CSV imports stop.
 *
 * Auth: CRON_SECRET header (x-cron-secret or Authorization: Bearer)
 *
 * POST /api/ingest/csv-post-enrich
 *   Body: { propertyIds: string[] }   (max 100 per call)
 *   Returns: { total, enriched, failed, skipped, results[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { enrichProperty } from "@/lib/enrichment-engine";

export const maxDuration = 300; // 5 minutes — Vercel limit

const MAX_BATCH = 100;
const PR_DELAY_MS = 500; // rate-limit safety between PR API calls
const MAX_ARV = 490_000; // same ARV ceiling as csv-upload

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization");
  const cronHeader = req.headers.get("x-cron-secret");
  const isAuthed =
    (authHeader === `Bearer ${cronSecret}`) ||
    (cronHeader === cronSecret);

  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse body ──────────────────────────────────────────────────────
  let body: { propertyIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { propertyIds } = body;
  if (!Array.isArray(propertyIds) || propertyIds.length === 0) {
    return NextResponse.json({ error: "propertyIds must be a non-empty array" }, { status: 400 });
  }
  if (propertyIds.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Max ${MAX_BATCH} properties per call (got ${propertyIds.length})` },
      { status: 400 }
    );
  }

  console.log(`[CsvPostEnrich] Starting batch enrichment for ${propertyIds.length} properties`);
  const startTime = Date.now();
  const sb = createServerClient();

  // ── Fetch all properties + their leads in one query ─────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: properties, error: propErr } = await (sb.from("properties") as any)
    .select("*")
    .in("id", propertyIds);

  if (propErr) {
    return NextResponse.json(
      { error: `Failed to fetch properties: ${propErr.message}` },
      { status: 500 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leads } = await (sb.from("leads") as any)
    .select("id, property_id, status, priority")
    .in("property_id", propertyIds)
    .in("status", ["staging", "prospect", "lead", "negotiation", "nurture"]);

  // Build lookup maps
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const propMap = new Map<string, Record<string, any>>();
  for (const p of (properties ?? [])) {
    propMap.set(p.id, p);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leadMap = new Map<string, Record<string, any>>();
  for (const l of (leads ?? [])) {
    leadMap.set(l.property_id, l);
  }

  // ── Process each property ───────────────────────────────────────────
  interface PostEnrichResult {
    propertyId: string;
    success: boolean;
    skipped?: boolean;
    skipReason?: string;
    score?: number | null;
    label?: string | null;
    signalsDetected?: number;
    enrichmentSource?: string;
    error?: string;
    elapsed_ms?: number;
  }

  const results: PostEnrichResult[] = [];
  let enriched = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < propertyIds.length; i++) {
    const propertyId = propertyIds[i];
    const property = propMap.get(propertyId);
    const lead = leadMap.get(propertyId);

    // Skip if property not found
    if (!property) {
      results.push({ propertyId, success: false, skipped: true, skipReason: "property_not_found" });
      skipped++;
      continue;
    }

    // Skip if no lead (ARV-excluded or rolled-up vacant land)
    if (!lead) {
      results.push({ propertyId, success: false, skipped: true, skipReason: "no_lead" });
      skipped++;
      continue;
    }

    // ARV gate — skip if already excluded or value over cap
    const ownerFlags = (property.owner_flags ?? {}) as Record<string, unknown>;
    const estValue = property.estimated_value as number | null;

    if (ownerFlags.arv_excluded) {
      results.push({ propertyId, success: false, skipped: true, skipReason: "arv_excluded" });
      skipped++;
      continue;
    }

    if (estValue && estValue > MAX_ARV) {
      // Mark as excluded and archive the lead
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("properties") as any).update({
        owner_flags: { ...ownerFlags, arv_excluded: true, arv_value: estValue },
        updated_at: new Date().toISOString(),
      }).eq("id", propertyId);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("leads") as any).update({
        status: "archived",
        notes: `ARV $${estValue.toLocaleString()} exceeds $490K cap — archived by post-enrich`,
        updated_at: new Date().toISOString(),
      }).eq("id", lead.id);

      console.log(`[CsvPostEnrich] ARV cap: ${property.apn} ($${estValue.toLocaleString()}) — lead archived`);
      results.push({ propertyId, success: false, skipped: true, skipReason: "arv_exceeded" });
      skipped++;
      continue;
    }

    // ── Run full enrichment pipeline ──────────────────────────────
    try {
      const enrichResult = await enrichProperty(propertyId, lead.id, property, lead);

      results.push({
        propertyId,
        success: enrichResult.success,
        score: enrichResult.score,
        label: enrichResult.label,
        signalsDetected: enrichResult.signalsDetected,
        enrichmentSource: enrichResult.enrichmentSource,
        error: enrichResult.error,
        elapsed_ms: enrichResult.elapsed_ms,
      });

      if (enrichResult.success) {
        enriched++;
      } else {
        failed++;
      }

      console.log(
        `[CsvPostEnrich] [${i + 1}/${propertyIds.length}] ${property.apn}: ` +
        `${enrichResult.success ? "✓" : "✗"} ${enrichResult.enrichmentSource} ` +
        `score=${enrichResult.score} signals=${enrichResult.signalsDetected} ` +
        `(${enrichResult.elapsed_ms}ms)`
      );
    } catch (err) {
      console.error(`[CsvPostEnrich] Unhandled error for ${propertyId}:`, err);
      results.push({
        propertyId,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
      failed++;
    }

    // Rate limit between PR API calls (skip delay on last item)
    if (i < propertyIds.length - 1) {
      await sleep(PR_DELAY_MS);
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(
    `[CsvPostEnrich] Complete: ${enriched} enriched, ${failed} failed, ${skipped} skipped (${elapsed}ms)`
  );

  return NextResponse.json({
    total: propertyIds.length,
    enriched,
    failed,
    skipped,
    elapsed_ms: elapsed,
    results,
  });
}

/**
 * GET /api/ingest/csv-post-enrich
 * Returns endpoint documentation.
 */
export async function GET() {
  return NextResponse.json({
    endpoint: "/api/ingest/csv-post-enrich",
    method: "POST",
    description: "Batch PropertyRadar enrichment for CSV-imported properties",
    auth: "x-cron-secret header or Authorization: Bearer <CRON_SECRET>",
    body: {
      propertyIds: "string[] — property IDs from csv-upload response (max 100)",
    },
    pipeline: [
      "1. ARV gate — skip properties over $490K",
      "2. PropertyRadar API lookup (phone, email, PR flags)",
      "3. Detect distress signals from PR response",
      "4. Full scoring pipeline (deterministic + predictive + blend)",
      "5. Deep crawl verification + ownership check",
      "6. Finalize lead — auto-promote to prospect",
    ],
    constraints: {
      maxBatch: 100,
      maxDuration: "300s (5 min)",
      rateLimit: "500ms between PR API calls",
    },
  });
}
