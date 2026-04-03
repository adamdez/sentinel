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
import { buildLeadIngestPolicySkip, getLeadIngestPolicy } from "@/lib/lead-ingest-policy";
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

  // ── Cleanup mode: ?cleanup=true fixes CRAWL- property data in-place ──
  // Note: distress_events has an append-only trigger (trg_distress_events_immutable)
  // that blocks DELETE. So instead of purging, we UPDATE properties with correct data
  // from the v2 crawler, then re-crawl to pick up new listings.
  const cleanup = req.nextUrl.searchParams.get("cleanup") === "true";
  let cleanupStats: { propertiesFixed: number; leadsRemoved: number; orphanLeadsRemoved: number } | null = null;
  if (cleanup) {
    console.log("[MarketplacePoll] === CLEANUP MODE: Fixing CRAWL- property data ===");
    const sb = createServerClient();
    cleanupStats = { propertiesFixed: 0, leadsRemoved: 0, orphanLeadsRemoved: 0 };

    // Find all properties with synthetic CRAWL- APNs and their current data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: crawlProps, error: findErr } = await (sb.from("properties") as any)
      .select("id, apn, address, city, state, owner_name, zip, owner_flags")
      .like("apn", "CRAWL-%");

    if (findErr) {
      console.error("[MarketplacePoll] Failed to find CRAWL properties:", findErr);
    } else if (crawlProps && crawlProps.length > 0) {
      console.log(`[MarketplacePoll] Found ${crawlProps.length} CRAWL- properties to clean`);

      // Delete leads for out-of-area properties (FL, AZ, NH, etc. — junk from v1)
      const validStates = new Set(["WA", "ID", "MT"]);
      const junkPropIds: string[] = [];
      const fixableProps: typeof crawlProps = [];

      for (const prop of crawlProps) {
        const state = (prop.state || "").toUpperCase();
        const ownerName = prop.owner_name || "";
        const isJunkOwner = ownerName.length > 40 && !ownerName.startsWith("FSBO Owner");
        const isOutOfArea = state && !validStates.has(state);
        const isRental = /\b(for rent|rental|lease)\b/i.test(ownerName);

        if (isOutOfArea || isRental) {
          junkPropIds.push(prop.id);
        } else {
          fixableProps.push(prop);
        }
      }

      // Remove leads for junk properties (can't delete properties/events due to triggers)
      if (junkPropIds.length > 0) {
        console.log(`[MarketplacePoll] Removing leads for ${junkPropIds.length} junk/out-of-area properties`);
        for (let i = 0; i < junkPropIds.length; i += 50) {
          const batch = junkPropIds.slice(i, i + 50);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { count: lc } = await (sb.from("leads") as any)
            .delete({ count: "exact" }).in("property_id", batch);
          cleanupStats.leadsRemoved += lc ?? 0;
        }
      }

      // Fix remaining properties: update ZIP from city lookup + clean owner_name
      const CITY_ZIP: Record<string, string> = {
        "spokane": "99201", "spokane valley": "99206", "liberty lake": "99019",
        "cheney": "99004", "airway heights": "99001", "medical lake": "99022",
        "deer park": "99006", "mead": "99021", "greenacres": "99016",
        "otis orchards": "99027", "nine mile falls": "99026", "colbert": "99005",
        "coeur d'alene": "83814", "coeur d alene": "83814",
        "post falls": "83854", "hayden": "83835", "rathdrum": "83858",
        "spirit lake": "83869", "athol": "83801", "sandpoint": "83864",
        "oldtown": "83822", "newport": "99156", "saint regis": "59866",
        "somers": "59932", "medimont": "83842", "plains": "59859",
        "harrison": "83833", "worley": "83876", "moscow": "83843",
        "pullman": "99163", "inverness": "", "bigfork": "59911",
        "thompson falls": "59873", "superior": "59872", "priest river": "83856",
        "bonners ferry": "83805", "kellogg": "83837", "wallace": "83873",
        "sagle": "83860", "priest lake": "83856", "dalton gardens": "83815",
        "ponderay": "83852", "clarkston": "99403",
      };

      for (const prop of fixableProps) {
        const city = (prop.city || "").toLowerCase().trim();
        const cityDisplay = prop.city || "Unknown";
        const stateDisplay = prop.state || "";
        const currentZip = prop.zip || "";
        const ownerName = prop.owner_name || "";
        const address = prop.owner_flags?.address_raw ?? "";
        const needsZip = !currentZip && city;
        const needsOwnerFix = ownerName.length > 40 && !ownerName.startsWith("FSBO Owner");
        // Fix address if it contains owner name (v1 bug: used record.name as address)
        const currentAddress = (prop as Record<string, unknown>).address as string || "";
        const needsAddressFix = currentAddress.includes("FSBO") || currentAddress.includes(ownerName);
        const lookupZip = CITY_ZIP[city] || "";

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updates: Record<string, any> = {};
        if (needsZip && lookupZip) updates.zip = lookupZip;
        if (needsOwnerFix) {
          updates.owner_name = `FSBO Owner — ${cityDisplay}, ${stateDisplay}`.trim();
        }
        if (needsAddressFix) {
          // Use real address from rawData if available, otherwise city/state
          updates.address = address || `${cityDisplay}, ${stateDisplay}`;
        }

        if (Object.keys(updates).length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: upErr } = await (sb.from("properties") as any)
            .update(updates).eq("id", prop.id);
          if (upErr) {
            console.error(`[MarketplacePoll] Property update failed for ${prop.id}:`, upErr);
          } else {
            cleanupStats.propertiesFixed++;
          }
        }
      }

      console.log(`[MarketplacePoll] Cleanup complete:`, cleanupStats);
    } else {
      console.log("[MarketplacePoll] No CRAWL- properties found");
    }
  }

  const craigslistPolicy = getLeadIngestPolicy("craigslist_fsbo");
  if (craigslistPolicy.policy === "disabled") {
    const policySkip = buildLeadIngestPolicySkip("craigslist_fsbo");
    return NextResponse.json({
      success: true,
      skipped_by_policy: true,
      policy: policySkip,
      crawlers: [],
      summary: {
        totalCrawled: 0,
        totalPromoted: 0,
        totalEnriched: 0,
        totalDuplicates: 0,
        elapsed_ms: 0,
      },
      ...(cleanup && cleanupStats ? { cleanup: cleanupStats } : {}),
      timestamp: new Date().toISOString(),
    });
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
        enriched: 0,
        enrichErrors: 0,
        elapsed_ms: 0,
      });
    }
  }

  const elapsed = Date.now() - t0;
  const totalCrawled = results.reduce((s, r) => s + r.crawled, 0);
  const totalPromoted = results.reduce((s, r) => s + r.promoted, 0);
  const totalDuplicates = results.reduce((s, r) => s + r.duplicates, 0);
  const totalEnriched = results.reduce((s, r) => s + r.enriched, 0);

  console.log(`[MarketplacePoll] === CYCLE COMPLETE in ${elapsed}ms — ${totalCrawled} crawled, ${totalPromoted} promoted, ${totalEnriched} enriched, ${totalDuplicates} dupes ===`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response: Record<string, any> = {
    success: true,
    crawlers: results,
    summary: {
      totalCrawled,
      totalPromoted,
      totalEnriched,
      totalDuplicates,
      elapsed_ms: elapsed,
    },
    timestamp: new Date().toISOString(),
  };

  // Include cleanup stats if cleanup was requested
  if (cleanup && cleanupStats) {
    response.cleanup = cleanupStats;
  }

  return NextResponse.json(response);
}
