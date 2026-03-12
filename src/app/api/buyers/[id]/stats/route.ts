import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

/**
 * GET /api/buyers/[id]/stats — buyer performance summary
 *
 * Computes aggregate stats from deal_buyers for this buyer:
 * - times linked, contacted, responded, interested, offered, selected
 * - response rate
 * - recent deal activity (last 5)
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    // Validate buyer exists
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: buyer, error: buyerErr } = await (sb.from("buyers") as any)
      .select("id")
      .eq("id", id)
      .single();

    if (buyerErr || !buyer) {
      return NextResponse.json({ error: "Buyer not found" }, { status: 404 });
    }

    // Fetch all deal_buyers for this buyer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: links, error } = await (sb.from("deal_buyers") as any)
      .select("id, deal_id, status, date_contacted, responded_at, offer_amount, created_at, updated_at")
      .eq("buyer_id", id)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const all = links ?? [];
    const total = all.length;

    // Status counts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contacted = all.filter((r: any) =>
      !["not_contacted", "queued"].includes(r.status)
    ).length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const responded = all.filter((r: any) =>
      ["interested", "offered", "follow_up", "selected"].includes(r.status)
      || (r.status === "passed" && r.responded_at)
    ).length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const interested = all.filter((r: any) =>
      ["interested", "offered", "selected"].includes(r.status)
    ).length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const offered = all.filter((r: any) =>
      ["offered", "selected"].includes(r.status)
    ).length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const selected = all.filter((r: any) => r.status === "selected").length;

    // Response rate
    const responseRate = contacted > 0 ? Math.round((responded / contacted) * 100) : null;

    // Avg response time (days) — only where both dates exist
    const responseTimes = all
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((r: any) => r.date_contacted && r.responded_at)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) => {
        const diff = new Date(r.responded_at).getTime() - new Date(r.date_contacted).getTime();
        return diff / (1000 * 60 * 60 * 24);
      })
      .filter((d: number) => d >= 0);

    const avgResponseDays = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a: number, b: number) => a + b, 0) / responseTimes.length * 10) / 10
      : null;

    // Recent deals — fetch deal context for last 5
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recentIds = all.slice(0, 5).map((r: any) => r.deal_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let dealMap: Record<string, any> = {};
    if (recentIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: deals } = await (sb.from("deals") as any)
        .select("id, lead_id, contract_price")
        .in("id", recentIds);

      if (deals) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const leadIds = deals.map((d: any) => d.lead_id).filter(Boolean);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let leadMap: Record<string, any> = {};
        if (leadIds.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: leads } = await (sb.from("leads") as any)
            .select("id, property_id")
            .in("id", leadIds);
          if (leads) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const propIds = leads.map((l: any) => l.property_id).filter(Boolean);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let propMap: Record<string, any> = {};
            if (propIds.length > 0) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { data: props } = await (sb.from("properties") as any)
                .select("id, address, city")
                .in("id", propIds);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              if (props) propMap = Object.fromEntries(props.map((p: any) => [p.id, p]));
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            leadMap = Object.fromEntries(leads.map((l: any) => [l.id, { ...l, property: propMap[l.property_id] }]));
          }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        dealMap = Object.fromEntries(deals.map((d: any) => [d.id, { ...d, lead: leadMap[d.lead_id] }]));
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recentDeals = all.slice(0, 5).map((r: any) => {
      const deal = dealMap[r.deal_id];
      const prop = deal?.lead?.property;
      return {
        deal_buyer_status: r.status,
        offer_amount: r.offer_amount,
        date_contacted: r.date_contacted,
        linked_at: r.created_at,
        property_address: prop ? [prop.address, prop.city].filter(Boolean).join(", ") : null,
        contract_price: deal?.contract_price ?? null,
      };
    });

    return NextResponse.json({
      stats: {
        total_linked: total,
        contacted,
        responded,
        interested,
        offered,
        selected,
        response_rate: responseRate,
        avg_response_days: avgResponseDays,
        recent_deals: recentDeals,
      },
    });
  } catch (err) {
    console.error("[API/buyers/id/stats] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
