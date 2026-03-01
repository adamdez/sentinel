/**
 * Sentinel AI Distress Scoring Engine v2.1
 *
 * Composite = (BaseSignalScore × AbsenteeAmplifier × SeverityMultiplier × RecencyDecay)
 *           + StackingBonus + OwnerFactors + EquityFactors + AIBoost
 *
 * v2.1 changes:
 *   - Absentee weight raised 10 → 22 (on par with tax_lien)
 *   - Absentee owner factor raised 5 → 10 (highest positive factor)
 *   - Absentee amplifier: 1.3× on base signal when absentee + other signals
 *   - Tier labels: A (75+), B (50-74), C (30-49), D (<30)
 *
 * Domain: Scoring Domain — config-driven, versioned, deterministic, replayable.
 * Writes only scoring_records. Never mutates workflow.
 */

import type { DistressType, AIScore } from "./types";
import { blendHeatScore, PREDICTIVE_WEIGHT, DETERMINISTIC_WEIGHT } from "./scoring-predictive";

export const SCORING_MODEL_VERSION = "v2.1";

// ── Signal Base Weights ─────────────────────────────────────────────
// v2.1: Absentee raised from 10 → 22 — absentee is the precondition
// that makes every other distress signal convert.
export const SIGNAL_WEIGHTS: Record<DistressType, number> = {
  probate: 28,
  pre_foreclosure: 26,
  tax_lien: 22,
  code_violation: 14,
  vacant: 12,
  divorce: 20,
  bankruptcy: 24,
  fsbo: 16,
  absentee: 22,
  inherited: 25,
  water_shutoff: 35,
};

// ── Severity Multiplier Tiers (config-driven) ───────────────────────
const SEVERITY_TIERS: { min: number; max: number; multiplier: number }[] = [
  { min: 0, max: 2, multiplier: 1.0 },
  { min: 3, max: 5, multiplier: 1.25 },
  { min: 6, max: 8, multiplier: 1.5 },
  { min: 9, max: 10, multiplier: 1.8 },
];

// ── Recency Decay ───────────────────────────────────────────────────
const DECAY_LAMBDA = 0.015; // ~46-day half-life
const MAX_RECENCY_DAYS = 365;

// ── Stacking Bonus (multiple overlapping distress signals) ──────────
const STACKING_THRESHOLDS = [
  { signals: 2, bonus: 6 },
  { signals: 3, bonus: 14 },
  { signals: 4, bonus: 22 },
  { signals: 5, bonus: 30 },
];

// ── Owner Factor Weights ────────────────────────────────────────────
// v2.1: Absentee raised from 5 → 10 — strongest positive owner factor.
const OWNER_FACTORS = {
  absentee: 10,
  corporate: -3,
  inherited: 8,
  elderly: 4,
  outOfState: 6,
};

// ── Absentee Amplifier ──────────────────────────────────────────────
// When absentee combines with ANY other distress signal, the entire
// base signal score is multiplied by this factor. Absentee is the
// precondition that makes all other signals convert at higher rates.
const ABSENTEE_AMPLIFIER = 1.3;

// ── Equity Factor Weights ───────────────────────────────────────────
const EQUITY_WEIGHT = 0.15;
const COMP_RATIO_WEIGHT = 0.10;

export function getSeverityMultiplier(severity: number): number {
  const tier = SEVERITY_TIERS.find(
    (t) => severity >= t.min && severity <= t.max
  );
  return tier?.multiplier ?? 1.0;
}

export function getRecencyDecay(daysSinceEvent: number): number {
  const clamped = Math.min(Math.max(daysSinceEvent, 0), MAX_RECENCY_DAYS);
  return Math.exp(-DECAY_LAMBDA * clamped);
}

export function getStackingBonus(signalCount: number): number {
  const applicable = STACKING_THRESHOLDS.filter(
    (t) => signalCount >= t.signals
  );
  return applicable.length > 0
    ? applicable[applicable.length - 1].bonus
    : 0;
}

export interface ScoringInput {
  signals: {
    type: DistressType;
    severity: number;
    daysSinceEvent: number;
  }[];
  ownerFlags: {
    absentee?: boolean;
    corporate?: boolean;
    inherited?: boolean;
    elderly?: boolean;
    outOfState?: boolean;
  };
  equityPercent: number;
  compRatio: number;
  historicalConversionRate: number;
}

export interface ScoringOutput {
  composite: number;
  baseSignalScore: number;
  severityMultiplier: number;
  recencyDecay: number;
  stackingBonus: number;
  ownerFactorScore: number;
  equityFactorScore: number;
  aiBoost: number;
  motivationScore: number;
  dealScore: number;
  label: AIScore["label"];
  modelVersion: string;
  factors: { name: string; value: number; contribution: number }[];
}

export function computeScore(input: ScoringInput): ScoringOutput {
  const factors: ScoringOutput["factors"] = [];

  // ── 1. Base Signal Score ──────────────────────────────────────────
  let baseSignalScore = 0;
  let weightedSeverity = 0;
  let weightedRecency = 1;

  for (const signal of input.signals) {
    const weight = SIGNAL_WEIGHTS[signal.type] ?? 10;
    const severity = getSeverityMultiplier(signal.severity);
    const recency = getRecencyDecay(signal.daysSinceEvent);

    const contribution = weight * severity * recency;
    baseSignalScore += contribution;

    weightedSeverity = Math.max(weightedSeverity, severity);
    weightedRecency = Math.min(weightedRecency, recency);

    factors.push({
      name: signal.type,
      value: weight,
      contribution: Math.round(contribution * 10) / 10,
    });
  }

  // ── 2. Stacking Bonus ─────────────────────────────────────────────
  const stackingBonus = getStackingBonus(input.signals.length);
  if (stackingBonus > 0) {
    factors.push({ name: "stacking_bonus", value: input.signals.length, contribution: stackingBonus });
  }

  // ── 2b. Absentee Amplifier ──────────────────────────────────────
  // When absentee is flagged AND there's at least one OTHER distress
  // signal, amplify the base signal score by 1.3×. Absentee alone
  // doesn't get the amplifier — it needs a co-occurring signal.
  const hasNonAbsenteeSignal = input.signals.some((s) => s.type !== "absentee");
  const absenteeAmplifier =
    input.ownerFlags.absentee && hasNonAbsenteeSignal ? ABSENTEE_AMPLIFIER : 1.0;
  if (absenteeAmplifier > 1.0) {
    factors.push({ name: "absentee_amplifier", value: absenteeAmplifier, contribution: Math.round(baseSignalScore * (absenteeAmplifier - 1)) });
  }

  // ── 3. Owner Factors ──────────────────────────────────────────────
  let ownerFactorScore = 0;
  if (input.ownerFlags.absentee) ownerFactorScore += OWNER_FACTORS.absentee;
  if (input.ownerFlags.corporate) ownerFactorScore += OWNER_FACTORS.corporate;
  if (input.ownerFlags.inherited) ownerFactorScore += OWNER_FACTORS.inherited;
  if (input.ownerFlags.elderly) ownerFactorScore += OWNER_FACTORS.elderly;
  if (input.ownerFlags.outOfState) ownerFactorScore += OWNER_FACTORS.outOfState;

  if (ownerFactorScore !== 0) {
    factors.push({ name: "owner_factors", value: ownerFactorScore, contribution: ownerFactorScore });
  }

  // ── 4. Equity Factors ─────────────────────────────────────────────
  const equityContribution = input.equityPercent * EQUITY_WEIGHT;
  const compContribution = input.compRatio * COMP_RATIO_WEIGHT * 100;
  const equityFactorScore = equityContribution + compContribution;
  factors.push({ name: "equity", value: input.equityPercent, contribution: Math.round(equityContribution * 10) / 10 });
  factors.push({ name: "comp_ratio", value: input.compRatio, contribution: Math.round(compContribution * 10) / 10 });

  // ── 5. AI Boost (historical conversion patterns) ──────────────────
  const aiBoost = Math.round(input.historicalConversionRate * 15);
  if (aiBoost > 0) {
    factors.push({ name: "ai_boost", value: input.historicalConversionRate, contribution: aiBoost });
  }

  // ── 6. Composite Score ────────────────────────────────────────────
  const raw =
    baseSignalScore * absenteeAmplifier * weightedSeverity * weightedRecency +
    stackingBonus +
    ownerFactorScore +
    equityFactorScore +
    aiBoost;

  const composite = Math.min(Math.max(Math.round(raw), 0), 100);

  // ── Derived Scores ────────────────────────────────────────────────
  const motivationScore = Math.min(
    Math.round(baseSignalScore * weightedRecency * 1.2),
    100
  );
  const dealScore = Math.min(
    Math.round(equityFactorScore * 2 + aiBoost + stackingBonus * 0.5),
    100
  );

  return {
    composite,
    baseSignalScore: Math.round(baseSignalScore),
    severityMultiplier: weightedSeverity,
    recencyDecay: Math.round(weightedRecency * 100) / 100,
    stackingBonus,
    ownerFactorScore,
    equityFactorScore: Math.round(equityFactorScore * 10) / 10,
    aiBoost,
    motivationScore,
    dealScore,
    label: getScoreLabel(composite),
    modelVersion: SCORING_MODEL_VERSION,
    factors,
  };
}

export function getScoreLabel(score: number): AIScore["label"] {
  if (score >= 85) return "platinum";
  if (score >= 65) return "gold";
  if (score >= 40) return "silver";
  return "bronze";
}

// ── Tier Classification (v2.1) ────────────────────────────────────
// Used by ingest routes to determine storage tier for prospects.
export type ProspectTier = "A" | "B" | "C" | "D";

export function getTierLabel(score: number): ProspectTier {
  if (score >= 75) return "A";
  if (score >= 50) return "B";
  if (score >= 30) return "C";
  return "D";
}

export const TIER_CUTOFFS = {
  A: 75,  // Elite — agents work immediately
  B: 50,  // Warm — work when A-tier thins out
  C: 30,  // Watch — nurture campaigns, monthly call, mailers
  D: 0,   // Cold — not stored
} as const;

// ── Enhanced V2 Score (with predictive blend) ───────────────────────

export interface ScoringOutputV2 extends ScoringOutput {
  predictiveBlend: number | null;
  blendedComposite: number;
  blendWeights: { deterministic: number; predictive: number };
}

/**
 * Compute the deterministic score and optionally blend with a
 * predictive score from the v2.0 model. If no predictive score is
 * supplied, the deterministic composite is used as-is.
 */
export function computeScoreV2(
  input: ScoringInput,
  predictiveScore: number | null = null
): ScoringOutputV2 {
  const base = computeScore(input);

  const blendedComposite = predictiveScore !== null
    ? blendHeatScore(base.composite, predictiveScore)
    : base.composite;

  return {
    ...base,
    composite: blendedComposite,
    label: getScoreLabel(blendedComposite),
    modelVersion: SCORING_MODEL_VERSION,
    predictiveBlend: predictiveScore,
    blendedComposite,
    blendWeights: {
      deterministic: DETERMINISTIC_WEIGHT,
      predictive: PREDICTIVE_WEIGHT,
    },
  };
}

// ── Follow-up Priority (for My Top Leads) ───────────────────────────
export function computeFollowUpPriority(
  compositeScore: number,
  daysSinceLastContact: number,
  daysUntilFollowUp: number,
  isOverdue: boolean
): number {
  const scoreFactor = compositeScore / 100;
  const urgencyFactor = isOverdue
    ? 1 + Math.min(daysSinceLastContact * 0.1, 0.5)
    : Math.max(1 - daysUntilFollowUp * 0.05, 0.3);
  const contactDecay = 1 + Math.min(daysSinceLastContact * 0.02, 0.4);

  return Math.round(scoreFactor * urgencyFactor * contactDecay * 100);
}
