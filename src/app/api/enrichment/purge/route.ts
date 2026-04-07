import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireUserOrCron } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/enrichment/purge
 *
 * Operator endpoint to purge garbage leads - prospects or staging leads
 * whose properties have no real address or owner name.
 *
 * This handles the case where bulk-seed inserted properties with empty
 * address fields from PropertyRadar, which then got promoted to "prospect"
 * with "Unknown" owner and no usable data.
 *
 * Actions:
 *   ?mode=preview  (default) - dry-run, returns count + sample of what would be purged
 *   ?mode=delete   - permanently deletes garbage leads and their orphan properties
 *   ?mode=demote   - moves garbage prospects back to staging
 *
 * Auth: authenticated user session or CRON_SECRET.
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const auth = await requireUserOrCron(req, sb);

  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") ?? "preview";

  if (!["preview", "delete", "demote"].includes(mode)) {
    return NextResponse.json(
      { error: `Invalid mode: "${mode}". Must be one of: preview, delete, demote` },
      { status: 400 },
    );
  }

  try {
    console.log(`[Purge] Starting garbage lead scan (mode=${mode})`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allLeads, error: queryErr } = await (sb.from("leads") as any)
      .select("id, status, priority, tags, source, property_id, properties!inner(id, address, owner_name, city, apn, county)")
      .in("status", ["prospect", "staging", "lead"])
      .order("priority", { ascending: false })
      .limit(5000);

    if (queryErr) {
      console.error("[Purge] Query error:", queryErr.message);
      return NextResponse.json({ error: "Query failed", detail: queryErr.message }, { status: 500 });
    }

    if (!allLeads || allLeads.length === 0) {
      return NextResponse.json({ success: true, mode, garbage: 0, message: "No leads found" });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const garbageLeads = allLeads.filter((lead: any) => {
      const prop = lead.properties;
      if (!prop) return true;

      const addr = (prop.address ?? "").trim();
      const owner = (prop.owner_name ?? "").trim();

      const badAddress =
        addr.length < 5 ||
        addr === "WA" ||
        addr === "ID" ||
        /^\s*[A-Z]{2}\s*$/.test(addr) ||
        /^\s*[A-Z]{2},?\s*\d{0,5}\s*$/.test(addr);

      const badOwner =
        owner === "" ||
        owner.toLowerCase() === "unknown" ||
        owner.toLowerCase() === "unknown owner" ||
        owner.toLowerCase() === "n/a";

      return badAddress || badOwner;
    });

    const garbageCount = garbageLeads.length;
    const byStatus: Record<string, number> = {};

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    garbageLeads.forEach((lead: any) => {
      byStatus[lead.status] = (byStatus[lead.status] ?? 0) + 1;
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sample = garbageLeads.slice(0, 10).map((lead: any) => ({
      leadId: lead.id,
      status: lead.status,
      score: lead.priority,
      address: lead.properties?.address ?? "(null)",
      owner: lead.properties?.owner_name ?? "(null)",
      apn: lead.properties?.apn ?? "(null)",
      county: lead.properties?.county ?? "(null)",
      source: lead.source,
    }));

    console.log(`[Purge] Found ${garbageCount} garbage leads (by status: ${JSON.stringify(byStatus)})`);

    if (mode === "preview") {
      return NextResponse.json({
        success: true,
        mode: "preview",
        garbage: garbageCount,
        byStatus,
        sample,
        message: `Found ${garbageCount} garbage leads. Use ?mode=delete to remove or ?mode=demote to move back to staging.`,
      });
    }

    if (mode === "demote") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prospectIds = garbageLeads.filter((lead: any) => lead.status === "prospect").map((lead: any) => lead.id);
      let demoted = 0;

      for (let i = 0; i < prospectIds.length; i += 100) {
        const batch = prospectIds.slice(i, i + 100);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updateErr } = await (sb.from("leads") as any)
          .update({ status: "staging", promoted_at: null, updated_at: new Date().toISOString() })
          .in("id", batch);

        if (updateErr) {
          console.error("[Purge] Demote batch error:", updateErr.message);
        } else {
          demoted += batch.length;
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("event_log") as any).insert({
        user_id: "00000000-0000-0000-0000-000000000000",
        action: "enrichment.purge_demote",
        entity_type: "system",
        entity_id: "enrichment_purge",
        details: { garbage: garbageCount, demoted, byStatus, timestamp: new Date().toISOString() },
      });

      return NextResponse.json({
        success: true,
        mode: "demote",
        garbage: garbageCount,
        demoted,
        byStatus,
        message: `Demoted ${demoted} garbage prospects back to staging.`,
      });
    }

    if (mode === "delete") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const leadIds = garbageLeads.map((lead: any) => lead.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const propertyIds = [...new Set(garbageLeads.map((lead: any) => lead.property_id))];
      let deletedLeads = 0;
      let deletedProperties = 0;

      for (let i = 0; i < leadIds.length; i += 100) {
        const batch = leadIds.slice(i, i + 100);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: delErr } = await (sb.from("leads") as any).delete().in("id", batch);
        if (delErr) {
          console.error("[Purge] Delete leads batch error:", delErr.message);
        } else {
          deletedLeads += batch.length;
        }
      }

      for (let i = 0; i < propertyIds.length; i += 50) {
        const batch = propertyIds.slice(i, i + 50);

        for (const propId of batch) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { count } = await (sb.from("leads") as any)
            .select("id", { count: "exact", head: true })
            .eq("property_id", propId);

          if ((count ?? 0) === 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error: propDelErr } = await (sb.from("properties") as any)
              .delete()
              .eq("id", propId);

            if (!propDelErr) deletedProperties++;
          }
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("event_log") as any).insert({
        user_id: "00000000-0000-0000-0000-000000000000",
        action: "enrichment.purge_delete",
        entity_type: "system",
        entity_id: "enrichment_purge",
        details: {
          garbage: garbageCount,
          deletedLeads,
          deletedProperties,
          byStatus,
          timestamp: new Date().toISOString(),
        },
      });

      return NextResponse.json({
        success: true,
        mode: "delete",
        garbage: garbageCount,
        deletedLeads,
        deletedProperties,
        byStatus,
        message: `Deleted ${deletedLeads} garbage leads and ${deletedProperties} orphan properties.`,
      });
    }

    return NextResponse.json({ error: "Unknown mode" }, { status: 400 });
  } catch (err) {
    console.error("[Purge] Error:", err);
    return NextResponse.json(
      { error: "Purge failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
