/**
 * Qualification checklist — deterministic gap detector
 *
 * Maps the minimum seller qualification checklist to existing CRM fields.
 * No AI, no transcript required — "known" = field is non-null in leads.
 *
 * BOUNDARY: zero imports. Pure TypeScript logic only.
 *
 * Design rule: "unknown" is neutral, never a disqualification.
 * The checklist is informational — it tells Logan what to ask next,
 * not whether a lead is good or bad.
 *
 * Checklist items and their field mapping:
 *   address         → context.address (non-null = known)
 *   decision_maker  → leads.decision_maker_confirmed (true = known)
 *   timeline        → leads.seller_timeline (non-null = known)
 *   condition       → leads.condition_level (non-null = known)
 *   occupancy       → leads.occupancy_score (non-null = known)
 *   motivation      → leads.motivation_level (non-null = known)
 *   next_commitment → open pending task exists for this lead
 *
 * Fields come from CRMLeadContext (context_snapshot) or the qual confirm
 * step values the operator just entered — whichever is most current.
 */

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type QualItemKey =
  | "address"
  | "decision_maker"
  | "timeline"
  | "condition"
  | "occupancy"
  | "motivation"
  | "next_commitment";

/** Priority tier for display ordering */
export type QualItemPriority = "high" | "medium" | "low";

export interface QualChecklistItem {
  key:              QualItemKey;
  label:            string;       // short label for compact strip
  question:         string;       // suggested follow-up question for Logan
  priority:         QualItemPriority;
  /** Short reason why this field matters to acquisitions */
  rationale:        string;
}

/** Result of evaluating one checklist item against current lead state */
export interface QualGapItem extends QualChecklistItem {
  known: boolean;
}

/**
 * Input snapshot for the gap computation.
 * All fields are nullable — the function handles every missing case.
 * Caller passes values from CRMLeadContext + any qual fields the operator
 * just entered in the post-call step (which may be fresher than the snapshot).
 */
export interface QualCheckInput {
  address:               string | null;
  decisionMakerConfirmed: boolean;
  sellerTimeline:        string | null;
  conditionLevel:        number | null;
  occupancyScore:        number | null;
  motivationLevel:       number | null;
  hasOpenTask:           boolean;
}

// ─────────────────────────────────────────────────────────────
// Checklist definition
// ─────────────────────────────────────────────────────────────

export const QUAL_CHECKLIST: readonly QualChecklistItem[] = [
  {
    key:       "address",
    label:     "Address",
    question:  "What is the property address?",
    priority:  "high",
    rationale: "Can't underwrite without a confirmed address.",
  },
  {
    key:       "decision_maker",
    label:     "Decision-maker",
    question:  "Are you the owner, or is there someone else involved in this decision?",
    priority:  "high",
    rationale: "Talking to the wrong person wastes follow-up cycles.",
  },
  {
    key:       "timeline",
    label:     "Timeline",
    question:  "When are you looking to close or move on this?",
    priority:  "high",
    rationale: "Urgency drives offer timing and follow-up cadence.",
  },
  {
    key:       "motivation",
    label:     "Why selling",
    question:  "What's motivating you to sell?",
    priority:  "high",
    rationale: "Situation and pain point determine how to frame the offer.",
  },
  {
    key:       "condition",
    label:     "Condition",
    question:  "What is the overall condition of the property — any major repairs needed?",
    priority:  "medium",
    rationale: "Condition affects ARV and repair estimate in the underwrite.",
  },
  {
    key:       "occupancy",
    label:     "Occupancy",
    question:  "Is the property currently occupied? Rented, owner-occupied, or vacant?",
    priority:  "medium",
    rationale: "Tenant presence affects closing timeline and buyer pool.",
  },
  {
    key:       "next_commitment",
    label:     "Next step",
    question:  "Can we schedule a follow-up call to discuss an offer?",
    priority:  "low",
    rationale: "Every active lead should have an explicit next step logged.",
  },
] as const;

// ─────────────────────────────────────────────────────────────
// Gap computation
// ─────────────────────────────────────────────────────────────

/**
 * Returns the full checklist with each item marked known/unknown.
 * The result is ordered: high priority unknowns first, then medium, then low.
 * Known items appear last within each priority tier.
 */
export function computeQualGaps(input: QualCheckInput): QualGapItem[] {
  const results: QualGapItem[] = QUAL_CHECKLIST.map((item) => ({
    ...item,
    known: isKnown(item.key, input),
  }));

  // Sort: unknown high → unknown medium → unknown low → known items
  const priorityOrder: QualItemPriority[] = ["high", "medium", "low"];
  results.sort((a, b) => {
    if (a.known !== b.known) return a.known ? 1 : -1;
    return priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority);
  });

  return results;
}

function isKnown(key: QualItemKey, input: QualCheckInput): boolean {
  switch (key) {
    case "address":
      return !!input.address;
    case "decision_maker":
      return input.decisionMakerConfirmed;
    case "timeline":
      return !!input.sellerTimeline && input.sellerTimeline !== "unknown";
    case "condition":
      return input.conditionLevel != null;
    case "occupancy":
      return input.occupancyScore != null;
    case "motivation":
      return input.motivationLevel != null;
    case "next_commitment":
      return input.hasOpenTask;
  }
}

/**
 * Returns only the unknown (gap) items, sorted by priority.
 */
export function getQualGaps(input: QualCheckInput): QualGapItem[] {
  return computeQualGaps(input).filter((item) => !item.known);
}

/**
 * Returns a gap summary string for the review surface.
 * e.g. "3 unknown: decision_maker, condition, occupancy"
 */
export function qualGapSummary(gaps: QualGapItem[]): string {
  if (gaps.length === 0) return "Fully qualified";
  const labels = gaps.map((g) => g.label).join(", ");
  return `${gaps.length} unknown: ${labels}`;
}

/**
 * Returns the next best question to ask — the highest-priority unknown item's question.
 */
export function nextQualQuestion(gaps: QualGapItem[]): string | null {
  if (gaps.length === 0) return null;
  return gaps[0].question;
}
