/**
 * Base Provider Adapter
 *
 * All provider adapters extend this base class. It enforces:
 * 1. No provider field names leak into Sentinel tables
 * 2. Raw payloads are stored as artifacts (not written to CRM)
 * 3. Extracted facts use canonical field names with confidence
 * 4. Rate limiting and caching are handled uniformly
 * 5. Each adapter is testable without the full app running
 *
 * Blueprint Section 4.2: "Provider payload → raw artifacts → normalized fact assertions
 * → dossier → review gate → CRM sync → Sentinel projection."
 */

export interface ProviderConfig {
  /** Provider name (e.g., "attom", "bricked", "regrid") */
  name: string;
  /** Base URL for the provider API */
  baseUrl: string;
  /** API key environment variable name */
  apiKeyEnvVar: string;
  /** Default cache TTL in seconds */
  cacheTtlSeconds: number;
  /** Rate limit: max requests per minute */
  rateLimitPerMinute: number;
}

export interface CanonicalPropertyFact {
  /** Canonical field name (never provider-specific) */
  fieldName: string;
  /** The value */
  value: string | number | boolean | null;
  /** Confidence in this fact */
  confidence: "unverified" | "low" | "medium" | "high";
  /** Which provider field this was extracted from (for debugging, not for CRM) */
  providerFieldPath: string;
}

export interface ProviderLookupResult {
  /** Provider name */
  provider: string;
  /** Raw response (stored in dossier_artifacts.raw_excerpt) */
  rawPayload: Record<string, unknown>;
  /** Normalized canonical facts */
  facts: CanonicalPropertyFact[];
  /** Whether this came from cache */
  cached: boolean;
  /** When the data was fetched */
  fetchedAt: string;
  /** Cost in credits/cents if applicable */
  cost?: number;
}

export interface ProviderError {
  provider: string;
  code: string;
  message: string;
  retryable: boolean;
}

/**
 * Base class for all provider adapters.
 * Subclasses implement the provider-specific API call and normalization.
 */
export abstract class BaseProviderAdapter {
  protected config: ProviderConfig;
  private requestTimestamps: number[] = [];

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  /** Get the API key from environment */
  protected getApiKey(): string {
    const key = process.env[this.config.apiKeyEnvVar];
    if (!key) {
      throw new Error(`${this.config.name}: Missing API key (env: ${this.config.apiKeyEnvVar})`);
    }
    return key;
  }

  /** Enforce rate limit (simple sliding window) */
  protected async checkRateLimit(): Promise<void> {
    const now = Date.now();
    const windowStart = now - 60_000;

    // Remove timestamps outside the window
    this.requestTimestamps = this.requestTimestamps.filter((t) => t > windowStart);

    if (this.requestTimestamps.length >= this.config.rateLimitPerMinute) {
      const oldestInWindow = this.requestTimestamps[0];
      const waitMs = oldestInWindow + 60_000 - now;
      throw new Error(
        `${this.config.name}: Rate limit reached (${this.config.rateLimitPerMinute}/min). ` +
        `Retry in ${Math.ceil(waitMs / 1000)}s.`
      );
    }

    this.requestTimestamps.push(now);
  }

  /** Make an authenticated GET request */
  protected async fetchJson<T>(
    url: string,
    options?: { headers?: Record<string, string>; method?: string; body?: string },
  ): Promise<T> {
    await this.checkRateLimit();

    const response = await fetch(url, {
      method: options?.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      body: options?.body,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `${this.config.name}: API error ${response.status} — ${text.slice(0, 200)}`
      );
    }

    return response.json() as Promise<T>;
  }

  /**
   * Look up property data. Subclasses implement the actual API call.
   * Returns raw payload + normalized canonical facts.
   */
  abstract lookupProperty(params: {
    address?: string;
    apn?: string;
    county?: string;
    state?: string;
    zip?: string;
  }): Promise<ProviderLookupResult>;

  /**
   * Check if the adapter is configured (API key present).
   * Used to skip providers that aren't set up yet.
   */
  isConfigured(): boolean {
    return !!process.env[this.config.apiKeyEnvVar];
  }
}
