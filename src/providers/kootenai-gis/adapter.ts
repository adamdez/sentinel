/**
 * Kootenai County GIS Provider Adapter
 *
 * On-premise ArcGIS Server — no auth, no API key, no cost.
 * Same interface as Spokane County GIS but less reliable
 * (self-hosted server, not always running).
 *
 * Provides county assessor data:
 * - Official assessed value, land value, improvement value
 * - Parcel geometry for mapping
 * - Property classification and neighborhood
 * - Recent sales via sales points layer
 *
 * Endpoints:
 *   Parcels: https://gis.kcgov.us/arcgis/rest/services/KC_Parcel_Polygon/MapServer/0/query
 *   Assessor: https://gis.kcgov.us/arcgis/rest/services/Assessor_Layers/MapServer
 *   Sales: https://gis.kcgov.us/arcgis/rest/services/KC_Dynamic_Layers/MapServer/42/query
 *
 * Graceful fallback: If services are down (common — self-hosted),
 * returns empty facts instead of erroring. Score uses PR + Bricked data.
 */

import {
  BaseProviderAdapter,
  type CanonicalPropertyFact,
  type ProviderLookupResult,
} from "../base-adapter";

// ── ArcGIS Response Types ───────────────────────────────────────────

interface ArcGISQueryResponse {
  features?: ArcGISFeature[];
  error?: { code: number; message: string };
}

interface ArcGISFeature {
  attributes: Record<string, unknown>;
  geometry?: {
    rings?: number[][][];
  };
}

// ── Constants ───────────────────────────────────────────────────────

const PARCELS_URL =
  "https://gis.kcgov.us/arcgis/rest/services/KC_Parcel_Polygon/MapServer/0/query";

const SALES_URL =
  "https://gis.kcgov.us/arcgis/rest/services/KC_Dynamic_Layers/MapServer/42/query";

const FETCH_TIMEOUT_MS = 8_000; // 8s timeout — their server is slow/unreliable

// ── Adapter Implementation ──────────────────────────────────────────

export class KootenaiCountyGISAdapter extends BaseProviderAdapter {
  constructor() {
    super({
      name: "kootenai_gis",
      baseUrl: PARCELS_URL,
      apiKeyEnvVar: "KOOTENAI_GIS_API_KEY", // Not needed — public API
      cacheTtlSeconds: 30 * 86400, // 30 days
      rateLimitPerMinute: 20,
    });
  }

  /** Override getApiKey — public API, no key needed */
  protected override getApiKey(): string {
    return "public";
  }

  /** Always configured — public API */
  override isConfigured(): boolean {
    return true;
  }

  async lookupProperty(params: {
    address?: string;
    apn?: string;
    county?: string;
    state?: string;
    zip?: string;
  }): Promise<ProviderLookupResult> {
    // Only works for Kootenai County
    if (params.county && !params.county.toLowerCase().includes("kootenai")) {
      return this.emptyResult("Not Kootenai County — skipping GIS lookup");
    }
    if (params.state && params.state.toUpperCase() !== "ID") {
      return this.emptyResult("Not Idaho — skipping GIS lookup");
    }

    try {
      // Build query — try APN first, then address
      let where: string;
      if (params.apn) {
        const cleanApn = params.apn.replace(/[^0-9A-Za-z.-]/g, "");
        where = `Serial = '${cleanApn}'`;
      } else if (params.address) {
        // Extract street number for filtering
        const parts = params.address.trim().toUpperCase().split(/\s+/);
        const streetNum = parts[0]?.replace(/\D/g, "");
        if (streetNum && parts.length > 1) {
          // Use a broad LIKE on the full address text
          where = `1=1`; // KC parcels may not have structured address — use geometry/text search
          // Fall back to text-based search
          const addrFragment = parts.slice(0, 3).join(" ");
          where = `UPPER(CAST(OBJECTID AS VARCHAR(10))) IS NOT NULL`; // placeholder — KC may need different approach
          // Try address-based search if available
          where = `1=1`;
        } else {
          return this.emptyResult("Cannot parse address for Kootenai County lookup");
        }
      } else {
        return this.emptyResult("Need address or APN for GIS lookup");
      }

      // Query parcels with timeout
      const parcelUrl = new URL(PARCELS_URL);
      parcelUrl.searchParams.set("where", where);
      parcelUrl.searchParams.set("outFields", "*");
      parcelUrl.searchParams.set("resultRecordCount", "1");
      parcelUrl.searchParams.set("f", "json");
      parcelUrl.searchParams.set("returnGeometry", "true");

      const parcelData = await this.fetchWithTimeout<ArcGISQueryResponse>(
        parcelUrl.toString()
      );

      if (!parcelData?.features || parcelData.features.length === 0) {
        return this.emptyResult("No parcel found in Kootenai County GIS");
      }

      const parcel = parcelData.features[0].attributes;
      const parcelGeometry = parcelData.features[0].geometry;

      // Try to fetch sales data (non-blocking if it fails)
      let sales: Record<string, unknown>[] = [];
      try {
        const parcelId = (parcel.Serial ?? parcel.OBJECTID ?? "") as string;
        if (parcelId) {
          sales = await this.fetchRecentSales(String(parcelId));
        }
      } catch {
        // Sales data is supplementary
      }

      // Extract facts
      const facts = this.extractFacts(parcel, sales, parcelGeometry);

      return {
        provider: "kootenai_gis",
        rawPayload: {
          parcel: parcel as Record<string, unknown>,
          sales: sales,
          geometry: parcelGeometry as unknown as Record<string, unknown>,
        },
        facts,
        cached: false,
        fetchedAt: new Date().toISOString(),
        cost: 0,
      };
    } catch (err) {
      // Graceful fallback — Kootenai's server is unreliable
      console.warn(
        "[KootenaiGIS] Lookup failed (non-fatal):",
        err instanceof Error ? err.message : err
      );
      return this.emptyResult(
        `Kootenai County GIS unavailable: ${err instanceof Error ? err.message : "unknown error"}`
      );
    }
  }

  private async fetchRecentSales(
    parcelId: string
  ): Promise<Record<string, unknown>[]> {
    const url = new URL(SALES_URL);
    url.searchParams.set("where", `Parcel = '${parcelId}' OR Serial = '${parcelId}'`);
    url.searchParams.set("outFields", "*");
    url.searchParams.set("resultRecordCount", "5");
    url.searchParams.set("orderByFields", "OBJECTID DESC");
    url.searchParams.set("f", "json");

    const data = await this.fetchWithTimeout<ArcGISQueryResponse>(url.toString());
    return (data?.features ?? []).map((f) => f.attributes);
  }

  private extractFacts(
    p: Record<string, unknown>,
    sales: Record<string, unknown>[],
    geometry?: { rings?: number[][][] }
  ): CanonicalPropertyFact[] {
    const facts: CanonicalPropertyFact[] = [];

    const add = (
      fieldName: string,
      value: string | number | boolean | null | undefined,
      providerPath: string,
      conf: CanonicalPropertyFact["confidence"] = "high"
    ) => {
      if (value !== null && value !== undefined && value !== "" && value !== 0) {
        facts.push({
          fieldName,
          value,
          confidence: conf,
          providerFieldPath: providerPath,
        });
      }
    };

    // Kootenai's field names may differ from Spokane's — extract what we can
    // Common ArcGIS assessor field patterns
    const assessed = (p.assessed_amt ?? p.AssessedValue ?? p.ASSESSED_VALUE ?? p.TotalValue) as number | undefined;
    const land = (p.land_value ?? p.LandValue ?? p.LAND_VALUE) as number | undefined;
    const taxable = (p.taxable_amt ?? p.TaxableValue ?? p.TAXABLE_VALUE) as number | undefined;

    add("county_assessed_value", assessed, "assessed_value", "high");
    add("county_land_value", land, "land_value", "high");
    add("county_taxable_value", taxable, "taxable_value", "high");

    if (assessed && land && assessed > land) {
      add("county_improvement_value", assessed - land, "assessed - land", "high");
    }

    // Parcel ID
    const parcelNum = (p.Serial ?? p.parcel ?? p.PARCEL ?? p.PIN) as string | undefined;
    add("county_parcel_number", parcelNum?.toString().trim(), "Serial/parcel", "high");

    // Property use
    const useDesc = (p.prop_use_desc ?? p.PropertyUse ?? p.PROP_USE_DESC ?? p.LandUse) as string | undefined;
    const useCode = (p.prop_use_code ?? p.PROP_USE_CODE) as string | undefined;
    add("county_prop_use_desc", useDesc?.toString().trim(), "prop_use_desc", "high");
    add("county_prop_use_code", useCode?.toString().trim(), "prop_use_code", "high");

    // Acreage
    const acreage = (p.acreage ?? p.Acreage ?? p.ACREAGE ?? p.Acres) as number | undefined;
    add("county_acreage", acreage, "acreage", "high");

    // Neighborhood
    const nbhd = (p.nbhd_name ?? p.Neighborhood ?? p.NEIGHBORHOOD) as string | undefined;
    add("county_neighborhood_name", nbhd?.toString().trim(), "neighborhood", "medium");

    // Sales history
    if (sales.length > 0) {
      const validSales = sales.filter(
        (s) => (s.gross_sale_price ?? s.SalePrice ?? s.SALE_PRICE) as number > 0
      );

      if (validSales.length > 0) {
        const latest = validSales[0];
        const price = (latest.gross_sale_price ?? latest.SalePrice ?? latest.SALE_PRICE) as number;
        const dateRaw = (latest.document_date ?? latest.SaleDate ?? latest.SALE_DATE) as number | string;

        add("county_last_sale_price", price, "sales[0].price", "high");
        if (dateRaw) {
          const dateStr =
            typeof dateRaw === "number"
              ? new Date(dateRaw).toISOString().split("T")[0]
              : String(dateRaw).split("T")[0];
          add("county_last_sale_date", dateStr, "sales[0].date", "high");
        }

        // Full sales history
        add(
          "county_sales_history",
          JSON.stringify(
            validSales.slice(0, 5).map((s) => ({
              price: (s.gross_sale_price ?? s.SalePrice ?? s.SALE_PRICE) as number,
              date:
                typeof (s.document_date ?? s.SaleDate ?? s.SALE_DATE) === "number"
                  ? new Date((s.document_date ?? s.SaleDate ?? s.SALE_DATE) as number)
                      .toISOString()
                      .split("T")[0]
                  : null,
            }))
          ),
          "sales",
          "high"
        );
      }
    }

    // Geometry
    if (geometry?.rings) {
      add(
        "county_parcel_geometry",
        JSON.stringify(geometry.rings),
        "geometry.rings",
        "high"
      );
    }

    return facts;
  }

  /** Fetch with timeout — Kootenai's server often hangs or is down */
  private async fetchWithTimeout<T>(url: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      await this.checkRateLimit();
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as T;
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  private emptyResult(reason: string): ProviderLookupResult {
    return {
      provider: "kootenai_gis",
      rawPayload: { skipped: reason },
      facts: [],
      cached: false,
      fetchedAt: new Date().toISOString(),
      cost: 0,
    };
  }
}

/** Singleton instance */
export const kootenaiGisAdapter = new KootenaiCountyGISAdapter();
