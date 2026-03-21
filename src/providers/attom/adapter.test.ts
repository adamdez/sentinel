/**
 * ATTOM Adapter — Mapping Tests
 *
 * Validates that ATTOM API responses are correctly normalized
 * into canonical Sentinel facts. No real API calls — fetch is mocked.
 */

import type { ProviderLookupResult } from "../base-adapter";

// ---------------------------------------------------------------------------
// Sample ATTOM payloads
// ---------------------------------------------------------------------------

const sampleAttomResponse = {
  status: { code: 0, msg: "SuccessWithResult" },
  property: [
    {
      identifier: { Id: 100001, fips: "53063", apn: "35063.0119", attomId: 200001 },
      lot: { lotSize1: 7200, lotSize2: 0.165 },
      area: { munName: "Spokane", countrySecSubd: "Spokane" },
      address: {
        country: "US",
        countrySubd: "WA",
        line1: "1234 N Division St",
        line2: "Spokane, WA 99201",
        locality: "Spokane",
        oneLine: "1234 N Division St, Spokane, WA 99201",
        postal1: "99201",
      },
      location: {
        accuracy: "Rooftop",
        latitude: "47.6588",
        longitude: "-117.4112",
      },
      summary: {
        absenteeInd: "OWNER OCCUPIED",
        propclass: "Single Family",
        propsubtype: "Residential",
        proptype: "SFR",
        yearbuilt: 1952,
        propLandUse: "SFR",
      },
      building: {
        size: { livingSize: 1450, universalSize: 1550, bldgSize: 1550 },
        rooms: { bathsFull: 1, bathsHalf: 1, bathsTotal: 2, beds: 3, roomsTotal: 7 },
        interior: { bsmtSize: 800, bsmtType: "Full Basement", fplcCount: 1 },
        construction: { condition: "Average", constructionType: "Frame", roofCover: "Composition" },
        parking: { garageType: "Attached Garage", prkgSize: 400, prkgSpaces: "2" },
        summary: { levels: 2, storyDesc: "2 Story" },
      },
      assessment: {
        assessed: { assdImprValue: 180000, assdLandValue: 60000, assdTtlValue: 240000 },
        market: { mktTtlValue: 285000 },
        tax: { taxAmt: 3200, taxYear: 2025 },
      },
      sale: {
        salesHistory: [
          {
            amount: { saleAmt: 195000, saleRecDate: "2015-06-15", saleTransDate: "2015-06-10" },
            calculation: { pricePerBed: 65000, pricePerSizeUnit: 134.48 },
            sequenceSaleHistory: 1,
          },
          {
            amount: { saleAmt: 125000, saleRecDate: "2005-04-20" },
            sequenceSaleHistory: 2,
          },
        ],
      },
      owner: {
        owner1: { fullName: "Smith John D", lastName: "Smith", firstNameAndMi: "John D" },
        owner2: { fullName: "Smith Jane M", lastName: "Smith", firstNameAndMi: "Jane M" },
        absenteeOwnerStatus: "O",
        corporateIndicator: "N",
        mailingAddressOneLine: "1234 N Division St, Spokane, WA 99201",
      },
    },
  ],
};

const sampleEmptyResponse = {
  status: { code: 0, msg: "SuccessWithResult" },
  property: [],
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
    new Response(JSON.stringify(sampleAttomResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  const origKey = process.env.ATTOM_API_KEY;
  process.env.ATTOM_API_KEY = "test-key";

  try {
    const { attomAdapter } = await import("./adapter");
    const result = await attomAdapter.lookupProperty({
      address: "1234 N Division St",
      zip: "99201",
    });

    assert(result.provider === "attom", "provider should be 'attom'");
    assert(result.facts.length > 0, "should produce facts");

    // Address fields
    assert(findFact(result.facts, "address")?.value === "1234 N Division St, Spokane, WA 99201", "address mapping");
    assert(findFact(result.facts, "city")?.value === "Spokane", "city mapping");
    assert(findFact(result.facts, "state")?.value === "WA", "state mapping");
    assert(findFact(result.facts, "zip")?.value === "99201", "zip mapping");

    // Building details
    assert(findFact(result.facts, "bedrooms")?.value === 3, "bedrooms mapping");
    assert(findFact(result.facts, "bathrooms")?.value === 2, "bathrooms mapping (bathsTotal)");
    assert(findFact(result.facts, "sqft")?.value === 1450, "sqft mapping (livingSize preferred)");
    assert(findFact(result.facts, "year_built")?.value === 1952, "year_built mapping");
    assert(findFact(result.facts, "lot_size")?.value === 7200, "lot_size mapping");
    assert(findFact(result.facts, "property_type")?.value === "SFR", "property_type mapping");
    assert(findFact(result.facts, "stories")?.value === 2, "stories mapping");
    assert(findFact(result.facts, "basement_sqft")?.value === 800, "basement_sqft mapping");
    assert(findFact(result.facts, "garage_type")?.value === "Attached Garage", "garage_type mapping");

    // Owner info
    assert(findFact(result.facts, "owner_name")?.value === "Smith John D", "owner_name mapping");
    assert(findFact(result.facts, "owner_name_2")?.value === "Smith Jane M", "owner_name_2 mapping");
    assert(findFact(result.facts, "absentee_owner")?.value === "O", "absentee_owner mapping");
    assert(findFact(result.facts, "corporate_owner")?.value === false, "corporate_owner N -> false");
    assert(findFact(result.facts, "mailing_address")?.value === "1234 N Division St, Spokane, WA 99201", "mailing_address mapping");

    // Valuation
    assert(findFact(result.facts, "assessed_value")?.value === 240000, "assessed_value mapping");
    const mktFact = findFact(result.facts, "market_value");
    assert(mktFact?.value === 285000, "market_value mapping");
    assert(mktFact?.confidence === "medium", "market_value should be medium confidence");
    assert(findFact(result.facts, "tax_amount")?.value === 3200, "tax_amount mapping");
    assert(findFact(result.facts, "tax_year")?.value === 2025, "tax_year mapping");

    // Sale history — most recent
    assert(findFact(result.facts, "last_sale_amount")?.value === 195000, "last_sale_amount mapping");
    assert(findFact(result.facts, "last_sale_date")?.value === "2015-06-15", "last_sale_date mapping");

    // Location
    assert(findFact(result.facts, "latitude")?.value === 47.6588, "latitude parsed to number");
    assert(findFact(result.facts, "longitude")?.value === -117.4112, "longitude parsed to number");

    // Condition — medium confidence
    const condFact = findFact(result.facts, "condition");
    assert(condFact?.value === "Average", "condition mapping");
    assert(condFact?.confidence === "medium", "condition should be medium confidence");

    console.log("  PASS: testStandardMapping");
  } finally {
    globalThis.fetch = originalFetch;
    if (origKey !== undefined) process.env.ATTOM_API_KEY = origKey;
    else delete process.env.ATTOM_API_KEY;
  }
}

async function testEmptyResult(): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify(sampleEmptyResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  const origKey = process.env.ATTOM_API_KEY;
  process.env.ATTOM_API_KEY = "test-key";

  try {
    const { attomAdapter } = await import("./adapter");
    const result = await attomAdapter.lookupProperty({
      address: "99999 Nonexistent Rd",
      zip: "00000",
    });

    assert(result.provider === "attom", "provider should be 'attom' even on empty");
    assert(result.facts.length === 0, "should produce no facts for empty result");
    assert(result.rawPayload !== null, "rawPayload should still be present");

    console.log("  PASS: testEmptyResult");
  } finally {
    globalThis.fetch = originalFetch;
    if (origKey !== undefined) process.env.ATTOM_API_KEY = origKey;
    else delete process.env.ATTOM_API_KEY;
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export async function validate(): Promise<{ pass: boolean; errors: string[] }> {
  const errors: string[] = [];
  const tests = [
    { name: "testStandardMapping", fn: testStandardMapping },
    { name: "testEmptyResult", fn: testEmptyResult },
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
