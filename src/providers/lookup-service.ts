/**
 * Provider Lookup Service
 *
 * Orchestrates property lookups across configured provider adapters.
 * Each lookup result flows through the canonical write path:
 *   Provider payload → dossier_artifacts → fact_assertions → dossier
 *
 * Usage:
 *   const results = await lookupProperty({ address, zip }, ["bricked", "propertyradar"]);
 *   // Results are raw ProviderLookupResults — persist through intelligence pipeline
 */

// ATTOM cancelled — adapter file kept for reference but unregistered
// import { attomAdapter } from "./attom/adapter";
import { brickedAdapter } from "./bricked/adapter";
import { regridAdapter } from "./regrid/adapter";
import { propertyRadarAdapter } from "./propertyradar/adapter";
import { firecrawlAdapter } from "./firecrawl/adapter";
import type { BaseProviderAdapter, ProviderLookupResult, ProviderError } from "./base-adapter";

const ADAPTERS: Record<string, BaseProviderAdapter> = {
  bricked: brickedAdapter,
  regrid: regridAdapter,
  propertyradar: propertyRadarAdapter,
  firecrawl: firecrawlAdapter,
};

export interface MultiProviderResult {
  results: ProviderLookupResult[];
  errors: ProviderError[];
}

/**
 * Look up a property across one or more providers.
 * Skips providers that aren't configured (missing API key).
 * Returns all results + errors for each provider.
 */
export async function lookupProperty(
  params: {
    address?: string;
    apn?: string;
    county?: string;
    state?: string;
    zip?: string;
  },
  providers?: string[],
): Promise<MultiProviderResult> {
  const providerNames = providers ?? Object.keys(ADAPTERS);
  const results: ProviderLookupResult[] = [];
  const errors: ProviderError[] = [];

  await Promise.allSettled(
    providerNames.map(async (name) => {
      const adapter = ADAPTERS[name];
      if (!adapter) {
        errors.push({
          provider: name,
          code: "UNKNOWN_PROVIDER",
          message: `Unknown provider: ${name}`,
          retryable: false,
        });
        return;
      }

      if (!adapter.isConfigured()) {
        errors.push({
          provider: name,
          code: "NOT_CONFIGURED",
          message: `${name}: API key not configured (skipped)`,
          retryable: false,
        });
        return;
      }

      try {
        const result = await adapter.lookupProperty(params);
        results.push(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const retryable = message.includes("Rate limit") || message.includes("429") || message.includes("503");
        errors.push({ provider: name, code: "LOOKUP_FAILED", message, retryable });
      }
    }),
  );

  return { results, errors };
}

/**
 * Get configured providers (those with API keys present).
 */
export function getConfiguredProviders(): string[] {
  return Object.entries(ADAPTERS)
    .filter(([, adapter]) => adapter.isConfigured())
    .map(([name]) => name);
}
