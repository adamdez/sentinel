import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_FSBO_SOURCES = ["facebook", "craigslist", "fb", "fb_craigslist", "fsbo", "zillow_fsbo", "fsbo_com"];

// ── GET /api/leads/by-source?sources=craigslist,facebook,... ──

export async function GET(req: NextRequest) {
  try {
    const sourcesParam = req.nextUrl.searchParams.get("sources");
    const sources = sourcesParam
      ? sourcesParam.split(",").map((s) => s.trim()).filter(Boolean)
      : DEFAULT_FSBO_SOURCES;

    if (sources.length === 0) {
      return NextResponse.json(
        { error: "No sources specified", leads: [], properties: {}, predictions: {} },
        { status: 400 },
      );
    }

    const sb = createServerClient();

    // Fetch leads matching any of the source values (across all active statuses)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: leadsData, error: leadsError } = await (sb.from("leads") as any)
      .select("*")
      .in("source", sources)
      .order("priority", { ascending: false });

    if (leadsError) {
      console.error("[API/leads/by-source] Leads query failed:", leadsError);
      return NextResponse.json({ error: leadsError.message, leads: [], properties: {}, predictions: {} }, { status: 500 });
    }

    if (!leadsData || leadsData.length === 0) {
      return NextResponse.json({ leads: [], properties: {}, predictions: {} });
    }

    // Fetch properties + predictions in parallel
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const propertyIds: string[] = [...new Set((leadsData as any[]).map((l: any) => l.property_id).filter(Boolean))];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const propertiesMap: Record<string, any> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const predictionsMap: Record<string, any> = {};

    if (propertyIds.length > 0) {
      const [propsResult, predsResult] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sb.from("properties") as any)
          .select("id, apn, county, address, city, state, zip, owner_name, owner_phone, owner_email, estimated_value, equity_percent, property_type, bedrooms, bathrooms, sqft, year_built, lot_size, owner_flags")
          .in("id", propertyIds),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sb.from("scoring_predictions") as any)
          .select("property_id, predictive_score, days_until_distress, confidence, owner_age_inference, equity_burn_rate, life_event_probability")
          .in("property_id", propertyIds)
          .order("created_at", { ascending: false }),
      ]);

      if (propsResult.data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const p of propsResult.data as any[]) {
          propertiesMap[p.id] = p;
        }
      }
      if (predsResult.data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const p of predsResult.data as any[]) {
          if (!(p.property_id in predictionsMap)) predictionsMap[p.property_id] = p;
        }
      }
    }

    console.log(`[API/leads/by-source] sources=[${sources.join(",")}]: ${leadsData.length} leads, ${Object.keys(propertiesMap).length} properties`);

    const res = NextResponse.json({
      leads: leadsData,
      properties: propertiesMap,
      predictions: predictionsMap,
    });
    res.headers.set("Cache-Control", "private, s-maxage=30, stale-while-revalidate=60");
    return res;
  } catch (err) {
    console.error("[API/leads/by-source] Error:", err);
    return NextResponse.json(
      { error: "Internal server error", leads: [], properties: {}, predictions: {} },
      { status: 500 },
    );
  }
}
