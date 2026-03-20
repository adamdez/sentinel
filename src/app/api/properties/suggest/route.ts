import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

/**
 * GET /api/properties/suggest?q=123+Main
 *
 * Universal address search / typeahead. Searches existing properties in the DB
 * by address prefix match. Returns up to 10 results with lead status if linked.
 *
 * Blueprint 3.1: "Universal address search from the main shell."
 * Blueprint 9: "Any-address evaluation and promotion."
 *
 * This searches ONLY local DB. For external provider lookups, use
 * POST /api/properties/lookup with the full address.
 */
export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 3) {
    return NextResponse.json({ results: [] });
  }

  try {
    // Search properties by address prefix (case-insensitive)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: properties, error } = await (sb.from("properties") as any)
      .select(`
        id, address, city, state, zip, county, owner_name, apn,
        leads(id, status, next_action, priority, motivation_level)
      `)
      .ilike("address", `%${q}%`)
      .order("updated_at", { ascending: false })
      .limit(10);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const results = (properties ?? []).map((p: Record<string, unknown>) => {
      const leads = p.leads as Array<Record<string, unknown>> | null;
      const activeLead = leads?.find(
        (l) => l.status !== "dead" && l.status !== "closed",
      );
      return {
        propertyId: p.id,
        address: p.address,
        city: p.city,
        state: p.state,
        zip: p.zip,
        county: p.county,
        ownerName: p.owner_name,
        apn: p.apn,
        hasActiveLead: !!activeLead,
        leadId: activeLead?.id ?? null,
        leadStatus: activeLead?.status ?? null,
      };
    });

    return NextResponse.json({ results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
