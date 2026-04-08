import type { TinaBookTieOutEntry, TinaBookTieOutVariance, TinaScheduleCDraftField, TinaWorkspaceDraft } from "@/tina/types";
import {
  collectTinaAnalyzedTransactionGroups,
  measureTinaTransactionGroupAlignment,
  TINA_TRANSACTION_EVIDENCE_LABELS,
} from "@/tina/lib/transaction-group-analysis";

export interface TinaNumericProofRow {
  fieldId: string;
  lineNumber: string;
  label: string;
  amount: number | null;
  supportLevel: "strong" | "mixed" | "weak";
  bookEntries: Array<{
    label: string;
    moneyIn: number | null;
    moneyOut: number | null;
    net: number | null;
    dateCoverage: string | null;
  }>;
  transactionAnchors: string[];
  transactionGroups: string[];
  transactionGroupMatch: "aligned" | "mismatch" | "unknown";
  variances: TinaBookTieOutVariance[];
  summary: string;
}

function formatMoney(value: number | null): string {
  if (value === null) return "n/a";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function relevantEntries(
  draft: TinaWorkspaceDraft,
  field: TinaScheduleCDraftField
): TinaBookTieOutEntry[] {
  return draft.bookTieOut.entries.filter((entry) =>
    field.sourceDocumentIds.includes(entry.documentId)
  );
}

function relevantVariances(
  draft: TinaWorkspaceDraft,
  field: TinaScheduleCDraftField
): TinaBookTieOutVariance[] {
  return draft.bookTieOut.variances.filter((variance) =>
    variance.documentIds.some((documentId) => field.sourceDocumentIds.includes(documentId))
  );
}

function relevantTransactionAnchors(
  draft: TinaWorkspaceDraft,
  field: TinaScheduleCDraftField
): string[] {
  return Array.from(
    new Set(
      draft.sourceFacts
        .filter(
          (fact) =>
            field.sourceDocumentIds.includes(fact.sourceDocumentId) &&
            (fact.label === "Transaction sample clue" ||
              fact.label === "Transaction column clue" ||
              fact.label === "Ownership percentage clue" ||
              fact.label === "Carryover amount clue" ||
              fact.label === "Election detail clue" ||
              fact.label === "Asset placed-in-service clue" ||
              fact.label === "Payroll filing period clue" ||
              fact.label === "Ledger bucket clue")
        )
        .map((fact) => fact.value)
    )
  ).slice(0, 4);
}

function relevantTransactionGroups(
  draft: TinaWorkspaceDraft,
  field: TinaScheduleCDraftField
): string[] {
  return Array.from(
    new Set(
      draft.sourceFacts
        .filter(
          (fact) =>
            field.sourceDocumentIds.includes(fact.sourceDocumentId) &&
            TINA_TRANSACTION_EVIDENCE_LABELS.includes(
              fact.label as (typeof TINA_TRANSACTION_EVIDENCE_LABELS)[number]
            )
        )
        .map((fact) => fact.value)
    )
  ).slice(0, 4);
}

function buildSupportLevel(
  entries: TinaBookTieOutEntry[],
  variances: TinaBookTieOutVariance[],
  transactionGroupMatch: "aligned" | "mismatch" | "unknown"
): "strong" | "mixed" | "weak" {
  if (entries.length === 0) return "weak";
  if (variances.some((variance) => variance.severity === "blocking")) return "weak";
  if (transactionGroupMatch === "mismatch") return "mixed";
  if (
    variances.length > 0 ||
    entries.some((entry) => entry.status !== "ready")
  ) {
    return "mixed";
  }
  return "strong";
}

function buildSummary(args: {
  field: TinaScheduleCDraftField;
  entries: TinaBookTieOutEntry[];
  variances: TinaBookTieOutVariance[];
  transactionAnchors: string[];
  transactionGroups: string[];
  transactionGroupMatch: "aligned" | "mismatch" | "unknown";
  supportLevel: "strong" | "mixed" | "weak";
}): string {
  if (args.entries.length === 0) {
    const groupSummary =
      args.transactionGroups.length > 0
        ? ` Tina grouped ledger flows like ${args.transactionGroups.join("; ")}.`
        : "";
    if (args.transactionAnchors.length > 0) {
      return `${args.field.summary} Tina does not have deterministic book tie-out entries linked to this field yet, but she does see transaction-style anchors: ${args.transactionAnchors.join("; ")}.${groupSummary}`;
    }
    return `${args.field.summary} Tina does not have deterministic book tie-out entries linked to this field yet.${groupSummary}`;
  }

  const entrySummary = args.entries
    .map(
      (entry) =>
        `${entry.label}: in ${formatMoney(entry.moneyIn)}, out ${formatMoney(entry.moneyOut)}, net ${formatMoney(entry.net)}`
    )
    .join("; ");

  if (args.variances.length === 0) {
    const groupSummary =
      args.transactionGroups.length > 0
        ? ` Transaction groups: ${args.transactionGroups.join("; ")}.`
        : "";
    const anchorSummary =
      args.transactionAnchors.length > 0
        ? ` Transaction anchors: ${args.transactionAnchors.join("; ")}.`
        : "";
    const groupMatchSummary =
      args.transactionGroupMatch === "aligned"
        ? " Transaction-group totals align with this field."
        : args.transactionGroupMatch === "mismatch"
          ? " Transaction-group totals do not align cleanly with this field yet."
          : "";
    return `${args.field.summary} Book proof looks ${args.supportLevel}. ${entrySummary}.${groupSummary}${anchorSummary}${groupMatchSummary}`;
  }

  const groupSummary =
    args.transactionGroups.length > 0
      ? ` Transaction groups: ${args.transactionGroups.join("; ")}.`
      : "";
  const anchorSummary =
    args.transactionAnchors.length > 0
      ? ` Transaction anchors: ${args.transactionAnchors.join("; ")}.`
      : "";
  const groupMatchSummary =
    args.transactionGroupMatch === "aligned"
      ? " Transaction-group totals align with this field."
      : args.transactionGroupMatch === "mismatch"
        ? " Transaction-group totals do not align cleanly with this field yet."
        : "";
  return `${args.field.summary} Book proof is ${args.supportLevel} because Tina still sees: ${args.variances
    .map((variance) => variance.title)
    .join(", ")}. ${entrySummary}.${groupSummary}${anchorSummary}${groupMatchSummary}`;
}

export function buildTinaNumericProofRows(draft: TinaWorkspaceDraft): TinaNumericProofRow[] {
  return draft.scheduleCDraft.fields.map((field) => {
    const entries = relevantEntries(draft, field);
    const variances = relevantVariances(draft, field);
    const transactionAnchors = relevantTransactionAnchors(draft, field);
    const transactionGroups = relevantTransactionGroups(draft, field);
    const analyzedGroups = collectTinaAnalyzedTransactionGroups(draft, field.sourceDocumentIds);
    const transactionGroupMatch = measureTinaTransactionGroupAlignment({
      groups: analyzedGroups,
      amount: field.amount,
      fieldLabel: field.label,
    });
    const supportLevel = buildSupportLevel(entries, variances, transactionGroupMatch);

    return {
      fieldId: field.id,
      lineNumber: field.lineNumber,
      label: field.label,
      amount: field.amount,
      supportLevel,
      bookEntries: entries.map((entry) => ({
        label: entry.label,
        moneyIn: entry.moneyIn,
        moneyOut: entry.moneyOut,
        net: entry.net,
        dateCoverage: entry.dateCoverage,
      })),
      transactionAnchors,
      transactionGroups,
      transactionGroupMatch,
      variances,
      summary: buildSummary({
        field,
        entries,
        variances,
        transactionAnchors,
        transactionGroups,
        transactionGroupMatch,
        supportLevel,
      }),
    };
  });
}
