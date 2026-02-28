/**
 * Lead Status Transition Guardrails & Optimistic Locking
 *
 * Dominion Sentinel Development Charter v3.0 §4 — Sacred Architectural Invariants:
 *   Five unbreakable domains: Signal → Scoring → Promotion → Workflow → Analytics.
 *   Status transitions must follow the deterministic state machine below.
 *   Optimistic locking (lock_version compare-and-swap) is mandatory for all
 *   lead mutations to prevent concurrent-claim race conditions.
 *
 * Charter v3.0 §8 — Phase 1 Requirements:
 *   "Optimistic locking on lead claims" and "Status transition guardrails"
 *   are ship-blocking deliverables.
 */

import type { LeadStatus } from "@/lib/types";

const ALLOWED_TRANSITIONS: Record<LeadStatus, ReadonlyArray<LeadStatus>> = {
  prospect: ["lead", "dead"],
  lead: ["negotiation", "nurture", "dead"],
  negotiation: ["disposition", "nurture", "dead"],
  disposition: ["closed", "nurture", "dead"],
  nurture: ["lead", "dead"],
  dead: [],
  closed: [],
};

/**
 * Returns true if transitioning from `current` to `next` is permitted
 * by the Charter-defined state machine. Terminal states (dead, closed)
 * allow no outbound transitions.
 */
export function validateStatusTransition(
  current: LeadStatus,
  next: LeadStatus
): boolean {
  const allowed = ALLOWED_TRANSITIONS[current];
  if (!allowed) return false;
  return allowed.includes(next);
}

/**
 * Increments the optimistic lock version for concurrency-safe updates.
 * The caller must compare-and-swap: UPDATE ... WHERE lock_version = current.
 */
export function incrementLockVersion(current: number): number {
  return current + 1;
}
