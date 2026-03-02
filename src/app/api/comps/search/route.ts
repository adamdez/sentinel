import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

const PR_API_BASE = "https://api.propertyradar.com/v1/properties";

/**
 * POST /api/comps/search
 *
 * Comp search via PropertyRadar.
 *
 * Strategy 1 (primary): When radarId is provided, use the dedicated
 *   GET /v1/properties/{RadarID}/comps/sales endpoint.
 *
 * Strategy 2 (fallback): When no radarId, search by zip + county via
 *   POST /v1/properties with valid criteria.
 *
 * Body: {
 *   radarId?: string,
 *   lat: number, lng: number,
 *   zip?: string, county?: string, state?: string,
 *   radiusMiles?: number,
 *   beds?: number, baths?: number, sqft?: number,
 *   yearBuilt?: number, propertyType?: string,
 *   limit?: number (max 100)
 * }
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.PROPERTYRADAR_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "PROPERTYRADAR_API_KEY not configured" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const {
      radarId,
      lat, lng,
      zip, county, state,
      beds, baths, sqft, yearBuilt, propertyType,
      limit = 50,
    } = body;

    const t0 = Date.now();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    // ── Strategy 1: Native comps endpoint (preferred) ──────────────
    if (radarId && typeof radarId === "string") {
      const params = new URLSearchParams();
      params.set("Purchase", "1");
      params.set("Limit", String(Math.min(limit, 100)));
      params.set("Fields", "default,State,AVM,EquityPercent,PropertyImageUrl,StreetViewUrl");

      if (beds && typeof beds === "number") params.set("Beds", String(beds));
      if (baths && typeof baths === "number") params.set("Baths", String(baths));
      if (sqft && typeof sqft === "number") params.set("SqFt", String(sqft));
      if (yearBuilt && typeof yearBuilt === "number") params.set("YearBuilt", String(yearBuilt));
      if (propertyType && typeof propertyType === "string") params.set("PType", mapPType(propertyType));

      const url = `${PR_API_BASE}/${radarId}/comps/sales?${params.toString()}`;
      console.log(`[Comps] Using native comps/sales for ${radarId}`);

      const prRes = await fetch(url, { method: "GET", headers });

      if (!prRes.ok) {
        const errText = await prRes.text().catch(() => "");
        console.error("[Comps] comps/sales HTTP", prRes.status, errText.slice(0, 500));

        if (prRes.status === 404) {
          console.log("[Comps] RadarID not found, falling through to zip fallback");
        } else {
          return NextResponse.json(
            { error: `PropertyRadar comps returned ${prRes.status}`, detail: errText.slice(0, 300) },
            { status: 502 },
          );
        }
      } else {
        const prData = await prRes.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const results: any[] = prData.results ?? [];
        console.log(`[Comps] comps/sales returned ${results.length} comps in ${Date.now() - t0}ms`);

        const comps = results.map(mapCompSalesResult);
        return NextResponse.json({ success: true, count: comps.length, source: "comps/sales", comps });
      }
    }

    // ── Strategy 2: Zip/County criteria search (fallback) ──────────
    const latNum = typeof lat === "number" ? lat : parseFloat(lat);
    const lngNum = typeof lng === "number" ? lng : parseFloat(lng);

    if (!zip && (!latNum || isNaN(latNum))) {
      return NextResponse.json(
        { error: "Either radarId or zip/lat+lng must be provided" },
        { status: 400 },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const criteria: { name: string; value: any[] }[] = [];

    if (state) criteria.push({ name: "State", value: [state] });
    if (zip) criteria.push({ name: "ZipFive", value: [zip] });
    if (county) criteria.push({ name: "County", value: [county] });

    if (!zip && !county && !state) {
      return NextResponse.json(
        { error: "No location data (zip, county, or state) available for fallback search" },
        { status: 400 },
      );
    }

    if (beds && typeof beds === "number") {
      criteria.push({ name: "Beds", value: [[Math.max(beds - 1, 0), beds + 1]] });
    }
    if (baths && typeof baths === "number") {
      criteria.push({ name: "Baths", value: [[Math.max(baths - 0.5, 0), baths + 0.5]] });
    }
    if (sqft && typeof sqft === "number") {
      criteria.push({ name: "SqFt", value: [[Math.round(sqft * 0.85), Math.round(sqft * 1.15)]] });
    }
    if (yearBuilt && typeof yearBuilt === "number") {
      criteria.push({ name: "YearBuilt", value: [[yearBuilt - 10, yearBuilt + 10]] });
    }
    if (propertyType && typeof propertyType === "string") {
      criteria.push({
        name: "PropertyType",
        value: [{ name: "PType", value: [mapPType(propertyType)] }],
      });
    }

    criteria.push({ name: "LastTransferRecDate", value: ["Last 365 Days"] });

    const prBody = { Criteria: criteria };
    const prUrl = `${PR_API_BASE}?Purchase=1&Limit=${Math.min(limit, 100)}&Fields=All`;

    console.log(`[Comps] Fallback zip/county search, criteria:`, JSON.stringify(criteria));
    const prRes = await fetch(prUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(prBody),
    });

    if (!prRes.ok) {
      const errText = await prRes.text().catch(() => "");
      console.error("[Comps] Fallback search HTTP", prRes.status, errText.slice(0, 1000));
      console.error("[Comps] Request body was:", JSON.stringify(prBody));
      return NextResponse.json(
        { error: `PropertyRadar returned ${prRes.status}`, detail: errText.slice(0, 300) },
        { status: 502 },
      );
    }

    const prData = await prRes.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: any[] = prData.results ?? [];
    console.log(`[Comps] Fallback returned ${results.length} properties in ${Date.now() - t0}ms`);

    const toNum = (v: unknown): number | null => {
      if (v == null || v === "") return null;
      const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[$,%]/g, ""));
      return isNaN(n) ? null : n;
    };
    const toBool = (v: unknown): boolean =>
      v === true || v === 1 || v === "1" || v === "Yes" || v === "True" || v === "true";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comps = results.map((pr: any) => ({
      radarId: pr.RadarID ?? null,
      apn: pr.APN ?? "",
      address: [pr.Address, pr.City, pr.State, pr.ZipFive].filter(Boolean).join(", "),
      streetAddress: pr.Address ?? "",
      city: pr.City ?? "",
      state: pr.State ?? "",
      zip: pr.ZipFive ?? "",
      county: pr.County ?? "",
      lat: toNum(pr.Latitude),
      lng: toNum(pr.Longitude),
      owner: pr.Owner ?? "Unknown",
      propertyType: pr.PType ?? null,
      beds: toNum(pr.Beds),
      baths: toNum(pr.Baths),
      sqft: toNum(pr.SqFt),
      yearBuilt: toNum(pr.YearBuilt),
      lotSize: toNum(pr.LotSize),
      avm: toNum(pr.AVM),
      assessedValue: toNum(pr.AssessedValue),
      equityPercent: toNum(pr.EquityPercent),
      availableEquity: toNum(pr.AvailableEquity),
      totalLoanBalance: toNum(pr.TotalLoanBalance),
      lastSalePrice: toNum(pr.LastTransferValue),
      lastSaleDate: pr.LastTransferRecDate ?? null,
      lastSaleType: pr.LastTransferType ?? null,
      isVacant: toBool(pr.isSiteVacant),
      isAbsentee: toBool(pr.isNotSameMailingOrExempt),
      isFreeAndClear: toBool(pr.isFreeAndClear),
      isHighEquity: toBool(pr.isHighEquity),
      isForeclosure: toBool(pr.isPreforeclosure) || toBool(pr.inForeclosure),
      isTaxDelinquent: toBool(pr.inTaxDelinquency),
      isListedForSale: toBool(pr.isListedForSale),
      isRecentSale: toBool(pr.isRecentSale),
      photoUrl: pr.PropertyImageUrl ?? null,
      streetViewUrl: pr.StreetViewUrl ?? null,
    }));

    // Client-side distance filter when we have lat/lng
    const filtered = (latNum && lngNum && !isNaN(latNum) && !isNaN(lngNum))
      ? comps.filter((c: { lat: number | null; lng: number | null }) => {
          if (!c.lat || !c.lng) return true;
          const dist = haversine(latNum, lngNum, c.lat, c.lng);
          return dist <= (body.radiusMiles ?? 10);
        })
      : comps;

    return NextResponse.json({
      success: true,
      count: filtered.length,
      source: "criteria",
      comps: filtered,
    });
  } catch (err) {
    console.error("[Comps] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function mapPType(pt: string): string {
  const map: Record<string, string> = {
    "Single Family": "SFR", "SFR": "SFR",
    "Condominium": "CND", "CND": "CND", "Condo": "CND",
    "Multi-Family": "MFR", "MFR": "MFR", "Multi-Family 2-4": "MFR",
    "Commercial": "COM", "COM": "COM",
    "Land": "LND", "LND": "LND",
    "Agricultural": "AGR", "AGR": "AGR",
    "Industrial": "IND", "IND": "IND",
  };
  return map[pt] ?? pt;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCompSalesResult(r: any) {
  const toNum = (v: unknown): number | null => {
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[$,%]/g, ""));
    return isNaN(n) ? null : n;
  };
  return {
    radarId: r.RadarID ?? null,
    apn: "",
    address: [r.Address, r.City, r.State].filter(Boolean).join(", "),
    streetAddress: r.Address ?? "",
    city: r.City ?? "",
    state: r.State ?? "",
    zip: "",
    county: "",
    lat: toNum(r.Latitude),
    lng: toNum(r.Longitude),
    owner: "—",
    propertyType: r.PType ?? null,
    beds: toNum(r.Beds),
    baths: toNum(r.Baths),
    sqft: toNum(r.SqFt),
    yearBuilt: toNum(r.YearBuilt),
    lotSize: toNum(r.LotSize),
    avm: toNum(r.AVM),
    assessedValue: null,
    equityPercent: toNum(r.EquityPercent),
    availableEquity: null,
    totalLoanBalance: null,
    lastSalePrice: toNum(r.TransferValue),
    lastSaleDate: r.TransferDate ?? null,
    lastSaleType: r.TransferType ?? null,
    isVacant: false,
    isAbsentee: false,
    isFreeAndClear: false,
    isHighEquity: false,
    isForeclosure: false,
    isTaxDelinquent: false,
    isListedForSale: false,
    isRecentSale: true,
    prScore: toNum(r.Score),
    pricePerSqft: toNum(r.PricePerSqFt),
    photoUrl: r.PropertyImageUrl ?? null,
    streetViewUrl: r.StreetViewUrl ?? null,
  };
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
