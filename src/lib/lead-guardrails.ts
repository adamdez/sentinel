/**
 * Lead Status Transition Guardrails & Optimistic Locking
 *
 * PR-1: Stage machine + next-action hard enforcement.
 *
 * Rules:
 *   1. All transitions must follow ALLOWED_TRANSITIONS — no skipping stages.
 *   2. Forward-moving transitions require next_action to be set (see REQUIRES_NEXT_ACTION).
 *   3. All writes use optimistic locking (lock_version compare-and-swap).
 *
 * "Forward-moving" = advancing toward disposition/closed.
 * "Backward-moving" = recycle to nurture, dead, or re-contact.
 */

import type { LeadStatus } from "@/lib/types";

const ALLOWED_TRANSITIONS: Record<LeadStatus, ReadonlyArray<LeadStatus>> = {
  staging: ["prospect", "dead"],
  prospect: ["lead", "negotiation", "nurture", "dead"],
  lead: ["negotiation", "nurture", "dead"],
  negotiation: ["disposition", "nurture", "dead"],
  disposition: ["closed", "nurture", "dead"],
  nurture: ["lead", "dead"],
  dead: ["nurture"],
  closed: [],
};

/**
 * Transitions that REQUIRE next_action to be set.
 * Any forward-moving transition is in this set.
 * Backward moves (→ nurture, → dead) do not require it, but still accept it.
 */
const REQUIRES_NEXT_ACTION: ReadonlySet<LeadStatus> = new Set([
  "prospect", "lead", "negotiation", "disposition",
]);

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
 * Returns true if a next_action string must be provided when transitioning to `next`.
 * Used by the stage API route to reject requests missing a next_action.
 */
export function requiresNextAction(next: LeadStatus): boolean {
  return REQUIRES_NEXT_ACTION.has(next);
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
 * Full stage transition validation: checks allowed transitions AND enforces
 * next_action presence where required.
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

  const needsAction = requiresNextAction(next);
  if (needsAction && !nextAction?.trim()) {
    return {
      valid: false,
      code: "missing_next_action",
      message: `A next_action is required when advancing to "${next}". Describe what happens next for this lead.`,
    };
  }

  return { valid: true, requiresNextAction: needsAction };
}

/**
 * Increments the optimistic lock version for concurrency-safe updates.
 * The caller must compare-and-swap: UPDATE ... WHERE lock_version = current.
 */
export function incrementLockVersion(current: number): number {
  return current + 1;
}
