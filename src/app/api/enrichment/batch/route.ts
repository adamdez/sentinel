import { NextResponse } from "next/server";
import { processEnrichmentBatch } from "@/lib/enrichment-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300; // 5 min Vercel Pro timeout

/**
 * GET /api/enrichment/batch
 *
 * Cron-triggered batch processor for staging leads.
 * Runs every 15 minutes via vercel.json cron.
 *
 * Processes up to 10 staging leads per invocation:
 *   1. Fetch staging leads (oldest first)
 *   2. Enrich each via PropertyRadar → ATTOM fallback
 *   3. Score and tag — leads STAY in "staging" (reservoir model)
 *   4. After 3 failed attempts, finalize with partial data
 *
 * Leads are promoted to "prospect" only via POST /api/enrichment/promote
 * when an admin explicitly requests them by score tier.
 *
 * Auth: CRON_SECRET header (same as daily-poll).
 * Can also be triggered manually by admins for testing.
 */
export async function GET(req: Request) {
  const cronSecret = req.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;

  if (expectedSecret && cronSecret !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[Enrichment/Batch] Cron triggered:", new Date().toISOString());

  try {
    const result = await processEnrichmentBatch(10, 1000);

    return NextResponse.json({
      success: true,
      message: `Enrichment batch: ${result.enriched} enriched, ${result.partial} partial, ${result.failed} failed, ${result.remaining} remaining`,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Enrichment/Batch] Error:", err);
    return NextResponse.json(
      { error: "Enrichment batch failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
