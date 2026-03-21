/**
 * Regrid Adapter — Mapping Tests
 *
 * Validates that Regrid parcel API responses are correctly normalized
 * into canonical Sentinel facts. No real API calls — fetch is mocked.
 */

import type { ProviderLookupResult } from "../base-adapter";

// ---------------------------------------------------------------------------
// Sample Regrid payloads
// ---------------------------------------------------------------------------

const sampleRegridResponse = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        parcelnumb: "35063.0119",
        parcelnumb_no_formatting: "350630119",
        state_parcelnumb: "WA-35063.0119",
        owner: "Smith John D",
        mail_address: "1234 N Division St, Spokane, WA 99201",
        address: "1234 N Division St",
        city: "Spokane",
        state2: "WA",
        county: "Spokane",
        zip: "99201",
        saddno: "1234",
        saddpref: "N",
        saddstr: "Division",
        saddsttyp: "St",
        scity: "Spokane",
        szip: "99201-4455",
        szip5: "99201",
        zoning: "RSF",
        zoning_description: "Residential Single Family",
        usecode: "111",
        usedesc: "Single Family Residential",
        ll_gisacre: 0.165,
        ll_gissqft: 7187,
        sqft: 7200,
        ll_updated_at: "2025-12-01",
        sourceurl: "https://www.spokanecounty.org/assessor",
      },
      geometry: {
        type: "Polygon",
        coordinates: [[[-117.411, 47.658], [-117.410, 47.658], [-117.410, 47.659], [-117.411, 47.659], [-117.411, 47.658]]],
      },
    },
  ],
};

const sampleEnhancedOwnershipResponse = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        parcelnumb: "K-2030-001",
        parcelnumb_no_formatting: "K2030001",
        state_parcelnumb: "ID-K2030001",
        owner: null,
        eo_owner_name: "Doe Revocable Trust",
        mail_address: null,
        eo_mail_address: "PO Box 123, Coeur d'Alene, ID 83814",
        address: "456 Lakeshore Dr",
        city: "Coeur d'Alene",
        state2: "ID",
        county: "Kootenai",
        szip5: "83814",
        usedesc: "Lakefront Residential",
        ll_gisacre: 0.52,
        ll_gissqft: 22651,
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findFact(facts: ProviderLookupResult["facts"], fieldName: string) {
  return facts.find((f) => f.fieldName === fieldName);
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function testStandardMapping(): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify(sampleRegridResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  const origKey = process.env.REGRID_API_KEY;
  process.env.REGRID_API_KEY = "test-key";

  try {
    const { regridAdapter } = await import("./adapter");
    const result = await regridAdapter.lookupProperty({
      address: "1234 N Division St",
      state: "WA",
    });

    assert(result.provider === "regrid", "provider should be 'regrid'");
    assert(result.facts.length > 0, "should produce facts");

    // Parcel identification
    assert(findFact(result.facts, "apn")?.value === "35063.0119", "apn mapping");
    assert(findFact(result.facts, "apn_normalized")?.value === "350630119", "apn_normalized mapping");
    assert(findFact(result.facts, "state_parcel_id")?.value === "WA-35063.0119", "state_parcel_id mapping");

    // Address — scity preferred over city
    assert(findFact(result.facts, "address")?.value === "1234 N Division St", "address mapping");
    assert(findFact(result.facts, "city")?.value === "Spokane", "city mapping (scity preferred)");
    assert(findFact(result.facts, "state")?.value === "WA", "state mapping");
    assert(findFact(result.facts, "zip")?.value === "99201", "zip mapping (szip5 preferred)");
    assert(findFact(result.facts, "county")?.value === "Spokane", "county mapping");

    // Owner
    assert(findFact(result.facts, "owner_name")?.value === "Smith John D", "owner_name mapping");
    assert(findFact(result.facts, "mailing_address")?.value === "1234 N Division St, Spokane, WA 99201", "mailing_address mapping");

    // Lot data
    assert(findFact(result.facts, "lot_acres")?.value === 0.165, "lot_acres mapping");
    assert(findFact(result.facts, "lot_sqft")?.value === 7187, "lot_sqft mapping (ll_gissqft preferred)");

    // Zoning — medium confidence
    const zoningFact = findFact(result.facts, "zoning");
    assert(zoningFact?.value === "RSF", "zoning mapping");
    assert(zoningFact?.confidence === "medium", "zoning should be medium confidence");
    assert(findFact(result.facts, "zoning_description")?.value === "Residential Single Family", "zoning_description mapping");

    // Use code
    assert(findFact(result.facts, "use_code")?.value === "111", "use_code mapping");
    assert(findFact(result.facts, "use_description")?.value === "Single Family Residential", "use_description mapping");

    // Metadata
    assert(findFact(result.facts, "regrid_updated_at")?.value === "2025-12-01", "regrid_updated_at mapping");
    assert(findFact(result.facts, "source_url")?.value === "https://www.spokanecounty.org/assessor", "source_url mapping");

    // Cost
    assert(result.cost === 0.10, "cost should be $0.10 per record");

    console.log("  PASS: testStandardMapping");
  } finally {
    globalThis.fetch = originalFetch;
    if (origKey !== undefined) process.env.REGRID_API_KEY = origKey;
    else delete process.env.REGRID_API_KEY;
  }
}

async function testEnhancedOwnershipFallback(): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify(sampleEnhancedOwnershipResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  const origKey = process.env.REGRID_API_KEY;
  process.env.REGRID_API_KEY = "test-key";

  try {
    const { regridAdapter } = await import("./adapter");
    const result = await regridAdapter.lookupProperty({
      address: "456 Lakeshore Dr",
      state: "ID",
    });

    // When owner is null, should fall back to eo_owner_name
    assert(findFact(result.facts, "owner_name")?.value === "Doe Revocable Trust", "owner_name fallback to eo_owner_name");
    // When mail_address is null, should fall back to eo_mail_address
    assert(findFact(result.facts, "mailing_address")?.value === "PO Box 123, Coeur d'Alene, ID 83814", "mailing_address fallback to eo_mail_address");

    // Kootenai County (secondary market)
    assert(findFact(result.facts, "county")?.value === "Kootenai", "Kootenai county mapping");
    assert(findFact(result.facts, "state")?.value === "ID", "Idaho state mapping");

    console.log("  PASS: testEnhancedOwnershipFallback");
  } finally {
    globalThis.fetch = originalFetch;
    if (origKey !== undefined) process.env.REGRID_API_KEY = origKey;
    else delete process.env.REGRID_API_KEY;
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export async function validate(): Promise<{ pass: boolean; errors: string[] }> {
  const errors: string[] = [];
  const tests = [
    { name: "testStandardMapping", fn: testStandardMapping },
    { name: "testEnhancedOwnershipFallback", fn: testEnhancedOwnershipFallback },
  ];

  for (const t of tests) {
    try {
      await t.fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${t.name}: ${msg}`);
      console.error(`  FAIL: ${t.name} — ${msg}`);
    }
  }

  return { pass: errors.length === 0, errors };
}
