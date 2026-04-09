import type {
  AutoCycleLeadState,
  AutoCyclePhoneState,
  AutoCyclePhoneStatus,
  AutoCycleStatus,
  PublishDisposition,
} from "./types";

export interface AutoCycleLeadRowLike {
  id: string;
  lead_id: string;
  cycle_status: AutoCycleStatus;
  current_round: number;
  next_due_at: string | null;
  next_phone_id: string | null;
  last_outcome: string | null;
  exit_reason: string | null;
}

export interface AutoCyclePhoneRowLike {
  id: string;
  cycle_lead_id: string;
  lead_id: string;
  phone_id: string | null;
  phone: string;
  phone_position: number;
  attempt_count: number;
  next_attempt_number: number | null;
  next_due_at: string | null;
  last_attempt_at: string | null;
  last_outcome: string | null;
  voicemail_drop_next: boolean;
  phone_status: AutoCyclePhoneStatus;
  exit_reason: string | null;
}

const AUTO_CYCLE_DAY_MS = 24 * 60 * 60_000;
export const AUTO_CYCLE_MAX_NO_RESPONSE_ROUNDS = 3;

const LEAD_EXIT_DISPOSITIONS = new Set<PublishDisposition>([
  "not_interested",
  "do_not_call",
  "disqualified",
  "dead_lead",
]);

const MANUAL_HOLD_DISPOSITIONS = new Set<PublishDisposition>([
  "completed",
  "follow_up",
  "appointment",
  "offer_made",
]);

export function normalizePhoneForCompare(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "").slice(-10);
}

export function isAutoCycleLeadExitDisposition(disposition: PublishDisposition): boolean {
  return LEAD_EXIT_DISPOSITIONS.has(disposition);
}

export function isAutoCycleManualHoldDisposition(disposition: PublishDisposition): boolean {
  return MANUAL_HOLD_DISPOSITIONS.has(disposition);
}

export function buildAutoCycleNextRoundDueAt(now = new Date()): string {
  return new Date(now.getTime() + AUTO_CYCLE_DAY_MS).toISOString();
}

export function buildAutoCycleThirtyDayFollowUpDueAt(now = new Date()): string {
  return new Date(now.getTime() + 30 * AUTO_CYCLE_DAY_MS).toISOString();
}

export function shouldStopAutoCycleForNoResponseRound(nextRoundNumber: number): boolean {
  return nextRoundNumber > AUTO_CYCLE_MAX_NO_RESPONSE_ROUNDS;
}

export function isLeadStatusEligibleForAutoCycle(status: string | null | undefined): boolean {
  return status === "lead" || status === "prospect";
}

export function pickAutoCyclePhoneIdByPosition(
  phoneRows: AutoCyclePhoneRowLike[],
  phoneStatus: AutoCyclePhoneStatus = "active",
): string | null {
  const firstPhone = [...phoneRows]
    .filter((row) => row.phone_status === phoneStatus)
    .sort((a, b) => {
      if (a.phone_position !== b.phone_position) return a.phone_position - b.phone_position;
      return a.phone.localeCompare(b.phone);
    })[0];

  return firstPhone?.phone_id ?? null;
}

export function planNextAutoCyclePhoneCall(currentRound: number, now = new Date()): {
  nextAttemptNumber: number | null;
  nextDueAt: string | null;
  voicemailDropNext: boolean;
  phoneStatus: AutoCyclePhoneStatus;
} {
  return {
    nextAttemptNumber: Math.max(currentRound, 1) + 1,
    nextDueAt: buildAutoCycleNextRoundDueAt(now),
    voicemailDropNext: false,
    phoneStatus: "active",
  };
}

export function mapAutoCyclePhoneState(
  row: AutoCyclePhoneRowLike,
  now = new Date(),
): AutoCyclePhoneState {
  const dueMs = row.next_due_at ? new Date(row.next_due_at).getTime() : Number.NEGATIVE_INFINITY;
  return {
    id: row.id,
    cycleLeadId: row.cycle_lead_id,
    leadId: row.lead_id,
    phoneId: row.phone_id,
    phone: row.phone,
    phonePosition: row.phone_position,
    attemptCount: row.attempt_count,
    nextAttemptNumber: row.next_attempt_number,
    nextDueAt: row.next_due_at,
    lastAttemptAt: row.last_attempt_at,
    lastOutcome: row.last_outcome,
    voicemailDropNext: row.voicemail_drop_next,
    phoneStatus: row.phone_status,
    exitReason: row.exit_reason,
    dueNow: row.phone_status === "active" && dueMs <= now.getTime(),
  };
}

export function deriveLeadCycleState(
  leadRow: AutoCycleLeadRowLike,
  phoneRows: AutoCyclePhoneRowLike[],
  now = new Date(),
): AutoCycleLeadState {
  const phones = phoneRows.map((row) => mapAutoCyclePhoneState(row, now));
  const activePhones = phones.filter((phone) => phone.phoneStatus === "active");
  const duePhones = activePhones.filter((phone) => phone.dueNow);
  const nextPhone = duePhones[0]
    ?? [...activePhones].sort((a, b) => {
      const dueA = a.nextDueAt ? new Date(a.nextDueAt).getTime() : Number.NEGATIVE_INFINITY;
      const dueB = b.nextDueAt ? new Date(b.nextDueAt).getTime() : Number.NEGATIVE_INFINITY;
      if (dueA !== dueB) return dueA - dueB;
      return a.phonePosition - b.phonePosition;
    })[0]
    ?? null;

  const currentRound = activePhones.reduce((round, phone) => {
    if (phone.nextAttemptNumber == null) return round;
    return Math.min(round, phone.nextAttemptNumber);
  }, leadRow.current_round || 1);
  const isPaused = leadRow.cycle_status === "paused";

  return {
    id: leadRow.id,
    leadId: leadRow.lead_id,
    cycleStatus: activePhones.length === 0 ? "exited" : isPaused ? "paused" : duePhones.length > 0 ? "ready" : leadRow.cycle_status,
    currentRound: Number.isFinite(currentRound) ? currentRound : leadRow.current_round,
    nextDueAt: nextPhone?.nextDueAt ?? leadRow.next_due_at,
    nextPhoneId: nextPhone?.phoneId ?? leadRow.next_phone_id,
    lastOutcome: leadRow.last_outcome,
    exitReason: activePhones.length === 0 ? (leadRow.exit_reason ?? "completed") : leadRow.exit_reason,
    readyNow: !isPaused && duePhones.length > 0,
    voicemailDropNext: Boolean(nextPhone?.voicemailDropNext),
    remainingPhones: activePhones.length,
  };
}
