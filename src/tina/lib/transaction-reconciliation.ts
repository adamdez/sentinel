import {
  collectTinaAnalyzedTransactionGroups,
  measureTinaTransactionGroupAlignment,
  TINA_TRANSACTION_EVIDENCE_LABELS,
} from "@/tina/lib/transaction-group-analysis";
import type { TinaTaxAdjustment, TinaWorkspaceDraft } from "@/tina/types";

export type TinaTransactionReconciliationStatus = "ready" | "needs_review" | "blocked";

export interface TinaTransactionReconciliationGroup {
  id: string;
  label: string;
  status: TinaTransactionReconciliationStatus;
  sourceDocumentIds: string[];
  fieldIds: string[];
  adjustmentIds: string[];
  linkedAdjustmentKinds: TinaTaxAdjustment["kind"][];
  transactionGroupCount: number;
  lineageCount: number;
  bucketCount: number;
  mismatchCount: number;
  summary: string;
}

export interface TinaTransactionReconciliationReport {
  summary: string;
  nextStep: string;
  groups: TinaTransactionReconciliationGroup[];
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function determineStatus(args: {
  specializedEvidence: boolean;
  linkedAdjustments: TinaTaxAdjustment[];
  linkedFieldsCount: number;
  hasWaitingField: boolean;
  hasNeedsReviewField: boolean;
  lineageCount: number;
  mismatchCount: number;
}): TinaTransactionReconciliationStatus {
  if (args.hasWaitingField) return "blocked";
  if (args.mismatchCount > 0) return "blocked";
  if (args.linkedAdjustments.length === 0) return "blocked";
  if (args.linkedFieldsCount === 0 && args.lineageCount > 0) return "blocked";

  const allGeneric = args.linkedAdjustments.every(
    (adjustment) =>
      adjustment.kind === "carryforward_line" ||
      adjustment.kind === "continuity_review" ||
      adjustment.kind === "depreciation_review"
  );
  const hasAuthorityBlock = args.linkedAdjustments.some(
    (adjustment) => adjustment.status === "needs_authority"
  );
  const hasReviewOnly = args.linkedAdjustments.some(
    (adjustment) => adjustment.status === "ready_for_review"
  );

  if (hasAuthorityBlock) return "blocked";
  if (allGeneric && args.specializedEvidence) return "blocked";
  if (args.lineageCount > 0 && allGeneric) return "needs_review";
  if (hasReviewOnly || args.hasNeedsReviewField) return "needs_review";
  return "ready";
}

function uniqueIds(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function buildTinaTransactionReconciliationReport(
  draft: TinaWorkspaceDraft
): TinaTransactionReconciliationReport {
  const transactionFacts = draft.sourceFacts.filter((fact) =>
    TINA_TRANSACTION_EVIDENCE_LABELS.includes(
      fact.label as (typeof TINA_TRANSACTION_EVIDENCE_LABELS)[number]
    )
  );
  const bucketFacts = draft.sourceFacts.filter((fact) => fact.label === "Ledger bucket clue");
  const documentIds = uniqueIds(
    [...transactionFacts, ...bucketFacts].map((fact) => fact.sourceDocumentId)
  );

  if (documentIds.length === 0) {
    return {
      summary: "Tina does not have imported transaction-group evidence to reconcile yet.",
      nextStep:
        "Import richer ledger-style spreadsheets so Tina can reconcile transaction groups beyond high-level bucket summaries.",
      groups: [],
    };
  }

  const groups = documentIds.map((documentId) => {
    const document = draft.documents.find((item) => item.id === documentId);
    const rawEvidence = draft.sourceFacts.filter((fact) => fact.sourceDocumentId === documentId);
    const groupedFacts = rawEvidence.filter((fact) => fact.label === "Transaction group clue");
    const lineageFacts = rawEvidence.filter((fact) => fact.label === "Transaction lineage clue");
    const ledgerBuckets = rawEvidence.filter((fact) => fact.label === "Ledger bucket clue");
    const analyzedGroups = collectTinaAnalyzedTransactionGroups(draft, [documentId]);
    const specializedEvidence = analyzedGroups.some((group) =>
      [
        "payroll",
        "contractor",
        "sales_tax",
        "inventory",
        "owner_flow",
        "transfer",
        "related_party",
      ].includes(group.classification)
    );
    const linkedFields = draft.scheduleCDraft.fields.filter((field) =>
      field.sourceDocumentIds.includes(documentId)
    );
    const linkedAdjustments = draft.taxAdjustments.adjustments.filter(
      (adjustment) =>
        adjustment.sourceDocumentIds.includes(documentId) ||
        rawEvidence.some((fact) => adjustment.sourceFactIds.includes(fact.id))
    );
    const mismatchCount = linkedFields.filter(
      (field) =>
        measureTinaTransactionGroupAlignment({
          groups: analyzedGroups,
          amount: field.amount,
          fieldLabel: field.label,
        }) === "mismatch"
    ).length;
    const status = determineStatus({
      specializedEvidence,
      linkedAdjustments,
      linkedFieldsCount: linkedFields.length,
      hasWaitingField: linkedFields.some((field) => field.status === "waiting"),
      hasNeedsReviewField: linkedFields.some((field) => field.status === "needs_attention"),
      lineageCount: lineageFacts.length,
      mismatchCount,
    });

    const label =
      document?.requestLabel ??
      document?.name ??
      groupedFacts[0]?.value ??
      lineageFacts[0]?.value ??
      `Document ${documentId}`;
    const summaryParts = [
      `${linkedFields.length} linked return field${linkedFields.length === 1 ? "" : "s"}`,
      `${linkedAdjustments.length} linked tax treatment path${
        linkedAdjustments.length === 1 ? "" : "s"
      }`,
      `${groupedFacts.length} grouped flow${groupedFacts.length === 1 ? "" : "s"}`,
      `${lineageFacts.length} row-cluster lineage item${lineageFacts.length === 1 ? "" : "s"}`,
      `${ledgerBuckets.length} ledger bucket${ledgerBuckets.length === 1 ? "" : "s"}`,
    ];
    if (specializedEvidence) {
      summaryParts.push("specialized transaction evidence is present");
    }
    if (mismatchCount > 0) {
      summaryParts.push(
        `${mismatchCount} field amount${mismatchCount === 1 ? "" : "s"} still do not align cleanly`
      );
    }

    return {
      id: `transaction-group-${slugify(label) || documentId}`,
      label,
      status,
      sourceDocumentIds: [documentId],
      fieldIds: linkedFields.map((field) => field.id),
      adjustmentIds: linkedAdjustments.map((adjustment) => adjustment.id),
      linkedAdjustmentKinds: Array.from(
        new Set(linkedAdjustments.map((adjustment) => adjustment.kind))
      ),
      transactionGroupCount: groupedFacts.length,
      lineageCount: lineageFacts.length,
      bucketCount: ledgerBuckets.length,
      mismatchCount,
      summary: `${summaryParts.join("; ")}.`,
    };
  });

  const blockedCount = groups.filter((group) => group.status === "blocked").length;
  const reviewCount = groups.filter((group) => group.status === "needs_review").length;

  let summary = `Tina reconciled ${groups.length} transaction group${
    groups.length === 1 ? "" : "s"
  } from imported ledgers.`;
  let nextStep =
    "Review the transaction groups with the linked return fields so Tina's numeric story stays grounded in transaction-level evidence.";

  if (blockedCount > 0) {
    summary += ` ${blockedCount} group${blockedCount === 1 ? " is" : "s are"} still blocked.`;
    nextStep =
      "Start with the blocked transaction groups first. Tina still has transaction evidence that is not governed by a specific treatment path.";
  } else if (reviewCount > 0) {
    summary += ` ${reviewCount} group${reviewCount === 1 ? " still needs" : "s still need"} review.`;
    nextStep =
      "Clear the review-only transaction groups next so Tina can stop relying on provisional treatment around transaction-level proof.";
  }

  return {
    summary,
    nextStep,
    groups,
  };
}
