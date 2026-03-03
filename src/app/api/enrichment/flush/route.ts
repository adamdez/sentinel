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
 * POST /api/enrichment/flush
 *
 * Nuclear reset — moves ALL current prospects back to staging and resets
 * their priority so the enrichment cron re-processes them from scratch.
 *
 * After flush:
 *   - Prospect folder is empty (agents see nothing temporarily)
 *   - Reservoir has all leads with priority=0 (triggers re-enrichment)
 *   - Enrichment cron picks them up automatically every 15 min (50/batch)
 *   - Admin promotes platinum/gold when ready
 *
 * Auth: Admin session or CRON_SECRET.
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
    const { data: { user } } = await sb.auth.getUser();
    if (user?.email && ADMIN_EMAILS.includes(user.email)) {
      authorized = true;
    }
  }

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized — admin only" }, { status: 401 });
  }

  console.log("[Enrichment/Flush] Starting full flush — all prospects → staging...");

  try {
    // Step 1: Count current prospects
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: prospectCount } = await (sb.from("leads") as any)
      .select("id", { count: "exact", head: true })
      .eq("status", "prospect");

    // Step 2: Reset ALL prospect leads → staging with priority=0
    // Priority=0 tells the batch filter this lead needs re-enrichment
    // even if the property already has enrichment_status = "enriched"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: prospectErr } = await (sb.from("leads") as any)
      .update({
        status: "staging",
        priority: 0,
        tags: [],
        notes: "Flushed to reservoir for re-enrichment",
        updated_at: new Date().toISOString(),
      })
      .eq("status", "prospect");

    if (prospectErr) {
      console.error("[Enrichment/Flush] Prospect reset error:", prospectErr.message);
      return NextResponse.json({ error: prospectErr.message }, { status: 500 });
    }

    // Step 3: Also reset any EXISTING staging leads that were already enriched
    // so they also get a fresh pass
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: stagingErr } = await (sb.from("leads") as any)
      .update({
        priority: 0,
        tags: [],
        notes: "Flushed to reservoir for re-enrichment",
        updated_at: new Date().toISOString(),
      })
      .eq("status", "staging")
      .gt("priority", 0);

    if (stagingErr) {
      console.error("[Enrichment/Flush] Staging reset error:", stagingErr.message);
    }

    // Step 4: Count total staging after flush
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: stagingCount } = await (sb.from("leads") as any)
      .select("id", { count: "exact", head: true })
      .eq("status", "staging");

    // Audit log
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("event_log") as any).insert({
      user_id: "00000000-0000-0000-0000-000000000000",
      action: "enrichment.flush",
      entity_type: "system",
      entity_id: "enrichment_flush",
      details: {
        prospects_flushed: prospectCount ?? 0,
        total_staging: stagingCount ?? 0,
        timestamp: new Date().toISOString(),
      },
    });

    console.log(`[Enrichment/Flush] Complete: ${prospectCount} prospects → staging, ${stagingCount} total in reservoir`);

    const batchesNeeded = Math.ceil((stagingCount ?? 0) / 50);
    const estimatedMinutes = batchesNeeded * 15;

    return NextResponse.json({
      success: true,
      message: `Flush complete — ${prospectCount} prospects moved to staging for re-enrichment`,
      prospects_flushed: prospectCount ?? 0,
      total_staging: stagingCount ?? 0,
      estimated_enrichment: `~${estimatedMinutes} minutes (${batchesNeeded} batches × 15 min cron)`,
      note: "Enrichment cron runs every 15 min, processing 50 leads per batch. Promote platinum/gold when ready.",
    });
  } catch (err) {
    console.error("[Enrichment/Flush] Error:", err);
    return NextResponse.json(
      { error: "Flush failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
