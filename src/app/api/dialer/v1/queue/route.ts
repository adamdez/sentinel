/**
 * GET /api/dialer/v1/queue
 *
 * Missed-opportunity hunter — surfaces four narrow buckets of follow-up
 * leakage and review debt from existing workflow data. No scoring, no
 * notifications, no operator steps required.
 *
 * Buckets:
 *   overdue_tasks          — dialer-created tasks past due_at, still pending
 *   defaulted_callbacks    — tasks created with no operator date (defaulted),
 *                            still pending — callback was never intentionally scheduled
 *   flagged_ai             — AI trace outputs flagged by operator, surfaced for
 *                            prompt/review attention
 *   leaking_follow_ups     — leads with qualification_route=follow_up or
 *                            disposition_code=follow_up, last contacted >14 days
 *                            ago (or never), with no pending task
 *
 * Query params:
 *   ?stale_days=N  — days since last_contact_at to consider a lead stale
 *                    for leaking_follow_ups (default: 14, max: 60)
 *   ?limit=N       — max items per bucket (default: 20, max: 50)
 *
 * BOUNDARY RULES:
 *   - Auth via getDialerUser() — dialer auth path
 *   - DB via createDialerClient()
 *   - Reads CRM-owned tables (leads, tasks) — this is an approved read crossing,
 *     identical in character to crm-bridge.ts. This file MUST NOT write to
 *     any CRM table. Write path remains publish-manager.ts exclusively.
 *   - Reads dialer_ai_traces — dialer-owned table
 *   - Reads dialer_events — dialer-owned table
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";

// ─────────────────────────────────────────────────────────────
// Output types
// ─────────────────────────────────────────────────────────────

export interface OverdueTask {
  task_id:    string;
  lead_id:    string | null;
  title:      string;
  due_at:     string;          // ISO — when it was due
  days_overdue: number;
}

export interface DefaultedCallback {
  task_id:    string;
  lead_id:    string | null;
  title:      string;
  due_at:     string;          // ISO — the defaulted due date
  created_at: string;          // ISO — when the task was created (= when the call was published)
}

export interface FlaggedAiOutput {
  run_id:     string;
  session_id: string | null;
  lead_id:    string | null;
  workflow:   string;
  created_at: string;
}

export interface LeakingFollowUp {
  lead_id:            string;
  qualification_route: string | null;
  disposition_code:   string | null;
  last_contact_at:    string | null;   // ISO or null (never contacted)
  days_since_contact: number | null;   // null when never contacted
}

export interface QueueResult {
  generated_at:        string;
  stale_days:          number;
  limit_per_bucket:    number;
  overdue_tasks:       OverdueTask[];
  defaulted_callbacks: DefaultedCallback[];
  flagged_ai:          FlaggedAiOutput[];
  leaking_follow_ups:  LeakingFollowUp[];
}

// ─────────────────────────────────────────────────────────────
// Route
// ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);

  const staleDaysParam = searchParams.get("stale_days");
  let staleDays = 14;
  if (staleDaysParam) {
    const parsed = parseInt(staleDaysParam, 10);
    if (!Number.isNaN(parsed) && parsed > 0) staleDays = Math.min(parsed, 60);
  }

  const limitParam = searchParams.get("limit");
  let limit = 20;
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (!Number.isNaN(parsed) && parsed > 0) limit = Math.min(parsed, 50);
  }

  const now = new Date();
  const staleThreshold = new Date(now.getTime() - staleDays * 86_400_000).toISOString();
  const sb = createDialerClient();

  // ── 1. Overdue tasks ────────────────────────────────────────
  // Pending tasks with due_at in the past whose title matches the dialer
  // naming pattern ("Follow up" or "Appointment"). We match by title prefix
  // to avoid surfacing non-dialer tasks that may share the same table.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: overdueRows, error: overdueErr } = await (sb.from("tasks") as any)
    .select("id, lead_id, title, due_at")
    .eq("status", "pending")
    .lt("due_at", now.toISOString())
    .or("title.ilike.Follow up%,title.ilike.Appointment%")
    .order("due_at", { ascending: true })
    .limit(limit);

  if (overdueErr) {
    console.error("[dialer/queue] overdue_tasks query failed:", overdueErr.message);
  }

  const overdueTasks: OverdueTask[] = (overdueRows ?? []).map(
    (row: { id: string; lead_id: string | null; title: string; due_at: string }) => ({
      task_id:      row.id,
      lead_id:      row.lead_id,
      title:        row.title,
      due_at:       row.due_at,
      days_overdue: Math.floor((now.getTime() - new Date(row.due_at).getTime()) / 86_400_000),
    }),
  );

  // ── 2. Defaulted callbacks ──────────────────────────────────
  // Pull task_ids from follow_up.callback_date_defaulted events (last 90 days),
  // then check which corresponding tasks are still pending.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: defaultedEvents, error: defaultedEventsErr } = await (sb.from("dialer_events") as any)
    .select("payload, created_at")
    .eq("event_type", "follow_up.callback_date_defaulted")
    .gte("created_at", new Date(now.getTime() - 90 * 86_400_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(limit * 3); // over-fetch to account for completed tasks being filtered

  if (defaultedEventsErr) {
    console.error("[dialer/queue] defaulted_callbacks events query failed:", defaultedEventsErr.message);
  }

  const defaultedTaskIds = [
    ...new Set(
      (defaultedEvents ?? [])
        .map((e: { payload: Record<string, unknown> | null }) => e.payload?.task_id as string | undefined)
        .filter((id: string | undefined): id is string => typeof id === "string"),
    ),
  ].slice(0, limit);

  let defaultedCallbacks: DefaultedCallback[] = [];
  if (defaultedTaskIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: defaultedTaskRows, error: defaultedTaskErr } = await (sb.from("tasks") as any)
      .select("id, lead_id, title, due_at, created_at")
      .in("id", defaultedTaskIds)
      .eq("status", "pending");

    if (defaultedTaskErr) {
      console.error("[dialer/queue] defaulted_callbacks tasks query failed:", defaultedTaskErr.message);
    }

    defaultedCallbacks = (defaultedTaskRows ?? []).map(
      (row: { id: string; lead_id: string | null; title: string; due_at: string; created_at: string }) => ({
        task_id:    row.id,
        lead_id:    row.lead_id,
        title:      row.title,
        due_at:     row.due_at,
        created_at: row.created_at,
      }),
    );
  }

  // ── 3. Flagged AI outputs ───────────────────────────────────
  // dialer_ai_traces rows where review_flag = true.
  // These represent outputs Logan explicitly marked as bad.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: flaggedRows, error: flaggedErr } = await (sb.from("dialer_ai_traces") as any)
    .select("run_id, session_id, lead_id, workflow, created_at")
    .eq("review_flag", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (flaggedErr) {
    console.error("[dialer/queue] flagged_ai query failed:", flaggedErr.message);
  }

  const flaggedAi: FlaggedAiOutput[] = (flaggedRows ?? []).map(
    (row: { run_id: string; session_id: string | null; lead_id: string | null; workflow: string; created_at: string }) => ({
      run_id:     row.run_id,
      session_id: row.session_id,
      lead_id:    row.lead_id,
      workflow:   row.workflow,
      created_at: row.created_at,
    }),
  );

  // ── 4. Leaking follow-ups ───────────────────────────────────
  // Leads where:
  //   - qualification_route = 'follow_up' OR disposition_code contains 'follow_up'
  //   - last_contact_at is null OR older than stale_days
  //   - no pending task exists for this lead
  //
  // We do this in two passes to avoid a complex subquery:
  //   Pass A: fetch candidate leads (stale follow_up route)
  //   Pass B: fetch pending task lead_ids for those leads
  //   Diff: leads in A with no corresponding task in B

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: candidateLeads, error: candidateErr } = await (sb.from("leads") as any)
    .select("id, qualification_route, disposition_code, last_contact_at")
    .eq("qualification_route", "follow_up")
    .or(`last_contact_at.is.null,last_contact_at.lt.${staleThreshold}`)
    .order("last_contact_at", { ascending: true, nullsFirst: true })
    .limit(limit * 3); // over-fetch before task filter

  if (candidateErr) {
    console.error("[dialer/queue] leaking_follow_ups candidates query failed:", candidateErr.message);
  }

  let leakingFollowUps: LeakingFollowUp[] = [];

  if ((candidateLeads ?? []).length > 0) {
    const candidateIds = (candidateLeads as Array<{ id: string }>).map((l) => l.id);

    // Find which of these leads already have a pending task
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: activeTasks, error: activeTaskErr } = await (sb.from("tasks") as any)
      .select("lead_id")
      .in("lead_id", candidateIds)
      .eq("status", "pending");

    if (activeTaskErr) {
      console.error("[dialer/queue] leaking_follow_ups active tasks query failed:", activeTaskErr.message);
    }

    const hasActiveTask = new Set(
      (activeTasks ?? []).map((t: { lead_id: string }) => t.lead_id),
    );

    leakingFollowUps = (candidateLeads ?? [])
      .filter((lead: { id: string }) => !hasActiveTask.has(lead.id))
      .slice(0, limit)
      .map((lead: { id: string; qualification_route: string | null; disposition_code: string | null; last_contact_at: string | null }) => ({
        lead_id:             lead.id,
        qualification_route: lead.qualification_route,
        disposition_code:    lead.disposition_code,
        last_contact_at:     lead.last_contact_at,
        days_since_contact:  lead.last_contact_at
          ? Math.floor((now.getTime() - new Date(lead.last_contact_at).getTime()) / 86_400_000)
          : null,
      }));
  }

  const result: QueueResult = {
    generated_at:        now.toISOString(),
    stale_days:          staleDays,
    limit_per_bucket:    limit,
    overdue_tasks:       overdueTasks,
    defaulted_callbacks: defaultedCallbacks,
    flagged_ai:          flaggedAi,
    leaking_follow_ups:  leakingFollowUps,
  };

  return NextResponse.json(result);
}
