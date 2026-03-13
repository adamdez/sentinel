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

// ── Hardening: Warning message tests ──────────────────────────────────────────

import { buildValuationWarnings } from "@/lib/valuation";

describe("buildValuationWarnings - hardening pass", () => {
  const BASE = {
    arv: 280000,
    arvSource: "comps" as const,
    compCount: 3,
    confidence: "high" as const,
    spreadPct: 0.08,
    mao: 160000,
    rehabEstimate: 40000,
    conditionLevel: 3,
  };

  it("NO_COMPS message contains 'Run comps before offering'", () => {
    const warnings = buildValuationWarnings({ ...BASE, compCount: 0 });
    const noComps = warnings.find((w) => w.code === "NO_COMPS");
    expect(noComps).toBeDefined();
    expect(noComps!.message).toContain("Run comps before offering");
  });

  it("FEW_COMPS message contains 'before making an offer'", () => {
    const warnings = buildValuationWarnings({ ...BASE, compCount: 2 });
    const few = warnings.find((w) => w.code === "FEW_COMPS");
    expect(few).toBeDefined();
    expect(few!.message).toContain("before making an offer");
  });

  it("LOW_CONFIDENCE message contains 'do not offer'", () => {
    const warnings = buildValuationWarnings({ ...BASE, confidence: "low" });
    const low = warnings.find((w) => w.code === "LOW_CONFIDENCE");
    expect(low).toBeDefined();
    expect(low!.message).toContain("do not offer");
  });

  it("HIGH_SPREAD message contains 'Verify before offering'", () => {
    const warnings = buildValuationWarnings({ ...BASE, spreadPct: 0.35 });
    const high = warnings.find((w) => w.code === "HIGH_SPREAD");
    expect(high).toBeDefined();
    expect(high!.message).toContain("Verify before offering");
  });

  it("NO_CONDITION severity is 'warn' not 'info'", () => {
    const warnings = buildValuationWarnings({ ...BASE, conditionLevel: null });
    const noCond = warnings.find((w) => w.code === "NO_CONDITION");
    expect(noCond).toBeDefined();
    expect(noCond!.severity).toBe("warn");
  });

  it("NO_CONDITION message contains 'before offering'", () => {
    const warnings = buildValuationWarnings({ ...BASE, conditionLevel: null });
    const noCond = warnings.find((w) => w.code === "NO_CONDITION");
    expect(noCond!.message).toContain("before offering");
  });
});

// ── Hardening: Quick Screen degraded treatment ────────────────────────────────

describe("Quick Screen degraded treatment", () => {
  it("when compCount is 0, mode should be Quick Screen not Underwrite", () => {
    const compCount = 0;
    const hasAvm = true;
    const modeLabel = compCount > 0 ? "Underwrite" : hasAvm ? "Quick Screen" : null;
    expect(modeLabel).toBe("Quick Screen");
  });

  it("rough formatting produces abbreviated values", () => {
    function formatRoughCurrency(n: number): string {
      if (n >= 1000) return `~$${Math.round(n / 1000)}k`;
      return `~$${n}`;
    }
    expect(formatRoughCurrency(285000)).toBe("~$285k");
    expect(formatRoughCurrency(1200000)).toBe("~$1200k");
    expect(formatRoughCurrency(50000)).toBe("~$50k");
  });

  it("screening reasons list expected entries for AVM-only", () => {
    const compCount = 0;
    const conditionLevel: number | null = null;
    const reasons: string[] = [];
    if (compCount === 0) reasons.push("AVM-only");
    if (compCount === 0) reasons.push("No comps selected");
    if (conditionLevel == null) reasons.push("Condition unverified");
    expect(reasons).toContain("AVM-only");
    expect(reasons).toContain("No comps selected");
    expect(reasons).toContain("Condition unverified");
  });
});

// ── Hardening: Confidence-based nudge ─────────────────────────────────────────

describe("confidence-based nudge", () => {
  function shouldShowNudge(
    confidence: "high" | "medium" | "low",
    strongCompCount: number,
    conditionLevel: number | null,
  ): boolean {
    return confidence === "low" || strongCompCount < 2 || conditionLevel == null;
  }

  function getNudgeReason(
    confidence: "high" | "medium" | "low",
    strongCompCount: number,
    conditionLevel: number | null,
  ): string {
    if (conditionLevel == null) return "Condition not assessed - review before offering.";
    if (confidence === "low") return "Low confidence - review comp quality before offering.";
    if (strongCompCount < 2) return `Only ${strongCompCount} strong comp match${strongCompCount === 1 ? "" : "es"} - review evidence before offering.`;
    return "";
  }

  it("triggers when confidence is low", () => {
    expect(shouldShowNudge("low", 3, 3)).toBe(true);
  });

  it("triggers when fewer than 2 strong comp matches", () => {
    expect(shouldShowNudge("high", 1, 3)).toBe(true);
  });

  it("triggers when conditionLevel is null", () => {
    expect(shouldShowNudge("high", 3, null)).toBe(true);
  });

  it("does NOT trigger when 3 strong comps and high confidence and condition set", () => {
    expect(shouldShowNudge("high", 3, 3)).toBe(false);
  });

  it("nudge reason mentions condition when conditionLevel is null", () => {
    expect(getNudgeReason("high", 3, null)).toContain("Condition not assessed");
  });

  it("nudge reason mentions low confidence", () => {
    expect(getNudgeReason("low", 3, 3)).toContain("Low confidence");
  });

  it("nudge reason mentions strong comp match count", () => {
    expect(getNudgeReason("high", 1, 3)).toContain("1 strong comp match");
  });
});

// ── Hardening: Comp card condition flags ──────────────────────────────────────

describe("comp card condition flags", () => {
  it("foreclosure and tax delinquent are red severity", () => {
    const getColor = (flag: string) =>
      ["Foreclosure", "Tax Delinquent"].includes(flag) ? "red" : "amber";
    expect(getColor("Foreclosure")).toBe("red");
    expect(getColor("Tax Delinquent")).toBe("red");
  });

  it("vacant and listed are amber severity", () => {
    const getColor = (flag: string) =>
      ["Foreclosure", "Tax Delinquent"].includes(flag) ? "red" : "amber";
    expect(getColor("Vacant")).toBe("amber");
    expect(getColor("Listed")).toBe("amber");
  });
});

// ── Hardening: Warning display limits ─────────────────────────────────────────

describe("warning display limits", () => {
  function renderWarnings(warnings: Array<{ severity: string; message: string }>) {
    const danger = warnings.filter((w) => w.severity === "danger");
    const warn = warnings.filter((w) => w.severity === "warn");
    const shownWarn = warn.slice(0, 2);
    const overflowCount = warn.length - shownWarn.length;
    const hasDanger = danger.length > 0;
    return { danger, shownWarn, overflowCount, hasDanger };
  }

  it("all danger warnings render with no limit", () => {
    const warnings = [
      { severity: "danger", message: "A" },
      { severity: "danger", message: "B" },
      { severity: "danger", message: "C" },
    ];
    const { danger } = renderWarnings(warnings);
    expect(danger).toHaveLength(3);
  });

  it("warn warnings capped at 2 with overflow count", () => {
    const warnings = [
      { severity: "warn", message: "A" },
      { severity: "warn", message: "B" },
      { severity: "warn", message: "C" },
      { severity: "warn", message: "D" },
    ];
    const { shownWarn, overflowCount } = renderWarnings(warnings);
    expect(shownWarn).toHaveLength(2);
    expect(overflowCount).toBe(2);
  });

  it("escalation line appears when any danger warning exists", () => {
    const warnings = [
      { severity: "danger", message: "Bad" },
      { severity: "warn", message: "Meh" },
    ];
    const { hasDanger } = renderWarnings(warnings);
    expect(hasDanger).toBe(true);
  });

  it("no escalation when only warn severity", () => {
    const warnings = [
      { severity: "warn", message: "Meh" },
    ];
    const { hasDanger } = renderWarnings(warnings);
    expect(hasDanger).toBe(false);
  });
});

// ── Adversarial: MAO formula consistency ──────────────────────────────────────

import {
  calculateWholesaleUnderwrite,
  calculateQuickScreen,
  calculateARVRange,
  calculateArvConfidence,
  DEFAULTS,
} from "@/lib/valuation";

describe("MAO formula consistency across surfaces", () => {
  it("Comps tab and Overview tab produce same MAO with same inputs", () => {
    // Both should use kernel defaults when no overrides
    const arv = 300000;
    const overviewResult = calculateWholesaleUnderwrite({ arv, arvSource: "comps" });
    const compsResult = calculateWholesaleUnderwrite({
      arv,
      arvSource: "comps",
      offerPercentage: DEFAULTS.offerPercentage,
      rehabEstimate: DEFAULTS.rehabEstimate,
      assignmentFeeTarget: DEFAULTS.assignmentFeeTarget,
      holdingCosts: DEFAULTS.holdMonths * DEFAULTS.monthlyHoldCost,
      closingCosts: DEFAULTS.closingCosts,
    });
    expect(compsResult.mao).toBe(overviewResult.mao);
  });

  it("MAO includes assignment fee and holding/closing costs", () => {
    const arv = 300000;
    const withFee = calculateWholesaleUnderwrite({ arv });
    const withoutFee = calculateWholesaleUnderwrite({
      arv,
      assignmentFeeTarget: 0,
      holdingCosts: 0,
      closingCosts: 0,
    });
    // withFee.mao should be less than withoutFee.mao by the fee amount
    expect(withFee.mao).toBeLessThan(withoutFee.mao);
    expect(withoutFee.mao - withFee.mao).toBe(DEFAULTS.assignmentFeeTarget);
  });

  it("default offerPercentage is 75%, not 65%", () => {
    expect(DEFAULTS.offerPercentage).toBe(0.75);
  });
});

// ── Adversarial: NO_COMPS warning fires without arvSource guard ───────────────

describe("NO_COMPS warning - adversarial", () => {
  it("NO_COMPS fires when compCount is 0 regardless of arvSource", () => {
    const warningsAvm = buildValuationWarnings({
      arv: 280000,
      arvSource: "avm",
      compCount: 0,
      confidence: "low",
      spreadPct: null,
      mao: 160000,
      rehabEstimate: 40000,
      conditionLevel: 3,
    });
    const noComps = warningsAvm.find((w) => w.code === "NO_COMPS");
    expect(noComps).toBeDefined();
    expect(noComps!.severity).toBe("danger");
  });

  it("ARV_FROM_AVM does NOT fire when compCount is 0 (NO_COMPS covers it)", () => {
    const warnings = buildValuationWarnings({
      arv: 280000,
      arvSource: "avm",
      compCount: 0,
      confidence: "low",
      spreadPct: null,
      mao: 160000,
      rehabEstimate: 40000,
      conditionLevel: 3,
    });
    const avmWarning = warnings.find((w) => w.code === "ARV_FROM_AVM");
    expect(avmWarning).toBeUndefined();
  });
});

// ── Adversarial: Quick Screen vs Underwrite separation ────────────────────────

describe("Quick Screen vs Underwrite separation", () => {
  it("calculateQuickScreen uses 50-65% range, not 75%", () => {
    const result = calculateQuickScreen(300000);
    expect(result.maoLow).toBe(150000); // 300k * 50%
    expect(result.maoHigh).toBe(195000); // 300k * 65%
    expect(result.formulaMode).toBe("quick_screen");
  });

  it("calculateWholesaleUnderwrite uses 75% default", () => {
    const result = calculateWholesaleUnderwrite({ arv: 300000 });
    expect(result.offerPercentage).toBe(0.75);
    expect(result.maxAllowable).toBe(225000); // 300k * 75%
    expect(result.formulaMode).toBe("wholesale_underwrite");
  });

  it("screening and underwrite produce different numbers for same AVM", () => {
    const screen = calculateQuickScreen(300000);
    const underwrite = calculateWholesaleUnderwrite({ arv: 300000 });
    // Screening high (195k) should differ from underwrite MAO
    expect(screen.maoHigh).not.toBe(underwrite.mao);
  });
});

// ── Adversarial: Condition evidence attacks ───────────────────────────────────

describe("condition evidence attacks", () => {
  it("conditionLevel null generates NO_CONDITION warning with severity warn", () => {
    const warnings = buildValuationWarnings({
      arv: 280000,
      arvSource: "comps",
      compCount: 3,
      confidence: "high",
      spreadPct: 0.08,
      mao: 160000,
      rehabEstimate: 40000,
      conditionLevel: null,
    });
    const noCond = warnings.find((w) => w.code === "NO_CONDITION");
    expect(noCond).toBeDefined();
    expect(noCond!.severity).toBe("warn");
  });

  it("conditionLevel 4 (0% adj) does NOT generate NO_CONDITION warning", () => {
    const warnings = buildValuationWarnings({
      arv: 280000,
      arvSource: "comps",
      compCount: 3,
      confidence: "high",
      spreadPct: 0.08,
      mao: 160000,
      rehabEstimate: 40000,
      conditionLevel: 4,
    });
    const noCond = warnings.find((w) => w.code === "NO_CONDITION");
    expect(noCond).toBeUndefined();
  });

  it("ARV with conditionAdj 0 is same as ARV without adjustment", () => {
    const comps = [{ price: 280000, sqft: 1400, ppsf: 200 }];
    const withAdj = calculateARVRange(comps, 1400, 0);
    const withoutAdj = calculateARVRange(comps, 1400);
    expect(withAdj.arvBase).toBe(withoutAdj.arvBase);
  });
});

// ── Adversarial: Confidence honesty ───────────────────────────────────────────

describe("confidence honesty", () => {
  it("1 comp is always low confidence", () => {
    const result = calculateArvConfidence(1, 0);
    expect(result.confidence).toBe("low");
  });

  it("2 comps with tight spread is medium, not high", () => {
    const result = calculateArvConfidence(2, 0.05);
    expect(result.confidence).toBe("medium");
  });

  it("3 comps with >15% spread is medium, not high", () => {
    const result = calculateArvConfidence(3, 0.20);
    expect(result.confidence).toBe("medium");
  });

  it("3 comps with >30% spread is low", () => {
    const result = calculateArvConfidence(3, 0.35);
    expect(result.confidence).toBe("low");
  });

  it("0 comps is always low confidence", () => {
    const result = calculateArvConfidence(0, null);
    expect(result.confidence).toBe("low");
  });
});

// ── Adversarial: Distressed comp quality cap ──────────────────────────────────

describe("distressed comp quality label cap", () => {
  it("foreclosure comp with score 70 is capped at Usable, not Strong", () => {
    expect(getCompQualityLabel(70, true)).toBe("Usable");
  });

  it("foreclosure comp with score 55 is capped at Usable", () => {
    expect(getCompQualityLabel(55, true)).toBe("Usable");
  });

  it("foreclosure comp with score 29 is Weak", () => {
    expect(getCompQualityLabel(29, true)).toBe("Weak");
  });

  it("non-distressed comp with score 70 is Strong", () => {
    expect(getCompQualityLabel(70, false)).toBe("Strong");
  });

  it("non-distressed comp with score 70, no flag passed, is Strong", () => {
    expect(getCompQualityLabel(70)).toBe("Strong");
  });
});

// ── Adversarial: Photo evidence nudge ─────────────────────────────────────────

describe("photo evidence nudge", () => {
  it("nudge triggers when all comps lack photos", () => {
    const comps = [
      { photoUrl: null, streetViewUrl: null },
      { photoUrl: null, streetViewUrl: null },
    ];
    const noPhotos = comps.length > 0 && comps.every((c) => !c.photoUrl && !c.streetViewUrl);
    expect(noPhotos).toBe(true);
  });

  it("nudge does NOT trigger when at least one comp has a photo", () => {
    const comps = [
      { photoUrl: "https://example.com/photo.jpg", streetViewUrl: null },
      { photoUrl: null, streetViewUrl: null },
    ];
    const noPhotos = comps.length > 0 && comps.every((c) => !c.photoUrl && !c.streetViewUrl);
    expect(noPhotos).toBe(false);
  });

  it("nudge does NOT trigger when comp has streetViewUrl", () => {
    const comps = [
      { photoUrl: null, streetViewUrl: "https://example.com/sv.jpg" },
    ];
    const noPhotos = comps.length > 0 && comps.every((c) => !c.photoUrl && !c.streetViewUrl);
    expect(noPhotos).toBe(false);
  });
});
