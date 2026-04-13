import { isDeepDiveNextAction } from "@/lib/deep-dive";

const STALE_CONTACT_MS = 7 * 24 * 60 * 60 * 1000;

export type ActiveWorkState = "broken" | "call_now" | "due_today" | "stale" | "upcoming";

interface LeadWorkInput {
  assignedTo?: string | null;
  nextAction?: string | null;
  nextActionDueAt?: string | null;
  nextCallScheduledAt?: string | null;
  nextFollowUpAt?: string | null;
  followUpDate?: string | null;
  lastContactAt?: string | null;
}

export function isDriveByNextActionText(nextAction: string | null | undefined): boolean {
  return typeof nextAction === "string" && nextAction.trim().toLowerCase().startsWith("drive by");
}

export function isNonDialingNextActionText(nextAction: string | null | undefined): boolean {
  return isDriveByNextActionText(nextAction) || isDeepDiveNextAction(nextAction);
}

export function resolveLeadDueAt(input: LeadWorkInput): string | null {
  return input.nextActionDueAt ?? input.nextCallScheduledAt ?? input.nextFollowUpAt ?? input.followUpDate ?? null;
}

export function hasLeadNextActionDiscipline(input: LeadWorkInput): boolean {
  return Boolean(input.assignedTo && input.assignedTo.trim() && input.nextAction?.trim() && resolveLeadDueAt(input));
}

export function classifyActiveWork(input: LeadWorkInput, now = new Date()): ActiveWorkState {
  const dueAt = resolveLeadDueAt(input);
  if (!input.assignedTo?.trim() || !input.nextAction?.trim() || !dueAt) {
    return "broken";
  }

  const dueMs = new Date(dueAt).getTime();
  if (!Number.isNaN(dueMs)) {
    if (dueMs <= now.getTime()) return "call_now";

    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    if (dueMs <= endOfToday.getTime()) return "due_today";
  }

  if (input.lastContactAt) {
    const lastTouchMs = new Date(input.lastContactAt).getTime();
    if (!Number.isNaN(lastTouchMs) && now.getTime() - lastTouchMs > STALE_CONTACT_MS) {
      return "stale";
    }
  }

  return "upcoming";
}

export function isDialReadyActiveWork(input: LeadWorkInput, now = new Date()): boolean {
  const state = classifyActiveWork(input, now);
  if (state === "broken" || state === "upcoming") return false;
  return !isNonDialingNextActionText(input.nextAction);
}
