import { NextResponse } from "next/server";
import { runAllCrawlers, type CrawlRunResult } from "@/lib/crawlers/predictive-crawler";
import { obituaryCrawler } from "@/lib/crawlers/obituary-crawler";
import { courtDocketCrawler } from "@/lib/crawlers/court-docket-crawler";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/ingest/daily-poll
 *
 * Vercel Cron ready — call this every 4 hours.
 *
 * Pipeline:
 *   1. PropertyRadar Elite Seed top10 pull (existing)
 *   2. Predictive Crawler Framework v2.0:
 *      a. Obituary crawler (Spokane/Kootenai — pre-probate upstream signals)
 *      b. Court docket crawler (divorce & bankruptcy filings)
 *   3. ATTOM Data API daily delta pull (Spokane + Kootenai)
 *   4. All results scored; only ≥60 (crawlers) / ≥75 (ATTOM) promoted
 *   5. Audit logged to event_log
 *
 * vercel.json:
 *   { "crons": [{ "path": "/api/ingest/daily-poll", "schedule": "0 *\/4 * * *" }] }
 */
export async function GET(req: Request) {
  const cronSecret = req.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;

  if (expectedSecret && cronSecret !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  console.log("[DailyPoll] === DAILY POLL STARTED ===", new Date().toISOString());

  const counties = ["Spokane", "Kootenai"];
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
    ?? (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  // ── Phase 1: PropertyRadar Elite Seed ─────────────────────────────
  let prResult: Record<string, unknown> = {};
  let prSuccess = false;

  try {
    const res = await fetch(`${baseUrl}/api/ingest/propertyradar/top10`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ counties }),
    });

    prResult = await res.json();
    prSuccess = res.ok && prResult.success === true;

    console.log("[DailyPoll] Top10 result:", {
      success: prSuccess,
      count: prResult.count,
      newInserts: prResult.newInserts,
      updated: prResult.updated,
      elapsed_ms: prResult.elapsed_ms,
    });
  } catch (err) {
    console.error("[DailyPoll] Top10 call failed:", err);
    prResult = { error: String(err) };
  }

  // ── Phase 2: Predictive Crawler Framework ─────────────────────────
  let crawlerResults: CrawlRunResult[] = [];
  let crawlerSuccess = false;

  try {
    console.log("[DailyPoll] Starting predictive crawlers...");
    crawlerResults = await runAllCrawlers([obituaryCrawler, courtDocketCrawler]);
    crawlerSuccess = true;

    const totalPromoted = crawlerResults.reduce((s, r) => s + r.promoted, 0);
    const totalCrawled = crawlerResults.reduce((s, r) => s + r.crawled, 0);
    console.log(`[DailyPoll] Crawlers complete — ${totalCrawled} crawled, ${totalPromoted} promoted`);
  } catch (err) {
    console.error("[DailyPoll] Crawler framework error:", err);
  }

  // ── Phase 3: ATTOM Data API Daily Delta ─────────────────────────────
  let attomResult: Record<string, unknown> = {};
  let attomSuccess = false;

  if (process.env.ATTOM_API_KEY) {
    try {
      console.log("[DailyPoll] Starting ATTOM daily delta pull...");
      const attomRes = await fetch(`${baseUrl}/api/ingest/attom/daily`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.CRON_SECRET
            ? { Authorization: `Bearer ${process.env.CRON_SECRET}` }
            : {}),
        },
      });

      attomResult = await attomRes.json();
      attomSuccess = attomRes.ok && attomResult.success === true;

      console.log("[DailyPoll] ATTOM result:", {
        success: attomSuccess,
        apiCalls: attomResult.apiCalls,
        estimatedCost: attomResult.estimatedCost,
        elapsed_ms: attomResult.elapsed_ms,
      });
    } catch (err) {
      console.error("[DailyPoll] ATTOM call failed:", err);
      attomResult = { error: String(err) };
    }
  } else {
    console.log("[DailyPoll] ATTOM_API_KEY not set — skipping ATTOM phase");
    attomResult = { skipped: true, reason: "ATTOM_API_KEY not configured" };
  }

  const elapsed = Date.now() - startTime;
  console.log(`[DailyPoll] === DAILY POLL COMPLETE in ${elapsed}ms ===`);

  const totalPromoted = crawlerResults.reduce((s, r) => s + r.promoted, 0);

  return NextResponse.json({
    success: prSuccess || crawlerSuccess || attomSuccess,
    message: `Daily poll complete — ${prResult.count ?? 0} PR prospects + ${totalPromoted} crawler promotions + ATTOM ${attomSuccess ? "OK" : "skip/fail"}`,
    counties,
    propertyRadar: {
      success: prSuccess,
      count: prResult.count ?? 0,
      newInserts: prResult.newInserts ?? 0,
      updated: prResult.updated ?? 0,
      prCost: prResult.prCost ?? "?",
    },
    crawlers: crawlerResults.map((r) => ({
      id: r.crawlerId,
      crawled: r.crawled,
      scored: r.scored,
      promoted: r.promoted,
      duplicates: r.duplicates,
      errors: r.errors,
      elapsed_ms: r.elapsed_ms,
    })),
    attom: {
      success: attomSuccess,
      apiCalls: attomResult.apiCalls ?? 0,
      estimatedCost: attomResult.estimatedCost ?? "N/A",
      counties: attomResult.counties ?? [],
      elapsed_ms: attomResult.elapsed_ms ?? 0,
    },
    elapsed_ms: elapsed,
    timestamp: new Date().toISOString(),
  });
}
