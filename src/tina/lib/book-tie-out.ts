import type {
  TinaBookTieOutEntry,
  TinaBookTieOutSnapshot,
  TinaBookTieOutVariance,
  TinaStoredDocument,
  TinaWorkpaperLineStatus,
  TinaWorkspaceDraft,
} from "@/tina/types";

const BOOK_REQUEST_IDS = new Set(["quickbooks", "bank-support"]);

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

function buildDefaultSnapshot(): TinaBookTieOutSnapshot {
  return {
    lastRunAt: null,
    status: "idle",
    summary: "Tina has not built a deterministic books tie-out yet.",
    nextStep: "Build the books tie-out after Tina has read your main money papers.",
    totalMoneyIn: null,
    totalMoneyOut: null,
    totalNet: null,
    entries: [],
    variances: [],
  };
}

export function createDefaultTinaBookTieOutSnapshot(): TinaBookTieOutSnapshot {
  return buildDefaultSnapshot();
}

export function markTinaBookTieOutStale(
  snapshot: TinaBookTieOutSnapshot
): TinaBookTieOutSnapshot {
  if (snapshot.status === "idle" || snapshot.status === "stale") return snapshot;

  return {
    ...snapshot,
    status: "stale",
    summary: "Your books, readings, or organizer answers changed, so Tina should rebuild the tie-out.",
    nextStep: "Build the books tie-out again so Tina does not trust old numeric support.",
  };
}

function relatedIssueIds(
  draft: TinaWorkspaceDraft,
  documentId: string,
  factIds: string[]
): string[] {
  return draft.issueQueue.items
    .filter(
      (item) =>
        item.status === "open" &&
        (item.documentId === documentId ||
          (item.factId ? factIds.includes(item.factId) : false))
    )
    .map((item) => item.id);
}

function buildEntryStatus(
  issueQueueIsCurrent: boolean,
  issueIds: string[],
  hasMoneyClues: boolean
): TinaWorkpaperLineStatus {
  if (!issueQueueIsCurrent) return "waiting";
  if (!hasMoneyClues || issueIds.length > 0) return "needs_attention";
  return "ready";
}

function buildEntry(
  draft: TinaWorkspaceDraft,
  document: TinaStoredDocument,
  issueQueueIsCurrent: boolean
): TinaBookTieOutEntry {
  const facts = draft.sourceFacts.filter((fact) => fact.sourceDocumentId === document.id);
  const moneyInFact =
    facts.find((fact) => normalizeForComparison(fact.label) === normalizeForComparison("Money in clue")) ??
    null;
  const moneyOutFact =
    facts.find((fact) => normalizeForComparison(fact.label) === normalizeForComparison("Money out clue")) ??
    null;
  const dateRangeFact =
    facts.find((fact) => normalizeForComparison(fact.label) === normalizeForComparison("Date range clue")) ??
    null;
  const moneyIn = moneyInFact ? parseMoneyValue(moneyInFact.value) : null;
  const moneyOut = moneyOutFact ? parseMoneyValue(moneyOutFact.value) : null;
  const sourceFactIds = [moneyInFact?.id, moneyOutFact?.id, dateRangeFact?.id].filter(
    (value): value is string => Boolean(value)
  );
  const issueIds = relatedIssueIds(draft, document.id, sourceFactIds);
  const hasMoneyClues = moneyIn !== null || moneyOut !== null;

  return {
    id: `book-tie-out-${document.id}`,
    documentId: document.id,
    label: document.requestLabel ?? document.name,
    status: buildEntryStatus(issueQueueIsCurrent, issueIds, hasMoneyClues),
    moneyIn,
    moneyOut,
    net: moneyIn !== null || moneyOut !== null ? (moneyIn ?? 0) - (moneyOut ?? 0) : null,
    dateCoverage: dateRangeFact?.value ?? null,
    sourceFactIds,
    issueIds,
  };
}

function buildMissingClueVariance(entry: TinaBookTieOutEntry): TinaBookTieOutVariance | null {
  if (entry.moneyIn !== null || entry.moneyOut !== null) return null;

  return {
    id: `missing-money-clues-${entry.documentId}`,
    title: "A money paper still lacks usable totals",
    severity: "blocking",
    summary:
      "Tina has a saved money paper here, but she still does not have usable money-in or money-out totals from it. She should not treat the books as tied out yet.",
    documentIds: [entry.documentId],
    sourceFactIds: entry.sourceFactIds,
  };
}

function buildMismatchVariance(
  id: string,
  title: string,
  values: Array<{ entry: TinaBookTieOutEntry; amount: number | null }>,
  noun: string
): TinaBookTieOutVariance | null {
  const usable = values.filter((item): item is { entry: TinaBookTieOutEntry; amount: number } =>
    typeof item.amount === "number"
  );
  if (usable.length < 2) return null;

  const sorted = usable.slice().sort((left, right) => left.amount - right.amount);
  const min = sorted[0].amount;
  const max = sorted[sorted.length - 1].amount;

  if (min === max) return null;

  const ratio =
    min === 0 ? Number.POSITIVE_INFINITY : max / Math.max(1, min);
  if (ratio < 2) return null;

  return {
    id,
    title,
    severity: "needs_attention",
    summary: `Tina sees a large ${noun} spread across money papers (${formatMoney(min)} to ${formatMoney(max)}). She needs a human to confirm whether these papers are partial, duplicate, cross-entity, or otherwise not directly comparable.`,
    documentIds: usable.map((item) => item.entry.documentId),
    sourceFactIds: usable.flatMap((item) => item.entry.sourceFactIds),
  };
}

function buildCoverageVariance(entries: TinaBookTieOutEntry[]): TinaBookTieOutVariance | null {
  const coverages = Array.from(
    new Set(entries.map((entry) => entry.dateCoverage?.trim()).filter((value): value is string => Boolean(value)))
  );
  if (coverages.length < 2) return null;

  return {
    id: "date-coverage-mismatch",
    title: "Money papers show different date coverage",
    severity: "needs_attention",
    summary: `Tina sees more than one date-coverage story across the money papers (${coverages.join("; ")}). She should not treat the books as fully tied out until that scope is confirmed.`,
    documentIds: entries.filter((entry) => entry.dateCoverage).map((entry) => entry.documentId),
    sourceFactIds: entries.flatMap((entry) => entry.sourceFactIds),
  };
}

function buildMissingCoverageVariance(entries: TinaBookTieOutEntry[]): TinaBookTieOutVariance | null {
  const missingCoverageEntries = entries.filter((entry) => !entry.dateCoverage?.trim());
  if (missingCoverageEntries.length === 0) return null;

  return {
    id: "missing-date-coverage",
    title: "A money paper still lacks clear date coverage",
    severity: "needs_attention",
    summary:
      "Tina has usable money totals for at least one paper, but one or more money papers still do not clearly say what dates they cover. She should not assume the tax-year scope is complete until those dates are confirmed.",
    documentIds: missingCoverageEntries.map((entry) => entry.documentId),
    sourceFactIds: missingCoverageEntries.flatMap((entry) => entry.sourceFactIds),
  };
}

function buildDuplicateIncomeVariance(entries: TinaBookTieOutEntry[]): TinaBookTieOutVariance | null {
  const groups = new Map<number, TinaBookTieOutEntry[]>();

  entries.forEach((entry) => {
    if (typeof entry.moneyIn !== "number" || entry.moneyIn <= 0) return;
    const current = groups.get(entry.moneyIn) ?? [];
    current.push(entry);
    groups.set(entry.moneyIn, current);
  });

  const duplicated = Array.from(groups.entries()).find(([, group]) => group.length >= 2);
  if (!duplicated) return null;

  const [amount, group] = duplicated;
  return {
    id: `duplicate-income-${amount}`,
    title: "Money papers may be double-counting the same income",
    severity: "needs_attention",
    summary: `Tina sees the same money-in total ${formatMoney(amount)} repeated across multiple money papers. She needs a human to confirm whether this is the same income showing up twice instead of separate support.`,
    documentIds: group.map((entry) => entry.documentId),
    sourceFactIds: group.flatMap((entry) => entry.sourceFactIds),
  };
}

function buildOwnerFlowVariance(draft: TinaWorkspaceDraft): TinaBookTieOutVariance | null {
  const ownerFacts = draft.sourceFacts.filter(
    (fact) =>
      normalizeForComparison(fact.label) === normalizeForComparison("Owner draw clue") &&
      isBookDocument(draft.documents.find((document) => document.id === fact.sourceDocumentId))
  );
  if (ownerFacts.length === 0) return null;

  return {
    id: "owner-flow-contamination",
    title: "Books may include owner-flow contamination",
    severity: "needs_attention",
    summary:
      "Tina found owner draw, distribution, or withdrawal activity in the same books she is using for tax totals. She should not assume those flows are ordinary business deductions without a human tie-out.",
    documentIds: Array.from(new Set(ownerFacts.map((fact) => fact.sourceDocumentId))),
    sourceFactIds: ownerFacts.map((fact) => fact.id),
  };
}

function buildTransferVariance(draft: TinaWorkspaceDraft): TinaBookTieOutVariance | null {
  const transferFacts = draft.sourceFacts.filter(
    (fact) =>
      normalizeForComparison(fact.label) === normalizeForComparison("Intercompany transfer clue") &&
      isBookDocument(draft.documents.find((document) => document.id === fact.sourceDocumentId))
  );
  if (transferFacts.length === 0) return null;

  return {
    id: "uncategorized-transfer-activity",
    title: "Books may include uncategorized transfer activity",
    severity: "needs_attention",
    summary:
      "Tina found transfer, due-to/due-from, or intercompany activity in the money papers. She should keep those flows out of ordinary income and expense trust until someone classifies them.",
    documentIds: Array.from(new Set(transferFacts.map((fact) => fact.sourceDocumentId))),
    sourceFactIds: transferFacts.map((fact) => fact.id),
  };
}

function buildConflictingStoryVariance(entries: TinaBookTieOutEntry[]): TinaBookTieOutVariance | null {
  const usableNetEntries = entries.filter(
    (entry): entry is TinaBookTieOutEntry & { net: number } => typeof entry.net === "number"
  );
  if (usableNetEntries.length < 2) return null;

  const positiveNet = usableNetEntries.some((entry) => entry.net > 0);
  const negativeNet = usableNetEntries.some((entry) => entry.net < 0);
  if (!positiveNet || !negativeNet) return null;

  return {
    id: "conflicting-money-story",
    title: "Money papers tell conflicting net stories",
    severity: "needs_attention",
    summary:
      "Tina sees one money paper pointing to net money in and another pointing to net money out. She needs a human to confirm whether these papers are partial, duplicate, different entities, or otherwise not telling the same story.",
    documentIds: usableNetEntries.map((entry) => entry.documentId),
    sourceFactIds: usableNetEntries.flatMap((entry) => entry.sourceFactIds),
  };
}

export function buildTinaBookTieOutSnapshot(
  draft: TinaWorkspaceDraft
): TinaBookTieOutSnapshot {
  const issueQueueIsCurrent = draft.issueQueue.status === "complete";
  const bookDocuments = draft.documents.filter((document) => isBookDocument(document));

  if (bookDocuments.length === 0) {
    return {
      ...createDefaultTinaBookTieOutSnapshot(),
      lastRunAt: new Date().toISOString(),
      summary: "Tina still needs your main books before she can build a deterministic tie-out.",
      nextStep: "Bring in QuickBooks or business bank support first.",
    };
  }

  const entries = bookDocuments.map((document) => buildEntry(draft, document, issueQueueIsCurrent));
  const variances = [
    ...entries
      .map((entry) => buildMissingClueVariance(entry))
      .filter((item): item is TinaBookTieOutVariance => item !== null),
  ];

  const moneyInVariance = buildMismatchVariance(
    "money-in-spread",
    "Money-in totals diverge across papers",
    entries.map((entry) => ({ entry, amount: entry.moneyIn })),
    "money-in"
  );
  if (moneyInVariance) variances.push(moneyInVariance);

  const moneyOutVariance = buildMismatchVariance(
    "money-out-spread",
    "Money-out totals diverge across papers",
    entries.map((entry) => ({ entry, amount: entry.moneyOut })),
    "money-out"
  );
  if (moneyOutVariance) variances.push(moneyOutVariance);

  const coverageVariance = buildCoverageVariance(entries);
  if (coverageVariance) variances.push(coverageVariance);
  const missingCoverageVariance = buildMissingCoverageVariance(entries);
  if (missingCoverageVariance) variances.push(missingCoverageVariance);
  const duplicateIncomeVariance = buildDuplicateIncomeVariance(entries);
  if (duplicateIncomeVariance) variances.push(duplicateIncomeVariance);
  const ownerFlowVariance = buildOwnerFlowVariance(draft);
  if (ownerFlowVariance) variances.push(ownerFlowVariance);
  const transferVariance = buildTransferVariance(draft);
  if (transferVariance) variances.push(transferVariance);
  const conflictingStoryVariance = buildConflictingStoryVariance(entries);
  if (conflictingStoryVariance) variances.push(conflictingStoryVariance);

  const usableMoneyIn = entries
    .map((entry) => entry.moneyIn)
    .filter((value): value is number => typeof value === "number");
  const usableMoneyOut = entries
    .map((entry) => entry.moneyOut)
    .filter((value): value is number => typeof value === "number");
  const totalMoneyIn = usableMoneyIn.length > 0 ? usableMoneyIn.reduce((sum, value) => sum + value, 0) : null;
  const totalMoneyOut =
    usableMoneyOut.length > 0 ? usableMoneyOut.reduce((sum, value) => sum + value, 0) : null;
  const totalNet =
    totalMoneyIn !== null || totalMoneyOut !== null
      ? (totalMoneyIn ?? 0) - (totalMoneyOut ?? 0)
      : null;

  let status: TinaBookTieOutSnapshot["status"] = "complete";
  let summary = `Tina built a first deterministic tie-out spine from ${entries.length} money paper${entries.length === 1 ? "" : "s"}.`;
  let nextStep = "Use this tie-out as the numeric spine for workpapers and final-form review.";

  if (!issueQueueIsCurrent) {
    status = "stale";
    summary += " Tina still needs a current issue review before the tie-out can be trusted.";
    nextStep = "Run the issue queue first, then rebuild the tie-out.";
  } else if (variances.some((item) => item.severity === "blocking")) {
    summary += " Tina found blocking tie-out gaps that stop numeric trust.";
    nextStep = "Resolve the blocking tie-out gaps before trusting any final numbers.";
  } else if (variances.length > 0) {
    summary += " Tina found tie-out variances that still need a closer look.";
    nextStep = "Review the tie-out variances so Tina can tell whether these papers are truly comparable.";
  } else if (totalMoneyIn !== null || totalMoneyOut !== null) {
    const parts: string[] = [];
    if (totalMoneyIn !== null) parts.push(`${formatMoney(totalMoneyIn)} in`);
    if (totalMoneyOut !== null) parts.push(`${formatMoney(totalMoneyOut)} out`);
    summary += ` She can currently support about ${parts.join(" and ")}.`;
  }

  return {
    lastRunAt: new Date().toISOString(),
    status,
    summary,
    nextStep,
    totalMoneyIn,
    totalMoneyOut,
    totalNet,
    entries,
    variances,
  };
}
