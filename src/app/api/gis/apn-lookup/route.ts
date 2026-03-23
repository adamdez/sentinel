import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { SpokaneCountyGISAdapter } from "@/providers/spokane-gis/adapter";
import { KootenaiCountyGISAdapter } from "@/providers/kootenai-gis/adapter";

export const dynamic = "force-dynamic";

/**
 * GET /api/gis/apn-lookup?address=...&county=...
 *
 * Quick GIS lookup to retrieve the APN (parcel number) for an address.
 * Used by the global search to backfill APN when Bricked doesn't return one.
 */
export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const address = req.nextUrl.searchParams.get("address");
  const county = (req.nextUrl.searchParams.get("county") ?? "").toLowerCase();

  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  try {
    const adapter = county.includes("kootenai")
      ? new KootenaiCountyGISAdapter()
      : new SpokaneCountyGISAdapter();

    const result = await adapter.lookupProperty({ address, county });

    const apnFact = result.facts.find((f) => f.fieldName === "county_parcel_number");

    return NextResponse.json({
      apn: apnFact?.value ?? null,
      provider: result.provider,
    });
  } catch (err) {
    console.error("[GIS APN Lookup] Failed:", err);
    return NextResponse.json({ apn: null, provider: "error" });
  }
}
