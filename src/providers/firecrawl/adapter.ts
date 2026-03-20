/**
 * Firecrawl Provider Adapter — Structured Web Extraction
 *
 * Extracts property/owner facts from public county recorder and assessor sites
 * using Firecrawl's /scrape endpoint with LLM extraction.
 *
 * Write path:
 *   Firecrawl JSON → raw_artifact → fact_assertions → dossier (via Research Agent)
 *
 * BOUNDARY RULES:
 * - Raw response stored in dossier_artifacts (never in leads table)
 * - Facts normalized to canonical field names with confidence levels
 * - No Firecrawl field names leak into Sentinel schema
 * - Rate limited: 20 req/min (Firecrawl Standard tier)
 *
 * COUNTY TARGETS (Primary markets):
 *   Spokane County WA — https://cp.spokanecounty.org/scout/propertyinformation/
 *   Kootenai County ID — https://www.kcgov.us/193/Assessor
 */

import {
  BaseProviderAdapter,
  type ProviderLookupResult,
  type CanonicalPropertyFact,
} from "../base-adapter";

// ── Firecrawl extraction schema ──────────────────────────────────────────────
// Tells Firecrawl what structured data to extract from the page.

const PROPERTY_EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    owner_name: { type: "string", description: "Current property owner full name" },
    owner_mailing_address: { type: "string", description: "Owner mailing address if different from property" },
    property_address: { type: "string", description: "Full property street address" },
    parcel_number: { type: "string", description: "APN / parcel number" },
    assessed_value: { type: "number", description: "Total assessed value in dollars" },
    land_value: { type: "number", description: "Assessed land value in dollars" },
    improvement_value: { type: "number", description: "Assessed improvement/building value in dollars" },
    tax_year: { type: "number", description: "Tax assessment year" },
    tax_amount: { type: "number", description: "Annual property tax amount" },
    tax_status: { type: "string", description: "Tax payment status (current, delinquent, etc.)" },
    property_type: { type: "string", description: "Property type/use (residential, commercial, etc.)" },
    year_built: { type: "number", description: "Year the structure was built" },
    square_footage: { type: "number", description: "Total living area in sq ft" },
    lot_size_sqft: { type: "number", description: "Lot size in square feet" },
    lot_size_acres: { type: "number", description: "Lot size in acres" },
    bedrooms: { type: "number", description: "Number of bedrooms" },
    bathrooms: { type: "number", description: "Number of bathrooms" },
    legal_description: { type: "string", description: "Legal description of the property" },
    sale_date: { type: "string", description: "Most recent sale date" },
    sale_price: { type: "number", description: "Most recent sale price in dollars" },
    recording_number: { type: "string", description: "Recording/document number of last transfer" },
    zoning: { type: "string", description: "Zoning classification" },
    school_district: { type: "string", description: "School district name" },
  },
};

// ── County URL patterns ──────────────────────────────────────────────────────

interface CountyPortal {
  name: string;
  assessorUrlPattern: (params: { address?: string; apn?: string }) => string | null;
  county: string;
  state: string;
}

const COUNTY_PORTALS: CountyPortal[] = [
  {
    name: "Spokane County Assessor",
    county: "Spokane",
    state: "WA",
    assessorUrlPattern: ({ address, apn }) => {
      if (apn) {
        return `https://cp.spokanecounty.org/scout/propertyinformation/Summary.aspx?ParcelNumber=${encodeURIComponent(apn)}`;
      }
      if (address) {
        return `https://cp.spokanecounty.org/scout/propertyinformation/Summary.aspx?Address=${encodeURIComponent(address)}`;
      }
      return null;
    },
  },
  {
    name: "Kootenai County Assessor",
    county: "Kootenai",
    state: "ID",
    assessorUrlPattern: ({ apn }) => {
      if (apn) {
        return `https://www.kcgov.us/193/Assessor?parcel=${encodeURIComponent(apn)}`;
      }
      return null;
    },
  },
];

// ── Firecrawl scrape response type ───────────────────────────────────────────

interface FirecrawlScrapeResponse {
  success: boolean;
  data?: {
    markdown?: string;
    extract?: Record<string, unknown>;
    metadata?: {
      title?: string;
      sourceURL?: string;
      statusCode?: number;
    };
  };
  error?: string;
}

// ── Adapter Implementation ───────────────────────────────────────────────────

class FirecrawlAdapter extends BaseProviderAdapter {
  constructor() {
    super({
      name: "firecrawl",
      baseUrl: "https://api.firecrawl.dev/v1",
      apiKeyEnvVar: "FIRECRAWL_API_KEY",
      cacheTtlSeconds: 7 * 24 * 60 * 60, // 7 days — county records are fairly static
      rateLimitPerMinute: 20,
    });
  }

  /**
   * Scrape a county assessor page and extract structured property data.
   */
  async lookupProperty(params: {
    address?: string;
    apn?: string;
    county?: string;
    state?: string;
    zip?: string;
  }): Promise<ProviderLookupResult> {
    // Find the right county portal
    const portal = this.findPortal(params.county, params.state);
    if (!portal) {
      return {
        provider: this.config.name,
        rawPayload: {},
        facts: [],
        cached: false,
        fetchedAt: new Date().toISOString(),
      };
    }

    const url = portal.assessorUrlPattern({ address: params.address, apn: params.apn });
    if (!url) {
      return {
        provider: this.config.name,
        rawPayload: { error: "No address or APN provided for county lookup" },
        facts: [],
        cached: false,
        fetchedAt: new Date().toISOString(),
      };
    }

    // Call Firecrawl /scrape with extraction
    const apiKey = this.getApiKey();
    const response = await this.fetchJson<FirecrawlScrapeResponse>(
      `${this.config.baseUrl}/scrape`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          url,
          formats: ["extract"],
          extract: {
            schema: PROPERTY_EXTRACTION_SCHEMA,
          },
          waitFor: 3000, // County sites are JS-heavy
        }),
      },
    );

    if (!response.success || !response.data?.extract) {
      return {
        provider: this.config.name,
        rawPayload: { url, error: response.error ?? "No data extracted" },
        facts: [],
        cached: false,
        fetchedAt: new Date().toISOString(),
      };
    }

    const extracted = response.data.extract;
    const facts = this.normalizeToFacts(extracted, portal);

    return {
      provider: this.config.name,
      rawPayload: {
        sourceUrl: url,
        portalName: portal.name,
        extracted,
        metadata: response.data.metadata,
      },
      facts,
      cached: false,
      fetchedAt: new Date().toISOString(),
      cost: 1, // 1 Firecrawl credit per scrape
    };
  }

  /**
   * Scrape an arbitrary URL for property data.
   * Used when we have a direct link (e.g., from a county search result).
   */
  async scrapeUrl(url: string): Promise<ProviderLookupResult> {
    const apiKey = this.getApiKey();

    const response = await this.fetchJson<FirecrawlScrapeResponse>(
      `${this.config.baseUrl}/scrape`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          url,
          formats: ["extract", "markdown"],
          extract: {
            schema: PROPERTY_EXTRACTION_SCHEMA,
          },
          waitFor: 3000,
        }),
      },
    );

    if (!response.success || !response.data?.extract) {
      return {
        provider: this.config.name,
        rawPayload: { url, error: response.error ?? "No data extracted" },
        facts: [],
        cached: false,
        fetchedAt: new Date().toISOString(),
      };
    }

    const extracted = response.data.extract;
    const facts = this.normalizeToFacts(extracted);

    return {
      provider: this.config.name,
      rawPayload: {
        sourceUrl: url,
        extracted,
        markdown: response.data.markdown?.slice(0, 5000), // Keep first 5K for context
        metadata: response.data.metadata,
      },
      facts,
      cached: false,
      fetchedAt: new Date().toISOString(),
      cost: 1,
    };
  }

  // ── Internal helpers ─────────────────────────────────────────────────────

  private findPortal(county?: string, state?: string): CountyPortal | null {
    if (!county && !state) return null;

    return COUNTY_PORTALS.find((p) => {
      const countyMatch = !county || p.county.toLowerCase() === county.toLowerCase();
      const stateMatch = !state || p.state.toLowerCase() === state.toLowerCase();
      return countyMatch && stateMatch;
    }) ?? null;
  }

  private normalizeToFacts(
    extracted: Record<string, unknown>,
    portal?: CountyPortal,
  ): CanonicalPropertyFact[] {
    const facts: CanonicalPropertyFact[] = [];

    const add = (
      fieldName: string,
      value: unknown,
      confidence: CanonicalPropertyFact["confidence"],
      providerField: string,
    ) => {
      if (value === null || value === undefined || value === "") return;
      facts.push({
        fieldName,
        value: typeof value === "object" ? JSON.stringify(value) : value as string | number | boolean,
        confidence,
        providerFieldPath: `firecrawl.extract.${providerField}`,
      });
    };

    // County assessor records are generally medium-high confidence
    const conf: CanonicalPropertyFact["confidence"] = portal ? "medium" : "low";

    add("owner_name", extracted.owner_name, conf, "owner_name");
    add("owner_mailing_address", extracted.owner_mailing_address, conf, "owner_mailing_address");
    add("property_address", extracted.property_address, conf, "property_address");
    add("apn", extracted.parcel_number, conf, "parcel_number");
    add("assessed_value", extracted.assessed_value, conf, "assessed_value");
    add("land_value", extracted.land_value, conf, "land_value");
    add("improvement_value", extracted.improvement_value, conf, "improvement_value");
    add("tax_year", extracted.tax_year, conf, "tax_year");
    add("tax_amount", extracted.tax_amount, conf, "tax_amount");
    add("tax_status", extracted.tax_status, conf, "tax_status");
    add("property_type", extracted.property_type, conf, "property_type");
    add("year_built", extracted.year_built, conf, "year_built");
    add("square_footage", extracted.square_footage, conf, "square_footage");
    add("lot_size_sqft", extracted.lot_size_sqft, conf, "lot_size_sqft");
    add("lot_size_acres", extracted.lot_size_acres, conf, "lot_size_acres");
    add("bedrooms", extracted.bedrooms, conf, "bedrooms");
    add("bathrooms", extracted.bathrooms, conf, "bathrooms");
    add("legal_description", extracted.legal_description, "low", "legal_description");
    add("last_sale_date", extracted.sale_date, conf, "sale_date");
    add("last_sale_price", extracted.sale_price, conf, "sale_price");
    add("recording_number", extracted.recording_number, conf, "recording_number");
    add("zoning", extracted.zoning, conf, "zoning");
    add("school_district", extracted.school_district, "low", "school_district");

    return facts;
  }
}

/** Singleton adapter instance */
export const firecrawlAdapter = new FirecrawlAdapter();
