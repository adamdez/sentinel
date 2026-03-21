/**
 * PropertyRadar Adapter — Mapping Tests
 *
 * Validates that PropertyRadar API responses are correctly normalized
 * into canonical Sentinel facts. No real API calls — fetch is mocked.
 */

import type { ProviderLookupResult } from "../base-adapter";

// ---------------------------------------------------------------------------
// Sample PR payloads
// ---------------------------------------------------------------------------

const samplePRResponse = {
  results: [
    {
      RadarID: "PR-12345",
      APN: "35063.0119",
      County: "Spokane",
      Address: "1234 N Division St",
      City: "Spokane",
      State: "WA",
      ZipFive: "99201",
      OwnerNames: "John D Smith",
      MailingAddress: "PO Box 555 Spokane WA 99201",
      EstimatedValue: 285000,
      EstimatedEquity: 142000,
      EstimatedEquityPercent: 49.8,
      AvmValue: 290000,
      AvmValueHigh: 310000,
      AvmValueLow: 270000,
      TotalLoanBalance: 143000,
      FirstMortgageBalance: 143000,
      FirstMortgageRate: 4.5,
      FirstMortgageType: "Conventional",
      LastSaleDate: "2015-06-15",
      LastSalePrice: 195000,
      PropertyType: "Single Family",
      YearBuilt: 1952,
      SquareFeet: 1450,
      LotSquareFeet: 7200,
      LotAcres: 0.165,
      Bedrooms: 3,
      Bathrooms: 2,
      TaxAssessedValue: 240000,
      TaxDelinquencyAmount: 0,
      OwnershipLengthMonths: 130,
      isOwnerOccupied: 1,
      isPreforeclosure: false,
      inForeclosure: false,
      isDeceasedProperty: false,
      inTaxDelinquency: false,
      inBankruptcyProperty: false,
      inDivorce: false,
      isSiteVacant: false,
      isMailVacant: false,
      isNotSameMailingOrExempt: false,
      isUnderwater: false,
      isListedForSale: false,
    },
  ],
};

const sampleDistressedResponse = {
  results: [
    {
      RadarID: "PR-99999",
      APN: "35063.0800",
      County: "Spokane",
      Address: "999 W Sprague Ave",
      City: "Spokane",
      State: "WA",
      ZipFive: "99201",
      OwnerNames: "Estate of Mary Jones",
      EstimatedValue: 180000,
      EstimatedEquity: 25000,
      TotalLoanBalance: 155000,
      LastSaleDate: "2008-03-01",
      LastSalePrice: 210000,
      PropertyType: "Single Family",
      YearBuilt: 1940,
      SquareFeet: 1100,
      Bedrooms: 2,
      Bathrooms: 1,
      isPreforeclosure: 1,
      isDeceasedProperty: true,
      inTaxDelinquency: "1",
      isNotSameMailingOrExempt: true,
      isOwnerOccupied: 0,
      OwnershipLengthMonths: 216,
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
  // Mock fetch
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify(samplePRResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  // Set env
  const origKey = process.env.PROPERTYRADAR_API_KEY;
  process.env.PROPERTYRADAR_API_KEY = "test-key";

  try {
    // Dynamic import to avoid module-level side effects
    const { propertyRadarAdapter } = await import("./adapter");
    const result = await propertyRadarAdapter.lookupProperty({
      address: "1234 N Division St",
      state: "WA",
      zip: "99201",
    });

    assert(result.provider === "propertyradar", "provider should be 'propertyradar'");
    assert(result.facts.length > 0, "should produce facts");

    // Core property facts
    assert(findFact(result.facts, "owner_name")?.value === "John D Smith", "owner_name mapping");
    assert(findFact(result.facts, "property_address")?.value === "1234 N Division St", "address mapping");
    assert(findFact(result.facts, "city")?.value === "Spokane", "city mapping");
    assert(findFact(result.facts, "state")?.value === "WA", "state mapping");
    assert(findFact(result.facts, "zip")?.value === "99201", "zip mapping");
    assert(findFact(result.facts, "county")?.value === "Spokane", "county mapping");
    assert(findFact(result.facts, "apn")?.value === "35063.0119", "apn mapping");

    // Valuation facts — medium confidence
    const avmFact = findFact(result.facts, "avm_value");
    assert(avmFact?.value === 290000, "avm_value mapping");
    assert(avmFact?.confidence === "medium", "avm_value should be medium confidence");

    // Mortgage facts — high confidence
    const mortgageFact = findFact(result.facts, "total_loan_balance");
    assert(mortgageFact?.value === 143000, "total_loan_balance mapping");
    assert(mortgageFact?.confidence === "high", "mortgage data should be high confidence");

    // Property characteristics
    assert(findFact(result.facts, "year_built")?.value === 1952, "year_built mapping");
    assert(findFact(result.facts, "bedrooms")?.value === 3, "bedrooms mapping");
    assert(findFact(result.facts, "bathrooms")?.value === 2, "bathrooms mapping");
    assert(findFact(result.facts, "square_footage")?.value === 1450, "sqft mapping");

    // Sale history
    assert(findFact(result.facts, "last_sale_price")?.value === 195000, "last_sale_price mapping");
    assert(findFact(result.facts, "last_sale_date")?.value === "2015-06-15", "last_sale_date mapping");

    // Owner occupied flag
    assert(findFact(result.facts, "owner_occupied")?.value === "true", "owner_occupied when truthy");

    // No distress flags should appear for this clean property
    assert(!findFact(result.facts, "distress_pre_foreclosure"), "no pre-foreclosure flag for clean property");
    assert(!findFact(result.facts, "distress_probate"), "no probate flag for clean property");

    // Provider field paths should be prefixed
    assert(
      result.facts.every((f) => f.providerFieldPath.startsWith("propertyradar.")),
      "all providerFieldPath should start with 'propertyradar.'"
    );

    console.log("  PASS: testStandardMapping");
  } finally {
    globalThis.fetch = originalFetch;
    if (origKey !== undefined) process.env.PROPERTYRADAR_API_KEY = origKey;
    else delete process.env.PROPERTYRADAR_API_KEY;
  }
}

async function testDistressFlags(): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify(sampleDistressedResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  const origKey = process.env.PROPERTYRADAR_API_KEY;
  process.env.PROPERTYRADAR_API_KEY = "test-key";

  try {
    const { propertyRadarAdapter } = await import("./adapter");
    const result = await propertyRadarAdapter.lookupProperty({
      address: "999 W Sprague Ave",
      state: "WA",
      zip: "99201",
    });

    // Distress signals should map
    assert(findFact(result.facts, "distress_pre_foreclosure")?.value === "true", "pre-foreclosure flag (numeric 1)");
    assert(findFact(result.facts, "distress_probate")?.value === "true", "probate/deceased flag (boolean true)");
    assert(findFact(result.facts, "distress_tax_delinquent")?.value === "true", "tax delinquent flag (string '1')");
    assert(findFact(result.facts, "absentee_owner")?.value === "true", "absentee_owner flag");

    // Not owner-occupied
    assert(!findFact(result.facts, "owner_occupied"), "owner_occupied should not appear when 0");

    console.log("  PASS: testDistressFlags");
  } finally {
    globalThis.fetch = originalFetch;
    if (origKey !== undefined) process.env.PROPERTYRADAR_API_KEY = origKey;
    else delete process.env.PROPERTYRADAR_API_KEY;
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export async function validate(): Promise<{ pass: boolean; errors: string[] }> {
  const errors: string[] = [];
  const tests = [
    { name: "testStandardMapping", fn: testStandardMapping },
    { name: "testDistressFlags", fn: testDistressFlags },
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
