/**
 * County GIS Lookup — routes to the correct county adapter
 *
 * Spokane County WA → spokaneGisAdapter (ArcGIS Online, reliable)
 * Kootenai County ID → kootenaiGisAdapter (self-hosted ArcGIS, may be down)
 * Other → { skipped: true }
 *
 * Returns canonical facts + raw payload for dossier_artifacts storage.
 * Free public APIs — no cost, no API key needed.
 */

import { NextResponse } from "next/server";
import { spokaneGisAdapter } from "@/providers/spokane-gis/adapter";
import { kootenaiGisAdapter } from "@/providers/kootenai-gis/adapter";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { address, county, state, apn } = body as {
      address?: string;
      county?: string;
      state?: string;
      apn?: string;
    };

    if (!address && !apn) {
      return NextResponse.json(
        { error: "address or apn required" },
        { status: 400 }
      );
    }

    const countyLower = (county ?? "").toLowerCase();
    const stateUpper = (state ?? "").toUpperCase();

    // Route to the correct county adapter
    let result;

    if (countyLower.includes("spokane") && stateUpper === "WA") {
      result = await spokaneGisAdapter.lookupProperty({
        address,
        apn,
        county,
        state,
      });
    } else if (countyLower.includes("kootenai") && stateUpper === "ID") {
      result = await kootenaiGisAdapter.lookupProperty({
        address,
        apn,
        county,
        state,
      });
    } else {
      return NextResponse.json({
        skipped: true,
        reason: `No GIS adapter for ${county ?? "unknown"} County, ${state ?? "unknown"}`,
      });
    }

    // Extract structured data from canonical facts
    const factsMap = new Map(result.facts.map((f) => [f.fieldName, f.value]));

    // Parse sales history if it's a JSON string
    let salesHistory: Array<{ date: string | null; price: number }> = [];
    const salesRaw = factsMap.get("county_sales_history");
    if (typeof salesRaw === "string") {
      try {
        salesHistory = JSON.parse(salesRaw);
      } catch {
        // ignore parse errors
      }
    }

    // Parse geometry if it's a JSON string
    let parcelGeometry: number[][][] | null = null;
    const geomRaw = factsMap.get("county_parcel_geometry");
    if (typeof geomRaw === "string") {
      try {
        parcelGeometry = JSON.parse(geomRaw);
      } catch {
        // ignore parse errors
      }
    }

    return NextResponse.json({
      provider: result.provider,
      assessedValue: (factsMap.get("county_assessed_value") as number) ?? null,
      landValue: (factsMap.get("county_land_value") as number) ?? null,
      improvementValue: (factsMap.get("county_improvement_value") as number) ?? null,
      taxableValue: (factsMap.get("county_taxable_value") as number) ?? null,
      lastSalePrice: (factsMap.get("county_last_sale_price") as number) ?? null,
      lastSaleDate: (factsMap.get("county_last_sale_date") as string) ?? null,
      parcelNumber: (factsMap.get("county_parcel_number") as string) ?? null,
      acreage: (factsMap.get("county_acreage") as number) ?? null,
      propUseDesc: (factsMap.get("county_prop_use_desc") as string) ?? null,
      neighborhoodName: (factsMap.get("county_neighborhood_name") as string) ?? null,
      salesHistory,
      parcelGeometry,
      facts: result.facts,
      rawPayload: result.rawPayload,
      fetchedAt: result.fetchedAt,
    });
  } catch (err) {
    console.error("[county-gis] Lookup error:", err);
    return NextResponse.json(
      { error: "County GIS lookup failed", details: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
