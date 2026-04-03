import { buildTinaChecklist } from "@/tina/lib/checklist";
import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import { buildTinaProfileFingerprint } from "@/tina/lib/profile-fingerprint";
import {
  buildTinaStartPathAssessment,
  formatTinaLaneList,
} from "@/tina/lib/start-path";
import type {
  TinaIssueQueue,
  TinaDocumentFactConfidence,
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
    profileFingerprint: null,
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

function confidenceRank(confidence: TinaDocumentFactConfidence): number {
  switch (confidence) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

function hasAtLeastConfidence(
  facts: TinaSourceFact[],
  threshold: TinaDocumentFactConfidence
): boolean {
  const thresholdRank = confidenceRank(threshold);
  return facts.some((fact) => confidenceRank(fact.confidence) >= thresholdRank);
}

function pickStrongestFact(facts: TinaSourceFact[]): TinaSourceFact | null {
  if (facts.length === 0) return null;
  return facts.reduce((best, candidate) =>
    confidenceRank(candidate.confidence) > confidenceRank(best.confidence)
      ? candidate
      : best
  );
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

function extractEinTokens(value: string): string[] {
  const dashed = value.match(/\b\d{2}-\d{7}\b/g) ?? [];
  const compact = value.match(/\b\d{9}\b/g) ?? [];
  const normalizedCompact = compact.map((token) => `${token.slice(0, 2)}-${token.slice(2)}`);
  return Array.from(new Set([...dashed, ...normalizedCompact].map((token) => token.trim())));
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
  const positives = values.filter((value) => value > 0);
  const hasZero = values.some((value) => value === 0);

  if (positives.length < 2) {
    if (positives.length === 1 && hasZero) return Number.POSITIVE_INFINITY;
    return 0;
  }

  const sorted = positives.slice().sort((left, right) => left - right);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
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
    .filter((value): value is number => value !== null && value >= 0);
  const moneyOutValues = moneyOutFacts
    .map((fact) => parseMoneyFactValue(fact.value))
    .filter((value): value is number => value !== null && value >= 0);

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
  const profileFingerprint = buildTinaProfileFingerprint(draft.profile);
  const items: TinaReviewItem[] = [];
  const startPath = buildTinaStartPathAssessment(draft);
  const recommendation = startPath.recommendation;
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
  const ownerFlowFact = pickStrongestFact(findFactsByLabel(bookFacts, "Owner draw clue"));
  const intercompanyFact = pickStrongestFact(
    findFactsByLabel(bookFacts, "Intercompany transfer clue")
  );
  const relatedPartyFact = pickStrongestFact(findFactsByLabel(bookFacts, "Related-party clue"));
  const mixedUseFact = pickStrongestFact(
    findFactsByLabel(bookFacts, "Mixed personal/business clue")
  );
  const depreciationFact = pickStrongestFact(findFactsByLabel(bookFacts, "Depreciation clue"));
  const einFacts = findFactsByLabel(bookFacts, "EIN clue");
  const uniqueEinSet = new Set(einFacts.flatMap((fact) => extractEinTokens(fact.value)));

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

  if (startPath.hasMixedHintedLanes || startPath.hasHintVsOrganizerConflict) {
    const hasStrongReturnHint = hasAtLeastConfidence(
      startPath.returnTypeHintFacts,
      "medium"
    );
    const culprit = startPath.returnTypeHintFacts[0] ?? null;

    const summary = startPath.hasMixedHintedLanes
      ? `Saved papers point to multiple return-type lanes (${formatTinaLaneList(
          startPath.hintedLanes
        )}). Tina wants this resolved before she trusts the filing lane.`
      : `One saved paper hints at ${formatTinaLaneList([
          startPath.singleHintedLane!,
        ])}, but the organizer currently points to ${formatTinaLaneList([
          recommendation.laneId,
        ])}. Tina wants this reviewed before she trusts the filing lane.`;

    items.push({
      id: "return-type-hint-conflict",
      title: "Saved paper hints at a different return type",
      summary,
      severity: hasStrongReturnHint ? "blocking" : "needs_attention",
      status: "open",
      category: "fact_mismatch",
      requestId: null,
      documentId: culprit?.sourceDocumentId ?? null,
      factId: culprit?.id ?? null,
    });
  }

  if (
    recommendation.laneId === "schedule_c_single_member_llc" &&
    startPath.ownershipMismatchWithSingleOwnerLane &&
    !items.some((item) => item.id === "owner-count-multi-owner")
  ) {
    items.push({
      id: "single-owner-lane-mismatch",
      title: "Single-owner lane no longer looks safe",
      summary:
        "Tina's supported Schedule C lane no longer matches the ownership signals she sees. She should route this to reviewer handling instead of continuing as if it were a clean single-owner file.",
      severity: "blocking",
      status: "open",
      category: "setup",
      requestId: null,
      documentId: startPath.ownershipChangeClue?.sourceDocumentId ?? startPath.formerOwnerPaymentClue?.sourceDocumentId ?? null,
      factId: startPath.ownershipChangeClue?.id ?? startPath.formerOwnerPaymentClue?.id ?? null,
    });
  }

  if (draft.profile.ownerCount !== null && draft.profile.ownerCount > 1) {
    items.push({
      id: "owner-count-multi-owner",
      title: "Organizer shows more than one owner",
      summary:
        "Tina sees more than one owner in intake. She should route this away from the single-owner Schedule C lane and into reviewer handling instead of guessing.",
      severity: "blocking",
      status: "open",
      category: "setup",
      requestId: null,
      documentId: null,
      factId: null,
    });
  }

  if (draft.profile.ownershipChangedDuringYear || startPath.ownershipChangeClue) {
    items.push({
      id: "ownership-change-review",
      title: "Ownership changed during the year",
      summary:
        "Tina sees an ownership-change signal. She should stop and route this to reviewer handling before trusting the return path.",
      severity:
        draft.profile.ownershipChangedDuringYear ||
        confidenceRank(startPath.ownershipChangeClue?.confidence ?? "low") >=
          confidenceRank("medium")
          ? "blocking"
          : "needs_attention",
      status: "open",
      category: "setup",
      requestId: null,
      documentId: startPath.ownershipChangeClue?.sourceDocumentId ?? null,
      factId: startPath.ownershipChangeClue?.id ?? null,
    });
  }

  if (draft.profile.hasFormerOwnerPayments || startPath.formerOwnerPaymentClue) {
    items.push({
      id: "former-owner-payment-review",
      title: "Former-owner payments need classification review",
      summary:
        "Tina sees payments to a former owner or buyout-style activity. She should route this to reviewer handling before trusting the filing lane or return treatment.",
      severity:
        draft.profile.hasFormerOwnerPayments ||
        confidenceRank(startPath.formerOwnerPaymentClue?.confidence ?? "low") >=
          confidenceRank("medium")
          ? "blocking"
          : "needs_attention",
      status: "open",
      category: "setup",
      requestId: null,
      documentId: startPath.formerOwnerPaymentClue?.sourceDocumentId ?? null,
      factId: startPath.formerOwnerPaymentClue?.id ?? null,
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

  if (mixedUseFact) {
    items.push({
      id: "books-mixed-use-clue",
      title: "Books may mix personal and business spending",
      summary:
        "Tina found a mixed-use clue in the money papers. She should stop and separate personal activity before trusting return-facing expenses.",
      severity:
        confidenceRank(mixedUseFact.confidence) >= confidenceRank("medium")
          ? "blocking"
          : "needs_attention",
      status: "open",
      category: "books",
      requestId: null,
      documentId: mixedUseFact.sourceDocumentId,
      factId: mixedUseFact.id,
    });
  }

  if (depreciationFact) {
    items.push({
      id: "books-depreciation-support-clue",
      title: "Depreciation or fixed-asset support needs review",
      summary:
        draft.profile.hasFixedAssets
          ? "Tina found depreciation or fixed-asset clues and should confirm the asset schedule and support before trusting those deductions."
          : "Tina found depreciation or fixed-asset clues even though fixed assets are not marked in intake yet. She should stop and confirm the asset story before trusting the return.",
      severity:
        draft.profile.hasFixedAssets ||
        confidenceRank(depreciationFact.confidence) >= confidenceRank("medium")
          ? "blocking"
          : "needs_attention",
      status: "open",
      category: "books",
      requestId: null,
      documentId: depreciationFact.sourceDocumentId,
      factId: depreciationFact.id,
    });
  }

  if (payrollClue && contractorClue) {
    items.push({
      id: "worker-classification-overlap",
      title: "Papers hint at both payroll and contractor flows",
      summary:
        "Tina sees signals for both payroll and contractor payments. She should confirm worker classification and supporting records before trusting those deductions.",
      severity: "blocking",
      status: "open",
      category: "books",
      requestId: null,
      documentId: payrollClue.sourceDocumentId ?? contractorClue.sourceDocumentId,
      factId: payrollClue.id,
    });
  }

  if (intercompanyFact) {
    items.push({
      id: "books-intercompany-transfer-clue",
      title: "Books may include intercompany transfers",
      summary:
        "Tina found a clue that money may be moving between entities in these papers. She needs a clean separation check before trusting return-facing totals.",
      severity: confidenceRank(intercompanyFact.confidence) >= confidenceRank("medium")
        ? "blocking"
        : "needs_attention",
      status: "open",
      category: "books",
      requestId: null,
      documentId: intercompanyFact.sourceDocumentId,
      factId: intercompanyFact.id,
    });
  }

  if (relatedPartyFact) {
    items.push({
      id: "books-related-party-clue",
      title: "Books may include related-party balances or loans",
      summary:
        "Tina found a related-party clue. A human should confirm treatment for owner/member/shareholder flows before filing numbers are trusted.",
      severity: "needs_attention",
      status: "open",
      category: "books",
      requestId: null,
      documentId: relatedPartyFact.sourceDocumentId,
      factId: relatedPartyFact.id,
    });
  }

  if (ownerFlowFact) {
    const severeOwnerFlowEntity =
      draft.profile.entityType === "s_corp" ||
      draft.profile.entityType === "partnership" ||
      draft.profile.entityType === "multi_member_llc";
    const strongOwnerFlowSignal =
      confidenceRank(ownerFlowFact.confidence) >= confidenceRank("medium");

    items.push({
      id: "books-owner-flow-clue",
      title: "Owner cash flow needs characterization review",
      summary:
        "Tina found owner draw/distribution activity in the papers. She needs a human to confirm the treatment so owner flows do not get carried as ordinary business deductions by mistake.",
      severity: severeOwnerFlowEntity && strongOwnerFlowSignal ? "blocking" : "needs_attention",
      status: "open",
      category: "books",
      requestId: null,
      documentId: ownerFlowFact.sourceDocumentId,
      factId: ownerFlowFact.id,
    });
  }

  if (uniqueEinSet.size > 1) {
    const culpritEinFact = einFacts.find((fact) => extractEinTokens(fact.value).length > 0) ?? null;
    const hasCorroboratingBoundarySignal = Boolean(intercompanyFact || relatedPartyFact);
    const hasStrongEinClue = hasAtLeastConfidence(einFacts, "high");
    items.push({
      id: "books-multi-ein-conflict",
      title: "Multiple EINs appear in money papers",
      summary: `Tina found references to multiple EINs (${Array.from(uniqueEinSet)
        .sort()
        .join(", ")}). She needs entity-boundary cleanup before those books can be trusted for one return.`,
      severity: hasCorroboratingBoundarySignal || hasStrongEinClue ? "blocking" : "needs_attention",
      status: "open",
      category: "fact_mismatch",
      requestId: null,
      documentId: culpritEinFact?.sourceDocumentId ?? null,
      factId: culpritEinFact?.id ?? null,
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
    .filter((item) =>
      item.id === "return-type-hint-conflict" ||
      item.id === "owner-count-multi-owner" ||
      item.id === "ownership-change-review" ||
      item.id === "former-owner-payment-review"
    )
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
    profileFingerprint,
    status: "complete",
    summary,
    nextStep,
    items: uniqueItems,
    records,
  };
}
