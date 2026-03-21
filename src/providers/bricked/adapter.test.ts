/**
 * Bricked AI Adapter — Mapping Tests
 *
 * Validates that Bricked AI comp/underwriting responses are correctly
 * normalized into canonical Sentinel facts. No real API calls — fetch is mocked.
 */

import type { ProviderLookupResult } from "../base-adapter";

// ---------------------------------------------------------------------------
// Sample Bricked payloads
// ---------------------------------------------------------------------------

const sampleBrickedResponse = {
  success: true,
  data: {
    address: "1234 N Division St, Spokane, WA 99201",
    arv: 310000,
    arvLow: 290000,
    arvHigh: 330000,
    estimatedRepairCost: 35000,
    repairCostLow: 25000,
    repairCostHigh: 45000,
    maxAllowableOffer: 181500,
    comps: [
      {
        address: "1300 N Division St",
        salePrice: 305000,
        saleDate: "2025-09-15",
        distance: 0.2,
        beds: 3,
        baths: 2,
        sqft: 1500,
        yearBuilt: 1955,
        similarity: 0.92,
      },
      {
        address: "1180 N Monroe St",
        salePrice: 295000,
        saleDate: "2025-08-22",
        distance: 0.5,
        beds: 3,
        baths: 1.5,
        sqft: 1380,
        yearBuilt: 1948,
        similarity: 0.85,
      },
      {
        address: "1402 N Hamilton St",
        salePrice: 320000,
        saleDate: "2025-10-01",
        distance: 0.8,
        beds: 4,
        baths: 2,
        sqft: 1600,
        yearBuilt: 1960,
        similarity: 0.78,
      },
      {
        address: "900 E Sinto Ave",
        salePrice: 275000,
        saleDate: "2025-07-10",
        distance: 1.2,
        beds: 2,
        baths: 1,
        sqft: 1100,
        yearBuilt: 1940,
        similarity: 0.65,
      },
    ],
    propertyDetails: {
      beds: 3,
      baths: 2,
      sqft: 1450,
      yearBuilt: 1952,
      lotSize: 7200,
      propertyType: "Single Family",
    },
    confidence: 0.88,
    compCount: 4,
    analysisDate: "2025-12-15",
  },
};

const sampleFailedResponse = {
  success: false,
  error: "Insufficient comparable sales data in area",
  data: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findFact(facts: ProviderLookupResult["facts"], fieldName: string) {
  return facts.find((f) => f.fieldName === fieldName);
}

function findFacts(facts: ProviderLookupResult["facts"], pattern: string) {
  return facts.filter((f) => f.fieldName.startsWith(pattern));
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

    // ARV estimates
    assert(findFact(result.facts, "arv_estimate")?.value === 310000, "arv_estimate mapping");
    assert(findFact(result.facts, "arv_low")?.value === 290000, "arv_low mapping");
    assert(findFact(result.facts, "arv_high")?.value === 330000, "arv_high mapping");

    // Repair costs
    assert(findFact(result.facts, "repair_cost_estimate")?.value === 35000, "repair_cost_estimate mapping");
    assert(findFact(result.facts, "repair_cost_low")?.value === 25000, "repair_cost_low mapping");
    assert(findFact(result.facts, "repair_cost_high")?.value === 45000, "repair_cost_high mapping");

    // MAO
    assert(findFact(result.facts, "max_allowable_offer")?.value === 181500, "max_allowable_offer mapping");

    // Analysis metadata
    const compCountFact = findFact(result.facts, "comp_count");
    assert(compCountFact?.value === 4, "comp_count mapping");
    assert(compCountFact?.confidence === "high", "comp_count should be high confidence");

    const confFact = findFact(result.facts, "analysis_confidence");
    assert(confFact?.value === 0.88, "analysis_confidence mapping");
    assert(confFact?.confidence === "medium", "analysis_confidence should be medium confidence");

    assert(findFact(result.facts, "analysis_date")?.value === "2025-12-15", "analysis_date mapping");

    // Comps — only top 3 should be mapped as individual comp facts
    const compFacts = result.facts.filter((f) => /^comp_\d+$/.test(f.fieldName));
    assert(compFacts.length === 3, "should map top 3 comps only");

    // First comp should contain address, price, date, distance, similarity
    const comp1 = findFact(result.facts, "comp_1");
    assert(comp1 !== undefined, "comp_1 should exist");
    assert(typeof comp1!.value === "string", "comp value should be a formatted string");
    assert((comp1!.value as string).includes("$305,000"), "comp_1 should contain sale price");
    assert((comp1!.value as string).includes("1300 N Division St"), "comp_1 should contain address");
    assert(comp1!.confidence === "medium", "comp facts should be medium confidence");

    // Raw payload should have all 4 comps
    const raw = result.rawPayload as typeof sampleBrickedResponse;
    assert(raw.data?.comps?.length === 4, "rawPayload should preserve all 4 comps");

    console.log("  PASS: testStandardMapping");
  } finally {
    globalThis.fetch = originalFetch;
    if (origKey !== undefined) process.env.BRICKED_API_KEY = origKey;
    else delete process.env.BRICKED_API_KEY;
  }
}

async function testFailedAnalysis(): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify(sampleFailedResponse), {
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

    assert(result.provider === "bricked", "provider should be 'bricked' even on failure");
    assert(result.facts.length === 0, "failed analysis should produce no facts");
    assert(result.rawPayload !== null, "rawPayload should still be present for debugging");

    console.log("  PASS: testFailedAnalysis");
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
    { name: "testFailedAnalysis", fn: testFailedAnalysis },
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
