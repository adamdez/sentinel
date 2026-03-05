/**
 * Sentinel AI Distress Scoring Engine v2.2
 *
 * Primary-Signal-Dominant Formula:
 *   BASE = max(signal_scores) + 0.3 × sum(remaining_signal_scores) + combination_bonus
 *   SIGNAL_SCORE = weight × severity_mult × recency_decay × freshness_mult
 *   Composite = BASE × absentee_amplifier + owner_factors + equity_factors + occupied_penalty
 *
 * v2.2 changes (from v2.1):
 *   - Primary-signal-dominant: strongest signal contributes ~70%, prevents weak stacking
 *   - Signal freshness multiplier: active=1.0, unknown=0.6, stale=0.3, resolved=0
 *   - Combination bonuses: deceased+tax_lien=+15, deceased+absentee=+10, etc.
 *   - New signal weights: underwater=30, tired_landlord=18
 *   - Removed phantom signals: no fake absentee/vacant for clean properties
 *   - Removed AI boost: historicalConversionRate=0 until real conversion data exists
 *   - Normalized absentee severity=5 everywhere
 *   - Score transparency: factors include primary signal identification
 *
 * Domain: Scoring Domain — config-driven, versioned, deterministic, replayable.
 * Writes only scoring_records. Never mutates workflow.
 */

import type { DistressType, AIScore, SignalStatus } from "./types";

export const SCORING_MODEL_VERSION = "v2.2";

// ── Signal Base Weights ─────────────────────────────────────────────
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
  condemned: 20,
  underwater: 30,
  tired_landlord: 18,
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

// ── Stacking Bonus (legacy — used by UI score badge for display) ─────
// v2.2 scoring uses combination bonuses instead, but these are exported
// for backwards compatibility with ai-score-badge.tsx display logic.
export const STACKING_THRESHOLDS = [
  { signals: 2, bonus: 6 },
  { signals: 3, bonus: 14 },
  { signals: 4, bonus: 22 },
  { signals: 5, bonus: 30 },
];

export function getStackingBonus(signalCount: number): number {
  const applicable = STACKING_THRESHOLDS.filter(
    (t) => signalCount >= t.signals
  );
  return applicable.length > 0
    ? applicable[applicable.length - 1].bonus
    : 0;
}

// ── Combination Bonuses ─────────────────────────────────────────────
// Specific high-value signal pairs that indicate exceptional motivation.
const COMBINATION_BONUSES: { types: [DistressType, DistressType]; bonus: number }[] = [
  { types: ["probate", "tax_lien"], bonus: 15 },          // #1 target: must settle estate + tax clock ticking
  { types: ["probate", "absentee"], bonus: 10 },           // heir doesn't live there, wants quick resolution
  { types: ["pre_foreclosure", "vacant"], bonus: 10 },     // abandoned + foreclosing = desperate
  { types: ["divorce", "absentee"], bonus: 8 },            // split household, one party gone
  { types: ["underwater", "pre_foreclosure"], bonus: 12 }, // negative equity + foreclosure = short sale candidate
  { types: ["underwater", "tax_lien"], bonus: 12 },        // underwater + tax problems = maximum motivation
  { types: ["tired_landlord", "code_violation"], bonus: 8 },// landlord burnout + violations = wants out
  { types: ["probate", "vacant"], bonus: 8 },              // deceased + nobody living there
];

// ── Signal Freshness Multiplier ─────────────────────────────────────
// Rewards signals that have been recently verified as still active.
const FRESHNESS_MULTIPLIERS: Record<SignalStatus, number> = {
  active: 1.0,    // verified within 30 days
  unknown: 0.6,   // never verified or verification expired
  expired: 0.3,   // aged out
  resolved: 0.0,  // confirmed resolved — excluded from scoring
};

// ── Owner Factor Weights ────────────────────────────────────────────
export const OWNER_FACTORS = {
  absentee: 10,
  corporate: -3,
  inherited: 8,
  elderly: 4,
  outOfState: 6,
};

// ── Absentee Amplifier ──────────────────────────────────────────────
const ABSENTEE_AMPLIFIER = 1.3;

// ── Equity Factor Weights ───────────────────────────────────────────
export const EQUITY_WEIGHT = 0.15;
const COMP_RATIO_WEIGHT = 0.10;

// ── Score Label Cutoffs ─────────────────────────────────────────────
export const SCORE_CUTOFFS = {
  platinum: 85,
  gold: 65,
  silver: 40,
  bronze: 0,
} as const;

export const MIN_STORE_SCORE = 30;

// ── Helper Functions ────────────────────────────────────────────────

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

export function getScoreLabel(score: number): AIScore["label"] {
  if (score >= 85) return "platinum";
  if (score >= 65) return "gold";
  if (score >= 40) return "silver";
  return "bronze";
}

export function getScoreLabelTag(score: number): string {
  return `score-${getScoreLabel(score)}`;
}

// ── Input / Output Types ────────────────────────────────────────────

export interface ScoringInput {
  signals: {
    type: DistressType;
    severity: number;
    daysSinceEvent: number;
    /** Signal lifecycle status for freshness multiplier. Defaults to "unknown". */
    status?: SignalStatus;
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
  /** Set to 0 until real conversion data exists. */
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
  /** v2.2: which signal type dominated the score */
  primarySignal: string | null;
  /** v2.2: combination bonuses that fired */
  combinationBonuses: { types: string; bonus: number }[];
}

// ── Scoring Engine v2.2 ─────────────────────────────────────────────

export function computeScore(input: ScoringInput): ScoringOutput {
  const factors: ScoringOutput["factors"] = [];
  const firedCombos: ScoringOutput["combinationBonuses"] = [];

  // ── 1. Compute individual signal scores ───────────────────────────
  // Exclude resolved signals entirely.
  const scoredSignals = input.signals
    .filter((s) => (s.status ?? "unknown") !== "resolved")
    .map((signal) => {
      const weight = SIGNAL_WEIGHTS[signal.type] ?? 10;
      const severity = getSeverityMultiplier(signal.severity);
      const recency = getRecencyDecay(signal.daysSinceEvent);
      const freshness = FRESHNESS_MULTIPLIERS[signal.status ?? "unknown"];

      const score = weight * severity * recency * freshness;

      return {
        type: signal.type,
        weight,
        severity,
        recency,
        freshness,
        score,
        daysSinceEvent: signal.daysSinceEvent,
        status: signal.status ?? "unknown",
      };
    })
    .sort((a, b) => b.score - a.score); // sort descending by score

  // ── 2. Primary-signal-dominant formula ─────────────────────────────
  // Strongest signal contributes 100%, remaining contribute 30% each.
  // Prevents 5 weak signals from outscoring 1 strong signal.
  let baseSignalScore = 0;
  let primarySignal: string | null = null;
  let bestSeverity = 0;
  let bestRecency = 1;

  if (scoredSignals.length > 0) {
    const primary = scoredSignals[0];
    primarySignal = primary.type;
    baseSignalScore = primary.score;
    bestSeverity = primary.severity;
    bestRecency = primary.recency;

    factors.push({
      name: primary.type,
      value: primary.weight,
      contribution: Math.round(primary.score * 10) / 10,
    });

    // Secondary signals contribute at 30%
    for (let i = 1; i < scoredSignals.length; i++) {
      const s = scoredSignals[i];
      const secondaryContribution = s.score * 0.3;
      baseSignalScore += secondaryContribution;

      bestSeverity = Math.max(bestSeverity, s.severity);
      bestRecency = Math.min(bestRecency, s.recency);

      factors.push({
        name: s.type,
        value: s.weight,
        contribution: Math.round(secondaryContribution * 10) / 10,
      });
    }
  }

  // ── 3. Combination Bonuses ─────────────────────────────────────────
  // Replace generic stacking bonus with targeted combination bonuses.
  const signalTypes = new Set(scoredSignals.map((s) => s.type));
  let combinationBonus = 0;

  for (const combo of COMBINATION_BONUSES) {
    if (signalTypes.has(combo.types[0]) && signalTypes.has(combo.types[1])) {
      combinationBonus += combo.bonus;
      firedCombos.push({
        types: `${combo.types[0]}+${combo.types[1]}`,
        bonus: combo.bonus,
      });
    }
  }

  if (combinationBonus > 0) {
    factors.push({
      name: "combination_bonus",
      value: firedCombos.length,
      contribution: combinationBonus,
    });
  }

  // ── 4. Absentee Amplifier ──────────────────────────────────────────
  const hasNonAbsenteeSignal = scoredSignals.some((s) => s.type !== "absentee");
  const absenteeAmplifier =
    input.ownerFlags.absentee && hasNonAbsenteeSignal ? ABSENTEE_AMPLIFIER : 1.0;
  if (absenteeAmplifier > 1.0) {
    factors.push({
      name: "absentee_amplifier",
      value: absenteeAmplifier,
      contribution: Math.round(baseSignalScore * (absenteeAmplifier - 1)),
    });
  }

  // ── 5. Occupied-owner penalty ──────────────────────────────────────
  const isDeceased = signalTypes.has("probate") || input.ownerFlags.inherited;
  const isAbsentee = input.ownerFlags.absentee || input.ownerFlags.outOfState;
  const occupiedPenalty = (!isAbsentee && !isDeceased) ? -15 : 0;
  if (occupiedPenalty < 0) {
    factors.push({ name: "occupied_owner_penalty", value: occupiedPenalty, contribution: occupiedPenalty });
  }

  // ── 6. Owner Factors ──────────────────────────────────────────────
  let ownerFactorScore = 0;
  if (input.ownerFlags.absentee) ownerFactorScore += OWNER_FACTORS.absentee;
  if (input.ownerFlags.corporate) ownerFactorScore += OWNER_FACTORS.corporate;
  if (input.ownerFlags.inherited) ownerFactorScore += OWNER_FACTORS.inherited;
  if (input.ownerFlags.elderly) ownerFactorScore += OWNER_FACTORS.elderly;
  if (input.ownerFlags.outOfState) ownerFactorScore += OWNER_FACTORS.outOfState;

  if (ownerFactorScore !== 0) {
    factors.push({ name: "owner_factors", value: ownerFactorScore, contribution: ownerFactorScore });
  }

  // ── 7. Equity Factors ─────────────────────────────────────────────
  const equityContribution = input.equityPercent * EQUITY_WEIGHT;
  const compContribution = input.compRatio * COMP_RATIO_WEIGHT * 100;
  const equityFactorScore = equityContribution + compContribution;
  factors.push({ name: "equity", value: input.equityPercent, contribution: Math.round(equityContribution * 10) / 10 });
  factors.push({ name: "comp_ratio", value: input.compRatio, contribution: Math.round(compContribution * 10) / 10 });

  // ── 8. AI Boost (disabled until real conversion data) ──────────────
  const aiBoost = Math.round(input.historicalConversionRate * 15);
  if (aiBoost > 0) {
    factors.push({ name: "ai_boost", value: input.historicalConversionRate, contribution: aiBoost });
  }

  // ── 9. Composite Score ────────────────────────────────────────────
  const raw =
    baseSignalScore * absenteeAmplifier +
    combinationBonus +
    ownerFactorScore +
    equityFactorScore +
    aiBoost +
    occupiedPenalty;

  const composite = Math.min(Math.max(Math.round(raw), 0), 100);

  // ── Derived Scores ────────────────────────────────────────────────
  const motivationScore = Math.min(
    Math.round(baseSignalScore * bestRecency * 1.2),
    100
  );
  const dealScore = Math.min(
    Math.round(equityFactorScore * 2 + combinationBonus * 0.5),
    100
  );

  return {
    composite,
    baseSignalScore: Math.round(baseSignalScore),
    severityMultiplier: bestSeverity,
    recencyDecay: Math.round(bestRecency * 100) / 100,
    stackingBonus: combinationBonus, // v2.2: renamed semantically but kept for backwards compat
    ownerFactorScore,
    equityFactorScore: Math.round(equityFactorScore * 10) / 10,
    aiBoost,
    motivationScore,
    dealScore,
    label: getScoreLabel(composite),
    modelVersion: SCORING_MODEL_VERSION,
    factors,
    primarySignal,
    combinationBonuses: firedCombos,
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
