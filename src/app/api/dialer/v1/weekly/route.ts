/**
 * GET /api/dialer/v1/weekly
 *
 * Weekly call/task discipline KPI summary.
 * Returns the last N calendar weeks as an array of week buckets,
 * each containing counts and rates for the six core discipline metrics,
 * plus a current overdue-task count.
 *
 * Metrics per week:
 *   calls_published          — all published calls
 *   follow_up_calls          — follow_up + appointment dispositions
 *   task_creation_pct        — follow_up.task_created / follow_up_calls
 *   callback_slippage_pct    — callback_date_defaulted / tasks_created
 *   ai_flag_rate_pct         — ai_output.flagged / ai_output.reviewed
 *   ai_reviewed              — how many AI outputs were reviewed this week
 *
 * Top-level (current snapshot, not per-week):
 *   overdue_tasks_now        — count of pending dialer-created tasks past due_at
 *
 * Query params:
 *   ?weeks=N  — number of complete calendar weeks to return (default: 4, max: 12)
 *
 * BOUNDARY RULES:
 *   - Auth via getDialerUser()
 *   - DB via createDialerClient()
 *   - Reads dialer_events (dialer-owned) and tasks (CRM-owned, read-only)
 *   - MUST NOT write to any table
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface WeekBucket {
  /** ISO week string: YYYY-Www  e.g. "2026-W11" */
  week:                     string;
  /** ISO timestamp of Monday 00:00 UTC for this week */
  week_start:               string;
  calls_published:          number;
  follow_up_calls:          number;
  tasks_created:            number;
  callbacks_defaulted:      number;
  ai_reviewed:              number;
  ai_flagged:               number;
  /** null when no follow_up calls this week */
  task_creation_pct:        number | null;
  /** null when no tasks created this week */
  callback_slippage_pct:    number | null;
  /** null when no AI outputs reviewed this week */
  ai_flag_rate_pct:         number | null;
}

export interface WeeklyResult {
  generated_at:        string;
  weeks_returned:      number;
  /** Count of dialer-created pending tasks with due_at in the past — live snapshot */
  overdue_tasks_now:   number;
  weeks:               WeekBucket[];   // newest first
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Returns YYYY-Www for a given Date (ISO week, Monday-anchored). */
function isoWeek(d: Date): string {
  // ISO 8601: week containing Thursday. Thursday = day 4.
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayOfWeek = dt.getUTCDay(); // 0=Sun
  // Shift to Monday=0
  const mondayOffset = (dayOfWeek + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - mondayOffset + 3); // Thursday of this week
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((dt.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

/** Returns the Monday 00:00 UTC of the week containing d. */
function weekStart(d: Date): Date {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayOfWeek = dt.getUTCDay();
  const mondayOffset = (dayOfWeek + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - mondayOffset);
  return dt;
}

const pct = (num: number, denom: number): number | null =>
  denom === 0 ? null : Math.round((num / denom) * 1000) / 10;

// ─────────────────────────────────────────────────────────────
// Route
// ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const weeksParam = searchParams.get("weeks");
  let weeks = 4;
  if (weeksParam) {
    const parsed = parseInt(weeksParam, 10);
    if (!Number.isNaN(parsed) && parsed > 0) weeks = Math.min(parsed, 12);
  }

  const now = new Date();
  const since = new Date(now.getTime() - weeks * 7 * 86_400_000).toISOString();
  const sb = createDialerClient();

  // ── Events query ────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: eventRows, error: eventErr } = await (sb.from("dialer_events") as any)
    .select("event_type, payload, created_at")
    .in("event_type", [
      "call.published",
      "follow_up.task_created",
      "follow_up.callback_date_defaulted",
      "ai_output.reviewed",
      "ai_output.flagged",
    ])
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (eventErr) {
    console.error("[dialer/weekly] dialer_events query failed:", eventErr.message);
    return NextResponse.json({ error: "Failed to load weekly data" }, { status: 500 });
  }

  // ── Overdue tasks count (live snapshot, not per-week) ───────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: overdueCount, error: overdueErr } = await (sb.from("tasks") as any)
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .lt("due_at", now.toISOString())
    .or("title.ilike.Follow up%,title.ilike.Appointment%");

  if (overdueErr) {
    console.error("[dialer/weekly] overdue tasks count failed:", overdueErr.message);
  }

  // ── Build week buckets ──────────────────────────────────────
  // Pre-build the ordered week keys for the last N weeks so every week
  // appears in the result even if it has zero events.
  const weekKeys: string[] = [];
  const weekStartByKey = new Map<string, string>();

  for (let i = 0; i < weeks; i++) {
    const d = new Date(now.getTime() - i * 7 * 86_400_000);
    const key = isoWeek(d);
    if (!weekStartByKey.has(key)) {
      weekKeys.push(key);
      weekStartByKey.set(key, weekStart(d).toISOString());
    }
  }

  const buckets = new Map<string, WeekBucket>(
    weekKeys.map((key) => [
      key,
      {
        week:                  key,
        week_start:            weekStartByKey.get(key)!,
        calls_published:       0,
        follow_up_calls:       0,
        tasks_created:         0,
        callbacks_defaulted:   0,
        ai_reviewed:           0,
        ai_flagged:            0,
        task_creation_pct:     null,
        callback_slippage_pct: null,
        ai_flag_rate_pct:      null,
      },
    ]),
  );

  // Distribute events into week buckets
  for (const row of (eventRows ?? []) as Array<{
    event_type: string;
    payload: Record<string, unknown> | null;
    created_at: string;
  }>) {
    const key = isoWeek(new Date(row.created_at));
    const bucket = buckets.get(key);
    if (!bucket) continue; // outside our week range

    switch (row.event_type) {
      case "call.published":
        bucket.calls_published++;
        if (
          row.payload?.disposition === "follow_up" ||
          row.payload?.disposition === "appointment"
        ) {
          bucket.follow_up_calls++;
        }
        break;
      case "follow_up.task_created":
        bucket.tasks_created++;
        break;
      case "follow_up.callback_date_defaulted":
        bucket.callbacks_defaulted++;
        break;
      case "ai_output.reviewed":
        bucket.ai_reviewed++;
        break;
      case "ai_output.flagged":
        bucket.ai_flagged++;
        break;
    }
  }

  // Compute rates per bucket
  for (const bucket of buckets.values()) {
    bucket.task_creation_pct     = pct(bucket.tasks_created,       bucket.follow_up_calls);
    bucket.callback_slippage_pct = pct(bucket.callbacks_defaulted, bucket.tasks_created);
    bucket.ai_flag_rate_pct      = pct(bucket.ai_flagged,          bucket.ai_reviewed);
  }

  const result: WeeklyResult = {
    generated_at:       now.toISOString(),
    weeks_returned:     weekKeys.length,
    overdue_tasks_now:  overdueCount ?? 0,
    weeks:              weekKeys.map((k) => buckets.get(k)!),  // newest first
  };

  return NextResponse.json(result);
}
