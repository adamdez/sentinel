import type {
  TinaCleanupPlan,
  TinaCleanupSuggestion,
  TinaCleanupSuggestionPriority,
  TinaCleanupSuggestionType,
  TinaReviewItem,
  TinaWorkpaperLine,
  TinaWorkspaceDraft,
} from "@/tina/types";

function createEmptyPlan(): TinaCleanupPlan {
  return {
    lastRunAt: null,
    status: "idle",
    summary: "Tina has not built cleanup ideas yet.",
    nextStep: "Build the money story first, then ask Tina for cleanup ideas.",
    suggestions: [],
  };
}

export function createDefaultTinaCleanupPlan(): TinaCleanupPlan {
  return createEmptyPlan();
}

export function markTinaCleanupPlanStale(plan: TinaCleanupPlan): TinaCleanupPlan {
  if (plan.status === "idle" || plan.status === "stale") return plan;

  return {
    ...plan,
    status: "stale",
    summary: "Your papers or review state changed, so Tina should rebuild her cleanup ideas.",
    nextStep: "Build cleanup ideas again so Tina does not lean on old cleanup advice.",
  };
}

function mergeSuggestion(
  existing: TinaCleanupSuggestion | undefined,
  generated: TinaCleanupSuggestion
): TinaCleanupSuggestion {
  if (!existing) return generated;

  return {
    ...generated,
    status: existing.status,
    reviewerNotes: existing.reviewerNotes,
  };
}

function buildPriorityFromIssue(issue: TinaReviewItem): TinaCleanupSuggestionPriority {
  if (issue.severity === "blocking" || issue.severity === "needs_attention") return "important";
  return "watch";
}

function buildLineSuggestion(line: TinaWorkpaperLine): TinaCleanupSuggestion {
  return {
    id: `cleanup-${line.id}`,
    type: "reconcile_line",
    priority: line.issueIds.length > 0 ? "important" : "helpful",
    status: "suggested",
    title: `Double-check ${line.label.toLowerCase()}`,
    summary:
      line.issueIds.length > 0
        ? "Tina wants this line reviewed before any cleanup step touches it."
        : "Tina wants to look at this line before moving it into the cleanup layer.",
    suggestedAction:
      line.issueIds.length > 0
        ? "Open the linked paper or issue, decide what belongs here, and only then let Tina clean it up."
        : "Review this line, then approve it if Tina should carry it into the cleanup layer.",
    whyItMatters:
      "A shaky starting number can flow into later tax work, so Tina keeps cleanup separate from the raw money story.",
    workpaperLineIds: [line.id],
    issueIds: line.issueIds,
    sourceDocumentIds: line.sourceDocumentIds,
    sourceFactIds: line.sourceFactIds,
    reviewerNotes: "",
  };
}

function buildIssueFallbackSuggestion(issue: TinaReviewItem): TinaCleanupSuggestion {
  return {
    id: `cleanup-issue-${issue.id}`,
    type: "reconcile_line",
    priority: buildPriorityFromIssue(issue),
    status: "suggested",
    title: issue.title,
    summary: issue.summary,
    suggestedAction:
      "Resolve this issue before Tina tries to clean up the money story that depends on it.",
    whyItMatters:
      "Cleanup should never smooth over an unresolved paper conflict or missing fact.",
    workpaperLineIds: [],
    issueIds: [issue.id],
    sourceDocumentIds: issue.documentId ? [issue.documentId] : [],
    sourceFactIds: issue.factId ? [issue.factId] : [],
    reviewerNotes: "",
  };
}

function buildSignalSuggestion(args: {
  id: string;
  title: string;
  summary: string;
  suggestedAction: string;
  whyItMatters: string;
  priority: TinaCleanupSuggestionPriority;
  line: TinaWorkpaperLine;
  type?: TinaCleanupSuggestionType;
}): TinaCleanupSuggestion {
  return {
    id: args.id,
    type: args.type ?? "confirm_scope",
    priority: args.priority,
    status: "suggested",
    title: args.title,
    summary: args.summary,
    suggestedAction: args.suggestedAction,
    whyItMatters: args.whyItMatters,
    workpaperLineIds: [args.line.id],
    issueIds: args.line.issueIds,
    sourceDocumentIds: args.line.sourceDocumentIds,
    sourceFactIds: args.line.sourceFactIds,
    reviewerNotes: "",
  };
}

function buildSignalSuggestions(draft: TinaWorkspaceDraft): TinaCleanupSuggestion[] {
  return draft.workpapers.lines.flatMap((line) => {
    if (line.kind !== "signal") return [];

    switch (line.label) {
      case "Payroll clue":
        return draft.profile.hasPayroll
          ? []
          : [
              buildSignalSuggestion({
                id: `cleanup-signal-payroll-${line.id}`,
                title: "Check whether payroll belongs in this business",
                summary:
                  "A saved paper hints at payroll, but Tina does not see payroll turned on in the organizer yet.",
                suggestedAction:
                  "If this business had payroll, turn payroll on in the organizer and add payroll papers before cleanup keeps going.",
                whyItMatters:
                  "Payroll changes what records Tina needs and how she separates wages from ordinary spending.",
                priority: "important",
                line,
              }),
            ];
      case "Contractor clue":
        return draft.profile.paysContractors
          ? []
          : [
              buildSignalSuggestion({
                id: `cleanup-signal-contractors-${line.id}`,
                title: "Check whether contractor payments need their own bucket",
                summary:
                  "A saved paper hints at contractor payments, but that is not marked in the organizer yet.",
                suggestedAction:
                  "If contractors were paid, turn that on and add contractor support before Tina cleans those payments up.",
                whyItMatters:
                  "Contractor payments often need their own review path and 1099 follow-up.",
                priority: "helpful",
                line,
              }),
            ];
      case "Sales tax clue":
        return draft.profile.collectsSalesTax
          ? []
          : [
              buildSignalSuggestion({
                id: `cleanup-signal-sales-tax-${line.id}`,
                title: "Check whether sales tax should stay out of income",
                summary:
                  "A saved paper hints at sales tax activity, but Tina does not see sales tax marked in the organizer yet.",
                suggestedAction:
                  "If sales tax was collected, turn that on so Tina can keep collected tax separate from business income.",
                whyItMatters:
                  "Collected sales tax should not be cleaned up like ordinary income when it belongs in a pass-through bucket.",
                priority: "important",
                line,
              }),
            ];
      case "Inventory clue":
        return draft.profile.hasInventory
          ? []
          : [
              buildSignalSuggestion({
                id: `cleanup-signal-inventory-${line.id}`,
                title: "Check whether inventory rules belong here",
                summary:
                  "A saved paper hints at inventory, but Tina does not see inventory turned on in the organizer yet.",
                suggestedAction:
                  "If inventory exists, turn it on and add the year-end inventory papers before Tina cleans those costs.",
                whyItMatters:
                  "Inventory changes how Tina treats purchases and cost of goods sold.",
                priority: "important",
                line,
              }),
            ];
      case "State clue":
        return draft.profile.hasIdahoActivity
          ? []
          : [
              buildSignalSuggestion({
                id: `cleanup-signal-state-${line.id}`,
                title: "Check whether another state belongs in the scope",
                summary:
                  "A saved paper hints at activity outside Washington, but Tina does not see that in the organizer yet.",
                suggestedAction:
                  "Confirm whether that state activity is real before Tina cleans up anything that may affect state filings.",
                whyItMatters:
                  "State scope changes what Tina asks for and what she can safely prepare.",
                priority: "helpful",
                line,
              }),
            ];
      default:
        return [];
    }
  });
}

export function buildTinaCleanupPlan(draft: TinaWorkspaceDraft): TinaCleanupPlan {
  const now = new Date().toISOString();
  const existingMap = new Map(
    draft.cleanupPlan.suggestions.map((suggestion) => [suggestion.id, suggestion])
  );

  if (draft.workpapers.status === "idle") {
    return {
      ...createDefaultTinaCleanupPlan(),
      lastRunAt: now,
      summary: "Tina needs the money story first before she can suggest cleanup work.",
      nextStep: "Build the money story after reading your books or bank papers.",
    };
  }

  if (draft.workpapers.status !== "complete") {
    return {
      ...createDefaultTinaCleanupPlan(),
      lastRunAt: now,
      status: "stale",
      summary: "Tina needs a fresh, trusted money story before cleanup ideas can be trusted.",
      nextStep: "Refresh the money story and conflict check first.",
    };
  }

  const generatedSuggestions: TinaCleanupSuggestion[] = [];
  const seenIds = new Set<string>();

  draft.workpapers.lines.forEach((line) => {
    if (line.status === "needs_attention") {
      const suggestion = buildLineSuggestion(line);
      generatedSuggestions.push(suggestion);
      seenIds.add(suggestion.id);
    }
  });

  buildSignalSuggestions(draft).forEach((suggestion) => {
    if (seenIds.has(suggestion.id)) return;
    generatedSuggestions.push(suggestion);
    seenIds.add(suggestion.id);
  });

  draft.issueQueue.items
    .filter((issue) => issue.status === "open" && issue.category === "books")
    .forEach((issue) => {
      const isRepresented = generatedSuggestions.some((suggestion) =>
        suggestion.issueIds.includes(issue.id)
      );
      if (isRepresented) return;

      const suggestion = buildIssueFallbackSuggestion(issue);
      generatedSuggestions.push(suggestion);
      seenIds.add(suggestion.id);
    });

  const suggestions = generatedSuggestions.map((suggestion) =>
    mergeSuggestion(existingMap.get(suggestion.id), suggestion)
  );

  if (suggestions.length === 0) {
    return {
      ...createDefaultTinaCleanupPlan(),
      lastRunAt: now,
      status: "complete",
      summary: "Tina does not see a cleanup move she trusts yet.",
      nextStep: "Keep bringing papers or move into deeper tax review once the money story stays clean.",
    };
  }

  const approvedCount = suggestions.filter((suggestion) => suggestion.status === "approved").length;
  const pendingCount = suggestions.filter((suggestion) => suggestion.status === "suggested").length;
  const blockedCount = suggestions.filter((suggestion) => suggestion.issueIds.length > 0).length;

  let summary = `Tina found ${suggestions.length} cleanup idea${suggestions.length === 1 ? "" : "s"} for the next layer.`;
  if (approvedCount > 0) {
    summary += ` ${approvedCount} already ${approvedCount === 1 ? "has" : "have"} review approval.`;
  }

  let nextStep =
    "Review the cleanup ideas and decide which ones Tina should be allowed to carry into the AI cleanup layer.";
  if (blockedCount > 0) {
    nextStep = "Resolve the linked paper conflicts first, then approve the cleanup ideas that still make sense.";
  } else if (pendingCount === 0) {
    nextStep = "Tina has review decisions for every cleanup idea in this plan.";
  }

  return {
    lastRunAt: now,
    status: "complete",
    summary,
    nextStep,
    suggestions,
  };
}
