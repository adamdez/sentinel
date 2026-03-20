import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServerClient } from "@/lib/supabase";
import { searchMLS, getSoldComps, checkActiveListing, isMLSConfigured } from "@/providers/mls/adapter";

export const runtime = "nodejs";

/**
 * GET /api/mls?action=search|comps|active&...
 *
 * MLS integration endpoint. Searches listings, gets sold comps,
 * or checks for active listings.
 *
 * Query params:
 *   action=search: Full MLS search with filters
 *   action=comps: Sold comps for a property
 *   action=active: Check if address is actively listed
 *   action=status: Check MLS configuration status
 */
export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action") ?? "status";

  if (action === "status") {
    return NextResponse.json({
      configured: isMLSConfigured(),
      apiUrlSet: !!process.env.MLS_API_URL,
      apiKeySet: !!process.env.MLS_API_KEY,
      note: isMLSConfigured()
        ? "MLS integration active"
        : "MLS not configured — set MLS_API_URL and MLS_API_KEY. Comp searches fall back to PropertyRadar/ATTOM.",
    });
  }

  if (!isMLSConfigured()) {
    return NextResponse.json({
      error: "MLS not configured",
      fallback: "Use /api/comps/search which queries PropertyRadar and ATTOM as fallback",
    }, { status: 503 });
  }

  switch (action) {
    case "search": {
      const results = await searchMLS({
        city: searchParams.get("city") ?? undefined,
        county: searchParams.get("county") ?? undefined,
        state: searchParams.get("state") ?? "WA",
        zip: searchParams.get("zip") ?? undefined,
        status: searchParams.get("status")?.split(",") ?? ["active"],
        minPrice: searchParams.get("minPrice") ? Number(searchParams.get("minPrice")) : undefined,
        maxPrice: searchParams.get("maxPrice") ? Number(searchParams.get("maxPrice")) : undefined,
        minBeds: searchParams.get("minBeds") ? Number(searchParams.get("minBeds")) : undefined,
        limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : 25,
        soldWithinDays: searchParams.get("soldWithinDays") ? Number(searchParams.get("soldWithinDays")) : undefined,
      });
      return NextResponse.json({ listings: results, count: results.length });
    }

    case "comps": {
      const address = searchParams.get("address");
      const city = searchParams.get("city");
      const state = searchParams.get("state") ?? "WA";

      if (!address || !city) {
        return NextResponse.json({ error: "address and city required for comps" }, { status: 400 });
      }

      const comps = await getSoldComps({
        address,
        city,
        state,
        soldWithinDays: searchParams.get("soldWithinDays") ? Number(searchParams.get("soldWithinDays")) : 180,
        limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : 10,
      });
      return NextResponse.json({ comps, count: comps.length });
    }

    case "active": {
      const address = searchParams.get("address");
      if (!address) {
        return NextResponse.json({ error: "address required" }, { status: 400 });
      }

      const listing = await checkActiveListing(address);
      return NextResponse.json({
        isListed: !!listing,
        listing,
      });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
