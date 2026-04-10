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
const PACIFIC_TIME_ZONE = "America/Los_Angeles";

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

function getPacificParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
    millisecond: date.getUTCMilliseconds(),
  };
}

function getPacificOffsetMinutes(date: Date): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TIME_ZONE,
    timeZoneName: "shortOffset",
    hour: "2-digit",
  });
  const timeZoneName = formatter.formatToParts(date).find((part) => part.type === "timeZoneName")?.value ?? "GMT-8";
  const match = timeZoneName.match(/^GMT(?:(?<sign>[+-])(?<hours>\d{1,2})(?::(?<minutes>\d{2}))?)?$/);
  if (!match?.groups?.sign) return 0;

  const hours = Number(match.groups.hours ?? "0");
  const minutes = Number(match.groups.minutes ?? "0");
  const direction = match.groups.sign === "-" ? -1 : 1;
  return direction * (hours * 60 + minutes);
}

function pacificLocalToUtcIso(parts: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}): string {
  let utcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  );

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const offsetMinutes = getPacificOffsetMinutes(new Date(utcMs));
    const adjustedUtcMs = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond,
    ) - offsetMinutes * 60_000;
    if (adjustedUtcMs === utcMs) break;
    utcMs = adjustedUtcMs;
  }

  return new Date(utcMs).toISOString();
}

function addPacificBusinessDays(date: Date, businessDays: number) {
  const parts = getPacificParts(date);
  const pacificMidday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0));
  let remaining = businessDays;

  while (remaining > 0) {
    pacificMidday.setUTCDate(pacificMidday.getUTCDate() + 1);
    const weekday = pacificMidday.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      remaining -= 1;
    }
  }

  return {
    year: pacificMidday.getUTCFullYear(),
    month: pacificMidday.getUTCMonth() + 1,
    day: pacificMidday.getUTCDate(),
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
    millisecond: parts.millisecond,
  };
}

export function buildAutoCycleNextRoundDueAt(now = new Date()): string {
  return pacificLocalToUtcIso(addPacificBusinessDays(now, 1));
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

export function shouldDisplayAutoCycleLead(
  lead: { dial_queue_active?: boolean | null },
  autoCycle: Pick<AutoCycleLeadState, "readyNow">,
): boolean {
  return lead.dial_queue_active === true || autoCycle.readyNow;
}
