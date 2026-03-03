/**
 * Marketplace FSBO Poll — Lightweight cron endpoint
 *
 * Runs every 2 hours via Vercel Cron.
 * Only executes FSBO-specific crawlers (Craigslist, future Zillow, etc.).
 * Separate from the full agent cycle to keep FSBO ingestion fast and independent.
 *
 * Schedule: "0 *\/2 * * *" (every 2 hours)
 */

import { NextRequest, NextResponse } from "next/server";
import { runCrawler } from "@/lib/crawlers/predictive-crawler";
import { craigslistFsboCrawler } from "@/lib/crawlers/craigslist-fsbo-crawler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Auth check — same pattern as daily-poll
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.warn("[MarketplacePoll] Unauthorized request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[MarketplacePoll] === Starting FSBO crawl cycle ===");
  const t0 = Date.now();

  // Run all FSBO crawlers (currently just Craigslist; add more here as they're built)
  const fsboCrawlers = [craigslistFsboCrawler];
  const results = [];

  for (const crawler of fsboCrawlers) {
    try {
      console.log(`[MarketplacePoll] Running ${crawler.name}...`);
      const result = await runCrawler(crawler);
      results.push(result);
      console.log(`[MarketplacePoll] ${crawler.name} complete:`, result);
    } catch (err) {
      console.error(`[MarketplacePoll] Error running ${crawler.name}:`, err);
      results.push({
        crawlerId: crawler.id,
        crawled: 0,
        scored: 0,
        promoted: 0,
        duplicates: 0,
        errors: 1,
        elapsed_ms: 0,
      });
    }
  }

  const elapsed = Date.now() - t0;
  const totalCrawled = results.reduce((s, r) => s + r.crawled, 0);
  const totalPromoted = results.reduce((s, r) => s + r.promoted, 0);
  const totalDuplicates = results.reduce((s, r) => s + r.duplicates, 0);

  console.log(`[MarketplacePoll] === CYCLE COMPLETE in ${elapsed}ms — ${totalCrawled} crawled, ${totalPromoted} promoted, ${totalDuplicates} dupes ===`);

  return NextResponse.json({
    success: true,
    crawlers: results,
    summary: {
      totalCrawled,
      totalPromoted,
      totalDuplicates,
      elapsed_ms: elapsed,
    },
    timestamp: new Date().toISOString(),
  });
}
