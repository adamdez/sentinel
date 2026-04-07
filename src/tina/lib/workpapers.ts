import type {
  TinaBookTieOutEntry,
  TinaIssueQueue,
  TinaWorkpaperLine,
  TinaWorkpaperLineKind,
  TinaWorkpaperSnapshot,
  TinaWorkspaceDraft,
} from "@/tina/types";

const SIGNAL_LABELS = new Map<string, string>([
  ["Payroll clue", "This paper hints that payroll records should be part of the tax story."],
  ["Sales tax clue", "This paper hints that sales tax activity should be reviewed."],
  ["Contractor clue", "This paper hints that contractor payments should be checked."],
  ["Inventory clue", "This paper hints that inventory rules may matter here."],
  ["State clue", "This paper hints that another state may affect the tax scope."],
  ["Owner draw clue", "This paper hints that owner flows may be mixed into business activity."],
  ["Intercompany transfer clue", "This paper hints that transfers may still be mixed into ordinary activity."],
]);

function normalizeForComparison(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parseMoneyValue(value: string): number | null {
  const sanitized = value.replace(/[$,\s]/g, "").replace(/[()]/g, "");
  if (!sanitized || !/^-?\d*\.?\d+$/.test(sanitized)) return null;
  const parsed = Number(sanitized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function buildDefaultSummary(): TinaWorkpaperSnapshot {
  return {
    lastRunAt: null,
    status: "idle",
    summary: "Tina has not built the first money story yet.",
    nextStep: "Ask Tina to build the money story after she has read your books or bank papers.",
    lines: [],
  };
}

export function createDefaultTinaWorkpaperSnapshot(): TinaWorkpaperSnapshot {
  return buildDefaultSummary();
}

export function markTinaWorkpapersStale(
  workpapers: TinaWorkpaperSnapshot
): TinaWorkpaperSnapshot {
  if (workpapers.status === "idle" || workpapers.status === "stale") return workpapers;

  return {
    ...workpapers,
    status: "stale",
    summary: "Your papers or answers changed, so Tina should rebuild the money story.",
    nextStep: "Build the money story again so Tina does not lean on old numbers.",
  };
}

function buildLineId(prefix: string, documentId: string): string {
  return `${prefix}-${documentId}`;
}

function relatedIssueIds(
  issueQueue: TinaIssueQueue,
  documentId: string,
  factId?: string
): string[] {
  return issueQueue.items
    .filter(
      (item) =>
        item.status === "open" &&
        (item.documentId === documentId || (factId ? item.factId === factId : false))
    )
    .map((item) => item.id);
}

function buildLineStatus(
  issueIds: string[],
  issueQueueIsCurrent: boolean,
  defaultStatus?: TinaWorkpaperLine["status"]
): TinaWorkpaperLine["status"] {
  if (defaultStatus) return defaultStatus;
  if (!issueQueueIsCurrent) return "waiting";
  return issueIds.length > 0 ? "needs_attention" : "ready";
}

function createLine(args: {
  id: string;
  kind: TinaWorkpaperLineKind;
  label: string;
  summary: string;
  amount?: number | null;
  sourceDocumentIds: string[];
  sourceFactIds: string[];
  issueIds: string[];
  issueQueueIsCurrent: boolean;
  status?: TinaWorkpaperLine["status"];
}): TinaWorkpaperLine {
  return {
    id: args.id,
    kind: args.kind,
    layer: "book_original",
    label: args.label,
    amount: args.amount ?? null,
    status: buildLineStatus(args.issueIds, args.issueQueueIsCurrent, args.status),
    summary: args.summary,
    sourceDocumentIds: args.sourceDocumentIds,
    sourceFactIds: args.sourceFactIds,
    issueIds: args.issueIds,
    derivedFromLineIds: [],
    cleanupSuggestionIds: [],
  };
}

function buildEntryLines(
  entry: TinaBookTieOutEntry,
  issueQueueIsCurrent: boolean
): TinaWorkpaperLine[] {
  const lines: TinaWorkpaperLine[] = [];

  if (typeof entry.moneyIn === "number" && entry.moneyIn > 0) {
    lines.push(
      createLine({
        id: buildLineId("income", entry.documentId),
        kind: "income",
        label: `${entry.label} money in`,
        amount: entry.moneyIn,
        summary: `Tina can currently support about ${formatMoney(entry.moneyIn)} coming in from this paper.`,
        sourceDocumentIds: [entry.documentId],
        sourceFactIds: entry.sourceFactIds,
        issueIds: entry.issueIds,
        issueQueueIsCurrent,
        status: entry.status,
      })
    );
  }

  if (typeof entry.moneyOut === "number" && entry.moneyOut > 0) {
    lines.push(
      createLine({
        id: buildLineId("expense", entry.documentId),
        kind: "expense",
        label: `${entry.label} money out`,
        amount: entry.moneyOut,
        summary: `Tina can currently support about ${formatMoney(entry.moneyOut)} going out from this paper.`,
        sourceDocumentIds: [entry.documentId],
        sourceFactIds: entry.sourceFactIds,
        issueIds: entry.issueIds,
        issueQueueIsCurrent,
        status: entry.status,
      })
    );
  }

  if (typeof entry.net === "number") {
    lines.push(
      createLine({
        id: buildLineId("net", entry.documentId),
        kind: "net",
        label: `${entry.label} net movement`,
        amount: entry.net,
        summary:
          entry.net >= 0
            ? `This paper currently ties out to about ${formatMoney(entry.net)} more in than out.`
            : `This paper currently ties out to about ${formatMoney(Math.abs(entry.net))} more out than in.`,
        sourceDocumentIds: [entry.documentId],
        sourceFactIds: entry.sourceFactIds,
        issueIds: entry.issueIds,
        issueQueueIsCurrent,
        status: entry.status,
      })
    );
  }

  if (entry.dateCoverage) {
    lines.push(
      createLine({
        id: buildLineId("coverage", entry.documentId),
        kind: "coverage",
        label: `${entry.label} date coverage`,
        summary: `Tina sees dates from ${entry.dateCoverage}.`,
        sourceDocumentIds: [entry.documentId],
        sourceFactIds: entry.sourceFactIds,
        issueIds: entry.issueIds,
        issueQueueIsCurrent,
        status: entry.status,
      })
    );
  }

  return lines;
}

export function buildTinaWorkpaperSnapshot(draft: TinaWorkspaceDraft): TinaWorkpaperSnapshot {
  const documentMap = new Map(draft.documents.map((document) => [document.id, document]));
  const issueQueueIsCurrent = draft.issueQueue.status === "complete";
  const tieOutIsCurrent = draft.bookTieOut.status === "complete";

  if (!tieOutIsCurrent) {
    const hasBookDocuments = draft.documents.some((document) => document.requestId === "quickbooks" || document.requestId === "bank-support");
    if (!hasBookDocuments) {
      return {
        ...createDefaultTinaWorkpaperSnapshot(),
        lastRunAt: new Date().toISOString(),
        status: "idle",
        summary: "Tina still needs your main money papers before she can build the first money story.",
        nextStep: "Bring in QuickBooks or your business bank papers first.",
      };
    }

    return {
      ...createDefaultTinaWorkpaperSnapshot(),
      lastRunAt: new Date().toISOString(),
      status: draft.bookTieOut.status === "stale" ? "stale" : "idle",
      summary:
        draft.bookTieOut.lastRunAt
          ? "Tina needs a current deterministic tie-out before she can build trusted workpapers."
          : "Tina has money papers saved, but she still needs to build the deterministic tie-out first.",
      nextStep: "Build the books tie-out first so Tina can anchor workpapers to numeric support instead of raw clues.",
    };
  }

  const lines = draft.bookTieOut.entries.flatMap((entry) =>
    buildEntryLines(entry, issueQueueIsCurrent)
  );

  draft.sourceFacts.forEach((fact) => {
    const note = SIGNAL_LABELS.get(fact.label);
    if (!note) return;
    const issueIds = relatedIssueIds(draft.issueQueue, fact.sourceDocumentId, fact.id);
    lines.push(
      createLine({
        id: buildLineId(fact.label.toLowerCase().replace(/[^a-z0-9]+/g, "-"), fact.sourceDocumentId),
        kind: "signal",
        label: fact.label,
        summary: `${note} ${fact.value}`,
        sourceDocumentIds: [fact.sourceDocumentId],
        sourceFactIds: [fact.id],
        issueIds,
        issueQueueIsCurrent,
      })
    );
  });

  const blockingTieOutVarianceCount = draft.bookTieOut.variances.filter(
    (variance) => variance.severity === "blocking"
  ).length;
  const attentionTieOutVarianceCount = draft.bookTieOut.variances.filter(
    (variance) => variance.severity === "needs_attention"
  ).length;

  if (lines.length === 0) {
    if (blockingTieOutVarianceCount > 0) {
      return {
        ...createDefaultTinaWorkpaperSnapshot(),
        lastRunAt: new Date().toISOString(),
        status: "stale",
        summary: `Tina has tie-out state saved, but ${blockingTieOutVarianceCount} blocking tie-out gap${
          blockingTieOutVarianceCount === 1 ? "" : "s"
        } still stop a trusted money story.`,
        nextStep: "Resolve the blocking tie-out gaps before Tina tries to build workpapers again.",
      };
    }

    return {
      ...createDefaultTinaWorkpaperSnapshot(),
      lastRunAt: new Date().toISOString(),
      status: "idle",
      summary: "Tina has tie-out state saved, but it still does not produce usable book-side workpaper lines.",
      nextStep: "Fix the tie-out gaps first, then rebuild the workpapers.",
    };
  }

  const incomeTotal = lines
    .filter((line) => line.kind === "income" && line.amount !== null)
    .reduce((total, line) => total + (line.amount ?? 0), 0);
  const expenseTotal = lines
    .filter((line) => line.kind === "expense" && line.amount !== null)
    .reduce((total, line) => total + (line.amount ?? 0), 0);
  const attentionCount = lines.filter((line) => line.status === "needs_attention").length;
  const documentCount = Array.from(new Set(lines.flatMap((line) => line.sourceDocumentIds))).length;
  const bookIssueCount = draft.issueQueue.items.filter(
    (item) => item.status === "open" && item.category === "books"
  ).length;

  let summary = `Tina built a first money story from ${documentCount} money paper${documentCount === 1 ? "" : "s"}.`;
  if (incomeTotal > 0 || expenseTotal > 0) {
    const amounts: string[] = [];
    if (incomeTotal > 0) amounts.push(`${formatMoney(incomeTotal)} coming in`);
    if (expenseTotal > 0) amounts.push(`${formatMoney(expenseTotal)} going out`);
    summary += ` She sees about ${amounts.join(" and ")} so far.`;
  }
  if (attentionCount > 0) {
    summary += ` ${attentionCount} line${attentionCount === 1 ? " needs" : "s need"} a closer look.`;
  }

  let nextStep = "Tina can use this money story to start cleanup and tax-adjustment work next.";
  let status: TinaWorkpaperSnapshot["status"] = "complete";
  const hasMissingCoverageVariance = draft.bookTieOut.variances.some(
    (variance) => variance.id === "missing-date-coverage"
  );
  const hasDuplicateIncomeVariance = draft.bookTieOut.variances.some(
    (variance) => variance.id.startsWith("duplicate-income-")
  );
  const hasOwnerFlowVariance = draft.bookTieOut.variances.some(
    (variance) => variance.id === "owner-flow-contamination"
  );
  const hasTransferVariance = draft.bookTieOut.variances.some(
    (variance) => variance.id === "uncategorized-transfer-activity"
  );
  const hasConflictingStoryVariance = draft.bookTieOut.variances.some(
    (variance) => variance.id === "conflicting-money-story"
  );
  if (blockingTieOutVarianceCount > 0) {
    status = "stale";
    summary += ` ${blockingTieOutVarianceCount} blocking tie-out gap${blockingTieOutVarianceCount === 1 ? " still stops" : "s still stop"} numeric trust.`;
    nextStep = "Resolve the blocking tie-out gaps before Tina carries these numbers deeper into the file.";
  } else if (!issueQueueIsCurrent) {
    status = "stale";
    nextStep =
      "Run the conflict check first so Tina can compare this money story against the rest of your papers.";
    summary += " Tina still needs a current conflict check before anyone should trust these lines.";
  } else if (attentionTieOutVarianceCount > 0) {
    nextStep =
      "Review the tie-out variances first so Tina knows whether these money papers really belong in the same numeric story.";
    summary += ` ${attentionTieOutVarianceCount} tie-out variance${attentionTieOutVarianceCount === 1 ? " needs" : "s need"} review.`;
  } else if (bookIssueCount > 0) {
    nextStep = "Review the book-side conflicts first so Tina does not build on the wrong numbers.";
  } else if (hasMissingCoverageVariance || lines.some((line) => line.kind === "coverage" && line.status === "needs_attention")) {
    nextStep = "Check the date coverage before trusting these numbers for the tax year.";
  }

  if (hasDuplicateIncomeVariance) {
    nextStep =
      "Review the possible duplicate-income story first so Tina does not stack the same inflow twice.";
  } else if (hasOwnerFlowVariance) {
    nextStep =
      "Separate owner draws or distributions from ordinary books before Tina carries these numbers into cleanup.";
  } else if (hasTransferVariance) {
    nextStep =
      "Classify transfer activity before Tina treats these inflows and outflows like ordinary business operations.";
  } else if (hasConflictingStoryVariance) {
    nextStep =
      "Resolve the conflicting money stories first so Tina knows which paper set actually reflects the business.";
  }

  return {
    lastRunAt: new Date().toISOString(),
    status,
    summary,
    nextStep,
    lines: lines.filter((line) => line.sourceDocumentIds.every((id) => documentMap.has(id))),
  };
}
