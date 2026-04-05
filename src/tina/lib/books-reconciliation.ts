import { buildTinaBooksReconstruction } from "@/tina/lib/books-reconstruction";
import type {
  TinaBooksReconciliationCheck,
  TinaBooksReconciliationSnapshot,
  TinaBooksReconciliationStatus,
  TinaLedgerTransactionGroup,
  TinaReconciliationVariance,
  TinaReconciliationVarianceKind,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaLedgerReconstruction } from "@/tina/lib/ledger-reconstruction";
import { buildTinaPayrollComplianceReconstruction } from "@/tina/lib/payroll-compliance-reconstruction";
import { buildTinaScheduleCReturn } from "@/tina/lib/schedule-c-return";
import type { TinaWorkspaceDraft } from "@/tina/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function sumAmounts(values: Array<number | null | undefined>): number | null {
  const numericValues = values.filter((value): value is number => typeof value === "number");
  if (numericValues.length === 0) return null;
  return numericValues.reduce((total, value) => total + value, 0);
}

function roundCurrency(value: number | null): number | null {
  if (value === null) return null;
  return Math.round(value * 100) / 100;
}

function amountForFormKey(
  draft: ReturnType<typeof buildTinaScheduleCReturn>,
  formKey: string
): number | null {
  return draft.fields.find((field) => field.formKey === formKey)?.amount ?? null;
}

function checkStatusForAmounts(
  leftAmount: number | null,
  rightAmount: number | null
): TinaBooksReconciliationStatus {
  if (leftAmount === null && rightAmount === null) return "needs_review";
  if (leftAmount === null || rightAmount === null) {
    return Math.abs((leftAmount ?? 0) - (rightAmount ?? 0)) < 0.01
      ? "reconciled"
      : "blocked";
  }

  return Math.abs(leftAmount - rightAmount) < 0.01 ? "reconciled" : "blocked";
}

function buildNumericCheck(args: {
  id: string;
  title: string;
  leftLabel: string;
  leftAmount: number | null;
  rightLabel: string;
  rightAmount: number | null;
  relatedLineNumbers: string[];
  relatedDocumentIds: string[];
}): TinaBooksReconciliationCheck {
  const status = checkStatusForAmounts(args.leftAmount, args.rightAmount);
  const delta =
    args.leftAmount === null || args.rightAmount === null
      ? null
      : roundCurrency(args.leftAmount - args.rightAmount);

  return {
    id: args.id,
    title: args.title,
    status,
    summary:
      status === "reconciled"
        ? `${args.leftLabel} and ${args.rightLabel} reconcile cleanly.`
        : status === "needs_review"
          ? `${args.leftLabel} and ${args.rightLabel} still need fuller support before Tina should call them reconciled.`
          : `${args.leftLabel} and ${args.rightLabel} do not reconcile cleanly yet.`,
    supportSummary:
      status === "reconciled"
        ? "Numeric books-to-return support is aligned."
        : status === "needs_review"
          ? "One side of the numeric reconciliation is still incomplete."
          : "The numeric books story and the return-facing story diverge materially.",
    varianceKind: "amount_mismatch",
    leftLabel: args.leftLabel,
    leftAmount: args.leftAmount,
    rightLabel: args.rightLabel,
    rightAmount: args.rightAmount,
    delta,
    relatedLineNumbers: unique(args.relatedLineNumbers),
    relatedDocumentIds: unique(args.relatedDocumentIds),
  };
}

function buildAreaStatusCheck(args: {
  id: string;
  title: string;
  area: ReturnType<typeof buildTinaBooksReconstruction>["areas"][number];
  relatedLineNumbers: string[];
  relatedDocumentIds: string[];
}): TinaBooksReconciliationCheck {
  const status =
    args.area.status === "ready"
      ? "reconciled"
      : args.area.status === "needs_review"
        ? "needs_review"
        : "blocked";

  return {
    id: args.id,
    title: args.title,
    status,
    summary: args.area.summary,
    supportSummary:
      status === "reconciled"
        ? "This reconstruction area is clean enough to trust downstream."
        : status === "needs_review"
          ? "This reconstruction area still needs reviewer normalization."
          : "This reconstruction area still blocks return-facing trust.",
    varianceKind: "missing_support",
    leftLabel: "Books reconstruction area",
    leftAmount: null,
    rightLabel: "Return-facing expectation",
    rightAmount: null,
    delta: null,
    relatedLineNumbers: unique(args.relatedLineNumbers),
    relatedDocumentIds: unique([...args.relatedDocumentIds, ...args.area.relatedDocumentIds]),
  };
}

function varianceKindForGroup(group: TinaLedgerTransactionGroup): TinaReconciliationVarianceKind {
  if (group.category === "mixed_use" || group.category === "payroll" || group.category === "contractors") {
    return "classification_overlap";
  }

  if (group.category === "owner_flow" || group.category === "related_party") {
    return "entity_contamination";
  }

  return "missing_support";
}

function statusForLedgerGroup(group: TinaLedgerTransactionGroup): TinaBooksReconciliationStatus {
  if (group.status === "not_applicable") {
    return "reconciled";
  }

  if (group.status === "blocked" || group.contaminationRisk === "high") {
    return "blocked";
  }

  if (
    group.status === "partial" ||
    group.independenceStatus === "concentrated" ||
    group.contaminationRisk === "watch"
  ) {
    return "needs_review";
  }

  return "reconciled";
}

function buildLedgerGroupCheck(group: TinaLedgerTransactionGroup): TinaBooksReconciliationCheck {
  const status = statusForLedgerGroup(group);
  const incompleteArtifacts = group.requiredArtifacts.filter((artifact) => artifact.status !== "covered");

  return {
    id: `ledger-group-${group.id}`,
    title: `${group.title} trust check`,
    status,
    summary:
      status === "reconciled"
        ? `${group.title} has enough independent bookkeeping support to trust the return-facing use of this area.`
        : status === "needs_review"
          ? `${group.title} is visible in the books story, but Tina still sees concentration or thin support in this area.`
          : `${group.title} is still blocked by contamination, contradiction, or missing ledger support.`,
    supportSummary:
      incompleteArtifacts.length > 0
        ? `Still incomplete: ${incompleteArtifacts
            .slice(0, 2)
            .map((artifact) => artifact.title)
            .join(", ")}.`
        : `Support posture: ${group.supportLevel} / ${group.independenceStatus} / contamination ${group.contaminationRisk}.`,
    varianceKind: varianceKindForGroup(group),
    leftLabel: "Ledger group estimate",
    leftAmount: group.estimatedAmount,
    rightLabel: "Return-facing trust posture",
    rightAmount: group.estimatedAmount,
    delta: null,
    relatedLineNumbers: group.relatedLineNumbers,
    relatedDocumentIds: group.relatedDocumentIds,
  };
}

function shouldCreateLedgerGroupCheck(group: TinaLedgerTransactionGroup): boolean {
  if (group.status === "not_applicable") return false;

  const isMaterial =
    group.estimatedAmount !== null ||
    group.documentCount > 0 ||
    group.factCount > 0 ||
    group.requiredArtifacts.some((artifact) => artifact.status !== "covered");
  const isGenericScaffoldingOnly =
    group.status === "partial" &&
    group.factCount === 0 &&
    group.contradictionCount === 0 &&
    (group.estimatedAmount === null || group.estimatedAmount === 0);

  if (!isMaterial || isGenericScaffoldingOnly) return false;

  if (
    group.status === "reconstructed" &&
    group.contradictionCount === 0 &&
    group.contaminationRisk !== "high"
  ) {
    return false;
  }

  return (
    group.status === "blocked" ||
    group.status === "partial" ||
    group.contradictionCount > 0 ||
    group.contaminationRisk === "high" ||
    (group.independenceStatus === "concentrated" && group.factCount > 0)
  );
}

export function buildTinaBooksReconciliation(
  draft: TinaWorkspaceDraft
): TinaBooksReconciliationSnapshot {
  const booksReconstruction = buildTinaBooksReconstruction(draft);
  const ledgerReconstruction = buildTinaLedgerReconstruction(draft);
  const payrollCompliance = buildTinaPayrollComplianceReconstruction(draft);
  const scheduleCReturn = buildTinaScheduleCReturn(draft);
  const reviewerFinalIncome = sumAmounts(
    draft.reviewerFinal.lines
      .filter((line) => line.kind === "income")
      .map((line) => line.amount)
  );
  const reviewerFinalExpenses = sumAmounts(
    draft.reviewerFinal.lines
      .filter((line) => line.kind === "expense")
      .map((line) => line.amount)
  );
  const reviewerFinalNet =
    reviewerFinalIncome === null && reviewerFinalExpenses === null
      ? null
      : roundCurrency((reviewerFinalIncome ?? 0) - (reviewerFinalExpenses ?? 0));
  const line1 = amountForFormKey(scheduleCReturn, "grossReceipts");
  const line11 = amountForFormKey(scheduleCReturn, "contractLabor");
  const line13 = amountForFormKey(scheduleCReturn, "depreciation");
  const line26 = amountForFormKey(scheduleCReturn, "wages");
  const line28 = amountForFormKey(scheduleCReturn, "totalExpenses");
  const line31 = amountForFormKey(scheduleCReturn, "netProfitOrLoss");
  const line4 = amountForFormKey(scheduleCReturn, "costOfGoodsSold");

  const workerArea = booksReconstruction.areas.find((area) => area.id === "worker_payments");
  const fixedAssetArea = booksReconstruction.areas.find((area) => area.id === "fixed_assets");
  const inventoryArea = booksReconstruction.areas.find((area) => area.id === "inventory_cogs");
  const boundaryArea = booksReconstruction.areas.find((area) => area.id === "entity_boundary");

  const checks: TinaBooksReconciliationCheck[] = [
    buildNumericCheck({
      id: "gross-receipts-reconciliation",
      title: "Gross receipts reconcile to reviewer-final income",
      leftLabel: "Reviewer-final income total",
      leftAmount: reviewerFinalIncome,
      rightLabel: "Schedule C line 1",
      rightAmount: line1,
      relatedLineNumbers: ["Line 1"],
      relatedDocumentIds: draft.reviewerFinal.lines
        .filter((line) => line.kind === "income")
        .flatMap((line) => line.sourceDocumentIds),
    }),
    buildNumericCheck({
      id: "expense-reconciliation",
      title: "Total expenses reconcile to reviewer-final expense lines",
      leftLabel: "Reviewer-final expense total",
      leftAmount: reviewerFinalExpenses,
      rightLabel: "Schedule C line 28",
      rightAmount: line28,
      relatedLineNumbers: ["Line 28"],
      relatedDocumentIds: draft.reviewerFinal.lines
        .filter((line) => line.kind === "expense")
        .flatMap((line) => line.sourceDocumentIds),
    }),
    buildNumericCheck({
      id: "net-profit-reconciliation",
      title: "Net profit reconciles from books to line 31",
      leftLabel: "Reviewer-final income less expenses",
      leftAmount: reviewerFinalNet,
      rightLabel: "Schedule C line 31",
      rightAmount: line31,
      relatedLineNumbers: ["Line 31"],
      relatedDocumentIds: draft.reviewerFinal.lines.flatMap((line) => line.sourceDocumentIds),
    }),
  ];

  if (workerArea) {
    checks.push(
      buildAreaStatusCheck({
        id: "worker-payment-reconciliation",
        title: "Worker-payment treatment aligns with Schedule C lines 11 and 26",
        area: workerArea,
        relatedLineNumbers: ["Line 11", "Line 26"],
        relatedDocumentIds: draft.reviewerFinal.lines
          .filter((line) => line.kind === "expense")
          .flatMap((line) => line.sourceDocumentIds),
      })
    );
  }

  if (payrollCompliance.overallStatus !== "not_applicable") {
    checks.push({
      id: "payroll-compliance-reconciliation",
      title: "Payroll compliance trail aligns with worker-payment treatment",
      status:
        payrollCompliance.overallStatus === "supported"
          ? "reconciled"
          : payrollCompliance.overallStatus === "needs_review"
            ? "needs_review"
            : "blocked",
      summary: payrollCompliance.summary,
      supportSummary:
        payrollCompliance.likelyMissingFilings.length > 0
          ? `Likely missing filings: ${payrollCompliance.likelyMissingFilings.join(", ")}.`
          : payrollCompliance.questions[0] ?? payrollCompliance.nextStep,
      varianceKind:
        payrollCompliance.workerClassification === "mixed"
          ? "classification_overlap"
          : "missing_support",
      leftLabel: "Payroll compliance spine",
      leftAmount: null,
      rightLabel: "Return-facing labor treatment",
      rightAmount: null,
      delta: null,
      relatedLineNumbers: ["Line 11", "Line 26"],
      relatedDocumentIds: payrollCompliance.relatedDocumentIds,
    });
  }

  if (fixedAssetArea) {
    checks.push(
      buildAreaStatusCheck({
        id: "fixed-asset-reconciliation",
        title: "Depreciation treatment aligns with fixed-asset reconstruction",
        area: fixedAssetArea,
        relatedLineNumbers: typeof line13 === "number" ? ["Line 13"] : [],
        relatedDocumentIds: fixedAssetArea.relatedDocumentIds,
      })
    );
  }

  if (inventoryArea) {
    checks.push(
      buildAreaStatusCheck({
        id: "inventory-reconciliation",
        title: "Inventory and COGS treatment aligns with Schedule C line 4",
        area: inventoryArea,
        relatedLineNumbers: typeof line4 === "number" ? ["Line 4"] : [],
        relatedDocumentIds: inventoryArea.relatedDocumentIds,
      })
    );
  }

  if (boundaryArea) {
    checks.push(
      buildAreaStatusCheck({
        id: "entity-boundary-reconciliation",
        title: "Entity-boundary treatment aligns with the return-facing books picture",
        area: boundaryArea,
        relatedLineNumbers: [],
        relatedDocumentIds: boundaryArea.relatedDocumentIds,
      })
    );
  }

  if (typeof line11 === "number" || typeof line26 === "number") {
    checks.push(
      buildNumericCheck({
        id: "worker-lines-presence",
        title: "Worker-payment lines stay visible when worker-payment facts exist",
        leftLabel: "Schedule C lines 11 + 26",
        leftAmount: roundCurrency((line11 ?? 0) + (line26 ?? 0)),
        rightLabel: "Worker-payment profile signal",
        rightAmount:
          draft.profile.hasPayroll || draft.profile.paysContractors
            ? roundCurrency((line11 ?? 0) + (line26 ?? 0))
            : 0,
        relatedLineNumbers: ["Line 11", "Line 26"],
        relatedDocumentIds: draft.reviewerFinal.lines.flatMap((line) => line.sourceDocumentIds),
      })
    );
  }

  ledgerReconstruction.groups
    .filter(shouldCreateLedgerGroupCheck)
    .forEach((group) => {
      checks.push(buildLedgerGroupCheck(group));
    });

  const blockedCheckCount = checks.filter((check) => check.status === "blocked").length;
  const reviewCheckCount = checks.filter((check) => check.status === "needs_review").length;
  const variances: TinaReconciliationVariance[] = checks
    .filter(
      (check) =>
        check.status !== "reconciled" &&
        (typeof check.delta === "number" || check.varianceKind !== null)
    )
    .map((check) => ({
      id: `variance-${check.id}`,
      title: check.title,
      kind: check.varianceKind ?? "missing_support",
      severity:
        typeof check.delta === "number" && Math.abs(check.delta) >= 1000
          ? "material"
          : check.status === "blocked" &&
              ["entity_contamination", "classification_overlap"].includes(
                check.varianceKind ?? ""
              )
            ? "material"
            : check.status === "blocked"
              ? "moderate"
              : "immaterial",
      amount: check.delta,
      summary:
        typeof check.delta === "number"
          ? `${check.title} is out of balance by ${check.delta}.`
          : check.supportSummary,
      relatedCheckIds: [check.id],
      relatedDocumentIds: check.relatedDocumentIds,
      relatedLineNumbers: check.relatedLineNumbers,
    }));
  const materialVarianceCount = variances.filter((variance) => variance.severity === "material").length;
  const unsupportedBalanceCount = variances.filter(
    (variance) =>
      variance.amount === null &&
      ["missing_support", "classification_overlap", "entity_contamination"].includes(variance.kind)
  ).length;
  const overallStatus: TinaBooksReconciliationSnapshot["overallStatus"] =
    blockedCheckCount > 0 ? "blocked" : reviewCheckCount > 0 ? "needs_review" : "reconciled";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    overallStatus,
    sourceMode: booksReconstruction.sourceMode,
    summary:
      overallStatus === "reconciled"
        ? "Tina reconciled the reviewer-final books picture to the current return-facing output and the material ledger groups are trustworthy."
        : overallStatus === "needs_review"
          ? `Tina reconciled the core books picture, but ${reviewCheckCount} reconciliation check${
              reviewCheckCount === 1 ? "" : "s"
            } still need reviewer attention.`
          : `Tina still sees ${blockedCheckCount} blocked reconciliation check${
              blockedCheckCount === 1 ? "" : "s"
            } between the books picture and the return-facing output.`,
    nextStep:
      overallStatus === "reconciled"
        ? "Use this reconciliation layer as the accounting-fluency backbone for reviewer confidence."
        : overallStatus === "needs_review"
          ? "Clear the remaining reconciliation review items before treating the books picture as clean."
          : "Resolve the blocked reconciliation checks before Tina treats the books picture as return-safe.",
    checks,
    variances,
    blockedCheckCount,
    reviewCheckCount,
    materialVarianceCount,
    unsupportedBalanceCount,
  };
}
