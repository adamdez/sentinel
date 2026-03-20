/**
 * PropertyRadar Provider Adapter
 *
 * Wraps PropertyRadar v1 API for canonical fact extraction.
 * Existing direct PR calls throughout the codebase handle operational lookups.
 * This adapter is specifically for the intelligence pipeline:
 *   PR response → raw_artifact → fact_assertions → dossier
 *
 * BOUNDARY RULES:
 * - Raw responses stored in dossier_artifacts only
 * - Facts normalized to canonical field names with confidence levels
 * - PR-specific field names never leak into Sentinel schema
 * - PropertyRadar data is "high" confidence (verified county source)
 */

import {
  BaseProviderAdapter,
  type ProviderLookupResult,
  type CanonicalPropertyFact,
} from "../base-adapter";

const PR_API_BASE = "https://api.propertyradar.com/v1/properties";

// ── PR response type (relevant subset) ────────────────────────────────────

interface PRPropertyResult {
  RadarID?: string;
  APN?: string;
  County?: string;
  Address?: string;
  City?: string;
  State?: string;
  ZipFive?: string;
  OwnerNames?: string;
  MailingAddress?: string;
  MailingCity?: string;
  MailingState?: string;
  MailingZip?: string;
  EstimatedValue?: number;
  EstimatedEquity?: number;
  EstimatedEquityPercent?: number;
  AvmValue?: number;
  AvmValueHigh?: number;
  AvmValueLow?: number;
  TotalLoanBalance?: number;
  FirstMortgageBalance?: number;
  FirstMortgageRate?: number;
  FirstMortgageType?: string;
  FirstMortgageTerm?: number;
  LastSaleDate?: string;
  LastSalePrice?: number;
  PropertyType?: string;
  YearBuilt?: number;
  SquareFeet?: number;
  LotSquareFeet?: number;
  LotAcres?: number;
  Bedrooms?: number;
  Bathrooms?: number;
  TaxAssessedValue?: number;
  TaxDelinquencyAmount?: number;
  TaxRate?: number;
  Zoning?: string;
  // Distress flags
  isPreforeclosure?: boolean | number;
  inForeclosure?: boolean | number;
  isDeceasedProperty?: boolean | number;
  inTaxDelinquency?: boolean | number;
  inBankruptcyProperty?: boolean | number;
  inDivorce?: boolean | number;
  isSiteVacant?: boolean | number;
  isMailVacant?: boolean | number;
  isNotSameMailingOrExempt?: boolean | number;
  isUnderwater?: boolean | number;
  isListedForSale?: boolean | number;
  // Owner graph
  OwnershipLengthMonths?: number;
  isOwnerOccupied?: boolean | number;
}

// ── Adapter ───────────────────────────────────────────────────────────────

class PropertyRadarAdapter extends BaseProviderAdapter {
  constructor() {
    super({
      name: "propertyradar",
      baseUrl: PR_API_BASE,
      apiKeyEnvVar: "PROPERTYRADAR_API_KEY",
      cacheTtlSeconds: 24 * 60 * 60, // 1 day — PR data updates daily
      rateLimitPerMinute: 30,
    });
  }

  async lookupProperty(params: {
    address?: string;
    apn?: string;
    county?: string;
    state?: string;
    zip?: string;
  }): Promise<ProviderLookupResult> {
    const apiKey = this.getApiKey();

    // Build search criteria
    const criteria: { name: string; value: (string | number)[] }[] = [];
    if (params.address) criteria.push({ name: "Address", value: [params.address] });
    if (params.state) criteria.push({ name: "State", value: [params.state] });
    if (params.zip) criteria.push({ name: "ZipFive", value: [params.zip] });
    if (params.county) criteria.push({ name: "County", value: [params.county] });

    if (criteria.length === 0) {
      return {
        provider: this.config.name,
        rawPayload: { error: "No search criteria provided" },
        facts: [],
        cached: false,
        fetchedAt: new Date().toISOString(),
      };
    }

    await this.checkRateLimit();

    const res = await fetch(`${PR_API_BASE}?Purchase=1&Limit=1&Fields=All`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ Criteria: criteria }),
    });

    if (!res.ok) {
      throw new Error(`PropertyRadar API error: ${res.status}`);
    }

    const data = await res.json() as { results?: PRPropertyResult[] };
    const pr = data.results?.[0];

    if (!pr) {
      return {
        provider: this.config.name,
        rawPayload: { criteria, error: "No property found" },
        facts: [],
        cached: false,
        fetchedAt: new Date().toISOString(),
      };
    }

    const facts = this.normalizeToFacts(pr);

    return {
      provider: this.config.name,
      rawPayload: pr as unknown as Record<string, unknown>,
      facts,
      cached: false,
      fetchedAt: new Date().toISOString(),
      cost: 1, // 1 PR credit per lookup
    };
  }

  /**
   * Look up by RadarID (already known from prior searches).
   */
  async lookupByRadarId(radarId: string): Promise<ProviderLookupResult> {
    const apiKey = this.getApiKey();
    await this.checkRateLimit();

    const res = await fetch(`${PR_API_BASE}/${radarId}?Fields=All`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`PropertyRadar API error: ${res.status}`);
    }

    const pr = await res.json() as PRPropertyResult;
    const facts = this.normalizeToFacts(pr);

    return {
      provider: this.config.name,
      rawPayload: pr as unknown as Record<string, unknown>,
      facts,
      cached: false,
      fetchedAt: new Date().toISOString(),
    };
  }

  private normalizeToFacts(pr: PRPropertyResult): CanonicalPropertyFact[] {
    const facts: CanonicalPropertyFact[] = [];

    const add = (
      fieldName: string,
      value: unknown,
      confidence: CanonicalPropertyFact["confidence"],
      providerField: string,
    ) => {
      if (value === null || value === undefined || value === "" || value === 0) return;
      facts.push({
        fieldName,
        value: typeof value === "boolean" ? String(value) : value as string | number,
        confidence,
        providerFieldPath: `propertyradar.${providerField}`,
      });
    };

    const isTruthy = (v: unknown): boolean =>
      v === true || v === 1 || v === "1" || v === "Yes";

    // PR data is high confidence — sourced from county records
    add("owner_name", pr.OwnerNames, "high", "OwnerNames");
    add("property_address", pr.Address, "high", "Address");
    add("city", pr.City, "high", "City");
    add("state", pr.State, "high", "State");
    add("zip", pr.ZipFive, "high", "ZipFive");
    add("county", pr.County, "high", "County");
    add("apn", pr.APN, "high", "APN");
    add("owner_mailing_address", pr.MailingAddress, "high", "MailingAddress");

    // Valuations — medium confidence (AVM estimates)
    add("estimated_value", pr.EstimatedValue, "medium", "EstimatedValue");
    add("estimated_equity", pr.EstimatedEquity, "medium", "EstimatedEquity");
    add("estimated_equity_pct", pr.EstimatedEquityPercent, "medium", "EstimatedEquityPercent");
    add("avm_value", pr.AvmValue, "medium", "AvmValue");
    add("avm_value_high", pr.AvmValueHigh, "medium", "AvmValueHigh");
    add("avm_value_low", pr.AvmValueLow, "medium", "AvmValueLow");

    // Mortgage data — high confidence (county recorded)
    add("total_loan_balance", pr.TotalLoanBalance, "high", "TotalLoanBalance");
    add("first_mortgage_balance", pr.FirstMortgageBalance, "high", "FirstMortgageBalance");
    add("first_mortgage_rate", pr.FirstMortgageRate, "high", "FirstMortgageRate");
    add("first_mortgage_type", pr.FirstMortgageType, "high", "FirstMortgageType");

    // Sale history
    add("last_sale_date", pr.LastSaleDate, "high", "LastSaleDate");
    add("last_sale_price", pr.LastSalePrice, "high", "LastSalePrice");

    // Property characteristics
    add("property_type", pr.PropertyType, "high", "PropertyType");
    add("year_built", pr.YearBuilt, "high", "YearBuilt");
    add("square_footage", pr.SquareFeet, "high", "SquareFeet");
    add("lot_size_sqft", pr.LotSquareFeet, "high", "LotSquareFeet");
    add("lot_size_acres", pr.LotAcres, "high", "LotAcres");
    add("bedrooms", pr.Bedrooms, "high", "Bedrooms");
    add("bathrooms", pr.Bathrooms, "high", "Bathrooms");

    // Tax data
    add("assessed_value", pr.TaxAssessedValue, "high", "TaxAssessedValue");
    add("tax_delinquency_amount", pr.TaxDelinquencyAmount, "high", "TaxDelinquencyAmount");

    // Ownership
    add("ownership_length_months", pr.OwnershipLengthMonths, "high", "OwnershipLengthMonths");
    if (isTruthy(pr.isOwnerOccupied)) add("owner_occupied", "true", "high", "isOwnerOccupied");

    // Distress signals — high confidence (county/court records)
    if (isTruthy(pr.isPreforeclosure)) add("distress_pre_foreclosure", "true", "high", "isPreforeclosure");
    if (isTruthy(pr.inForeclosure)) add("distress_foreclosure", "true", "high", "inForeclosure");
    if (isTruthy(pr.isDeceasedProperty)) add("distress_probate", "true", "high", "isDeceasedProperty");
    if (isTruthy(pr.inTaxDelinquency)) add("distress_tax_delinquent", "true", "high", "inTaxDelinquency");
    if (isTruthy(pr.inBankruptcyProperty)) add("distress_bankruptcy", "true", "high", "inBankruptcyProperty");
    if (isTruthy(pr.inDivorce)) add("distress_divorce", "true", "high", "inDivorce");
    if (isTruthy(pr.isSiteVacant) || isTruthy(pr.isMailVacant)) add("distress_vacant", "true", "high", "isSiteVacant");
    if (isTruthy(pr.isNotSameMailingOrExempt)) add("absentee_owner", "true", "high", "isNotSameMailingOrExempt");
    if (isTruthy(pr.isUnderwater)) add("distress_underwater", "true", "high", "isUnderwater");
    if (isTruthy(pr.isListedForSale)) add("listed_for_sale", "true", "medium", "isListedForSale");

    return facts;
  }
}

/** Singleton adapter instance */
export const propertyRadarAdapter = new PropertyRadarAdapter();
