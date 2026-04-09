import type { TinaChecklistItem, TinaFilingLaneRecommendation, TinaWorkspaceDraft } from "@/tina/types";

export interface TinaClientUploadRequirementDefinition {
  id: string;
  label: string;
  reason: string;
  priority: TinaChecklistItem["priority"];
  acceptedFormats: string[];
  examples: string[];
}

export interface TinaClientUploadRequirement extends TinaClientUploadRequirementDefinition {
  status: TinaChecklistItem["status"];
}

function hasDocumentForRequest(draft: TinaWorkspaceDraft, requestId: string): boolean {
  const legacyAliases: Record<string, string[]> = {
    "profit-loss": ["quickbooks"],
    "balance-sheet": ["quickbooks"],
    "general-ledger": ["quickbooks"],
    "credit-card-support": ["bank-support"],
  };

  const acceptedRequestIds = new Set([requestId, ...(legacyAliases[requestId] ?? [])]);
  return draft.documents.some((document) => acceptedRequestIds.has(document.requestId ?? ""));
}

function buildBaseRequirements(): TinaClientUploadRequirementDefinition[] {
  return [
    {
      id: "prior-return",
      label: "Prior-year filed return PDF",
      reason: "This gives Tina the last filed posture, carryovers, depreciation history, and the starting point a CPA expects to compare against.",
      priority: "required",
      acceptedFormats: ["PDF", "CSV"],
      examples: [
        "1040 + Schedule C",
        "1120-S",
        "1065",
        "K-1 package",
        "prior-year return extract",
      ],
    },
    {
      id: "profit-loss",
      label: "Full-year profit and loss",
      reason: "Tina needs the year-level income and expense summary before she can tie the books to the return.",
      priority: "required",
      acceptedFormats: ["CSV", "XLSX", "PDF"],
      examples: ["QuickBooks P&L", "Xero profit and loss", "bookkeeper export"],
    },
    {
      id: "balance-sheet",
      label: "Year-end balance sheet",
      reason: "This shows the year-end financial position and helps Tina catch cash, asset, debt, and continuity issues early.",
      priority: "recommended",
      acceptedFormats: ["CSV", "XLSX", "PDF"],
      examples: ["Balance sheet as of December 31", "year-end statement of financial position"],
    },
    {
      id: "general-ledger",
      label: "General ledger export",
      reason: "This is the most important transaction-level file for proving where the numbers came from.",
      priority: "required",
      acceptedFormats: ["CSV", "XLSX"],
      examples: ["General ledger export", "transaction detail export", "journal detail report"],
    },
    {
      id: "bank-support",
      label: "Business bank statements",
      reason: "Tina uses these to reconcile deposits, large outflows, and whether the books match the real cash activity.",
      priority: "required",
      acceptedFormats: ["PDF", "CSV"],
      examples: [
        "12 monthly bank statements",
        "operating account statements",
        "bank statement extract",
      ],
    },
    {
      id: "credit-card-support",
      label: "Business credit card statements",
      reason: "These help Tina substantiate expenses and scan for personal or miscategorized spending.",
      priority: "recommended",
      acceptedFormats: ["PDF", "CSV"],
      examples: [
        "12 monthly business card statements",
        "Amex or Chase business card PDFs",
        "credit card statement extract",
      ],
    },
    {
      id: "unusual-items",
      label: "Notes about unusual items",
      reason: "A short note from the client helps Tina and the CPA understand owner flows, one-time items, transfers, or missing months before they become false assumptions.",
      priority: "recommended",
      acceptedFormats: ["TXT", "DOCX", "PDF", "CSV"],
      examples: [
        "owner draw note",
        "one-time transaction memo",
        "bookkeeper handoff note",
        "unusual-items CSV extract",
      ],
    },
    {
      id: "trial-balance",
      label: "Year-end trial balance",
      reason: "If available, this gives Tina another clean checkpoint for account-level tie-out.",
      priority: "recommended",
      acceptedFormats: ["CSV", "XLSX", "PDF"],
      examples: ["trial balance export", "year-end TB"],
    },
  ];
}

export function buildTinaClientUploadRequirements(
  draft: TinaWorkspaceDraft,
  recommendation: TinaFilingLaneRecommendation
): TinaClientUploadRequirement[] {
  const requirements: TinaClientUploadRequirement[] = buildBaseRequirements().map((definition) => ({
    ...definition,
    status:
      definition.id === "prior-return"
        ? draft.priorReturnDocumentId || draft.priorReturn
          ? "covered"
          : "needed"
        : hasDocumentForRequest(draft, definition.id)
          ? "covered"
          : "needed",
  }));

  if (draft.profile.hasPayroll) {
    requirements.push({
      id: "payroll",
      label: "Payroll reports and W-2 support",
      reason: "Tina needs payroll registers and employer tax support to prove wage deductions and payroll tax expense.",
      priority: "required",
      acceptedFormats: ["PDF", "CSV", "XLSX"],
      examples: ["annual payroll summary", "quarterly payroll reports", "W-2/W-3 support"],
      status: hasDocumentForRequest(draft, "payroll") ? "covered" : "needed",
    });
  }

  if (draft.profile.paysContractors) {
    requirements.push({
      id: "contractors",
      label: "Contractor payments and 1099 support",
      reason: "Tina needs who was paid, how much was paid, and whether any 1099 reporting belongs in the file.",
      priority: "required",
      acceptedFormats: ["PDF", "CSV", "XLSX"],
      examples: ["1099 vendor summary", "contractor payment report", "W-9 packet"],
      status: hasDocumentForRequest(draft, "contractors") ? "covered" : "needed",
    });
  }

  if (draft.profile.hasFixedAssets) {
    requirements.push({
      id: "assets",
      label: "Fixed asset and depreciation support",
      reason: "Placed-in-service dates, cost, and depreciation support are required before Tina can trust asset treatment.",
      priority: "required",
      acceptedFormats: ["CSV", "XLSX", "PDF"],
      examples: ["fixed asset schedule", "depreciation rollforward", "equipment purchase support"],
      status:
        hasDocumentForRequest(draft, "assets") || Boolean(draft.priorReturnDocumentId || draft.priorReturn)
          ? "covered"
          : "needed",
    });
  }

  if (draft.profile.collectsSalesTax) {
    requirements.push({
      id: "sales-tax",
      label: "Sales tax reports",
      reason: "Tina needs sales tax support so taxable sales do not get overstated as ordinary income.",
      priority: "required",
      acceptedFormats: ["PDF", "CSV", "XLSX"],
      examples: ["monthly sales tax return", "taxable vs non-taxable sales report"],
      status: hasDocumentForRequest(draft, "sales-tax") ? "covered" : "needed",
    });
  }

  if (draft.profile.hasInventory) {
    requirements.push({
      id: "inventory",
      label: "Ending inventory support",
      reason: "Inventory businesses need year-end counts or valuation support before Tina can trust cost-of-goods treatment.",
      priority: "required",
      acceptedFormats: ["CSV", "XLSX", "PDF"],
      examples: ["inventory count", "year-end stock valuation", "COGS support schedule"],
      status: hasDocumentForRequest(draft, "inventory") ? "covered" : "needed",
    });
  }

  if (draft.profile.entityType !== "sole_prop" && draft.profile.entityType !== "unsure") {
    requirements.push({
      id: "entity-docs",
      label: "Entity and ownership documents",
      reason: "The CPA will want the filing posture, ownership structure, and election history in one place before review begins.",
      priority: "recommended",
      acceptedFormats: ["PDF"],
      examples: ["formation docs", "EIN letter", "2553 acceptance", "ownership schedule"],
      status: hasDocumentForRequest(draft, "entity-docs") ? "covered" : "needed",
    });
  }

  if (!draft.profile.naicsCode.trim()) {
    requirements.push({
      id: "business-description",
      label: "Short business description",
      reason: "A plain-English description helps Tina and the CPA understand how the business makes money and what deductions should exist.",
      priority: "recommended",
      acceptedFormats: ["TXT", "DOCX", "PDF"],
      examples: ["one-page business overview", "NAICS note", "what this business does memo"],
      status: "needed",
    });
  }

  requirements.push({
      id: "loan-support",
      label: "Loan statements and debt support",
      reason: "If the business has debt, Tina needs loan statements to separate principal from interest and track balance changes.",
      priority: "recommended",
      acceptedFormats: ["PDF", "CSV"],
      examples: [
        "monthly loan statements",
        "interest statement",
        "amortization schedule",
        "loan statement extract",
      ],
      status: hasDocumentForRequest(draft, "loan-support") ? "covered" : "needed",
    });

  if (recommendation.support !== "supported") {
    requirements.push({
      id: "lane-review",
      label: "Return type confirmation",
      reason: "The current file may belong to a return family Tina does not fully support yet, so the CPA needs to confirm the lane before prep continues.",
      priority: "watch",
      acceptedFormats: ["N/A"],
      examples: ["Entity confirmation", "prior filed return check"],
      status: "needed",
    });
  }

  return requirements;
}
