/**
 * Negative intelligence signals — deterministic derivation library
 *
 * Given a lead's qualification fields, contradiction flags, and objection tags,
 * this module produces a typed list of "signals worth checking before committing
 * further time to this lead."
 *
 * Design rules:
 *   - All signals are deterministic — no AI, no probabilistic model
 *   - Confidence labels are tied directly to data source quality:
 *       "verified"  → operator explicitly marked it (e.g. contradiction flag marked "real")
 *       "strong"    → operator-entered field with a clear risk value
 *       "probable"  → derived from two or more corroborating data points
 *       "possible"  → single indirect indicator, low confidence
 *   - A null / missing field is never counted as a negative signal
 *   - Signals are informational only — they never block stage changes or calls
 *
 * v1 signal types (7):
 *   weak_motivation         — operator-entered motivation_level 1–2
 *   high_friction_dispo     — operator-set dispo_friction_level = "high"
 *   price_expectation_gap   — seller price expectation > 110% of estimated value
 *   structural_objection    — open objection tag that signals structural friction
 *   stale_no_action         — no next action and no scheduled call for ≥7 days
 *   equity_risk             — low equity or negative equity risk (loan balance ≥ 90% estimated value)
 *   verified_contradiction  — contradiction flag explicitly marked "real" by Adam
 *
 * BOUNDARY: zero imports. Pure TypeScript logic only.
 */

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type NegativeSignalType =
  | "weak_motivation"
  | "high_friction_dispo"
  | "price_expectation_gap"
  | "structural_objection"
  | "stale_no_action"
  | "equity_risk"
  | "verified_contradiction";

export type SignalConfidence = "verified" | "strong" | "probable" | "possible";

export interface NegativeSignal {
  type:        NegativeSignalType;
  confidence:  SignalConfidence;
  label:       string;       // Short label for the chip/badge
  explanation: string;       // One sentence — what the signal means and why it matters
  sourceLabel: string;       // Where the data came from (e.g. "CRM qualification", "Operator tag")
  /** Optional link context — tells the UI where to point the user for more detail */
  linkHint?:   "qualification" | "objections" | "dossier" | "tasks";
}

// ─────────────────────────────────────────────────────────────
// Input shape
// ─────────────────────────────────────────────────────────────

/** Structural objection tags that signal non-price friction */
const STRUCTURAL_OBJECTION_TAGS = new Set([
  "not_ready_to_sell",
  "talking_to_realtor",
  "inherited_dispute",
  "pre_list",
]);

/** Objection tags that signal price resistance specifically */
const PRICE_OBJECTION_TAGS = new Set([
  "price_too_low",
  "wants_full_retail",
]);

export interface NegativeSignalsInput {
  /** From leads table */
  motivationLevel:        number | null;
  sellerTimeline:         string | null;
  conditionLevel:         number | null;
  qualificationRoute:     string | null;
  priceExpectation:       number | null;
  estimatedValue:         number | null;
  totalLoanBalance:       number | null;
  followUpDate:           string | null;
  nextCallScheduledAt:    string | null;
  totalCalls:             number;

  /** From MonetizabilityEditor — operator-manual field */
  dispoFrictionLevel:     string | null;   // "high" | "medium" | "low" | null

  /** Open objection tags from lead_objection_tags */
  openObjectionTags: Array<{ tag: string; note?: string | null }>;

  /** Contradiction flags from lead_contradiction_flags — only real-confirmed or unreviewed flags */
  contradictionFlags: Array<{
    check_type: string;
    severity:   string;
    status:     string;   // "unreviewed" | "real" | "false_positive" | "resolved"
    description: string;
  }>;

  /** Current timestamp for staleness calc — defaults to Date.now() if not provided */
  nowMs?: number;
}

// ─────────────────────────────────────────────────────────────
// Individual signal derivers
// ─────────────────────────────────────────────────────────────

function signalWeakMotivation(input: NegativeSignalsInput): NegativeSignal | null {
  const m = input.motivationLevel;
  if (m == null || m > 2) return null;

  return {
    type:        "weak_motivation",
    confidence:  m === 1 ? "strong" : "probable",
    label:       `Low motivation (${m}/5)`,
    explanation: `Seller motivation is rated ${m}/5. At this level, seller is unlikely to move without a strong external trigger. Offers tend to be countered or ignored.`,
    sourceLabel: "CRM qualification",
    linkHint:    "qualification",
  };
}

function signalHighFrictionDispo(input: NegativeSignalsInput): NegativeSignal | null {
  if (input.dispoFrictionLevel !== "high") return null;

  return {
    type:        "high_friction_dispo",
    confidence:  "strong",
    label:       "High dispo friction",
    explanation: "Disposition friction is set to high. Placing a buyer will likely require extra effort — unusual title, unusual property, limited buyer pool, or geographic friction.",
    sourceLabel: "Monetizability assessment",
    linkHint:    "dossier",
  };
}

function signalPriceExpectationGap(input: NegativeSignalsInput): NegativeSignal | null {
  const { priceExpectation, estimatedValue } = input;
  if (priceExpectation == null || estimatedValue == null || estimatedValue <= 0) return null;

  const ratio = priceExpectation / estimatedValue;
  if (ratio <= 1.10) return null;

  const pctOver = Math.round((ratio - 1) * 100);

  // Boost confidence if we also have a price objection tag
  const hasPriceObjTag = input.openObjectionTags.some((o) => PRICE_OBJECTION_TAGS.has(o.tag));
  const confidence: SignalConfidence = hasPriceObjTag ? "strong" : "probable";

  return {
    type:        "price_expectation_gap",
    confidence,
    label:       `Price ${pctOver}% above estimate`,
    explanation: `Seller price expectation is ${pctOver}% above the estimated value. A deal at seller's number would likely eliminate investor margin unless comps support a higher ARV.`,
    sourceLabel: "CRM qualification + valuation",
    linkHint:    "qualification",
  };
}

function signalStructuralObjection(input: NegativeSignalsInput): NegativeSignal | null {
  const blocking = input.openObjectionTags.filter((o) => STRUCTURAL_OBJECTION_TAGS.has(o.tag));
  if (blocking.length === 0) return null;

  const labels: Record<string, string> = {
    not_ready_to_sell:  "not ready to sell",
    talking_to_realtor: "talking to a realtor",
    inherited_dispute:  "inherited dispute",
    pre_list:           "pre-listing",
  };

  const tagList = blocking.map((o) => labels[o.tag] ?? o.tag).join(", ");

  return {
    type:        "structural_objection",
    confidence:  "strong",
    label:       `Open objection: ${blocking[0].tag === "inherited_dispute" ? "inherited dispute" : tagList}`,
    explanation: `Open objection tag${blocking.length > 1 ? "s" : ""}: ${tagList}. These indicate a structural barrier beyond price — timing, authority, or competing channel conflict.`,
    sourceLabel: "Operator-tagged objections",
    linkHint:    "objections",
  };
}

function signalStaleNoAction(input: NegativeSignalsInput): NegativeSignal | null {
  const { followUpDate, nextCallScheduledAt, totalCalls, nowMs } = input;
  const now = nowMs ?? Date.now();

  // Only meaningful if there have been at least one prior contact attempt
  if (totalCalls < 1) return null;

  const hasScheduledCall = nextCallScheduledAt != null &&
    new Date(nextCallScheduledAt).getTime() >= now;

  if (hasScheduledCall) return null;

  const followUpMs = followUpDate ? new Date(followUpDate).getTime() : null;
  const isOverdue  = followUpMs != null && followUpMs < now;

  const daysOverdue = followUpMs
    ? Math.round((now - followUpMs) / 86_400_000)
    : null;

  // No follow-up date AND no scheduled call AND has prior calls = stale
  if (!followUpDate && totalCalls >= 2) {
    return {
      type:        "stale_no_action",
      confidence:  "probable",
      label:       "No next action",
      explanation: `${totalCalls} call attempt${totalCalls > 1 ? "s" : ""} logged with no scheduled follow-up and no next action. Lead may be drifting without momentum.`,
      sourceLabel: "Task and call data",
      linkHint:    "tasks",
    };
  }

  if (isOverdue && daysOverdue != null && daysOverdue >= 7) {
    return {
      type:        "stale_no_action",
      confidence:  daysOverdue >= 14 ? "strong" : "probable",
      label:       `Follow-up overdue ${daysOverdue}d`,
      explanation: `Follow-up date was ${daysOverdue} days ago with no new call scheduled. Without a re-engagement, this lead may go cold.`,
      sourceLabel: "Task and call data",
      linkHint:    "tasks",
    };
  }

  return null;
}

function signalEquityRisk(input: NegativeSignalsInput): NegativeSignal | null {
  const { totalLoanBalance, estimatedValue } = input;
  if (totalLoanBalance == null || estimatedValue == null || estimatedValue <= 0) return null;

  const ltv = totalLoanBalance / estimatedValue;
  if (ltv < 0.90) return null;

  const pct = Math.round(ltv * 100);
  const confidence: SignalConfidence = ltv >= 1.0 ? "strong" : "probable";

  return {
    type:        "equity_risk",
    confidence,
    label:       ltv >= 1.0 ? "Possibly underwater" : `High LTV (${pct}%)`,
    explanation: ltv >= 1.0
      ? `Estimated loan balance meets or exceeds estimated value — seller may be underwater. A below-market offer may require short-sale approval or seller contribution.`
      : `Loan balance is ${pct}% of estimated value. Thin equity leaves little room for a discount; seller may need more than a cash-discount offer to justify moving.`,
    sourceLabel: "Property data",
    linkHint:    "qualification",
  };
}

function signalVerifiedContradiction(input: NegativeSignalsInput): NegativeSignal | null {
  // "real" = Adam explicitly confirmed; "unreviewed" flag = worth surfacing but labeled differently
  const confirmed = input.contradictionFlags.filter(
    (f) => f.status === "real" && f.severity === "flag",
  );
  const unreviewed = input.contradictionFlags.filter(
    (f) => f.status === "unreviewed" && f.severity === "flag",
  );

  if (confirmed.length > 0) {
    return {
      type:        "verified_contradiction",
      confidence:  "verified",
      label:       `Confirmed contradiction (${confirmed.length})`,
      explanation: confirmed[0].description.slice(0, 160),
      sourceLabel: "Contradiction review — confirmed by Adam",
      linkHint:    "dossier",
    };
  }

  if (unreviewed.length > 0) {
    return {
      type:        "verified_contradiction",
      confidence:  "possible",
      label:       `Unreviewed contradiction (${unreviewed.length})`,
      explanation: `${unreviewed.length} unreviewed contradiction flag${unreviewed.length > 1 ? "s" : ""} detected. Review in the dossier section before committing.`,
      sourceLabel: "Contradiction scan — needs review",
      linkHint:    "dossier",
    };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────

const CONFIDENCE_ORDER: Record<SignalConfidence, number> = {
  verified:  0,
  strong:    1,
  probable:  2,
  possible:  3,
};

export function deriveNegativeSignals(input: NegativeSignalsInput): NegativeSignal[] {
  const raw = [
    signalVerifiedContradiction(input),
    signalWeakMotivation(input),
    signalHighFrictionDispo(input),
    signalStructuralObjection(input),
    signalPriceExpectationGap(input),
    signalStaleNoAction(input),
    signalEquityRisk(input),
  ].filter((s): s is NegativeSignal => s !== null);

  // Sort: verified first, then strong, probable, possible
  return raw.sort((a, b) => CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence]);
}

// ─────────────────────────────────────────────────────────────
// Confidence label display
// ─────────────────────────────────────────────────────────────

export const CONFIDENCE_DISPLAY: Record<SignalConfidence, { label: string; description: string }> = {
  verified:  { label: "Verified",  description: "Operator confirmed this is a real issue." },
  strong:    { label: "Strong",    description: "Based on operator-entered data." },
  probable:  { label: "Probable",  description: "Derived from two or more corroborating signals." },
  possible:  { label: "Possible",  description: "Single indirect indicator — worth checking but low certainty." },
};
