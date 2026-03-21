/**
 * Dossier Triage
 *
 * Deterministic, rule-based priority signals for the dossier review queue.
 * Pure function — no DB calls, no ML, no stochastic behavior.
 *
 * Each signal maps to a named reason label with a fixed integer weight.
 * The triage score is the sum of active signal weights. Higher score = review first.
 *
 * Used server-side in /api/dossiers/queue to sort and label items before
 * sending them to the review UI. The UI renders reason badges in the card header.
 *
 * Weights are chosen so that critical signals (durable writeback risk,
 * blocked source) always outrank informational signals (low field coverage).
 *
 * Signal catalog:
 *   durable_writeback_pending   — lead already has decision_maker_note; promoting would overwrite CRM truth
 *   prior_dossier_flagged       — a prior dossier for this lead was flagged/rejected
 *   blocked_source              — at least one artifact in this compile has policy = blocked
 *   review_required_source      — at least one artifact has policy = review_required
 *   low_evidence_confidence     — verification_checklist has unverified items (artifacts with no notes)
 *   missing_key_fields          — situation_summary or likely_decision_maker is null
 *   no_source_links             — no source URLs captured (facts have no external provenance)
 *   no_facts                    — zero facts extracted across all artifacts
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type TriageReasonCode =
  | "durable_writeback_pending"
  | "prior_dossier_flagged"
  | "blocked_source"
  | "review_required_source"
  | "low_evidence_confidence"
  | "missing_key_fields"
  | "no_source_links"
  | "no_facts";

export type TriageSeverity = "critical" | "high" | "medium" | "low";

export interface TriageReason {
  code:     TriageReasonCode;
  label:    string;
  detail:   string | null;    // e.g. "2 unverified sources"
  severity: TriageSeverity;
  weight:   number;
}

export interface TriageResult {
  score:       number;             // sum of active weights
  reasons:     TriageReason[];     // sorted by weight desc
  highest:     TriageSeverity;     // worst severity present (or "low" if none)
}

// ── Signal definitions ────────────────────────────────────────────────────────

const SIGNAL_DEFS: Record<TriageReasonCode, { label: string; severity: TriageSeverity; weight: number }> = {
  durable_writeback_pending: {
    label:    "Writeback risk",
    severity: "critical",
    weight:   100,
  },
  prior_dossier_flagged: {
    label:    "Prior rejected",
    severity: "high",
    weight:   60,
  },
  blocked_source: {
    label:    "Blocked source",
    severity: "high",
    weight:   50,
  },
  review_required_source: {
    label:    "Review-required source",
    severity: "medium",
    weight:   30,
  },
  low_evidence_confidence: {
    label:    "Low confidence",
    severity: "medium",
    weight:   20,
  },
  missing_key_fields: {
    label:    "Missing key fields",
    severity: "medium",
    weight:   15,
  },
  no_source_links: {
    label:    "No source links",
    severity: "low",
    weight:   10,
  },
  no_facts: {
    label:    "No facts extracted",
    severity: "low",
    weight:   10,
  },
};

const SEVERITY_ORDER: TriageSeverity[] = ["critical", "high", "medium", "low"];

// ── Public labels for UI ──────────────────────────────────────────────────────

export const TRIAGE_REASON_LABELS: Record<TriageReasonCode, string> =
  Object.fromEntries(
    Object.entries(SIGNAL_DEFS).map(([k, v]) => [k, v.label])
  ) as Record<TriageReasonCode, string>;

export const TRIAGE_SEVERITY_CLASSES: Record<TriageSeverity, { badge: string; text: string }> = {
  critical: { badge: "bg-muted/15 border-border/30 text-foreground",    text: "text-foreground" },
  high:     { badge: "bg-muted/15 border-border/30 text-foreground", text: "text-foreground" },
  medium:   { badge: "bg-muted/15 border-border/30 text-foreground",    text: "text-foreground" },
  low:      { badge: "bg-muted/40 border-border text-muted-foreground/60",     text: "text-muted-foreground/60" },
};

// ── Input shape ───────────────────────────────────────────────────────────────
// Subset of DossierQueueItem fields needed for triage + extra server-side data

export interface TriageInput {
  // From dossier row
  situation_summary:      string | null;
  likely_decision_maker:  string | null;
  verification_checklist: Array<{ item: string; verified: boolean }> | null;
  source_links:           Array<{ label: string; url: string }> | null;
  raw_ai_output:          Record<string, unknown> | null;

  // From lead join
  decision_maker_note:    string | null;   // if set, writeback would overwrite

  // Enriched server-side (from separate queries)
  prior_dossier_flagged:  boolean;         // true if lead has a prior flagged dossier
  fact_count:             number;          // total accepted facts across artifacts
  policy_flags:           Array<{ source_type: string; policy: string }> | null;
}

// ── computeTriageSignals ──────────────────────────────────────────────────────

/**
 * Runs all triage rules against a dossier item.
 * Returns { score, reasons, highest } — pure, deterministic, side-effect free.
 */
export function computeTriageSignals(input: TriageInput): TriageResult {
  const active: TriageReason[] = [];

  // ── 1. Durable writeback risk ─────────────────────────────────────────────
  // Promoting this dossier would overwrite the lead's existing decision_maker_note.
  // Adam should consciously decide to replace it, not accidentally overwrite.
  if (input.decision_maker_note && input.decision_maker_note.trim().length > 0) {
    active.push({
      ...SIGNAL_DEFS.durable_writeback_pending,
      code:   "durable_writeback_pending",
      detail: "Lead already has a decision-maker note — promoting overwrites it",
    });
  }

  // ── 2. Prior dossier flagged ──────────────────────────────────────────────
  if (input.prior_dossier_flagged) {
    active.push({
      ...SIGNAL_DEFS.prior_dossier_flagged,
      code:   "prior_dossier_flagged",
      detail: "A prior dossier for this lead was rejected",
    });
  }

  // ── 3. Source policy flags ────────────────────────────────────────────────
  // policy_flags comes from raw_ai_output.policy_flags or pre-resolved by queue API
  const policyFlags = input.policy_flags
    ?? (input.raw_ai_output?.policy_flags as Array<{ source_type: string; policy: string }> | undefined)
    ?? [];

  const hasBlocked = policyFlags.some(f => f.policy === "blocked");
  const hasReviewRequired = policyFlags.some(f => f.policy === "review_required");
  const blockedSources = policyFlags.filter(f => f.policy === "blocked").map(f => f.source_type);
  const reviewSources  = policyFlags.filter(f => f.policy === "review_required").map(f => f.source_type);

  if (hasBlocked) {
    active.push({
      ...SIGNAL_DEFS.blocked_source,
      code:   "blocked_source",
      detail: `Blocked sources: ${blockedSources.join(", ")}`,
    });
  } else if (hasReviewRequired) {
    // Only add review_required if no blocked (blocked is strictly higher)
    active.push({
      ...SIGNAL_DEFS.review_required_source,
      code:   "review_required_source",
      detail: `Review-required sources: ${reviewSources.slice(0, 3).join(", ")}`,
    });
  }

  // ── 4. Low evidence confidence ────────────────────────────────────────────
  // Unverified checklist items = artifacts that had no extracted notes at compile time
  const checklist = input.verification_checklist ?? [];
  const unverifiedCount = checklist.filter(v => !v.verified).length;
  if (unverifiedCount > 0) {
    active.push({
      ...SIGNAL_DEFS.low_evidence_confidence,
      code:   "low_evidence_confidence",
      detail: `${unverifiedCount} source${unverifiedCount !== 1 ? "s" : ""} need${unverifiedCount === 1 ? "s" : ""} verification`,
    });
  }

  // ── 5. Missing key fields ─────────────────────────────────────────────────
  const missingFields: string[] = [];
  if (!input.situation_summary?.trim())     missingFields.push("summary");
  if (!input.likely_decision_maker?.trim()) missingFields.push("decision-maker");
  if (missingFields.length > 0) {
    active.push({
      ...SIGNAL_DEFS.missing_key_fields,
      code:   "missing_key_fields",
      detail: `Missing: ${missingFields.join(", ")}`,
    });
  }

  // ── 6. No source links ────────────────────────────────────────────────────
  if (!input.source_links || input.source_links.length === 0) {
    active.push({
      ...SIGNAL_DEFS.no_source_links,
      code:   "no_source_links",
      detail: "No external source URLs captured",
    });
  }

  // ── 7. No facts extracted ─────────────────────────────────────────────────
  if (input.fact_count === 0) {
    active.push({
      ...SIGNAL_DEFS.no_facts,
      code:   "no_facts",
      detail: "No fact assertions found for this dossier",
    });
  }

  // ── Compute score + highest severity ─────────────────────────────────────
  const score = active.reduce((sum, r) => sum + r.weight, 0);

  // Sort reasons by weight desc
  active.sort((a, b) => b.weight - a.weight);

  const highest: TriageSeverity = active.length > 0
    ? SEVERITY_ORDER.find(s => active.some(r => r.severity === s)) ?? "low"
    : "low";

  return { score, reasons: active, highest };
}
