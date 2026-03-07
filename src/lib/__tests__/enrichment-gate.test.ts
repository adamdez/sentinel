/**
 * Enrichment Gate Tests
 *
 * These tests encode Adam's BUSINESS RULES for when a property should
 * be promoted from staging → prospect. They exist to prevent the gate
 * from being accidentally changed to block valid properties or promote
 * invalid ones.
 *
 * GOLDEN RULES (from Adam, March 7 2026):
 * 1. Required for promotion: owner name + property address + verified distress signal(s)
 * 2. Phone/email are NOT required — agents use Deep Skip button after promotion
 * 3. Mailing address is NOT a hard gate — nice to have, but missing it shouldn't block
 * 4. Estimated value is nice-to-have but NOT a blocker for promotion
 * 5. Distress signals must be verified through actual data sources (PR, county, court, ATTOM)
 * 6. The point of staging is enrichment — properties should promote once enrichment
 *    finds owner + address + verified signal from ANY source
 *
 * If a test here fails after a code change, the question is NOT "is the test wrong?"
 * The question is "did Adam's requirements change?" If not, the code change is wrong.
 */

import { describe, it, expect } from "vitest";
import { checkDataSufficiency, type SufficiencyInput } from "../enrichment-gate";

// ── Helper to build test inputs ──────────────────────────────────────

function makeInput(overrides: Partial<SufficiencyInput> = {}): SufficiencyInput {
  return {
    ownerName: "SMITH,JOHN A",
    address: "1234 E MAIN ST",
    mailingAddress: "5678 N OAK AVE, SPOKANE, WA 99201",
    estimatedValue: 250000,
    signalCount: 1,
    hasVerifiedSignal: true,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// PROMOTION TESTS — These properties SHOULD become prospects
// ═══════════════════════════════════════════════════════════════════════

describe("Properties that SHOULD be promoted to prospect", () => {
  it("promotes with owner + address + verified signal (the minimum)", () => {
    const result = checkDataSufficiency(makeInput());
    expect(result.isSufficient).toBe(true);
    expect(result.missingFields).toEqual([]);
  });

  it("promotes even WITHOUT a phone number (phone is not in the gate)", () => {
    // Adam: "phone number/email is nice to have in enrichment but not necessary
    // because of the deep skip button agents use later"
    const result = checkDataSufficiency(makeInput());
    expect(result.isSufficient).toBe(true);
  });

  it("promotes even WITHOUT an email address", () => {
    // Same as phone — deep skip handles this after promotion
    const result = checkDataSufficiency(makeInput());
    expect(result.isSufficient).toBe(true);
  });

  it("promotes even WITHOUT an estimated value", () => {
    // Value is nice-to-have but not a hard requirement
    const result = checkDataSufficiency(makeInput({ estimatedValue: null }));
    expect(result.isSufficient).toBe(true);
  });

  it("promotes with $0 estimated value (value not blocking)", () => {
    const result = checkDataSufficiency(makeInput({ estimatedValue: 0 }));
    expect(result.isSufficient).toBe(true);
  });

  it("promotes even WITHOUT a mailing address", () => {
    // Adam: mailing address shouldn't block promotion — it creates the same
    // bottleneck as requiring phone. If missing, UI defaults to property address.
    const result = checkDataSufficiency(makeInput({ mailingAddress: null }));
    expect(result.isSufficient).toBe(true);
    // But it SHOULD warn that mailing address is missing (soft requirement)
    expect(result.warnings).toContain("mailing_address");
  });

  it("promotes when mailing address equals property address (owner-occupied)", () => {
    const result = checkDataSufficiency(makeInput({
      address: "1234 E MAIN ST",
      mailingAddress: "1234 E MAIN ST",
    }));
    expect(result.isSufficient).toBe(true);
  });

  it("promotes with multiple distress signals", () => {
    const result = checkDataSufficiency(makeInput({
      signalCount: 3,
      hasVerifiedSignal: true,
    }));
    expect(result.isSufficient).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// REJECTION TESTS — These properties should STAY in staging
// ═══════════════════════════════════════════════════════════════════════

describe("Properties that should STAY in staging (need more enrichment)", () => {
  it("rejects when owner name is missing", () => {
    const result = checkDataSufficiency(makeInput({ ownerName: null }));
    expect(result.isSufficient).toBe(false);
    expect(result.missingFields).toContain("owner_name");
  });

  it("rejects when owner name is 'Unknown'", () => {
    const result = checkDataSufficiency(makeInput({ ownerName: "Unknown" }));
    expect(result.isSufficient).toBe(false);
    expect(result.missingFields).toContain("owner_name");
  });

  it("rejects when owner name is 'Unknown Owner'", () => {
    const result = checkDataSufficiency(makeInput({ ownerName: "Unknown Owner" }));
    expect(result.isSufficient).toBe(false);
  });

  it("rejects when owner name is 'N/A'", () => {
    const result = checkDataSufficiency(makeInput({ ownerName: "N/A" }));
    expect(result.isSufficient).toBe(false);
  });

  it("rejects when owner name is empty string", () => {
    const result = checkDataSufficiency(makeInput({ ownerName: "" }));
    expect(result.isSufficient).toBe(false);
    expect(result.missingFields).toContain("owner_name");
  });

  it("rejects when address is 'Unknown'", () => {
    const result = checkDataSufficiency(makeInput({ address: "Unknown" }));
    expect(result.isSufficient).toBe(false);
    expect(result.missingFields).toContain("property_address");
  });

  it("rejects when address is null", () => {
    const result = checkDataSufficiency(makeInput({ address: null }));
    expect(result.isSufficient).toBe(false);
    expect(result.missingFields).toContain("property_address");
  });

  it("rejects when address doesn't start with a number", () => {
    // "PO BOX 123" or "LOT 45" are not valid property addresses
    const result = checkDataSufficiency(makeInput({ address: "LOT 45 RURAL ROUTE" }));
    expect(result.isSufficient).toBe(false);
    expect(result.missingFields).toContain("property_address");
  });

  it("rejects when there are zero distress signals", () => {
    // Adam: "all of the addresses I'm importing, they should all have distress
    // that sentinel needs to find and verify"
    const result = checkDataSufficiency(makeInput({ signalCount: 0, hasVerifiedSignal: false }));
    expect(result.isSufficient).toBe(false);
    expect(result.missingFields).toContain("verified_distress_signal");
  });

  it("rejects when signals exist but are NOT verified", () => {
    // Adam: "just cause a signal is found I can't trust the system actually
    // vetted the distress to confirm it is still true and currently valid"
    const result = checkDataSufficiency(makeInput({ signalCount: 2, hasVerifiedSignal: false }));
    expect(result.isSufficient).toBe(false);
    expect(result.missingFields).toContain("verified_distress_signal");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// MISSING FIELD REPORTING — gate should tell us exactly what's missing
// ═══════════════════════════════════════════════════════════════════════

describe("Missing field reporting", () => {
  it("reports all missing fields when property has nothing", () => {
    const result = checkDataSufficiency({
      ownerName: null,
      address: null,
      mailingAddress: null,
      estimatedValue: null,
      signalCount: 0,
      hasVerifiedSignal: false,
    });
    expect(result.isSufficient).toBe(false);
    expect(result.missingFields).toContain("owner_name");
    expect(result.missingFields).toContain("property_address");
    expect(result.missingFields).toContain("verified_distress_signal");
    // Mailing address should be a WARNING, not a hard missing field
    expect(result.missingFields).not.toContain("mailing_address");
    expect(result.warnings).toContain("mailing_address");
    // Should NOT contain phone or email — those are not gate requirements
    expect(result.missingFields).not.toContain("phone");
    expect(result.missingFields).not.toContain("email");
    // Should NOT contain value — not a gate requirement
    expect(result.missingFields).not.toContain("value");
    expect(result.missingFields).not.toContain("estimated_value");
    expect(result.missingFields).not.toContain("value/ARV");
  });

  it("reports only missing fields, not present ones", () => {
    const result = checkDataSufficiency(makeInput({ ownerName: null }));
    expect(result.missingFields).toContain("owner_name");
    expect(result.missingFields).not.toContain("property_address");
    expect(result.missingFields).not.toContain("verified_distress_signal");
  });

  it("returns empty missing fields when everything is present", () => {
    const result = checkDataSufficiency(makeInput());
    expect(result.missingFields).toEqual([]);
  });

  it("soft warnings include missing mailing address and value", () => {
    const result = checkDataSufficiency(makeInput({
      mailingAddress: "",
      estimatedValue: 0,
    }));
    // Should still promote (soft requirements don't block)
    expect(result.isSufficient).toBe(true);
    expect(result.warnings).toContain("mailing_address");
    expect(result.warnings).toContain("estimated_value");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ANTI-REGRESSION: Things the gate should NEVER check
// ═══════════════════════════════════════════════════════════════════════

describe("Gate should NEVER block on these (anti-regression)", () => {
  it("phone number absence does NOT block promotion", () => {
    // This test exists because phone was never a requirement,
    // but someone might accidentally add it to the gate.
    // Adam explicitly said: deep skip button handles phone after promotion
    const result = checkDataSufficiency(makeInput());
    expect(result.isSufficient).toBe(true);
    // Verify the function signature doesn't even accept phone
    const keys = Object.keys(makeInput());
    expect(keys).not.toContain("phone");
    expect(keys).not.toContain("ownerPhone");
  });

  it("email absence does NOT block promotion", () => {
    const result = checkDataSufficiency(makeInput());
    expect(result.isSufficient).toBe(true);
    const keys = Object.keys(makeInput());
    expect(keys).not.toContain("email");
    expect(keys).not.toContain("ownerEmail");
  });

  it("zero estimated value does NOT block promotion", () => {
    // Value is enrichment data that helps with offers, but not a gate requirement
    const result = checkDataSufficiency(makeInput({ estimatedValue: 0 }));
    expect(result.isSufficient).toBe(true);
  });

  it("missing mailing address does NOT block promotion", () => {
    // Missing mailing address should warn, not block
    // Adam: adding hard requirements creates the same bottleneck every time
    const result = checkDataSufficiency(makeInput({ mailingAddress: null }));
    expect(result.isSufficient).toBe(true);
  });
});
