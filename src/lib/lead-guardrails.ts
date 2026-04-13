/**
 * Lead Status Transition Guardrails & Optimistic Locking
 *
 * PR-1: Stage machine + optimistic locking.
 *
 * Rules:
 *   1. All transitions must follow ALLOWED_TRANSITIONS — no skipping stages.
 *   2. All writes use optimistic locking (lock_version compare-and-swap).
 *
 * "Forward-moving" = advancing toward disposition/closed.
 * "Backward-moving" = recycle to nurture, dead, or re-contact.
 */

import type { LeadStatus } from "@/lib/types";

const ALLOWED_TRANSITIONS: Record<LeadStatus, ReadonlyArray<LeadStatus>> = {
  staging: ["prospect", "dead"],
  prospect: ["lead", "active", "nurture", "dead"],
  lead: ["active", "nurture", "dead"],
  active: ["negotiation", "nurture", "dead"],
  negotiation: ["disposition", "nurture", "dead"],
  disposition: ["closed", "nurture", "dead"],
  nurture: ["lead", "active", "dead"],
  dead: ["lead", "nurture"],
  closed: [],
};

/**
 * Returns true if transitioning from `current` to `next` is permitted.
 */
export function validateStatusTransition(
  current: LeadStatus,
  next: LeadStatus
): boolean {
  const allowed = ALLOWED_TRANSITIONS[current];
  if (!allowed) {
    console.warn(`[Guardrail] Attempted ${current} → ${next} — no transitions defined for "${current}"`);
    return false;
  }
  const valid = allowed.includes(next);
  if (!valid) {
    console.warn(`[Guardrail] Attempted ${current} → ${next} — allowed: [${allowed.join(", ")}]`);
  }
  return valid;
}

export function getAllowedTransitions(status: LeadStatus): ReadonlyArray<LeadStatus> {
  return ALLOWED_TRANSITIONS[status] ?? [];
}

/**
 * Next-action text is no longer required for stage transitions.
 */
export function requiresNextAction(next: LeadStatus, current?: LeadStatus): boolean {
  void next;
  void current;
  return false;
}

export interface StageValidationResult {
  valid: true;
  requiresNextAction: boolean;
}

export interface StageValidationError {
  valid: false;
  code: "invalid_transition" | "missing_next_action";
  message: string;
}

/**
 * Full stage transition validation: checks allowed transitions only.
 *
 * Returns a typed result — no exceptions.
 */
export function validateStageTransition(
  current: LeadStatus,
  next: LeadStatus,
  nextAction: string | null | undefined,
): StageValidationResult | StageValidationError {
  if (!validateStatusTransition(current, next)) {
    return {
      valid: false,
      code: "invalid_transition",
      message: `Cannot transition from "${current}" to "${next}". Allowed: [${getAllowedTransitions(current).join(", ")}]`,
    };
  }

  void nextAction;
  return { valid: true, requiresNextAction: false };
}

/**
 * Increments the optimistic lock version for concurrency-safe updates.
 * The caller must compare-and-swap: UPDATE ... WHERE lock_version = current.
 */
export function incrementLockVersion(current: number): number {
  return current + 1;
}
