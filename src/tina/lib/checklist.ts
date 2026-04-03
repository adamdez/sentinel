import { buildTinaStartPathAssessment } from "@/tina/lib/start-path";
import type {
  TinaChecklistItem,
  TinaFilingLaneRecommendation,
  TinaWorkspaceDraft,
} from "@/tina/types";

function hasDocumentForRequest(draft: TinaWorkspaceDraft, requestId: string): boolean {
  return draft.documents.some((document) => document.requestId === requestId);
}

function hasQuickBooksCoverage(draft: TinaWorkspaceDraft): boolean {
  return (
    hasDocumentForRequest(draft, "quickbooks") ||
    draft.quickBooksConnection.status === "connected" ||
    draft.quickBooksConnection.status === "syncing" ||
    draft.quickBooksConnection.importedDocumentIds.length > 0
  );
}

export function buildTinaChecklist(
  draft: TinaWorkspaceDraft,
  recommendation: TinaFilingLaneRecommendation
): TinaChecklistItem[] {
  const startPath = buildTinaStartPathAssessment(draft);
  const hasPriorReturn = Boolean(draft.priorReturnDocumentId || draft.priorReturn);
  const items: TinaChecklistItem[] = [
    {
      id: "prior-return",
      label: "Last year's tax return",
      reason: "This helps Tina copy over the basics so you do not have to type everything again.",
      priority: "required",
      status: hasPriorReturn ? "covered" : "needed",
    },
    {
      id: "quickbooks",
      label: "QuickBooks or your profit-and-loss report",
      reason: "Tina needs your main money records so she can start the tax work from the right numbers.",
      priority: "required",
      status: hasQuickBooksCoverage(draft) ? "covered" : "needed",
    },
    {
      id: "bank-support",
      label: "Business bank and card statements",
      reason: "These help Tina check that the book numbers match the real money moving in and out.",
      priority: "required",
      status: hasDocumentForRequest(draft, "bank-support") ? "covered" : "needed",
    },
  ];

  if (draft.profile.paysContractors) {
    items.push({
      id: "contractors",
      label: "Contractor payments and 1099 list",
      reason: "Tina needs this to understand who you paid and whether any contractor tax forms are part of the story.",
      priority: "required",
      status: hasDocumentForRequest(draft, "contractors") ? "covered" : "needed",
    });
  }

  if (draft.profile.hasPayroll) {
    items.push({
      id: "payroll",
      label: "Payroll reports and W-2 papers",
      reason: "Tina needs this to check wages, payroll costs, and related deductions.",
      priority: "required",
      status: hasDocumentForRequest(draft, "payroll") ? "covered" : "needed",
    });
  }

  if (draft.profile.hasFixedAssets) {
    items.push({
      id: "assets",
      label: "Big purchase list and depreciation papers",
      reason: "If you bought equipment, vehicles, or other big items, Tina needs the details before she can trust the write-off math.",
      priority: "required",
      status:
        hasPriorReturn || hasDocumentForRequest(draft, "assets") ? "covered" : "needed",
    });
  }

  if (draft.profile.collectsSalesTax) {
    items.push({
      id: "sales-tax",
      label: "Washington sales tax history",
      reason: "Tina needs to see what sales tax you collected and what you already sent in.",
      priority: "required",
      status: hasDocumentForRequest(draft, "sales-tax") ? "covered" : "needed",
    });
  }

  if (draft.profile.hasInventory) {
    items.push({
      id: "inventory",
      label: "Inventory count or end-of-year inventory value",
      reason: "If you sell products, Tina needs to know what you still had left at the end of the year.",
      priority: "recommended",
      status: hasDocumentForRequest(draft, "inventory") ? "covered" : "needed",
    });
  }

  if (!draft.profile.naicsCode.trim()) {
    items.push({
      id: "naics",
      label: "What kind of business this is",
      reason: "A short business description helps Tina ask for the right papers and look for the right deductions.",
      priority: "recommended",
      status: "needed",
    });
  }

  if (recommendation.support !== "supported") {
    items.push({
      id: "lane-review",
      label: "Return type check",
      reason: "Tina thinks this business may need a return type that is not fully built yet in this first version.",
      priority: "watch",
      status: "needed",
    });
  }

  startPath.proofRequirements.forEach((requirement) => {
    items.push({
      id: requirement.id,
      label: requirement.label,
      reason: requirement.reason,
      priority: requirement.priority,
      status: requirement.status,
    });
  });

  return items;
}
