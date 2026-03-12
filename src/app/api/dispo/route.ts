import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

/**
 * GET /api/dispo — fetch deals in disposition stage
 *
 * Returns deals where the related lead has status = 'disposition',
 * joined with lead (for address, seller name) and property info,
 * plus linked deal_buyers with buyer details.
 */
export async function GET(req: NextRequest) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Step 1: Get leads in disposition
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: leads, error: leadsErr } = await (sb.from("leads") as any)
      .select("id, full_name, status, property_id")
      .eq("status", "disposition");

    if (leadsErr) return NextResponse.json({ error: leadsErr.message }, { status: 500 });
    if (!leads || leads.length === 0) {
      return NextResponse.json({ deals: [] });
    }

    const leadIds = leads.map((l: { id: string }) => l.id);

    // Step 2: Get deals for those leads
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: deals, error: dealsErr } = await (sb.from("deals") as any)
      .select("*")
      .in("lead_id", leadIds);

    if (dealsErr) return NextResponse.json({ error: dealsErr.message }, { status: 500 });

    // Step 3: Get properties for address info
    const propertyIds = [...new Set(leads.map((l: { property_id: string }) => l.property_id).filter(Boolean))];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let properties: Record<string, any> = {};
    if (propertyIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: props } = await (sb.from("properties") as any)
        .select("id, address, city, state, zip, county, property_type, estimated_value")
        .in("id", propertyIds);
      if (props) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        properties = Object.fromEntries(props.map((p: any) => [p.id, p]));
      }
    }

    // Step 4: Get deal_buyers for all these deals
    const dealIds = (deals ?? []).map((d: { id: string }) => d.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let dealBuyersMap: Record<string, any[]> = {};
    if (dealIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: dbs } = await (sb.from("deal_buyers") as any)
        .select("*, buyer:buyers(*)")
        .in("deal_id", dealIds)
        .order("created_at", { ascending: false });
      if (dbs) {
        for (const db of dbs) {
          if (!dealBuyersMap[db.deal_id]) dealBuyersMap[db.deal_id] = [];
          dealBuyersMap[db.deal_id].push(db);
        }
      }
    }

    // Step 5: Build lead lookup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leadMap: Record<string, any> = Object.fromEntries(leads.map((l: any) => [l.id, l]));

    // Step 6: Assemble response
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (deals ?? []).map((deal: any) => {
      const lead = leadMap[deal.lead_id];
      const property = lead?.property_id ? properties[lead.property_id] : null;
      return {
        ...deal,
        lead_name: lead?.full_name ?? null,
        property_address: property
          ? [property.address, property.city, property.state].filter(Boolean).join(", ")
          : null,
        property_county: property?.county ?? null,
        property_type: property?.property_type ?? null,
        estimated_value: property?.estimated_value ?? null,
        dispo_prep: deal.dispo_prep ?? null,
        deal_buyers: dealBuyersMap[deal.id] ?? [],
      };
    });

    return NextResponse.json({ deals: result });
  } catch (err) {
    console.error("[API/dispo] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
