/**
 * Regrid Provider Adapter (Evaluation Scaffold)
 *
 * Blueprint Section 5.2: "Parcel master / APN fabric — Regrid.
 * Parcel/address/owner/APN search, tiles, daily ownership updates via
 * Enhanced Ownership add-on. Underneath ATTOM and PropertyRadar.
 * Reduces normalization pain for probate/inherited and absentee intelligence slices."
 *
 * Regrid provides:
 * - Parcel geometry and boundaries
 * - APN normalization across counties
 * - Owner name/address lookup by parcel
 * - Enhanced ownership data (add-on)
 *
 * Pricing: ~$375/mo + $0.10/record (evaluate Phase 4-5)
 * Cache: Quarterly refresh (ownership data changes slowly at parcel level)
 *
 * This is an evaluation scaffold — the API shape is based on Regrid's
 * documented REST API. Wire to production after eval confirms value.
 */

import {
  BaseProviderAdapter,
  type CanonicalPropertyFact,
  type ProviderLookupResult,
} from "../base-adapter";

// ── Regrid Response Types (based on documented API) ──────────────────

interface RegridParcelResponse {
  type?: string;
  features?: Array<{
    type?: string;
    properties?: {
      parcelnumb?: string;
      parcelnumb_no_formatting?: string;
      state_parcelnumb?: string;
      owner?: string;
      mail_address?: string;
      address?: string;
      city?: string;
      state2?: string;
      county?: string;
      zip?: string;
      saddno?: string;
      saddpref?: string;
      saddstr?: string;
      saddsttyp?: string;
      scity?: string;
      szip?: string;
      szip5?: string;
      zoning?: string;
      zoning_description?: string;
      usecode?: string;
      usedesc?: string;
      ll_gisacre?: number;
      ll_gissqft?: number;
      sqft?: number;
      ll_updated_at?: string;
      sourceagent?: string;
      sourceurl?: string;
      // Enhanced ownership fields (add-on)
      eo_owner_name?: string;
      eo_mail_address?: string;
      eo_owner_status?: string;
      eo_updated_at?: string;
    };
    geometry?: {
      type?: string;
      coordinates?: unknown;
    };
  }>;
}

// ── Adapter Implementation ───────────────────────────────────────────

export class RegridAdapter extends BaseProviderAdapter {
  constructor() {
    super({
      name: "regrid",
      baseUrl: "https://app.regrid.com/api/v2",
      apiKeyEnvVar: "REGRID_API_KEY",
      cacheTtlSeconds: 90 * 86400, // 90 days (quarterly refresh)
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

    // Build query string
    const query = new URLSearchParams();
    query.set("token", apiKey);

    if (params.apn) {
      query.set("parcelnumb", params.apn);
      if (params.state) query.set("state2", params.state);
    } else if (params.address) {
      query.set("query", params.address);
      if (params.state) query.set("state2", params.state);
    } else {
      throw new Error("Regrid: Need either address or APN for parcel lookup");
    }

    const url = `${this.config.baseUrl}/parcels/query?${query.toString()}`;
    const data = await this.fetchJson<RegridParcelResponse>(url);

    const parcel = data.features?.[0];
    if (!parcel?.properties) {
      return {
        provider: "regrid",
        rawPayload: data as Record<string, unknown>,
        facts: [],
        cached: false,
        fetchedAt: new Date().toISOString(),
      };
    }

    const p = parcel.properties;
    const facts: CanonicalPropertyFact[] = [];

    const add = (fieldName: string, value: string | number | boolean | null, providerPath: string, conf: CanonicalPropertyFact["confidence"] = "high") => {
      if (value !== null && value !== undefined && value !== "") {
        facts.push({ fieldName, value, confidence: conf, providerFieldPath: providerPath });
      }
    };

    // Parcel identification
    add("apn", p.parcelnumb ?? null, "properties.parcelnumb");
    add("apn_normalized", p.parcelnumb_no_formatting ?? null, "properties.parcelnumb_no_formatting");
    add("state_parcel_id", p.state_parcelnumb ?? null, "properties.state_parcelnumb");

    // Address
    add("address", p.address ?? null, "properties.address");
    add("city", p.scity ?? p.city ?? null, "properties.scity");
    add("state", p.state2 ?? null, "properties.state2");
    add("zip", p.szip5 ?? p.zip ?? null, "properties.szip5");
    add("county", p.county ?? null, "properties.county");

    // Owner
    add("owner_name", p.owner ?? p.eo_owner_name ?? null, "properties.owner");
    add("mailing_address", p.mail_address ?? p.eo_mail_address ?? null, "properties.mail_address");

    // Parcel details
    add("lot_acres", p.ll_gisacre ?? null, "properties.ll_gisacre");
    add("lot_sqft", p.ll_gissqft ?? p.sqft ?? null, "properties.ll_gissqft");
    add("zoning", p.zoning ?? null, "properties.zoning", "medium");
    add("zoning_description", p.zoning_description ?? null, "properties.zoning_description", "medium");
    add("use_code", p.usecode ?? null, "properties.usecode");
    add("use_description", p.usedesc ?? null, "properties.usedesc");

    // Metadata
    add("regrid_updated_at", p.ll_updated_at ?? null, "properties.ll_updated_at");
    add("source_url", p.sourceurl ?? null, "properties.sourceurl");

    return {
      provider: "regrid",
      rawPayload: data as Record<string, unknown>,
      facts,
      cached: false,
      fetchedAt: new Date().toISOString(),
      cost: 0.10, // $0.10 per record
    };
  }
}

/** Singleton instance */
export const regridAdapter = new RegridAdapter();
