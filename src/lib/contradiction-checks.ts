/**
 * Contradiction detection — deterministic check library
 *
 * Detects inconsistencies between CRM fields, dossier data, fact assertions,
 * and operator-recorded signals for a lead.
 *
 * Design rules:
 *   - All checks are deterministic — no AI, no probabilistic reasoning
 *   - Each check returns a ContradictionInput | null (null = no contradiction)
 *   - "contradiction" means two explicitly captured data points conflict
 *   - Unknown/null fields are treated as "not yet known" — never as conflict
 *   - Keyword scans on fact_value are labeled as such in the finding
 *   - Only accepted/reviewed facts trigger checks (review_status = 'accepted')
 *
 * v1 checks (4):
 *   1. authority_unclear   — DM confirmed but inherited_dispute objection or heir/estate facts
 *   2. occupancy_mismatch  — operator says near-vacant but evidence says occupied/tenant
 *   3. lien_vs_clean       — offer-ready route but lien/judgment financial facts
 *   4. condition_vs_offer  — offer-ready route but condition unknown or very poor (1-2)
 *
 * BOUNDARY: zero imports. Pure TypeScript logic only.
 */

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type ContradictionCheckType =
  | "authority_unclear"
  | "occupancy_mismatch"
  | "lien_vs_clean"
  | "condition_vs_offer";

export type ContradictionSeverity = "warn" | "flag";

export interface ContradictionEvidence {
  source: string;   // "CRM field" | "fact assertion" | "objection tag" | "dossier"
  label:  string;   // human-readable field name or fact type
  value:  string;   // the actual value that conflicts
}

export interface ContradictionInput {
  check_type:   ContradictionCheckType;
  severity:     ContradictionSeverity;
  description:  string;
  evidence_a:   ContradictionEvidence;
  evidence_b:   ContradictionEvidence;
  /** fact_id of the most relevant conflicting fact assertion, if any */
  fact_id?:     string;
  /** artifact_id tied to the conflict, if any */
  artifact_id?: string;
}

// ─────────────────────────────────────────────────────────────
// Input shape for the scanner
// ─────────────────────────────────────────────────────────────

export interface ContradictionScanInput {
  // CRM lead fields
  lead: {
    decision_maker_confirmed: boolean;
    occupancy_score:          number | null;   // 1=tenant-occupied, 5=vacant
    qualification_route:      string | null;   // offer_ready | follow_up | nurture | dead | escalate
    condition_level:          number | null;   // 1-5
  };

  // Accepted (review_status = 'accepted') fact assertions for this lead
  acceptedFacts: Array<{
    id:        string;
    fact_type: string;   // ownership | financial | property_condition | probate_status | other
    fact_value: string;  // free-text claim, operator-written
    artifact_id?: string | null;
  }>;

  // Open objection tags
  openObjectionTags: string[];
}

// ─────────────────────────────────────────────────────────────
// Keyword lists for text scanning
// Keep short and high-signal. Labeled as keyword match in findings.
// ─────────────────────────────────────────────────────────────

const HEIR_KEYWORDS     = ["heir", "estate", "probate", "beneficiary", "inherit", "multiple owner", "co-owner", "siblings"];
const LIEN_KEYWORDS     = ["lien", "judgment", "irs", "tax lien", "mechanic", "code violation", "encumbrance", "owed", "delinquent"];
const OCCUPIED_KEYWORDS = ["tenant", "occupied", "renter", "lease", "month-to-month", "living there", "someone lives"];

function hasKeyword(text: string, keywords: string[]): string | null {
  const lower = text.toLowerCase();
  return keywords.find((kw) => lower.includes(kw)) ?? null;
}

// ─────────────────────────────────────────────────────────────
// Check 1: authority_unclear
// ─────────────────────────────────────────────────────────────
// Fires when:
//   - leads.decision_maker_confirmed = true (CRM says we have the DM)
//   AND any of:
//   - Open objection tag "inherited_dispute"
//   - Accepted ownership/probate fact containing heir/estate/multiple-owner language
// ─────────────────────────────────────────────────────────────

export function checkAuthorityUnclear(input: ContradictionScanInput): ContradictionInput | null {
  if (!input.lead.decision_maker_confirmed) return null;

  // Check objection tags first (cheaper)
  if (input.openObjectionTags.includes("inherited_dispute")) {
    return {
      check_type:  "authority_unclear",
      severity:    "flag",
      description: "CRM marks decision-maker as confirmed, but an open 'inherited dispute' objection suggests authority may be shared or contested.",
      evidence_a: {
        source: "CRM field",
        label:  "decision_maker_confirmed",
        value:  "true",
      },
      evidence_b: {
        source: "objection tag",
        label:  "Open objection",
        value:  "inherited_dispute",
      },
    };
  }

  // Check accepted ownership/probate facts for heir/estate language
  const conflictingFact = input.acceptedFacts.find((f) => {
    if (!["ownership", "probate_status", "other"].includes(f.fact_type)) return false;
    return hasKeyword(f.fact_value, HEIR_KEYWORDS) !== null;
  });

  if (conflictingFact) {
    const matchedKw = hasKeyword(conflictingFact.fact_value, HEIR_KEYWORDS)!;
    return {
      check_type:  "authority_unclear",
      severity:    "warn",
      description: `CRM marks decision-maker as confirmed, but an accepted ${conflictingFact.fact_type} fact contains "${matchedKw}" — authority may be shared or still in probate. Keyword match in fact notes.`,
      evidence_a: {
        source: "CRM field",
        label:  "decision_maker_confirmed",
        value:  "true",
      },
      evidence_b: {
        source: "fact assertion",
        label:  conflictingFact.fact_type,
        value:  conflictingFact.fact_value.slice(0, 120),
      },
      fact_id:     conflictingFact.id,
      artifact_id: conflictingFact.artifact_id ?? undefined,
    };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// Check 2: occupancy_mismatch
// ─────────────────────────────────────────────────────────────
// Fires when:
//   - leads.occupancy_score >= 4 (operator thinks vacant or nearly vacant)
//   AND accepted property_condition or other fact contains tenant/occupied language
// ─────────────────────────────────────────────────────────────

export function checkOccupancyMismatch(input: ContradictionScanInput): ContradictionInput | null {
  const score = input.lead.occupancy_score;
  if (score == null || score < 4) return null;

  const conflictingFact = input.acceptedFacts.find((f) => {
    return hasKeyword(f.fact_value, OCCUPIED_KEYWORDS) !== null;
  });

  if (!conflictingFact) return null;

  const matchedKw = hasKeyword(conflictingFact.fact_value, OCCUPIED_KEYWORDS)!;
  return {
    check_type:  "occupancy_mismatch",
    severity:    "warn",
    description: `Occupancy score is ${score}/5 (near-vacant), but an accepted fact contains "${matchedKw}" suggesting the property may be occupied. Keyword match in fact notes.`,
    evidence_a: {
      source: "CRM field",
      label:  "occupancy_score",
      value:  `${score}/5 (near-vacant)`,
    },
    evidence_b: {
      source: "fact assertion",
      label:  conflictingFact.fact_type,
      value:  conflictingFact.fact_value.slice(0, 120),
    },
    fact_id:     conflictingFact.id,
    artifact_id: conflictingFact.artifact_id ?? undefined,
  };
}

// ─────────────────────────────────────────────────────────────
// Check 3: lien_vs_clean
// ─────────────────────────────────────────────────────────────
// Fires when:
//   - leads.qualification_route = 'offer_ready' (team is ready to offer)
//   AND accepted financial/ownership fact contains lien/judgment language
// ─────────────────────────────────────────────────────────────

export function checkLienVsClean(input: ContradictionScanInput): ContradictionInput | null {
  if (input.lead.qualification_route !== "offer_ready") return null;

  const conflictingFact = input.acceptedFacts.find((f) => {
    if (!["financial", "ownership", "other"].includes(f.fact_type)) return false;
    return hasKeyword(f.fact_value, LIEN_KEYWORDS) !== null;
  });

  if (!conflictingFact) return null;

  const matchedKw = hasKeyword(conflictingFact.fact_value, LIEN_KEYWORDS)!;
  return {
    check_type:  "lien_vs_clean",
    severity:    "flag",
    description: `Lead is routed as offer-ready, but an accepted ${conflictingFact.fact_type} fact contains "${matchedKw}" — title or financial burden may need verification before an offer is made. Keyword match in fact notes.`,
    evidence_a: {
      source: "CRM field",
      label:  "qualification_route",
      value:  "offer_ready",
    },
    evidence_b: {
      source: "fact assertion",
      label:  conflictingFact.fact_type,
      value:  conflictingFact.fact_value.slice(0, 120),
    },
    fact_id:     conflictingFact.id,
    artifact_id: conflictingFact.artifact_id ?? undefined,
  };
}

// ─────────────────────────────────────────────────────────────
// Check 4: condition_vs_offer
// ─────────────────────────────────────────────────────────────
// Fires when:
//   - leads.qualification_route = 'offer_ready'
//   AND (condition_level IS NULL or condition_level <= 2)
// Rationale: making an offer without condition data (or with very-poor condition)
// is a known underwrite risk — the offer price may be wrong.
// ─────────────────────────────────────────────────────────────

export function checkConditionVsOffer(input: ContradictionScanInput): ContradictionInput | null {
  if (input.lead.qualification_route !== "offer_ready") return null;

  const condition = input.lead.condition_level;

  if (condition == null) {
    return {
      check_type:  "condition_vs_offer",
      severity:    "warn",
      description: "Lead is routed as offer-ready, but property condition has never been captured. Repair estimate and ARV may be unreliable without condition data.",
      evidence_a: {
        source: "CRM field",
        label:  "qualification_route",
        value:  "offer_ready",
      },
      evidence_b: {
        source: "CRM field",
        label:  "condition_level",
        value:  "not captured (null)",
      },
    };
  }

  if (condition <= 2) {
    return {
      check_type:  "condition_vs_offer",
      severity:    "warn",
      description: `Lead is routed as offer-ready, but condition is rated ${condition}/5 (very poor). Significant repair budget should be verified before committing to an offer price.`,
      evidence_a: {
        source: "CRM field",
        label:  "qualification_route",
        value:  "offer_ready",
      },
      evidence_b: {
        source: "CRM field",
        label:  "condition_level",
        value:  `${condition}/5 (very poor)`,
      },
    };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// Runner — all checks
// ─────────────────────────────────────────────────────────────

export function runContradictionChecks(input: ContradictionScanInput): ContradictionInput[] {
  return [
    checkAuthorityUnclear(input),
    checkOccupancyMismatch(input),
    checkLienVsClean(input),
    checkConditionVsOffer(input),
  ].filter((r): r is ContradictionInput => r !== null);
}

// ─────────────────────────────────────────────────────────────
// Labels (for UI display)
// ─────────────────────────────────────────────────────────────

export const CONTRADICTION_CHECK_LABELS: Record<ContradictionCheckType, string> = {
  authority_unclear:  "Authority / decision-maker unclear",
  occupancy_mismatch: "Occupancy mismatch",
  lien_vs_clean:      "Lien or title friction",
  condition_vs_offer: "Condition unknown vs offer posture",
};
