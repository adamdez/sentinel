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
import { readEventTaskId } from "@/lib/dialer/dialer-events";
import { unifiedPhoneLookup } from "@/lib/dialer/phone-lookup";

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

export interface MissedInbound {
  event_id:        string;
  lead_id:         string | null;
  from_number:     string;
  missed_at:       string;        // ISO timestamp of the missed call
  minutes_ago:     number;
  task_id:         string | null;
  task_due_at:     string | null;
  task_overdue:    boolean;
  lead_matched:    boolean;
  // routing state — present if this event has been classified
  caller_type:     string | null;   // "seller" | "buyer" | "vendor" | "spam" | "unknown" | null
  routing_action:  string | null;   // routing action from classify event
  is_classified:   boolean;
  source:          "event" | "calls_log_fallback";
  dialed_to_number: string | null;
  route_primary: "logan" | "adam" | null;
  route_secondary: "logan" | "adam" | null;
  route_reason: string | null;
  match_kind: "lead" | "intake" | "unknown";
  owner_name: string | null;
  property_address: string | null;
  lead_source: string | null;
  call_log_id: string | null;
  voice_session_id: string | null;
  voicemail_url: string | null;
  voicemail_duration: number | null;
  jeff_summary: string | null;
  jeff_callback_requested: boolean;
  jeff_callback_time: string | null;
  seller_sms_sent: boolean;
  open_target_type: "lead" | "intake" | "phone_lookup" | null;
  open_target_id: string | null;
  final_state: "voicemail_recorded" | "jeff_message" | "callback_booked" | "hung_up" | "answered_unclassified" | "unresolved";
}

export interface UnclassifiedAnswered {
  event_id:       string;
  lead_id:        string | null;
  from_number:    string;
  answered_at:    string;     // ISO
  minutes_ago:    number;
  lead_matched:   boolean;
}

export interface QueueResult {
  generated_at:            string;
  stale_days:              number;
  limit_per_bucket:        number;
  overdue_tasks:           OverdueTask[];
  defaulted_callbacks:     DefaultedCallback[];
  flagged_ai:              FlaggedAiOutput[];
  leaking_follow_ups:      LeakingFollowUp[];
  missed_inbound:          MissedInbound[];
  unclassified_answered:   UnclassifiedAnswered[];
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
    .select("task_id, payload, created_at")
    .eq("event_type", "follow_up.callback_date_defaulted")
    .gte("created_at", new Date(now.getTime() - 90 * 86_400_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(limit * 3);

  if (defaultedEventsErr) {
    console.error("[dialer/queue] defaulted_callbacks events query failed:", defaultedEventsErr.message);
  }

  const defaultedTaskIds = [
    ...new Set(
      (defaultedEvents ?? [])
        .map((e: { task_id?: string | null; payload?: Record<string, unknown> | null }) =>
          readEventTaskId({ id: "", event_type: "", created_at: "", task_id: e.task_id, payload: e.payload }))
        .filter((id: string | null): id is string => typeof id === "string"),
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

  // ── 5. Missed inbound calls ──────────────────────────────────
  // Surface inbound.missed events that have NOT been recovered or dismissed.
  // Also attach classification state if an inbound.classified event exists.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: missedEvents, error: missedErr } = await (sb.from("dialer_events") as any)
    .select("id, lead_id, task_id, metadata, created_at")
    .eq("event_type", "inbound.missed")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (missedErr) {
    console.error("[dialer/queue] missed_inbound query failed:", missedErr.message);
  }

  let missedInbound: MissedInbound[] = [];

  if ((missedEvents ?? []).length > 0) {
    const missedEventIds = (missedEvents as Array<{ id: string }>).map(e => e.id);

    // Resolved (recovered / dismissed)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: resolvedEvents } = await (sb.from("dialer_events") as any)
      .select("metadata")
      .in("event_type", ["inbound.recovered", "inbound.dismissed"])
      .not("metadata->original_event_id", "is", null);

    const resolvedOriginalIds = new Set(
      (resolvedEvents ?? []).map(
        (e: { metadata: { original_event_id?: string } }) => e.metadata?.original_event_id
      ).filter(Boolean)
    );

    // Classification state
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: classifyEvents } = await (sb.from("dialer_events") as any)
      .select("metadata")
      .eq("event_type", "inbound.classified")
      .in("metadata->original_event_id" as string, missedEventIds);

    // Build a map: original_event_id → { caller_type, routing_action }
    const classifyMap = new Map<string, { caller_type: string; routing_action: string }>();
    for (const ev of (classifyEvents ?? [])) {
      const meta = ev.metadata ?? {};
      if (meta.original_event_id) {
        classifyMap.set(meta.original_event_id as string, {
          caller_type:    (meta.caller_type    as string) ?? "unknown",
          routing_action: (meta.routing_action as string) ?? "",
        });
      }
    }

    missedInbound = (missedEvents ?? [])
      .filter((e: { id: string }) => !resolvedOriginalIds.has(e.id))
      .filter((_: unknown, idx: number) => idx < limit)
      .map((e: { id: string; lead_id: string | null; task_id: string | null; metadata: Record<string, unknown>; created_at: string }) => {
        const meta = e.metadata ?? {};
        const missedAt = (meta.missed_at as string) ?? e.created_at;
        const taskDueAt = (meta.task_due_at as string) ?? null;
        const minutesAgo = Math.floor((now.getTime() - new Date(missedAt).getTime()) / 60_000);
        const classifyInfo = classifyMap.get(e.id) ?? null;
        return {
          event_id:       e.id,
          lead_id:        e.lead_id,
          from_number:    (meta.from_number as string) ?? "unknown",
          missed_at:      missedAt,
          minutes_ago:    minutesAgo,
          task_id:        e.task_id,
          task_due_at:    taskDueAt,
          task_overdue:   taskDueAt ? new Date(taskDueAt) < now : false,
          lead_matched:   !!(meta.lead_matched),
          caller_type:    classifyInfo?.caller_type    ?? null,
          routing_action: classifyInfo?.routing_action ?? null,
          is_classified:  !!classifyInfo,
          source:         "event",
          dialed_to_number: (meta.dialed_to_number as string) ?? null,
          route_primary: ((meta.route_primary as "logan" | "adam" | null) ?? null),
          route_secondary: ((meta.route_secondary as "logan" | "adam" | null) ?? null),
          route_reason: (meta.route_reason as string) ?? null,
          match_kind: e.lead_id ? "lead" : "unknown",
          owner_name: (meta.owner_name as string) ?? null,
          property_address: (meta.property_address as string) ?? null,
          lead_source: null,
          call_log_id: (meta.calls_log_id as string) ?? null,
          voice_session_id: null,
          voicemail_url: null,
          voicemail_duration: null,
          jeff_summary: null,
          jeff_callback_requested: false,
          jeff_callback_time: null,
          seller_sms_sent: false,
          open_target_type: e.lead_id ? "lead" : null,
          open_target_id: e.lead_id,
          final_state: (meta.call_end_reason as string) === "caller_canceled" ? "hung_up" : "unresolved",
        };
      });
  }

  if (missedInbound.length < limit) {
    const fallbackCutoff = new Date(now.getTime() - 2 * 60_000).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: stuckCalls, error: stuckErr } = await (sb.from("calls_log") as any)
      .select("id, lead_id, phone_dialed, twilio_sid, created_at, disposition")
      .eq("direction", "inbound")
      .in("disposition", ["in_progress", "initiating", "ringing_prospect"])
      .lt("created_at", fallbackCutoff)
      .order("created_at", { ascending: false })
      .limit(limit * 2);

    if (stuckErr) {
      console.error("[dialer/queue] stuck inbound fallback query failed:", stuckErr.message);
    } else if ((stuckCalls ?? []).length > 0) {
      const knownIds = new Set(missedInbound.map((item) => item.event_id));
      for (const row of stuckCalls as Array<{
        id: string;
        lead_id: string | null;
        phone_dialed: string | null;
        twilio_sid: string | null;
        created_at: string;
      }>) {
        if (knownIds.has(row.id)) continue;
        missedInbound.push({
          event_id: row.id,
          lead_id: row.lead_id,
          from_number: row.phone_dialed ?? "unknown",
          missed_at: row.created_at,
          minutes_ago: Math.max(0, Math.floor((now.getTime() - new Date(row.created_at).getTime()) / 60_000)),
          task_id: null,
          task_due_at: null,
          task_overdue: false,
          lead_matched: !!row.lead_id,
          caller_type: null,
          routing_action: null,
          is_classified: false,
          source: "calls_log_fallback",
          dialed_to_number: null,
          route_primary: null,
          route_secondary: null,
          route_reason: null,
          match_kind: row.lead_id ? "lead" : "unknown",
          owner_name: null,
          property_address: null,
          lead_source: null,
          call_log_id: row.id,
          voice_session_id: null,
          voicemail_url: null,
          voicemail_duration: null,
          jeff_summary: null,
          jeff_callback_requested: false,
          jeff_callback_time: null,
          seller_sms_sent: false,
          open_target_type: row.lead_id ? "lead" : null,
          open_target_id: row.lead_id,
          final_state: "unresolved",
        });
        if (missedInbound.length >= limit) break;
      }
    }
  }

  // ── 6. Unclassified answered calls ───────────────────────────
  // inbound.answered calls that have no corresponding inbound.classified event.
  // These are answered calls where Logan never logged a caller type — routing leakage.
  // Capped to last 24h to avoid surfacing stale calls.
  if (missedInbound.length > 0) {
    const phoneLookups = await Promise.all(
      missedInbound.map(async (item) => ({
        eventId: item.event_id,
        lookup: item.from_number !== "unknown" ? await unifiedPhoneLookup(item.from_number, sb) : null,
      })),
    );
    const lookupMap = new Map(phoneLookups.map((entry) => [entry.eventId, entry.lookup]));

    const leadIds = [...new Set(
      missedInbound
        .map((item) => item.lead_id ?? lookupMap.get(item.event_id)?.leadId ?? null)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    )];
    const intakeIds = [...new Set(
      phoneLookups
        .map((entry) => entry.lookup?.intakeLeadId ?? null)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    )];
    const phoneNumbers = [...new Set(
      missedInbound
        .map((item) => item.from_number)
        .filter((value) => value !== "unknown"),
    )];
    const callLogIds = [...new Set(
      missedInbound
        .map((item) => item.call_log_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    )];

    let leadSourceMap = new Map<string, string | null>();
    if (leadIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: leadRows } = await (sb.from("leads") as any)
        .select("id, source_category")
        .in("id", leadIds);
      leadSourceMap = new Map((leadRows ?? []).map((row: { id: string; source_category: string | null }) => [row.id, row.source_category ?? null]));
    }

    let intakeSourceMap = new Map<string, string | null>();
    if (intakeIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: intakeRows } = await (sb.from("intake_leads") as any)
        .select("id, source_category")
        .in("id", intakeIds);
      intakeSourceMap = new Map((intakeRows ?? []).map((row: { id: string; source_category: string | null }) => [row.id, row.source_category ?? null]));
    }

    const callLogMap = new Map<string, {
      id: string;
      voicemail_url: string | null;
      voicemail_duration: number | null;
    }>();
    if (callLogIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: callLogRows } = await (sb.from("calls_log") as any)
        .select("id, voicemail_url, voicemail_duration")
        .in("id", callLogIds);
      for (const row of (callLogRows ?? []) as Array<{
        id: string;
        voicemail_url: string | null;
        voicemail_duration: number | null;
      }>) {
        callLogMap.set(row.id, row);
      }
    }

    const jeffByPhone = new Map<string, Array<{
      voice_session_id: string;
      summary: string | null;
      callback_requested: boolean;
      callback_due_at: string | null;
      callback_timing_text: string | null;
      created_at: string;
    }>>();
    if (phoneNumbers.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: jeffRows } = await (sb.from("jeff_interactions") as any)
        .select("voice_session_id, caller_phone, summary, callback_requested, callback_due_at, callback_timing_text, created_at")
        .in("caller_phone", phoneNumbers)
        .gte("created_at", new Date(now.getTime() - 3 * 86_400_000).toISOString())
        .order("created_at", { ascending: false });
      for (const row of (jeffRows ?? []) as Array<{
        voice_session_id: string;
        caller_phone: string | null;
        summary: string | null;
        callback_requested: boolean | null;
        callback_due_at: string | null;
        callback_timing_text: string | null;
        created_at: string;
      }>) {
        if (!row.caller_phone) continue;
        const existing = jeffByPhone.get(row.caller_phone) ?? [];
        existing.push({
          voice_session_id: row.voice_session_id,
          summary: row.summary ?? null,
          callback_requested: Boolean(row.callback_requested),
          callback_due_at: row.callback_due_at ?? null,
          callback_timing_text: row.callback_timing_text ?? null,
          created_at: row.created_at,
        });
        jeffByPhone.set(row.caller_phone, existing);
      }
    }

    const voiceByPhone = new Map<string, Array<{
      id: string;
      summary: string | null;
      callback_requested: boolean;
      created_at: string;
    }>>();
    if (phoneNumbers.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: voiceRows } = await (sb.from("voice_sessions") as any)
        .select("id, from_number, summary, callback_requested, created_at")
        .eq("direction", "inbound")
        .in("from_number", phoneNumbers)
        .gte("created_at", new Date(now.getTime() - 3 * 86_400_000).toISOString())
        .order("created_at", { ascending: false });
      for (const row of (voiceRows ?? []) as Array<{
        id: string;
        from_number: string | null;
        summary: string | null;
        callback_requested: boolean | null;
        created_at: string;
      }>) {
        if (!row.from_number) continue;
        const existing = voiceByPhone.get(row.from_number) ?? [];
        existing.push({
          id: row.id,
          summary: row.summary ?? null,
          callback_requested: Boolean(row.callback_requested),
          created_at: row.created_at,
        });
        voiceByPhone.set(row.from_number, existing);
      }
    }

    const smsByPhone = new Map<string, Array<{ created_at: string }>>();
    if (phoneNumbers.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: smsRows } = await (sb.from("sms_messages") as any)
        .select("phone, created_at")
        .eq("direction", "outbound")
        .in("phone", phoneNumbers)
        .gte("created_at", new Date(now.getTime() - 3 * 86_400_000).toISOString())
        .order("created_at", { ascending: false });
      for (const row of (smsRows ?? []) as Array<{ phone: string | null; created_at: string }>) {
        if (!row.phone) continue;
        const existing = smsByPhone.get(row.phone) ?? [];
        existing.push({ created_at: row.created_at });
        smsByPhone.set(row.phone, existing);
      }
    }

    const pickRelevant = <T extends { created_at: string }>(rows: T[] | undefined, missedAt: string): T | null => {
      if (!rows || rows.length === 0) return null;
      const missedTime = new Date(missedAt).getTime();
      return rows.find((row) => new Date(row.created_at).getTime() >= missedTime - 10 * 60_000) ?? rows[0] ?? null;
    };

    missedInbound = missedInbound.map((item) => {
      const lookup = lookupMap.get(item.event_id) ?? null;
      const effectiveLeadId = item.lead_id ?? lookup?.leadId ?? null;
      const intakeLeadId = lookup?.intakeLeadId ?? null;
      const ownerName = lookup?.ownerName ?? item.owner_name ?? null;
      const propertyAddress = lookup?.propertyAddress ?? item.property_address ?? null;
      const matchKind: MissedInbound["match_kind"] = effectiveLeadId
        ? "lead"
        : intakeLeadId
          ? "intake"
          : "unknown";
      const openTargetType: MissedInbound["open_target_type"] = effectiveLeadId
        ? "lead"
        : intakeLeadId
          ? "intake"
          : lookup?.matchSource
            ? "phone_lookup"
            : null;
      const openTargetId = effectiveLeadId ?? intakeLeadId ?? (openTargetType === "phone_lookup" ? item.from_number : null);
      const callLog = item.call_log_id ? (callLogMap.get(item.call_log_id) ?? null) : null;
      const jeffRecord = pickRelevant(jeffByPhone.get(item.from_number), item.missed_at);
      const voiceRecord = pickRelevant(voiceByPhone.get(item.from_number), item.missed_at);
      const sellerSmsSent = (smsByPhone.get(item.from_number) ?? []).some(
        (row) => new Date(row.created_at).getTime() >= new Date(item.missed_at).getTime(),
      );
      const jeffSummary = jeffRecord?.summary ?? voiceRecord?.summary ?? null;
      const jeffCallbackRequested = Boolean(jeffRecord?.callback_requested ?? voiceRecord?.callback_requested ?? false);
      const jeffCallbackTime = jeffRecord?.callback_timing_text ?? jeffRecord?.callback_due_at ?? null;

      let finalState: MissedInbound["final_state"] = item.final_state;
      if (callLog?.voicemail_url) {
        finalState = "voicemail_recorded";
      } else if (jeffCallbackRequested) {
        finalState = "callback_booked";
      } else if (jeffSummary) {
        finalState = "jeff_message";
      } else if (item.route_reason === "answered_by_jeff_after_browser_miss") {
        finalState = "answered_unclassified";
      }

      return {
        ...item,
        lead_id: effectiveLeadId,
        lead_matched: matchKind === "lead",
        match_kind: matchKind,
        owner_name: ownerName,
        property_address: propertyAddress,
        lead_source: effectiveLeadId
          ? (leadSourceMap.get(effectiveLeadId) ?? null)
          : intakeLeadId
            ? (intakeSourceMap.get(intakeLeadId) ?? null)
            : null,
        call_log_id: callLog?.id ?? item.call_log_id,
        voice_session_id: jeffRecord?.voice_session_id ?? voiceRecord?.id ?? null,
        voicemail_url: callLog?.voicemail_url ?? null,
        voicemail_duration: callLog?.voicemail_duration ?? null,
        jeff_summary: jeffSummary,
        jeff_callback_requested: jeffCallbackRequested,
        jeff_callback_time: jeffCallbackTime,
        seller_sms_sent: sellerSmsSent,
        open_target_type: openTargetType,
        open_target_id: openTargetId,
        final_state: finalState,
      };
    });
  }

  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: answeredEvents, error: answeredErr } = await (sb.from("dialer_events") as any)
    .select("id, lead_id, metadata, created_at")
    .eq("event_type", "inbound.answered")
    .gte("created_at", oneDayAgo)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (answeredErr) {
    console.error("[dialer/queue] unclassified_answered query failed:", answeredErr.message);
  }

  let unclassifiedAnswered: UnclassifiedAnswered[] = [];

  if ((answeredEvents ?? []).length > 0) {
    const answeredEventIds = (answeredEvents as Array<{ id: string }>).map(e => e.id);

    // Find which have been classified
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: classifiedRefs } = await (sb.from("dialer_events") as any)
      .select("metadata->original_event_id")
      .eq("event_type", "inbound.classified")
      .in("metadata->original_event_id" as string, answeredEventIds);

    const classifiedIds = new Set(
      (classifiedRefs ?? []).map(
        (r: { original_event_id?: string }) => r.original_event_id
      ).filter(Boolean)
    );

    unclassifiedAnswered = (answeredEvents ?? [])
      .filter((e: { id: string }) => !classifiedIds.has(e.id))
      .slice(0, limit)
      .map((e: { id: string; lead_id: string | null; metadata: Record<string, unknown>; created_at: string }) => {
        const meta = e.metadata ?? {};
        const answeredAt = (meta.answered_at as string) ?? e.created_at;
        return {
          event_id:    e.id,
          lead_id:     e.lead_id,
          from_number: (meta.from_number as string) ?? "unknown",
          answered_at: answeredAt,
          minutes_ago: Math.floor((now.getTime() - new Date(answeredAt).getTime()) / 60_000),
          lead_matched: !!(meta.lead_matched),
        };
      });
  }

  const result: QueueResult = {
    generated_at:          now.toISOString(),
    stale_days:            staleDays,
    limit_per_bucket:      limit,
    overdue_tasks:         overdueTasks,
    defaulted_callbacks:   defaultedCallbacks,
    flagged_ai:            flaggedAi,
    leaking_follow_ups:    leakingFollowUps,
    missed_inbound:        missedInbound,
    unclassified_answered: unclassifiedAnswered,
  };

  return NextResponse.json(result);
}
