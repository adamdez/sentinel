/**
 * One-time cleanup endpoint to purge stale FSBO records from v1 crawler.
 * Removes leads, distress_events, and properties with synthetic CRAWL- APNs
 * that were created by the v1 crawler with bad data quality.
 *
 * After purge, re-trigger marketplace-poll to recreate with v2 clean data.
 *
 * Auth: CRON_SECRET header (same as other ingest endpoints)
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const maxDuration = 120;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization")?.replace("Bearer ", "");
  if (auth !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createServerClient();
  const stats = { leadsDeleted: 0, eventsDeleted: 0, propertiesDeleted: 0, errors: [] as string[] };

  try {
    // 1. Find all properties with synthetic CRAWL- APNs (created by FSBO crawler)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: crawlProps, error: propsErr } = await (sb.from("properties") as any)
      .select("id, apn")
      .like("apn", "CRAWL-%");

    if (propsErr) {
      stats.errors.push(`Failed to fetch CRAWL properties: ${propsErr.message}`);
      return NextResponse.json({ success: false, stats });
    }

    if (!crawlProps || crawlProps.length === 0) {
      return NextResponse.json({ success: true, message: "No CRAWL properties found", stats });
    }

    const propIds = crawlProps.map((p: { id: string }) => p.id);
    console.log(`[CLEANUP-FSBO] Found ${propIds.length} CRAWL- properties to purge`);

    // 2. Delete leads referencing these properties
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: leadsCount, error: leadsErr } = await (sb.from("leads") as any)
      .delete({ count: "exact" })
      .in("property_id", propIds);

    if (leadsErr) {
      stats.errors.push(`Failed to delete leads: ${leadsErr.message}`);
    } else {
      stats.leadsDeleted = leadsCount ?? 0;
    }

    // 3. Delete distress_events referencing these properties
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: eventsCount, error: eventsErr } = await (sb.from("distress_events") as any)
      .delete({ count: "exact" })
      .in("property_id", propIds);

    if (eventsErr) {
      stats.errors.push(`Failed to delete distress_events: ${eventsErr.message}`);
    } else {
      stats.eventsDeleted = eventsCount ?? 0;
    }

    // 4. Delete the properties themselves
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: propsCount, error: delPropsErr } = await (sb.from("properties") as any)
      .delete({ count: "exact" })
      .in("id", propIds);

    if (delPropsErr) {
      stats.errors.push(`Failed to delete properties: ${delPropsErr.message}`);
    } else {
      stats.propertiesDeleted = propsCount ?? 0;
    }

    console.log(`[CLEANUP-FSBO] Purge complete:`, stats);
    return NextResponse.json({ success: true, stats });
  } catch (err) {
    console.error("[CLEANUP-FSBO] Fatal error:", err);
    return NextResponse.json({ success: false, error: String(err), stats }, { status: 500 });
  }
}
