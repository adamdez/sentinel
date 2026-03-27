import type {
  TinaAiCleanupSnapshot,
  TinaCleanupSuggestion,
  TinaWorkpaperLine,
  TinaWorkspaceDraft,
} from "@/tina/types";

function createEmptyAiCleanup(): TinaAiCleanupSnapshot {
  return {
    lastRunAt: null,
    status: "idle",
    summary: "Tina has not built the AI cleanup layer yet.",
    nextStep: "Approve cleanup ideas first, then let Tina carry them into the cleanup layer.",
    lines: [],
  };
}

export function createDefaultTinaAiCleanupSnapshot(): TinaAiCleanupSnapshot {
  return createEmptyAiCleanup();
}

export function markTinaAiCleanupStale(
  snapshot: TinaAiCleanupSnapshot
): TinaAiCleanupSnapshot {
  if (snapshot.status === "idle" || snapshot.status === "stale") return snapshot;

  return {
    ...snapshot,
    status: "stale",
    summary: "Your cleanup approvals or source papers changed, so Tina should rebuild the AI cleanup layer.",
    nextStep: "Build the AI cleanup layer again so Tina does not lean on old approved cleanup lines.",
  };
}

function buildCleanupLine(args: {
  baseLine: TinaWorkpaperLine;
  suggestion: TinaCleanupSuggestion;
}): TinaWorkpaperLine {
  const reviewerNote = args.suggestion.reviewerNotes.trim();

  return {
    id: `ai-cleanup-${args.suggestion.id}-${args.baseLine.id}`,
    kind: args.baseLine.kind,
    layer: "ai_cleanup",
    label: args.baseLine.label,
    amount: args.baseLine.amount,
    status: "ready",
    summary: reviewerNote
      ? `Human approved this cleanup step. Reviewer note: ${reviewerNote}`
      : `Human approved Tina carrying this line into the cleanup layer for deeper cleanup work.`,
    sourceDocumentIds: args.baseLine.sourceDocumentIds,
    sourceFactIds: args.baseLine.sourceFactIds,
    issueIds: [],
    derivedFromLineIds: [args.baseLine.id],
    cleanupSuggestionIds: [args.suggestion.id],
  };
}

export function buildTinaAiCleanupSnapshot(draft: TinaWorkspaceDraft): TinaAiCleanupSnapshot {
  const now = new Date().toISOString();

  if (draft.workpapers.status !== "complete") {
    return {
      ...createDefaultTinaAiCleanupSnapshot(),
      lastRunAt: now,
      status: draft.workpapers.status === "stale" ? "stale" : "idle",
      summary: "Tina needs a trusted money story before she can build the AI cleanup layer.",
      nextStep: "Finish the money story and conflict check first.",
    };
  }

  if (draft.cleanupPlan.status !== "complete") {
    return {
      ...createDefaultTinaAiCleanupSnapshot(),
      lastRunAt: now,
      status: draft.cleanupPlan.status === "stale" ? "stale" : "idle",
      summary: "Tina needs a current cleanup plan before she can build the AI cleanup layer.",
      nextStep: "Build cleanup ideas and review them first.",
    };
  }

  const workpaperLineMap = new Map(draft.workpapers.lines.map((line) => [line.id, line]));
  const approvedSuggestions = draft.cleanupPlan.suggestions.filter(
    (suggestion) => suggestion.status === "approved"
  );

  if (approvedSuggestions.length === 0) {
    return {
      ...createDefaultTinaAiCleanupSnapshot(),
      lastRunAt: now,
      summary: "Tina does not have any approved cleanup ideas to carry forward yet.",
      nextStep: "Approve the cleanup ideas you trust first.",
    };
  }

  const blockedApprovals = approvedSuggestions.filter((suggestion) => suggestion.issueIds.length > 0);
  const eligibleSuggestions = approvedSuggestions.filter((suggestion) => suggestion.issueIds.length === 0);

  const lines = eligibleSuggestions.flatMap((suggestion) =>
    suggestion.workpaperLineIds
      .map((lineId) => workpaperLineMap.get(lineId))
      .filter((line): line is TinaWorkpaperLine => Boolean(line))
      .map((line) => buildCleanupLine({ baseLine: line, suggestion }))
  );

  if (lines.length === 0) {
    return {
      ...createDefaultTinaAiCleanupSnapshot(),
      lastRunAt: now,
      status: blockedApprovals.length > 0 ? "stale" : "idle",
      summary:
        blockedApprovals.length > 0
          ? "Tina has approved cleanup ideas, but they still point at unresolved issues."
          : "Tina does not have an approved cleanup line she can safely carry forward yet.",
      nextStep:
        blockedApprovals.length > 0
          ? "Resolve the linked issues first, then rebuild the AI cleanup layer."
          : "Approve a cleanup idea that points at a real workpaper line first.",
    };
  }

  let summary = `Tina built ${lines.length} AI cleanup line${lines.length === 1 ? "" : "s"} from ${eligibleSuggestions.length} approved cleanup idea${eligibleSuggestions.length === 1 ? "" : "s"}.`;
  if (blockedApprovals.length > 0) {
    summary += ` ${blockedApprovals.length} approved idea${blockedApprovals.length === 1 ? " is" : "s are"} still blocked by linked issues and stayed out.`;
  }

  return {
    lastRunAt: now,
    status: "complete",
    summary,
    nextStep:
      "These lines are still cleanup-only. Tina can compare and organize them, but they are not tax adjustments yet.",
    lines,
  };
}
