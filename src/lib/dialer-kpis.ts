export type DialerKpiPreset = "today" | "week" | "month" | "year" | "all" | "custom";

export interface DialerKpiMetricPair {
  user: number;
  team: number;
}

export interface DialerKpiRange {
  from: string | null;
  to: string | null;
  preset: DialerKpiPreset;
}

export interface DialerKpiSnapshot {
  range: DialerKpiRange;
  metrics: {
    outbound: DialerKpiMetricPair;
    pickups: DialerKpiMetricPair;
    inbound: DialerKpiMetricPair;
    missedCalls: DialerKpiMetricPair;
    talkTimeSec: DialerKpiMetricPair;
  };
}

export interface DialerKpiCallRecord {
  user_id: string;
  direction: string | null;
  disposition: string | null;
  duration_sec: number | null;
  started_at: string;
}

const HUMAN_PICKUP_DISPOSITIONS = new Set([
  "answered",
  "connected",
  "interested",
  "completed",
  "not_interested",
  "follow_up",
  "appointment",
  "appointment_set",
  "offer_made",
  "callback",
  "contract",
]);

const MISSED_INBOUND_DISPOSITIONS = new Set(["no_answer", "missed", "busy"]);
const SMS_ONLY_DISPOSITIONS = new Set(["sms_outbound"]);

function getPacificFormatter() {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function getPacificDateFormatter() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function getPacificParts(date: Date) {
  const formatter = getPacificFormatter();
  const parts = formatter.formatToParts(date);
  const pick = (type: string) => Number.parseInt(parts.find((part) => part.type === type)?.value ?? "0", 10);

  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour"),
    minute: pick("minute"),
    second: pick("second"),
  };
}

function getPacificOffsetMs(date: Date): number {
  const parts = getPacificParts(date);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - date.getTime();
}

function pacificLocalToUtc(input: {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
  millisecond?: number;
}): Date {
  const targetUtc = Date.UTC(
    input.year,
    input.month - 1,
    input.day,
    input.hour ?? 0,
    input.minute ?? 0,
    input.second ?? 0,
    input.millisecond ?? 0,
  );

  let guess = targetUtc;
  for (let i = 0; i < 3; i += 1) {
    const offset = getPacificOffsetMs(new Date(guess));
    const next = targetUtc - offset;
    if (next === guess) break;
    guess = next;
  }

  return new Date(guess);
}

function pacificDateString(date: Date): string {
  return getPacificDateFormatter().format(date);
}

function addPacificDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map((value) => Number.parseInt(value, 10));
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return utc.toISOString().slice(0, 10);
}

function startOfPacificDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map((value) => Number.parseInt(value, 10));
  return pacificLocalToUtc({ year, month, day, hour: 0, minute: 0, second: 0, millisecond: 0 }).toISOString();
}

function endOfPacificDate(dateStr: string): string {
  const nextDateStart = startOfPacificDate(addPacificDays(dateStr, 1));
  return new Date(new Date(nextDateStart).getTime() - 1).toISOString();
}

export function resolveDialerKpiRange(input: {
  preset?: string | null;
  from?: string | null;
  to?: string | null;
  now?: Date;
}): DialerKpiRange {
  const now = input.now ?? new Date();
  const pacificNow = getPacificParts(now);
  const today = `${pacificNow.year}-${String(pacificNow.month).padStart(2, "0")}-${String(pacificNow.day).padStart(2, "0")}`;

  const normalizedPreset = (input.preset ?? "today").toLowerCase() as DialerKpiPreset;
  if (normalizedPreset === "all") {
    return { preset: "all", from: null, to: null };
  }

  if (normalizedPreset === "custom") {
    const fromDate = input.from?.trim() || today;
    const toDate = input.to?.trim() || fromDate;
    return {
      preset: "custom",
      from: startOfPacificDate(fromDate),
      to: endOfPacificDate(toDate),
    };
  }

  if (normalizedPreset === "today") {
    return {
      preset: "today",
      from: startOfPacificDate(today),
      to: endOfPacificDate(today),
    };
  }

  if (normalizedPreset === "week") {
    const utc = new Date(Date.UTC(pacificNow.year, pacificNow.month - 1, pacificNow.day));
    const weekStart = addPacificDays(today, -utc.getUTCDay());
    return {
      preset: "week",
      from: startOfPacificDate(weekStart),
      to: endOfPacificDate(today),
    };
  }

  if (normalizedPreset === "month") {
    const monthStart = `${pacificNow.year}-${String(pacificNow.month).padStart(2, "0")}-01`;
    return {
      preset: "month",
      from: startOfPacificDate(monthStart),
      to: endOfPacificDate(today),
    };
  }

  const yearStart = `${pacificNow.year}-01-01`;
  return {
    preset: "year",
    from: startOfPacificDate(yearStart),
    to: endOfPacificDate(today),
  };
}

export function isOutboundCall(call: Pick<DialerKpiCallRecord, "direction" | "disposition">): boolean {
  if (call.direction !== "outbound") return false;
  return !SMS_ONLY_DISPOSITIONS.has(call.disposition ?? "");
}

export function isInboundCall(call: Pick<DialerKpiCallRecord, "direction">): boolean {
  return call.direction === "inbound";
}

export function isPickupCall(call: Pick<DialerKpiCallRecord, "direction" | "disposition">): boolean {
  return isOutboundCall(call) && HUMAN_PICKUP_DISPOSITIONS.has((call.disposition ?? "").toLowerCase());
}

export function isMissedInboundCall(call: Pick<DialerKpiCallRecord, "direction" | "disposition">): boolean {
  return isInboundCall(call) && MISSED_INBOUND_DISPOSITIONS.has(call.disposition ?? "");
}

export function aggregateDialerKpis(input: {
  calls: DialerKpiCallRecord[];
  userId: string;
  teamUserIds?: string[] | null;
  range: DialerKpiRange;
}): DialerKpiSnapshot {
  const teamUserIds = new Set((input.teamUserIds ?? []).filter(Boolean));
  const hasTeamFilter = teamUserIds.size > 0;

  const emptyMetric = (): DialerKpiMetricPair => ({ user: 0, team: 0 });
  const metrics = {
    outbound: emptyMetric(),
    pickups: emptyMetric(),
    inbound: emptyMetric(),
    missedCalls: emptyMetric(),
    talkTimeSec: emptyMetric(),
  };

  for (const call of input.calls) {
    const isUser = call.user_id === input.userId;
    const isTeam = hasTeamFilter ? teamUserIds.has(call.user_id) : true;

    if (!isUser && !isTeam) continue;

    const duration = Math.max(0, call.duration_sec ?? 0);

    if (isOutboundCall(call)) {
      if (isUser) metrics.outbound.user += 1;
      if (isTeam) metrics.outbound.team += 1;
    }

    if (isPickupCall(call)) {
      if (isUser) metrics.pickups.user += 1;
      if (isTeam) metrics.pickups.team += 1;
    }

    if (isInboundCall(call)) {
      if (isUser) metrics.inbound.user += 1;
      if (isTeam) metrics.inbound.team += 1;
    }

    if (isMissedInboundCall(call)) {
      if (isUser) metrics.missedCalls.user += 1;
      if (isTeam) metrics.missedCalls.team += 1;
    }

    if (duration > 0) {
      if (isUser) metrics.talkTimeSec.user += duration;
      if (isTeam) metrics.talkTimeSec.team += duration;
    }
  }

  return {
    range: input.range,
    metrics,
  };
}

export function formatTalkTime(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainder = safe % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}`;
  }
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function kpiDateInputValue(dateIso: string | null): string {
  if (!dateIso) return "";
  return pacificDateString(new Date(dateIso));
}
