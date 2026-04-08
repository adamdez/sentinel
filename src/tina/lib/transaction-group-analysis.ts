import type { TinaWorkspaceDraft } from "@/tina/types";

export const TINA_TRANSACTION_EVIDENCE_LABELS = [
  "Transaction group clue",
  "Transaction lineage clue",
] as const;

export type TinaTransactionGroupDirection = "inflow" | "outflow" | "unknown";
export type TinaTransactionGroupClassification =
  | "gross_receipts"
  | "payroll"
  | "contractor"
  | "sales_tax"
  | "inventory"
  | "owner_flow"
  | "transfer"
  | "related_party"
  | "ordinary_expense"
  | "unknown";

export interface TinaAnalyzedTransactionGroup {
  factId: string;
  sourceDocumentId: string;
  rawValue: string;
  label: string;
  direction: TinaTransactionGroupDirection;
  classification: TinaTransactionGroupClassification;
  rowCount: number | null;
  total: number | null;
  startDate: string | null;
  endDate: string | null;
}

function parseMoneyValue(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const hasParens = trimmed.startsWith("(") && trimmed.endsWith(")");
  const sanitized = trimmed.replace(/[$,%\s]/g, "").replace(/,/g, "");
  const negativeSafe = hasParens ? `-${sanitized.slice(1, -1)}` : sanitized;
  if (!/^-?\d*\.?\d+$/.test(negativeSafe)) return null;

  const parsed = Number(negativeSafe);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDateValue(value: string): string | null {
  const parsed = Date.parse(value.trim());
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

function classify(rawValue: string): TinaTransactionGroupClassification {
  const haystack = rawValue.toLowerCase();

  if (/\bpayroll|wages|salary|employee|941|w-2\b/.test(haystack)) return "payroll";
  if (/\bcontractor|subcontractor|1099|freelance\b/.test(haystack)) return "contractor";
  if (/\bsales tax|tax collected|tax payable\b/.test(haystack)) return "sales_tax";
  if (/\binventory|cogs|cost of goods|stock\b/.test(haystack)) return "inventory";
  if (/\bowner draw|owners draw|member draw|shareholder distribution|distribution to owner|owner withdrawal\b/.test(haystack)) {
    return "owner_flow";
  }
  if (/\brelated party|shareholder loan|officer loan|loan from owner|loan to owner|due from shareholder|due to shareholder|due from member|due to member\b/.test(haystack)) {
    return "related_party";
  }
  if (/\bintercompany|inter-company|transfer to|transfer from|due to|due from\b/.test(haystack)) {
    return "transfer";
  }
  if (/\breceipt|deposit|gross receipt|sales|revenue|income\b/.test(haystack)) return "gross_receipts";
  if (/\bexpense|rent|utilities|advertising|supplies|insurance\b/.test(haystack)) {
    return "ordinary_expense";
  }

  return "unknown";
}

function inferDirection(rawValue: string, total: number | null): TinaTransactionGroupDirection {
  const haystack = rawValue.toLowerCase();
  if (haystack.includes("(inflow)")) return "inflow";
  if (haystack.includes("(outflow)")) return "outflow";
  if (total !== null) return total >= 0 ? "inflow" : "outflow";
  if (/\bdeposit|receipt|sales|income|revenue\b/.test(haystack)) return "inflow";
  if (/\bexpense|payroll|wages|contractor|rent|utilities|owner draw|distribution|transfer\b/.test(haystack)) {
    return "outflow";
  }
  return "unknown";
}

export function analyzeTinaTransactionGroupValue(value: string): Omit<
  TinaAnalyzedTransactionGroup,
  "factId" | "sourceDocumentId"
> {
  const normalized = value.trim();
  const rowCountMatch = normalized.match(/:\s*(\d+)\s+row/i);
  const totalMatch = normalized.match(/total\s+(\(?-?\$?[0-9,]+(?:\.[0-9]{1,2})?\)?)/i);
  const dateRangeMatch = normalized.match(/dates\s+(.+?)\s+to\s+(.+)$/i);
  const label = normalized.includes(":") ? normalized.split(":")[0].trim() : normalized;
  const total = totalMatch ? parseMoneyValue(totalMatch[1]) : null;

  return {
    rawValue: value,
    label,
    direction: inferDirection(normalized, total),
    classification: classify(normalized),
    rowCount: rowCountMatch ? Number(rowCountMatch[1]) : null,
    total,
    startDate: dateRangeMatch ? parseDateValue(dateRangeMatch[1]) : null,
    endDate: dateRangeMatch ? parseDateValue(dateRangeMatch[2]) : null,
  };
}

export function collectTinaAnalyzedTransactionGroups(
  draft: TinaWorkspaceDraft,
  sourceDocumentIds: string[]
): TinaAnalyzedTransactionGroup[] {
  const relevantFacts = draft.sourceFacts.filter(
    (fact) =>
      sourceDocumentIds.includes(fact.sourceDocumentId) &&
      TINA_TRANSACTION_EVIDENCE_LABELS.includes(
        fact.label as (typeof TINA_TRANSACTION_EVIDENCE_LABELS)[number]
      )
  );
  const lineageDocumentIds = new Set(
    relevantFacts
      .filter((fact) => fact.label === "Transaction lineage clue")
      .map((fact) => fact.sourceDocumentId)
  );

  return relevantFacts
    .filter(
      (fact) =>
        fact.label === "Transaction lineage clue" ||
        !lineageDocumentIds.has(fact.sourceDocumentId)
    )
    .map((fact) => ({
      factId: fact.id,
      sourceDocumentId: fact.sourceDocumentId,
      ...analyzeTinaTransactionGroupValue(fact.value),
    }));
}

export function summarizeTinaTransactionGroups(
  groups: TinaAnalyzedTransactionGroup[],
  limit = 2
): string {
  return groups
    .slice(0, limit)
    .map((group) => {
      const classLabel = group.classification.replace(/_/g, " ");
      const totalLabel = group.total === null ? "unknown total" : `${group.total >= 0 ? "+" : "-"}$${Math.abs(group.total).toLocaleString("en-US")}`;
      const rowLabel = group.rowCount === null ? "unknown rows" : `${group.rowCount} row${group.rowCount === 1 ? "" : "s"}`;
      return `${group.label} [${classLabel}, ${group.direction}, ${rowLabel}, ${totalLabel}]`;
    })
    .join("; ");
}

export function measureTinaTransactionGroupAlignment(args: {
  groups: TinaAnalyzedTransactionGroup[];
  amount: number | null;
  fieldLabel: string;
}): "aligned" | "mismatch" | "unknown" {
  if (args.amount === null || args.groups.length === 0) return "unknown";

  const fieldHaystack = args.fieldLabel.toLowerCase();
  const relevantGroups = args.groups.filter((group) => {
    if (fieldHaystack.includes("gross receipt") || fieldHaystack.includes("sales")) {
      return group.classification === "gross_receipts" || group.direction === "inflow";
    }
    if (fieldHaystack.includes("wage") || fieldHaystack.includes("payroll")) {
      return group.classification === "payroll";
    }
    if (fieldHaystack.includes("contract labor")) {
      return group.classification === "contractor";
    }
    if (fieldHaystack.includes("expense")) {
      return (
        group.direction === "outflow" ||
        group.classification === "ordinary_expense" ||
        group.classification === "payroll" ||
        group.classification === "contractor"
      );
    }

    return group.total !== null;
  });

  const groupsWithTotals = relevantGroups.filter((group) => group.total !== null);
  if (groupsWithTotals.length === 0) return "unknown";

  const candidateTotal = groupsWithTotals.reduce(
    (sum, group) => sum + Math.abs(group.total ?? 0),
    0
  );
  const targetTotal = Math.abs(args.amount);
  if (targetTotal === 0) return candidateTotal === 0 ? "aligned" : "unknown";

  const deltaRatio = Math.abs(candidateTotal - targetTotal) / targetTotal;
  return deltaRatio <= 0.15 ? "aligned" : "mismatch";
}
