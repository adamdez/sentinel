/**
 * Bricked AI Provider Adapter
 *
 * Blueprint Section 5.1: "Comping/underwriting — INTEGRATE.
 * Bricked AI, $49/mo. 15-second underwriting. Don't build custom until you outgrow it."
 *
 * Bricked AI provides:
 * - Automated property comps (ARV estimation)
 * - Repair cost estimates
 * - Quick underwriting analysis
 *
 * Cache policy (Blueprint 5.5):
 * - Cache 7 days for active leads
 * - Refresh on offer preparation
 * - Do not re-run on every page load
 *
 * The adapter normalizes Bricked AI's response into canonical facts
 * that feed the intelligence pipeline. Provider field names never leak.
 */

import {
  BaseProviderAdapter,
  type CanonicalPropertyFact,
  type ProviderLookupResult,
} from "../base-adapter";

// ── Bricked AI Response Types ────────────────────────────────────────

interface BrickedCompResponse {
  success?: boolean;
  data?: {
    address?: string;
    arv?: number;
    arvLow?: number;
    arvHigh?: number;
    estimatedRepairCost?: number;
    repairCostLow?: number;
    repairCostHigh?: number;
    maxAllowableOffer?: number;
    comps?: Array<{
      address?: string;
      salePrice?: number;
      saleDate?: string;
      distance?: number;
      beds?: number;
      baths?: number;
      sqft?: number;
      yearBuilt?: number;
      similarity?: number;
    }>;
    propertyDetails?: {
      beds?: number;
      baths?: number;
      sqft?: number;
      yearBuilt?: number;
      lotSize?: number;
      propertyType?: string;
    };
    confidence?: number;
    compCount?: number;
    analysisDate?: string;
  };
  error?: string;
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

    const fullAddress = [params.address, params.county, params.state, params.zip]
      .filter(Boolean)
      .join(", ");

    const data = await this.fetchJson<BrickedCompResponse>(
      `${this.config.baseUrl}/analyze`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ address: fullAddress }),
      },
    );

    if (!data.success || !data.data) {
      return {
        provider: "bricked",
        rawPayload: data as Record<string, unknown>,
        facts: [],
        cached: false,
        fetchedAt: new Date().toISOString(),
      };
    }

    const d = data.data;
    const facts: CanonicalPropertyFact[] = [];

    const add = (fieldName: string, value: string | number | boolean | null, providerPath: string, conf: CanonicalPropertyFact["confidence"] = "medium") => {
      if (value !== null && value !== undefined && value !== "") {
        facts.push({ fieldName, value, confidence: conf, providerFieldPath: providerPath });
      }
    };

    // Valuation
    add("arv_estimate", d.arv ?? null, "data.arv");
    add("arv_low", d.arvLow ?? null, "data.arvLow");
    add("arv_high", d.arvHigh ?? null, "data.arvHigh");

    // Repair estimates
    add("repair_cost_estimate", d.estimatedRepairCost ?? null, "data.estimatedRepairCost");
    add("repair_cost_low", d.repairCostLow ?? null, "data.repairCostLow");
    add("repair_cost_high", d.repairCostHigh ?? null, "data.repairCostHigh");

    // Offer guidance
    add("max_allowable_offer", d.maxAllowableOffer ?? null, "data.maxAllowableOffer");

    // Analysis metadata
    add("comp_count", d.compCount ?? null, "data.compCount", "high");
    add("analysis_confidence", d.confidence ?? null, "data.confidence", "medium");
    add("analysis_date", d.analysisDate ?? null, "data.analysisDate", "high");

    // Comp details (top 3 for facts, full set in raw payload)
    const topComps = (d.comps ?? []).slice(0, 3);
    topComps.forEach((comp, i) => {
      if (comp.salePrice) {
        add(
          `comp_${i + 1}`,
          `${comp.address} — $${comp.salePrice.toLocaleString()} (${comp.saleDate ?? "unknown date"}, ${comp.distance?.toFixed(1) ?? "?"}mi, ${comp.similarity ? Math.round(comp.similarity * 100) + "% match" : ""})`,
          `data.comps[${i}]`,
          "medium",
        );
      }
    });

    return {
      provider: "bricked",
      rawPayload: data as Record<string, unknown>,
      facts,
      cached: false,
      fetchedAt: new Date().toISOString(),
    };
  }
}

/** Singleton instance */
export const brickedAdapter = new BrickedAdapter();
