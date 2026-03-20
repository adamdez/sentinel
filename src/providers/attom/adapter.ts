/**
 * ATTOM Provider Adapter
 *
 * Blueprint Section 5.2: "Canonical property facts — ATTOM.
 * Property card truth, owner/mortgage detail, valuation backstop.
 * Do not use as a full wholesaler workflow app."
 *
 * ATTOM Property API provides:
 * - Property details (beds, baths, sqft, year built, lot size)
 * - Owner information (name, mailing address, ownership type)
 * - Assessment/tax data (assessed value, tax amount)
 * - AVM (automated valuation model)
 * - Mortgage/lien data
 * - Sale history
 *
 * Cache policy (Blueprint 5.5):
 * - Static characteristics: 30 days
 * - Ownership/mortgage on active leads: 7 days refresh
 * - Refresh immediately on promotion/offer/contract stage change
 *
 * Rate limit: ATTOM standard is ~10 req/min on basic plans.
 */

import {
  BaseProviderAdapter,
  type CanonicalPropertyFact,
  type ProviderLookupResult,
} from "../base-adapter";

// ── ATTOM Response Types (provider-specific, never leaked to CRM) ────

interface AttomPropertyResponse {
  status?: { code: number; msg: string };
  property?: Array<{
    identifier?: {
      Id?: number;
      fips?: string;
      apn?: string;
      attomId?: number;
    };
    lot?: {
      lotSize1?: number;
      lotSize2?: number;
    };
    area?: {
      blockNbr?: string;
      countrySecSubd?: string;
      countyUse1?: string;
      munCode?: string;
      munName?: string;
      srvyRange?: string;
      srvySection?: string;
      srvyTownship?: string;
      subdName?: string;
    };
    address?: {
      country?: string;
      countrySubd?: string;
      line1?: string;
      line2?: string;
      locality?: string;
      matchCode?: string;
      oneLine?: string;
      postal1?: string;
      postal2?: string;
      postal3?: string;
    };
    location?: {
      accuracy?: string;
      latitude?: string;
      longitude?: string;
      distance?: number;
      geoid?: string;
    };
    summary?: {
      absenteeInd?: string;
      propclass?: string;
      propsubtype?: string;
      proptype?: string;
      yearbuilt?: number;
      propLandUse?: string;
      propIndicator?: string;
    };
    utilities?: Record<string, unknown>;
    building?: {
      size?: {
        bldgSize?: number;
        grossSize?: number;
        grossSizeAdjusted?: number;
        groundFloorSize?: number;
        livingSize?: number;
        universalSize?: number;
      };
      rooms?: {
        bathsFull?: number;
        bathsHalf?: number;
        bathsTotal?: number;
        beds?: number;
        roomsTotal?: number;
      };
      interior?: {
        bsmtSize?: number;
        bsmtType?: string;
        fplcCount?: number;
        fplcInd?: string;
        fplcType?: string;
      };
      construction?: {
        condition?: string;
        constructionType?: string;
        foundationType?: string;
        frameType?: string;
        roofCover?: string;
        roofShape?: string;
        wallType?: string;
      };
      parking?: {
        garageType?: string;
        prkgSize?: number;
        prkgSpaces?: string;
        prkgType?: string;
      };
      summary?: {
        levels?: number;
        storyDesc?: string;
        unitsCount?: string;
        view?: string;
        viewCode?: string;
      };
    };
    assessment?: {
      appraised?: { apprImprValue?: number; apprLandValue?: number; apprTtlValue?: number };
      assessed?: {
        assdImprValue?: number;
        assdLandValue?: number;
        assdTtlValue?: number;
      };
      market?: {
        mktImprValue?: number;
        mktLandValue?: number;
        mktTtlValue?: number;
      };
      tax?: {
        taxAmt?: number;
        taxYear?: number;
      };
    };
    sale?: {
      salesHistory?: Array<{
        amount?: { saleAmt?: number; saleCode?: string; saleRecDate?: string; saleTransDate?: string };
        calculation?: { pricePerBed?: number; pricePerSizeUnit?: number };
        sequenceSaleHistory?: number;
      }>;
    };
    owner?: {
      owner1?: { fullName?: string; lastName?: string; firstNameAndMi?: string };
      owner2?: { fullName?: string; lastName?: string; firstNameAndMi?: string };
      owner3?: { fullName?: string; lastName?: string; firstNameAndMi?: string };
      owner4?: { fullName?: string; lastName?: string; firstNameAndMi?: string };
      absenteeOwnerStatus?: string;
      corporateIndicator?: string;
      mailingAddressOneLine?: string;
      ownershipStatusCode?: string;
    };
    vintage?: { lastModified?: string; pubDate?: string };
  }>;
}

// ── Adapter Implementation ───────────────────────────────────────────

export class AttomAdapter extends BaseProviderAdapter {
  constructor() {
    super({
      name: "attom",
      baseUrl: "https://api.gateway.attomdata.com/propertyapi/v1.0.0",
      apiKeyEnvVar: "ATTOM_API_KEY",
      cacheTtlSeconds: 30 * 86400, // 30 days for static characteristics
      rateLimitPerMinute: 10,
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

    // Build query — prefer address lookup
    let url: string;
    if (params.address && (params.zip || (params.county && params.state))) {
      const address1 = encodeURIComponent(params.address);
      const address2 = params.zip
        ? encodeURIComponent(params.zip)
        : encodeURIComponent(`${params.county}, ${params.state}`);
      url = `${this.config.baseUrl}/property/expandedprofile?address1=${address1}&address2=${address2}`;
    } else if (params.apn && params.county) {
      url = `${this.config.baseUrl}/property/expandedprofile?apn=${encodeURIComponent(params.apn)}&fips=${encodeURIComponent(params.county)}`;
    } else {
      throw new Error("ATTOM: Need either (address + zip/county) or (apn + fips)");
    }

    const data = await this.fetchJson<AttomPropertyResponse>(url, {
      headers: { apikey: apiKey, Accept: "application/json" },
    });

    const prop = data.property?.[0];
    if (!prop) {
      return {
        provider: "attom",
        rawPayload: data as Record<string, unknown>,
        facts: [],
        cached: false,
        fetchedAt: new Date().toISOString(),
      };
    }

    // ── Normalize to canonical facts ──────────────────────────────────
    const facts: CanonicalPropertyFact[] = [];

    const add = (fieldName: string, value: string | number | boolean | null, providerPath: string, conf: CanonicalPropertyFact["confidence"] = "high") => {
      if (value !== null && value !== undefined && value !== "") {
        facts.push({ fieldName, value, confidence: conf, providerFieldPath: providerPath });
      }
    };

    // Property details
    add("address", prop.address?.oneLine ?? null, "address.oneLine");
    add("city", prop.address?.locality ?? null, "address.locality");
    add("state", prop.address?.countrySubd ?? null, "address.countrySubd");
    add("zip", prop.address?.postal1 ?? null, "address.postal1");
    add("bedrooms", prop.building?.rooms?.beds ?? null, "building.rooms.beds");
    add("bathrooms", prop.building?.rooms?.bathsTotal ?? null, "building.rooms.bathsTotal");
    add("sqft", prop.building?.size?.livingSize ?? prop.building?.size?.universalSize ?? null, "building.size.livingSize");
    add("year_built", prop.summary?.yearbuilt ?? null, "summary.yearbuilt");
    add("lot_size", prop.lot?.lotSize1 ?? null, "lot.lotSize1");
    add("property_type", prop.summary?.proptype ?? null, "summary.proptype");

    // Owner info
    add("owner_name", prop.owner?.owner1?.fullName ?? null, "owner.owner1.fullName");
    add("owner_name_2", prop.owner?.owner2?.fullName ?? null, "owner.owner2.fullName");
    add("absentee_owner", prop.owner?.absenteeOwnerStatus ?? null, "owner.absenteeOwnerStatus");
    add("corporate_owner", prop.owner?.corporateIndicator === "Y", "owner.corporateIndicator");
    add("mailing_address", prop.owner?.mailingAddressOneLine ?? null, "owner.mailingAddressOneLine");

    // Valuation
    add("assessed_value", prop.assessment?.assessed?.assdTtlValue ?? null, "assessment.assessed.assdTtlValue");
    add("market_value", prop.assessment?.market?.mktTtlValue ?? null, "assessment.market.mktTtlValue", "medium");
    add("tax_amount", prop.assessment?.tax?.taxAmt ?? null, "assessment.tax.taxAmt");
    add("tax_year", prop.assessment?.tax?.taxYear ?? null, "assessment.tax.taxYear");

    // Sale history (most recent)
    const lastSale = prop.sale?.salesHistory?.[0];
    if (lastSale) {
      add("last_sale_amount", lastSale.amount?.saleAmt ?? null, "sale.salesHistory[0].amount.saleAmt");
      add("last_sale_date", lastSale.amount?.saleRecDate ?? lastSale.amount?.saleTransDate ?? null, "sale.salesHistory[0].amount.saleRecDate");
    }

    // Building details
    add("condition", prop.building?.construction?.condition ?? null, "building.construction.condition", "medium");
    add("stories", prop.building?.summary?.levels ?? null, "building.summary.levels");
    add("garage_type", prop.building?.parking?.garageType ?? null, "building.parking.garageType");
    add("basement_sqft", prop.building?.interior?.bsmtSize ?? null, "building.interior.bsmtSize");

    // Location
    add("latitude", prop.location?.latitude ? parseFloat(prop.location.latitude) : null, "location.latitude");
    add("longitude", prop.location?.longitude ? parseFloat(prop.location.longitude) : null, "location.longitude");

    return {
      provider: "attom",
      rawPayload: data as Record<string, unknown>,
      facts,
      cached: false,
      fetchedAt: new Date().toISOString(),
    };
  }
}

/** Singleton instance */
export const attomAdapter = new AttomAdapter();
