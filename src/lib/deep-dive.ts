export const DEEP_DIVE_NEXT_ACTION = "Deep Dive";
export const DEEP_DIVE_READY_NEXT_ACTION = "Call researched lead";

export type DeepDiveResearchQuality = "full" | "fallback" | "degraded" | "needs_review";

export interface DeepDiveReadinessInput {
  research_quality: DeepDiveResearchQuality | null;
  research_gap_count: number;
  likely_decision_maker: string | null;
}

export interface DeepDiveReadinessResult {
  ready: boolean;
  blockers: string[];
}

export interface DeepDiveActionableItem {
  key: string;
  label: string;
  sourceType: "deep_search_gap" | "deep_dive_blocker";
  sourceKey: string;
}

export function isDeepDiveNextAction(nextAction: string | null | undefined): boolean {
  return typeof nextAction === "string" && nextAction.trim().toLowerCase().startsWith("deep dive");
}

export function evaluateDeepDiveReadiness(input: DeepDiveReadinessInput): DeepDiveReadinessResult {
  const blockers: string[] = [];

  if (!input.research_quality) {
    blockers.push("Run Deep Search first.");
  } else if (input.research_quality === "degraded") {
    blockers.push("Deep Search is degraded and needs a stronger pass.");
  } else if (input.research_quality === "needs_review") {
    blockers.push("Deep Search still needs human review before calling.");
  }

  if (input.research_gap_count > 0) {
    blockers.push(`${input.research_gap_count} research gap${input.research_gap_count === 1 ? "" : "s"} still open.`);
  }

  if (!input.likely_decision_maker || !input.likely_decision_maker.trim()) {
    blockers.push("No decision-maker has been confirmed yet.");
  }

  return {
    ready: blockers.length === 0,
    blockers,
  };
}

function normalizeActionKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
}

export function buildResearchGapSourceKey(leadId: string, gap: string): string {
  return `${leadId}:${gap.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 80)}`;
}

export function buildDeepDiveActionableItems(input: DeepDiveReadinessInput & {
  leadId: string;
  research_gaps?: string[] | null;
}): DeepDiveActionableItem[] {
  const items: DeepDiveActionableItem[] = [];
  const seen = new Set<string>();

  const push = (item: DeepDiveActionableItem) => {
    if (!item.key || seen.has(item.key)) return;
    seen.add(item.key);
    items.push(item);
  };

  for (const gap of input.research_gaps ?? []) {
    const trimmed = typeof gap === "string" ? gap.trim() : "";
    if (!trimmed) continue;
    push({
      key: `gap:${normalizeActionKey(trimmed)}`,
      label: trimmed,
      sourceType: "deep_search_gap",
      sourceKey: buildResearchGapSourceKey(input.leadId, trimmed),
    });
  }

  if (!input.research_quality) {
    push({
      key: "blocker:run_deep_search",
      label: "Run Deep Search and confirm authority path.",
      sourceType: "deep_dive_blocker",
      sourceKey: `${input.leadId}:run_deep_search`,
    });
  } else if (input.research_quality === "degraded") {
    push({
      key: "blocker:stronger_pass",
      label: "Run a stronger Deep Search pass and verify official records.",
      sourceType: "deep_dive_blocker",
      sourceKey: `${input.leadId}:stronger_pass`,
    });
  } else if (input.research_quality === "needs_review") {
    push({
      key: "blocker:human_review",
      label: "Review the staged Deep Search findings before returning this file to calling.",
      sourceType: "deep_dive_blocker",
      sourceKey: `${input.leadId}:human_review`,
    });
  }

  if (!input.likely_decision_maker || !input.likely_decision_maker.trim()) {
    push({
      key: "blocker:decision_maker",
      label: "Confirm the decision-maker or authority contact path.",
      sourceType: "deep_dive_blocker",
      sourceKey: `${input.leadId}:decision_maker`,
    });
  }

  return items;
}

export function getDefaultDeepDiveDueAt(now = new Date()): string {
  const due = new Date(now);

  // Earlier-day parks should surface again in the same day's prep block.
  if (due.getHours() < 15) {
    due.setHours(16, 30, 0, 0);
    return due.toISOString();
  }

  // Late-day parks should be ready for the next morning prep block.
  due.setDate(due.getDate() + 1);
  due.setHours(8, 30, 0, 0);
  return due.toISOString();
}
