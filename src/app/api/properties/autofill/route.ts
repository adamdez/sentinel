import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getPropertyDetailByAddress } from "@/lib/attom";

/**
 * POST /api/properties/autofill
 *
 * Fills missing building specs (beds, baths, sqft, yearBuilt, lotSize)
 * from ATTOM property detail. Only overwrites null fields.
 *
 * Body: { property_id: string }
 * Returns: { success, filled: string[], data: {...}, zillow_url }
 */
export async function POST(req: NextRequest) {
  try {
    const { property_id } = await req.json();
    if (!property_id) {
      return NextResponse.json({ error: "property_id required" }, { status: 400 });
    }

    const sb = createServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: property, error: err } = await (sb.from("properties") as any)
      .select("*")
      .eq("id", property_id)
      .single();

    if (err || !property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    // Parse address into street + city/state/zip for ATTOM
    const fullAddr: string = property.address ?? "";
    const parts = fullAddr.split(",").map((s: string) => s.trim());
    const street = parts[0] ?? "";
    const cityStateZip = [property.city, property.state, property.zip].filter(Boolean).join(" ");

    // Build Zillow search URL (always returned as manual fallback)
    const zillowQuery = [street, property.city, property.state, property.zip].filter(Boolean).join(" ");
    const zillowUrl = `https://www.zillow.com/homes/${encodeURIComponent(zillowQuery)}`;

    if (!street || !cityStateZip) {
      return NextResponse.json({
        success: false,
        error: "Insufficient address data for ATTOM lookup",
        zillow_url: zillowUrl,
      }, { status: 422 });
    }

    // Call ATTOM
    let attomProp;
    try {
      console.log(`[Autofill] ATTOM lookup: "${street}", "${cityStateZip}"`);
      attomProp = await getPropertyDetailByAddress(street, cityStateZip);
    } catch (attomErr) {
      console.error("[Autofill] ATTOM error:", attomErr);
      return NextResponse.json({
        success: false,
        error: "ATTOM lookup failed — try Zillow manually",
        zillow_url: zillowUrl,
      });
    }

    if (!attomProp) {
      return NextResponse.json({
        success: false,
        error: "No ATTOM record found — try Zillow manually",
        zillow_url: zillowUrl,
      });
    }

    // Build update — only fill null fields
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = { updated_at: new Date().toISOString() };
    const filled: string[] = [];

    const fillIfNull = (dbField: string, value: unknown, label: string) => {
      if (property[dbField] == null && value != null) {
        update[dbField] = value;
        filled.push(label);
      }
    };

    fillIfNull("bedrooms", attomProp.building?.rooms?.beds, "bedrooms");
    fillIfNull("bathrooms", attomProp.building?.rooms?.bathsTotal, "bathrooms");
    fillIfNull("sqft", attomProp.building?.size?.livingSize ?? attomProp.building?.size?.bldgSize, "sqft");
    fillIfNull("year_built", attomProp.summary?.yearBuilt, "year_built");
    fillIfNull("lot_size", attomProp.lot?.lotSize1 ? Math.round(attomProp.lot.lotSize1) : null, "lot_size");
    fillIfNull("property_type", attomProp.summary?.propType, "property_type");

    if (filled.length === 0) {
      return NextResponse.json({
        success: true,
        filled: [],
        message: "All fields already populated",
        zillow_url: zillowUrl,
      });
    }

    // Track autofill in owner_flags
    const flags = (property.owner_flags ?? {}) as Record<string, unknown>;
    update.owner_flags = {
      ...flags,
      attom_autofill: true,
      attom_autofill_at: new Date().toISOString(),
      attom_autofill_fields: filled,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("properties") as any).update(update).eq("id", property_id);

    console.log(`[Autofill] Property ${property_id}: filled ${filled.join(", ")} from ATTOM`);

    return NextResponse.json({
      success: true,
      filled,
      data: {
        bedrooms: update.bedrooms ?? property.bedrooms,
        bathrooms: update.bathrooms ?? property.bathrooms,
        sqft: update.sqft ?? property.sqft,
        year_built: update.year_built ?? property.year_built,
        lot_size: update.lot_size ?? property.lot_size,
        property_type: update.property_type ?? property.property_type,
      },
      zillow_url: zillowUrl,
    });
  } catch (err) {
    console.error("[Autofill] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
