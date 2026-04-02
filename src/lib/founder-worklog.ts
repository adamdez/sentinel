export interface FounderWorkLogRow {
  user_id?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
}

export interface FounderWorkLogSummary {
  founderHours: number;
  totalMinutes: number;
  rawIntervals: number;
  mergedIntervals: number;
}

export interface FounderWorkLogCoverageRow {
  userId: string;
  callCount: number;
  founderHours: number;
}

export interface FounderWorkLogGapRow extends FounderWorkLogCoverageRow {
  minCallsForReminder: number;
  minHoursForReminder: number;
}

function safeMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

interface Interval {
  start: number;
  end: number;
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length <= 1) return intervals;
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];

  let current = sorted[0];
  for (let i = 1; i < sorted.length; i += 1) {
    const next = sorted[i];
    if (next.start <= current.end) {
      current = { start: current.start, end: Math.max(current.end, next.end) };
      continue;
    }
    merged.push(current);
    current = next;
  }
  merged.push(current);
  return merged;
}

/**
 * Computes durable founder effort from explicit work logs.
 * - clamps logs to the provided window
 * - merges overlaps per user to avoid double-counting
 * - keeps user timelines separate (no cross-user merging)
 */
export function computeFounderHoursFromWorkLogs(
  rows: FounderWorkLogRow[],
  windowStartIso: string,
  windowEndIso: string,
  allowedUserIds?: string[] | null,
): FounderWorkLogSummary {
  const startMs = safeMs(windowStartIso);
  const endMs = safeMs(windowEndIso);
  if (startMs == null || endMs == null || endMs <= startMs) {
    return { founderHours: 0, totalMinutes: 0, rawIntervals: 0, mergedIntervals: 0 };
  }

  const allowedSet = allowedUserIds && allowedUserIds.length > 0
    ? new Set(allowedUserIds)
    : null;

  const intervalsByUser = new Map<string, Interval[]>();
  let rawIntervals = 0;

  for (const row of rows) {
    const userId = (row.user_id ?? "").trim();
    if (!userId) continue;
    if (allowedSet && !allowedSet.has(userId)) continue;

    const rowStartMs = safeMs(row.started_at);
    if (rowStartMs == null) continue;

    const rowEndMs = safeMs(row.ended_at) ?? endMs;
    if (rowEndMs <= startMs || rowStartMs >= endMs) continue;

    const clampedStart = Math.max(rowStartMs, startMs);
    const clampedEnd = Math.min(rowEndMs, endMs);
    if (clampedEnd <= clampedStart) continue;

    rawIntervals += 1;
    const list = intervalsByUser.get(userId) ?? [];
    list.push({ start: clampedStart, end: clampedEnd });
    intervalsByUser.set(userId, list);
  }

  let totalMs = 0;
  let mergedIntervals = 0;
  for (const list of intervalsByUser.values()) {
    const merged = mergeIntervals(list);
    mergedIntervals += merged.length;
    for (const interval of merged) {
      totalMs += interval.end - interval.start;
    }
  }

  const totalMinutes = round1(totalMs / 60000);
  const founderHours = round1(totalMinutes / 60);
  return { founderHours, totalMinutes, rawIntervals, mergedIntervals };
}

/**
 * Finds founders who had meaningful call activity but did not log enough founder hours.
 * This powers adoption reminders so true-north efficiency stays anchored to explicit work logs.
 */
export function findFounderWorkLogGaps(
  rows: FounderWorkLogCoverageRow[],
  options?: {
    minCallsForReminder?: number;
    minHoursForReminder?: number;
  },
): FounderWorkLogGapRow[] {
  const minCallsForReminder = Math.max(1, Math.floor(options?.minCallsForReminder ?? 3));
  const minHoursForReminder = Math.max(0, options?.minHoursForReminder ?? 0.5);

  return rows
    .filter((row) => row.callCount >= minCallsForReminder && row.founderHours < minHoursForReminder)
    .sort((a, b) => {
      if (b.callCount !== a.callCount) return b.callCount - a.callCount;
      if (a.founderHours !== b.founderHours) return a.founderHours - b.founderHours;
      return a.userId.localeCompare(b.userId);
    })
    .map((row) => ({
      ...row,
      minCallsForReminder,
      minHoursForReminder,
    }));
}
