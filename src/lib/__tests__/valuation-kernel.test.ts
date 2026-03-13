/**
 * Valuation Kernel Tests
 *
 * Proves:
 * 1. Formula consistency — same inputs always produce same outputs
 * 2. Range/confidence accuracy — thresholds work as documented
 * 3. Edge cases — zero ARV, empty comps, missing data
 * 4. Warning generation — correct warnings for each scenario
 * 5. Snapshot building — complete data capture
 * 6. Quick screen vs underwrite separation
 * 7. Default values match DEFAULTS constant
 */

import { describe, it, expect } from "vitest";
import {
  calculateARVRange,
  calculateArvConfidence,
  calculateQuickScreen,
  calculateWholesaleUnderwrite,
  buildValuationWarnings,
  buildValuationSnapshot,
  getRehabGuidance,
  DEFAULTS,
  FORMULA_VERSION,
  FORMULA_MODE_QUICK_SCREEN,
  FORMULA_MODE_WHOLESALE_UNDERWRITE,
  CONDITION_ADJ_MAP,
  type CompMetric,
} from "../valuation";

// ─── Test Helpers ─────────────────────────────────────────────────────────────

const makeComp = (price: number, sqft: number): CompMetric => ({
  price,
  sqft,
  ppsf: sqft > 0 ? price / sqft : null,
});

const threeGoodComps: CompMetric[] = [
  makeComp(280000, 1400), // $200/sqft
  makeComp(300000, 1500), // $200/sqft
  makeComp(290000, 1450), // $200/sqft
];

const twoWideComps: CompMetric[] = [
  makeComp(200000, 1400), // $142.86/sqft
  makeComp(400000, 1600), // $250/sqft
];

// ─── calculateARVRange ────────────────────────────────────────────────────────

describe("calculateARVRange", () => {
  it("returns zeros for empty comps", () => {
    const result = calculateARVRange([], 1500);
    expect(result.arvBase).toBe(0);
    expect(result.arvLow).toBe(0);
    expect(result.arvHigh).toBe(0);
    expect(result.avgPpsf).toBeNull();
    expect(result.compCount).toBe(0);
  });

  it("returns zeros for zero subject sqft", () => {
    const result = calculateARVRange(threeGoodComps, 0);
    expect(result.arvBase).toBe(0);
  });

  it("calculates ARV from 3 comps with sqft data", () => {
    const result = calculateARVRange(threeGoodComps, 1500);
    expect(result.compCount).toBe(3);
    expect(result.arvBase).toBeGreaterThan(0);
    expect(result.arvLow).toBeLessThanOrEqual(result.arvBase);
    expect(result.arvHigh).toBeGreaterThanOrEqual(result.arvBase);
    expect(result.avgPpsf).toBeGreaterThan(0);
    expect(result.spreadPct).not.toBeNull();
  });

  it("uses avg $/sqft × subject sqft formula", () => {
    const comps: CompMetric[] = [
      makeComp(200000, 1000), // $200/sqft
      makeComp(300000, 1000), // $300/sqft
    ];
    const result = calculateARVRange(comps, 1200);
    // avg ppsf = $250, subject = 1200sqft → base = $300,000
    expect(result.arvBase).toBe(300000);
    expect(result.avgPpsf).toBe(250);
  });

  it("falls back to price averaging when no sqft data", () => {
    const noSqftComps: CompMetric[] = [
      { price: 200000, sqft: null, ppsf: null },
      { price: 300000, sqft: null, ppsf: null },
    ];
    const result = calculateARVRange(noSqftComps, 1500);
    expect(result.arvBase).toBe(250000);
    expect(result.avgPpsf).toBeNull();
  });

  it("applies condition adjustment correctly", () => {
    const result0 = calculateARVRange(threeGoodComps, 1500, 0);
    const resultNeg = calculateARVRange(threeGoodComps, 1500, -10);
    const resultPos = calculateARVRange(threeGoodComps, 1500, 5);

    expect(resultNeg.arvBase).toBeLessThan(result0.arvBase);
    expect(resultPos.arvBase).toBeGreaterThan(result0.arvBase);
    // -10% should reduce by ~10%
    expect(resultNeg.arvBase).toBeCloseTo(result0.arvBase * 0.9, -2);
  });

  it("calculates spread percentage", () => {
    const result = calculateARVRange(twoWideComps, 1500);
    expect(result.spreadPct).not.toBeNull();
    expect(result.spreadPct!).toBeGreaterThan(0);
  });
});

// ─── calculateArvConfidence ───────────────────────────────────────────────────

describe("calculateArvConfidence", () => {
  it("returns low for 0 comps", () => {
    const result = calculateArvConfidence(0, null);
    expect(result.confidence).toBe("low");
    expect(result.reasons).toContain("No comps available");
  });

  it("returns low for 1 comp", () => {
    const result = calculateArvConfidence(1, 0.05);
    expect(result.confidence).toBe("low");
  });

  it("returns medium for 2 comps within 30%", () => {
    const result = calculateArvConfidence(2, 0.20);
    expect(result.confidence).toBe("medium");
  });

  it("returns high for 3+ comps within 15%", () => {
    const result = calculateArvConfidence(3, 0.10);
    expect(result.confidence).toBe("high");
  });

  it("returns medium for 3 comps with 20% spread", () => {
    const result = calculateArvConfidence(3, 0.20);
    expect(result.confidence).toBe("medium");
  });

  it("returns low for 2 comps with 35% spread", () => {
    const result = calculateArvConfidence(2, 0.35);
    expect(result.confidence).toBe("low");
  });

  it("includes reasons explaining the grade", () => {
    const result = calculateArvConfidence(1, 0.40);
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});

// ─── calculateQuickScreen ─────────────────────────────────────────────────────

describe("calculateQuickScreen", () => {
  it("uses 50-65% range by default", () => {
    const result = calculateQuickScreen(300000);
    expect(result.maoLow).toBe(150000); // 300k × 0.50
    expect(result.maoHigh).toBe(195000); // 300k × 0.65
    expect(result.formulaMode).toBe(FORMULA_MODE_QUICK_SCREEN);
    expect(result.formulaVersion).toBe(FORMULA_VERSION);
  });

  it("returns zeros for zero AVM", () => {
    const result = calculateQuickScreen(0);
    expect(result.maoLow).toBe(0);
    expect(result.maoHigh).toBe(0);
  });

  it("includes basis description", () => {
    const result = calculateQuickScreen(300000);
    expect(result.basis).toContain("300,000");
    expect(result.basis).toContain("50");
    expect(result.basis).toContain("65");
  });

  it("accepts custom percentages", () => {
    const result = calculateQuickScreen(200000, 0.40, 0.70);
    expect(result.maoLow).toBe(80000);
    expect(result.maoHigh).toBe(140000);
  });
});

// ─── calculateWholesaleUnderwrite ─────────────────────────────────────────────

describe("calculateWholesaleUnderwrite", () => {
  it("uses company defaults when no overrides", () => {
    const result = calculateWholesaleUnderwrite({ arv: 300000 });
    expect(result.offerPercentage).toBe(DEFAULTS.offerPercentage);
    expect(result.rehabEstimate).toBe(DEFAULTS.rehabEstimate);
    expect(result.assignmentFeeTarget).toBe(DEFAULTS.assignmentFeeTarget);
    expect(result.formulaMode).toBe(FORMULA_MODE_WHOLESALE_UNDERWRITE);
    expect(result.formulaVersion).toBe(FORMULA_VERSION);
  });

  it("calculates MAO = (ARV × offerPct) − rehab − fee", () => {
    const result = calculateWholesaleUnderwrite({
      arv: 300000,
      offerPercentage: 0.75,
      rehabEstimate: 40000,
      assignmentFeeTarget: 12000,
      holdingCosts: 0,
      closingCosts: 0,
    });
    // MAO = (300k × 0.75) - 40k - 12k = 225k - 52k = 173k
    expect(result.maxAllowable).toBe(225000);
    expect(result.mao).toBe(173000);
  });

  it("never returns negative MAO", () => {
    const result = calculateWholesaleUnderwrite({
      arv: 50000,
      rehabEstimate: 80000,
    });
    expect(result.mao).toBe(0);
  });

  it("calculates full deal economics", () => {
    const result = calculateWholesaleUnderwrite({
      arv: 300000,
      offerPercentage: 0.75,
      rehabEstimate: 30000,
      assignmentFeeTarget: 15000,
      holdingCosts: 4500,
      closingCosts: 5000,
      purchasePriceOverride: 170000,
    });
    // totalCosts = 170k + 30k + 4.5k + 5k = 209,500
    expect(result.totalCosts).toBe(209500);
    // grossProfit = 300k - 209.5k = 90,500
    expect(result.grossProfit).toBe(90500);
    // netProfit = 90.5k - 15k = 75,500
    expect(result.netProfit).toBe(75500);
    // ROI = (90500 / 209500) × 100 ≈ 43.2%
    expect(result.roi).toBeGreaterThan(40);
    expect(result.roi).toBeLessThan(50);
  });

  it("returns null ROI when no costs", () => {
    const result = calculateWholesaleUnderwrite({
      arv: 0,
    });
    expect(result.roi).toBeNull();
  });

  it("uses purchasePriceOverride for total costs when provided", () => {
    const withOverride = calculateWholesaleUnderwrite({
      arv: 300000,
      purchasePriceOverride: 150000,
      holdingCosts: 0,
      closingCosts: 0,
    });
    const withoutOverride = calculateWholesaleUnderwrite({
      arv: 300000,
      holdingCosts: 0,
      closingCosts: 0,
    });
    // With override, purchase = 150k, without = MAO
    expect(withOverride.totalCosts).not.toBe(withoutOverride.totalCosts);
  });

  it("handles zero ARV gracefully", () => {
    const result = calculateWholesaleUnderwrite({ arv: 0 });
    expect(result.mao).toBe(0);
    expect(result.maxAllowable).toBe(0);
    expect(result.grossProfit).toBe(0);
  });

  it("applies default holding costs from constants", () => {
    const result = calculateWholesaleUnderwrite({ arv: 300000 });
    expect(result.holdingCosts).toBe(DEFAULTS.holdMonths * DEFAULTS.monthlyHoldCost);
    expect(result.closingCosts).toBe(DEFAULTS.closingCosts);
  });
});

// ─── Formula Consistency ──────────────────────────────────────────────────────

describe("formula consistency", () => {
  it("same inputs always produce same outputs (deterministic)", () => {
    const inputs = { arv: 287500, offerPercentage: 0.72, rehabEstimate: 35000, assignmentFeeTarget: 12000 };
    const r1 = calculateWholesaleUnderwrite(inputs);
    const r2 = calculateWholesaleUnderwrite(inputs);
    expect(r1.mao).toBe(r2.mao);
    expect(r1.grossProfit).toBe(r2.grossProfit);
    expect(r1.roi).toBe(r2.roi);
  });

  it("quick screen and underwrite use different formula modes", () => {
    const screen = calculateQuickScreen(300000);
    const underwrite = calculateWholesaleUnderwrite({ arv: 300000 });
    expect(screen.formulaMode).not.toBe(underwrite.formulaMode);
  });

  it("underwrite MAO is always (ARV × pct) − rehab − fee, no hidden terms", () => {
    const arv = 250000;
    const pct = 0.70;
    const rehab = 25000;
    const fee = 10000;
    const result = calculateWholesaleUnderwrite({
      arv, offerPercentage: pct, rehabEstimate: rehab, assignmentFeeTarget: fee,
      holdingCosts: 0, closingCosts: 0,
    });
    const expected = Math.round(arv * pct) - rehab - fee;
    expect(result.mao).toBe(Math.max(0, expected));
  });
});

// ─── buildValuationWarnings ───────────────────────────────────────────────────

describe("buildValuationWarnings", () => {
  const baseInputs = {
    arv: 300000,
    arvSource: "comps" as const,
    compCount: 3,
    confidence: "high" as const,
    spreadPct: 0.10,
    mao: 170000,
    rehabEstimate: 40000,
    conditionLevel: 3,
  };

  it("returns no warnings for clean inputs", () => {
    const warnings = buildValuationWarnings(baseInputs);
    // May have info-level warnings, but no danger/warn
    const serious = warnings.filter(w => w.severity !== "info");
    expect(serious.length).toBe(0);
  });

  it("warns when ARV is from AVM", () => {
    const warnings = buildValuationWarnings({ ...baseInputs, arvSource: "avm" });
    expect(warnings.some(w => w.code === "ARV_FROM_AVM")).toBe(true);
  });

  it("warns on few comps", () => {
    const warnings = buildValuationWarnings({ ...baseInputs, compCount: 2 });
    expect(warnings.some(w => w.code === "FEW_COMPS")).toBe(true);
  });

  it("warns on low confidence", () => {
    const warnings = buildValuationWarnings({ ...baseInputs, confidence: "low" });
    expect(warnings.some(w => w.code === "LOW_CONFIDENCE")).toBe(true);
  });

  it("warns when spread > 30%", () => {
    const warnings = buildValuationWarnings({ ...baseInputs, spreadPct: 0.35 });
    expect(warnings.some(w => w.code === "HIGH_SPREAD")).toBe(true);
  });

  it("warns when condition is null", () => {
    const warnings = buildValuationWarnings({ ...baseInputs, conditionLevel: null });
    expect(warnings.some(w => w.code === "NO_CONDITION")).toBe(true);
  });

  it("warns when MAO > 70% of ARV", () => {
    const warnings = buildValuationWarnings({ ...baseInputs, mao: 220000 }); // 73% of 300k
    expect(warnings.some(w => w.code === "MAO_HIGH_PCT")).toBe(true);
  });

  it("warns when purchase exceeds MAO", () => {
    const warnings = buildValuationWarnings({ ...baseInputs, purchasePrice: 200000 });
    expect(warnings.some(w => w.code === "OVER_MAO")).toBe(true);
  });

  it("warns on zero rehab with low condition", () => {
    const warnings = buildValuationWarnings({ ...baseInputs, rehabEstimate: 0, conditionLevel: 2 });
    expect(warnings.some(w => w.code === "ZERO_REHAB_LOW_CONDITION")).toBe(true);
  });
});

// ─── buildValuationSnapshot ───────────────────────────────────────────────────

describe("buildValuationSnapshot", () => {
  it("captures all required fields", () => {
    const arvRange = calculateARVRange(threeGoodComps, 1500);
    const confidence = calculateArvConfidence(arvRange.compCount, arvRange.spreadPct);
    const underwrite = calculateWholesaleUnderwrite({ arv: arvRange.arvBase });
    const warnings = buildValuationWarnings({
      arv: arvRange.arvBase,
      arvSource: "comps",
      compCount: arvRange.compCount,
      confidence: confidence.confidence,
      spreadPct: arvRange.spreadPct,
      mao: underwrite.mao,
      rehabEstimate: underwrite.rehabEstimate,
      conditionLevel: 3,
    });

    const snapshot = buildValuationSnapshot({
      arvRange,
      arvUsed: arvRange.arvBase,
      arvSource: "comps",
      conditionLevel: 3,
      conditionAdjPct: -5,
      confidence,
      rehabEstimate: DEFAULTS.rehabEstimate,
      underwrite,
      quickScreen: null,
      warnings,
      calculatedBy: "user-adam",
    });

    expect(snapshot.formulaVersion).toBe(FORMULA_VERSION);
    expect(snapshot.formulaMode).toBe(FORMULA_MODE_WHOLESALE_UNDERWRITE);
    expect(snapshot.arvUsed).toBeGreaterThan(0);
    expect(snapshot.arvSource).toBe("comps");
    expect(snapshot.conditionLevel).toBe(3);
    expect(snapshot.conditionAdjPct).toBe(-5);
    expect(snapshot.confidence).toBeDefined();
    expect(snapshot.rehabEstimateUsed).toBe(DEFAULTS.rehabEstimate);
    expect(snapshot.maoResult).toBeGreaterThan(0);
    expect(snapshot.calculatedAt).toBeDefined();
    expect(snapshot.calculatedBy).toBe("user-adam");
    expect(snapshot.assumptions).toBeDefined();
    expect(snapshot.assumptions.formulaVersion).toBe(FORMULA_VERSION);
  });

  it("uses quick_screen mode when no underwrite", () => {
    const arvRange = calculateARVRange([], 0);
    const confidence = calculateArvConfidence(0, null);
    const screen = calculateQuickScreen(300000);

    const snapshot = buildValuationSnapshot({
      arvRange,
      arvUsed: 300000,
      arvSource: "avm",
      conditionLevel: null,
      conditionAdjPct: null,
      confidence,
      rehabEstimate: 0,
      underwrite: null,
      quickScreen: screen,
      warnings: [],
      calculatedBy: null,
    });

    expect(snapshot.formulaMode).toBe(FORMULA_MODE_QUICK_SCREEN);
    expect(snapshot.maoResult).toBe(screen.maoHigh);
  });
});

// ─── getRehabGuidance ─────────────────────────────────────────────────────────

describe("getRehabGuidance", () => {
  it("returns guidance for each condition level", () => {
    for (let level = 1; level <= 5; level++) {
      const guidance = getRehabGuidance(level);
      expect(guidance.label).toBeTruthy();
      expect(guidance.low).toBeLessThanOrEqual(guidance.high);
      expect(guidance.perSqft.low).toBeLessThanOrEqual(guidance.perSqft.high);
    }
  });

  it("returns default for null condition", () => {
    const guidance = getRehabGuidance(null);
    expect(guidance.label).toBe("Unknown Condition");
  });

  it("level 1 has highest rehab range", () => {
    const level1 = getRehabGuidance(1);
    const level5 = getRehabGuidance(5);
    expect(level1.high).toBeGreaterThan(level5.high);
  });
});

// ─── DEFAULTS validation ──────────────────────────────────────────────────────

describe("DEFAULTS", () => {
  it("offerPercentage is 75%", () => {
    expect(DEFAULTS.offerPercentage).toBe(0.75);
  });

  it("assignmentFeeTarget is $12,000", () => {
    expect(DEFAULTS.assignmentFeeTarget).toBe(12000);
  });

  it("rehabEstimate is $40,000", () => {
    expect(DEFAULTS.rehabEstimate).toBe(40000);
  });

  it("quickScreen range is 50-65%", () => {
    expect(DEFAULTS.quickScreenLow).toBe(0.50);
    expect(DEFAULTS.quickScreenHigh).toBe(0.65);
  });
});

// ─── CONDITION_ADJ_MAP ────────────────────────────────────────────────────────

describe("CONDITION_ADJ_MAP", () => {
  it("covers levels 1-5", () => {
    expect(CONDITION_ADJ_MAP[1]).toBe(-0.20);
    expect(CONDITION_ADJ_MAP[2]).toBe(-0.12);
    expect(CONDITION_ADJ_MAP[3]).toBe(-0.05);
    expect(CONDITION_ADJ_MAP[4]).toBe(0.00);
    expect(CONDITION_ADJ_MAP[5]).toBe(0.05);
  });

  it("is monotonically increasing", () => {
    for (let i = 1; i < 5; i++) {
      expect(CONDITION_ADJ_MAP[i]).toBeLessThan(CONDITION_ADJ_MAP[i + 1]);
    }
  });
});

// ─── Regression: Real Spokane deal scenario ───────────────────────────────────

describe("real deal scenario: Spokane $280K ARV", () => {
  const spokaneDeal = {
    arv: 280000,
    offerPercentage: 0.75,
    rehabEstimate: 35000,
    assignmentFeeTarget: 12000,
    holdingCosts: 4500,
    closingCosts: 5000,
  };

  it("MAO makes business sense", () => {
    const result = calculateWholesaleUnderwrite(spokaneDeal);
    // MAO = (280k × 0.75) - 35k - 12k = 210k - 47k = 163k
    expect(result.mao).toBe(163000);
    expect(result.maxAllowable).toBe(210000);
  });

  it("full deal economics are consistent", () => {
    const result = calculateWholesaleUnderwrite({
      ...spokaneDeal,
      purchasePriceOverride: 160000,
    });
    // totalCosts = 160k + 35k + 4.5k + 5k = 204,500
    expect(result.totalCosts).toBe(204500);
    // grossProfit = 280k - 204.5k = 75,500
    expect(result.grossProfit).toBe(75500);
    // netProfit = 75.5k - 12k = 63,500
    expect(result.netProfit).toBe(63500);
    // ROI ≈ 36.9%
    expect(result.roi).toBeGreaterThan(35);
  });
});
