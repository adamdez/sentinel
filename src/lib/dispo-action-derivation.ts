/**
 * Disposition Deal Action Derivation
 *
 * Deterministic, rule-based logic for answering:
 *   "What does this deal in disposition need right now?"
 *
 * Uses the hardened trust layer:
 *   - entered_dispo_at (Phase 4 — auto-set on deal INSERT)
 *   - deal_buyers.date_contacted (Phase 4 — auto-set on status transition)
 *   - deal_buyers.responded_at (Phase 4 — auto-set on status transition)
 *
 * All inputs are nullable for safe legacy/import handling.
 */

import type { UrgencyLevel } from "./action-derivation";

// ── Types ──────────────────────────────────────────────────────────

export interface DispoActionSummary {
  /** Short imperative label, e.g. "Add buyers — no outreach started" */
  action: string;
  /** Longer explanation */
  reason: string;
  /** Urgency bucket — traceable to a specific rule */
  urgency: UrgencyLevel;
  /** Days since deal entered disposition (null if unknown) */
  daysInDispo: number | null;
  /** Whether this deal meets any stall condition */
  isStalled: boolean;
}

export interface BuyerStatusSummary {
  status: string;
  dateContacted?: string | null;
  respondedAt?: string | null;
}

export interface DispoDerivationInput {
  /** When the deal entered disposition stage */
  enteredDispoAt?: string | null;
  /** Status summaries for all linked buyers */
  buyerStatuses: BuyerStatusSummary[];
  /** Current closing status of the deal (if any) */
  closingStatus?: string | null;
  /** Injectable for testing */
  now?: Date;
}

// ── Constants ──────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/** No buyers linked after this many days = critical stall */
const NO_BUYERS_STALL_DAYS = 1;

/** All buyers in pre-contact after this many days = high stall */
const NO_OUTREACH_STALL_DAYS = 2;

/** Buyer responded but no follow-up after this many days */
const RESPONSE_FOLLOWUP_STALL_DAYS = 3;

/** Pre-contact buyer statuses */
const PRE_CONTACT_STATUSES = new Set(["not_contacted", "queued"]);

/** Statuses indicating a buyer has responded positively */
const RESPONSE_STATUSES = new Set(["interested", "offered", "follow_up"]);

/** Statuses indicating a buyer has been selected/deal is progressing */
const SELECTED_STATUSES = new Set(["selected"]);

/** Terminal buyer statuses (no further action needed on this buyer) */
const TERMINAL_BUYER_STATUSES = new Set(["passed", "rejected"]);

// ── Helper ─────────────────────────────────────────────────────────

function daysSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.floor((now.getTime() - ms) / DAY_MS));
}

// ── Core Derivation ────────────────────────────────────────────────

/**
 * Derive the most important action for a deal in disposition.
 *
 * Rule cascade (first match wins, ordered by urgency):
 *
 *  1. NONE    — Deal already closed/closing
 *  2. CRITICAL — No buyers linked, >1 day in dispo
 *  3. HIGH    — All buyers in pre-contact status, >2 days in dispo
 *  4. HIGH    — Buyer responded (interested/offered/follow_up) but last
 *               response >3 days ago with no recent activity
 *  5. NORMAL  — Buyers contacted, awaiting responses
 *  6. LOW     — Buyer selected, deal progressing
 *  7. NORMAL  — No buyers linked, <1 day in dispo (new — add buyers)
 */
export function deriveDispoActionSummary(input: DispoDerivationInput): DispoActionSummary {
  const now = input.now ?? new Date();
  const daysInDispo = daysSince(input.enteredDispoAt, now);
  const buyers = input.buyerStatuses;

  // ── Rule 1: Deal closed ──
  if (input.closingStatus === "closed" || input.closingStatus === "closing") {
    return {
      action: input.closingStatus === "closed" ? "Deal closed" : "Closing in progress",
      reason: `Deal is ${input.closingStatus}. No disposition action needed.`,
      urgency: "none",
      daysInDispo,
      isStalled: false,
    };
  }

  // ── Rule 2: CRITICAL — No buyers linked, >1 day ──
  if (buyers.length === 0) {
    if (daysInDispo !== null && daysInDispo >= NO_BUYERS_STALL_DAYS) {
      return {
        action: `No buyers linked — ${daysInDispo}d in dispo`,
        reason: `Deal has been in disposition for ${daysInDispo} day${daysInDispo === 1 ? "" : "s"} with no buyers linked. Add buyer candidates immediately.`,
        urgency: "critical",
        daysInDispo,
        isStalled: true,
      };
    }

    // Rule 7: New deal, not yet stalled
    return {
      action: "Add buyer candidates",
      reason: "Deal just entered disposition. Link buyer candidates to begin outreach.",
      urgency: "normal",
      daysInDispo,
      isStalled: false,
    };
  }

  // Classify buyer statuses
  const activeBuyers = buyers.filter((b) => !TERMINAL_BUYER_STATUSES.has(b.status));
  const preContactBuyers = activeBuyers.filter((b) => PRE_CONTACT_STATUSES.has(b.status));
  const respondedBuyers = activeBuyers.filter((b) => RESPONSE_STATUSES.has(b.status));
  const selectedBuyers = activeBuyers.filter((b) => SELECTED_STATUSES.has(b.status));
  const contactedBuyers = activeBuyers.filter((b) => !PRE_CONTACT_STATUSES.has(b.status));

  // ── Rule 3: HIGH — All active buyers in pre-contact, >2 days ──
  if (activeBuyers.length > 0 && preContactBuyers.length === activeBuyers.length) {
    if (daysInDispo !== null && daysInDispo >= NO_OUTREACH_STALL_DAYS) {
      return {
        action: `No outreach started — ${daysInDispo}d in dispo`,
        reason: `${activeBuyers.length} buyer${activeBuyers.length === 1 ? "" : "s"} linked but none contacted after ${daysInDispo} days. Begin buyer outreach.`,
        urgency: "high",
        daysInDispo,
        isStalled: true,
      };
    }

    return {
      action: "Begin buyer outreach",
      reason: `${activeBuyers.length} buyer${activeBuyers.length === 1 ? "" : "s"} linked but not yet contacted. Start outreach.`,
      urgency: "normal",
      daysInDispo,
      isStalled: false,
    };
  }

  // ── Rule 4: HIGH — Buyer responded but stale ──
  if (respondedBuyers.length > 0) {
    const staleBuyer = respondedBuyers.find((b) => {
      const daysSinceResponse = daysSince(b.respondedAt, now);
      return daysSinceResponse !== null && daysSinceResponse >= RESPONSE_FOLLOWUP_STALL_DAYS;
    });

    if (staleBuyer) {
      const daysSinceResponse = daysSince(staleBuyer.respondedAt, now);
      return {
        action: `Buyer response ${daysSinceResponse}d ago — follow up`,
        reason: `A buyer responded ${daysSinceResponse} day${daysSinceResponse === 1 ? "" : "s"} ago (status: ${staleBuyer.status}) but hasn't been followed up on. Act before interest cools.`,
        urgency: "high",
        daysInDispo,
        isStalled: true,
      };
    }

    // Active response, not stale
    return {
      action: `${respondedBuyers.length} buyer${respondedBuyers.length === 1 ? "" : "s"} responding — follow up`,
      reason: `${respondedBuyers.length} buyer${respondedBuyers.length === 1 ? " has" : "s have"} responded. Continue negotiation and move toward selection.`,
      urgency: "normal",
      daysInDispo,
      isStalled: false,
    };
  }

  // ── Rule 6: LOW — Buyer selected ──
  if (selectedBuyers.length > 0) {
    return {
      action: "Buyer selected — prepare closing",
      reason: `A buyer has been selected. Prepare closing documents and confirm next steps.`,
      urgency: "low",
      daysInDispo,
      isStalled: false,
    };
  }

  // ── Rule 5: NORMAL — Contacted, awaiting responses ──
  if (contactedBuyers.length > 0) {
    return {
      action: `${contactedBuyers.length} buyer${contactedBuyers.length === 1 ? "" : "s"} contacted — awaiting response`,
      reason: `Outreach complete for ${contactedBuyers.length} buyer${contactedBuyers.length === 1 ? "" : "s"}. Waiting for responses.`,
      urgency: "normal",
      daysInDispo,
      isStalled: false,
    };
  }

  // Fallback — shouldn't reach here, but safe default
  return {
    action: "Review deal status",
    reason: "Deal status is unclear. Review buyer links and outreach progress.",
    urgency: "normal",
    daysInDispo,
    isStalled: false,
  };
}
