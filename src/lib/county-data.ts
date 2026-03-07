/**
 * Spokane County ArcGIS REST API Client
 *
 * Free, no-auth access to Spokane County property data via public ArcGIS REST services.
 * Two primary services:
 *   1. SCOUT/Queries — Owner name verification, parcel status
 *   2. OpenData/Property — Historical comp sales (2015–2026)
 *
 * These endpoints are taxpayer-funded public data. No API key needed.
 * Rate limiting: be respectful — 500ms delay between calls in batch operations.
 *
 * Field reference (verified 2026-03-07):
 *   SCOUT Layer 2:  PID_NUM, owner_name, site_address, tax_year, seg_status, site_state, site_zip
 *   Sales Layers:   Parcel, gross_sale_price, document_date, vacant_land_flag, prop_use_code
 */

// ── Endpoints ──────────────────────────────────────────────────────────────
const SCOUT_QUERY_URL =
  "https://gismo.spokanecounty.org/arcgis/rest/services/SCOUT/Queries/MapServer/2/query";

const SALES_BASE_URL =
  "https://gismo.spokanecounty.org/arcgis/rest/services/OpenData/Property/MapServer";

// Sales layer IDs by year (verified from MapServer metadata)
const SALES_LAYER_IDS: Record<number, number> = {
  2026: 20,
  2025: 19,
  2024: 18,
  2023: 17,
  2022: 5,
  2021: 16,
  2020: 15,
  2019: 14,
  2018: 10,
  2017: 11,
  2016: 6,
  2015: 7,
};

// ── Types ──────────────────────────────────────────────────────────────────

export interface CountyOwnerData {
  apn: string;
  ownerName: string | null;
  siteAddress: string | null;
  taxYear: number | null;
  assessmentYear: number | null;
  segStatus: string | null; // "Active-Complete", "Active-Working", etc.
  siteState: string | null;
  siteZip: string | null;
  exemptionAmount: number | null;
  rawAttributes: Record<string, unknown>;
}

export interface CountySaleRecord {
  parcel: string;
  grossSalePrice: number;
  documentDate: string; // ISO date string
  vacantLandFlag: boolean;
  propUseCode: string | null;
  exciseNumber: string | null;
  year: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface ArcGISResponse {
  features?: Array<{
    attributes: Record<string, unknown>;
  }>;
  exceededTransferLimit?: boolean;
  error?: {
    code: number;
    message: string;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function epochMsToISO(epochMs: number | null | undefined): string | null {
  if (!epochMs) return null;
  try {
    return new Date(epochMs).toISOString().split("T")[0];
  } catch {
    return null;
  }
}

async function queryArcGIS(
  url: string,
  where: string,
  outFields = "*",
  maxRecords = 100
): Promise<ArcGISResponse> {
  const params = new URLSearchParams({
    where,
    outFields,
    f: "json",
    resultRecordCount: String(maxRecords),
  });

  const fullUrl = `${url}?${params.toString()}`;
  console.log(`[CountyData] Querying: ${fullUrl.substring(0, 120)}...`);

  const res = await fetch(fullUrl, {
    headers: { "User-Agent": "Sentinel-CRM/1.0 (Dominion Home Deals)" },
    signal: AbortSignal.timeout(15_000), // 15s timeout
  });

  if (!res.ok) {
    throw new Error(`ArcGIS HTTP ${res.status}: ${res.statusText}`);
  }

  const data = (await res.json()) as ArcGISResponse;

  if (data.error) {
    throw new Error(`ArcGIS error ${data.error.code}: ${data.error.message}`);
  }

  return data;
}

// ── Owner Lookup (SCOUT Layer 2) ───────────────────────────────────────────

/**
 * Look up property owner by APN from Spokane County SCOUT.
 * Returns owner name, site address, tax year, and parcel status.
 * Free, no auth. APN format: "35054.0101" (5 digits, period, 4 digits).
 */
export async function querySpokaneOwnerByAPN(
  apn: string
): Promise<CountyOwnerData | null> {
  try {
    // Normalize APN — strip spaces, ensure period format
    const normalizedApn = apn.trim();

    const data = await queryArcGIS(
      SCOUT_QUERY_URL,
      `PID_NUM='${normalizedApn}'`,
      "PID_NUM,owner_name,site_address,tax_year,asmt_year,seg_status,site_state,site_zip,exmp_amt",
      1
    );

    if (!data.features?.length) {
      console.log(`[CountyData] No SCOUT result for APN ${normalizedApn}`);
      return null;
    }

    const attrs = data.features[0].attributes;
    const result: CountyOwnerData = {
      apn: (attrs.PID_NUM as string) ?? normalizedApn,
      ownerName: (attrs.owner_name as string)?.trim() || null,
      siteAddress: (attrs.site_address as string)?.trim() || null,
      taxYear: (attrs.tax_year as number) ?? null,
      assessmentYear: (attrs.asmt_year as number) ?? null,
      segStatus: (attrs.seg_status as string) ?? null,
      siteState: (attrs.site_state as string) ?? null,
      siteZip: (attrs.site_zip as string) ?? null,
      exemptionAmount: (attrs.exmp_amt as number) ?? null,
      rawAttributes: attrs,
    };

    console.log(
      `[CountyData] SCOUT found: ${result.ownerName ?? "no owner"} at ${result.siteAddress ?? "no address"}`
    );
    return result;
  } catch (err) {
    console.error(
      `[CountyData] SCOUT query failed for APN ${apn}:`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/**
 * Look up property owner by site address from Spokane County SCOUT.
 * Uses LIKE match for fuzzy address searching.
 * Returns up to `limit` matching records.
 */
export async function querySpokaneOwnerByAddress(
  address: string,
  limit = 5
): Promise<CountyOwnerData[]> {
  try {
    // Normalize address for LIKE query — uppercase, trim
    const normalizedAddr = address.trim().toUpperCase().replace(/'/g, "''");

    const data = await queryArcGIS(
      SCOUT_QUERY_URL,
      `site_address LIKE '${normalizedAddr}%'`,
      "PID_NUM,owner_name,site_address,tax_year,asmt_year,seg_status,site_state,site_zip,exmp_amt",
      limit
    );

    if (!data.features?.length) {
      console.log(`[CountyData] No SCOUT results for address "${address}"`);
      return [];
    }

    return data.features.map((f) => {
      const attrs = f.attributes;
      return {
        apn: (attrs.PID_NUM as string) ?? "",
        ownerName: (attrs.owner_name as string)?.trim() || null,
        siteAddress: (attrs.site_address as string)?.trim() || null,
        taxYear: (attrs.tax_year as number) ?? null,
        assessmentYear: (attrs.asmt_year as number) ?? null,
        segStatus: (attrs.seg_status as string) ?? null,
        siteState: (attrs.site_state as string) ?? null,
        siteZip: (attrs.site_zip as string) ?? null,
        exemptionAmount: (attrs.exmp_amt as number) ?? null,
        rawAttributes: attrs,
      };
    });
  } catch (err) {
    console.error(
      `[CountyData] SCOUT address query failed:`,
      err instanceof Error ? err.message : err
    );
    return [];
  }
}

// ── Comp Sales (OpenData/Property Sales Layers) ────────────────────────────

/**
 * Get historical sales for a parcel from Spokane County OpenData.
 * Queries multiple year layers (default: last 3 years) for the given APN.
 * Returns all recorded sales with prices and dates.
 *
 * @param apn Parcel number (e.g., "35054.0101")
 * @param yearsBack How many years of history to pull (default: 3, max: 12)
 */
export async function querySpokaneCompSales(
  apn: string,
  yearsBack = 3
): Promise<CountySaleRecord[]> {
  const normalizedApn = apn.trim();
  const currentYear = new Date().getFullYear();
  const sales: CountySaleRecord[] = [];

  // Query each year layer
  for (let yr = currentYear; yr >= currentYear - yearsBack + 1; yr--) {
    const layerId = SALES_LAYER_IDS[yr];
    if (!layerId) continue;

    try {
      const url = `${SALES_BASE_URL}/${layerId}/query`;
      const data = await queryArcGIS(
        url,
        `Parcel='${normalizedApn}'`,
        "Parcel,gross_sale_price,document_date,vacant_land_flag,prop_use_code,excise_nbr",
        50
      );

      if (data.features?.length) {
        for (const f of data.features) {
          const attrs = f.attributes;
          const price = attrs.gross_sale_price as number;
          if (!price || price <= 0) continue; // skip $0 transfers

          sales.push({
            parcel: (attrs.Parcel as string) ?? normalizedApn,
            grossSalePrice: price,
            documentDate: epochMsToISO(attrs.document_date as number) ?? "",
            vacantLandFlag: (attrs.vacant_land_flag as string) === "Y",
            propUseCode: (attrs.prop_use_code as string) ?? null,
            exciseNumber: (attrs.excise_nbr as string) ?? null,
            year: yr,
          });
        }
      }
    } catch (err) {
      console.warn(
        `[CountyData] Sales query failed for ${normalizedApn} year ${yr}:`,
        err instanceof Error ? err.message : err
      );
      // Continue to next year — don't fail entire query
    }
  }

  // Sort by date descending (most recent first)
  sales.sort((a, b) => (b.documentDate > a.documentDate ? 1 : -1));

  console.log(
    `[CountyData] Found ${sales.length} sale(s) for ${normalizedApn} over ${yearsBack} years`
  );
  return sales;
}

/**
 * Get all recent sales in Spokane County for a given year.
 * Useful for market analysis and bulk comp data.
 *
 * @param year Calendar year (2015–2026)
 * @param limit Max records to return (default: 1000)
 * @param minPrice Minimum sale price filter (default: $10,000 to exclude nominal transfers)
 */
export async function querySpokaneRecentSales(
  year: number,
  limit = 1000,
  minPrice = 10_000
): Promise<CountySaleRecord[]> {
  const layerId = SALES_LAYER_IDS[year];
  if (!layerId) {
    console.warn(`[CountyData] No sales layer for year ${year}`);
    return [];
  }

  try {
    const url = `${SALES_BASE_URL}/${layerId}/query`;
    const data = await queryArcGIS(
      url,
      `gross_sale_price>=${minPrice}`,
      "Parcel,gross_sale_price,document_date,vacant_land_flag,prop_use_code,excise_nbr",
      limit
    );

    if (!data.features?.length) return [];

    return data.features
      .map((f) => {
        const attrs = f.attributes;
        return {
          parcel: (attrs.Parcel as string) ?? "",
          grossSalePrice: (attrs.gross_sale_price as number) ?? 0,
          documentDate: epochMsToISO(attrs.document_date as number) ?? "",
          vacantLandFlag: (attrs.vacant_land_flag as string) === "Y",
          propUseCode: (attrs.prop_use_code as string) ?? null,
          exciseNumber: (attrs.excise_nbr as string) ?? null,
          year,
        };
      })
      .sort((a, b) => (b.documentDate > a.documentDate ? 1 : -1));
  } catch (err) {
    console.error(
      `[CountyData] Bulk sales query failed for year ${year}:`,
      err instanceof Error ? err.message : err
    );
    return [];
  }
}

// ── Convenience: County data for enrichment ────────────────────────────────

/**
 * Full county data lookup for a single property.
 * Combines owner verification + comp sales in one call.
 * Used by enrichment-engine.ts as a free data source.
 */
export async function getSpokaneCountyData(apn: string): Promise<{
  owner: CountyOwnerData | null;
  sales: CountySaleRecord[];
}> {
  const [owner, sales] = await Promise.all([
    querySpokaneOwnerByAPN(apn),
    querySpokaneCompSales(apn, 3),
  ]);

  return { owner, sales };
}

/**
 * Check if a county is supported for direct ArcGIS queries.
 * Currently only Spokane County, WA is supported.
 * When new counties are added, extend this function.
 */
export function isCountySupported(county: string): boolean {
  return county.toLowerCase().includes("spokane");
}
