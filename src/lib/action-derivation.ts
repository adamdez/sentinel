/**
 * Lead Action Derivation
 *
 * Deterministic, rule-based logic for answering:
 *   "What should the operator do with this lead right now, and why?"
 *
 * Each rule maps to a verifiable workflow fact — no opaque scoring,
 * no ML-style confidence levels, no hidden automation.
 *
 * Designed to be consumed by:
 *   - Lead detail header ("needs attention because…")
 *   - Morning queue bucket enrichment
 *   - Operator queue sorting
 *
 * All inputs are nullable to safely handle legacy/imported leads.
 */

import { isStale, daysSinceContact, isContacted } from "./comm-truth";

// ── Types ──────────────────────────────────────────────────────────

export type UrgencyLevel = "critical" | "high" | "normal" | "low" | "none";

export type ActionType = "call" | "task" | "review" | "dispo" | "none";

export interface ActionSummary {
  /** Short imperative label, e.g. "Call — no contact in 12 days" */
  action: string;
  /** Longer explanation, e.g. "Lead has had no contact attempts…" */
  reason: string;
  /** Urgency bucket — always traceable to a specific rule */
  urgency: UrgencyLevel;
  /** What kind of action is needed */
  actionType: ActionType;
  /** Whether the operator should act on this record */
  isActionable: boolean;
}

export interface ActionDerivationInput {
  status: string | null;
  qualificationRoute?: string | null;
  assignedTo?: string | null;

  nextCallScheduledAt?: string | null;
  nextFollowUpAt?: string | null;
  lastContactAt?: string | null;
  totalCalls?: number | null;

  /** Lead creation time — used for speed-to-lead detection */
  createdAt?: string | null;
  /** When lead was promoted to active pipeline (prospect→lead) */
  promotedAt?: string | null;

  /** Injectable for testing */
  now?: Date;
}

// ── Constants ──────────────────────────────────────────────────────

/** Statuses where the lead is dead/closed and needs no operator action */
const TERMINAL_STATUSES = new Set(["dead", "closed"]);

/** Statuses where the lead is actively being worked (call/qualify/offer) */
const ACTIVE_CALL_STATUSES = new Set(["lead", "negotiation"]);

/** Speed-to-lead threshold: uncontacted leads older than this trigger CRITICAL */
const SPEED_TO_LEAD_THRESHOLD_HOURS = 24;

/** Default stale threshold — matches comm-truth.ts default */
const STALE_THRESHOLD_DAYS = 7;

/** Time before a lead with no action set is flagged as needing attention */
const NO_ACTION_AGING_DAYS = 3;

// ── Helper ─────────────────────────────────────────────────────────

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function hoursSince(isoDate: string | null | undefined, now: Date): number | null {
  const ms = parseMs(isoDate);
  if (ms === null) return null;
  return (now.getTime() - ms) / (1000 * 60 * 60);
}

// ── Core Derivation ────────────────────────────────────────────────

/**
 * Derive the single most important action for a lead, with a human-readable
 * reason and deterministic urgency level.
 *
 * Rule cascade (first match wins, ordered by urgency):
 *
 *  1. CRITICAL — Overdue callback or follow-up
 *  2. CRITICAL — Uncontacted active lead >24h old (speed-to-lead failure)
 *  3. HIGH    — Stale contact (>7d, active status, not dead/closed)
 *  4. HIGH    — Needs qualification (status=lead, has contact, no route)
 *  5. NORMAL  — Callback scheduled (future)
 *  6. NORMAL  — Follow-up due today or soon
 *  7. NORMAL  — Nurture check-in needed
 *  8. LOW     — Active lead with no scheduled action, aging >3 days
 *  9. NONE    — Dead, closed, or no action needed
 */
export function deriveLeadActionSummary(input: ActionDerivationInput): ActionSummary {
  const now = input.now ?? new Date();
  const status = (input.status ?? "").toLowerCase();
  const route = (input.qualificationRoute ?? "").toLowerCase() || null;

  // ── Terminal statuses ──
  if (TERMINAL_STATUSES.has(status)) {
    return {
      action: status === "dead" ? "Dead — no action needed" : "Closed — no action needed",
      reason: `Lead is in ${status} status. No operator action required.`,
      urgency: "none",
      actionType: "none",
      isActionable: false,
    };
  }

  // ── Pre-pipeline statuses ──
  if (status === "staging" || status === "prospect") {
    return {
      action: "Awaiting promotion",
      reason: `Lead is in ${status} stage. Promote to active pipeline to begin outreach.`,
      urgency: "low",
      actionType: "review",
      isActionable: status === "prospect",
    };
  }

  const contacted = isContacted({
    last_contact_at: input.lastContactAt,
    total_calls: input.totalCalls,
  });

  const callDueMs = parseMs(input.nextCallScheduledAt);
  const followUpDueMs = parseMs(input.nextFollowUpAt);
  const effectiveDueMs = callDueMs ?? followUpDueMs;
  const nowMs = now.getTime();

  // ── Rule 1: CRITICAL — Overdue callback/follow-up ──
  if (effectiveDueMs !== null && effectiveDueMs < nowMs) {
    const overdueDays = Math.max(1, Math.ceil((nowMs - effectiveDueMs) / (1000 * 60 * 60 * 24)));
    const isCallback = callDueMs !== null && callDueMs < nowMs;
    const actionLabel = isCallback ? "Callback" : "Follow-up";

    return {
      action: `${actionLabel} ${overdueDays}d overdue`,
      reason: `Scheduled ${actionLabel.toLowerCase()} was due ${overdueDays} day${overdueDays === 1 ? "" : "s"} ago. Contact the seller immediately.`,
      urgency: "critical",
      actionType: "call",
      isActionable: true,
    };
  }

  // ── Rule 2: CRITICAL — Uncontacted active lead >24h ──
  if (!contacted && ACTIVE_CALL_STATUSES.has(status)) {
    const referenceDate = input.promotedAt ?? input.createdAt;
    const hoursOld = hoursSince(referenceDate, now);

    if (hoursOld !== null && hoursOld > SPEED_TO_LEAD_THRESHOLD_HOURS) {
      const daysOld = Math.floor(hoursOld / 24);
      return {
        action: `No contact attempt — ${daysOld > 0 ? daysOld + "d" : "<1d"} old`,
        reason: `Lead has been in ${status} status for ${daysOld > 0 ? daysOld + " day" + (daysOld === 1 ? "" : "s") : "less than a day"} with zero contact attempts. Speed-to-lead SLA violated.`,
        urgency: "critical",
        actionType: "call",
        isActionable: true,
      };
    }
  }

  // ── Rule 3: HIGH — Stale contact ──
  if (contacted && isStale(input.lastContactAt, STALE_THRESHOLD_DAYS, nowMs)) {
    const days = daysSinceContact(input.lastContactAt, nowMs);
    const daysLabel = days !== null ? `${days}d` : "unknown time";

    return {
      action: `No contact in ${daysLabel}`,
      reason: `Last contact was ${daysLabel} ago. Lead may be going cold — schedule a follow-up call.`,
      urgency: "high",
      actionType: "call",
      isActionable: true,
    };
  }

  // ── Rule 4: HIGH — Needs qualification ──
  if (status === "lead" && contacted && !route) {
    return {
      action: "Needs qualification routing",
      reason: "Lead has been contacted but has no qualification route set. Review and route to offer_ready, follow_up, nurture, or dead.",
      urgency: "high",
      actionType: "review",
      isActionable: true,
    };
  }

  // ── Rule 5: NORMAL — Callback scheduled (future) ──
  if (callDueMs !== null && callDueMs >= nowMs) {
    const daysUntil = Math.floor((callDueMs - nowMs) / (1000 * 60 * 60 * 24));
    const label = daysUntil === 0 ? "today" : daysUntil === 1 ? "tomorrow" : `in ${daysUntil}d`;

    return {
      action: `Callback scheduled ${label}`,
      reason: `Scheduled callback is ${label}. Prepare for the call.`,
      urgency: "normal",
      actionType: "call",
      isActionable: daysUntil === 0,
    };
  }

  // ── Rule 6: NORMAL — Follow-up due today or soon ──
  if (followUpDueMs !== null && followUpDueMs >= nowMs) {
    const daysUntil = Math.floor((followUpDueMs - nowMs) / (1000 * 60 * 60 * 24));
    const label = daysUntil === 0 ? "today" : daysUntil === 1 ? "tomorrow" : `in ${daysUntil}d`;

    return {
      action: `Follow-up ${label}`,
      reason: `Follow-up is scheduled ${label}. Review context and prepare next touchpoint.`,
      urgency: daysUntil === 0 ? "normal" : "low",
      actionType: "call",
      isActionable: daysUntil === 0,
    };
  }

  // ── Rule 7: NORMAL — Nurture check-in needed ──
  if (status === "nurture") {
    const days = daysSinceContact(input.lastContactAt, nowMs);
    if (days !== null && days > STALE_THRESHOLD_DAYS) {
      return {
        action: `Nurture check-in — ${days}d since contact`,
        reason: `Nurture lead hasn't been contacted in ${days} days. Schedule a check-in call.`,
        urgency: "normal",
        actionType: "call",
        isActionable: true,
      };
    }

    return {
      action: "Nurture — on cadence",
      reason: "Nurture lead is within normal check-in window. No immediate action needed.",
      urgency: "low",
      actionType: "none",
      isActionable: false,
    };
  }

  // ── Rule 8: LOW — Active with no scheduled action, aging ──
  if (!contacted) {
    // Uncontacted but within speed-to-lead window (rule 2 didn't fire)
    return {
      action: "New — awaiting first contact",
      reason: "Lead is new and hasn't been contacted yet. Make initial contact attempt.",
      urgency: "normal",
      actionType: "call",
      isActionable: true,
    };
  }

  // Contacted but no next action scheduled
  const referenceDate = input.lastContactAt ?? input.createdAt;
  const daysSinceRef = hoursSince(referenceDate, now);
  const daysAging = daysSinceRef !== null ? Math.floor(daysSinceRef / 24) : null;

  if (daysAging !== null && daysAging >= NO_ACTION_AGING_DAYS) {
    return {
      action: `No next action — ${daysAging}d since activity`,
      reason: `Lead was last active ${daysAging} days ago with no follow-up scheduled. Set a next action to prevent this lead from slipping.`,
      urgency: daysAging >= STALE_THRESHOLD_DAYS ? "high" : "low",
      actionType: "review",
      isActionable: true,
    };
  }

  // ── Rule 9: NONE — Recently active, no immediate action ──
  return {
    action: "On track",
    reason: "Lead has recent activity and no urgent actions pending.",
    urgency: "none",
    actionType: "none",
    isActionable: false,
  };
}
