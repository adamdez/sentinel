import { buildTinaBooksNormalization } from "@/tina/lib/books-normalization";
import { buildTinaOwnershipTimeline } from "@/tina/lib/ownership-timeline";
import { buildTinaScheduleCFormCoverage } from "@/tina/lib/schedule-c-form-coverage";
import { buildTinaScheduleCReturn } from "@/tina/lib/schedule-c-return";
import type {
  TinaAttachmentStatementItem,
  TinaAttachmentStatementSnapshot,
  TinaWorkspaceDraft,
} from "@/tina/types";

function formatMoney(value: number | null): string {
  if (value === null) return "unknown";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildItem(item: TinaAttachmentStatementItem): TinaAttachmentStatementItem {
  return {
    ...item,
    relatedLineNumbers: unique(item.relatedLineNumbers),
    relatedDocumentIds: unique(item.relatedDocumentIds),
  };
}

function hasHomeOfficeSignal(draft: TinaWorkspaceDraft): boolean {
  const haystack = `${draft.profile.notes} ${draft.profile.principalBusinessActivity}`.toLowerCase();
  return /\b(home office|office in home|home workspace)\b/.test(haystack);
}

export function buildTinaAttachmentStatements(
  draft: TinaWorkspaceDraft
): TinaAttachmentStatementSnapshot {
  const scheduleCReturn = buildTinaScheduleCReturn(draft);
  const formCoverage = buildTinaScheduleCFormCoverage(draft);
  const ownershipTimeline = buildTinaOwnershipTimeline(draft);
  const booksNormalization = buildTinaBooksNormalization(draft);
  const items: TinaAttachmentStatementItem[] = [];

  const otherExpensesField =
    scheduleCReturn.fields.find((field) => field.formKey === "otherExpenses") ?? null;
  const depreciationField =
    scheduleCReturn.fields.find((field) => field.formKey === "depreciation") ?? null;
  const cogsField =
    scheduleCReturn.fields.find((field) => field.formKey === "costOfGoodsSold") ?? null;
  const inventoryCoverage = formCoverage.items.find((item) =>
    /inventory|cost of goods/i.test(item.title)
  );
  const ownerFlowIssues = booksNormalization.issues.filter((issue) =>
    /owner|former owner|related-party|intercompany/i.test(issue.title)
  );

  if (typeof otherExpensesField?.amount === "number" && otherExpensesField.amount > 0) {
    items.push(
      buildItem({
        id: "other-expenses-detail",
        title: "Line 27a other-expense detail statement",
        category: "other_expense_detail",
        formId: "f1040sc",
        status:
          otherExpensesField.status === "waiting"
            ? "blocked"
            : otherExpensesField.status === "needs_attention"
              ? "needs_review"
              : "needs_review",
        summary:
          otherExpensesField.status === "waiting"
            ? "Line 27a still needs category-level detail before Tina should treat the attachment as ready."
            : "Tina should attach a reviewer-visible detail statement behind line 27a instead of leaving the amount unexplained.",
        statement: `Line 27a currently carries ${formatMoney(
          otherExpensesField.amount
        )} of uncategorized other expenses. Tina should either classify these costs into supported boxes or attach a reviewer-facing detail schedule before final output.`,
        relatedLineNumbers: [otherExpensesField.lineNumber],
        relatedDocumentIds: draft.documents.map((document) => document.id),
      })
    );
  }

  if (draft.profile.hasFixedAssets || (typeof depreciationField?.amount === "number" && depreciationField.amount > 0)) {
    items.push(
      buildItem({
        id: "depreciation-support",
        title: "Depreciation and fixed-asset support statement",
        category: "depreciation_support",
        formId: "f4562",
        status:
          depreciationField?.status === "waiting"
            ? "blocked"
            : draft.profile.hasFixedAssets || (typeof depreciationField?.amount === "number" && depreciationField.amount > 0)
              ? "needs_review"
              : "ready",
        summary:
          depreciationField?.status === "waiting"
            ? "Depreciation support is still too thin for Tina to claim a defensible attachment."
            : "Tina should package a fixed-asset and depreciation statement alongside any Form 4562 expectation.",
        statement: `The file shows ${
          draft.profile.hasFixedAssets ? "fixed-asset activity" : "a depreciation amount"
        } with Schedule C line 13 currently at ${formatMoney(
          depreciationField?.amount ?? null
        )}. Tina should attach an asset list, placed-in-service dates, and depreciation method assumptions before calling this attachment reviewer-ready.`,
        relatedLineNumbers: depreciationField ? [depreciationField.lineNumber] : ["Line 13"],
        relatedDocumentIds: draft.documents.map((document) => document.id),
      })
    );
  }

  if (hasHomeOfficeSignal(draft)) {
    items.push(
      buildItem({
        id: "home-office-support",
        title: "Home-office support statement",
        category: "home_office_support",
        formId: "f8829",
        status: "needs_review",
        summary:
          "Tina should include a short home-office support statement whenever Form 8829 is in the likely form set.",
        statement:
          "Home-office signals are present. Tina should attach square-footage support, exclusive-use facts, and expense-allocation assumptions before presenting Form 8829 treatment as review-ready.",
        relatedLineNumbers: [],
        relatedDocumentIds: draft.documents.map((document) => document.id),
      })
    );
  }

  if (draft.profile.hasInventory || (typeof cogsField?.amount === "number" && cogsField.amount > 0) || inventoryCoverage) {
    items.push(
      buildItem({
        id: "inventory-support",
        title: "Inventory and COGS support statement",
        category: "inventory_support",
        formId: "f1040sc",
        status:
          inventoryCoverage?.status === "unsupported"
            ? "blocked"
            : inventoryCoverage?.status === "partial" || inventoryCoverage?.status === "needs_review"
              ? "needs_review"
              : "ready",
        summary:
          inventoryCoverage?.status === "unsupported"
            ? "Inventory treatment is still unsupported, so Tina should not imply that COGS support is complete."
            : "Tina should attach an inventory support statement whenever COGS or inventory facts are in play.",
        statement: `Inventory or COGS facts are present with Schedule C line 4 currently at ${formatMoney(
          cogsField?.amount ?? null
        )}. Tina should attach beginning inventory, purchases, ending inventory, and method assumptions before calling this area final.`,
        relatedLineNumbers: cogsField ? [cogsField.lineNumber] : ["Line 4"],
        relatedDocumentIds: draft.documents.map((document) => document.id),
      })
    );
  }

  if (
    ownershipTimeline.hasMidYearChange ||
    ownershipTimeline.hasFormerOwnerPayments ||
    ownerFlowIssues.length > 0
  ) {
    const blockedOwnerFlowIssues = ownerFlowIssues.filter((issue) => issue.severity === "blocking");
    items.push(
      buildItem({
        id: "owner-flow-explanation",
        title: "Owner-flow and ownership-change explanation",
        category: "owner_flow_explanation",
        formId: null,
        status: blockedOwnerFlowIssues.length > 0 ? "blocked" : "needs_review",
        summary:
          blockedOwnerFlowIssues.length > 0
            ? "Ownership or owner-flow facts still block Tina from treating the file as fully understood."
            : "Tina should attach a short explanation of owner-flow and ownership events so the reviewer is not forced to reconstruct them from raw papers.",
        statement: `Ownership timeline events detected: ${ownershipTimeline.events
          .slice(0, 4)
          .map((event) => event.title)
          .join("; ")}. Tina should pair these facts with any owner-draw, former-owner-payment, or related-party bookkeeping issues before trusting final treatment.`,
        relatedLineNumbers: [],
        relatedDocumentIds: unique([
          ...ownershipTimeline.events.flatMap((event) => event.relatedDocumentIds),
          ...ownerFlowIssues.flatMap((issue) => issue.documentIds),
        ]),
      })
    );
  }

  const blockedCount = items.filter((item) => item.status === "blocked").length;
  const reviewCount = items.filter((item) => item.status === "needs_review").length;
  const overallStatus =
    blockedCount > 0 ? "blocked" : reviewCount > 0 ? "needs_review" : "ready";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    overallStatus,
    summary:
      items.length === 0
        ? "Tina does not currently see attachment-grade statement work beyond the core packet."
        : overallStatus === "ready"
          ? `Tina built ${items.length} attachment or statement item${items.length === 1 ? "" : "s"} with no current blockers.`
          : overallStatus === "needs_review"
            ? `Tina built ${items.length} attachment or statement item${items.length === 1 ? "" : "s"}, but ${reviewCount} still need reviewer attention.`
            : `Tina built ${items.length} attachment or statement item${items.length === 1 ? "" : "s"}, but ${blockedCount} still block final-form confidence.`,
    nextStep:
      items.length === 0
        ? "Keep the attachment engine quiet unless facts call for extra statements."
        : "Carry these statements with the packet so unsupported lines and attachments never stay implicit.",
    items,
  };
}
