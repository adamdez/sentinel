import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { runAgentCycle } from "@/lib/agent/ai-agent-core";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

// Pipeline depth targets
const DEPTH_MAX = 80; // Skip PR import if unworked prospects exceed this

/**
 * GET /api/ingest/daily-poll
 *
 * Vercel Cron endpoint — runs every 4 hours.
 * vercel.json: { "crons": [{ "path": "/api/ingest/daily-poll", "schedule": "0 *\/4 * * *" }] }
 *
 * Pipeline depth control:
 *   - Checks unworked prospect count before running cycle
 *   - If > DEPTH_MAX (80): logs warning (import still runs, but admin should review)
 *   - Crawlers + enrichment + ATTOM always run regardless of depth
 *
 * Delegates to the AI Agent Core orchestrator which runs:
 *   Phase 0.5 — Enrichment queue processing
 *   Phase 1 — PropertyRadar Elite Seed top10 pull
 *   Phase 2 — Predictive Crawlers (obituaries, court dockets, utility shut-offs)
 *   Phase 3 — ATTOM Data API daily delta (if ATTOM_API_KEY present)
 *
 * All phases are fault-isolated: one failure does not block others.
 * Every record scored via Scoring v2.2 + Predictive v2.1.
 */
export async function GET(req: Request) {
  const cronSecret = req.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;

  if (expectedSecret && cronSecret !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Pipeline depth check ──────────────────────────────────────────
  let pipelineDepth = 0;
  try {
    const sb = createServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (sb.from("leads") as any)
      .select("id", { count: "exact", head: true })
      .eq("status", "prospect")
      .eq("call_sequence_step", 0);

    pipelineDepth = count ?? 0;
    const depthStatus = pipelineDepth > DEPTH_MAX ? "OVERFLOW" : "ok";
    console.log(`[DailyPoll] Pipeline depth: ${pipelineDepth} unworked prospects (${depthStatus})`);

    if (pipelineDepth > DEPTH_MAX) {
      console.log(`[DailyPoll] WARNING: ${pipelineDepth} unworked exceeds target max ${DEPTH_MAX}. Consider pausing imports or increasing call volume.`);
    }
  } catch (err) {
    console.error("[DailyPoll] Pipeline depth check failed (non-fatal):", err);
  }

  console.log("[DailyPoll] Handing off to AI Agent Core...");

  const counties = ["Spokane", "Kootenai"];
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
    ?? (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  const result = await runAgentCycle(baseUrl, counties, process.env.CRON_SECRET);

  const crawlerPromoted = result.phases.crawlers.reduce((s, r) => s + r.promoted, 0);

  return NextResponse.json({
    success: result.success,
    pipelineDepth,
    message: [
      `Agent cycle complete`,
      `Pipeline: ${pipelineDepth} unworked`,
      result.grokDirective ? `Grok: [${result.grokDirective.nextCrawlersToRun.join(",")}]` : "Grok: off",
      `Enrichment: ${result.phases.enrichment.enriched}/${result.phases.enrichment.processed} (${result.phases.enrichment.remaining} queued)`,
      `PR: ${result.phases.propertyRadar.count} prospects`,
      `Crawlers: ${crawlerPromoted} promoted`,
      `ATTOM: ${result.phases.attom.skipped ? "skipped (no key)" : `${result.phases.attom.totalApiCalls} API calls (${result.phases.attom.estimatedCost})`}`,
    ].join(" | "),
    grok: result.grokDirective ? {
      reasoning: result.grokDirective.reasoning,
      crawlersSelected: result.grokDirective.nextCrawlersToRun,
      adjustments: result.grokDirective.priorityAdjustments.length,
      suggestions: result.grokDirective.newCrawlerSuggestions,
    } : null,
    counties,
    enrichment: result.phases.enrichment,
    propertyRadar: result.phases.propertyRadar,
    crawlers: result.phases.crawlers.map((r) => ({
      id: r.crawlerId,
      crawled: r.crawled,
      scored: r.scored,
      promoted: r.promoted,
      duplicates: r.duplicates,
      errors: r.errors,
      elapsed_ms: r.elapsed_ms,
    })),
    attom: {
      success: result.phases.attom.success,
      skipped: result.phases.attom.skipped,
      reason: result.phases.attom.reason,
      apiCalls: result.phases.attom.totalApiCalls,
      estimatedCost: result.phases.attom.estimatedCost,
      counties: result.phases.attom.counties.map((c) => ({
        county: c.county,
        fips: c.fips,
        propertiesFetched: c.propertiesFetched,
        foreclosuresFetched: c.foreclosuresFetched,
        upserted: c.upserted,
        eventsInserted: c.eventsInserted,
        promoted: c.promoted,
        updated: c.updated,
        scored: c.scored,
        errors: c.errors.length,
      })),
      elapsed_ms: result.phases.attom.elapsed_ms,
    },
    elapsed_ms: result.elapsed_ms,
    timestamp: result.timestamp,
  });
}
