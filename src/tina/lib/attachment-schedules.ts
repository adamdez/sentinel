import type {
  TinaAttachmentScheduleItem,
  TinaAttachmentScheduleRow,
  TinaAttachmentScheduleSnapshot,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaAttachmentStatements } from "@/tina/lib/attachment-statements";
import { buildTinaBooksNormalization } from "@/tina/lib/books-normalization";
import { buildTinaOwnershipTimeline } from "@/tina/lib/ownership-timeline";
import { buildTinaScheduleCReturn } from "@/tina/lib/schedule-c-return";
import type { TinaWorkpaperLine, TinaWorkspaceDraft } from "@/tina/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function formatMoney(value: number | null): string {
  if (value === null) return "Unknown";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function normalizeLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function lineIncludes(line: TinaWorkpaperLine, needles: string[]): boolean {
  const normalized = normalizeLabel(`${line.label} ${line.summary}`);
  return needles.some((needle) => normalized.includes(normalizeLabel(needle)));
}

function partitionExpenseLines(lines: TinaWorkpaperLine[]) {
  const advertisingLines = lines.filter((line) => lineIncludes(line, ["advertising"]));
  const depreciationLines = lines.filter((line) =>
    lineIncludes(line, ["depreciation", "section 179", "bonus depreciation"])
  );
  const officeExpenseLines = lines.filter((line) =>
    lineIncludes(line, ["office expense", "postage"])
  );
  const rentLeaseLines = lines.filter((line) => lineIncludes(line, ["rent", "lease"]));
  const suppliesLines = lines.filter((line) => lineIncludes(line, ["supplies"]));
  const taxesAndLicensesLines = lines.filter((line) =>
    lineIncludes(line, ["taxes and licenses", "licenses", "license fee", "business taxes"])
  );
  const travelLines = lines.filter(
    (line) => lineIncludes(line, ["travel"]) && !lineIncludes(line, ["meal"])
  );
  const mealsLines = lines.filter((line) => lineIncludes(line, ["meal", "meals"]));
  const consumedIds = new Set(
    [
      ...advertisingLines,
      ...depreciationLines,
      ...officeExpenseLines,
      ...rentLeaseLines,
      ...suppliesLines,
      ...taxesAndLicensesLines,
      ...travelLines,
      ...mealsLines,
    ].map((line) => line.id)
  );

  return {
    depreciationLines,
    uncategorizedOtherExpenseLines: lines.filter((line) => !consumedIds.has(line.id)),
  };
}

function row(value: TinaAttachmentScheduleRow): TinaAttachmentScheduleRow {
  return {
    ...value,
    relatedDocumentIds: unique(value.relatedDocumentIds),
  };
}

function buildSchedule(item: TinaAttachmentScheduleItem): TinaAttachmentScheduleItem {
  return {
    ...item,
    rows: item.rows.map(row),
    relatedLineNumbers: unique(item.relatedLineNumbers),
    relatedDocumentIds: unique(item.relatedDocumentIds),
  };
}

function supportFromStatus(
  status: "ready" | "needs_attention" | "waiting" | "known" | "assumed" | "needs_proof"
): "supported" | "derived" | "missing" {
  if (status === "ready" || status === "known") return "supported";
  if (status === "needs_attention" || status === "assumed") return "derived";
  return "missing";
}

function hasSignal(haystack: string, pattern: RegExp): boolean {
  return pattern.test(haystack.toLowerCase());
}

export function buildTinaAttachmentSchedules(
  draft: TinaWorkspaceDraft
): TinaAttachmentScheduleSnapshot {
  const statements = buildTinaAttachmentStatements(draft);
  const scheduleCReturn = buildTinaScheduleCReturn(draft);
  const ownershipTimeline = buildTinaOwnershipTimeline(draft);
  const booksNormalization = buildTinaBooksNormalization(draft);
  const genericExpenseLines = draft.reviewerFinal.lines.filter(
    (line) => line.kind === "expense" && line.label === "Business expense candidate"
  );
  const { depreciationLines, uncategorizedOtherExpenseLines } = partitionExpenseLines(
    genericExpenseLines
  );
  const line27a = scheduleCReturn.fields.find((field) => field.formKey === "otherExpenses");
  const line13 = scheduleCReturn.fields.find((field) => field.formKey === "depreciation");
  const line4 = scheduleCReturn.fields.find((field) => field.formKey === "costOfGoodsSold");
  const homeOfficeText = `${draft.profile.notes} ${draft.profile.principalBusinessActivity}`;
  const homeOfficeSignal = hasSignal(
    homeOfficeText,
    /\b(home office|office in home|home workspace)\b/
  );
  const assetDocs = draft.documents.filter((document) =>
    /fixed asset|asset register|depreciation|4562/i.test(document.name)
  );
  const inventoryDocs = draft.documents.filter((document) =>
    /inventory|cogs|stock|sku|purchases/i.test(document.name)
  );
  const exclusiveUseFacts = draft.sourceFacts.filter((fact) =>
    /exclusive use|square footage|home office/i.test(`${fact.label} ${fact.value}`)
  );
  const ownerFlowIssues = booksNormalization.issues.filter((issue) =>
    /owner|former owner|related-party|intercompany/i.test(issue.title)
  );
  const items: TinaAttachmentScheduleItem[] = [];

  statements.items.forEach((statement) => {
    if (statement.category === "other_expense_detail") {
      const rows =
        uncategorizedOtherExpenseLines.length > 0
          ? uncategorizedOtherExpenseLines.slice(0, 8).map((line, index) =>
              row({
                id: `other-expense-${line.id}`,
                label: line.summary || `Other expense detail ${index + 1}`,
                value: line.label,
                amount: line.amount,
                supportLevel: supportFromStatus(line.status),
                summary: "Reviewer-final expense line currently flowing into line 27a.",
                relatedDocumentIds: line.sourceDocumentIds,
              })
            )
          : [
              row({
                id: "other-expense-total",
                label: "Line 27a total",
                value: statement.summary,
                amount: line27a?.amount ?? null,
                supportLevel:
                  typeof line27a?.amount === "number" && line27a.amount > 0
                    ? "derived"
                    : "missing",
                summary: "Tina has a total but not yet a fully itemized detail schedule.",
                relatedDocumentIds: statement.relatedDocumentIds,
              }),
            ];

      items.push(
        buildSchedule({
          id: statement.id,
          title: statement.title,
          category: statement.category,
          formId: statement.formId,
          status: statement.status,
          summary:
            "Structured detail for line 27a so the reviewer is not left with only narrative attachment text.",
          columnLabels: ["Expense detail", "Current source", "Support"],
          rows,
          relatedLineNumbers: statement.relatedLineNumbers,
          relatedDocumentIds: statement.relatedDocumentIds,
        })
      );
    }

    if (statement.category === "depreciation_support") {
      const rows = [
        row({
          id: "depreciation-line13",
          label: "Schedule C line 13",
          value: formatMoney(line13?.amount ?? null),
          amount: line13?.amount ?? null,
          supportLevel:
            typeof line13?.amount === "number" && line13.amount > 0
              ? supportFromStatus(line13.status)
              : "missing",
          summary: "Current depreciation amount flowing into the return snapshot.",
          relatedDocumentIds: statement.relatedDocumentIds,
        }),
        row({
          id: "depreciation-asset-register",
          label: "Asset register support",
          value:
            assetDocs.length > 0
              ? `${assetDocs.length} asset-support document(s)`
              : "No asset register found",
          amount: null,
          supportLevel:
            assetDocs.length > 0 ? "supported" : draft.profile.hasFixedAssets ? "missing" : "derived",
          summary: "Veteran-grade depreciation review wants an asset list, not just a total.",
          relatedDocumentIds: assetDocs.map((document) => document.id),
        }),
        ...depreciationLines.slice(0, 4).map((line) =>
          row({
            id: `depreciation-line-${line.id}`,
            label: line.summary || "Depreciation line",
            value: line.label,
            amount: line.amount,
            supportLevel: supportFromStatus(line.status),
            summary: "Reviewer-final line contributing to depreciation support.",
            relatedDocumentIds: line.sourceDocumentIds,
          })
        ),
      ];

      items.push(
        buildSchedule({
          id: statement.id,
          title: statement.title,
          category: statement.category,
          formId: statement.formId,
          status: statement.status,
          summary:
            "Structured depreciation support so Form 4562 work is grounded in rows instead of only prose.",
          columnLabels: ["Support item", "Current value", "Support"],
          rows,
          relatedLineNumbers: statement.relatedLineNumbers,
          relatedDocumentIds: statement.relatedDocumentIds,
        })
      );
    }

    if (statement.category === "home_office_support") {
      const rows = [
        row({
          id: "home-office-signal",
          label: "Home-office signal",
          value: homeOfficeSignal ? "Present in notes or activity" : "Not detected",
          amount: null,
          supportLevel: homeOfficeSignal ? "derived" : "missing",
          summary: "Tina currently infers home-office need from intake and notes.",
          relatedDocumentIds: statement.relatedDocumentIds,
        }),
        row({
          id: "home-office-exclusive-use",
          label: "Exclusive-use support",
          value:
            exclusiveUseFacts.length > 0
              ? `${exclusiveUseFacts.length} fact signal(s)`
              : "No exclusive-use fact found",
          amount: null,
          supportLevel: exclusiveUseFacts.length > 0 ? "supported" : "missing",
          summary:
            "Home-office treatment needs exclusive-use support before it should feel reviewer-ready.",
          relatedDocumentIds: statement.relatedDocumentIds,
        }),
        row({
          id: "home-office-form-8829",
          label: "Form 8829 expectation",
          value: "Likely companion attachment",
          amount: null,
          supportLevel: "derived",
          summary:
            "Tina sees enough signal to keep Form 8829 in the review conversation.",
          relatedDocumentIds: statement.relatedDocumentIds,
        }),
      ];

      items.push(
        buildSchedule({
          id: statement.id,
          title: statement.title,
          category: statement.category,
          formId: statement.formId,
          status: statement.status,
          summary:
            "Structured home-office support so the owner and reviewer can see exactly what Tina still lacks.",
          columnLabels: ["Support item", "Current value", "Support"],
          rows,
          relatedLineNumbers: statement.relatedLineNumbers,
          relatedDocumentIds: statement.relatedDocumentIds,
        })
      );
    }

    if (statement.category === "inventory_support") {
      const hasMethodFact = draft.sourceFacts.some((fact) =>
        /fifo|lifo|specific identification|inventory method/i.test(`${fact.label} ${fact.value}`)
      );
      const rows = [
        row({
          id: "inventory-line4",
          label: "Schedule C line 4",
          value: formatMoney(line4?.amount ?? null),
          amount: line4?.amount ?? null,
          supportLevel:
            typeof line4?.amount === "number"
              ? supportFromStatus(line4.status)
              : draft.profile.hasInventory
                ? "missing"
                : "derived",
          summary: "Current COGS amount in the return snapshot.",
          relatedDocumentIds: statement.relatedDocumentIds,
        }),
        row({
          id: "inventory-records",
          label: "Inventory records",
          value:
            inventoryDocs.length > 0
              ? `${inventoryDocs.length} inventory document(s)`
              : "No inventory records found",
          amount: null,
          supportLevel:
            inventoryDocs.length > 0 ? "supported" : draft.profile.hasInventory ? "missing" : "derived",
          summary: "Inventory treatment needs beginning, purchases, and ending support.",
          relatedDocumentIds: inventoryDocs.map((document) => document.id),
        }),
        row({
          id: "inventory-method",
          label: "Inventory method support",
          value: hasMethodFact ? "Method signal present" : "No method signal found",
          amount: null,
          supportLevel: hasMethodFact ? "supported" : "missing",
          summary:
            "Reviewer-grade inventory handling needs a method assumption on the record.",
          relatedDocumentIds: statement.relatedDocumentIds,
        }),
      ];

      items.push(
        buildSchedule({
          id: statement.id,
          title: statement.title,
          category: statement.category,
          formId: statement.formId,
          status: statement.status,
          summary: "Structured inventory and COGS support behind the narrative attachment note.",
          columnLabels: ["Support item", "Current value", "Support"],
          rows,
          relatedLineNumbers: statement.relatedLineNumbers,
          relatedDocumentIds: statement.relatedDocumentIds,
        })
      );
    }

    if (statement.category === "owner_flow_explanation") {
      const rows = [
        row({
          id: "owner-count",
          label: "Likely owner count",
          value:
            ownershipTimeline.likelyOwnerCount === null
              ? "Unknown"
              : String(ownershipTimeline.likelyOwnerCount),
          amount: null,
          supportLevel:
            ownershipTimeline.likelyOwnerCount === null ? "missing" : "derived",
          summary:
            "Owner count should be explicit before Tina treats ownership economics as fully understood.",
          relatedDocumentIds: statement.relatedDocumentIds,
        }),
        row({
          id: "owner-midyear-change",
          label: "Mid-year ownership change",
          value: ownershipTimeline.hasMidYearChange ? "Yes" : "No",
          amount: null,
          supportLevel: ownershipTimeline.hasMidYearChange ? "derived" : "supported",
          summary: "Ownership change years need special reviewer attention.",
          relatedDocumentIds: statement.relatedDocumentIds,
        }),
        row({
          id: "former-owner-payments",
          label: "Former-owner payments",
          value: ownershipTimeline.hasFormerOwnerPayments ? "Yes" : "No",
          amount: null,
          supportLevel: ownershipTimeline.hasFormerOwnerPayments ? "derived" : "supported",
          summary:
            "Company-paid former-owner flows are not something Tina should leave implicit.",
          relatedDocumentIds: statement.relatedDocumentIds,
        }),
        ...ownerFlowIssues.slice(0, 4).map((issue) =>
          row({
            id: `owner-issue-${issue.id}`,
            label: issue.title,
            value: issue.severity,
            amount: null,
            supportLevel: issue.severity === "blocking" ? "missing" : "derived",
            summary: issue.summary,
            relatedDocumentIds: issue.documentIds,
          })
        ),
      ];

      items.push(
        buildSchedule({
          id: statement.id,
          title: statement.title,
          category: statement.category,
          formId: statement.formId,
          status: statement.status,
          summary:
            "Structured ownership and owner-flow schedule so the reviewer sees the economics in rows, not scattered hints.",
          columnLabels: ["Owner-flow item", "Current value", "Support"],
          rows,
          relatedLineNumbers: statement.relatedLineNumbers,
          relatedDocumentIds: statement.relatedDocumentIds,
        })
      );
    }
  });

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
        ? "Tina does not currently need structured attachment schedules beyond the core packet."
        : overallStatus === "ready"
          ? `Tina built ${items.length} structured attachment schedule${items.length === 1 ? "" : "s"} with no current blockers.`
          : overallStatus === "needs_review"
            ? `Tina built ${items.length} structured attachment schedule${items.length === 1 ? "" : "s"}, but ${reviewCount} still need review.`
            : `Tina built ${items.length} structured attachment schedule${items.length === 1 ? "" : "s"}, but ${blockedCount} still block form confidence.`,
    nextStep:
      items.length === 0
        ? "Keep attachment schedules quiet until facts really call for them."
        : "Carry these structured schedules with the packet so attachments feel like working papers, not just narrative notes.",
    items,
  };
}
