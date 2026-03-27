import type {
  TinaTaxAdjustment,
  TinaWorkpaperLine,
  TinaWorkpaperSnapshot,
  TinaWorkspaceDraft,
} from "@/tina/types";

function createEmptySnapshot(): TinaWorkpaperSnapshot {
  return {
    lastRunAt: null,
    status: "idle",
    summary: "Tina has not built the reviewer-final layer yet.",
    nextStep: "Approve tax adjustments first, then let Tina build the first return-facing review lines.",
    lines: [],
  };
}

export function createDefaultTinaReviewerFinalSnapshot(): TinaWorkpaperSnapshot {
  return createEmptySnapshot();
}

export function markTinaReviewerFinalStale(
  snapshot: TinaWorkpaperSnapshot
): TinaWorkpaperSnapshot {
  if (snapshot.status === "idle" || snapshot.status === "stale") return snapshot;

  return {
    ...snapshot,
    status: "stale",
    summary:
      "Your tax adjustments or review calls changed, so Tina should rebuild the reviewer-final layer.",
    nextStep:
      "Build the reviewer-final layer again so Tina does not lean on old return-facing review lines.",
  };
}

function resolveBaseLine(
  draft: TinaWorkspaceDraft,
  adjustment: TinaTaxAdjustment
): TinaWorkpaperLine | null {
  const aiCleanupLineId = adjustment.aiCleanupLineIds[0] ?? null;
  if (!aiCleanupLineId) return null;
  return draft.aiCleanup.lines.find((line) => line.id === aiCleanupLineId) ?? null;
}

function buildSummary(adjustment: TinaTaxAdjustment, fallback: string): string {
  const reviewerNote = adjustment.reviewerNotes.trim();
  return reviewerNote
    ? `${fallback} Reviewer note: ${reviewerNote}`
    : fallback;
}

function buildLineFromAdjustment(
  draft: TinaWorkspaceDraft,
  adjustment: TinaTaxAdjustment
): TinaWorkpaperLine {
  const baseLine = resolveBaseLine(draft, adjustment);
  const shared = {
    sourceDocumentIds: adjustment.sourceDocumentIds,
    sourceFactIds: adjustment.sourceFactIds,
    issueIds: [],
    derivedFromLineIds: adjustment.aiCleanupLineIds,
    cleanupSuggestionIds: baseLine?.cleanupSuggestionIds ?? [],
    taxAdjustmentIds: [adjustment.id],
  };

  switch (adjustment.kind) {
    case "carryforward_line":
      return {
        id: `reviewer-final-${adjustment.id}`,
        kind: baseLine?.kind === "income" || baseLine?.kind === "expense" || baseLine?.kind === "net"
          ? baseLine.kind
          : "signal",
        layer: "reviewer_final",
        label:
          baseLine?.kind === "income"
            ? "Gross receipts candidate"
            : baseLine?.kind === "expense"
              ? "Business expense candidate"
              : baseLine?.kind === "net"
                ? "Net business result candidate"
                : adjustment.title,
        amount: adjustment.amount,
        status: "ready",
        summary: buildSummary(
          adjustment,
          "Tina can now carry this approved amount into her return-facing review layer."
        ),
        ...shared,
      };
    case "timing_review":
      return {
        id: `reviewer-final-${adjustment.id}`,
        kind: "coverage",
        layer: "reviewer_final",
        label: "Timing check before return",
        amount: adjustment.amount,
        status: "needs_attention",
        summary: buildSummary(
          adjustment,
          "This timing note still needs a human look before Tina trusts it in the return path."
        ),
        ...shared,
      };
    case "sales_tax_exclusion":
      return {
        id: `reviewer-final-${adjustment.id}`,
        kind: "signal",
        layer: "reviewer_final",
        label: "Sales tax should stay out of income",
        amount: adjustment.amount,
        status: "needs_attention",
        summary: buildSummary(
          adjustment,
          "Tina is carrying this approved sales-tax treatment into the return-facing layer for careful handling."
        ),
        ...shared,
      };
    case "payroll_classification":
      return {
        id: `reviewer-final-${adjustment.id}`,
        kind: "expense",
        layer: "reviewer_final",
        label: "Payroll expense candidate",
        amount: adjustment.amount,
        status: "ready",
        summary: buildSummary(
          adjustment,
          "Tina can keep this approved payroll treatment visible in the return-facing layer."
        ),
        ...shared,
      };
    case "contractor_classification":
      return {
        id: `reviewer-final-${adjustment.id}`,
        kind: "expense",
        layer: "reviewer_final",
        label: "Contract labor candidate",
        amount: adjustment.amount,
        status: "ready",
        summary: buildSummary(
          adjustment,
          "Tina can keep this approved contractor treatment visible in the return-facing layer."
        ),
        ...shared,
      };
    case "inventory_treatment":
      return {
        id: `reviewer-final-${adjustment.id}`,
        kind: "signal",
        layer: "reviewer_final",
        label: "Inventory or COGS review",
        amount: adjustment.amount,
        status: "needs_attention",
        summary: buildSummary(
          adjustment,
          "Inventory still needs careful form mapping, so Tina carries it as a return-facing review note."
        ),
        ...shared,
      };
    case "multistate_scope":
      return {
        id: `reviewer-final-${adjustment.id}`,
        kind: "signal",
        layer: "reviewer_final",
        label: "State scope review",
        amount: adjustment.amount,
        status: "needs_attention",
        summary: buildSummary(
          adjustment,
          "State scope can change the return package, so Tina keeps this visible in the final review layer."
        ),
        ...shared,
      };
  }
}

export function buildTinaReviewerFinalSnapshot(
  draft: TinaWorkspaceDraft
): TinaWorkpaperSnapshot {
  const now = new Date().toISOString();

  if (draft.taxAdjustments.status !== "complete") {
    return {
      ...createDefaultTinaReviewerFinalSnapshot(),
      lastRunAt: now,
      status: draft.taxAdjustments.status === "stale" ? "stale" : "idle",
      summary: "Tina needs a complete tax-adjustment layer before she can build return-facing review lines.",
      nextStep: "Build tax adjustments first.",
    };
  }

  const approvedAdjustments = draft.taxAdjustments.adjustments.filter(
    (adjustment) => adjustment.status === "approved"
  );

  if (approvedAdjustments.length === 0) {
    return {
      ...createDefaultTinaReviewerFinalSnapshot(),
      lastRunAt: now,
      summary: "Tina does not have any human-approved tax adjustments ready for the return-facing layer yet.",
      nextStep: "Approve the tax adjustments you trust first.",
    };
  }

  const lines = approvedAdjustments.map((adjustment) =>
    buildLineFromAdjustment(draft, adjustment)
  );

  const waitingAdjustmentCount = draft.taxAdjustments.adjustments.filter(
    (adjustment) => adjustment.status !== "approved" && adjustment.status !== "rejected"
  ).length;
  const needsAttentionCount = lines.filter((line) => line.status === "needs_attention").length;

  let summary = `Tina built ${lines.length} reviewer-final line${lines.length === 1 ? "" : "s"} from ${approvedAdjustments.length} approved tax adjustment${approvedAdjustments.length === 1 ? "" : "s"}.`;
  if (waitingAdjustmentCount > 0) {
    summary += ` ${waitingAdjustmentCount} more ${waitingAdjustmentCount === 1 ? "still needs" : "still need"} review before it can join this layer.`;
  }

  let nextStep =
    "These lines are the first return-facing review layer. Tina still needs a human before anything becomes a filing package.";
  if (needsAttentionCount > 0) {
    nextStep =
      "Some approved items still need careful form mapping, so keep those in review before Tina treats them like settled return lines.";
  }

  return {
    lastRunAt: now,
    status: "complete",
    summary,
    nextStep,
    lines,
  };
}
