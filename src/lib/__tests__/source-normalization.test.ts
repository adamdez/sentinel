/**
 * Source Normalization Tests
 *
 * Tests the canonical source normalization logic used across:
 * - /api/analytics/source-performance
 * - /api/analytics/kpi-summary
 * - analytics.ts (client-side analytics)
 * - UI components
 *
 * If these tests fail after a code change, the question is:
 * "Did the business requirements for source tracking change?"
 * If not, the code change is wrong.
 */

import { describe, it, expect } from "vitest";
import { normalizeSource, sourceLabel, SOURCE_MAP, SOURCE_LABELS } from "../source-normalization";

describe("normalizeSource", () => {
  it("returns 'unknown' for null/undefined/empty", () => {
    expect(normalizeSource(null)).toBe("unknown");
    expect(normalizeSource(undefined)).toBe("unknown");
    expect(normalizeSource("")).toBe("unknown");
    expect(normalizeSource("   ")).toBe("unknown");
  });

  it("normalizes PropertyRadar variants", () => {
    expect(normalizeSource("propertyradar")).toBe("propertyradar");
    expect(normalizeSource("PropertyRadar")).toBe("propertyradar");
    expect(normalizeSource("property_radar")).toBe("propertyradar");
    expect(normalizeSource("property_lookup")).toBe("propertyradar");
    expect(normalizeSource("PROPERTYRADAR")).toBe("propertyradar");
  });

  it("normalizes Google Ads variants", () => {
    expect(normalizeSource("google_ads")).toBe("google_ads");
    expect(normalizeSource("google")).toBe("google_ads");
    expect(normalizeSource("adwords")).toBe("google_ads");
    expect(normalizeSource("Google_Ads")).toBe("google_ads");
  });

  it("normalizes Facebook Ads variants", () => {
    expect(normalizeSource("facebook_ads")).toBe("facebook_ads");
    expect(normalizeSource("facebook")).toBe("facebook_ads");
    expect(normalizeSource("fb")).toBe("facebook_ads");
    expect(normalizeSource("fb_ads")).toBe("facebook_ads");
  });

  it("normalizes csv:* prefix pattern", () => {
    expect(normalizeSource("csv:PropertyRadar Export")).toBe("csv_import");
    expect(normalizeSource("csv:manual_upload")).toBe("csv_import");
    expect(normalizeSource("CSV:anything")).toBe("csv_import");
    expect(normalizeSource("csv_import")).toBe("csv_import");
  });

  it("normalizes BulkSeed_* prefix pattern", () => {
    expect(normalizeSource("BulkSeed_1000_20260301")).toBe("csv_import");
    expect(normalizeSource("bulkseed_500")).toBe("csv_import");
    expect(normalizeSource("BULKSEED")).toBe("csv_import");
  });

  it("normalizes ranger variants", () => {
    expect(normalizeSource("ranger_push")).toBe("ranger");
    expect(normalizeSource("ranger")).toBe("ranger");
  });

  it("normalizes webform variants", () => {
    expect(normalizeSource("webform")).toBe("webform");
    expect(normalizeSource("web_form")).toBe("webform");
    expect(normalizeSource("website")).toBe("webform");
  });

  it("normalizes referral variants", () => {
    expect(normalizeSource("referral")).toBe("referral");
    expect(normalizeSource("ref")).toBe("referral");
  });

  it("normalizes manual variants", () => {
    expect(normalizeSource("manual")).toBe("manual");
    expect(normalizeSource("manual-new-prospect")).toBe("manual");
  });

  it("normalizes craigslist/fsbo/zillow", () => {
    expect(normalizeSource("craigslist")).toBe("craigslist");
    expect(normalizeSource("cl")).toBe("craigslist");
    expect(normalizeSource("fsbo")).toBe("fsbo");
    expect(normalizeSource("fsbo_com")).toBe("fsbo");
    expect(normalizeSource("zillow")).toBe("zillow");
    expect(normalizeSource("zillow_fsbo")).toBe("zillow");
  });

  it("passes through unknown sources as lowercase", () => {
    expect(normalizeSource("some_new_source")).toBe("some_new_source");
    expect(normalizeSource("SomeNewSource")).toBe("somenewsource");
  });

  it("trims whitespace", () => {
    expect(normalizeSource("  google_ads  ")).toBe("google_ads");
    expect(normalizeSource(" propertyradar ")).toBe("propertyradar");
  });
});

describe("sourceLabel", () => {
  it("returns correct labels for known sources", () => {
    expect(sourceLabel("propertyradar")).toBe("PropertyRadar");
    expect(sourceLabel("google_ads")).toBe("Google Ads");
    expect(sourceLabel("facebook_ads")).toBe("Facebook Ads");
    expect(sourceLabel("csv_import")).toBe("CSV Import");
    expect(sourceLabel("craigslist")).toBe("Craigslist");
    expect(sourceLabel("zillow")).toBe("Zillow");
    expect(sourceLabel("fsbo")).toBe("FSBO");
    expect(sourceLabel("ranger")).toBe("Ranger");
    expect(sourceLabel("webform")).toBe("Web Form");
    expect(sourceLabel("referral")).toBe("Referral");
    expect(sourceLabel("manual")).toBe("Manual");
    expect(sourceLabel("unknown")).toBe("Unknown");
  });

  it("title-cases unknown source keys", () => {
    expect(sourceLabel("some_new_source")).toBe("Some New Source");
    expect(sourceLabel("my-custom-source")).toBe("My Custom Source");
  });
});

describe("SOURCE_MAP coverage", () => {
  it("has at least 25 raw value mappings", () => {
    expect(Object.keys(SOURCE_MAP).length).toBeGreaterThanOrEqual(25);
  });

  it("every SOURCE_MAP value has a SOURCE_LABELS entry", () => {
    const canonicalKeys = new Set(Object.values(SOURCE_MAP));
    for (const key of canonicalKeys) {
      expect(SOURCE_LABELS[key]).toBeDefined();
    }
  });
});
