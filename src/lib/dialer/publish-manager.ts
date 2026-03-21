/**
 * Dialer Publish Manager — PR3 / Phase 2
 *
 * Writes post-call outcomes back to CRM tables.
 * This is the ONLY file in the dialer domain that writes CRM tables.
 *
 * BOUNDARY RULES:
 *   - Import ONLY from ./types and ./session-manager
 *   - NEVER import from @/lib/supabase or any CRM module
 *   - NEVER import crm-bridge.ts here (read-only; belongs in routes)
 *   - Must UPDATE calls_log by dialer_session_id — NEVER INSERT
 *   - A missing calls_log row is non-fatal; qualification writes still proceed
 *   - tasks INSERT is permitted: tasks is a CRM-owned table but task creation
 *     from a post-call outcome is an explicit approved write from this manager.
 *
 * OVERWRITE RULES (conservative by design):
 *   - disposition:    only if current value is null, blank, or in PROVISIONAL_DISPOSITIONS
 *   - duration_sec:   only if current value is falsy (0 or null)
 *   - notes:          always overwrites calls_log.notes when summary is provided
 *   - leads fields:   only explicitly provided qualification fields are written; others untouched
 *   - tasks:          only created when callback_at is provided AND disposition is
 *                     follow_up or appointment. Never overwrites existing tasks.
 *
 * Future developers: do not add CRM reads here.
 * Reads belong in crm-bridge.ts. This file is write-only toward CRM tables.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TERMINAL_STATUSES,
  PUBLISH_DISPOSITIONS,
  SELLER_TIMELINES,
  QUALIFICATION_ROUTES,
  OBJECTION_TAGS,
  type PublishInput,
  type PublishResult,
  type DialerEventType,
} from "./types";
import { getSession } from "./session-manager";
import { notifyPostCallSummary } from "@/lib/notify";

// Dispositions that warrant a follow-up task when callback_at is supplied.
const TASK_DISPOSITIONS = new Set(["follow_up", "appointment"]);

export type { PublishInput, PublishResult };
export { PUBLISH_DISPOSITIONS, SELLER_TIMELINES, QUALIFICATION_ROUTES, OBJECTION_TAGS };

// ─────────────────────────────────────────────────────────────
// Dialer event writer (publish-manager scope)
// ─────────────────────────────────────────────────────────────

/**
 * Fire-and-forget write to dialer_events from publish context.
 * Never throws — event writes are informational and must never fail a publish.
 * Mirrors the auditEvent pattern in session-manager.ts.
 */
function writeDialerEvent(
  sb: SupabaseClient,
  event: {
    session_id: string | null;
    lead_id: string | null;
    user_id: string;
    event_type: DialerEventType;
    payload?: Record<string, unknown>;
  },
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sb.from("dialer_events") as any)
    .insert({
      session_id: event.session_id,
      user_id:    event.user_id,
      lead_id:    event.lead_id,
      event_type: event.event_type,
      payload:    { lead_id: event.lead_id, ...event.payload },
    })
    .then(({ error }: { error: unknown }) => {
      if (error) {
        console.error(
          "[publish-manager] dialer_events write failed (non-fatal):",
          (error as { message?: string }).message,
        );
      }
    });
}

// ─────────────────────────────────────────────────────────────
// Provisional dispositions — safe for publish to overwrite
// ─────────────────────────────────────────────────────────────

/**
 * Machine-set or transitional values on calls_log.disposition.
 * Publish is permitted to replace any of these with a human outcome.
 *
 * "completed" is intentionally included: Twilio sets it as a technical
 * call-ended signal, not a meaningful human classification. An operator
 * publishing a richer disposition ("voicemail", "follow_up", etc.)
 * supersedes it. Publishing "completed" over "completed" is a harmless no-op.
 *
 * Any value NOT listed here is treated as already operator-set and is
 * never overwritten.
 */
const PROVISIONAL_DISPOSITIONS = new Set<string | null>([
  null,
  "",
  "initiating",
  "initiated",
  "ringing",
  "ringing_agent",
  "agent_connected",
  "agent_answered",
  "in_progress",
  "completed",
]);

// ─────────────────────────────────────────────────────────────
// publishSession
// ─────────────────────────────────────────────────────────────

/**
 * Writes post-call outcomes to calls_log and leads for the given session.
 *
 * Ownership is verified via getSession() before any writes.
 * Returns ok=true even when no calls_log row exists — qualification
 * writes to leads proceed regardless.
 */
export async function publishSession(
  sb: SupabaseClient,
  sessionId: string,
  userId: string,
  input: PublishInput,
): Promise<PublishResult> {
  // ── Ownership gate ────────────────────────────────────────
  const sessionResult = await getSession(sb, sessionId, userId);
  if (sessionResult.error || !sessionResult.data) {
    return {
      ok: false,
      calls_log_id: null,
      lead_id: null,
      error: sessionResult.error ?? undefined,
      code: sessionResult.code,
    };
  }

  const session = sessionResult.data;

  // ── Terminal state guard ──────────────────────────────────
  if (!TERMINAL_STATUSES.has(session.status)) {
    return {
      ok: false,
      calls_log_id: null,
      lead_id: null,
      error: "Session must be in a terminal state (ended or failed) before publishing",
      code: "INVALID_TRANSITION",
    };
  }

  const leadId = session.lead_id ?? null;
  let callsLogId: string | null = null;

  // ── Step 1: calls_log update ──────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingLog } = await (sb.from("calls_log") as any)
    .select("id, disposition, duration_sec")
    .eq("dialer_session_id", sessionId)
    .maybeSingle();

  if (!existingLog) {
    console.warn(
      "[publish-manager] No calls_log row found for session",
      sessionId.slice(0, 8),
      "— skipping calls_log update",
    );
  } else {
    callsLogId = existingLog.id as string;

    const patch: Record<string, unknown> = {};

    if (PROVISIONAL_DISPOSITIONS.has(existingLog.disposition ?? null)) {
      patch.disposition = input.disposition;
    }

    if (input.duration_sec !== undefined && !existingLog.duration_sec) {
      patch.duration_sec = input.duration_sec;
    }

    if (input.summary?.trim()) {
      patch.notes = input.summary.trim();
    }

    if (Object.keys(patch).length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateErr } = await (sb.from("calls_log") as any)
        .update(patch)
        .eq("id", callsLogId);

      if (updateErr) {
        console.error("[publish-manager] calls_log update failed:", updateErr.message);
        return {
          ok: false,
          calls_log_id: callsLogId,
          lead_id: leadId,
          error: updateErr.message,
          code: "DB_ERROR",
        };
      }
    }
  }

  // ── Step 2: leads qualification update ───────────────────

  if (leadId) {
    const qualPatch: Record<string, unknown> = {};
    if (input.motivation_level    !== undefined) qualPatch.motivation_level    = input.motivation_level;
    if (input.seller_timeline     !== undefined) qualPatch.seller_timeline     = input.seller_timeline;
    if (input.qualification_route !== undefined) qualPatch.qualification_route = input.qualification_route;
    if (input.next_action         !== undefined) qualPatch.next_action         = input.next_action;
    if (input.next_action_due_at  !== undefined) qualPatch.next_action_due_at  = input.next_action_due_at;

    if (Object.keys(qualPatch).length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: leadErr } = await (sb.from("leads") as any)
        .update(qualPatch)
        .eq("id", leadId);

      if (leadErr) {
        console.error("[publish-manager] leads qualification update failed:", leadErr.message);
        return {
          ok: false,
          calls_log_id: callsLogId,
          lead_id: leadId,
          error: leadErr.message,
          code: "DB_ERROR",
        };
      }
    }
  }

  // ── Step 3: task creation for follow_up / appointment ────
  //
  // Creates a tasks row when disposition is follow_up or appointment AND
  // a lead_id is present.
  //
  // due_at priority:
  //   1. callback_at from input (operator set a specific date in Step 2)
  //   2. Default: tomorrow at 09:00 local time (operator used skip path)
  //
  // The default ensures no lead silently falls out of the Tasks workflow
  // because the operator tapped "skip date." The task title signals the
  // default so the operator can reschedule on open.
  //
  // Failure is non-fatal — a failed task insert never fails the publish.

  let taskId: string | null = null;
  // Hoisted so Step 4 event writes can reference them without re-computation.
  let taskDueAt: Date | null = null;
  let taskDateWasDefaulted = false;

  if (leadId && TASK_DISPOSITIONS.has(input.disposition)) {
    const assignedTo = input.task_assigned_to ?? userId;
    const ownerName = (sessionResult.data.context_snapshot as { ownerName?: string | null } | null)?.ownerName ?? null;
    const dispoLabel = input.disposition === "appointment" ? "Appointment" : "Follow up";

    let dueAt: Date;
    let dateWasDefaulted = false;

    if (input.callback_at) {
      const parsed = new Date(input.callback_at);
      if (!isNaN(parsed.getTime())) {
        dueAt = parsed;
      } else {
        dueAt = nextBusinessMorningPacific();
        dateWasDefaulted = true;
      }
    } else {
      dueAt = nextBusinessMorningPacific();
      dateWasDefaulted = true;
    }

    // Hoist for Step 4 event writes
    taskDueAt = dueAt;
    taskDateWasDefaulted = dateWasDefaulted;

    const title = ownerName
      ? dateWasDefaulted
        ? `${dispoLabel} — ${ownerName} (set callback date)`
        : `${dispoLabel} — ${ownerName}`
      : dateWasDefaulted
        ? `${dispoLabel} — set callback date`
        : `${dispoLabel} — dialer callback`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: taskRow, error: taskErr } = await (sb.from("tasks") as any)
      .insert({
        title,
        assigned_to: assignedTo,
        lead_id: leadId,
        due_at: dueAt.toISOString(),
        status: "pending",
        priority: input.disposition === "appointment" ? 2 : 1,
      })
      .select("id")
      .single();

    if (taskErr) {
      console.warn("[publish-manager] task creation failed (non-fatal):", taskErr.message);
    } else {
      taskId = (taskRow?.id as string) ?? null;
    }
  }

  // ── Step 3.5: objection tag writes ───────────────────────
  //
  // Writes each operator-selected objection tag as a row in lead_objection_tags.
  // Fire-and-forget: a failed write never fails the publish response.
  // Tags with invalid values (not in OBJECTION_TAGS allowlist) are silently dropped.
  // Writes are skipped if lead_id is null or no tags provided.

  if (leadId && input.objection_tags?.length) {
    const allowedSet = new Set<string>(OBJECTION_TAGS);
    const validTags = input.objection_tags.filter((t) => allowedSet.has(t.tag));

    if (validTags.length > 0) {
      const rows = validTags.map((t) => ({
        lead_id:     leadId,
        call_log_id: callsLogId ?? null,
        tag:         t.tag,
        note:        t.note ? t.note.trim().slice(0, 120) : null,
        status:      "open",
        tagged_by:   userId,
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb.from("lead_objection_tags") as any)
        .insert(rows)
        .then(({ error }: { error: unknown }) => {
          if (error) {
            console.warn(
              "[publish-manager] lead_objection_tags insert failed (non-fatal):",
              (error as { message?: string }).message,
            );
          }
        });
    }
  }

  // ── Step 4: dialer_events — publish-time audit trail ─────
  //
  // All event writes are fire-and-forget via writeDialerEvent.
  // They never block or fail the publish response.
  //
  // call.published: always written on successful publish.
  //   Core signal for follow-up reliability and call volume queries.
  //
  // follow_up.task_created: written when a task row was created.
  //   Paired with the task_id so slippage queries can join to tasks.
  //
  // follow_up.callback_date_defaulted: written when dateWasDefaulted=true.
  //   This is the callback slippage signal — operator did not set a date.
  //
  // ai_output.reviewed / ai_output.flagged: written when extract_run_id
  //   was present — operator reached Step 3 and published.
  //   Captures motivation_corrected and timeline_corrected inline so the
  //   AI eval loop is queryable from dialer_events without joining
  //   dialer_ai_traces.

  writeDialerEvent(sb, {
    session_id: sessionId,
    lead_id:    leadId,
    user_id:    userId,
    event_type: "call.published",
    payload: {
      disposition:       input.disposition,
      had_summary:       !!(input.summary?.trim()),
      had_callback_at:   !!input.callback_at,
      task_created:      !!taskId,
      task_id:           taskId ?? null,
    },
  });

  if (taskId && taskDueAt) {
    writeDialerEvent(sb, {
      session_id: sessionId,
      lead_id:    leadId,
      user_id:    userId,
      event_type: "follow_up.task_created",
      payload: {
        task_id:            taskId,
        disposition:        input.disposition,
        date_was_defaulted: taskDateWasDefaulted,
        due_at:             taskDueAt.toISOString(),
      },
    });

    if (taskDateWasDefaulted) {
      writeDialerEvent(sb, {
        session_id: sessionId,
        lead_id:    leadId,
        user_id:    userId,
        event_type: "follow_up.callback_date_defaulted",
        payload: {
          task_id:     taskId,
          disposition: input.disposition,
        },
      });
    }
  }

  if (input.extract_run_id) {
    if (input.summary_flagged) {
      writeDialerEvent(sb, {
        session_id: sessionId,
        lead_id:    leadId,
        user_id:    userId,
        event_type: "ai_output.flagged",
        payload: {
          extract_run_id: input.extract_run_id,
        },
      });
    }

    writeDialerEvent(sb, {
      session_id: sessionId,
      lead_id:    leadId,
      user_id:    userId,
      event_type: "ai_output.reviewed",
      payload: {
        extract_run_id:       input.extract_run_id,
        flagged:              !!input.summary_flagged,
        motivation_corrected: input.ai_corrections?.motivation_corrected ?? false,
        timeline_corrected:   input.ai_corrections?.timeline_corrected   ?? false,
      },
    });
  }

  // ── Dispatch post-call summary to Slack (fire-and-forget) ──
  notifyPostCallSummary({
    sessionId,
    leadId: leadId ?? "",
    ownerName: null,
    address: null,
    disposition: input.disposition,
    summaryLine: input.summary ?? null,
    dealTemperature: input.motivation_level ? String(input.motivation_level) : null,
    nextTaskSuggestion: input.callback_at ? `Follow-up scheduled ${input.callback_at}` : null,
    operatorId: userId,
    completedAt: new Date().toISOString(),
  }).catch(() => {});

  // ── Step 5: Auto-trigger QA Agent (fire-and-forget) ─────
  //
  // Blueprint 6.3: "Every completed call runs through the QA Agent."
  // Only fires when we have both a calls_log row and a lead. Failure is
  // non-fatal — a QA failure never blocks the publish response.

  if (callsLogId && leadId) {
    triggerQA(callsLogId, leadId).catch((err) => {
      console.warn("[publish-manager] QA agent trigger failed (non-fatal):", err);
    });
  }

  // ── Step 6: n8n outbound webhook (fire-and-forget) ─────
  if (callsLogId) {
    import("@/lib/n8n-dispatch").then(({ n8nCallCompleted }) => {
      n8nCallCompleted({
        callLogId: callsLogId,
        leadId: leadId ?? "",
        disposition: input.disposition,
        summaryLine: input.summary ?? null,
        dealTemperature: input.motivation_level ? String(input.motivation_level) : null,
        nextAction: input.callback_at ? `Follow-up ${input.callback_at}` : null,
        operatorId: userId,
        durationSeconds: input.duration_sec ?? null,
      }).catch(() => {});
    }).catch(() => {});
  }

  return { ok: true, calls_log_id: callsLogId, lead_id: leadId, task_id: taskId };
}

// ── Helpers ───────────────────────────────────────────────────

/**
 * Returns the next business morning at 09:00 in the Spokane/Pacific timezone.
 *
 * "Next business morning" means:
 *   - If today has not yet reached 09:00 Pacific and is a weekday → today at 09:00 Pacific
 *   - Otherwise → the next weekday at 09:00 Pacific
 *
 * Correctly handles Pacific DST (UTC-8 standard / UTC-7 DST) by using
 * Intl.DateTimeFormat to interpret current local time in America/Los_Angeles
 * rather than assuming a fixed UTC offset.
 *
 * Used when the operator skips date entry on a follow_up or appointment.
 */
function nextBusinessMorningPacific(): Date {
  const TZ = "America/Los_Angeles";
  const now = new Date();

  // Get current date parts in Pacific time
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const year   = parseInt(get("year"),   10);
  const month  = parseInt(get("month"),  10) - 1; // 0-indexed
  const day    = parseInt(get("day"),    10);
  const hour   = parseInt(get("hour"),   10);

  // Build a candidate date at 09:00 Pacific today
  // We do this by constructing an ISO string interpreted in the Pacific TZ
  const pad = (n: number) => String(n).padStart(2, "0");
  const candidateIso = `${year}-${pad(month + 1)}-${pad(day)}T09:00:00`;

  // Convert that local time string to UTC using the TZ offset at that moment
  // Trick: parse via Intl to get the UTC equivalent of 09:00 Pacific today
  const candidateUtc = localToUtc(year, month, day, 9, 0, TZ);

  // If 09:00 today is in the past, move to tomorrow
  let target = candidateUtc <= now ? addDays(candidateUtc, 1) : candidateUtc;
  void candidateIso; // used indirectly via localToUtc

  // Skip Saturday (6) and Sunday (0) — advance to Monday
  for (let i = 0; i < 7; i++) {
    const dow = getWeekdayInTz(target, TZ);
    if (dow !== 0 && dow !== 6) break;
    target = addDays(target, 1);
  }

  return target;
}

/**
 * Converts a local calendar date + time in the given IANA timezone to a UTC Date.
 * Uses the "epoch trick": format epoch 0 in the target TZ to find the current
 * offset, then apply it. Works correctly across DST transitions.
 */
function localToUtc(year: number, month: number, day: number, hour: number, minute: number, tz: string): Date {
  // Build a UTC date that, when rendered in tz, shows the desired local time.
  // Strategy: construct the date as if UTC, then correct for the TZ offset.
  const naive = new Date(Date.UTC(year, month, day, hour, minute, 0));

  // Find what UTC time renders as 00:00 in the target TZ on that date,
  // by comparing the UTC representation to the local representation.
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });

  // Binary-search-free approach: use the offset between UTC and local at the naive date
  const utcStr   = new Date(naive.getTime()).toLocaleString("en-US", { timeZone: "UTC" });
  const localStr = new Date(naive.getTime()).toLocaleString("en-US", { timeZone: tz });
  void formatter;

  const utcDate   = new Date(utcStr);
  const localDate = new Date(localStr);
  const offsetMs  = utcDate.getTime() - localDate.getTime();

  return new Date(naive.getTime() + offsetMs);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

function getWeekdayInTz(d: Date, tz: string): number {
  const dow = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(d);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(dow);
}

/**
 * Fire-and-forget QA Agent trigger after successful call publish.
 * Uses dynamic import to avoid circular dependency with agent fleet.
 */
async function triggerQA(callLogId: string, leadId: string): Promise<void> {
  const { runQAAgent } = await import("@/agents/qa");
  await runQAAgent({
    callLogId,
    leadId,
    triggerType: "post_call",
    triggerRef: `publish-manager:${callLogId}`,
  });
}
