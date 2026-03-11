import type { CoachContext, CoachItem, CoachOutput, CoachSurface } from "./coach-types";
import { COACH_ITEMS } from "./coach-content";

/**
 * Evaluate all coach items against the current surface + context.
 * Pure function — no side effects, no API calls.
 * Target: < 1ms execution time.
 */
export function evaluateCoach(
  surface: CoachSurface,
  context: CoachContext
): CoachOutput {
  const ctx = { ...context, surface };

  const applicable = COACH_ITEMS.filter(
    (item) => item.surfaces.includes(surface) && item.condition(ctx)
  );

  const sorted = applicable.sort((a, b) => a.priority - b.priority);

  return {
    blockers: sorted.filter((i) => i.category === "blocker"),
    nextSteps: sorted.filter((i) => i.category === "next_step"),
    explainers: sorted.filter((i) => i.category === "explainer"),
    tips: sorted.filter((i) => i.category === "tip"),
  };
}

/** Resolve dynamic body text */
export function resolveBody(item: CoachItem, ctx: CoachContext): string {
  return typeof item.body === "function" ? item.body(ctx) : item.body;
}
