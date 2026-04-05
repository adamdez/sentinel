import type {
  TinaEvidenceCredibilityFactor,
  TinaEvidenceCredibilitySnapshot,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaAccountingArtifactCoverage } from "@/tina/lib/accounting-artifact-coverage";
import { buildTinaBooksReconciliation } from "@/tina/lib/books-reconciliation";
import { buildTinaCrossFormConsistency } from "@/tina/lib/cross-form-consistency";
import { buildTinaDocumentIntelligence } from "@/tina/lib/document-intelligence";
import { buildTinaDocumentRequestPlan } from "@/tina/lib/document-request-plan";
import { buildTinaLedgerReconstruction } from "@/tina/lib/ledger-reconstruction";
import { buildTinaPackageState } from "@/tina/lib/package-state";
import { buildTinaPayrollComplianceReconstruction } from "@/tina/lib/payroll-compliance-reconstruction";
import { buildTinaScheduleCFormTrace } from "@/tina/lib/schedule-c-form-trace";
import { buildTinaStartPathAssessment } from "@/tina/lib/start-path";
import type { TinaWorkspaceDraft } from "@/tina/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildFactor(
  factor: TinaEvidenceCredibilityFactor
): TinaEvidenceCredibilityFactor {
  return {
    ...factor,
    relatedDocumentIds: unique(factor.relatedDocumentIds),
    relatedFactIds: unique(factor.relatedFactIds),
  };
}

export function buildTinaEvidenceCredibility(
  draft: TinaWorkspaceDraft
): TinaEvidenceCredibilitySnapshot {
  const startPath = buildTinaStartPathAssessment(draft);
  const accountingCoverage = buildTinaAccountingArtifactCoverage(draft);
  const documentRequestPlan = buildTinaDocumentRequestPlan(draft);
  const documentIntelligence = buildTinaDocumentIntelligence(draft);
  const formTrace = buildTinaScheduleCFormTrace(draft);
  const crossFormConsistency = buildTinaCrossFormConsistency(draft);
  const packageState = buildTinaPackageState(draft);
  const ledgerReconstruction = buildTinaLedgerReconstruction(draft);
  const booksReconciliation = buildTinaBooksReconciliation(draft);
  const payrollCompliance = buildTinaPayrollComplianceReconstruction(draft);
  const distinctTraceDocumentIds = unique(
    formTrace.lines.flatMap((line) => line.sourceDocumentIds)
  );
  const blockingRequestCount = documentRequestPlan.items.filter(
    (item) =>
      item.priority === "immediate" &&
      ["books", "evidence", "entity", "economics", "forms"].includes(item.category)
  ).length;
  const missingCriticalAccountingCount = accountingCoverage.items.filter(
    (item) => item.criticality === "critical" && item.status === "missing"
  ).length;
  const contradictionCount =
    startPath.blockingReasons.length +
    crossFormConsistency.issues.filter((issue) => issue.severity === "blocking").length +
    (packageState === "signed_off_stale" ? 1 : 0) +
    documentIntelligence.conflictCount +
    (payrollCompliance.workerClassification === "mixed" ? 1 : 0);
  const concentratedGroupCount = ledgerReconstruction.groups.filter(
    (group) =>
      group.status !== "not_applicable" &&
      group.independenceStatus === "concentrated"
  ).length;
  const structuredChannelCount = ledgerReconstruction.groups.reduce(
    (count, group) =>
      count +
      (group.status === "not_applicable"
        ? 0
        : group.supportChannels.filter((channel) => channel.status === "structured").length),
    0
  );
  const highContaminationGroupCount = ledgerReconstruction.highContaminationGroupCount;
  const materialVarianceCount = booksReconciliation.materialVarianceCount;

  const factors: TinaEvidenceCredibilityFactor[] = [
    buildFactor({
      id: "source-quality",
      title: "Source quality",
      dimension: "source_quality",
      status:
        draft.documents.some((document) => document.category === "prior_return") ||
        distinctTraceDocumentIds.length >= 2 ||
        structuredChannelCount >= 3
          ? "strong"
          : structuredChannelCount >= 1 || distinctTraceDocumentIds.length === 1
            ? "mixed"
            : "blocked",
      summary:
        structuredChannelCount >= 3 || distinctTraceDocumentIds.length >= 2
          ? "Multiple structured documents contribute to the return-facing books picture."
          : structuredChannelCount >= 1
            ? "There is some structured source quality, but it is still too concentrated."
            : "There is not enough document-level source quality to trust the return picture.",
      signalCount: Math.max(distinctTraceDocumentIds.length, structuredChannelCount),
      blockerCount:
        structuredChannelCount === 0 && distinctTraceDocumentIds.length === 0 ? 1 : 0,
      relatedDocumentIds: distinctTraceDocumentIds,
      relatedFactIds: [],
    }),
    buildFactor({
      id: "completeness",
      title: "Completeness",
      dimension: "completeness",
      status:
        missingCriticalAccountingCount > 0 || payrollCompliance.overallStatus === "blocked"
          ? "blocked"
          : blockingRequestCount > 0 ||
              accountingCoverage.overallStatus !== "covered" ||
              ledgerReconstruction.partialGroupCount > 0 ||
              payrollCompliance.overallStatus === "needs_review"
            ? "mixed"
            : "strong",
      summary:
        payrollCompliance.overallStatus === "blocked"
          ? "Payroll compliance debt is still open, so the evidence picture is not actually complete."
          : missingCriticalAccountingCount > 0
          ? "Critical accounting artifacts are still missing."
          : blockingRequestCount > 0 ||
              ledgerReconstruction.partialGroupCount > 0 ||
              payrollCompliance.overallStatus === "needs_review"
            ? "The file still needs immediate document work or ledger cleanup before the evidence picture is complete."
            : "The current file has enough artifact and ledger coverage to look materially complete for its lane.",
      signalCount: accountingCoverage.items.length,
      blockerCount:
        missingCriticalAccountingCount +
        blockingRequestCount +
        payrollCompliance.blockedIssueCount,
      relatedDocumentIds: unique([
        ...accountingCoverage.items.flatMap((item) => item.matchedDocumentIds),
        ...payrollCompliance.relatedDocumentIds,
      ]),
      relatedFactIds: unique([
        ...accountingCoverage.items.flatMap((item) => item.matchedFactIds),
        ...payrollCompliance.relatedFactIds,
      ]),
    }),
    buildFactor({
      id: "independence",
      title: "Source independence",
      dimension: "independence",
      status:
        concentratedGroupCount === 0 && structuredChannelCount >= 3
          ? "strong"
          : concentratedGroupCount <= 1 && structuredChannelCount >= 1
            ? "mixed"
            : structuredChannelCount >= 1
              ? "weak"
              : "blocked",
      summary:
        concentratedGroupCount === 0 && structuredChannelCount >= 3
          ? "The return is supported by multiple independent bookkeeping channels."
          : concentratedGroupCount > 0
            ? "Too many material ledger groups still depend on concentrated support."
            : "The support picture is not yet independent enough to inspire reviewer confidence.",
      signalCount: structuredChannelCount,
      blockerCount: concentratedGroupCount,
      relatedDocumentIds: ledgerReconstruction.groups.flatMap((group) => group.relatedDocumentIds),
      relatedFactIds: ledgerReconstruction.groups.flatMap((group) => group.relatedFactIds),
    }),
    buildFactor({
      id: "contradiction-pressure",
      title: "Contradiction pressure",
      dimension: "contradiction",
      status:
        contradictionCount === 0
          ? "strong"
          : contradictionCount === 1
            ? "mixed"
            : startPath.route === "blocked"
              ? "blocked"
              : "weak",
      summary:
        contradictionCount === 0
          ? "No major contradiction pressure is currently degrading the evidence picture."
          : contradictionCount === 1
            ? "There is one active contradiction or drift signal that still needs reviewer attention."
            : "Multiple contradiction signals are degrading the evidence picture.",
      signalCount: contradictionCount,
      blockerCount: startPath.route === "blocked" ? contradictionCount : Math.max(contradictionCount - 1, 0),
      relatedDocumentIds: draft.documents.map((document) => document.id),
      relatedFactIds: draft.sourceFacts.map((fact) => fact.id),
    }),
    buildFactor({
      id: "ledger-integrity",
      title: "Ledger integrity",
      dimension: "ledger_integrity",
      status:
        ledgerReconstruction.overallStatus === "blocked" ||
        highContaminationGroupCount > 0 ||
        payrollCompliance.overallStatus === "blocked"
          ? "blocked"
          : ledgerReconstruction.overallStatus === "partial" ||
              concentratedGroupCount > 0 ||
              payrollCompliance.overallStatus === "needs_review"
            ? "mixed"
            : "strong",
      summary:
        payrollCompliance.overallStatus === "blocked"
          ? "Ledger-looking labor support still fails closed because payroll compliance is broken."
          : ledgerReconstruction.overallStatus === "reconstructed"
          ? "Ledger groups are structured cleanly enough to support return-facing trust."
          : ledgerReconstruction.overallStatus === "partial"
            ? "Some ledger groups still rely on concentrated support or incomplete artifacts."
            : "Blocked ledger groups or contamination risk still undermine the books picture.",
      signalCount: ledgerReconstruction.groups.length,
      blockerCount:
        highContaminationGroupCount +
        ledgerReconstruction.blockedGroupCount +
        payrollCompliance.blockedIssueCount,
      relatedDocumentIds: unique([
        ...ledgerReconstruction.groups.flatMap((group) => group.relatedDocumentIds),
        ...payrollCompliance.relatedDocumentIds,
      ]),
      relatedFactIds: unique([
        ...ledgerReconstruction.groups.flatMap((group) => group.relatedFactIds),
        ...payrollCompliance.relatedFactIds,
      ]),
    }),
    buildFactor({
      id: "reconciliation-quality",
      title: "Reconciliation quality",
      dimension: "reconciliation_quality",
      status:
        booksReconciliation.overallStatus === "blocked" || materialVarianceCount > 0
          ? "blocked"
          : booksReconciliation.overallStatus === "needs_review" ||
              booksReconciliation.unsupportedBalanceCount > 0
            ? "mixed"
            : "strong",
      summary:
        booksReconciliation.overallStatus === "reconciled"
          ? "Books-to-return reconciliations are clean enough to support reviewer confidence."
          : booksReconciliation.overallStatus === "needs_review"
            ? "The numeric books picture is mostly intact, but some balances still need reviewer cleanup."
            : "Books-to-return variances or unsupported balances still block confidence.",
      signalCount: booksReconciliation.checks.length,
      blockerCount:
        booksReconciliation.blockedCheckCount + booksReconciliation.materialVarianceCount,
      relatedDocumentIds: booksReconciliation.checks.flatMap((check) => check.relatedDocumentIds),
      relatedFactIds: [],
    }),
  ];

  const blockingFactorCount = factors.filter((factor) => factor.status === "blocked").length;
  const weakFactorCount = factors.filter((factor) => factor.status === "weak").length;
  const mixedCount = factors.filter((factor) => factor.status === "mixed").length;
  const overallStatus =
    blockingFactorCount > 0
      ? "blocked"
      : weakFactorCount > 0
        ? "thin"
        : mixedCount > 0
          ? "mixed"
          : "credible";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    overallStatus,
    summary:
      overallStatus === "credible"
        ? "Tina sees a credible source picture with structured bookkeeping support and clean reconciliation."
        : overallStatus === "mixed"
          ? "Tina sees a mixed source picture: workable for review, but still concentrated or partially incomplete."
          : overallStatus === "thin"
            ? "Tina sees a thin source picture that still over-relies on concentrated or weak support."
            : "Tina sees a blocked source picture with material completeness, ledger, or reconciliation problems.",
    nextStep:
      overallStatus === "credible"
        ? "Keep this credibility layer attached to readiness and reviewer acceptance."
        : "Strengthen the missing or weak source dimensions before treating the file as reviewer-grade.",
    factors,
    blockingFactorCount,
    weakFactorCount,
    concentratedGroupCount,
    materialVarianceCount,
  };
}
