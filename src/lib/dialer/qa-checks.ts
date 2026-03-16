/**
 * Call QA — deterministic check library
 *
 * Bounded, deterministic checks against existing structured call data.
 * No AI, no transcript required. All checks derive from:
 *   - calls_log fields (disposition, notes, duration_sec, ai_summary)
 *   - lead qual fields (motivation_level, seller_timeline, condition_level, etc.)
 *   - task existence (was a next action created?)
 *   - objection tags (are any unresolved?)
 *
 * Each check returns a QaCheckResult | null.
 * null means the check passed (no finding) or was not applicable.
 *
 * BOUNDARY: zero imports. Pure TypeScript logic only.
 *
 * AI checks (trust_risk, ai_notes_flag) are NOT in this file.
 * They are called by the QA route which has access to the AI infrastructure.
 * This file only covers the deterministic layer.
 */

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type QaCheckType =
  | "missing_qual"
  | "no_next_action"
  | "unresolved_objection"
  | "short_call"
  | "no_notes"
  | "ai_notes_flag"
  | "trust_risk";

export type QaSeverity = "info" | "warn" | "flag";

export interface QaCheckResult {
  check_type:  QaCheckType;
  severity:    QaSeverity;
  finding:     string;
  ai_derived:  boolean;
  /** run_id links to dialer_ai_traces when ai_derived = true */
  run_id?:     string;
}

/** Input data for deterministic QA checks. All fields nullable. */
export interface QaCheckInput {
  // Call data
  disposition:  string | null;
  duration_sec: number | null;
  notes:        string | null;
  ai_summary:   string | null;

  // Qual fields (from leads table)
  motivation_level:         number | null;
  seller_timeline:          string | null;
  condition_level:          number | null;
  occupancy_score:          number | null;
  decision_maker_confirmed: boolean;

  // Task / follow-up
  has_pending_task: boolean;

  // Objections
  open_objection_count: number;
  open_objection_labels: string[];
}

/** Dispositions that represent a live conversation */
const LIVE_DISPOS = new Set([
  "completed", "follow_up", "appointment", "offer_made", "not_interested",
]);

/** Dispositions where we absolutely expect a next action logged */
const NEXT_ACTION_DISPOS = new Set(["follow_up", "appointment"]);

/** Short call threshold in seconds — live calls under this warrant a flag */
const SHORT_CALL_THRESHOLD_SEC = 60;

/** Minimum notes length for "no_notes" to not fire */
const MIN_NOTES_LENGTH = 10;

// ─────────────────────────────────────────────────────────────
// Individual checks
// ─────────────────────────────────────────────────────────────

/**
 * missing_qual — fires when a live-answer call completed but key qual fields
 * are still null. Uses the same logic as qual-checklist.ts but expressed
 * as a QA finding (more concise, no suggested questions).
 */
export function checkMissingQual(input: QaCheckInput): QaCheckResult | null {
  if (!input.disposition || !LIVE_DISPOS.has(input.disposition)) return null;

  const missing: string[] = [];
  if (!input.motivation_level)         missing.push("motivation");
  if (!input.seller_timeline || input.seller_timeline === "unknown") missing.push("timeline");
  if (input.condition_level == null)   missing.push("condition");
  if (input.occupancy_score == null)   missing.push("occupancy");
  if (!input.decision_maker_confirmed) missing.push("decision-maker");

  if (missing.length === 0) return null;

  const severity: QaSeverity = missing.length >= 3 ? "flag" : missing.length >= 2 ? "warn" : "info";

  return {
    check_type: "missing_qual",
    severity,
    finding: `Live call ended with ${missing.length} qualification field${missing.length > 1 ? "s" : ""} still unknown: ${missing.join(", ")}.`,
    ai_derived: false,
  };
}

/**
 * no_next_action — fires when disposition is follow_up or appointment
 * but no pending task exists for the lead.
 */
export function checkNoNextAction(input: QaCheckInput): QaCheckResult | null {
  if (!input.disposition || !NEXT_ACTION_DISPOS.has(input.disposition)) return null;
  if (input.has_pending_task) return null;

  return {
    check_type: "no_next_action",
    severity:   "flag",
    finding:    `Disposition logged as "${input.disposition}" but no follow-up task was created. Lead may fall through without a next action.`,
    ai_derived: false,
  };
}

/**
 * unresolved_objection — fires when open objection tags exist.
 * Severity scales with count.
 */
export function checkUnresolvedObjection(input: QaCheckInput): QaCheckResult | null {
  if (!input.disposition || !LIVE_DISPOS.has(input.disposition)) return null;
  if (input.open_objection_count === 0) return null;

  const severity: QaSeverity = input.open_objection_count >= 2 ? "flag" : "warn";
  const labels = input.open_objection_labels.slice(0, 3).join(", ");
  const more = input.open_objection_count > 3
    ? ` (+${input.open_objection_count - 3} more)`
    : "";

  return {
    check_type: "unresolved_objection",
    severity,
    finding:    `${input.open_objection_count} unresolved objection${input.open_objection_count > 1 ? "s" : ""} remain after this call: ${labels}${more}.`,
    ai_derived: false,
  };
}

/**
 * short_call — fires when a live-answer call was very short.
 * This may indicate a hang-up, wrong number, or missed qualification opportunity.
 */
export function checkShortCall(input: QaCheckInput): QaCheckResult | null {
  if (!input.disposition || !LIVE_DISPOS.has(input.disposition)) return null;
  if (input.disposition === "not_interested") return null; // short not_interested calls are normal
  if (input.duration_sec == null || input.duration_sec <= 0) return null;
  if (input.duration_sec >= SHORT_CALL_THRESHOLD_SEC) return null;

  return {
    check_type: "short_call",
    severity:   "info",
    finding:    `Live-answer call lasted only ${input.duration_sec}s (under ${SHORT_CALL_THRESHOLD_SEC}s). May have been a hang-up or very brief contact.`,
    ai_derived: false,
  };
}

/**
 * no_notes — fires when a live call was logged without any operator notes.
 * Empty notes make repeat-call memory useless.
 */
export function checkNoNotes(input: QaCheckInput): QaCheckResult | null {
  if (!input.disposition || !LIVE_DISPOS.has(input.disposition)) return null;
  const hasNotes = input.notes && input.notes.trim().length >= MIN_NOTES_LENGTH;
  const hasAi    = input.ai_summary && input.ai_summary.trim().length > 0;
  if (hasNotes || hasAi) return null;

  const severity: QaSeverity =
    NEXT_ACTION_DISPOS.has(input.disposition) ? "flag" : "warn";

  return {
    check_type: "no_notes",
    severity,
    finding:    `Call logged as "${input.disposition}" with no operator notes. Follow-up context will be missing on the next call.`,
    ai_derived: false,
  };
}

// ─────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────

/**
 * Run all deterministic checks and return findings.
 * Returns empty array if all checks pass.
 */
export function runDeterministicChecks(input: QaCheckInput): QaCheckResult[] {
  const checks = [
    checkMissingQual,
    checkNoNextAction,
    checkUnresolvedObjection,
    checkShortCall,
    checkNoNotes,
  ];

  return checks
    .map((fn) => fn(input))
    .filter((r): r is QaCheckResult => r !== null);
}

// ─────────────────────────────────────────────────────────────
// AI check type declarations (implemented in the route, not here)
// ─────────────────────────────────────────────────────────────

/**
 * AI checks (ai_notes_flag, trust_risk) are run in the QA API route
 * where the AI infrastructure is available. They share the same
 * QaCheckResult shape with ai_derived = true and a run_id.
 *
 * Input for both: calls_log.notes (operator-written text).
 * If notes are empty or too short, AI checks are skipped.
 *
 * Confidence caveat: findings are labeled "AI-derived from operator notes"
 * in the UI. They are NOT transcript-based. Accuracy depends on note quality.
 */
export const AI_CHECK_MIN_NOTES_LENGTH = 30;
