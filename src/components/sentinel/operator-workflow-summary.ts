/**
 * Single operator-facing workflow summary for CRM surfaces.
 * Wraps deriveLeadActionSummary + compact due / last-touch labels.
 * Does not add new business rules — presentation only.
 */

import { deriveLeadActionSummary, type UrgencyLevel } from "@/lib/action-derivation";
import { formatDueDateLabel } from "@/lib/due-date-label";
import type { QualificationRoute } from "@/lib/types";

export interface OperatorWorkflowFields {
  status: string | null;
  qualificationRoute?: QualificationRoute | string | null;
  assignedTo?: string | null;
  nextCallScheduledAt?: string | null;
  nextFollowUpAt?: string | null;
  lastContactAt?: string | null;
  totalCalls?: number | null;
  nextAction?: string | null;
  nextActionDueAt?: string | null;
  createdAt?: string | null;
  promotedAt?: string | null;
  now?: Date;
}

export interface OperatorWorkflowSummary {
  /** What to do now — from deriveLeadActionSummary.action */
  doNow: string;
  /** Compact due label for the effective next due datetime */
  dueLabel: string;
  effectiveDueIso: string | null;
  dueOverdue: boolean;
  /** Short last-contact phrase; pair with workedToday for “touched today” */
  lastTouchLabel: string;
  workedToday: boolean;
  urgency: UrgencyLevel;
  actionable: boolean;
}

function sameLocalCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function lastTouchFromIso(iso: string | null | undefined, now: Date): { label: string; workedToday: boolean } {
  if (!iso) return { label: "No touch", workedToday: false };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { label: "No touch", workedToday: false };

  if (sameLocalCalendarDay(d, now)) {
    return { label: "Today", workedToday: true };
  }

  const dayMs = 86400000;
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startTouch = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startToday - startTouch) / dayMs);
  if (diffDays === 1) return { label: "Yesterday", workedToday: false };
  if (diffDays > 1) return { label: `${diffDays}d ago`, workedToday: false };
  return { label: "Today", workedToday: true };
}

/**
 * Build the canonical operator workflow summary from persisted lead fields.
 */
export function buildOperatorWorkflowSummary(fields: OperatorWorkflowFields): OperatorWorkflowSummary {
  const now = fields.now ?? new Date();

  const summary = deriveLeadActionSummary({
    status: fields.status,
    qualificationRoute: fields.qualificationRoute as QualificationRoute | null | undefined,
    assignedTo: fields.assignedTo,
    nextCallScheduledAt: fields.nextCallScheduledAt,
    nextFollowUpAt: fields.nextFollowUpAt,
    lastContactAt: fields.lastContactAt,
    totalCalls: fields.totalCalls,
    nextAction: fields.nextAction,
    nextActionDueAt: fields.nextActionDueAt,
    createdAt: fields.createdAt,
    promotedAt: fields.promotedAt,
    now,
  });

  const effectiveDueIso = fields.nextAction
    ? (fields.nextActionDueAt ?? fields.nextCallScheduledAt ?? fields.nextFollowUpAt ?? null)
    : (fields.nextCallScheduledAt ?? fields.nextFollowUpAt ?? fields.nextActionDueAt ?? null);
  const dueFmt = formatDueDateLabel(effectiveDueIso, now);
  const dueLabel =
    !effectiveDueIso || dueFmt.text === "n/a" ? "—" : dueFmt.text;

  const { label: lastTouchLabel, workedToday } = lastTouchFromIso(fields.lastContactAt, now);

  return {
    doNow: summary.action,
    dueLabel,
    effectiveDueIso,
    dueOverdue: dueFmt.overdue,
    lastTouchLabel,
    workedToday,
    urgency: summary.urgency,
    actionable: summary.isActionable,
  };
}
