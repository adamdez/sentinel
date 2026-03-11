import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireImportUser } from "@/lib/imports-server";

export async function GET(req: NextRequest) {
  try {
    const sb = createServerClient();
    const user = await requireImportUser(req.headers.get("authorization"), sb);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (sb.from("event_log") as any)
      .select("id, entity_id, created_at, details")
      .eq("entity_type", "inbound_intake_item")
      .eq("action", "inbound.received")
      .order("created_at", { ascending: false })
      .limit(80);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const items = (rows ?? []) as Array<{ id: string; entity_id: string; created_at: string; details: Record<string, unknown> }>;
    const leadIds = Array.from(new Set(items.map((item) => typeof item.details?.lead_id === "string" ? item.details.lead_id : null).filter(Boolean))) as string[];

    const leadMap: Record<string, { lead: Record<string, unknown>; property: Record<string, unknown> | null }> = {};
    if (leadIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: leads } = await (sb.from("leads") as any)
        .select("*")
        .in("id", leadIds);
      const propertyIds = Array.from(new Set(((leads ?? []) as Array<{ property_id: string | null }>).map((lead) => lead.property_id).filter(Boolean))) as string[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: properties } = propertyIds.length > 0 ? await (sb.from("properties") as any)
        .select("*")
        .in("id", propertyIds) : { data: [] };
      const propertyMap = Object.fromEntries(((properties ?? []) as Array<Record<string, unknown>>).map((property) => [String(property.id), property]));
      for (const lead of (leads ?? []) as Array<Record<string, unknown>>) {
        leadMap[String(lead.id)] = {
          lead,
          property: propertyMap[String(lead.property_id)] ?? null,
        };
      }
    }

    return NextResponse.json({
      success: true,
      items: items.map((item) => {
        const leadId = typeof item.details?.lead_id === "string" ? item.details.lead_id : null;
        return {
          id: item.entity_id,
          createdAt: item.created_at,
          details: item.details,
          leadBundle: leadId ? leadMap[leadId] ?? null : null,
        };
      }),
    });
  } catch (error) {
    console.error("[Inbound Queue] Failed:", error);
    return NextResponse.json({ error: "Failed to load inbound queue" }, { status: 500 });
  }
}
