import { buildOperatorWorkflowSummary } from "@/components/sentinel/operator-workflow-summary";
import { leadSourceSortKey } from "@/lib/lead-source";
import type { LeadStatus, QualificationRoute } from "@/lib/types";

type SortField = "score" | "priority" | "followUp" | "due" | "lastTouch" | "address" | "owner" | "source" | "status" | "equity";
type SortDir = "asc" | "desc";

export interface SortableLeadRow {
  id: string;
  /** Maps to DB `pinned` — represents "Active" work-bucket membership */
  pinned: boolean;
  score: {
    composite: number;
  };
  predictivePriority: number;
  address: string;
  ownerName: string;
  source: string;
  sourceChannel: string | null;
  sourceVendor: string | null;
  sourceListName: string | null;
  equityPercent: number | null;
  status: LeadStatus;
  qualificationRoute: QualificationRoute | null;
  assignedTo: string | null;
  nextCallScheduledAt: string | null;
  followUpDate: string | null;
  lastContactAt: string | null;
  totalCalls: number;
  promotedAt: string;
  nextAction?: string | null;
  nextActionDueAt?: string | null;
  introSopActive?: boolean | null;
  introDayCount?: number | null;
  introLastCallDate?: string | null;
  requiresIntroExitCategory?: boolean | null;
}

function compareNumber(a: number, b: number, dir: SortDir): number {
  return dir === "asc" ? a - b : b - a;
}

function compareText(a: string, b: string, dir: SortDir): number {
  const result = a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
  return dir === "asc" ? result : -result;
}

function compareNullableTime(
  aIso: string | null | undefined,
  bIso: string | null | undefined,
  dir: SortDir,
  missing: "first" | "last" = "last",
): number {
  const aMs = toMs(aIso);
  const bMs = toMs(bIso);

  if (aMs == null && bMs == null) return 0;
  if (aMs == null) return missing === "first" ? -1 : 1;
  if (bMs == null) return missing === "first" ? 1 : -1;

  return compareNumber(aMs, bMs, dir);
}

function toMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function stableCompare(a: SortableLeadRow, b: SortableLeadRow, dir: SortDir): number {
  return (
    compareText(a.ownerName, b.ownerName, dir) ||
    compareText(a.address, b.address, dir) ||
    compareNullableTime(a.promotedAt, b.promotedAt, dir) ||
    compareText(a.id, b.id, dir)
  );
}

function doNowSortParts(lead: SortableLeadRow): {
  label: string;
  normalizedLabel: string;
  numericHint: number | null;
  dueIso: string | null;
} {
  const workflow = buildOperatorWorkflowSummary({
    status: lead.status,
    qualificationRoute: lead.qualificationRoute,
    assignedTo: lead.assignedTo,
    nextCallScheduledAt: lead.nextCallScheduledAt,
    nextFollowUpAt: lead.followUpDate,
    lastContactAt: lead.lastContactAt,
    totalCalls: lead.totalCalls,
    nextAction: lead.nextAction,
    nextActionDueAt: lead.nextActionDueAt,
    createdAt: lead.promotedAt,
    promotedAt: lead.promotedAt,
    introSopActive: lead.introSopActive,
    introDayCount: lead.introDayCount,
    introLastCallDate: lead.introLastCallDate,
    requiresIntroExitCategory: lead.requiresIntroExitCategory,
  });

  const label = workflow.doNow.trim();
  const normalizedLabel = label
    .toLowerCase()
    .replace(/day\s+\d+\/\d+/g, "day #/#")
    .replace(/<\d+d/g, "#d")
    .replace(/\b\d+d\b/g, "#d")
    .replace(/\bin\s+\d+d\b/g, "in #d")
    .replace(/\s+/g, " ")
    .trim();

  const numericMatch =
    label.match(/day\s+(\d+)\/\d+/i) ??
    label.match(/(\d+)d overdue/i) ??
    label.match(/in\s+(\d+)d/i) ??
    label.match(/(\d+)d since/i) ??
    label.match(/no contact in\s+(\d+)d/i);

  return {
    label,
    normalizedLabel,
    numericHint: numericMatch?.[1] ? Number(numericMatch[1]) : null,
    dueIso: workflow.effectiveDueIso,
  };
}

export function sortLeadRows<T extends SortableLeadRow>(
  leads: T[],
  sortField: SortField,
  sortDir: SortDir,
): T[] {
  const copy = [...leads];
  const doNowCache = sortField === "followUp"
    ? new Map(copy.map((lead) => [lead.id, doNowSortParts(lead)]))
    : null;

  copy.sort((a, b) => {
    switch (sortField) {
      case "score":
        return compareNumber(a.score.composite, b.score.composite, sortDir) || stableCompare(a, b, sortDir);
      case "priority":
        return compareNumber(a.predictivePriority, b.predictivePriority, sortDir) || stableCompare(a, b, sortDir);
      case "followUp": {
        const aDoNow = doNowCache?.get(a.id);
        const bDoNow = doNowCache?.get(b.id);
        if (!aDoNow || !bDoNow) return stableCompare(a, b, sortDir);

        return (
          compareText(aDoNow.normalizedLabel, bDoNow.normalizedLabel, sortDir) ||
          compareNumber(aDoNow.numericHint ?? Number.POSITIVE_INFINITY, bDoNow.numericHint ?? Number.POSITIVE_INFINITY, sortDir) ||
          compareText(aDoNow.label, bDoNow.label, sortDir) ||
          compareNullableTime(aDoNow.dueIso, bDoNow.dueIso, sortDir) ||
          stableCompare(a, b, sortDir)
        );
      }
      case "due": {
        const aDue = a.nextActionDueAt ?? a.nextCallScheduledAt ?? a.followUpDate;
        const bDue = b.nextActionDueAt ?? b.nextCallScheduledAt ?? b.followUpDate;
        return compareNullableTime(aDue, bDue, sortDir) || stableCompare(a, b, sortDir);
      }
      case "lastTouch": {
        return compareNullableTime(a.lastContactAt, b.lastContactAt, sortDir, "last") || stableCompare(a, b, sortDir);
      }
      case "address":
        return compareText(a.address, b.address, sortDir) || compareText(a.ownerName, b.ownerName, sortDir) || compareText(a.id, b.id, sortDir);
      case "owner":
        return compareText(a.ownerName, b.ownerName, sortDir) || compareText(a.address, b.address, sortDir) || compareText(a.id, b.id, sortDir);
      case "source":
        return compareText(leadSourceSortKey(a), leadSourceSortKey(b), sortDir) || stableCompare(a, b, sortDir);
      case "equity":
        return compareNumber(a.equityPercent ?? Number.NEGATIVE_INFINITY, b.equityPercent ?? Number.NEGATIVE_INFINITY, sortDir) || stableCompare(a, b, sortDir);
      case "status":
        return compareText(a.status, b.status, sortDir) || stableCompare(a, b, sortDir);
      default:
        return stableCompare(a, b, sortDir);
    }
  });

  return copy;
}

export function sortRowsWithComparator<T>(
  rows: T[],
  compare: (a: T, b: T) => number,
): T[] {
  return [...rows].sort(compare);
}

export function compareRowText<T>(
  a: T,
  b: T,
  accessor: (row: T) => string | null | undefined,
  dir: SortDir,
): number {
  return compareText(accessor(a) ?? "", accessor(b) ?? "", dir);
}

export function compareRowTime<T>(
  a: T,
  b: T,
  accessor: (row: T) => string | null | undefined,
  dir: SortDir,
  missing: "first" | "last" = "last",
): number {
  return compareNullableTime(accessor(a), accessor(b), dir, missing);
}

export function compareRowNumber<T>(
  a: T,
  b: T,
  accessor: (row: T) => number | null | undefined,
  dir: SortDir,
  missing: "first" | "last" = "last",
): number {
  const aValue = accessor(a);
  const bValue = accessor(b);

  if (aValue == null && bValue == null) return 0;
  if (aValue == null) return missing === "first" ? -1 : 1;
  if (bValue == null) return missing === "first" ? 1 : -1;

  return compareNumber(aValue, bValue, dir);
}
