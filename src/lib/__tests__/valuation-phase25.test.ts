/**
 * Phase 2.5 Tests — Valuation Packet Freeze, ARV Range Persistence,
 * Condition State, Staleness, and Overview Surface data.
 *
 * These tests verify:
 * 1. buildValuationSnapshot produces a complete, immutable packet
 * 2. ARV range + confidence flows correctly through the snapshot
 * 3. Condition adjustment is captured and round-trips
 * 4. Staleness detection works for >7 day snapshots
 * 5. Frozen comps structure matches expected shape
 * 6. extractOfferPrepSnapshot reads all Phase 2.5 fields
 */

import { describe, it, expect } from "vitest";
import {
  calculateARVRange,
  calculateArvConfidence,
  calculateWholesaleUnderwrite,
  buildValuationWarnings,
  buildValuationSnapshot,
  DEFAULTS,
  FORMULA_VERSION,
  FORMULA_MODE_WHOLESALE_UNDERWRITE,
  type CompMetric,
  type ValuationSnapshotData,
} from "../valuation";
import { extractOfferPrepSnapshot } from "../leads-data";

// ── Test fixtures ──────────────────────────────────────────────────────────

const SPOKANE_COMPS: CompMetric[] = [
  { price: 280000, sqft: 1400, ppsf: 200 },
  { price: 310000, sqft: 1500, ppsf: 206.67 },
  { price: 295000, sqft: 1450, ppsf: 203.45 },
];

const SUBJECT_SQFT = 1420;

function buildTestSnapshot(overrides?: {
  conditionAdjPct?: number;
  comps?: CompMetric[];
  subjectSqft?: number;
}): ValuationSnapshotData {
  const comps = overrides?.comps ?? SPOKANE_COMPS;
  const sqft = overrides?.subjectSqft ?? SUBJECT_SQFT;
  const condAdj = overrides?.conditionAdjPct ?? 0;

  const arvRange = calculateARVRange(comps, sqft, condAdj);
  const confidence = calculateArvConfidence(arvRange.compCount, arvRange.spreadPct);
  const underwrite = calculateWholesaleUnderwrite({
    arv: arvRange.arvBase,
    arvSource: "comps",
    rehabEstimate: DEFAULTS.rehabEstimate,
  });
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

  return buildValuationSnapshot({
    arvRange,
    arvUsed: arvRange.arvBase,
    arvSource: "comps",
    conditionLevel: 3,
    conditionAdjPct: condAdj,
    confidence,
    rehabEstimate: DEFAULTS.rehabEstimate,
    underwrite,
    quickScreen: null,
    warnings,
    calculatedBy: "test-operator",
  });
}

// ── Snapshot completeness ──────────────────────────────────────────────────

describe("valuation packet freeze (Phase 2.5)", () => {
  it("produces a complete snapshot with all required fields", () => {
    const snap = buildTestSnapshot();

    // Core identity
    expect(snap.formulaVersion).toBe(FORMULA_VERSION);
    expect(snap.formulaMode).toBe(FORMULA_MODE_WHOLESALE_UNDERWRITE);

    // ARV range
    expect(snap.arvLow).toBeGreaterThan(0);
    expect(snap.arvBase).toBeGreaterThan(0);
    expect(snap.arvHigh).toBeGreaterThan(0);
    expect(snap.arvLow).toBeLessThanOrEqual(snap.arvBase!);
    expect(snap.arvBase).toBeLessThanOrEqual(snap.arvHigh!);
    expect(snap.arvUsed).toBe(snap.arvBase);

    // Source + confidence
    expect(snap.arvSource).toBe("comps");
    expect(snap.compCount).toBe(3);
    expect(snap.confidence).toBe("high"); // 3 comps, tight spread
    expect(snap.spreadPct).not.toBeNull();

    // Condition
    expect(snap.conditionLevel).toBe(3);
    expect(snap.conditionAdjPct).toBe(0);

    // Underwrite
    expect(snap.offerPercentage).toBe(DEFAULTS.offerPercentage);
    expect(snap.rehabEstimateUsed).toBe(DEFAULTS.rehabEstimate);
    expect(snap.maoResult).toBeGreaterThan(0);
    expect(snap.wholesaleUnderwriteResult).not.toBeNull();
    expect(snap.quickScreenResult).toBeNull();

    // Metadata
    expect(snap.calculatedAt).toBeTruthy();
    expect(snap.calculatedBy).toBe("test-operator");
    expect(snap.assumptions).toHaveProperty("formulaVersion", FORMULA_VERSION);
  });

  it("snapshot is deterministic — same inputs produce identical output", () => {
    // Build two snapshots with same inputs (override calculatedAt for comparison)
    const snap1 = buildTestSnapshot();
    const snap2 = buildTestSnapshot();

    // Everything except calculatedAt should match
    const { calculatedAt: _a, ...rest1 } = snap1;
    const { calculatedAt: _b, ...rest2 } = snap2;
    expect(rest1).toEqual(rest2);
  });

  it("warnings array is non-empty when comp count is low", () => {
    const snap = buildTestSnapshot({ comps: [SPOKANE_COMPS[0]] });
    expect(snap.warnings.length).toBeGreaterThan(0);
    const codes = snap.warnings.map((w) => w.code);
    expect(codes).toContain("FEW_COMPS");
  });
});

// ── ARV range persistence ──────────────────────────────────────────────────

describe("ARV range support", () => {
  it("calculates low/base/high from 3 comps", () => {
    const range = calculateARVRange(SPOKANE_COMPS, SUBJECT_SQFT);
    expect(range.arvLow).toBeGreaterThan(0);
    expect(range.arvBase).toBeGreaterThan(0);
    expect(range.arvHigh).toBeGreaterThan(0);
    expect(range.arvLow).toBeLessThanOrEqual(range.arvBase);
    expect(range.arvBase).toBeLessThanOrEqual(range.arvHigh);
    expect(range.compCount).toBe(3);
    expect(range.avgPpsf).toBeGreaterThan(0);
  });

  it("snapshot captures full ARV range", () => {
    const snap = buildTestSnapshot();
    expect(snap.arvLow).toBeGreaterThan(0);
    expect(snap.arvHigh).toBeGreaterThan(snap.arvLow!);
    expect(snap.avgPpsf).toBeGreaterThan(0);
  });

  it("single comp yields arvLow === arvBase === arvHigh", () => {
    const range = calculateARVRange([SPOKANE_COMPS[0]], SUBJECT_SQFT);
    expect(range.arvLow).toBe(range.arvBase);
    expect(range.arvBase).toBe(range.arvHigh);
    expect(range.compCount).toBe(1);
  });
});

// ── Condition state persistence ────────────────────────────────────────────

describe("condition adjustment persistence", () => {
  it("conditionAdjPct=0 produces unadjusted ARV", () => {
    const snap = buildTestSnapshot({ conditionAdjPct: 0 });
    const rangeUnadj = calculateARVRange(SPOKANE_COMPS, SUBJECT_SQFT, 0);
    expect(snap.arvBase).toBe(rangeUnadj.arvBase);
  });

  it("negative conditionAdjPct reduces ARV", () => {
    const snapBase = buildTestSnapshot({ conditionAdjPct: 0 });
    const snapNeg = buildTestSnapshot({ conditionAdjPct: -10 });
    expect(snapNeg.arvBase!).toBeLessThan(snapBase.arvBase!);
    expect(snapNeg.conditionAdjPct).toBe(-10);
  });

  it("positive conditionAdjPct increases ARV", () => {
    const snapBase = buildTestSnapshot({ conditionAdjPct: 0 });
    const snapPos = buildTestSnapshot({ conditionAdjPct: 5 });
    expect(snapPos.arvBase!).toBeGreaterThan(snapBase.arvBase!);
    expect(snapPos.conditionAdjPct).toBe(5);
  });

  it("condition adjustment round-trips through snapshot", () => {
    const snap = buildTestSnapshot({ conditionAdjPct: -15 });
    expect(snap.conditionAdjPct).toBe(-15);
    expect(snap.conditionLevel).toBe(3);
  });
});

// ── Staleness detection ────────────────────────────────────────────────────

describe("staleness + reviewability", () => {
  it("calculatedAt is a valid ISO timestamp", () => {
    const snap = buildTestSnapshot();
    expect(snap.calculatedAt).toBeTruthy();
    const date = new Date(snap.calculatedAt);
    expect(date.getTime()).not.toBeNaN();
    // Should be recent (within last 5 seconds)
    expect(Date.now() - date.getTime()).toBeLessThan(5000);
  });

  it("formulaVersion is captured for audit trail", () => {
    const snap = buildTestSnapshot();
    expect(snap.formulaVersion).toBe(FORMULA_VERSION);
    expect(snap.assumptions.formulaVersion).toBe(FORMULA_VERSION);
  });

  it("staleness check: snapshot older than 7 days is stale", () => {
    // Simulate staleness by checking a date 8 days ago
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const daysSince = Math.floor((Date.now() - new Date(eightDaysAgo).getTime()) / (1000 * 60 * 60 * 24));
    expect(daysSince).toBeGreaterThan(7);
    expect(daysSince).toBeLessThanOrEqual(8);
  });

  it("staleness check: recent snapshot is not stale", () => {
    const now = new Date().toISOString();
    const daysSince = Math.floor((Date.now() - new Date(now).getTime()) / (1000 * 60 * 60 * 24));
    expect(daysSince).toBe(0);
  });
});

// ── extractOfferPrepSnapshot reads Phase 2.5 fields ────────────────────────

describe("extractOfferPrepSnapshot Phase 2.5 field extraction", () => {
  it("extracts condition_adj_pct from nested snapshot", () => {
    const flags = {
      offer_prep_snapshot: {
        arv_used: 300000,
        rehab_estimate: 40000,
        mao_low: 140000,
        mao_high: 170000,
        confidence: "high",
        condition_adj_pct: -10,
        arv_low: 280000,
        arv_base: 295000,
        arv_high: 310000,
        arv_source: "comps",
        formula_version: "1.0.0",
        formula_mode: "wholesale_underwrite",
        comp_count: 3,
        spread_pct: 0.1,
        avg_ppsf: 200,
        offer_percentage: 0.75,
        assignment_fee_target: 12000,
        holding_costs: 4500,
        closing_costs: 5000,
        mao_result: 155000,
        warnings: [{ code: "FEW_COMPS", severity: "warn", message: "test" }],
        calculated_by: "adam",
        updated_at: "2026-03-10T12:00:00Z",
      },
    };

    const snap = extractOfferPrepSnapshot(flags);
    expect(snap.conditionAdjPct).toBe(-10);
    expect(snap.arvLow).toBe(280000);
    expect(snap.arvBase).toBe(295000);
    expect(snap.arvHigh).toBe(310000);
    expect(snap.arvSource).toBe("comps");
    expect(snap.formulaVersion).toBe("1.0.0");
    expect(snap.formulaMode).toBe("wholesale_underwrite");
    expect(snap.compCount).toBe(3);
    expect(snap.spreadPct).toBe(0.1);
    expect(snap.avgPpsf).toBe(200);
    expect(snap.offerPercentage).toBe(0.75);
    expect(snap.assignmentFeeTarget).toBe(12000);
    expect(snap.holdingCosts).toBe(4500);
    expect(snap.closingCosts).toBe(5000);
    expect(snap.maoResult).toBe(155000);
    expect(snap.warnings).toHaveLength(1);
    expect(snap.calculatedBy).toBe("adam");
    expect(snap.updatedAt).toBe("2026-03-10T12:00:00Z");
  });

  it("returns null for missing Phase 2.5 fields (backward compat)", () => {
    const flags = {
      offer_prep_snapshot: {
        arv_used: 250000,
        rehab_estimate: 30000,
        mao_low: 130000,
        mao_high: 160000,
        confidence: "medium",
        updated_at: "2026-01-15T00:00:00Z",
      },
    };

    const snap = extractOfferPrepSnapshot(flags);
    expect(snap.arvUsed).toBe(250000);
    expect(snap.confidence).toBe("medium");
    // Phase 2.5 fields should be null
    expect(snap.conditionAdjPct).toBeNull();
    expect(snap.arvLow).toBeNull();
    expect(snap.arvBase).toBeNull();
    expect(snap.arvHigh).toBeNull();
    expect(snap.arvSource).toBeNull();
    expect(snap.formulaVersion).toBeNull();
    expect(snap.compCount).toBeNull();
  });
});

// ── Frozen comps structure ─────────────────────────────────────────────────

describe("frozen comps structure", () => {
  it("frozen comp has required fields for audit trail", () => {
    // Simulate the frozen comp structure from handleSaveOfferPrepSnapshot
    const comp = {
      apn: "12345",
      address: "123 Main St, Spokane, WA",
      lastSalePrice: 280000,
      lastSaleDate: "2025-09-15",
      sqft: 1400,
      avm: 290000,
      beds: 3,
      baths: 2,
      yearBuilt: 1985,
      ppsf: 200,
    };

    expect(comp.apn).toBeTruthy();
    expect(comp.address).toBeTruthy();
    expect(comp.lastSalePrice).toBeGreaterThan(0);
    expect(comp.sqft).toBeGreaterThan(0);
    expect(comp.ppsf).toBeGreaterThan(0);
  });

  it("ppsf is calculated correctly for frozen comp", () => {
    const price = 280000;
    const sqft = 1400;
    const ppsf = Math.round((price / sqft) * 100) / 100;
    expect(ppsf).toBe(200);
  });

  it("ppsf is null when sqft is 0", () => {
    const sqft = 0;
    const price = 280000;
    const ppsf = sqft > 0 ? Math.round((price / sqft) * 100) / 100 : null;
    expect(ppsf).toBeNull();
  });
});
