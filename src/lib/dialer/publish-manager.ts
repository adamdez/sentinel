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
  type CallSessionStatus,
} from "./types";
import { getSession } from "./session-manager";
import { notifyPostCallSummary } from "@/lib/notify";
import { trackedDelivery } from "@/lib/delivery-tracker";

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
  // If session is still initiating/active but the operator is trying to publish,
  // auto-end it. The call has ended on the phone side — the status webhook
  // may have failed (old URL, TwiML error, network issue). Don't block the operator.
  if (!TERMINAL_STATUSES.has(session.status)) {
    console.warn(`[publish-manager] Session ${session.id} still in "${session.status}" — auto-ending for publish`);
    // The DB trigger enforces valid transitions. "initiating" can only go to
    // ringing/connected/failed — NOT directly to "ended". Use "failed" as a
    // catch-all terminal state when the session never properly connected.
    const targetStatus = session.status === "initiating" ? "failed" : "ended";
    const { error: endErr } = await (sb
      .from("call_sessions") as ReturnType<typeof sb.from>)
      .update({ status: targetStatus, ended_at: new Date().toISOString() })
      .eq("id", session.id);
    if (endErr) {
      console.error("[publish-manager] Failed to auto-end session:", endErr);
      // Last resort: try "failed" which is valid from any non-terminal state
      const { error: failErr } = await (sb
        .from("call_sessions") as ReturnType<typeof sb.from>)
        .update({ status: "failed", ended_at: new Date().toISOString() })
        .eq("id", session.id);
      if (failErr) {
        // Race condition: Twilio webhook may have already moved the session
        // to a terminal state between our read and update. Re-read to check.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: recheck } = await (sb.from("call_sessions") as any)
          .select("status")
          .eq("id", session.id)
          .maybeSingle();
        if (recheck && TERMINAL_STATUSES.has(recheck.status as CallSessionStatus)) {
          // Session is already terminal — proceed with publish
          console.info(`[publish-manager] Session ${session.id} already "${recheck.status}" after race — proceeding`);
          session.status = recheck.status as typeof session.status;
        } else {
          console.error("[publish-manager] Even 'failed' transition rejected:", failErr);
          return {
            ok: false,
            calls_log_id: null,
            lead_id: null,
            error: "Session must be in a terminal state (ended or failed) before publishing",
            code: "INVALID_TRANSITION",
          };
        }
      }
    }
    if (!TERMINAL_STATUSES.has(session.status)) {
      session.status = targetStatus as typeof session.status;
    }
  }

  const leadId = session.lead_id ?? null;
  let callsLogId: string | null = null;
  const warnings: string[] = [];

  // ── Step 1: calls_log update ──────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingLog } = await (sb.from("calls_log") as any)
    .select("id, disposition, duration_sec, phone_dialed")
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

  // ── Step 1.5: lead_phones call tracking ──────────────────
  //
  // Update the lead_phones row for the dialed number so the dialer
  // knows which phones have been attempted and can cycle to the next.

  if (leadId && existingLog?.phone_dialed) {
    const dialedNormalized = (existingLog.phone_dialed as string).replace(/\D/g, "").slice(-10);
    try {
      await sb.rpc("increment_lead_phone_call_count", {
        p_lead_id: leadId,
        p_phone_suffix: dialedNormalized,
      });
    } catch (phoneTrackErr) {
      console.warn("[publish-manager] lead_phones tracking failed (non-fatal):", phoneTrackErr);
      warnings.push("phone_tracking_failed");
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
    if (input.qual_confirmed) {
      const qc = input.qual_confirmed;
      if (qc.decision_maker_confirmed !== undefined) qualPatch.decision_maker_confirmed = qc.decision_maker_confirmed;
      if (qc.condition_level          !== undefined) qualPatch.condition_level          = qc.condition_level;
      if (qc.occupancy_score          !== undefined) qualPatch.occupancy_score          = qc.occupancy_score;
    }

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

    // Bidirectional sync: if next_action was set, upsert a task row
    if (input.next_action) {
      try {
        const { syncLeadToTask } = await import("@/lib/task-lead-sync");
        await syncLeadToTask(
          sb,
          leadId,
          input.next_action,
          input.next_action_due_at ?? null,
          userId,
          "follow_up",
        );
      } catch (syncErr) {
        console.error("[publish-manager] task-lead-sync failed (non-fatal):", syncErr);
        warnings.push("task_sync_failed");
      }
    }
  }

  // ── Step 2.5: auto-disqualify on terminal dispositions ───
  //
  // "not_interested" / "disqualified" → moves lead to nurture (recyclable, may re-engage)
  // "dead_lead"                       → moves lead to dead (archived, effectively gone)
  //
  // Both are backward moves in the state machine, so next_action is not
  // enforced by guardrails. We set a default next_action for audit purposes.

  if (leadId && ["not_interested", "disqualified", "dead_lead"].includes(input.disposition)) {
    const targetStatus = input.disposition === "dead_lead" ? "dead" : "nurture";
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: currentLead } = await (sb.from("leads") as any)
        .select("status, lock_version")
        .eq("id", leadId)
        .single();

      if (currentLead && !["nurture", "dead", "closed"].includes(currentLead.status as string)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("leads") as any)
          .update({
            status: targetStatus,
            lock_version: (currentLead.lock_version as number) + 1,
            next_action: input.next_action || (() => {
              const snap = sessionResult.data.context_snapshot as { ownerName?: string | null; address?: string | null } | null;
              const who = snap?.ownerName ?? snap?.address ?? "";
              const suffix = who ? ` — ${who}` : "";
              return targetStatus === "nurture"
                ? `Nurture check-in${suffix}`
                : `Dead — archived from dialer${suffix}`;
            })(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", leadId)
          .eq("lock_version", currentLead.lock_version);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("event_log") as any).insert({
          user_id: userId,
          action: `lead.auto_${targetStatus}`,
          entity_type: "lead",
          entity_id: leadId,
          details: {
            from: currentLead.status,
            to: targetStatus,
            trigger: "dialer_disposition",
            disposition: input.disposition,
          },
        });
      }
    } catch (dqErr) {
      console.error("[publish-manager] auto-disqualify failed (non-fatal):", dqErr);
      warnings.push("auto_disqualify_failed");
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
    const snapshot = sessionResult.data.context_snapshot as { ownerName?: string | null; address?: string | null } | null;
    const ownerName = snapshot?.ownerName ?? null;
    const address = snapshot?.address ?? null;
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

    const leadLabel = ownerName
      ? address ? `${ownerName}, ${address}` : ownerName
      : address ?? "dialer callback";
    const title = dateWasDefaulted
      ? `${dispoLabel} — ${leadLabel} (set callback date)`
      : `${dispoLabel} — ${leadLabel}`;

    const taskPayload = {
      title,
      assigned_to: assignedTo,
      lead_id: leadId,
      due_at: dueAt.toISOString(),
      status: "pending",
      priority: input.disposition === "appointment" ? 2 : 1,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: taskRow, error: taskErr } = await (sb.from("tasks") as any)
      .insert(taskPayload)
      .select("id")
      .single();

    if (taskErr) {
      console.error("[publish-manager] task creation failed, retrying:", taskErr.message);
      // Retry once — a dropped task means a lead silently exits the pipeline
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: retryRow, error: retryErr } = await (sb.from("tasks") as any)
        .insert(taskPayload)
        .select("id")
        .single();

      if (retryErr) {
        console.error("[publish-manager] task creation retry failed:", retryErr.message);
        warnings.push("task_creation_failed");
      } else {
        taskId = (retryRow?.id as string) ?? null;
      }
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

  // ── Step 3.6: distress signals discovered on the call ────
  //
  // Writes operator-confirmed distress signals to distress_events table.
  // These feed the scoring engine — writing here triggers the score to
  // actually reflect what Logan learned on the call.
  // Source is "operator_call" with severity 7 (operator-confirmed = high confidence).

  if (leadId && input.distress_signals?.length) {
    // Look up the property_id for this lead
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: leadRow } = await (sb.from("leads") as any)
      .select("property_id")
      .eq("id", leadId)
      .single();

    const propertyId = leadRow?.property_id;
    if (propertyId) {
      const validTypes = new Set([
        "probate", "pre_foreclosure", "tax_lien", "code_violation",
        "vacant", "divorce", "bankruptcy", "fsbo", "absentee", "inherited",
        "water_shutoff", "condemned",
      ]);
      const validSignals = input.distress_signals.filter((s) => validTypes.has(s));

      if (validSignals.length > 0) {
        const rows = validSignals.map((signal) => ({
          property_id: propertyId,
          event_type: signal,
          source: "operator_call",
          severity: 7,
          fingerprint: `operator_call_${propertyId}_${signal}_${new Date().toISOString().slice(0, 10)}`,
          raw_data: { noted_by: userId, call_log_id: callsLogId },
          confidence: 0.95,
        }));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: distressErr } = await (sb.from("distress_events") as any)
          .upsert(rows, { onConflict: "fingerprint", ignoreDuplicates: true });

        if (distressErr) {
          console.warn("[publish-manager] distress_events insert failed (non-fatal):", distressErr.message);
        } else {
          // Trigger immediate score recompute for this lead
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: distressRows } = await (sb.from("distress_events") as any)
              .select("severity")
              .eq("property_id", propertyId)
              .order("created_at", { ascending: false })
              .limit(10);

            if (distressRows && distressRows.length > 0) {
              const avgSev = distressRows.reduce(
                (s: number, e: { severity: number }) => s + (e.severity ?? 0), 0,
              ) / distressRows.length;
              const distressBoost = Math.min(Math.round(avgSev * 4), 40);
              const basePriority = Math.min(distressBoost + (validSignals.length * 5), 95);

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (sb.from("leads") as any)
                .update({
                  priority: basePriority,
                  scores_updated_at: new Date().toISOString(),
                })
                .eq("id", leadId);
            }
          } catch (scoreErr) {
            console.warn("[publish-manager] score recompute failed (non-fatal):", scoreErr);
          }
        }
      }
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

  // ── Dispatch post-call summary to Slack (tracked delivery) ──
  trackedDelivery(
    { channel: "slack", eventType: "post_call_summary", entityType: "call", entityId: callsLogId ?? undefined },
    async () => { await notifyPostCallSummary({
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
    }); },
  );

  // ── Step 5: Auto-trigger QA Agent (tracked delivery) ─────
  //
  // Blueprint 6.3: "Every completed call runs through the QA Agent."
  // Only fires when we have both a calls_log row and a lead. Failure is
  // non-fatal — a QA failure never blocks the publish response.

  if (callsLogId && leadId) {
    trackedDelivery(
      { channel: "internal", eventType: "qa_trigger", entityType: "call", entityId: callsLogId },
      () => triggerQA(callsLogId, leadId),
    );
  }

  // ── Step 6: n8n outbound webhook (tracked via n8n-dispatch) ─────
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
      });
    }).catch(() => {});
  }

  return {
    ok: true,
    calls_log_id: callsLogId,
    lead_id: leadId,
    task_id: taskId,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
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
