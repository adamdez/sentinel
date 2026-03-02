import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const ADMIN_EMAILS = [
  "adam@dominionhomedeals.com",
  "nathan@dominionhomedeals.com",
  "logan@dominionhomedeals.com",
];

/**
 * POST /api/enrichment/backfill
 *
 * One-time admin endpoint to reset existing unenriched "prospect" leads
 * back to "staging" so the enrichment cron can pick them up.
 *
 * Targets leads where the property has:
 *   - enrichment_pending = true in owner_flags, OR
 *   - owner_name = 'Unknown' or 'Unknown Owner', OR
 *   - estimated_value is null AND address is empty/generic
 *
 * Auth: Admin session token or CRON_SECRET.
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();

  // Auth check
  const cronSecret = req.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;
  let authorized = false;

  if (expectedSecret && cronSecret === `Bearer ${expectedSecret}`) {
    authorized = true;
  } else {
    // Check admin email from session
    const { data: { user } } = await sb.auth.getUser();
    if (user?.email && ADMIN_EMAILS.includes(user.email)) {
      authorized = true;
    }
  }

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized — admin only" }, { status: 401 });
  }

  console.log("[Enrichment/Backfill] Starting backfill...");

  try {
    // Find all prospect leads linked to properties that need enrichment
    // Strategy: query properties that look unenriched, then update their leads

    // Step 1: Find properties with enrichment_pending flag or minimal data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prospects, error: queryErr } = await (sb.from("leads") as any)
      .select("id, property_id, status, priority, source")
      .eq("status", "prospect")
      .order("created_at", { ascending: true });

    if (queryErr) {
      console.error("[Enrichment/Backfill] Query error:", queryErr.message);
      return NextResponse.json({ error: queryErr.message }, { status: 500 });
    }

    if (!prospects || prospects.length === 0) {
      return NextResponse.json({ success: true, message: "No prospects found to backfill", reset: 0 });
    }

    // Step 2: Fetch properties for these leads
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const propertyIds = [...new Set((prospects as any[]).map((l) => l.property_id).filter(Boolean))];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: properties } = await (sb.from("properties") as any)
      .select("id, owner_name, estimated_value, address, owner_flags")
      .in("id", propertyIds);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const propMap: Record<string, any> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of (properties ?? []) as any[]) {
      propMap[p.id] = p;
    }

    // Step 3: Identify leads that need enrichment
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toReset: string[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const lead of prospects as any[]) {
      const prop = propMap[lead.property_id];
      if (!prop) {
        toReset.push(lead.id);
        continue;
      }

      const flags = (prop.owner_flags ?? {}) as Record<string, unknown>;
      const isEnrichmentPending = flags.enrichment_pending === true;
      const isUnknownOwner = prop.owner_name === "Unknown" || prop.owner_name === "Unknown Owner";
      const noValue = prop.estimated_value == null;
      const noAddress = !prop.address || prop.address === "" || prop.address === "Unknown";
      const alreadyEnriched = flags.enrichment_status === "enriched";

      // Reset if clearly unenriched and not already successfully enriched
      if (!alreadyEnriched && (isEnrichmentPending || isUnknownOwner || (noValue && noAddress))) {
        toReset.push(lead.id);
      }
    }

    if (toReset.length === 0) {
      return NextResponse.json({
        success: true,
        message: "All prospects appear to be enriched already",
        checked: prospects.length,
        reset: 0,
      });
    }

    // Step 4: Reset to staging in batches of 100
    let totalReset = 0;
    for (let i = 0; i < toReset.length; i += 100) {
      const batch = toReset.slice(i, i + 100);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateErr } = await (sb.from("leads") as any)
        .update({ status: "staging", updated_at: new Date().toISOString() })
        .in("id", batch);

      if (updateErr) {
        console.error(`[Enrichment/Backfill] Batch update error:`, updateErr.message);
      } else {
        totalReset += batch.length;
      }
    }

    // Audit log
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("event_log") as any).insert({
      user_id: "00000000-0000-0000-0000-000000000000",
      action: "enrichment.backfill",
      entity_type: "system",
      entity_id: "enrichment_backfill",
      details: {
        checked: prospects.length,
        reset: totalReset,
        timestamp: new Date().toISOString(),
      },
    });

    console.log(`[Enrichment/Backfill] Complete: ${totalReset} leads reset to staging (${prospects.length} checked)`);

    const estimatedMinutes = Math.ceil(totalReset / 10) * 15;

    return NextResponse.json({
      success: true,
      message: `${totalReset} leads reset to staging for enrichment`,
      checked: prospects.length,
      reset: totalReset,
      estimatedEnrichmentTime: `~${estimatedMinutes} minutes (${Math.ceil(totalReset / 10)} batches × 15 min cron interval)`,
    });
  } catch (err) {
    console.error("[Enrichment/Backfill] Error:", err);
    return NextResponse.json(
      { error: "Backfill failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
