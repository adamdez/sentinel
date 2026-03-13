/**
 * Comps UI Compression Tests — Quality labels, rationale, confidence phrases
 *
 * These tests verify:
 * 1. getCompQualityLabel boundaries (Strong/Usable/Weak)
 * 2. getCompRationale phrase generation from score dimensions
 * 3. Confidence reason mapping for decision summary
 */

import { describe, it, expect, vi } from "vitest";

// Mock supabase to avoid env var requirement
vi.mock("@/lib/supabase", () => ({
  supabase: {},
}));

import {
  getCompQualityLabel,
  getCompRationale,
  type CompScore,
  type CompProperty,
  type SubjectProperty,
} from "@/components/sentinel/comps/comps-map";

// ── Fixtures ───────────────────────────────────────────────────────────────────

const SUBJECT: SubjectProperty = {
  lat: 47.6588,
  lng: -117.4260,
  address: "123 Test St, Spokane, WA",
  beds: 3,
  baths: 2,
  sqft: 1400,
  yearBuilt: 1980,
  propertyType: "SFR",
  avm: 280000,
  radarId: "test-123",
  zip: "99201",
  county: "Spokane",
  state: "WA",
};

function makeComp(overrides?: Partial<CompProperty>): CompProperty {
  return {
    apn: "TEST-APN-001",
    streetAddress: "456 Comp St, Spokane, WA",
    lat: 47.66,
    lng: -117.43,
    beds: 3,
    baths: 2,
    sqft: 1450,
    yearBuilt: 1985,
    avm: 290000,
    lastSalePrice: 280000,
    lastSaleDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0], // 3mo ago
    propertyType: "SFR",
    ...overrides,
  };
}

function makeScore(overrides?: Partial<CompScore>): CompScore {
  return {
    total: 65,
    distance: 25,
    recency: 20,
    size: 15,
    bedBath: 12,
    year: 8,
    label: "good",
    ...overrides,
  };
}

// ── Quality label tests ────────────────────────────────────────────────────────

describe("getCompQualityLabel", () => {
  it("returns Strong for score >= 55", () => {
    expect(getCompQualityLabel(55)).toBe("Strong");
    expect(getCompQualityLabel(70)).toBe("Strong");
    expect(getCompQualityLabel(100)).toBe("Strong");
  });

  it("returns Usable for score 30-54", () => {
    expect(getCompQualityLabel(30)).toBe("Usable");
    expect(getCompQualityLabel(42)).toBe("Usable");
    expect(getCompQualityLabel(54)).toBe("Usable");
  });

  it("returns Weak for score < 30", () => {
    expect(getCompQualityLabel(29)).toBe("Weak");
    expect(getCompQualityLabel(15)).toBe("Weak");
    expect(getCompQualityLabel(0)).toBe("Weak");
  });

  it("boundary: 55 is Strong, 54 is Usable", () => {
    expect(getCompQualityLabel(55)).toBe("Strong");
    expect(getCompQualityLabel(54)).toBe("Usable");
  });

  it("boundary: 30 is Usable, 29 is Weak", () => {
    expect(getCompQualityLabel(30)).toBe("Usable");
    expect(getCompQualityLabel(29)).toBe("Weak");
  });
});

// ── Rationale tests ────────────────────────────────────────────────────────────

describe("getCompRationale", () => {
  it("returns 'Best nearby match' when distance is top dimension", () => {
    const score = makeScore({ distance: 28, recency: 10, size: 10, bedBath: 8, year: 5, total: 61 });
    const result = getCompRationale(score, makeComp(), SUBJECT);
    expect(result).toBe("Best nearby match");
  });

  it("returns 'Most recent sale' when recency is top dimension", () => {
    const score = makeScore({ distance: 15, recency: 22, size: 10, bedBath: 8, year: 5, total: 60 });
    const result = getCompRationale(score, makeComp(), SUBJECT);
    expect(result).toBe("Most recent sale");
  });

  it("returns 'Closest size match' when size is top dimension", () => {
    const score = makeScore({ distance: 15, recency: 10, size: 18, bedBath: 8, year: 5, total: 56 });
    const result = getCompRationale(score, makeComp(), SUBJECT);
    expect(result).toBe("Closest size match");
  });

  it("returns 'Strongest overall match' for high total score >= 70", () => {
    const score = makeScore({ distance: 20, recency: 18, size: 14, bedBath: 12, year: 8, total: 72 });
    const result = getCompRationale(score, makeComp(), SUBJECT);
    expect(result).toBe("Strongest overall match");
  });

  it("returns 'Strong comparable' for total 55-69 without dominant dimension", () => {
    const score = makeScore({ distance: 18, recency: 15, size: 12, bedBath: 10, year: 7, total: 62 });
    const result = getCompRationale(score, makeComp(), SUBJECT);
    expect(result).toBe("Strong comparable");
  });

  it("returns borderline rationale for score 30-39", () => {
    const score = makeScore({ distance: 10, recency: 8, size: 6, bedBath: 4, year: 7, total: 35, label: "marginal" });
    const result = getCompRationale(score, makeComp(), SUBJECT);
    expect(result).toMatch(/^Borderline/);
  });

  it("mentions old sale for strong comp with sale > 12mo ago", () => {
    const oldDate = new Date(Date.now() - 18 * 30.44 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const comp = makeComp({ lastSaleDate: oldDate });
    const score = makeScore({ total: 60, distance: 20, recency: 5 });
    const result = getCompRationale(score, comp, SUBJECT);
    expect(result).toMatch(/old sale/);
  });

  it("returns usable rationale for score 40-54", () => {
    const score = makeScore({ distance: 15, recency: 10, size: 8, bedBath: 6, year: 6, total: 45, label: "marginal" });
    const result = getCompRationale(score, makeComp(), SUBJECT);
    expect(result).toMatch(/^Usable/);
  });

  it("returns weak rationale for score < 30", () => {
    const score = makeScore({ distance: 5, recency: 5, size: 4, bedBath: 3, year: 3, total: 20, label: "outlier" });
    const result = getCompRationale(score, makeComp(), SUBJECT);
    expect(result).toMatch(/^Weak/);
  });
});

// ── Confidence reason phrase tests ─────────────────────────────────────────────

describe("confidence reason phrases", () => {
  // Replicate the inline confidenceReason logic from CompsTab
  function getConfidenceReason(
    compCount: number,
    spreadPct: number | null,
    arvConfidence: "high" | "medium" | "low",
    hasAvm: boolean,
  ): string {
    if (compCount === 0) {
      return hasAvm ? "No comps \u2014 using AVM estimate only" : "No valuation data available";
    }
    if (compCount === 1) return "Single comp \u2014 verify with additional sales";
    const spreadStr = spreadPct != null ? `${Math.round(spreadPct * 100)}%` : "?%";
    if (arvConfidence === "high") return `${compCount} strong comps, ${spreadStr} spread`;
    if (spreadPct != null && spreadPct > 0.15) return `${compCount} comps but ${spreadStr} price spread`;
    return `Only ${compCount} comp${compCount > 1 ? "s" : ""} \u2014 need 3+ for high confidence`;
  }

  it("0 comps with AVM returns AVM-only message", () => {
    const reason = getConfidenceReason(0, null, "low", true);
    expect(reason).toContain("AVM estimate only");
  });

  it("0 comps without AVM returns no-data message", () => {
    const reason = getConfidenceReason(0, null, "low", false);
    expect(reason).toBe("No valuation data available");
  });

  it("1 comp returns single-comp warning", () => {
    const reason = getConfidenceReason(1, null, "low", false);
    expect(reason).toContain("Single comp");
    expect(reason).toContain("verify");
  });

  it("3+ comps with high confidence returns strong phrase", () => {
    const reason = getConfidenceReason(3, 0.08, "high", false);
    expect(reason).toBe("3 strong comps, 8% spread");
  });

  it("2 comps with high spread returns spread warning", () => {
    const reason = getConfidenceReason(2, 0.25, "medium", false);
    expect(reason).toBe("2 comps but 25% price spread");
  });

  it("2 comps with low spread returns need-more message", () => {
    const reason = getConfidenceReason(2, 0.10, "medium", false);
    expect(reason).toContain("need 3+");
  });

  it("5 comps with tight spread returns correct count", () => {
    const reason = getConfidenceReason(5, 0.05, "high", false);
    expect(reason).toBe("5 strong comps, 5% spread");
  });
});
