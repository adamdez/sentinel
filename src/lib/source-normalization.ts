/**
 * Canonical source normalization for Sentinel.
 *
 * SINGLE SOURCE OF TRUTH for mapping raw leads.source values to normalized keys.
 * Used by: source-performance API, kpi-summary API, analytics lib, UI components.
 *
 * When a new lead source appears in the database, add its raw value here.
 * Do not create separate normalization logic elsewhere.
 */

// ── Raw value → canonical key mapping ─────────────────────────────────

export const SOURCE_MAP: Record<string, string> = {
  // PropertyRadar variants
  propertyradar: "propertyradar",
  property_radar: "propertyradar",
  property_lookup: "propertyradar",

  // Google Ads variants
  google_ads: "google_ads",
  google: "google_ads",
  adwords: "google_ads",

  // Facebook Ads variants
  facebook_ads: "facebook_ads",
  facebook: "facebook_ads",
  fb: "facebook_ads",
  fb_ads: "facebook_ads",

  // CSV / bulk import
  csv_import: "csv_import",

  // Craigslist
  craigslist: "craigslist",
  cl: "craigslist",

  // Zillow
  zillow_fsbo: "zillow",
  zillow: "zillow",

  // FSBO
  fsbo: "fsbo",
  fsbo_com: "fsbo",

  // Ranger push
  ranger_push: "ranger",
  ranger: "ranger",

  // Webform / website
  webform: "webform",
  web_form: "webform",
  website: "webform",

  // Referral
  referral: "referral",
  ref: "referral",

  // Manual
  manual: "manual",
  "manual-new-prospect": "manual",
};

/**
 * Normalize a raw source string to a canonical key.
 * Handles null, empty, csv:* prefix, BulkSeed_* prefix, and all SOURCE_MAP entries.
 */
export function normalizeSource(raw: string | null | undefined): string {
  if (!raw || raw.trim() === "") return "unknown";
  const lower = raw.trim().toLowerCase();
  // csv:* pattern (e.g. "csv:PropertyRadar Export")
  if (lower.startsWith("csv:")) return "csv_import";
  // BulkSeed_* pattern (seeded data imports)
  if (lower.startsWith("bulkseed")) return "csv_import";
  return SOURCE_MAP[lower] ?? lower;
}

// ── Canonical key → display label ─────────────────────────────────────

export const SOURCE_LABELS: Record<string, string> = {
  propertyradar: "PropertyRadar",
  google_ads: "Google Ads",
  facebook_ads: "Facebook Ads",
  csv_import: "CSV Import",
  craigslist: "Craigslist",
  zillow: "Zillow",
  fsbo: "FSBO",
  ranger: "Ranger",
  webform: "Web Form",
  referral: "Referral",
  manual: "Manual",
  unknown: "Unknown",
};

/**
 * Get a human-readable label for a canonical source key.
 * Falls back to title-casing the key if not in SOURCE_LABELS.
 */
export function sourceLabel(key: string): string {
  if (SOURCE_LABELS[key]) return SOURCE_LABELS[key];
  return key
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}
