import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  getSalesHistory,
  getSalesHistoryByAddress,
  getAssessmentHistory,
  getAVMHistory,
  getRentalAVM,
  getRentalAVMByAddress,
  COUNTY_FIPS,
  AttomApiError,
} from "@/lib/attom";
import {
  querySpokaneCompSales,
  isCountySupported,
} from "@/lib/county-data";

/**
 * POST /api/comps/enrich
 *
 * Enriches a comp property with deep ATTOM data and county records.
 * Called when user selects/focuses a comp to get detailed history.
 *
 * Body: {
 *   apn: string,
 *   address?: string,       // "123 Main St"
 *   address2?: string,      // "Spokane, WA 99201"
 *   county?: string,
 *   state?: string,
 *   fips?: string,          // override FIPS code
 * }
 *
 * Returns: {
 *   saleHistory: [...],
 *   assessmentHistory: [...],
 *   avmTrend: [...],
 *   rentalAvm: number | null,
 *   rentalAvmHigh: number | null,
 *   rentalAvmLow: number | null,
 *   countySales: [...],
 * }
 */
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { apn, address, address2, county, state, fips: fipsOverride } = body;

    if (!apn && !address) {
      return NextResponse.json({ error: "apn or address required" }, { status: 400 });
    }

    // Resolve FIPS code
    const countyName = county?.replace(/\s+county$/i, "").trim() ?? "";
    const fips = fipsOverride
      ?? COUNTY_FIPS[countyName]
      ?? COUNTY_FIPS[countyName.charAt(0).toUpperCase() + countyName.slice(1)];

    const hasAttom = !!process.env.ATTOM_API_KEY && !!fips;
    const useAddress = !apn && !!address && !!address2;

    // Run all ATTOM + county queries in parallel
    const [
      saleHistoryResult,
      assessmentResult,
      avmHistoryResult,
      rentalResult,
      countySalesResult,
    ] = await Promise.allSettled([
      // 1. Sales History
      hasAttom
        ? (useAddress
            ? getSalesHistoryByAddress(address, address2)
            : getSalesHistory(apn, fips))
        : Promise.resolve(null),

      // 2. Assessment History
      hasAttom && apn
        ? getAssessmentHistory(apn, fips)
        : Promise.resolve(null),

      // 3. AVM History
      hasAttom && apn
        ? getAVMHistory(apn, fips)
        : Promise.resolve(null),

      // 4. Rental AVM
      hasAttom
        ? (useAddress
            ? getRentalAVMByAddress(address, address2)
            : getRentalAVM(apn, fips))
        : Promise.resolve(null),

      // 5. County ArcGIS sales (free — Spokane only)
      apn && isCountySupported(countyName)
        ? querySpokaneCompSales(apn, 5)
        : Promise.resolve([]),
    ]);

    // Process sale history
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const saleHistoryRaw = saleHistoryResult.status === "fulfilled" ? saleHistoryResult.value : null;
    const saleHistory = saleHistoryRaw?.saleHistory
      ?.filter((s) => s.amount?.saleAmt && s.amount.saleAmt > 0)
      .map((s) => ({
        saleAmount: s.amount?.saleAmt ?? 0,
        saleDate: s.amount?.saleRecDate ?? s.amount?.saleTransDate ?? null,
        buyer: s.buyerName ?? null,
        seller: s.sellerName ?? null,
        docType: s.documentType ?? null,
        pricePerSqft: s.calculation?.pricePerSizeUnit ?? null,
      }))
      .sort((a, b) => (b.saleDate ?? "").localeCompare(a.saleDate ?? ""))
      ?? [];

    // Process assessment history
    const assessmentRaw = assessmentResult.status === "fulfilled" ? assessmentResult.value : null;
    const assessmentHistory = assessmentRaw?.assessmenthistory
      ?.filter((a) => a.tax?.taxYear)
      .map((a) => ({
        year: a.tax?.taxYear ?? 0,
        assessedValue: a.assessed?.assdTtlValue ?? 0,
        marketValue: a.market?.mktTtlValue ?? null,
        taxAmount: a.tax?.taxAmt ?? null,
      }))
      .sort((a, b) => b.year - a.year)
      ?? [];

    // Process AVM history
    const avmRaw = avmHistoryResult.status === "fulfilled" ? avmHistoryResult.value : null;
    const avmTrend = avmRaw?.avmhistory
      ?.filter((a) => a.amount?.value && a.eventDate)
      .map((a) => ({
        date: a.eventDate!,
        value: a.amount!.value!,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
      ?? [];

    // Process rental AVM
    const rentalRaw = rentalResult.status === "fulfilled" ? rentalResult.value : null;
    const rentalAvm = rentalRaw?.rentalAvm?.amount?.value ?? null;
    const rentalAvmHigh = rentalRaw?.rentalAvm?.amount?.high ?? null;
    const rentalAvmLow = rentalRaw?.rentalAvm?.amount?.low ?? null;

    // Process county sales
    const countySalesRaw = countySalesResult.status === "fulfilled" ? countySalesResult.value : [];
    const countySales = countySalesRaw.map((s) => ({
      date: s.documentDate,
      price: s.grossSalePrice,
      year: s.year,
    }));

    // Log any ATTOM errors (don't fail the whole request)
    const errors: string[] = [];
    if (saleHistoryResult.status === "rejected") {
      const err = saleHistoryResult.reason;
      if (!(err instanceof AttomApiError && err.status === 404)) {
        errors.push(`salesHistory: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (assessmentResult.status === "rejected") {
      const err = assessmentResult.reason;
      if (!(err instanceof AttomApiError && err.status === 404)) {
        errors.push(`assessment: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (avmHistoryResult.status === "rejected") {
      const err = avmHistoryResult.reason;
      if (!(err instanceof AttomApiError && err.status === 404)) {
        errors.push(`avmHistory: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (rentalResult.status === "rejected") {
      const err = rentalResult.reason;
      if (!(err instanceof AttomApiError && err.status === 404)) {
        errors.push(`rental: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (errors.length > 0) {
      console.warn(`[CompsEnrich] Partial errors for ${apn || address}:`, errors.join("; "));
    }

    console.log(
      `[CompsEnrich] ${apn || address}: ${saleHistory.length} sales, ${assessmentHistory.length} assessments, ${avmTrend.length} AVM points, rental=${rentalAvm}, ${countySales.length} county sales`
    );

    return NextResponse.json({
      success: true,
      saleHistory,
      assessmentHistory,
      avmTrend,
      rentalAvm,
      rentalAvmHigh,
      rentalAvmLow,
      countySales,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("[CompsEnrich] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
