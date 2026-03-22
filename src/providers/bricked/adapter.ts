/**
 * Bricked AI Provider Adapter
 *
 * Blueprint Section 5.1: "Comping/underwriting — INTEGRATE.
 * Bricked AI, $49/mo. 15-second underwriting. Don't build custom until you outgrow it."
 *
 * Bricked AI provides:
 * - Automated property comps (ARV + CMV estimation)
 * - AI-generated repair cost estimates with line items
 * - Full property details, ownership, mortgage, MLS data
 * - Comparable sales with adjusted values
 *
 * API docs: https://docs.bricked.ai/api-reference/introduction
 * Base URL: https://api.bricked.ai
 * Auth: x-api-key header
 *
 * Endpoints used:
 *   GET /v1/property/create?address=... — Create analysis (returns full data)
 *   GET /v1/property/get/{id}          — Retrieve by Bricked ID
 *   GET /v1/property/list?page=0       — List all org analyses
 *
 * Cache policy (Blueprint 5.5):
 * - Cache 7 days for active leads
 * - Refresh on offer preparation
 * - Do not re-run on every page load
 *
 * The adapter normalizes Bricked's response into canonical facts
 * that feed the intelligence pipeline. Provider field names never leak.
 */

import {
  BaseProviderAdapter,
  type CanonicalPropertyFact,
  type ProviderLookupResult,
} from "../base-adapter";

// ── Bricked AI Response Types (from docs.bricked.ai) ─────────────────

interface BrickedRenovationScore {
  hasScore: boolean;
  confidence: number;
  score: number;
}

interface BrickedPropertyDetails {
  bedrooms?: number;
  bathrooms?: number;
  squareFeet?: number;
  yearBuilt?: number;
  lotSquareFeet?: number;
  occupancy?: string;
  stories?: number;
  lastSaleDate?: number;
  lastSaleAmount?: number;
  basementType?: string;
  basementSquareFeet?: number;
  poolAvailable?: boolean;
  garageType?: string;
  garageSquareFeet?: number;
  airConditioningType?: string;
  heatingType?: string;
  heatingFuelType?: string;
  hoaPresent?: boolean;
  hoa1Fee?: number;
  hoa1FeeFrequency?: string;
  legalDescription?: string;
  fireplaces?: number;
  exteriorWallType?: string;
  daysOnMarket?: number;
  marketStatus?: string;
  surroundingType?: string;
  nonDisclosure?: boolean;
  renovationScore?: BrickedRenovationScore;
}

interface BrickedLandLocation {
  apn?: string;
  zoning?: string;
  landUse?: string;
  propertyClass?: string;
  lotNumber?: string;
  block?: string;
  schoolDistrict?: string;
  subdivision?: string;
  countyName?: string;
}

interface BrickedTax {
  year?: number;
  taxAmount?: number;
  assessedValue?: number;
  taxAmountChange?: number;
  assessedValueChange?: number;
  amountChange?: number;
  amount?: number;
}

interface BrickedHistoricListing {
  listingDate?: number;
  status?: string;
  amount?: number;
  pricePerSquareFoot?: number;
  daysOnMarket?: number;
  agentName?: string;
  mlsName?: string;
  mlsNumber?: string;
}

interface BrickedMortgage {
  seq?: number;
  amount?: number;
  interestRate?: number;
  recordingDate?: number;
  documentDate?: number;
  maturityDate?: number;
  recordingBook?: string;
  recordingPage?: string;
  documentNumber?: string;
  lenderName?: string;
  termType?: string;
  term?: string;
  documentCode?: string;
  transactionType?: string;
  granteeName?: string;
  riders?: string;
  description?: string;
  loanType?: string;
  position?: string;
  termDescription?: string;
}

interface BrickedMortgageDebt {
  openMortgageBalance?: number;
  estimatedEquity?: number;
  purchaseMethod?: string;
  ltvRatio?: number;
  itvRatio?: number;
  mortgages?: BrickedMortgage[];
}

interface BrickedOwner {
  firstName?: string;
  lastName?: string;
}

interface BrickedTransaction {
  saleDate?: number;
  amount?: number;
  purchaseMethod?: string;
  sellerNames?: string;
  buyerNames?: string;
}

interface BrickedOwnership {
  owners?: BrickedOwner[];
  ownershipLength?: number;
  ownerType?: string;
  ownerOccupancy?: string;
  taxExemptions?: string;
  taxAmount?: number;
  taxes?: BrickedTax[];
  transactions?: BrickedTransaction[];
}

interface BrickedMlsAgent {
  agentName?: string;
  agentPhone?: string;
  officeName?: string;
  officePhone?: string;
}

interface BrickedMls {
  status?: string;
  category?: string;
  listingDate?: number;
  amount?: number;
  daysOnMarket?: number;
  mlsName?: string;
  mlsNumber?: string;
  interiorFeatures?: string;
  applianceFeatures?: string;
  agent?: BrickedMlsAgent;
  historicListings?: BrickedHistoricListing[];
}

interface BrickedAddress {
  streetNumber?: string;
  streetName?: string;
  streetSuffix?: string;
  zip?: string;
  plusFour?: string;
  cityName?: string;
  countyName?: string;
  stateCode?: string;
  fullAddress?: string;
}

interface BrickedProperty {
  details?: BrickedPropertyDetails;
  landLocation?: BrickedLandLocation;
  mortgageDebt?: BrickedMortgageDebt;
  ownership?: BrickedOwnership;
  mls?: BrickedMls;
  latitude?: number;
  longitude?: number;
  address?: BrickedAddress;
  images?: string[];
}

interface BrickedComp extends BrickedProperty {
  selected?: boolean;
  compType?: string;
  listingType?: string;
  adjusted_value?: number;
}

interface BrickedRepair {
  repair?: string;
  description?: string;
  cost?: number;
}

interface BrickedCreateResponse {
  id: string;
  property: BrickedProperty;
  comps: BrickedComp[];
  shareLink?: string;
  dashboardLink?: string;
  cmv?: number | null;
  arv?: number | null;
  repairs?: BrickedRepair[];
  totalRepairCost?: number;
}

// ── Adapter Implementation ───────────────────────────────────────────

export class BrickedAdapter extends BaseProviderAdapter {
  constructor() {
    super({
      name: "bricked",
      baseUrl: "https://api.bricked.ai/v1",
      apiKeyEnvVar: "BRICKED_API_KEY",
      cacheTtlSeconds: 7 * 86400, // 7 days
      rateLimitPerMinute: 20,
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

    if (!params.address) {
      throw new Error("Bricked AI: address is required for comp analysis");
    }

    // Build full address string for the query parameter
    const fullAddress = [params.address, params.county, params.state, params.zip]
      .filter(Boolean)
      .join(", ");

    const url = new URL(`${this.config.baseUrl}/property/create`);
    url.searchParams.set("address", fullAddress);

    const data = await this.fetchJson<BrickedCreateResponse>(url.toString(), {
      headers: {
        "x-api-key": apiKey,
      },
    });

    return this.extractFacts(data, false);
  }

  /**
   * Retrieve a previously created Bricked analysis by its ID.
   * Useful for refreshing data without consuming a new credit.
   */
  async getProperty(brickedId: string): Promise<ProviderLookupResult> {
    const apiKey = this.getApiKey();

    const data = await this.fetchJson<BrickedCreateResponse>(
      `${this.config.baseUrl}/property/get/${brickedId}`,
      { headers: { "x-api-key": apiKey } },
    );

    return this.extractFacts(data, true);
  }

  /** Shared fact extraction for both create and get responses */
  private extractFacts(data: BrickedCreateResponse, cached: boolean): ProviderLookupResult {
    if (!data.id || !data.property) {
      return {
        provider: "bricked",
        rawPayload: data as unknown as Record<string, unknown>,
        facts: [],
        cached,
        fetchedAt: new Date().toISOString(),
      };
    }

    const facts: CanonicalPropertyFact[] = [];

    const add = (
      fieldName: string,
      value: string | number | boolean | null | undefined,
      providerPath: string,
      conf: CanonicalPropertyFact["confidence"] = "medium",
    ) => {
      if (value !== null && value !== undefined && value !== "") {
        facts.push({ fieldName, value, confidence: conf, providerFieldPath: providerPath });
      }
    };

    // ── Valuation (the money fields) ──────────────────────────────────
    add("arv_estimate", data.arv, "arv", "high");
    add("cmv_estimate", data.cmv, "cmv", "high");
    add("total_repair_cost", data.totalRepairCost, "totalRepairCost", "medium");

    // Bricked links
    add("bricked_share_link", data.shareLink, "shareLink", "high");
    add("bricked_dashboard_link", data.dashboardLink, "dashboardLink", "high");
    add("bricked_property_id", data.id, "id", "high");

    // ── Subject property details (full extraction) ────────────────────
    const det = data.property.details;
    if (det) {
      add("bedrooms", det.bedrooms, "property.details.bedrooms", "high");
      add("bathrooms", det.bathrooms, "property.details.bathrooms", "high");
      add("square_feet", det.squareFeet, "property.details.squareFeet", "high");
      add("year_built", det.yearBuilt, "property.details.yearBuilt", "high");
      add("lot_square_feet", det.lotSquareFeet, "property.details.lotSquareFeet", "high");
      add("stories", det.stories, "property.details.stories", "medium");
      add("last_sale_amount", det.lastSaleAmount, "property.details.lastSaleAmount", "high");
      add("last_sale_date", det.lastSaleDate, "property.details.lastSaleDate", "high");
      add("market_status", det.marketStatus, "property.details.marketStatus", "medium");
      add("days_on_market", det.daysOnMarket, "property.details.daysOnMarket", "medium");
      // Previously missing details
      add("basement_type", det.basementType, "property.details.basementType", "medium");
      add("basement_sqft", det.basementSquareFeet, "property.details.basementSquareFeet", "medium");
      add("pool_available", det.poolAvailable, "property.details.poolAvailable", "medium");
      add("garage_type", det.garageType, "property.details.garageType", "medium");
      add("garage_sqft", det.garageSquareFeet, "property.details.garageSquareFeet", "medium");
      add("air_conditioning", det.airConditioningType, "property.details.airConditioningType", "medium");
      add("heating_type", det.heatingType, "property.details.heatingType", "medium");
      add("heating_fuel", det.heatingFuelType, "property.details.heatingFuelType", "medium");
      add("hoa_present", det.hoaPresent, "property.details.hoaPresent", "medium");
      add("hoa_fee", det.hoa1Fee, "property.details.hoa1Fee", "medium");
      add("fireplaces", det.fireplaces, "property.details.fireplaces", "medium");
      add("exterior_wall_type", det.exteriorWallType, "property.details.exteriorWallType", "medium");
      if (det.renovationScore?.hasScore) {
        add("renovation_score", det.renovationScore.score, "property.details.renovationScore.score", "medium");
        add("renovation_confidence", det.renovationScore.confidence, "property.details.renovationScore.confidence", "medium");
      }
    }

    // ── Land / Location ───────────────────────────────────────────────
    const land = data.property.landLocation;
    if (land) {
      add("apn", land.apn, "property.landLocation.apn", "high");
      add("zoning", land.zoning, "property.landLocation.zoning", "medium");
      add("land_use", land.landUse, "property.landLocation.landUse", "medium");
      add("property_class", land.propertyClass, "property.landLocation.propertyClass", "medium");
      add("school_district", land.schoolDistrict, "property.landLocation.schoolDistrict", "medium");
      add("subdivision", land.subdivision, "property.landLocation.subdivision", "medium");
      add("county_name", land.countyName, "property.landLocation.countyName", "high");
    }

    // ── Mortgage / Debt ───────────────────────────────────────────────
    const debt = data.property.mortgageDebt;
    if (debt) {
      add("open_mortgage_balance", debt.openMortgageBalance, "property.mortgageDebt.openMortgageBalance", "medium");
      add("estimated_equity", debt.estimatedEquity, "property.mortgageDebt.estimatedEquity", "medium");
      add("ltv_ratio", debt.ltvRatio, "property.mortgageDebt.ltvRatio", "medium");
      add("purchase_method", debt.purchaseMethod, "property.mortgageDebt.purchaseMethod", "medium");
      // Full mortgage table as JSON for UI rendering
      if (debt.mortgages && debt.mortgages.length > 0) {
        add("bricked_mortgages", JSON.stringify(debt.mortgages), "property.mortgageDebt.mortgages", "medium");
      }
    }

    // ── Ownership ─────────────────────────────────────────────────────
    const own = data.property.ownership;
    if (own) {
      if (own.owners && own.owners.length > 0) {
        const ownerNames = own.owners
          .map((o) => [o.firstName, o.lastName].filter(Boolean).join(" "))
          .filter(Boolean)
          .join("; ");
        add("owner_names", ownerNames, "property.ownership.owners", "high");
      }
      add("ownership_length_years", own.ownershipLength, "property.ownership.ownershipLength", "medium");
      add("owner_type", own.ownerType, "property.ownership.ownerType", "medium");
      add("owner_occupancy", own.ownerOccupancy, "property.ownership.ownerOccupancy", "medium");
      add("tax_amount", own.taxAmount, "property.ownership.taxAmount", "medium");
      // Full transaction history as JSON
      if (own.transactions && own.transactions.length > 0) {
        add("bricked_transactions", JSON.stringify(own.transactions), "property.ownership.transactions", "medium");
      }
      // Full tax history as JSON
      if (own.taxes && own.taxes.length > 0) {
        add("bricked_taxes", JSON.stringify(own.taxes), "property.ownership.taxes", "medium");
      }
    }

    // ── MLS ───────────────────────────────────────────────────────────
    const mls = data.property.mls;
    if (mls) {
      add("mls_status", mls.status, "property.mls.status", "high");
      add("mls_list_price", mls.amount, "property.mls.amount", "high");
      add("mls_days_on_market", mls.daysOnMarket, "property.mls.daysOnMarket", "medium");
      add("mls_number", mls.mlsNumber, "property.mls.mlsNumber", "high");
      add("mls_interior_features", mls.interiorFeatures, "property.mls.interiorFeatures", "medium");
      add("mls_appliance_features", mls.applianceFeatures, "property.mls.applianceFeatures", "medium");
      if (mls.agent) {
        add("listing_agent_name", mls.agent.agentName, "property.mls.agent.agentName", "medium");
        add("listing_agent_phone", mls.agent.agentPhone, "property.mls.agent.agentPhone", "medium");
        add("listing_office_name", mls.agent.officeName, "property.mls.agent.officeName", "medium");
        add("listing_office_phone", mls.agent.officePhone, "property.mls.agent.officePhone", "medium");
      }
      // Full MLS listing history as JSON
      if (mls.historicListings && mls.historicListings.length > 0) {
        add("bricked_mls_history", JSON.stringify(mls.historicListings), "property.mls.historicListings", "medium");
      }
    }

    // ── Geo ───────────────────────────────────────────────────────────
    add("latitude", data.property.latitude, "property.latitude", "high");
    add("longitude", data.property.longitude, "property.longitude", "high");

    // ── Address ───────────────────────────────────────────────────────
    const addr = data.property.address;
    if (addr) {
      add("full_address", addr.fullAddress, "property.address.fullAddress", "high");
      add("city", addr.cityName, "property.address.cityName", "high");
      add("state_code", addr.stateCode, "property.address.stateCode", "high");
      add("zip_code", addr.zip, "property.address.zip", "high");
    }

    // ── Images ───────────────────────────────────────────────────────
    const images = data.property.images;
    if (images && images.length > 0) {
      add("bricked_images", JSON.stringify(images), "property.images", "high");
    }

    // ── Repair line items (individual + full JSON) ────────────────────
    const repairs = data.repairs ?? [];
    if (repairs.length > 0) {
      add("bricked_repairs", JSON.stringify(repairs), "repairs", "medium");
    }
    repairs.slice(0, 5).forEach((r, i) => {
      if (r.repair && r.cost) {
        add(
          `repair_item_${i + 1}`,
          `${r.repair}: $${r.cost.toLocaleString()}${r.description ? ` (${r.description})` : ""}`,
          `repairs[${i}]`,
          "medium",
        );
      }
    });

    // ── Comparable sales (structured JSON + count) ────────────────────
    const comps = data.comps ?? [];
    add("comp_count", comps.length, "comps.length", "high");

    if (comps.length > 0) {
      // Store full structured comp data for rich UI rendering
      const compData = comps.map((c) => ({
        address: c.address?.fullAddress,
        lat: c.latitude,
        lng: c.longitude,
        beds: c.details?.bedrooms,
        baths: c.details?.bathrooms,
        sqft: c.details?.squareFeet,
        yearBuilt: c.details?.yearBuilt,
        lastSaleAmount: c.details?.lastSaleAmount,
        lastSaleDate: c.details?.lastSaleDate,
        adjustedValue: c.adjusted_value,
        compType: c.compType,
        listingType: c.listingType,
        selected: c.selected,
        marketStatus: c.details?.marketStatus,
        renovationScore: c.details?.renovationScore?.hasScore ? c.details.renovationScore.score : null,
        images: c.images,
      }));
      add("bricked_comps", JSON.stringify(compData), "comps", "medium");
    }

    return {
      provider: "bricked",
      rawPayload: data as unknown as Record<string, unknown>,
      facts,
      cached,
      fetchedAt: new Date().toISOString(),
    };
  }
}

/** Singleton instance */
export const brickedAdapter = new BrickedAdapter();

/** Re-export types for consumers */
export type {
  BrickedCreateResponse,
  BrickedProperty,
  BrickedPropertyDetails,
  BrickedLandLocation,
  BrickedMortgageDebt,
  BrickedMortgage,
  BrickedOwnership,
  BrickedOwner,
  BrickedTransaction,
  BrickedTax,
  BrickedMls,
  BrickedMlsAgent,
  BrickedHistoricListing,
  BrickedAddress,
  BrickedComp,
  BrickedRepair,
  BrickedRenovationScore,
};
