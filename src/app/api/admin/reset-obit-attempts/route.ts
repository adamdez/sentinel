import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/admin/reset-obit-attempts
 *
 * Resets enrichment_attempts for CRAWL-* properties so the new
 * deceased-search pipeline can re-process them from scratch.
 *
 * Also resets the lead status to "staging" if currently stuck at
 * enrichment_status = "partial" or "failed".
 *
 * Auth: CRON_SECRET header.
 */
export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret || cronSecret !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createServerClient();

  try {
    console.log("[ResetObitAttempts] Finding CRAWL-* properties...");

    // Find all properties with CRAWL-* APNs that have enrichment_attempts >= 1
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: properties, error: queryErr } = await (sb.from("properties") as any)
      .select("id, apn, owner_flags")
      .like("apn", "CRAWL-%")
      .limit(5000);

    if (queryErr) {
      console.error("[ResetObitAttempts] Query error:", queryErr.message);
      return NextResponse.json({ error: queryErr.message }, { status: 500 });
    }

    if (!properties || properties.length === 0) {
      return NextResponse.json({ success: true, message: "No CRAWL-* properties found", reset: 0 });
    }

    // Filter to those with enrichment_attempts > 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const needsReset = properties.filter((p: any) => {
      const flags = p.owner_flags ?? {};
      const attempts = flags.enrichment_attempts ?? 0;
      return attempts > 0;
    });

    console.log(`[ResetObitAttempts] ${needsReset.length} of ${properties.length} CRAWL-* properties need reset`);

    let resetCount = 0;
    const errors: string[] = [];

    // Reset each property's enrichment state
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const prop of needsReset as any[]) {
      try {
        const flags = { ...prop.owner_flags };
        // Reset attempt counter and status
        flags.enrichment_attempts = 0;
        flags.enrichment_pending = true;
        flags.enrichment_status = "pending";
        delete flags.enrichment_error;
        delete flags.enrichment_last_attempt;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updateErr } = await (sb.from("properties") as any)
          .update({
            owner_flags: flags,
            updated_at: new Date().toISOString(),
          })
          .eq("id", prop.id);

        if (updateErr) {
          errors.push(`${prop.id}: ${updateErr.message}`);
        } else {
          resetCount++;
        }
      } catch (err) {
        errors.push(`${prop.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Also reset the associated leads back to staging if they were finalized
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const propertyIds = needsReset.map((p: any) => p.id);

    // Find leads for these properties that are stuck
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: leads } = await (sb.from("leads") as any)
      .select("id, status, property_id")
      .in("property_id", propertyIds)
      .in("status", ["staging"]);

    let leadsReset = 0;
    if (leads && leads.length > 0) {
      // Reset lead priority to 0 so batch picks them up
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const leadIds = leads.map((l: any) => l.id);
      for (let i = 0; i < leadIds.length; i += 100) {
        const batch = leadIds.slice(i, i + 100);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: leadErr } = await (sb.from("leads") as any)
          .update({
            priority: 0,
            updated_at: new Date().toISOString(),
          })
          .in("id", batch);

        if (!leadErr) {
          leadsReset += batch.length;
        }
      }
    }

    // Audit log
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("event_log") as any).insert({
      user_id: "00000000-0000-0000-0000-000000000000",
      action: "admin.reset_obit_attempts",
      entity_type: "system",
      entity_id: "reset_obit_attempts",
      details: {
        total_crawl_properties: properties.length,
        properties_reset: resetCount,
        leads_reset: leadsReset,
        errors: errors.length,
        timestamp: new Date().toISOString(),
      },
    });

    console.log(`[ResetObitAttempts] Done: ${resetCount} properties reset, ${leadsReset} leads reset`);

    return NextResponse.json({
      success: true,
      total_crawl_properties: properties.length,
      properties_reset: resetCount,
      leads_reset: leadsReset,
      errors: errors.length,
      errorSample: errors.slice(0, 5),
    });
  } catch (err) {
    console.error("[ResetObitAttempts] Error:", err);
    return NextResponse.json(
      { error: "Reset failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
