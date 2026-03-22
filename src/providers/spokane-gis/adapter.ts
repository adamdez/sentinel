/**
 * Spokane County GIS Provider Adapter
 *
 * Free ArcGIS REST API — no auth, no API key, no cost.
 * Provides county assessor data that complements Bricked AI:
 * - Official assessed value (vs Bricked's AI-estimated ARV)
 * - Land value (separate from improvements)
 * - Tax exemptions (senior, disabled, etc.)
 * - Vacancy flag, property use, neighborhood
 * - Recent sale prices from county excise records
 *
 * Endpoints:
 *   Parcels FeatureServer: https://services1.arcgis.com/ozNll27nt9ZtPWOn/arcgis/rest/services/Parcels/FeatureServer/0/query
 *   Property Sales MapServer: https://gismo.spokanecounty.org/arcgis/rest/services/OpenData/Property/MapServer/{year_layer}/query
 *
 * Query by APN (parcel number) or site_address LIKE '%street%'
 * Returns GeoJSON with parcel polygon for mapping.
 */

import {
  BaseProviderAdapter,
  type CanonicalPropertyFact,
  type ProviderLookupResult,
} from "../base-adapter";

// ── ArcGIS Response Types ───────────────────────────────────────────

interface ArcGISQueryResponse {
  features: ArcGISFeature[];
  exceededTransferLimit?: boolean;
}

interface ArcGISFeature {
  attributes: Record<string, unknown>;
  geometry?: {
    rings?: number[][][];
  };
}

interface ParcelAttributes {
  OBJECTID: number;
  PID_NUM: string;
  parcel: string;
  prop_use_code: string;
  prop_use_desc: string;
  tax_year: number;
  site_address: string;
  site_city: string;
  site_state: string;
  site_zip: string;
  nbhd_code: string;
  nbhd_name: string;
  acreage: number;
  assessed_amt: number;
  taxable_amt: number;
  land_value: number;
  exmp_code: string | null;
  exmp_amt: number | null;
  vacant_land_flag: string;
  res_com_flag: string;
  bldg_only_flag: string;
  inspection_cycle: string;
  tax_code_area: string;
  asmt_year: number;
  seg_status: string;
  soil_id: string;
  appraiser_id: string;
}

interface SaleAttributes {
  Parcel: string;
  gross_sale_price: number;
  document_date: number; // epoch ms
  excise_nbr: string;
  prop_use_code: string;
  vacant_land_flag: string;
}

// ── Constants ───────────────────────────────────────────────────────

const PARCELS_URL =
  "https://services1.arcgis.com/ozNll27nt9ZtPWOn/arcgis/rest/services/Parcels/FeatureServer/0/query";

const SALES_BASE_URL =
  "https://gismo.spokanecounty.org/arcgis/rest/services/OpenData/Property/MapServer";

// MapServer layer IDs by year (county adds new layers annually)
const SALES_LAYER_IDS: Record<number, number> = {
  2026: 20,
  2025: 19,
  2024: 18,
  2023: 17,
  2022: 16,
};

// ── Adapter Implementation ──────────────────────────────────────────

export class SpokaneCountyGISAdapter extends BaseProviderAdapter {
  constructor() {
    super({
      name: "spokane_gis",
      baseUrl: PARCELS_URL,
      apiKeyEnvVar: "SPOKANE_GIS_API_KEY", // Not actually needed — public API
      cacheTtlSeconds: 30 * 86400, // 30 days (county data updates annually)
      rateLimitPerMinute: 30,
    });
  }

  /** Override getApiKey — this API is public, no key needed */
  protected override getApiKey(): string {
    return "public"; // No auth required
  }

  /** Always configured — public API, no key needed */
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
    // Only works for Spokane County
    if (params.county && !params.county.toLowerCase().includes("spokane")) {
      return this.emptyResult("Not Spokane County — skipping GIS lookup");
    }
    if (params.state && params.state.toUpperCase() !== "WA") {
      return this.emptyResult("Not Washington state — skipping GIS lookup");
    }

    // Build the ArcGIS where clause — prefer APN, fall back to address
    let where: string;
    if (params.apn) {
      // APN format: "13143.1708" or similar
      const cleanApn = params.apn.replace(/[^0-9.]/g, "");
      where = `parcel = '${cleanApn}' OR PID_NUM = '${cleanApn}'`;
    } else if (params.address) {
      // Extract street number + name for LIKE query
      const parts = params.address.trim().toUpperCase().split(/\s+/);
      const streetNum = parts[0]?.replace(/\D/g, "");
      if (streetNum) {
        where = `site_str_nbr = ${streetNum} AND site_address LIKE '%${parts.slice(1, 3).join(" ")}%'`;
      } else {
        where = `site_address LIKE '%${params.address.toUpperCase().slice(0, 40)}%'`;
      }
    } else {
      return this.emptyResult("Need address or APN for GIS lookup");
    }

    // Query parcels
    const parcelUrl = new URL(PARCELS_URL);
    parcelUrl.searchParams.set("where", where);
    parcelUrl.searchParams.set("outFields", "*");
    parcelUrl.searchParams.set("resultRecordCount", "1");
    parcelUrl.searchParams.set("f", "json");

    const parcelData = await this.fetchJson<ArcGISQueryResponse>(parcelUrl.toString());

    if (!parcelData.features || parcelData.features.length === 0) {
      return this.emptyResult("No parcel found in Spokane County GIS");
    }

    const parcel = parcelData.features[0].attributes as unknown as ParcelAttributes;
    const parcelGeometry = parcelData.features[0].geometry;

    // Query recent sales for this parcel
    const sales = await this.fetchRecentSales(parcel.parcel || parcel.PID_NUM);

    // Extract canonical facts
    const facts = this.extractParcelFacts(parcel, sales);

    return {
      provider: "spokane_gis",
      rawPayload: {
        parcel: parcel as unknown as Record<string, unknown>,
        sales: sales as unknown as Record<string, unknown>[],
        geometry: parcelGeometry as unknown as Record<string, unknown>,
      },
      facts,
      cached: false,
      fetchedAt: new Date().toISOString(),
      cost: 0, // Free public API
    };
  }

  private async fetchRecentSales(parcelNumber: string): Promise<SaleAttributes[]> {
    const currentYear = new Date().getFullYear();
    const sales: SaleAttributes[] = [];

    // Try current year and previous year
    for (const year of [currentYear, currentYear - 1]) {
      const layerId = SALES_LAYER_IDS[year];
      if (!layerId) continue;

      try {
        const url = new URL(`${SALES_BASE_URL}/${layerId}/query`);
        url.searchParams.set("where", `Parcel = '${parcelNumber}'`);
        url.searchParams.set("outFields", "*");
        url.searchParams.set("resultRecordCount", "5");
        url.searchParams.set("f", "json");

        const data = await this.fetchJson<ArcGISQueryResponse>(url.toString());
        for (const f of data.features ?? []) {
          sales.push(f.attributes as unknown as SaleAttributes);
        }
      } catch {
        // Sale data is supplementary — don't fail the whole lookup
      }
    }

    return sales;
  }

  private extractParcelFacts(
    p: ParcelAttributes,
    sales: SaleAttributes[],
  ): CanonicalPropertyFact[] {
    const facts: CanonicalPropertyFact[] = [];

    const add = (
      fieldName: string,
      value: string | number | boolean | null | undefined,
      providerPath: string,
      conf: CanonicalPropertyFact["confidence"] = "high",
    ) => {
      if (value !== null && value !== undefined && value !== "" && value !== 0) {
        facts.push({ fieldName, value, confidence: conf, providerFieldPath: providerPath });
      }
    };

    // ── Valuation (county official — higher confidence than AI estimates)
    add("county_assessed_value", p.assessed_amt, "assessed_amt", "high");
    add("county_taxable_value", p.taxable_amt, "taxable_amt", "high");
    add("county_land_value", p.land_value, "land_value", "high");
    const improvementValue = (p.assessed_amt ?? 0) - (p.land_value ?? 0);
    if (improvementValue > 0) {
      add("county_improvement_value", improvementValue, "assessed_amt - land_value", "high");
    }

    // ── Tax exemptions (distress signal — senior/disabled exemptions suggest motivated seller)
    if (p.exmp_code) {
      add("tax_exemption_code", p.exmp_code.trim(), "exmp_code", "high");
    }
    if (p.exmp_amt && p.exmp_amt > 0) {
      add("tax_exemption_amount", p.exmp_amt, "exmp_amt", "high");
    }

    // ── Property classification
    add("county_prop_use_code", p.prop_use_code, "prop_use_code", "high");
    add("county_prop_use_desc", p.prop_use_desc?.trim(), "prop_use_desc", "high");
    add("county_neighborhood_code", p.nbhd_code, "nbhd_code", "high");
    add("county_neighborhood_name", p.nbhd_name?.trim(), "nbhd_name", "high");
    add("county_acreage", p.acreage, "acreage", "high");
    add("county_tax_code_area", p.tax_code_area?.trim(), "tax_code_area", "medium");

    // ── Flags (actionable for lead qualification)
    if (p.vacant_land_flag === "Y") {
      add("vacant_land", true, "vacant_land_flag", "high");
    }
    add("county_res_com_flag", p.res_com_flag?.trim(), "res_com_flag", "high");

    // ── Parcel identifiers
    add("county_parcel_number", p.parcel?.trim() || p.PID_NUM?.trim(), "parcel", "high");
    add("county_assessment_year", p.asmt_year, "asmt_year", "high");
    add("county_seg_status", p.seg_status?.trim(), "seg_status", "medium");

    // ── Recent county-recorded sales
    if (sales.length > 0) {
      const recentSales = sales
        .filter((s) => s.gross_sale_price > 0)
        .sort((a, b) => (b.document_date ?? 0) - (a.document_date ?? 0));

      if (recentSales.length > 0) {
        const latest = recentSales[0];
        add("county_last_sale_price", latest.gross_sale_price, "sales[0].gross_sale_price", "high");
        if (latest.document_date) {
          add(
            "county_last_sale_date",
            new Date(latest.document_date).toISOString().split("T")[0],
            "sales[0].document_date",
            "high",
          );
        }
      }

      // Store full sales array for UI rendering
      if (recentSales.length > 0) {
        add(
          "county_sales_history",
          JSON.stringify(
            recentSales.slice(0, 5).map((s) => ({
              price: s.gross_sale_price,
              date: s.document_date ? new Date(s.document_date).toISOString().split("T")[0] : null,
              excise: s.excise_nbr,
            })),
          ),
          "sales",
          "high",
        );
      }
    }

    return facts;
  }

  private emptyResult(reason: string): ProviderLookupResult {
    return {
      provider: "spokane_gis",
      rawPayload: { skipped: reason },
      facts: [],
      cached: false,
      fetchedAt: new Date().toISOString(),
      cost: 0,
    };
  }
}

/** Singleton instance */
export const spokaneGisAdapter = new SpokaneCountyGISAdapter();

/** Re-export types */
export type { ParcelAttributes, SaleAttributes };
