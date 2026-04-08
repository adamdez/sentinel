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

const LEAD_EXIT_DISPOSITIONS = new Set<PublishDisposition>([
  "completed",
  "not_interested",
  "wrong_number",
  "disconnected",
  "do_not_call",
  "follow_up",
  "appointment",
  "offer_made",
  "disqualified",
  "dead_lead",
]);

export function normalizePhoneForCompare(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "").slice(-10);
}

export function isAutoCycleLeadExitDisposition(disposition: PublishDisposition): boolean {
  return LEAD_EXIT_DISPOSITIONS.has(disposition);
}

export function nextAttemptPlan(attemptCountAfterOutcome: number, now = new Date()): {
  nextAttemptNumber: number | null;
  nextDueAt: string | null;
  voicemailDropNext: boolean;
  phoneStatus: AutoCyclePhoneStatus;
} {
  if (attemptCountAfterOutcome >= 5) {
    return {
      nextAttemptNumber: null,
      nextDueAt: null,
      voicemailDropNext: false,
      phoneStatus: "completed",
    };
  }

  if (attemptCountAfterOutcome === 1) {
    return {
      nextAttemptNumber: 2,
      nextDueAt: new Date(now.getTime() + 5 * 60_000).toISOString(),
      voicemailDropNext: true,
      phoneStatus: "active",
    };
  }

  if (attemptCountAfterOutcome === 2) {
    return {
      nextAttemptNumber: 3,
      nextDueAt: new Date(now.getTime() + 24 * 60 * 60_000).toISOString(),
      voicemailDropNext: false,
      phoneStatus: "active",
    };
  }

  if (attemptCountAfterOutcome === 3) {
    return {
      nextAttemptNumber: 4,
      nextDueAt: new Date(now.getTime() + 5 * 60_000).toISOString(),
      voicemailDropNext: true,
      phoneStatus: "active",
    };
  }

  return {
    nextAttemptNumber: 5,
    nextDueAt: new Date(now.getTime() + 24 * 60 * 60_000).toISOString(),
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

  return {
    id: leadRow.id,
    leadId: leadRow.lead_id,
    cycleStatus: activePhones.length === 0 ? "exited" : duePhones.length > 0 ? "ready" : leadRow.cycle_status,
    currentRound: Number.isFinite(currentRound) ? currentRound : leadRow.current_round,
    nextDueAt: nextPhone?.nextDueAt ?? leadRow.next_due_at,
    nextPhoneId: nextPhone?.phoneId ?? leadRow.next_phone_id,
    lastOutcome: leadRow.last_outcome,
    exitReason: activePhones.length === 0 ? (leadRow.exit_reason ?? "completed") : leadRow.exit_reason,
    readyNow: duePhones.length > 0,
    voicemailDropNext: Boolean(nextPhone?.voicemailDropNext),
    remainingPhones: activePhones.length,
  };
}
