import { buildTinaNumericProofRows } from "@/tina/lib/numeric-proof";
import { buildTinaReviewTraceRows } from "@/tina/lib/review-trace";
import { buildTinaTransactionReconciliationReport } from "@/tina/lib/transaction-reconciliation";
import type { TinaWorkspaceDraft } from "@/tina/types";

export type TinaFinalPackageQualityStatus = "blocked" | "needs_review" | "ready";

export interface TinaFinalPackageQualityCheck {
  id: string;
  title: string;
  status: TinaFinalPackageQualityStatus;
  summary: string;
}

export interface TinaFinalPackageQualityReport {
  status: TinaFinalPackageQualityStatus;
  summary: string;
  nextStep: string;
  checks: TinaFinalPackageQualityCheck[];
}

export function buildTinaFinalPackageQualityReport(
  draft: TinaWorkspaceDraft
): TinaFinalPackageQualityReport {
  const reviewTrace = buildTinaReviewTraceRows(draft);
  const numericProof = buildTinaNumericProofRows(draft);
  const reconciliation = buildTinaTransactionReconciliationReport(draft);
  const hasBookTieOutEntries = draft.bookTieOut.entries.length > 0;

  const fieldsWithoutTaxPositions = reviewTrace.filter((row) => row.taxPositionTitles.length === 0);
  const weakProofFields = numericProof.filter((row) => row.supportLevel === "weak");
  const mixedProofFields = numericProof.filter((row) => row.supportLevel === "mixed");
  const mismatchedTransactionGroups = numericProof.filter(
    (row) => row.transactionGroupMatch === "mismatch"
  );
  const blockedReconciliation = reconciliation.groups.filter((group) => group.status === "blocked");
  const reviewReconciliation = reconciliation.groups.filter((group) => group.status === "needs_review");

  const checks: TinaFinalPackageQualityCheck[] = [
    {
      id: "return_trace",
      title: "Return trace completeness",
      status:
        reviewTrace.length === 0
          ? "needs_review"
          : fieldsWithoutTaxPositions.length > 0
            ? "needs_review"
            : "ready",
      summary:
        reviewTrace.length === 0
          ? "Tina does not have return-trace rows yet."
          : fieldsWithoutTaxPositions.length > 0
            ? `${fieldsWithoutTaxPositions.length} return field${
                fieldsWithoutTaxPositions.length === 1 ? "" : "s"
              } still lack a linked governed tax position.`
            : "Every current return field carries linked reviewer-final and tax-position trace.",
    },
    {
      id: "numeric_proof",
      title: "Numeric proof strength",
      status:
        numericProof.length === 0
          ? "needs_review"
          : mismatchedTransactionGroups.length > 0 && hasBookTieOutEntries
          ? "blocked"
          : weakProofFields.length > 0 && hasBookTieOutEntries
          ? "blocked"
          : weakProofFields.length > 0 || mixedProofFields.length > 0
            ? "needs_review"
            : "ready",
      summary:
        numericProof.length === 0
          ? "Tina does not have numeric proof rows yet."
          : mismatchedTransactionGroups.length > 0 && hasBookTieOutEntries
          ? `${mismatchedTransactionGroups.length} return field${
              mismatchedTransactionGroups.length === 1 ? "" : "s"
            } still do not align cleanly with transaction-group totals.`
          : weakProofFields.length > 0 && hasBookTieOutEntries
          ? `${weakProofFields.length} return field${
              weakProofFields.length === 1 ? "" : "s"
            } still have weak numeric proof.`
          : mixedProofFields.length > 0
            ? `${mixedProofFields.length} return field${
                mixedProofFields.length === 1 ? "" : "s"
              } still have mixed numeric proof.`
            : "Current return fields have strong numeric proof coverage.",
    },
    {
      id: "transaction_reconciliation",
      title: "Transaction reconciliation",
      status:
        blockedReconciliation.length > 0
          ? "blocked"
          : reviewReconciliation.length > 0
            ? "needs_review"
            : reconciliation.groups.length > 0
              ? "ready"
              : "needs_review",
      summary:
        blockedReconciliation.length > 0
          ? `${blockedReconciliation.length} transaction group${
              blockedReconciliation.length === 1 ? "" : "s"
            } still are not governed by a specific treatment path.`
          : reviewReconciliation.length > 0
            ? `${reviewReconciliation.length} transaction group${
                reviewReconciliation.length === 1 ? "" : "s"
              } still need review.`
            : reconciliation.groups.length > 0
              ? "Imported ledger groups are reconciled into the current package."
              : "Tina does not have transaction-group evidence yet, so package quality is still conservative here.",
    },
  ];

  const blockedCount = checks.filter((check) => check.status === "blocked").length;
  const reviewCount = checks.filter((check) => check.status === "needs_review").length;

  if (blockedCount > 0) {
    return {
      status: "blocked",
      summary:
        "Tina's final package quality is still blocked because proof, trace, or transaction reconciliation is incomplete.",
      nextStep:
        "Clear the blocked package-quality checks first so the CPA does not have to reconstruct missing proof by hand.",
      checks,
    };
  }

  if (reviewCount > 0) {
    return {
      status: "needs_review",
      summary:
        "Tina's package is workable, but a few final-package quality checks still need human review.",
      nextStep:
        "Resolve the remaining package-quality review checks so the exported packet looks fully governed and reviewer-trustworthy.",
      checks,
    };
  }

  return {
    status: "ready",
    summary:
      "Tina's current packet has trace, numeric proof, and transaction reconciliation aligned well enough for CPA delivery.",
    nextStep:
      "Keep this package-quality bar in place as Tina expands into messier files and broader lanes.",
    checks,
  };
}
