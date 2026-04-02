import { buildTinaChecklist } from "@/tina/lib/checklist";
import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import type {
  TinaIssueQueue,
  TinaPrepRecord,
  TinaSourceFact,
  TinaReviewItem,
  TinaStoredDocument,
  TinaWorkspaceDraft,
} from "@/tina/types";

function normalizeForComparison(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function includesNeedle(haystack: string, needle: string): boolean {
  return normalizeForComparison(haystack).includes(normalizeForComparison(needle));
}

export function createDefaultTinaIssueQueue(): TinaIssueQueue {
  return {
    lastRunAt: null,
    status: "idle",
    summary: "Tina has not checked for document conflicts yet.",
    nextStep: "Ask Tina to look for conflicts when you want a deeper check.",
    items: [],
    records: [],
  };
}

export function markTinaIssueQueueStale(queue: TinaIssueQueue): TinaIssueQueue {
  if (queue.status === "idle" || queue.status === "stale") return queue;
  return {
    ...queue,
    status: "stale",
    summary: "Your papers or answers changed, so Tina should check for conflicts again.",
    nextStep: "Ask Tina to run the conflict check again so this list stays current.",
  };
}

function buildRecord(
  id: string,
  label: string,
  status: TinaPrepRecord["status"],
  summary: string,
  issueIds: string[]
): TinaPrepRecord {
  return { id, label, status, summary, issueIds };
}

function parseMoneyFactValue(value: string): number | null {
  const sanitized = value.replace(/[$,\s]/g, "").replace(/[()]/g, "");
  if (!sanitized || !/^-?\d*\.?\d+$/.test(sanitized)) return null;
  const parsed = Number(sanitized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function extractFactYears(value: string): string[] {
  return Array.from(new Set(value.match(/\b20\d{2}\b/g) ?? []));
}

function isBooksDocument(document: TinaStoredDocument | undefined): boolean {
  return document?.requestId === "quickbooks" || document?.requestId === "bank-support";
}

function findFactsByLabel(sourceFacts: TinaSourceFact[], label: string): TinaSourceFact[] {
  return sourceFacts.filter(
    (fact) => normalizeForComparison(fact.label) === normalizeForComparison(label)
  );
}

function calculateRelativeSpread(values: number[]): number {
  if (values.length < 2) return 0;
  const sorted = values.slice().sort((left, right) => left - right);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  if (min <= 0) return 0;
  return max / min;
}

function maybeCreateMoneyScaleMismatchItem(
  bookFacts: TinaSourceFact[]
): TinaReviewItem | null {
  const moneyInFacts = bookFacts.filter(
    (fact) => normalizeForComparison(fact.label) === "money in clue"
  );
  const moneyOutFacts = bookFacts.filter(
    (fact) => normalizeForComparison(fact.label) === "money out clue"
  );

  const moneyInValues = moneyInFacts
    .map((fact) => parseMoneyFactValue(fact.value))
    .filter((value): value is number => value !== null && value > 0);
  const moneyOutValues = moneyOutFacts
    .map((fact) => parseMoneyFactValue(fact.value))
    .filter((value): value is number => value !== null && value > 0);

  const incomeSpread = calculateRelativeSpread(moneyInValues);
  const expenseSpread = calculateRelativeSpread(moneyOutValues);
  const spreadThreshold = 20;

  if (incomeSpread < spreadThreshold && expenseSpread < spreadThreshold) {
    return null;
  }

  const culpritFact =
    (incomeSpread >= spreadThreshold
      ? moneyInFacts
      : moneyOutFacts
    ).find((fact) => parseMoneyFactValue(fact.value) !== null) ?? null;

  const summaryParts: string[] = [];
  if (incomeSpread >= spreadThreshold) {
    summaryParts.push("money-in clues vary sharply");
  }
  if (expenseSpread >= spreadThreshold) {
    summaryParts.push("money-out clues vary sharply");
  }

  return {
    id: "books-money-scale-mismatch",
    title: "Money totals look wildly different across papers",
    summary: `Tina sees potential import scale mismatch: ${summaryParts.join(
      " and "
    )}. This could be partial files, duplicate exports, or format errors (for example cents vs dollars).`,
    severity: "needs_attention",
    status: "open",
    category: "books",
    requestId: null,
    documentId: culpritFact?.sourceDocumentId ?? null,
    factId: culpritFact?.id ?? null,
  };
}

export function buildTinaIssueQueue(draft: TinaWorkspaceDraft): TinaIssueQueue {
  const items: TinaReviewItem[] = [];
  const recommendation = recommendTinaFilingLane(draft.profile);
  const checklist = buildTinaChecklist(draft, recommendation);
  const documentById = new Map(draft.documents.map((document) => [document.id, document]));
  const priorReturnDocument = draft.priorReturnDocumentId
    ? documentById.get(draft.priorReturnDocumentId) ?? null
    : null;
  const priorReturnReading = priorReturnDocument
    ? draft.documentReadings.find((reading) => reading.documentId === priorReturnDocument.id) ?? null
    : null;
  const bookReadings = draft.documentReadings.filter(
    (reading) =>
      reading.status === "complete" && isBooksDocument(documentById.get(reading.documentId))
  );
  const bookFacts = draft.sourceFacts.filter((fact) =>
    isBooksDocument(documentById.get(fact.sourceDocumentId))
  );
  const bookDateFacts = bookFacts.filter(
    (fact) => normalizeForComparison(fact.label) === "date range clue"
  );
  const bookMoneyInTotal = bookFacts
    .filter((fact) => normalizeForComparison(fact.label) === "money in clue")
    .reduce((total, fact) => total + (parseMoneyFactValue(fact.value) ?? 0), 0);
  const bookMoneyOutTotal = bookFacts
    .filter((fact) => normalizeForComparison(fact.label) === "money out clue")
    .reduce((total, fact) => total + (parseMoneyFactValue(fact.value) ?? 0), 0);
  const bookYears = new Set(bookDateFacts.flatMap((fact) => extractFactYears(fact.value)));

  if (priorReturnDocument && !priorReturnReading) {
    items.push({
      id: "prior-return-needs-reading",
      title: "Last year's return still needs a read",
      summary:
        "Tina has last year's return saved, but she has not read it yet. Reading it is one of the best shortcuts for the rest of the tax setup.",
      severity: "needs_attention",
      status: "open",
      category: "continuity",
      requestId: "prior-return",
      documentId: priorReturnDocument.id,
      factId: null,
    });
  }

  if (priorReturnReading?.status === "error") {
    items.push({
      id: "prior-return-read-error",
      title: "Last year's return needs another read",
      summary:
        "Tina tried to read last year's return but did not finish cleanly. This should be retried before relying on that paper.",
      severity: "needs_attention",
      status: "open",
      category: "continuity",
      requestId: "prior-return",
      documentId: priorReturnDocument?.id ?? null,
      factId: null,
    });
  }

  const businessNameFact = findFactsByLabel(draft.sourceFacts, "Business name").find(
    (fact) =>
      draft.profile.businessName.trim() &&
      normalizeForComparison(fact.value) !== normalizeForComparison(draft.profile.businessName)
  );
  if (
    businessNameFact &&
    draft.profile.businessName.trim() &&
    normalizeForComparison(businessNameFact.value) !==
      normalizeForComparison(draft.profile.businessName)
  ) {
    items.push({
      id: "business-name-conflict",
      title: "Business name does not match",
      summary:
        "The business name from a saved paper does not match the business name in the organizer. Tina wants a human to confirm which one is right.",
      severity: "needs_attention",
      status: "open",
      category: "fact_mismatch",
      requestId: null,
      documentId: businessNameFact.sourceDocumentId,
      factId: businessNameFact.id,
    });
  }

  const taxYearFact = findFactsByLabel(draft.sourceFacts, "Tax year").find(
    (fact) =>
      draft.profile.taxYear.trim() &&
      normalizeForComparison(fact.value) !== normalizeForComparison(draft.profile.taxYear)
  );
  if (
    taxYearFact &&
    draft.profile.taxYear.trim() &&
    normalizeForComparison(taxYearFact.value) !== normalizeForComparison(draft.profile.taxYear)
  ) {
    items.push({
      id: "tax-year-conflict",
      title: "Tax year does not match",
      summary:
        "The tax year Tina found in a saved paper does not match the tax year in the organizer. This should be checked before deeper prep starts.",
      severity: "needs_attention",
      status: "open",
      category: "fact_mismatch",
      requestId: null,
      documentId: taxYearFact.sourceDocumentId,
      factId: taxYearFact.id,
    });
  }

  const returnTypeHint = findFactsByLabel(draft.sourceFacts, "Return type hint").find(
    (fact) =>
      includesNeedle(fact.value, "1120") ||
      includesNeedle(fact.value, "s corp") ||
      includesNeedle(fact.value, "1065") ||
      includesNeedle(fact.value, "partnership")
  );
  if (
    returnTypeHint &&
    recommendation.laneId === "schedule_c_single_member_llc" &&
    (includesNeedle(returnTypeHint.value, "1120") ||
      includesNeedle(returnTypeHint.value, "s corp") ||
      includesNeedle(returnTypeHint.value, "1065") ||
      includesNeedle(returnTypeHint.value, "partnership"))
  ) {
    items.push({
      id: "return-type-hint-conflict",
      title: "Saved paper hints at a different return type",
      summary:
        "One saved paper hints that this business may use a different return type than the organizer currently points to. Tina wants this reviewed before she trusts the filing lane.",
      severity: "blocking",
      status: "open",
      category: "fact_mismatch",
      requestId: null,
      documentId: returnTypeHint.sourceDocumentId,
      factId: returnTypeHint.id,
    });
  }

  const stateClue = findFactsByLabel(draft.sourceFacts, "State clue").find((fact) =>
    includesNeedle(fact.value, "idaho")
  );
  if (
    stateClue &&
    includesNeedle(stateClue.value, "idaho") &&
    !draft.profile.hasIdahoActivity
  ) {
    items.push({
      id: "idaho-state-clue",
      title: "A saved paper hints at Idaho activity",
      summary:
        "Tina found an Idaho clue in a saved paper, but Idaho activity is not marked in the organizer yet. This matters because it can change filing scope.",
      severity: "needs_attention",
      status: "open",
      category: "state_scope",
      requestId: null,
      documentId: stateClue.sourceDocumentId,
      factId: stateClue.id,
    });
  }

  const payrollClue = findFactsByLabel(draft.sourceFacts, "Payroll clue")[0];
  if (payrollClue && !draft.profile.hasPayroll) {
    items.push({
      id: "payroll-clue",
      title: "A saved paper hints at payroll",
      summary:
        "Tina found a payroll clue in a saved paper, but payroll is not marked in the organizer. This should be confirmed so the right records get requested.",
      severity: "watch",
      status: "open",
      category: "books",
      requestId: null,
      documentId: payrollClue.sourceDocumentId,
      factId: payrollClue.id,
    });
  }

  const salesTaxClue = findFactsByLabel(draft.sourceFacts, "Sales tax clue")[0];
  if (salesTaxClue && !draft.profile.collectsSalesTax) {
    items.push({
      id: "sales-tax-clue",
      title: "A saved paper hints at sales tax activity",
      summary:
        "Tina found a sales tax clue in a saved paper, but sales tax is not marked in the organizer yet.",
      severity: "watch",
      status: "open",
      category: "state_scope",
      requestId: null,
      documentId: salesTaxClue.sourceDocumentId,
      factId: salesTaxClue.id,
    });
  }

  const contractorClue = findFactsByLabel(draft.sourceFacts, "Contractor clue")[0];
  if (contractorClue && !draft.profile.paysContractors) {
    items.push({
      id: "contractor-clue",
      title: "A saved paper hints at contractor payments",
      summary:
        "Tina found a contractor clue in a saved paper, but contractor payments are not marked in the organizer yet.",
      severity: "watch",
      status: "open",
      category: "books",
      requestId: null,
      documentId: contractorClue.sourceDocumentId,
      factId: contractorClue.id,
    });
  }

  const inventoryClue = findFactsByLabel(draft.sourceFacts, "Inventory clue")[0];
  if (inventoryClue && !draft.profile.hasInventory) {
    items.push({
      id: "inventory-clue",
      title: "A saved paper hints at inventory",
      summary:
        "Tina found an inventory clue in a saved paper, but inventory is not marked in the organizer yet.",
      severity: "watch",
      status: "open",
      category: "books",
      requestId: null,
      documentId: inventoryClue.sourceDocumentId,
      factId: inventoryClue.id,
    });
  }

  if (
    draft.profile.taxYear.trim() &&
    bookDateFacts.length > 0 &&
    bookYears.size > 0 &&
    !bookYears.has(draft.profile.taxYear.trim())
  ) {
    const firstMismatchFact = bookDateFacts[0];
    items.push({
      id: "books-tax-year-mismatch",
      title: "Money papers may be for the wrong tax year",
      summary:
        "The dates Tina found in your money papers do not include the tax year in the organizer yet. A human should confirm the right year before trusting the numbers.",
      severity: "needs_attention",
      status: "open",
      category: "books",
      requestId: null,
      documentId: firstMismatchFact?.sourceDocumentId ?? null,
      factId: firstMismatchFact?.id ?? null,
    });
  } else if (
    draft.profile.taxYear.trim() &&
    bookDateFacts.length > 0 &&
    bookYears.size > 1 &&
    bookYears.has(draft.profile.taxYear.trim())
  ) {
    const firstMixedFact = bookDateFacts[0];
    items.push({
      id: "books-multi-year-mix",
      title: "Money papers include multiple tax years",
      summary:
        "Tina found money-paper dates across multiple years. Even with the target year present, a human should confirm only in-scope rows flow into this return.",
      severity: "needs_attention",
      status: "open",
      category: "books",
      requestId: null,
      documentId: firstMixedFact?.sourceDocumentId ?? null,
      factId: firstMixedFact?.id ?? null,
    });
  }

  const partialWarning = findFactsByLabel(draft.sourceFacts, "Partial file warning")[0];
  if (partialWarning) {
    items.push({
      id: "partial-file-warning",
      title: "One saved paper may be incomplete",
      summary:
        "Tina thinks one of the saved papers may be partial or missing pages. That does not stop all work, but it should be checked soon.",
      severity: "needs_attention",
      status: "open",
      category: "document_followup",
      requestId: null,
      documentId: partialWarning.sourceDocumentId,
      factId: partialWarning.id,
    });
  }

  const moneyScaleMismatch = maybeCreateMoneyScaleMismatchItem(bookFacts);
  if (moneyScaleMismatch) {
    items.push(moneyScaleMismatch);
  }

  const quickbooksCovered = checklist.find((item) => item.id === "quickbooks")?.status === "covered";
  const bankCovered = checklist.find((item) => item.id === "bank-support")?.status === "covered";

  const uniqueItems = items.filter(
    (item, index) =>
      items.findIndex((candidate) => candidate.id === item.id) === index
  );

  const identityIssueIds = uniqueItems
    .filter((item) => item.id === "business-name-conflict" || item.id === "tax-year-conflict")
    .map((item) => item.id);
  const continuityIssueIds = uniqueItems
    .filter((item) => item.category === "continuity")
    .map((item) => item.id);
  const booksIssueIds = uniqueItems
    .filter((item) => item.category === "books")
    .map((item) => item.id);
  const stateIssueIds = uniqueItems
    .filter((item) => item.category === "state_scope")
    .map((item) => item.id);
  const laneIssueIds = uniqueItems
    .filter((item) => item.id === "return-type-hint-conflict")
    .map((item) => item.id);

  const booksSignalSummaryParts: string[] = [];
  if (bookReadings.length > 0) {
    booksSignalSummaryParts.push(
      `Tina has already read ${bookReadings.length} money paper${bookReadings.length === 1 ? "" : "s"}.`
    );
  }
  if (bookMoneyInTotal > 0 || bookMoneyOutTotal > 0) {
    const moneyParts: string[] = [];
    if (bookMoneyInTotal > 0) moneyParts.push(`${formatMoney(bookMoneyInTotal)} coming in`);
    if (bookMoneyOutTotal > 0) moneyParts.push(`${formatMoney(bookMoneyOutTotal)} going out`);
    booksSignalSummaryParts.push(`She sees about ${moneyParts.join(" and ")} so far.`);
  }
  if (bookDateFacts.length > 0) {
    booksSignalSummaryParts.push(`The dates she found include ${Array.from(bookYears).sort().join(", ")}.`);
  }

  const records: TinaPrepRecord[] = [
    buildRecord(
      "identity",
      "Identity check",
      identityIssueIds.length > 0 ? "needs_attention" : "ready",
      identityIssueIds.length > 0
        ? "One or more saved papers disagree with the organizer on basic identity facts."
        : "Tina does not see a basic name or tax-year mismatch right now.",
      identityIssueIds
    ),
    buildRecord(
      "prior-year",
      "Prior-year continuity",
      priorReturnDocument
        ? continuityIssueIds.length > 0
          ? "needs_attention"
          : "ready"
        : "waiting",
      priorReturnDocument
        ? continuityIssueIds.length > 0
          ? "Tina has last year's return, but something still needs review before she can rely on it."
          : "Tina has a prior-year source she can use for continuity."
        : "Tina is still waiting for last year's return or a substitute continuity source.",
      continuityIssueIds
    ),
    buildRecord(
      "books",
      "Books and money records",
      quickbooksCovered && bankCovered
        ? booksIssueIds.length > 0
          ? "needs_attention"
          : "ready"
        : "waiting",
      quickbooksCovered && bankCovered
        ? booksIssueIds.length > 0
          ? booksSignalSummaryParts.length > 0
            ? `${booksSignalSummaryParts.join(" ")} Tina still sees something to check.`
            : "Tina has key money records, but she still sees something to check."
          : booksSignalSummaryParts.length > 0
            ? booksSignalSummaryParts.join(" ")
            : "Tina has the first money records she needs to start book-side prep."
        : "Tina is still waiting on your main books or bank support.",
      booksIssueIds
    ),
    buildRecord(
      "state-scope",
      "State scope",
      stateIssueIds.length > 0 ? "needs_attention" : "ready",
      stateIssueIds.length > 0
        ? "A saved paper hints there may be state scope details still to confirm."
        : "Tina does not see a state-scope mismatch from the saved facts she has right now.",
      stateIssueIds
    ),
    buildRecord(
      "filing-lane",
      "Return type confidence",
      laneIssueIds.length > 0 ? "needs_attention" : recommendation.support === "supported" ? "ready" : "waiting",
      laneIssueIds.length > 0
        ? "A saved paper hints the current return type may not be right."
        : recommendation.support === "supported"
          ? "Tina's current return type check is aligned with the organizer."
          : "Tina still needs more support before she can trust the return type.",
      laneIssueIds
    ),
  ];

  const blockingCount = uniqueItems.filter((item) => item.severity === "blocking").length;
  const attentionCount = uniqueItems.filter((item) => item.severity === "needs_attention").length;

  let summary = "Tina does not see any document conflicts yet.";
  let nextStep = "Keep bringing papers and Tina will keep checking them against your setup.";

  if (blockingCount > 0) {
    summary = `Tina found ${blockingCount} blocking conflict${blockingCount === 1 ? "" : "s"} in your saved papers and setup.`;
    nextStep = "Fix the blocking conflict first before trusting deeper tax prep.";
  } else if (attentionCount > 0) {
    summary = `Tina found ${attentionCount} important thing${attentionCount === 1 ? "" : "s"} to review between your papers and your setup.`;
    nextStep = "Review the important items next so Tina can trust the facts she builds on.";
  } else if (uniqueItems.length > 0) {
    summary = "Tina only sees smaller follow-up items right now.";
    nextStep = "You can keep going while Tina keeps these follow-ups in view.";
  }

  return {
    lastRunAt: new Date().toISOString(),
    status: "complete",
    summary,
    nextStep,
    items: uniqueItems,
    records,
  };
}
