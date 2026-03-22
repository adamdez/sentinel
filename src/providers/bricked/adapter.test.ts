/**
 * Bricked AI Adapter — Mapping Tests
 *
 * Validates that Bricked AI property/comp/repair responses are correctly
 * normalized into canonical Sentinel facts. No real API calls — fetch is mocked.
 *
 * Response shape matches https://docs.bricked.ai/api-reference/property/create
 */

import type { ProviderLookupResult } from "../base-adapter";

// ---------------------------------------------------------------------------
// Sample Bricked payloads (matching real API response shape)
// ---------------------------------------------------------------------------

const sampleBrickedResponse = {
  id: "abc-123-def",
  property: {
    details: {
      bedrooms: 3,
      bathrooms: 2,
      squareFeet: 1450,
      yearBuilt: 1952,
      lotSquareFeet: 7200,
      occupancy: "Vacant",
      stories: 1,
      lastSaleDate: 1609459200,
      lastSaleAmount: 185000,
      marketStatus: "Off Market",
      daysOnMarket: 0,
      renovationScore: { hasScore: true, confidence: 82, score: 65 },
    },
    landLocation: {
      apn: "35051.2714",
      zoning: "R1",
      landUse: "singleFamily",
      countyName: "Spokane",
      subdivision: "North Hill",
    },
    mortgageDebt: {
      openMortgageBalance: 95000,
      estimatedEquity: 215000,
      purchaseMethod: "Conventional",
      ltvRatio: 30.6,
      mortgages: [
        {
          seq: 1,
          amount: 148000,
          interestRate: 3.5,
          lenderName: "Wells Fargo",
          loanType: "Conventional",
        },
      ],
    },
    ownership: {
      owners: [
        { firstName: "John", lastName: "Smith" },
        { firstName: "Jane", lastName: "Smith" },
      ],
      ownershipLength: 12,
      ownerType: "Individual",
      ownerOccupancy: "Owner Occupied",
      taxAmount: 2800,
    },
    mls: {
      status: "Sold",
      amount: 295000,
      daysOnMarket: 22,
      mlsNumber: "202412345",
      agent: {
        agentName: "Bob Realtor",
        agentPhone: "509-555-1234",
      },
    },
    latitude: 47.6588,
    longitude: -117.4260,
    address: {
      streetNumber: "1234",
      streetName: "Division",
      streetSuffix: "St",
      zip: "99201",
      cityName: "Spokane",
      countyName: "Spokane",
      stateCode: "WA",
      fullAddress: "1234 N Division St, Spokane, WA 99201",
    },
    images: ["https://images.bricked.ai/abc123/photo1.jpg"],
  },
  comps: [
    {
      details: { bedrooms: 3, bathrooms: 2, squareFeet: 1500, yearBuilt: 1955, lastSaleAmount: 305000 },
      address: { fullAddress: "1300 N Division St, Spokane, WA 99201" },
      selected: true,
      compType: "Sold",
      adjusted_value: 308000,
    },
    {
      details: { bedrooms: 3, bathrooms: 1.5, squareFeet: 1380, yearBuilt: 1948, lastSaleAmount: 295000 },
      address: { fullAddress: "1180 N Monroe St, Spokane, WA 99201" },
      selected: true,
      compType: "Sold",
      adjusted_value: 298000,
    },
    {
      details: { bedrooms: 4, bathrooms: 2, squareFeet: 1600, yearBuilt: 1960, lastSaleAmount: 320000 },
      address: { fullAddress: "1402 N Hamilton St, Spokane, WA 99201" },
      selected: false,
      compType: "Sold",
      adjusted_value: 312000,
    },
  ],
  shareLink: "https://bricked.ai/share/abc123",
  dashboardLink: "https://bricked.ai/dashboard/abc123",
  cmv: 295000,
  arv: 310000,
  repairs: [
    { repair: "Roof Replacement", description: "Asphalt shingle, full tear-off", cost: 12000 },
    { repair: "Kitchen Update", description: "Cabinets, counters, appliances", cost: 15000 },
    { repair: "Interior Paint", description: "Full interior, 3 bed/2 bath", cost: 4500 },
    { repair: "Flooring", description: "LVP throughout main level", cost: 3500 },
  ],
  totalRepairCost: 35000,
};

const sampleEmptyResponse = {
  id: "",
  property: null,
  comps: [],
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
    new Response(JSON.stringify(sampleBrickedResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  const origKey = process.env.BRICKED_API_KEY;
  process.env.BRICKED_API_KEY = "test-key";

  try {
    const { brickedAdapter } = await import("./adapter");
    const result = await brickedAdapter.lookupProperty({
      address: "1234 N Division St",
      state: "WA",
      zip: "99201",
    });

    assert(result.provider === "bricked", "provider should be 'bricked'");
    assert(result.facts.length > 0, "should produce facts");

    // Valuation
    assert(findFact(result.facts, "arv_estimate")?.value === 310000, "arv_estimate mapping");
    assert(findFact(result.facts, "cmv_estimate")?.value === 295000, "cmv_estimate mapping");
    assert(findFact(result.facts, "total_repair_cost")?.value === 35000, "total_repair_cost mapping");

    // Bricked ID + share link
    assert(findFact(result.facts, "bricked_property_id")?.value === "abc-123-def", "bricked_property_id mapping");
    assert(findFact(result.facts, "bricked_share_link")?.value === "https://bricked.ai/share/abc123", "share_link mapping");

    // Property details
    assert(findFact(result.facts, "bedrooms")?.value === 3, "bedrooms mapping");
    assert(findFact(result.facts, "bathrooms")?.value === 2, "bathrooms mapping");
    assert(findFact(result.facts, "square_feet")?.value === 1450, "square_feet mapping");
    assert(findFact(result.facts, "year_built")?.value === 1952, "year_built mapping");
    assert(findFact(result.facts, "last_sale_amount")?.value === 185000, "last_sale_amount mapping");

    // Renovation score
    assert(findFact(result.facts, "renovation_score")?.value === 65, "renovation_score mapping");

    // Land/location
    assert(findFact(result.facts, "apn")?.value === "35051.2714", "apn mapping");
    assert(findFact(result.facts, "zoning")?.value === "R1", "zoning mapping");
    assert(findFact(result.facts, "county_name")?.value === "Spokane", "county_name mapping");

    // Mortgage/debt
    assert(findFact(result.facts, "estimated_equity")?.value === 215000, "estimated_equity mapping");
    assert(findFact(result.facts, "open_mortgage_balance")?.value === 95000, "open_mortgage_balance mapping");
    assert(findFact(result.facts, "ltv_ratio")?.value === 30.6, "ltv_ratio mapping");

    // Ownership
    assert(findFact(result.facts, "owner_names")?.value === "John Smith; Jane Smith", "owner_names mapping");
    assert(findFact(result.facts, "ownership_length_years")?.value === 12, "ownership_length mapping");
    assert(findFact(result.facts, "tax_amount")?.value === 2800, "tax_amount mapping");

    // MLS
    assert(findFact(result.facts, "mls_status")?.value === "Sold", "mls_status mapping");
    assert(findFact(result.facts, "mls_list_price")?.value === 295000, "mls_list_price mapping");
    assert(findFact(result.facts, "mls_number")?.value === "202412345", "mls_number mapping");

    // Geo
    assert(findFact(result.facts, "latitude")?.value === 47.6588, "latitude mapping");
    assert(findFact(result.facts, "longitude")?.value === -117.4260, "longitude mapping");

    // Address
    assert(findFact(result.facts, "full_address")?.value === "1234 N Division St, Spokane, WA 99201", "full_address mapping");
    assert(findFact(result.facts, "city")?.value === "Spokane", "city mapping");

    // Repair items
    const repairFacts = result.facts.filter((f) => f.fieldName.startsWith("repair_item_"));
    assert(repairFacts.length === 4, "should map 4 repair items");
    assert((repairFacts[0].value as string).includes("Roof Replacement"), "first repair should be roof");
    assert((repairFacts[0].value as string).includes("$12,000"), "first repair cost");

    // Comp facts — selected comps first (2 selected), then unselected
    const compFacts = result.facts.filter((f) => /^comp_\d+$/.test(f.fieldName));
    assert(compFacts.length >= 2, "should map at least selected comps");

    // Comp count
    assert(findFact(result.facts, "comp_count")?.value === 3, "comp_count should be 3");

    // Raw payload preserved
    const raw = result.rawPayload as typeof sampleBrickedResponse;
    assert(raw.comps?.length === 3, "rawPayload should preserve all 3 comps");
    assert(raw.repairs?.length === 4, "rawPayload should preserve all 4 repairs");

    console.log("  PASS: testStandardMapping");
  } finally {
    globalThis.fetch = originalFetch;
    if (origKey !== undefined) process.env.BRICKED_API_KEY = origKey;
    else delete process.env.BRICKED_API_KEY;
  }
}

async function testEmptyResponse(): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify(sampleEmptyResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  const origKey = process.env.BRICKED_API_KEY;
  process.env.BRICKED_API_KEY = "test-key";

  try {
    const { brickedAdapter } = await import("./adapter");
    const result = await brickedAdapter.lookupProperty({
      address: "99999 Rural Route",
      state: "WA",
      zip: "99000",
    });

    assert(result.provider === "bricked", "provider should be 'bricked' even on empty response");
    assert(result.facts.length === 0, "empty response should produce no facts");
    assert(result.rawPayload !== null, "rawPayload should still be present for debugging");

    console.log("  PASS: testEmptyResponse");
  } finally {
    globalThis.fetch = originalFetch;
    if (origKey !== undefined) process.env.BRICKED_API_KEY = origKey;
    else delete process.env.BRICKED_API_KEY;
  }
}

async function testApiError(): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: "Invalid API key" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });

  const origKey = process.env.BRICKED_API_KEY;
  process.env.BRICKED_API_KEY = "bad-key";

  try {
    const { brickedAdapter } = await import("./adapter");
    let threw = false;
    try {
      await brickedAdapter.lookupProperty({ address: "123 Main St", state: "WA", zip: "99201" });
    } catch (err) {
      threw = true;
      assert(err instanceof Error, "should throw an Error");
      assert((err as Error).message.includes("401"), "error should mention status code");
    }
    assert(threw, "should throw on 401");

    console.log("  PASS: testApiError");
  } finally {
    globalThis.fetch = originalFetch;
    if (origKey !== undefined) process.env.BRICKED_API_KEY = origKey;
    else delete process.env.BRICKED_API_KEY;
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export async function validate(): Promise<{ pass: boolean; errors: string[] }> {
  const errors: string[] = [];
  const tests = [
    { name: "testStandardMapping", fn: testStandardMapping },
    { name: "testEmptyResponse", fn: testEmptyResponse },
    { name: "testApiError", fn: testApiError },
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
