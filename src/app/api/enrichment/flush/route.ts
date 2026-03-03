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
 * Nuclear reset — moves ALL current prospects back to staging and clears
 * their enrichment flags so the cron re-enriches them from scratch.
 *
 * After flush:
 *   - Prospect folder is empty (agents see nothing temporarily)
 *   - Reservoir has all leads, enrichment_status reset to "pending"
 *   - Enrichment cron picks them up automatically every 15 min
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

    // Step 2: Reset all prospect leads → staging
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: leadErr } = await (sb.from("leads") as any)
      .update({
        status: "staging",
        priority: 0,
        tags: [],
        notes: "Flushed to reservoir for re-enrichment",
        updated_at: new Date().toISOString(),
      })
      .eq("status", "prospect");

    if (leadErr) {
      console.error("[Enrichment/Flush] Lead reset error:", leadErr.message);
      return NextResponse.json({ error: leadErr.message }, { status: 500 });
    }

    // Step 3: Also reset any staging leads that were already enriched
    // (so they get a fresh pass through the pipeline)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: stagingErr } = await (sb.from("leads") as any)
      .update({
        priority: 0,
        tags: [],
        notes: "Flushed to reservoir for re-enrichment",
        updated_at: new Date().toISOString(),
      })
      .eq("status", "staging");

    if (stagingErr) {
      console.error("[Enrichment/Flush] Staging reset error:", stagingErr.message);
    }

    // Step 4: Clear enrichment flags on ALL properties so they get re-enriched
    // We need to reset enrichment_status, enrichment_pending, enrichment_attempts
    // Fetch all properties linked to staging leads
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allLeads } = await (sb.from("leads") as any)
      .select("property_id")
      .eq("status", "staging");

    const propertyIds = [...new Set((allLeads ?? []).map((l: { property_id: string }) => l.property_id).filter(Boolean))];

    let propsReset = 0;
    for (let i = 0; i < propertyIds.length; i += 100) {
      const chunk = propertyIds.slice(i, i + 100);
      // Fetch current owner_flags for each property, then reset enrichment fields
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: props } = await (sb.from("properties") as any)
        .select("id, owner_flags")
        .in("id", chunk);

      for (const prop of (props ?? []) as { id: string; owner_flags: Record<string, unknown> }[]) {
        const flags = prop.owner_flags ?? {};
        // Keep pr_raw and other data but reset enrichment tracking
        const resetFlags = {
          ...flags,
          enrichment_status: "pending",
          enrichment_pending: true,
          enrichment_attempts: 0,
          enrichment_last_attempt: null,
          enrichment_completed_at: null,
          enrichment_error: null,
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("properties") as any)
          .update({ owner_flags: resetFlags, updated_at: new Date().toISOString() })
          .eq("id", prop.id);
        propsReset++;
      }
    }

    // Step 5: Count total staging after flush
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
        properties_reset: propsReset,
        total_staging: stagingCount ?? 0,
        timestamp: new Date().toISOString(),
      },
    });

    console.log(`[Enrichment/Flush] Complete: ${prospectCount} prospects → staging, ${propsReset} properties reset, ${stagingCount} total in reservoir`);

    return NextResponse.json({
      success: true,
      message: `Flush complete — ${prospectCount} prospects moved to staging, ${propsReset} properties reset for re-enrichment`,
      prospects_flushed: prospectCount ?? 0,
      properties_reset: propsReset,
      total_staging: stagingCount ?? 0,
      note: "Enrichment cron will automatically process these every 15 minutes. Promote platinum/gold when ready.",
    });
  } catch (err) {
    console.error("[Enrichment/Flush] Error:", err);
    return NextResponse.json(
      { error: "Flush failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
