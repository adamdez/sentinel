import type {
  TinaScheduleCDraftField,
  TinaTaxPositionRecord,
  TinaWorkpaperLine,
  TinaWorkspaceDraft,
} from "@/tina/types";
import { buildTinaTransactionReconciliationReport } from "@/tina/lib/transaction-reconciliation";

export interface TinaReviewTraceRow {
  fieldId: string;
  lineNumber: string;
  label: string;
  amount: number | null;
  fieldStatus: TinaScheduleCDraftField["status"];
  reviewerFinalLabels: string[];
  taxPositionTitles: string[];
  sourceDocumentNames: string[];
  reconciliationStatus: "ready" | "needs_review" | "blocked" | "unknown";
  lineageCount: number;
  summary: string;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function indexReviewerFinalLines(draft: TinaWorkspaceDraft): Map<string, TinaWorkpaperLine> {
  return new Map(draft.reviewerFinal.lines.map((line) => [line.id, line]));
}

function indexTaxPositions(draft: TinaWorkspaceDraft): Map<string, TinaTaxPositionRecord> {
  return new Map(draft.taxPositionMemory.records.map((record) => [record.adjustmentId, record]));
}

function buildFieldSummary(args: {
  field: TinaScheduleCDraftField;
  reviewerFinalLabels: string[];
  taxPositionTitles: string[];
  sourceDocumentNames: string[];
  reconciliationStatus: TinaReviewTraceRow["reconciliationStatus"];
  lineageCount: number;
}): string {
  const parts: string[] = [args.field.summary];

  if (args.reviewerFinalLabels.length > 0) {
    parts.push(`Reviewer-final lines: ${args.reviewerFinalLabels.join(", ")}.`);
  }

  if (args.taxPositionTitles.length > 0) {
    parts.push(`Tax positions: ${args.taxPositionTitles.join(", ")}.`);
  }

  if (args.sourceDocumentNames.length > 0) {
    parts.push(`Source papers: ${args.sourceDocumentNames.join(", ")}.`);
  }

  if (args.reconciliationStatus !== "unknown") {
    parts.push(
      `Transaction reconciliation: ${args.reconciliationStatus.replace(/_/g, " ")}${args.lineageCount > 0 ? ` with ${args.lineageCount} lineage cluster${args.lineageCount === 1 ? "" : "s"}` : ""}.`
    );
  }

  return parts.join(" ");
}

export function buildTinaReviewTraceRows(draft: TinaWorkspaceDraft): TinaReviewTraceRow[] {
  const reviewerFinalById = indexReviewerFinalLines(draft);
  const taxPositionsByAdjustmentId = indexTaxPositions(draft);
  const documentNameById = new Map(draft.documents.map((document) => [document.id, document.name]));
  const reconciliation = buildTinaTransactionReconciliationReport(draft);

  return draft.scheduleCDraft.fields.map((field) => {
    const reviewerFinalLabels = uniqueStrings(
      field.reviewerFinalLineIds
        .map((id) => reviewerFinalById.get(id)?.label ?? "")
        .filter(Boolean)
    );
    const taxPositionTitles = uniqueStrings(
      field.taxAdjustmentIds
        .map((adjustmentId) => taxPositionsByAdjustmentId.get(adjustmentId)?.title ?? "")
        .filter(Boolean)
    );
    const sourceDocumentNames = uniqueStrings(
      field.sourceDocumentIds
        .map((documentId) => documentNameById.get(documentId) ?? documentId)
        .filter(Boolean)
    );
    const linkedReconciliationGroups = reconciliation.groups.filter((group) =>
      group.fieldIds.includes(field.id)
    );
    const reconciliationStatus =
      linkedReconciliationGroups.some((group) => group.status === "blocked")
        ? "blocked"
        : linkedReconciliationGroups.some((group) => group.status === "needs_review")
          ? "needs_review"
          : linkedReconciliationGroups.length > 0
            ? "ready"
            : "unknown";
    const lineageCount = linkedReconciliationGroups.reduce(
      (total, group) => total + group.lineageCount,
      0
    );

    return {
      fieldId: field.id,
      lineNumber: field.lineNumber,
      label: field.label,
      amount: field.amount,
      fieldStatus: field.status,
      reviewerFinalLabels,
      taxPositionTitles,
      sourceDocumentNames,
      reconciliationStatus,
      lineageCount,
      summary: buildFieldSummary({
        field,
        reviewerFinalLabels,
        taxPositionTitles,
        sourceDocumentNames,
        reconciliationStatus,
        lineageCount,
      }),
    };
  });
}
