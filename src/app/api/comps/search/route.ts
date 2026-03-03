import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getSaleSnapshot, COUNTY_FIPS, type AttomSale } from "@/lib/attom";

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
      // comps/sales endpoint has its own field set — uses TransferValue/TransferDate/TransferType
      // (NOT LastTransferRecDate/LastTransferValue), and doesn't support PropertyImageUrl/StreetViewUrl/EquityPercent.
      // "default" includes: RadarID, Address, City, Latitude, Longitude, PType, Beds, Baths, SqFt,
      //   LotSize, YearBuilt, Score, TransferValue, TransferDate, TransferType, PricePerSqFt
      params.set("Fields", "default,State,AVM");

      const url = `${PR_API_BASE}/${radarId}/comps/sales?${params.toString()}`;
      console.log(`[Comps] Using native comps/sales for ${radarId}`);

      const prRes = await fetch(url, { method: "GET", headers });

      if (!prRes.ok) {
        const errText = await prRes.text().catch(() => "");
        console.error("[Comps] comps/sales HTTP", prRes.status, errText.slice(0, 500));
        console.log("[Comps] Falling through to zip/county fallback");
      } else {
        const prData = await prRes.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const results: any[] = prData.results ?? [];
        console.log(`[Comps] comps/sales returned ${results.length} comps in ${Date.now() - t0}ms`);

        const comps = results.map(mapCompSalesResult).map((c: Record<string, unknown>) => ({ ...c, source: "propertyradar" }));
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
    // Note: PropertyRadar County criterion requires a numeric FIPS code, not a name string.
    // We rely on zip + state for location targeting instead.

    if (!zip && !state) {
      return NextResponse.json(
        { error: "No location data (zip, county, or state) available for fallback search" },
        { status: 400 },
      );
    }

    if (beds && typeof beds === "number") {
      criteria.push({ name: "Beds", value: [[Math.max(beds - 1, 0), beds + 1]] });
    }
    if (baths && typeof baths === "number") {
      criteria.push({ name: "Baths", value: [[Math.max(baths - 1, 0), baths + 1]] });
    }
    if (sqft && typeof sqft === "number") {
      criteria.push({ name: "SqFt", value: [[Math.round(sqft * 0.80), Math.round(sqft * 1.20)]] });
    }
    if (yearBuilt && typeof yearBuilt === "number") {
      criteria.push({ name: "YearBuilt", value: [[yearBuilt - 15, yearBuilt + 15]] });
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
    const distFiltered = (latNum && lngNum && !isNaN(latNum) && !isNaN(lngNum))
      ? comps.filter((c: { lat: number | null; lng: number | null }) => {
          if (!c.lat || !c.lng) return true;
          const dist = haversine(latNum, lngNum, c.lat, c.lng);
          return dist <= (body.radiusMiles ?? 10);
        })
      : comps;

    // Exclude distressed / non-arm's-length sales
    const DISTRESSED_TYPES = ["auction", "reo", "bank", "foreclosure", "short sale", "quit claim", "family", "trust", "estate"];
    const filtered = distFiltered.filter((c: { lastSaleType: string | null; isForeclosure: boolean }) => {
      if (c.isForeclosure) return false;
      if (c.lastSaleType) {
        const st = c.lastSaleType.toLowerCase();
        if (DISTRESSED_TYPES.some((d) => st.includes(d))) return false;
      }
      return true;
    });

    // Tag each comp with source
    const tagged = filtered.map((c: Record<string, unknown>) => ({ ...c, source: "propertyradar" }));

    if (tagged.length > 0) {
      return NextResponse.json({
        success: true,
        count: tagged.length,
        source: "criteria",
        comps: tagged,
      });
    }

    // ── Strategy 3: ATTOM Sale Snapshot fallback ─────────────────────
    console.log("[Comps] PropertyRadar returned 0 comps, trying ATTOM fallback");
    const attomComps = await fetchAttomComps(county, state, latNum, lngNum, body.radiusMiles ?? 5);
    if (attomComps.length > 0) {
      return NextResponse.json({
        success: true,
        count: attomComps.length,
        source: "attom",
        comps: attomComps,
      });
    }

    return NextResponse.json({
      success: true,
      count: 0,
      source: "none",
      comps: [],
    });
  } catch (err) {
    console.error("[Comps] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function fetchAttomComps(
  county: string | undefined,
  state: string | undefined,
  lat: number,
  lng: number,
  radiusMiles: number,
): Promise<Record<string, unknown>[]> {
  if (!process.env.ATTOM_API_KEY) {
    console.log("[Comps] ATTOM_API_KEY not configured, skipping fallback");
    return [];
  }

  const countyName = county?.replace(/\s+county$/i, "").trim() ?? "";
  const fips = COUNTY_FIPS[countyName] ?? COUNTY_FIPS[countyName.charAt(0).toUpperCase() + countyName.slice(1)];
  if (!fips) {
    console.log(`[Comps] No FIPS mapping for county "${county}", skipping ATTOM`);
    return [];
  }

  try {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const startDate = oneYearAgo.toISOString().split("T")[0];

    const sales: AttomSale[] = await getSaleSnapshot(fips, {
      pagesize: 50,
      startsalesearchdate: startDate,
      minsalesearchamt: 50000,
    });

    console.log(`[Comps] ATTOM returned ${sales.length} sales for FIPS ${fips}`);

    const toNum = (v: unknown): number | null => {
      if (v == null || v === "") return null;
      const n = typeof v === "number" ? v : parseFloat(String(v));
      return isNaN(n) ? null : n;
    };

    const mapped = sales.map((s) => {
      const saleLat = toNum(s.location?.latitude);
      const saleLng = toNum(s.location?.longitude);
      return {
        radarId: null,
        apn: s.identifier?.apn ?? "",
        address: s.address?.oneLine ?? [s.address?.line1, s.address?.line2].filter(Boolean).join(", "),
        streetAddress: s.address?.line1 ?? "",
        city: s.address?.locality ?? "",
        state: s.address?.countrySubd ?? state ?? "",
        zip: s.address?.postal1 ?? "",
        county: countyName,
        lat: saleLat,
        lng: saleLng,
        owner: "—",
        propertyType: s.summary?.propType ?? null,
        beds: toNum(s.building?.rooms?.beds),
        baths: toNum(s.building?.rooms?.bathsTotal),
        sqft: toNum(s.building?.size?.livingSize ?? s.building?.size?.bldgSize),
        yearBuilt: s.summary?.yearBuilt ?? null,
        lotSize: toNum(s.lot?.lotSize1),
        avm: toNum(s.avm?.amount?.value ?? s.assessment?.market?.mktTtlValue),
        assessedValue: toNum(s.assessment?.assessed?.assdTtlValue),
        equityPercent: null,
        availableEquity: null,
        totalLoanBalance: null,
        lastSalePrice: toNum(s.sale?.amount?.saleAmt),
        lastSaleDate: s.sale?.amount?.saleRecDate ?? s.sale?.amount?.saleTransDate ?? null,
        lastSaleType: null,
        isVacant: false,
        isAbsentee: s.summary?.absenteeInd === "O",
        isFreeAndClear: false,
        isHighEquity: false,
        isForeclosure: false,
        isTaxDelinquent: false,
        isListedForSale: false,
        isRecentSale: true,
        photoUrl: null,
        streetViewUrl: null,
        source: "attom",
        _dist: saleLat && saleLng ? haversine(lat, lng, saleLat, saleLng) : 999,
      };
    });

    return mapped
      .filter((c) => c._dist <= radiusMiles)
      .sort((a, b) => a._dist - b._dist)
      .map(({ _dist, ...rest }) => rest);
  } catch (err) {
    console.error("[Comps] ATTOM fallback error:", err);
    return [];
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
    apn: r.RadarID ?? "",  // comps/sales doesn't return APN; use RadarID as unique key
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
