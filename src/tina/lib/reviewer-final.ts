import type {
  TinaTaxAdjustment,
  TinaWorkpaperLine,
  TinaWorkpaperSnapshot,
  TinaWorkpaperLineStatus,
  TinaWorkspaceDraft,
} from "@/tina/types";
import { findTinaReviewerPatternScore } from "@/tina/lib/reviewer-outcomes";
import {
  collectTinaAnalyzedTransactionGroups,
  measureTinaTransactionGroupAlignment,
  summarizeTinaTransactionGroups,
} from "@/tina/lib/transaction-group-analysis";
import { findTinaScenarioSignalsForDocuments } from "@/tina/lib/schedule-c-scenario-profile";

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

function resolveLineStatusWithReviewerLearning(
  draft: TinaWorkspaceDraft,
  status: TinaWorkpaperLineStatus
): TinaWorkpaperLineStatus {
  if (status !== "ready") return status;

  const reviewerFinalPattern = findTinaReviewerPatternScore(draft.reviewerOutcomeMemory, {
    targetType: "reviewer_final_line",
    phase: "package",
  });
  const taxAdjustmentPattern = findTinaReviewerPatternScore(draft.reviewerOutcomeMemory, {
    targetType: "tax_adjustment",
    phase: "tax_review",
  });

  if (
    reviewerFinalPattern?.confidenceImpact === "lower" ||
    taxAdjustmentPattern?.confidenceImpact === "lower"
  ) {
    return "needs_attention";
  }

  return status;
}

function buildReviewerLearningNote(draft: TinaWorkspaceDraft): string {
  const reviewerFinalPattern = findTinaReviewerPatternScore(draft.reviewerOutcomeMemory, {
    targetType: "reviewer_final_line",
    phase: "package",
  });
  const taxAdjustmentPattern = findTinaReviewerPatternScore(draft.reviewerOutcomeMemory, {
    targetType: "tax_adjustment",
    phase: "tax_review",
  });
  const lessons = Array.from(
    new Set([
      ...(reviewerFinalPattern?.lessons ?? []),
      ...(taxAdjustmentPattern?.lessons ?? []),
    ])
  );
  const pattern = reviewerFinalPattern ?? taxAdjustmentPattern;

  if (!pattern || pattern.confidenceImpact !== "lower") return "";

  let note = `Reviewer history is fragile for ${pattern.label} (${pattern.acceptanceScore}/100), so Tina is keeping this line in active review.`;
  if (lessons.length > 0) {
    note += ` Lessons: ${lessons.join(" ")}`;
  }

  return note;
}

function collectSourceFactValues(
  draft: TinaWorkspaceDraft,
  sourceDocumentIds: string[],
  labels: string[]
): string[] {
  const allowed = new Set(labels);
  return draft.sourceFacts
    .filter(
      (fact) => sourceDocumentIds.includes(fact.sourceDocumentId) && allowed.has(fact.label)
    )
    .map((fact) => fact.value);
}

function resolveBucketAwareStatus(
  draft: TinaWorkspaceDraft,
  adjustment: TinaTaxAdjustment,
  baseStatus: TinaWorkpaperLineStatus
): TinaWorkpaperLineStatus {
  const learnedStatus = resolveLineStatusWithReviewerLearning(draft, baseStatus);
  if (learnedStatus !== "ready") return learnedStatus;

  const bucketClues = collectSourceFactValues(draft, adjustment.sourceDocumentIds, [
    "Ledger bucket clue",
  ]);
  const transactionGroups = collectTinaAnalyzedTransactionGroups(draft, adjustment.sourceDocumentIds);
  if (bucketClues.length === 0 && transactionGroups.length === 0) return learnedStatus;

  const haystack = bucketClues.join(" ").toLowerCase();
  if (
    adjustment.kind === "carryforward_line" &&
    /\bpayroll|wages|contractor|1099|sales tax|inventory|cogs|owner|draw|distribution|transfer\b/.test(
      haystack
    )
  ) {
    return "needs_attention";
  }

  if (adjustment.kind === "carryforward_line") {
    const groupHaystack = transactionGroups.map((group) => group.classification).join(" ");
    if (
      /\bpayroll|contractor|sales_tax|inventory|owner_flow|transfer|related_party\b/.test(
        groupHaystack
      )
    ) {
      return "needs_attention";
    }
  }

  const alignment = measureTinaTransactionGroupAlignment({
    groups: transactionGroups,
    amount: adjustment.amount,
    fieldLabel: adjustment.title,
  });
  if (alignment === "mismatch") {
    return "needs_attention";
  }

  return learnedStatus;
}

function buildBucketProofNote(draft: TinaWorkspaceDraft, adjustment: TinaTaxAdjustment): string {
  const bucketClues = collectSourceFactValues(draft, adjustment.sourceDocumentIds, [
    "Ledger bucket clue",
  ]);
  if (bucketClues.length === 0) return "";
  return ` Ledger buckets behind this line: ${bucketClues.slice(0, 2).join("; ")}.`;
}

function buildTransactionGroupNote(draft: TinaWorkspaceDraft, adjustment: TinaTaxAdjustment): string {
  const groups = collectTinaAnalyzedTransactionGroups(draft, adjustment.sourceDocumentIds);
  if (groups.length === 0) return "";

  const alignment = measureTinaTransactionGroupAlignment({
    groups,
    amount: adjustment.amount,
    fieldLabel: adjustment.title,
  });
  const alignmentNote =
    alignment === "aligned"
      ? " Transaction-group totals align with the current amount."
      : alignment === "mismatch"
        ? " Transaction-group totals still do not align cleanly with the current amount."
        : "";

  return ` Transaction groups behind this line: ${summarizeTinaTransactionGroups(groups)}.${alignmentNote}`;
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
  const reviewerLearningNote = buildReviewerLearningNote(draft);
  const bucketProofNote = buildBucketProofNote(draft, adjustment);
  const transactionGroupNote = buildTransactionGroupNote(draft, adjustment);
  const scenarioSignals = findTinaScenarioSignalsForDocuments(draft, adjustment.sourceDocumentIds);
  const scenarioNote =
    scenarioSignals.length > 0
      ? ` Scenario families still visible: ${scenarioSignals
          .map((signal) => signal.title.toLowerCase())
          .slice(0, 3)
          .join(", ")}.`
      : "";

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
        status: resolveBucketAwareStatus(draft, adjustment, "ready"),
        summary: buildSummary(
          adjustment,
          `Tina can now carry this approved amount into her return-facing review layer.${reviewerLearningNote ? ` ${reviewerLearningNote}` : ""}${bucketProofNote}${transactionGroupNote}`
        ),
        ...shared,
      };
    case "continuity_review":
      return {
        id: `reviewer-final-${adjustment.id}`,
        kind: "coverage",
        layer: "reviewer_final",
        label: "Continuity review before return",
        amount: adjustment.amount,
        status: "needs_attention",
        summary: buildSummary(
          adjustment,
          `This continuity note still needs a human look before Tina trusts it in the return path.${scenarioNote}`
        ),
        ...shared,
      };
    case "depreciation_review":
      return {
        id: `reviewer-final-${adjustment.id}`,
        kind: "coverage",
        layer: "reviewer_final",
        label: "Depreciation review before return",
        amount: adjustment.amount,
        status: "needs_attention",
        summary: buildSummary(
          adjustment,
          `This depreciation-sensitive note still needs a human look before Tina trusts it in the return path.${scenarioNote}`
        ),
        ...shared,
      };
    case "owner_flow_separation":
      return {
        id: `reviewer-final-${adjustment.id}`,
        kind: "signal",
        layer: "reviewer_final",
        label: "Owner-flow separation review",
        amount: adjustment.amount,
        status: "needs_attention",
        summary: buildSummary(
          adjustment,
          `Owner-flow activity still needs separation before Tina should trust it in the return path.${scenarioNote}`
        ),
        ...shared,
      };
    case "transfer_classification":
      return {
        id: `reviewer-final-${adjustment.id}`,
        kind: "signal",
        layer: "reviewer_final",
        label: "Transfer classification review",
        amount: adjustment.amount,
        status: "needs_attention",
        summary: buildSummary(
          adjustment,
          `Transfer or intercompany activity still needs classification before Tina should trust it in the return path.${scenarioNote}`
        ),
        ...shared,
      };
    case "related_party_review":
      return {
        id: `reviewer-final-${adjustment.id}`,
        kind: "signal",
        layer: "reviewer_final",
        label: "Related-party review",
        amount: adjustment.amount,
        status: "needs_attention",
        summary: buildSummary(
          adjustment,
          `Related-party activity still needs explicit review before Tina should trust it in the return path.${scenarioNote}`
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
        status: resolveBucketAwareStatus(draft, adjustment, "ready"),
        summary: buildSummary(
          adjustment,
          `Tina can keep this approved payroll treatment visible in the return-facing layer.${reviewerLearningNote ? ` ${reviewerLearningNote}` : ""}${bucketProofNote}${transactionGroupNote}${scenarioNote}`
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
        status: resolveBucketAwareStatus(draft, adjustment, "ready"),
        summary: buildSummary(
          adjustment,
          `Tina can keep this approved contractor treatment visible in the return-facing layer.${reviewerLearningNote ? ` ${reviewerLearningNote}` : ""}${bucketProofNote}${transactionGroupNote}${scenarioNote}`
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
          `Inventory still needs careful form mapping, so Tina carries it as a return-facing review note.${scenarioNote}`
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
          `State scope can change the return package, so Tina keeps this visible in the final review layer.${scenarioNote}`
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

  const fragileReviewerFinalPattern = findTinaReviewerPatternScore(draft.reviewerOutcomeMemory, {
    targetType: "reviewer_final_line",
    phase: "package",
  });
  const fragileTaxAdjustmentPattern = findTinaReviewerPatternScore(draft.reviewerOutcomeMemory, {
    targetType: "tax_adjustment",
    phase: "tax_review",
  });
  if (
    fragileReviewerFinalPattern?.confidenceImpact === "lower" ||
    fragileTaxAdjustmentPattern?.confidenceImpact === "lower"
  ) {
    nextStep =
      "Reviewer history is still fragile, so keep these return-facing lines in review until Tina stops repeating the same correction pattern.";
  }

  return {
    lastRunAt: now,
    status: "complete",
    summary,
    nextStep,
    lines,
  };
}
