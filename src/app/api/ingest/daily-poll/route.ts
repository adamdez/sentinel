import { NextResponse } from "next/server";
import { runAgentCycle } from "@/lib/agent/ai-agent-core";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/ingest/daily-poll
 *
 * Vercel Cron endpoint — runs every 4 hours.
 * vercel.json: { "crons": [{ "path": "/api/ingest/daily-poll", "schedule": "0 *\/4 * * *" }] }
 *
 * Delegates to the AI Agent Core orchestrator which runs:
 *   Phase 1 — PropertyRadar Elite Seed top10 pull
 *   Phase 2 — Predictive Crawlers (obituaries, court dockets)
 *   Phase 3 — ATTOM Data API daily delta (if ATTOM_API_KEY present)
 *
 * All phases are fault-isolated: one failure does not block others.
 * Every record scored via Predictive Scoring v2.1 + deterministic v2.0.
 * Only ≥60 (crawlers) / ≥75 (ATTOM/PR) promoted to Sentinel leads.
 */
export async function GET(req: Request) {
  const cronSecret = req.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;

  if (expectedSecret && cronSecret !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    message: [
      `Agent cycle complete`,
      `PR: ${result.phases.propertyRadar.count} prospects`,
      `Crawlers: ${crawlerPromoted} promoted`,
      `ATTOM: ${result.phases.attom.skipped ? "skipped (no key)" : `${result.phases.attom.totalApiCalls} API calls (${result.phases.attom.estimatedCost})`}`,
    ].join(" | "),
    counties,
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
