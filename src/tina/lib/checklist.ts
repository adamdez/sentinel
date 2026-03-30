import type {
  TinaChecklistItem,
  TinaFilingLaneRecommendation,
  TinaSourceFact,
  TinaWorkspaceDraft,
} from "@/tina/types";
import {
  findTinaLlcCommunityPropertySourceFact,
  findTinaLlcTreatmentSourceFact,
  isTinaLlcEntityType,
  resolveTinaLlcCommunityPropertyStatus,
  resolveTinaLlcCommunityPropertyStatusFromSourceFacts,
  resolveTinaLlcFederalTaxTreatment,
  resolveTinaLlcFederalTaxTreatmentFromSourceFacts,
} from "@/tina/lib/llc-profile";
import {
  hasTinaContractorSignal,
  hasTinaFixedAssetSignal,
  hasTinaIdahoSignal,
  hasTinaInventorySignal,
  hasTinaPayrollSignal,
  hasTinaSalesTaxSignal,
  hasTinaSourceFactLabelValue,
} from "@/tina/lib/source-fact-signals";

function hasDocumentForRequest(draft: TinaWorkspaceDraft, requestId: string): boolean {
  return draft.documents.some((document) => document.requestId === requestId);
}

function parseIsoDate(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

function diffDays(later: Date, earlier: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / (1000 * 60 * 60 * 24));
}

function booksCoverageLooksPartial(draft: TinaWorkspaceDraft): boolean {
  if (
    draft.booksImport.status !== "complete" ||
    !draft.profile.taxYear.trim() ||
    !draft.booksImport.coverageStart ||
    !draft.booksImport.coverageEnd
  ) {
    return false;
  }

  const taxYear = draft.profile.taxYear.trim();
  const expectedStart = parseIsoDate(
    draft.profile.formationDate.startsWith(taxYear)
      ? draft.profile.formationDate
      : `${taxYear}-01-01`
  );
  const expectedEnd = parseIsoDate(`${taxYear}-12-31`);
  const coverageStart = parseIsoDate(draft.booksImport.coverageStart);
  const coverageEnd = parseIsoDate(draft.booksImport.coverageEnd);

  if (!coverageStart || !coverageEnd || !expectedStart || !expectedEnd) return false;

  return diffDays(coverageStart, expectedStart) > 45 || diffDays(expectedEnd, coverageEnd) > 45;
}

function sortWeight(item: TinaChecklistItem): number {
  if (item.status === "covered") return 1000;

  const baselineRequiredOrder: Record<string, number> = {
    "prior-return": 0,
    quickbooks: 1,
    "bank-support": 2,
  };

  if (item.kind === "baseline" && item.priority === "required") {
    return baselineRequiredOrder[item.id] ?? 20;
  }

  if (item.kind === "follow_up" && item.priority === "required") {
    const followUpUploadOrder: Record<string, number> = {
      contractors: 30,
      payroll: 31,
      "sales-tax": 32,
      assets: 33,
      inventory: 34,
    };
    return followUpUploadOrder[item.id] ?? 39;
  }

  if (item.kind === "follow_up" && item.action === "answer") {
    return 40;
  }

  if (item.kind === "replacement") {
    return 50;
  }

  if (item.kind === "baseline" && item.priority === "recommended") {
    return 60;
  }

  if (item.action === "review") {
    return 70;
  }

  return 80;
}

function sortChecklist(items: TinaChecklistItem[]): TinaChecklistItem[] {
  return items
    .slice()
    .sort((left, right) => {
      const delta = sortWeight(left) - sortWeight(right);
      if (delta !== 0) return delta;
      return left.label.localeCompare(right.label);
    });
}

export function buildTinaChecklist(
  draft: TinaWorkspaceDraft,
  recommendation: TinaFilingLaneRecommendation
): TinaChecklistItem[] {
  const hasPriorReturn = Boolean(draft.priorReturnDocumentId || draft.priorReturn);
  const partialBooksDetected = booksCoverageLooksPartial(draft);
  const payrollDetected = hasTinaPayrollSignal(draft.profile, draft.sourceFacts);
  const contractorsDetected = hasTinaContractorSignal(draft.profile, draft.sourceFacts);
  const salesTaxDetected = hasTinaSalesTaxSignal(draft.profile, draft.sourceFacts);
  const inventoryDetected = hasTinaInventorySignal(draft.profile, draft.sourceFacts);
  const fixedAssetsDetected = hasTinaFixedAssetSignal(draft.profile, draft.sourceFacts);
  const idahoDetected = hasTinaIdahoSignal(draft.profile, draft.sourceFacts);
  const llcDetected = isTinaLlcEntityType(draft.profile.entityType);
  const resolvedLlcTaxTreatment = llcDetected
    ? resolveTinaLlcFederalTaxTreatment(draft.profile, draft.sourceFacts)
    : null;
  const resolvedCommunityPropertyStatus =
    draft.profile.entityType === "multi_member_llc"
      ? resolveTinaLlcCommunityPropertyStatus(draft.profile, draft.sourceFacts)
      : draft.profile.llcCommunityPropertyStatus;
  const llcTreatmentSourceFact = findTinaLlcTreatmentSourceFact(draft.sourceFacts);
  const llcTreatmentFromPapers = resolveTinaLlcFederalTaxTreatmentFromSourceFacts(draft.sourceFacts);
  const llcCommunityPropertySourceFact = findTinaLlcCommunityPropertySourceFact(draft.sourceFacts);
  const llcCommunityPropertyFromPapers =
    resolveTinaLlcCommunityPropertyStatusFromSourceFacts(draft.sourceFacts);
  const returnTypeHintConflictDetected =
    recommendation.laneId === "schedule_c_single_member_llc" &&
    (hasTinaSourceFactLabelValue(draft.sourceFacts, "Return type hint", "1120") ||
      hasTinaSourceFactLabelValue(draft.sourceFacts, "Return type hint", "s corp") ||
      hasTinaSourceFactLabelValue(draft.sourceFacts, "Return type hint", "partnership") ||
      hasTinaSourceFactLabelValue(draft.sourceFacts, "Return type hint", "1065"));
  const llcTreatmentConflictDetected =
    llcDetected &&
    Boolean(llcTreatmentSourceFact) &&
    Boolean(llcTreatmentFromPapers) &&
    draft.profile.llcFederalTaxTreatment !== "default" &&
    draft.profile.llcFederalTaxTreatment !== "unsure" &&
    draft.profile.llcFederalTaxTreatment !== llcTreatmentFromPapers &&
    !(
      llcTreatmentSourceFact?.label === "Return type hint" &&
      recommendation.laneId === "schedule_c_single_member_llc"
    );
  const llcCommunityPropertyConflictDetected =
    draft.profile.entityType === "multi_member_llc" &&
    draft.profile.llcFederalTaxTreatment === "owner_return" &&
    Boolean(llcCommunityPropertySourceFact) &&
    Boolean(llcCommunityPropertyFromPapers) &&
    draft.profile.llcCommunityPropertyStatus !== "not_applicable" &&
    draft.profile.llcCommunityPropertyStatus !== "unsure" &&
    draft.profile.llcCommunityPropertyStatus !== llcCommunityPropertyFromPapers;
  const laneReviewNeeded =
    recommendation.support !== "supported" ||
    returnTypeHintConflictDetected ||
    llcTreatmentConflictDetected ||
    llcCommunityPropertyConflictDetected;
  const laneReviewReason = llcCommunityPropertyConflictDetected
    ? "A saved paper disagrees with the spouse/community-property answer, so Tina wants a human to settle the return type before she goes deeper."
    : llcTreatmentConflictDetected
      ? "A saved paper disagrees with the LLC tax path in the organizer, so Tina wants a human to settle the return type before she goes deeper."
      : returnTypeHintConflictDetected
        ? "A saved paper points to a different return type than the organizer, so Tina wants a human review before she trusts the filing lane."
        : "Tina thinks this business may need a return type that is not fully built yet in this first version.";

  const items: TinaChecklistItem[] = [
    {
      id: "prior-return",
      label: "Last year's tax return",
      reason: "This helps Tina copy over the basics so you do not have to type everything again.",
      priority: "required",
      action: "upload",
      kind: "baseline",
      source: "organizer",
      actionLabel: "Add last year's return",
      focusLabel: "last year's tax return",
      substituteHint: "A filed PDF, a CPA copy, or the e-file copy is all fine here.",
      status: hasPriorReturn ? "covered" : "needed",
    },
    {
      id: "quickbooks",
      label: partialBooksDetected
        ? "Full-year QuickBooks export or fuller profit-and-loss report"
        : "QuickBooks or your profit-and-loss report",
      reason: partialBooksDetected
        ? "Tina only sees part of the year in your books so far. Add the missing months or a fuller export next."
        : "Tina needs your main money records so she can start the tax work from the right numbers.",
      priority: "required",
      action: "upload",
      kind: partialBooksDetected ? "replacement" : "baseline",
      source: partialBooksDetected ? "coverage_gap" : "organizer",
      actionLabel: partialBooksDetected ? "Add fuller books export" : "Add QuickBooks or P&L",
      focusLabel: partialBooksDetected
        ? "a fuller books export"
        : "quickbooks or your profit-and-loss report",
      substituteHint: partialBooksDetected
        ? "A full-year QuickBooks export, a full-year profit and loss, or a general ledger all help."
        : "QuickBooks, a profit and loss report, or a general ledger all work here.",
      status:
        hasDocumentForRequest(draft, "quickbooks") && !partialBooksDetected ? "covered" : "needed",
    },
    {
      id: "bank-support",
      label: "Business bank and card statements",
      reason: "These help Tina check that the book numbers match the real money moving in and out.",
      priority: "required",
      action: "upload",
      kind: "baseline",
      source: "organizer",
      actionLabel: "Add bank statements",
      focusLabel: "business bank and card statements",
      substituteHint: "A bank CSV, statement PDF, or card export is all okay.",
      status: hasDocumentForRequest(draft, "bank-support") ? "covered" : "needed",
    },
  ];

  if (llcDetected && resolvedLlcTaxTreatment === "unsure") {
    items.push({
      id: "llc-tax-treatment",
      label: "How this LLC files with the IRS",
      reason:
        "LLCs can land on different federal returns depending on elections and special cases. Tina wants this answer before she guesses the tax path.",
      priority: "required",
      action: "answer",
      kind: "follow_up",
      source: "lane_support",
      actionLabel: "Answer the LLC tax question",
      focusLabel: "how this llc files with the irs",
      status: "needed",
    });
  }

  if (
    draft.profile.entityType === "multi_member_llc" &&
    resolvedLlcTaxTreatment === "owner_return" &&
    (resolvedCommunityPropertyStatus === "unsure" ||
      resolvedCommunityPropertyStatus === "not_applicable")
  ) {
    items.push({
      id: "llc-community-property",
      label: "Whether only spouses own this LLC in a community-property state",
      reason:
        "That special married-couple path can change whether Tina starts from an owner return or a partnership return.",
      priority: "required",
      action: "answer",
      kind: "follow_up",
      source: "lane_support",
      actionLabel: "Answer the spouse ownership question",
      focusLabel: "whether only spouses own this llc in a community-property state",
      status: "needed",
    });
  }

  if (
    llcDetected &&
    (resolvedLlcTaxTreatment === "s_corp_return" ||
      resolvedLlcTaxTreatment === "c_corp_return")
  ) {
    items.push({
      id: "llc-election",
      label: "LLC tax election papers",
      reason:
        "If this LLC elected S-corp or corporation treatment, Tina wants the election proof before she trusts the return lane.",
      priority: "required",
      action: "upload",
      kind: "follow_up",
      source: "organizer",
      actionLabel: "Add election papers",
      focusLabel: "llc tax election papers",
      substituteHint: "Form 2553, Form 8832, an IRS acceptance letter, or the prior return can all help.",
      status:
        hasDocumentForRequest(draft, "llc-election") ||
        Boolean(draft.priorReturnDocumentId) ||
        Boolean(llcTreatmentSourceFact)
          ? "covered"
          : "needed",
    });
  }

  if (contractorsDetected) {
    items.push({
      id: "contractors",
      label: "Contractor payments and 1099 list",
      reason: draft.profile.paysContractors
        ? "Tina needs this to understand who you paid and whether any contractor tax forms are part of the story."
        : "One money paper looks like it mentions contractors. Tina wants the contractor papers next so she does not guess.",
      priority: "required",
      action: "upload",
      kind: "follow_up",
      source: draft.profile.paysContractors ? "organizer" : "document_clue",
      actionLabel: "Add contractor papers",
      focusLabel: "contractor payments and 1099 list",
      substituteHint: "A contractor summary, 1099 report, or vendor payment export is fine.",
      status: hasDocumentForRequest(draft, "contractors") ? "covered" : "needed",
    });
  }

  if (payrollDetected) {
    items.push({
      id: "payroll",
      label: "Payroll reports and W-2 papers",
      reason: draft.profile.hasPayroll
        ? "Tina needs this to check wages, payroll costs, and related deductions."
        : "One money paper looks like it mentions payroll. Tina wants the payroll papers next so she can confirm wages.",
      priority: "required",
      action: "upload",
      kind: "follow_up",
      source: draft.profile.hasPayroll ? "organizer" : "document_clue",
      actionLabel: "Add payroll papers",
      focusLabel: "payroll reports and w-2 papers",
      substituteHint: "A payroll summary, W-2 report, or payroll tax report is fine.",
      status: hasDocumentForRequest(draft, "payroll") ? "covered" : "needed",
    });
  }

  if (fixedAssetsDetected) {
    items.push({
      id: "assets",
      label: "Big purchase list and depreciation papers",
      reason: draft.profile.hasFixedAssets
        ? "If you bought equipment, vehicles, or other big items, Tina needs the details before she can trust the write-off math."
        : "One money paper looks like it mentions equipment, repairs, or smaller tools. Tina wants the big-purchase story next so she does not guess at the write-off path.",
      priority: "required",
      action: "upload",
      kind: "follow_up",
      source: draft.profile.hasFixedAssets ? "organizer" : "document_clue",
      actionLabel: "Add big purchase papers",
      focusLabel: "big purchase papers",
      substituteHint: "A depreciation schedule, purchase list, or receipts for big items can work.",
      status:
        hasPriorReturn || hasDocumentForRequest(draft, "assets") ? "covered" : "needed",
    });
  }

  if (salesTaxDetected) {
    items.push({
      id: "sales-tax",
      label: "Washington sales tax history",
      reason: draft.profile.collectsSalesTax
        ? "Tina needs to see what sales tax you collected and what you already sent in."
        : "One money paper looks like it mentions sales tax. Tina wants that history next before she trusts the totals.",
      priority: "required",
      action: "upload",
      kind: "follow_up",
      source: draft.profile.collectsSalesTax ? "organizer" : "document_clue",
      actionLabel: "Add sales tax papers",
      focusLabel: "washington sales tax history",
      substituteHint: "A My DOR report, sales tax return copy, or sales tax summary works here.",
      status: hasDocumentForRequest(draft, "sales-tax") ? "covered" : "needed",
    });
  }

  if (inventoryDetected) {
    items.push({
      id: "inventory",
      label: "Inventory count or end-of-year inventory value",
      reason: draft.profile.hasInventory
        ? "If you sell products, Tina needs to know what you still had left at the end of the year."
        : "One money paper looks like it mentions inventory or cost of goods. Tina wants the end-of-year inventory number next.",
      priority: "recommended",
      action: "upload",
      kind: "follow_up",
      source: draft.profile.hasInventory ? "organizer" : "document_clue",
      actionLabel: "Add inventory papers",
      focusLabel: "inventory count or end-of-year inventory value",
      substituteHint: "An inventory count, stock list, or end-of-year value summary is enough.",
      status: hasDocumentForRequest(draft, "inventory") ? "covered" : "needed",
    });
  }

  if (!draft.profile.hasIdahoActivity && idahoDetected) {
    items.push({
      id: "idaho-activity",
      label: "Whether you did any work in Idaho",
      reason: "One saved paper hints at Idaho activity. Tina wants you to confirm that above so she asks for the right state papers.",
      priority: "recommended",
      action: "answer",
      kind: "follow_up",
      source: "document_clue",
      focusLabel: "whether you did any work in idaho",
      status: "needed",
    });
  }

  if (!draft.profile.naicsCode.trim()) {
    items.push({
      id: "naics",
      label: "What kind of business this is",
      reason: "A short business description helps Tina ask for the right papers and look for the right deductions.",
      priority: "recommended",
      action: "answer",
      kind: "baseline",
      source: "organizer",
      focusLabel: "what kind of business this is",
      status: "needed",
    });
  }

  if (laneReviewNeeded) {
    items.push({
      id: "lane-review",
      label: "Return type check",
      reason: laneReviewReason,
      priority: "watch",
      action: "review",
      kind: "follow_up",
      source: "lane_support",
      focusLabel: "the return type check",
      status: "needed",
    });
  }

  return sortChecklist(items);
}
