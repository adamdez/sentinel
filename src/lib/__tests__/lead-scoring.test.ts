import { describe, it, expect } from "vitest";
import {
  computeScore,
  getSeverityMultiplier,
  getRecencyDecay,
  getScoreLabel,
  getStackingBonus,
  computeFollowUpPriority,
  SIGNAL_WEIGHTS,
} from "@/lib/scoring";

// ---------------------------------------------------------------------------
// getSeverityMultiplier
// ---------------------------------------------------------------------------
describe("getSeverityMultiplier", () => {
  it("returns 1.0 for severity 0-2", () => {
    expect(getSeverityMultiplier(0)).toBe(1.0);
    expect(getSeverityMultiplier(1)).toBe(1.0);
    expect(getSeverityMultiplier(2)).toBe(1.0);
  });

  it("returns 1.25 for severity 3-5", () => {
    expect(getSeverityMultiplier(3)).toBe(1.25);
    expect(getSeverityMultiplier(4)).toBe(1.25);
    expect(getSeverityMultiplier(5)).toBe(1.25);
  });

  it("returns 1.5 for severity 6-8", () => {
    expect(getSeverityMultiplier(6)).toBe(1.5);
    expect(getSeverityMultiplier(7)).toBe(1.5);
    expect(getSeverityMultiplier(8)).toBe(1.5);
  });

  it("returns 1.8 for severity 9-10", () => {
    expect(getSeverityMultiplier(9)).toBe(1.8);
    expect(getSeverityMultiplier(10)).toBe(1.8);
  });
});

// ---------------------------------------------------------------------------
// getRecencyDecay
// ---------------------------------------------------------------------------
describe("getRecencyDecay", () => {
  it("returns 1.0 for day 0", () => {
    expect(getRecencyDecay(0)).toBe(1.0);
  });

  it("decays with lambda=0.015", () => {
    const day30 = getRecencyDecay(30);
    const expected = Math.exp(-0.015 * 30);
    expect(day30).toBeCloseTo(expected, 4);
  });

  it("is clamped at 365 days (does not decay further)", () => {
    const day365 = getRecencyDecay(365);
    const day400 = getRecencyDecay(400);
    expect(day365).toBeCloseTo(day400, 6);
  });

  it("monotonically decreases from day 0 to day 365", () => {
    let prev = getRecencyDecay(0);
    for (let d = 30; d <= 365; d += 30) {
      const cur = getRecencyDecay(d);
      expect(cur).toBeLessThanOrEqual(prev);
      prev = cur;
    }
  });
});

// ---------------------------------------------------------------------------
// getScoreLabel
// ---------------------------------------------------------------------------
describe("getScoreLabel", () => {
  it("returns platinum for scores >= 85", () => {
    expect(getScoreLabel(85)).toBe("platinum");
    expect(getScoreLabel(100)).toBe("platinum");
  });

  it("returns gold for scores >= 65 and < 85", () => {
    expect(getScoreLabel(65)).toBe("gold");
    expect(getScoreLabel(84)).toBe("gold");
  });

  it("returns silver for scores >= 40 and < 65", () => {
    expect(getScoreLabel(40)).toBe("silver");
    expect(getScoreLabel(64)).toBe("silver");
  });

  it("returns bronze for scores < 40", () => {
    expect(getScoreLabel(0)).toBe("bronze");
    expect(getScoreLabel(39)).toBe("bronze");
  });
});

// ---------------------------------------------------------------------------
// getStackingBonus
// ---------------------------------------------------------------------------
describe("getStackingBonus", () => {
  it("returns 0 for 0 or 1 signals", () => {
    expect(getStackingBonus(0)).toBe(0);
    expect(getStackingBonus(1)).toBe(0);
  });

  it("returns 6 for 2 signals", () => {
    expect(getStackingBonus(2)).toBe(6);
  });

  it("returns 14 for 3 signals", () => {
    expect(getStackingBonus(3)).toBe(14);
  });

  it("returns 22 for 4 signals", () => {
    expect(getStackingBonus(4)).toBe(22);
  });

  it("returns 30 for 5+ signals", () => {
    expect(getStackingBonus(5)).toBe(30);
    expect(getStackingBonus(8)).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// computeScore — basic
// ---------------------------------------------------------------------------
describe("computeScore", () => {
  const baseInput = {
    signals: [],
    ownerFlags: {},
    equityPercent: 50,
    compRatio: 0.7,
    historicalConversionRate: 0.05,
  };

  it("single signal produces expected score and identifies primary signal", () => {
    const result = computeScore({
      ...baseInput,
      signals: [
        { type: "pre_foreclosure" as const, severity: 5, daysSinceEvent: 0 },
      ],
      ownerFlags: { absentee: true },
    });
    expect(result.composite).toBeGreaterThan(0);
    expect(result.primarySignal).toBe("pre_foreclosure");
  });

  it("resolved signals contribute 0 to score", () => {
    const withActive = computeScore({
      ...baseInput,
      signals: [
        {
          type: "tax_lien" as const,
          severity: 7,
          daysSinceEvent: 10,
          status: "active" as const,
        },
      ],
      ownerFlags: { absentee: true },
    });
    const withResolved = computeScore({
      ...baseInput,
      signals: [
        {
          type: "tax_lien" as const,
          severity: 7,
          daysSinceEvent: 10,
          status: "resolved" as const,
        },
      ],
      ownerFlags: { absentee: true },
    });
    expect(withResolved.composite).toBeLessThan(withActive.composite);
  });

  it("combination bonus fires for probate + tax_lien (+15)", () => {
    const probateOnly = computeScore({
      ...baseInput,
      signals: [
        { type: "probate" as const, severity: 5, daysSinceEvent: 0 },
      ],
      ownerFlags: { absentee: true },
    });
    const combined = computeScore({
      ...baseInput,
      signals: [
        { type: "probate" as const, severity: 5, daysSinceEvent: 0 },
        { type: "tax_lien" as const, severity: 5, daysSinceEvent: 0 },
      ],
      ownerFlags: { absentee: true },
    });
    // The combined score should exceed probate-only by at least the +15 combo bonus
    // (plus stacking bonus), so checking a meaningful gap
    expect(combined.composite).toBeGreaterThan(probateOnly.composite + 10);
  });

  it("absentee amplifier (1.3x) applies when absentee + non-absentee signal", () => {
    const withAbsentee = computeScore({
      ...baseInput,
      signals: [
        { type: "tax_lien" as const, severity: 5, daysSinceEvent: 0 },
      ],
      ownerFlags: { absentee: true },
    });
    const withoutAbsentee = computeScore({
      ...baseInput,
      signals: [
        { type: "tax_lien" as const, severity: 5, daysSinceEvent: 0 },
      ],
      ownerFlags: { absentee: false },
    });
    expect(withAbsentee.composite).toBeGreaterThan(withoutAbsentee.composite);
  });

  it("occupied owner penalty (-15) applies when not absentee and not deceased", () => {
    const result = computeScore({
      ...baseInput,
      signals: [
        { type: "code_violation" as const, severity: 3, daysSinceEvent: 0 },
      ],
      ownerFlags: { absentee: false },
    });
    // Score should reflect the penalty; with a low-severity signal + penalty it
    // should be noticeably low
    expect(result.composite).toBeLessThan(40);
  });

  it("score is clamped between 0 and 100", () => {
    // Very strong signals to push toward 100
    const high = computeScore({
      ...baseInput,
      signals: [
        { type: "probate" as const, severity: 10, daysSinceEvent: 0 },
        { type: "tax_lien" as const, severity: 10, daysSinceEvent: 0 },
        { type: "pre_foreclosure" as const, severity: 10, daysSinceEvent: 0 },
        { type: "vacant" as const, severity: 10, daysSinceEvent: 0 },
        { type: "code_violation" as const, severity: 10, daysSinceEvent: 0 },
      ],
      ownerFlags: { absentee: true, inherited: true },
      equityPercent: 90,
      compRatio: 0.5,
      historicalConversionRate: 0.2,
    });
    expect(high.composite).toBeLessThanOrEqual(100);
    expect(high.composite).toBeGreaterThanOrEqual(0);

    // Minimal / negative-leaning input
    const low = computeScore({
      ...baseInput,
      signals: [],
      ownerFlags: {},
      equityPercent: 0,
      compRatio: 1.2,
      historicalConversionRate: 0,
    });
    expect(low.composite).toBeGreaterThanOrEqual(0);
    expect(low.composite).toBeLessThanOrEqual(100);
  });

  it("same inputs always produce the same output (determinism)", () => {
    const input = {
      ...baseInput,
      signals: [
        { type: "probate" as const, severity: 6, daysSinceEvent: 14 },
        { type: "vacant" as const, severity: 4, daysSinceEvent: 30 },
      ],
      ownerFlags: { absentee: true, inherited: true },
    };
    const a = computeScore(input);
    const b = computeScore(input);
    expect(a.composite).toBe(b.composite);
    expect(a.label).toBe(b.label);
    expect(a.primarySignal).toBe(b.primarySignal);
  });

  it("empty signals array produces very low score", () => {
    const result = computeScore({
      ...baseInput,
      signals: [],
      ownerFlags: {},
      equityPercent: 0,
      compRatio: 0,
      historicalConversionRate: 0,
    });
    // No signals, no equity, no owner factors → composite should be 0
    expect(result.composite).toBe(0);
    expect(result.primarySignal).toBeNull();
    expect(result.baseSignalScore).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeFollowUpPriority
// ---------------------------------------------------------------------------
describe("computeFollowUpPriority", () => {
  it("overdue tasks get higher priority than non-overdue", () => {
    const overdue = computeFollowUpPriority(50, 7, 0, true);
    const notOverdue = computeFollowUpPriority(50, 7, 3, false);
    expect(overdue).toBeGreaterThan(notOverdue);
  });

  it("higher composite score produces higher priority", () => {
    const highScore = computeFollowUpPriority(90, 5, 2, false);
    const lowScore = computeFollowUpPriority(30, 5, 2, false);
    expect(highScore).toBeGreaterThan(lowScore);
  });
});
