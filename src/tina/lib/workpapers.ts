import type {
  TinaIssueQueue,
  TinaStoredDocument,
  TinaWorkpaperLine,
  TinaWorkpaperLineKind,
  TinaWorkpaperSnapshot,
  TinaWorkspaceDraft,
} from "@/tina/types";

const BOOK_REQUEST_IDS = new Set(["quickbooks", "bank-support"]);
const SIGNAL_LABELS = new Map<string, string>([
  ["Payroll clue", "This paper hints that payroll records should be part of the tax story."],
  ["Sales tax clue", "This paper hints that sales tax activity should be reviewed."],
  ["Contractor clue", "This paper hints that contractor payments should be checked."],
  ["Inventory clue", "This paper hints that inventory rules may matter here."],
  ["State clue", "This paper hints that another state may affect the tax scope."],
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

function isBookDocument(document: TinaStoredDocument | undefined): boolean {
  return !!document?.requestId && BOOK_REQUEST_IDS.has(document.requestId);
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
  issueQueueIsCurrent: boolean
): TinaWorkpaperLine["status"] {
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
}): TinaWorkpaperLine {
  return {
    id: args.id,
    kind: args.kind,
    layer: "book_original",
    label: args.label,
    amount: args.amount ?? null,
    status: buildLineStatus(args.issueIds, args.issueQueueIsCurrent),
    summary: args.summary,
    sourceDocumentIds: args.sourceDocumentIds,
    sourceFactIds: args.sourceFactIds,
    issueIds: args.issueIds,
    derivedFromLineIds: [],
    cleanupSuggestionIds: [],
  };
}

function buildDocumentLines(
  draft: TinaWorkspaceDraft,
  document: TinaStoredDocument,
  issueQueueIsCurrent: boolean
): TinaWorkpaperLine[] {
  const facts = draft.sourceFacts.filter((fact) => fact.sourceDocumentId === document.id);
  const factByLabel = new Map(facts.map((fact) => [normalizeForComparison(fact.label), fact]));
  const lines: TinaWorkpaperLine[] = [];

  const moneyInFact = factByLabel.get(normalizeForComparison("Money in clue"));
  const moneyOutFact = factByLabel.get(normalizeForComparison("Money out clue"));
  const dateRangeFact = factByLabel.get(normalizeForComparison("Date range clue"));

  if (moneyInFact) {
    const amount = parseMoneyValue(moneyInFact.value);
    if (amount !== null && amount > 0) {
      const issueIds = relatedIssueIds(draft.issueQueue, document.id, moneyInFact.id);
      lines.push(
        createLine({
          id: buildLineId("income", document.id),
          kind: "income",
          label: `${document.requestLabel ?? document.name} money in`,
          amount,
          summary: `Tina sees about ${formatMoney(amount)} coming in from this paper so far.`,
          sourceDocumentIds: [document.id],
          sourceFactIds: [moneyInFact.id],
          issueIds,
          issueQueueIsCurrent,
        })
      );
    }
  }

  if (moneyOutFact) {
    const amount = parseMoneyValue(moneyOutFact.value);
    if (amount !== null && amount > 0) {
      const issueIds = relatedIssueIds(draft.issueQueue, document.id, moneyOutFact.id);
      lines.push(
        createLine({
          id: buildLineId("expense", document.id),
          kind: "expense",
          label: `${document.requestLabel ?? document.name} money out`,
          amount,
          summary: `Tina sees about ${formatMoney(amount)} going out from this paper so far.`,
          sourceDocumentIds: [document.id],
          sourceFactIds: [moneyOutFact.id],
          issueIds,
          issueQueueIsCurrent,
        })
      );
    }
  }

  const moneyIn = moneyInFact ? parseMoneyValue(moneyInFact.value) : null;
  const moneyOut = moneyOutFact ? parseMoneyValue(moneyOutFact.value) : null;
  if ((moneyIn !== null && moneyIn > 0) || (moneyOut !== null && moneyOut > 0)) {
    const issueIds = [
      ...relatedIssueIds(draft.issueQueue, document.id, moneyInFact?.id),
      ...relatedIssueIds(draft.issueQueue, document.id, moneyOutFact?.id),
    ].filter((value, index, array) => array.indexOf(value) === index);
    const net = (moneyIn ?? 0) - (moneyOut ?? 0);
    lines.push(
      createLine({
        id: buildLineId("net", document.id),
        kind: "net",
        label: `${document.requestLabel ?? document.name} net movement`,
        amount: net,
        summary:
          net >= 0
            ? `This paper suggests about ${formatMoney(net)} more came in than went out.`
            : `This paper suggests about ${formatMoney(Math.abs(net))} more went out than came in.`,
        sourceDocumentIds: [document.id],
        sourceFactIds: [moneyInFact?.id, moneyOutFact?.id].filter(
          (value): value is string => Boolean(value)
        ),
        issueIds,
        issueQueueIsCurrent,
      })
    );
  }

  if (dateRangeFact) {
    const issueIds = relatedIssueIds(draft.issueQueue, document.id, dateRangeFact.id);
    lines.push(
      createLine({
        id: buildLineId("coverage", document.id),
        kind: "coverage",
        label: `${document.requestLabel ?? document.name} date coverage`,
        summary: `Tina sees dates from ${dateRangeFact.value}.`,
        sourceDocumentIds: [document.id],
        sourceFactIds: [dateRangeFact.id],
        issueIds,
        issueQueueIsCurrent,
      })
    );
  }

  facts.forEach((fact) => {
    const note = SIGNAL_LABELS.get(fact.label);
    if (!note) return;

    const issueIds = relatedIssueIds(draft.issueQueue, document.id, fact.id);
    lines.push(
      createLine({
        id: buildLineId(fact.label.toLowerCase().replace(/[^a-z0-9]+/g, "-"), document.id),
        kind: "signal",
        label: fact.label,
        summary: `${note} ${fact.value}`,
        sourceDocumentIds: [document.id],
        sourceFactIds: [fact.id],
        issueIds,
        issueQueueIsCurrent,
      })
    );
  });

  return lines;
}

export function buildTinaWorkpaperSnapshot(draft: TinaWorkspaceDraft): TinaWorkpaperSnapshot {
  const documentMap = new Map(draft.documents.map((document) => [document.id, document]));
  const bookDocuments = draft.documents.filter((document) => isBookDocument(document));
  const issueQueueIsCurrent = draft.issueQueue.status === "complete";
  const lines = bookDocuments.flatMap((document) =>
    buildDocumentLines(draft, document, issueQueueIsCurrent)
  );

  if (lines.length === 0) {
    if (bookDocuments.length === 0) {
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
      status: "idle",
      summary: "Tina has money papers saved, but they do not have enough clues yet for a simple money story.",
      nextStep: "Read the saved papers first, then build the money story again.",
    };
  }

  const incomeTotal = lines
    .filter((line) => line.kind === "income" && line.amount !== null)
    .reduce((total, line) => total + (line.amount ?? 0), 0);
  const expenseTotal = lines
    .filter((line) => line.kind === "expense" && line.amount !== null)
    .reduce((total, line) => total + (line.amount ?? 0), 0);
  const attentionCount = lines.filter((line) => line.status === "needs_attention").length;
  const documentCount = Array.from(
    new Set(lines.flatMap((line) => line.sourceDocumentIds))
  ).length;
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
  if (!issueQueueIsCurrent) {
    status = "stale";
    nextStep =
      "Run the conflict check first so Tina can compare this money story against the rest of your papers.";
    summary += " Tina still needs a current conflict check before anyone should trust these lines.";
  } else if (bookIssueCount > 0) {
    nextStep = "Review the book-side conflicts first so Tina does not build on the wrong numbers.";
  } else if (lines.some((line) => line.kind === "coverage" && line.status === "needs_attention")) {
    nextStep = "Check the date coverage before trusting these numbers for the tax year.";
  }

  return {
    lastRunAt: new Date().toISOString(),
    status,
    summary,
    nextStep,
    lines: lines.filter((line) => line.sourceDocumentIds.every((id) => documentMap.has(id))),
  };
}
