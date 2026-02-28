import { NextRequest, NextResponse } from "next/server";

const PR_API_BASE = "https://api.propertyradar.com/v1/properties";

/**
 * POST /api/comps/search
 *
 * Radius-based property search via PropertyRadar for comparable sales.
 *
 * Body: {
 *   lat: number, lng: number,
 *   radiusMiles: number (0.5–10),
 *   beds?: number, baths?: number, sqft?: number,
 *   yearBuilt?: number, propertyType?: string,
 *   limit?: number (max 100)
 * }
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.PROPERTYRADAR_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "PROPERTYRADAR_API_KEY not configured" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const {
      lat, lng, radiusMiles = 4,
      beds, baths, sqft, yearBuilt, propertyType,
      limit = 50,
    } = body;

    if (!lat || !lng) {
      return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
    }

    const criteria: { name: string; value: string[] }[] = [
      { name: "RadiusLatitude", value: [String(lat)] },
      { name: "RadiusLongitude", value: [String(lng)] },
      { name: "RadiusMiles", value: [String(Math.min(Math.max(radiusMiles, 0.5), 10))] },
    ];

    if (beds) {
      criteria.push({ name: "Beds", value: [`${Math.max(beds - 1, 0)}-${beds + 1}`] });
    }
    if (baths) {
      const lo = Math.max(baths - 0.5, 0);
      const hi = baths + 0.5;
      criteria.push({ name: "Baths", value: [`${lo}-${hi}`] });
    }
    if (sqft) {
      const lo = Math.round(sqft * 0.85);
      const hi = Math.round(sqft * 1.15);
      criteria.push({ name: "SqFt", value: [`${lo}-${hi}`] });
    }
    if (yearBuilt) {
      criteria.push({ name: "YearBuilt", value: [`${yearBuilt - 10}-${yearBuilt + 10}`] });
    }
    if (propertyType) {
      criteria.push({ name: "PType", value: [propertyType] });
    }

    const prBody = { Criteria: criteria };
    const prUrl = `${PR_API_BASE}?Purchase=1&Limit=${Math.min(limit, 100)}&Fields=All`;

    const t0 = Date.now();
    const prRes = await fetch(prUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(prBody),
    });

    if (!prRes.ok) {
      const errText = await prRes.text().catch(() => "");
      console.error("[Comps] PropertyRadar HTTP", prRes.status, errText.slice(0, 500));
      return NextResponse.json({ error: `PropertyRadar returned ${prRes.status}` }, { status: 502 });
    }

    const prData = await prRes.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: any[] = prData.results ?? [];
    console.log(`[Comps] Found ${results.length} properties in ${Date.now() - t0}ms`);

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
    }));

    return NextResponse.json({
      success: true,
      count: comps.length,
      radiusMiles,
      comps,
    });
  } catch (err) {
    console.error("[Comps] Error:", err);
    return NextResponse.json(
      { error: "Comps search failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
