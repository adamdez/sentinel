/**
 * Marketplace FSBO Poll — Lightweight cron endpoint
 *
 * Runs every 15 minutes via Vercel Cron.
 * Only executes FSBO-specific crawlers (Craigslist, future Zillow, etc.).
 * Separate from the full agent cycle to keep FSBO ingestion fast and independent.
 *
 * Schedule: "*\/15 * * * *" (every 15 minutes)
 */

import { NextRequest, NextResponse } from "next/server";
import { runCrawler } from "@/lib/crawlers/predictive-crawler";
import { craigslistFsboCrawler } from "@/lib/crawlers/craigslist-fsbo-crawler";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  // Auth check — same pattern as daily-poll
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.warn("[MarketplacePoll] Unauthorized request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Cleanup mode: ?cleanup=true purges all CRAWL- records then re-crawls ──
  const cleanup = req.nextUrl.searchParams.get("cleanup") === "true";
  let purgeStats: { leadsDeleted: number; eventsDeleted: number; propertiesDeleted: number } | null = null;
  if (cleanup) {
    console.log("[MarketplacePoll] === CLEANUP MODE: Purging old FSBO data ===");
    const sb = createServerClient();
    purgeStats = { leadsDeleted: 0, eventsDeleted: 0, propertiesDeleted: 0 };

    // Find all properties with synthetic CRAWL- APNs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: crawlProps, error: findErr } = await (sb.from("properties") as any)
      .select("id")
      .like("apn", "CRAWL-%");

    if (findErr) {
      console.error("[MarketplacePoll] Failed to find CRAWL properties:", findErr);
      return NextResponse.json({ success: false, error: "Purge find failed", detail: findErr.message });
    }

    if (crawlProps && crawlProps.length > 0) {
      const propIds = crawlProps.map((p: { id: string }) => p.id);
      console.log(`[MarketplacePoll] Purging ${propIds.length} CRAWL- properties`);

      // Delete in batches of 50 to avoid query size limits
      for (let i = 0; i < propIds.length; i += 50) {
        const batch = propIds.slice(i, i + 50);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { count: lc, error: le } = await (sb.from("leads") as any)
          .delete({ count: "exact" }).in("property_id", batch);
        if (le) console.error(`[MarketplacePoll] Lead delete batch error:`, le);
        purgeStats.leadsDeleted += lc ?? 0;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { count: ec, error: ee } = await (sb.from("distress_events") as any)
          .delete({ count: "exact" }).in("property_id", batch);
        if (ee) console.error(`[MarketplacePoll] Event delete batch error:`, ee);
        purgeStats.eventsDeleted += ec ?? 0;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { count: pc, error: pe } = await (sb.from("properties") as any)
          .delete({ count: "exact" }).in("id", batch);
        if (pe) console.error(`[MarketplacePoll] Property delete batch error:`, pe);
        purgeStats.propertiesDeleted += pc ?? 0;
      }

      console.log(`[MarketplacePoll] Purge complete:`, purgeStats);
    } else {
      console.log("[MarketplacePoll] No CRAWL- properties found to purge");
    }

    // Continue to re-crawl below...
    console.log("[MarketplacePoll] Purge done, now re-crawling with v2...");
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response: Record<string, any> = {
    success: true,
    crawlers: results,
    summary: {
      totalCrawled,
      totalPromoted,
      totalDuplicates,
      elapsed_ms: elapsed,
    },
    timestamp: new Date().toISOString(),
  };

  // Include purge stats if cleanup was requested
  if (cleanup && purgeStats) {
    response.cleanup = purgeStats;
  }

  return NextResponse.json(response);
}
