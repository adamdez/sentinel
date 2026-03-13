/**
 * Sentinel Valuation Kernel v1.0
 *
 * SINGLE SOURCE OF TRUTH for all MAO / ARV / offer calculations.
 * Every surface that displays a dollar amount derived from ARV or MAO
 * MUST import from this file. No inline formulas allowed.
 *
 * Formula version is tracked so persisted snapshots can be audited
 * against the formula that produced them.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

export const FORMULA_VERSION = "1.0.0";
export const FORMULA_MODE_QUICK_SCREEN = "quick_screen" as const;
export const FORMULA_MODE_WHOLESALE_UNDERWRITE = "wholesale_underwrite" as const;
export type FormulaMode = typeof FORMULA_MODE_QUICK_SCREEN | typeof FORMULA_MODE_WHOLESALE_UNDERWRITE;

/** Company defaults — adjustable per-deal but always explicit */
export const DEFAULTS = {
  offerPercentage: 0.75,
  assignmentFeeTarget: 12_000,
  rehabEstimate: 40_000,
  holdMonths: 3,
  monthlyHoldCost: 1_500,
  closingCosts: 5_000,
  /** Quick-screen uses a wider range for automated lead scoring only */
  quickScreenLow: 0.50,
  quickScreenHigh: 0.65,
} as const;

/** Condition level → ARV adjustment mapping */
export const CONDITION_ADJ_MAP: Record<number, number> = {
  1: -0.20,   // Tear-down / major rehab
  2: -0.12,   // Significant rehab
  3: -0.05,   // Moderate rehab
  4: 0.00,    // Light cosmetic
  5: 0.05,    // Move-in ready
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type ArvConfidence = "low" | "medium" | "high";

export interface CompMetric {
  price: number;
  sqft: number | null;
  ppsf: number | null;
}

export interface ARVRangeResult {
  arvLow: number;
  arvBase: number;
  arvHigh: number;
  avgPpsf: number | null;
  compCount: number;
  spreadPct: number | null;
}

export interface ARVConfidenceResult {
  confidence: ArvConfidence;
  compCount: number;
  spreadPct: number | null;
  reasons: string[];
}

export interface QuickScreenResult {
  maoLow: number;
  maoHigh: number;
  basis: string;
  formulaMode: typeof FORMULA_MODE_QUICK_SCREEN;
  formulaVersion: string;
}

export interface WholesaleUnderwriteResult {
  arv: number;
  arvSource: "comps" | "avm" | "manual";
  offerPercentage: number;
  maxAllowable: number;
  rehabEstimate: number;
  assignmentFeeTarget: number;
  holdingCosts: number;
  closingCosts: number;
  mao: number;
  totalCosts: number;
  grossProfit: number;
  netProfit: number;
  roi: number | null;
  formulaMode: typeof FORMULA_MODE_WHOLESALE_UNDERWRITE;
  formulaVersion: string;
}

export interface ValuationWarning {
  code: string;
  severity: "info" | "warn" | "danger";
  message: string;
}

export interface ValuationSnapshotData {
  formulaVersion: string;
  formulaMode: FormulaMode;
  arvLow: number | null;
  arvBase: number | null;
  arvHigh: number | null;
  arvUsed: number;
  arvSource: "comps" | "avm" | "manual";
  conditionLevel: number | null;
  conditionAdjPct: number | null;
  avgPpsf: number | null;
  compCount: number;
  spreadPct: number | null;
  confidence: ArvConfidence;
  rehabEstimateUsed: number;
  offerPercentage: number;
  assignmentFeeTarget: number;
  holdingCosts: number;
  closingCosts: number;
  maoResult: number;
  quickScreenResult: QuickScreenResult | null;
  wholesaleUnderwriteResult: WholesaleUnderwriteResult | null;
  warnings: ValuationWarning[];
  assumptions: Record<string, unknown>;
  calculatedAt: string;
  calculatedBy: string | null;
}

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Calculate ARV range from selected comparable sales.
 *
 * Uses weighted $/sqft methodology when comps have sqft data,
 * falls back to simple price averaging otherwise.
 */
export function calculateARVRange(
  comps: CompMetric[],
  subjectSqft: number,
  conditionAdjPct: number = 0,
): ARVRangeResult {
  if (comps.length === 0 || subjectSqft <= 0) {
    return {
      arvLow: 0,
      arvBase: 0,
      arvHigh: 0,
      avgPpsf: null,
      compCount: 0,
      spreadPct: null,
    };
  }

  const sqftComps = comps.filter((c) => c.ppsf != null && c.ppsf > 0);

  let arvBase: number;
  let arvLow: number;
  let arvHigh: number;
  let avgPpsf: number | null;

  if (sqftComps.length > 0) {
    const ppsfValues = sqftComps.map((c) => c.ppsf!);
    avgPpsf = ppsfValues.reduce((a, b) => a + b, 0) / ppsfValues.length;
    arvBase = Math.round(avgPpsf * subjectSqft);
    arvLow = Math.round(Math.min(...ppsfValues) * subjectSqft);
    arvHigh = Math.round(Math.max(...ppsfValues) * subjectSqft);
  } else {
    const prices = comps.map((c) => c.price).filter((p) => p > 0);
    if (prices.length === 0) {
      return { arvLow: 0, arvBase: 0, arvHigh: 0, avgPpsf: null, compCount: 0, spreadPct: null };
    }
    arvBase = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
    arvLow = Math.min(...prices);
    arvHigh = Math.max(...prices);
    avgPpsf = null;
  }

  // Apply condition adjustment
  const adjFactor = 1 + conditionAdjPct / 100;
  arvBase = Math.round(arvBase * adjFactor);
  arvLow = Math.round(arvLow * adjFactor);
  arvHigh = Math.round(arvHigh * adjFactor);

  const spread = arvHigh - arvLow;
  const spreadPct = arvBase > 0 ? Math.round((spread / arvBase) * 10000) / 10000 : null;

  return {
    arvLow,
    arvBase,
    arvHigh,
    avgPpsf: avgPpsf != null ? Math.round(avgPpsf * 100) / 100 : null,
    compCount: comps.length,
    spreadPct,
  };
}

/**
 * Determine confidence grade from comp selection quality.
 *
 * High: ≥3 comps with ≤15% spread
 * Medium: ≥2 comps with ≤30% spread
 * Low: everything else
 */
export function calculateArvConfidence(
  compCount: number,
  spreadPct: number | null,
): ARVConfidenceResult {
  const reasons: string[] = [];

  if (compCount === 0) {
    return { confidence: "low", compCount, spreadPct, reasons: ["No comps available"] };
  }

  if (compCount < 2) {
    reasons.push(`Only ${compCount} comp — need ≥2 for medium confidence`);
  }

  if (spreadPct != null && spreadPct > 0.30) {
    reasons.push(`Price spread ${(spreadPct * 100).toFixed(0)}% exceeds 30% threshold`);
  } else if (spreadPct != null && spreadPct > 0.15) {
    reasons.push(`Price spread ${(spreadPct * 100).toFixed(0)}% exceeds 15% threshold for high confidence`);
  }

  const confidence: ArvConfidence =
    compCount >= 3 && spreadPct != null && spreadPct <= 0.15
      ? "high"
      : compCount >= 2 && spreadPct != null && spreadPct <= 0.30
        ? "medium"
        : "low";

  if (reasons.length === 0 && confidence === "high") {
    reasons.push(`${compCount} comps within ${spreadPct != null ? (spreadPct * 100).toFixed(0) : "?"}% spread`);
  }

  return { confidence, compCount, spreadPct, reasons };
}

/**
 * Quick-screen MAO range for automated lead scoring / deep-crawl.
 *
 * Uses AVM × [50%, 65%] — NOT offer-grade. Clearly labeled as screening only.
 * This is the ONLY place the 50-65% range should appear in the codebase.
 */
export function calculateQuickScreen(
  avm: number,
  lowPct: number = DEFAULTS.quickScreenLow,
  highPct: number = DEFAULTS.quickScreenHigh,
): QuickScreenResult {
  const maoLow = avm > 0 ? Math.round(avm * lowPct) : 0;
  const maoHigh = avm > 0 ? Math.round(avm * highPct) : 0;

  return {
    maoLow,
    maoHigh,
    basis: avm > 0
      ? `Screening range: AVM $${avm.toLocaleString()} × ${(lowPct * 100).toFixed(0)}–${(highPct * 100).toFixed(0)}%`
      : "No AVM available",
    formulaMode: FORMULA_MODE_QUICK_SCREEN,
    formulaVersion: FORMULA_VERSION,
  };
}

/**
 * Full wholesale underwriting calculation.
 *
 * THE canonical MAO formula. Every offer-grade MAO in the app calls this.
 *
 * MAO = (ARV × offerPercentage) − rehabEstimate − assignmentFeeTarget
 *
 * Full deal economics:
 * totalCosts = purchasePrice + rehabEstimate + holdingCosts + closingCosts
 * grossProfit = ARV − totalCosts
 * netProfit = grossProfit − assignmentFee
 * roi = grossProfit / totalCosts × 100
 */
export function calculateWholesaleUnderwrite(inputs: {
  arv: number;
  arvSource?: "comps" | "avm" | "manual";
  offerPercentage?: number;
  rehabEstimate?: number;
  assignmentFeeTarget?: number;
  holdingCosts?: number;
  closingCosts?: number;
  /** If provided, used as purchase price instead of MAO-derived price */
  purchasePriceOverride?: number;
}): WholesaleUnderwriteResult {
  const arv = inputs.arv;
  const arvSource = inputs.arvSource ?? "manual";
  const offerPct = inputs.offerPercentage ?? DEFAULTS.offerPercentage;
  const rehab = inputs.rehabEstimate ?? DEFAULTS.rehabEstimate;
  const fee = inputs.assignmentFeeTarget ?? DEFAULTS.assignmentFeeTarget;
  const holding = inputs.holdingCosts ?? (DEFAULTS.holdMonths * DEFAULTS.monthlyHoldCost);
  const closing = inputs.closingCosts ?? DEFAULTS.closingCosts;

  const maxAllowable = arv > 0 ? Math.round(arv * offerPct) : 0;
  const mao = Math.max(0, Math.round(maxAllowable - rehab - fee));

  const purchasePrice = inputs.purchasePriceOverride ?? mao;
  const totalCosts = purchasePrice + rehab + holding + closing;
  const grossProfit = arv > 0 ? arv - totalCosts : 0;
  const netProfit = grossProfit - fee;
  const roi = totalCosts > 0 && purchasePrice > 0
    ? Math.round((grossProfit / totalCosts) * 1000) / 10
    : null;

  return {
    arv,
    arvSource,
    offerPercentage: offerPct,
    maxAllowable,
    rehabEstimate: rehab,
    assignmentFeeTarget: fee,
    holdingCosts: holding,
    closingCosts: closing,
    mao,
    totalCosts,
    grossProfit,
    netProfit,
    roi,
    formulaMode: FORMULA_MODE_WHOLESALE_UNDERWRITE,
    formulaVersion: FORMULA_VERSION,
  };
}

/**
 * Build valuation warnings based on inputs and results.
 *
 * Returns actionable warnings that the operator should see before making an offer.
 */
export function buildValuationWarnings(inputs: {
  arv: number;
  arvSource: "comps" | "avm" | "manual";
  compCount: number;
  confidence: ArvConfidence;
  spreadPct: number | null;
  mao: number;
  rehabEstimate: number;
  conditionLevel: number | null;
  purchasePrice?: number;
}): ValuationWarning[] {
  const warnings: ValuationWarning[] = [];

  if (inputs.arvSource === "avm") {
    warnings.push({
      code: "ARV_FROM_AVM",
      severity: "warn",
      message: "ARV is based on AVM, not comps. Run comps before making an offer.",
    });
  }

  if (inputs.arvSource === "manual") {
    warnings.push({
      code: "ARV_MANUAL",
      severity: "info",
      message: "ARV was entered manually. Verify with comparable sales.",
    });
  }

  if (inputs.compCount === 0 && inputs.arvSource === "comps") {
    warnings.push({
      code: "NO_COMPS",
      severity: "danger",
      message: "No comps selected. Run comps before offering.",
    });
  }

  if (inputs.compCount > 0 && inputs.compCount < 3) {
    warnings.push({
      code: "FEW_COMPS",
      severity: "warn",
      message: `Only ${inputs.compCount} comp${inputs.compCount === 1 ? "" : "s"} — add more before making an offer.`,
    });
  }

  if (inputs.confidence === "low") {
    warnings.push({
      code: "LOW_CONFIDENCE",
      severity: "warn",
      message: "Low confidence — do not offer without reviewing comps.",
    });
  }

  if (inputs.spreadPct != null && inputs.spreadPct > 0.30) {
    warnings.push({
      code: "HIGH_SPREAD",
      severity: "danger",
      message: `${(inputs.spreadPct * 100).toFixed(0)}% price spread — comps may not be comparable. Verify before offering.`,
    });
  }

  if (inputs.conditionLevel == null) {
    warnings.push({
      code: "NO_CONDITION",
      severity: "warn",
      message: "Condition unknown — inspect or research before offering.",
    });
  }

  if (inputs.mao > 0 && inputs.arv > 0 && inputs.mao / inputs.arv > 0.70) {
    warnings.push({
      code: "MAO_HIGH_PCT",
      severity: "warn",
      message: `MAO is ${((inputs.mao / inputs.arv) * 100).toFixed(0)}% of ARV — thin margin.`,
    });
  }

  if (inputs.purchasePrice != null && inputs.mao > 0 && inputs.purchasePrice > inputs.mao) {
    warnings.push({
      code: "OVER_MAO",
      severity: "danger",
      message: "Purchase price exceeds MAO.",
    });
  }

  if (inputs.rehabEstimate === 0 && inputs.conditionLevel != null && inputs.conditionLevel <= 3) {
    warnings.push({
      code: "ZERO_REHAB_LOW_CONDITION",
      severity: "warn",
      message: "Rehab estimate is $0 but condition is moderate or below.",
    });
  }

  return warnings;
}

/**
 * Build a complete valuation snapshot data object for persistence.
 *
 * This captures every input, assumption, and result so the offer basis
 * can be reconstructed later.
 */
export function buildValuationSnapshot(inputs: {
  arvRange: ARVRangeResult;
  arvUsed: number;
  arvSource: "comps" | "avm" | "manual";
  conditionLevel: number | null;
  conditionAdjPct: number | null;
  confidence: ARVConfidenceResult;
  rehabEstimate: number;
  underwrite: WholesaleUnderwriteResult | null;
  quickScreen: QuickScreenResult | null;
  warnings: ValuationWarning[];
  calculatedBy: string | null;
  additionalAssumptions?: Record<string, unknown>;
}): ValuationSnapshotData {
  const mode = inputs.underwrite
    ? FORMULA_MODE_WHOLESALE_UNDERWRITE
    : FORMULA_MODE_QUICK_SCREEN;

  return {
    formulaVersion: FORMULA_VERSION,
    formulaMode: mode,
    arvLow: inputs.arvRange.arvLow || null,
    arvBase: inputs.arvRange.arvBase || null,
    arvHigh: inputs.arvRange.arvHigh || null,
    arvUsed: inputs.arvUsed,
    arvSource: inputs.arvSource,
    conditionLevel: inputs.conditionLevel,
    conditionAdjPct: inputs.conditionAdjPct,
    avgPpsf: inputs.arvRange.avgPpsf,
    compCount: inputs.arvRange.compCount,
    spreadPct: inputs.arvRange.spreadPct,
    confidence: inputs.confidence.confidence,
    rehabEstimateUsed: inputs.rehabEstimate,
    offerPercentage: inputs.underwrite?.offerPercentage ?? DEFAULTS.offerPercentage,
    assignmentFeeTarget: inputs.underwrite?.assignmentFeeTarget ?? DEFAULTS.assignmentFeeTarget,
    holdingCosts: inputs.underwrite?.holdingCosts ?? 0,
    closingCosts: inputs.underwrite?.closingCosts ?? 0,
    maoResult: inputs.underwrite?.mao ?? inputs.quickScreen?.maoHigh ?? 0,
    quickScreenResult: inputs.quickScreen,
    wholesaleUnderwriteResult: inputs.underwrite,
    warnings: inputs.warnings,
    assumptions: {
      formulaVersion: FORMULA_VERSION,
      defaults: DEFAULTS,
      ...inputs.additionalAssumptions,
    },
    calculatedAt: new Date().toISOString(),
    calculatedBy: inputs.calculatedBy,
  };
}

/**
 * Suggested rehab ranges by condition level.
 * Used for operator guidance, not as hard values.
 */
export function getRehabGuidance(conditionLevel: number | null): {
  label: string;
  low: number;
  high: number;
  perSqft: { low: number; high: number };
} {
  switch (conditionLevel) {
    case 1: return { label: "Tear-down / Major Rehab", low: 50_000, high: 80_000, perSqft: { low: 40, high: 65 } };
    case 2: return { label: "Significant Rehab", low: 30_000, high: 50_000, perSqft: { low: 25, high: 40 } };
    case 3: return { label: "Moderate Rehab", low: 15_000, high: 30_000, perSqft: { low: 12, high: 25 } };
    case 4: return { label: "Light Cosmetic", low: 5_000, high: 15_000, perSqft: { low: 4, high: 12 } };
    case 5: return { label: "Move-in Ready", low: 0, high: 5_000, perSqft: { low: 0, high: 4 } };
    default: return { label: "Unknown Condition", low: 15_000, high: 40_000, perSqft: { low: 12, high: 30 } };
  }
}
