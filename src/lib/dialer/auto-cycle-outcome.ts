/**
 * Shared auto-cycle outcome processing.
 *
 * Extracted from POST /api/dialer/v1/auto-cycle/outcome/route.ts so the
 * Vapi webhook can also call it when Jeff finishes an outbound call.
 *
 * The route.ts becomes a thin auth wrapper that delegates here.
 * The webhook calls this directly with source="webhook".
 */

import { createClient } from "@supabase/supabase-js";
import {
  buildAutoCycleNextRoundDueAt,
  buildAutoCycleThirtyDayFollowUpDueAt,
  deriveLeadCycleState,
  isAutoCycleLeadExitDisposition,
  isAutoCycleManualHoldDisposition,
  isLeadStatusEligibleForAutoCycle,
  normalizePhoneForCompare,
  pickAutoCyclePhoneIdByPosition,
  planNextAutoCyclePhoneCall,
  shouldStopAutoCycleForNoResponseRound,
  type AutoCycleLeadRowLike,
  type AutoCyclePhoneRowLike,
} from "./auto-cycle";
import type { PublishDisposition } from "./types";
import { evictFromDialQueueIfAutoCycleStatusStopsImmediateWork } from "@/lib/dial-queue";

// ── Disposition translation: Vapi → Auto-cycle ─────────────────────

/**
 * Maps a Vapi calls_log disposition to the auto-cycle vocabulary.
 *
 * CRITICAL: This must NEVER return null for a connected Vapi call.
 * Returning null means the auto-cycle phone never advances, causing
 * infinite redial (the 2,420-call bug). Every call that reaches Vapi
 * and gets an end-of-call-report MUST advance the cycle.
 *
 * @param durationSeconds — if provided, used to distinguish real conversations
 *   from quick hangups. A "completed" call with >30s duration was a real convo
 *   and should exit the cycle (follow_up), not continue through the no-answer path.
 */
export function mapVapiDispositionToAutoCycle(
  disposition: string,
  durationSeconds?: number | null,
): PublishDisposition {
  switch (disposition) {
    case "transferred":  return "follow_up";       // live answer → operator takes over
    case "no_answer":    return "no_answer";        // advance phone attempt
    case "voicemail":    return "voicemail";         // advance phone attempt
    case "completed": {
      // Real conversation (>30s) = follow_up (exit cycle, Logan takes over)
      // Quick hangup (<30s) = no_answer (advance the file through today's pass)
      if (durationSeconds != null && durationSeconds > 30) return "follow_up";
      return "no_answer";
    }
    case "ai_ended":     return "not_interested";    // Jeff screened out, exit
    case "error":        return "no_answer";         // API/pipeline error — advance the file, don't loop
    case "sip_failed":   return "dead_phone";        // SIP failed to connect — mark phone dead
    case "spam":         return "disqualified";      // spam caller, exit lead
    default:             return "no_answer";          // unknown → advance cycle, don't loop
  }
}

// ── Supabase client for webhook context ─────────────────────────────

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ── Live-answer dispositions (increment live_answers counter) ───────

const LIVE_ANSWER_DISPOSITIONS = new Set<PublishDisposition>([
  "completed",
  "not_interested",
  "wrong_number",
  "do_not_call",
  "follow_up",
  "appointment",
  "offer_made",
]);

// ── Core outcome processor ──────────────────────────────────────────

export interface AutoCycleOutcomeParams {
  leadId: string;
  disposition: PublishDisposition;
  phoneNumber?: string | null;
  /** "operator" applies user_id filter; "webhook" skips it (unique lead_id constraint is safe) */
  source: "operator" | "webhook";
  /** Required when source is "operator" */
  userId?: string;
}

export interface AutoCycleOutcomeResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  cycleStatus?: string;
  nextDueAt?: string | null;
  nextPhoneId?: string | null;
}

export async function processAutoCycleOutcome(
  params: AutoCycleOutcomeParams,
): Promise<AutoCycleOutcomeResult> {
  const { leadId, disposition, source, userId } = params;
  const sb = createServiceClient();
  const now = new Date();
  const nowIso = now.toISOString();

  // ── Load cycle lead ──────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (sb.from("dialer_auto_cycle_leads") as any)
    .select("*")
    .eq("lead_id", leadId);

  // Operator calls filter by user_id; webhook skips (unique lead_id is safe)
  if (source === "operator" && userId) {
    query = query.eq("user_id", userId);
  }

  const { data: cycleLeadRow, error: cycleLeadErr } = await query.maybeSingle();

  if (cycleLeadErr) {
    console.error("[auto-cycle-outcome] lead load failed:", cycleLeadErr.message);
    throw new Error(`Failed to load Auto Cycle lead: ${cycleLeadErr.message}`);
  }

  if (!cycleLeadRow) {
    return { ok: true, skipped: true, reason: "no_cycle" };
  }

  // Already exited — don't re-process
  if (cycleLeadRow.cycle_status === "exited") {
    return { ok: true, skipped: true, reason: "already_exited" };
  }

  const cycleLead = cycleLeadRow as AutoCycleLeadRowLike;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leadRow, error: leadErr } = await (sb.from("leads") as any)
    .select("id, status, assigned_to")
    .eq("id", leadId)
    .maybeSingle();

  if (leadErr) {
    console.warn("[auto-cycle-outcome] lead status load failed (non-fatal):", leadErr.message);
  }

  const leadStatus = typeof leadRow?.status === "string" ? leadRow.status : null;
  const leadStillEligibleForAutoCycle = isLeadStatusEligibleForAutoCycle(leadStatus);
  const assignedTo = typeof leadRow?.assigned_to === "string" && leadRow.assigned_to.length > 0
    ? leadRow.assigned_to
    : typeof userId === "string" && userId.length > 0
      ? userId
      : typeof (cycleLeadRow as { user_id?: unknown }).user_id === "string"
        ? (cycleLeadRow as { user_id: string }).user_id
        : null;

  // ── Load phones ──────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: phoneRows, error: phoneErr } = await (sb.from("dialer_auto_cycle_phones") as any)
    .select("*")
    .eq("cycle_lead_id", cycleLead.id)
    .order("phone_position", { ascending: true })
    .order("created_at", { ascending: true });

  if (phoneErr) {
    console.error("[auto-cycle-outcome] phone load failed:", phoneErr.message);
    throw new Error(`Failed to load Auto Cycle phones: ${phoneErr.message}`);
  }

  const phones = (phoneRows ?? []) as AutoCyclePhoneRowLike[];
  const normalizedPhone = normalizePhoneForCompare(params.phoneNumber);
  const activePhones = phones.filter((p) => p.phone_status === "active");
  const targetPhone = activePhones.find((p) => normalizePhoneForCompare(p.phone) === normalizedPhone)
    ?? activePhones.find((p) => p.phone_id === cycleLead.next_phone_id)
    ?? activePhones[0]
    ?? null;

  if (
    !targetPhone
    && disposition !== "dead_lead"
    && disposition !== "disqualified"
    && disposition !== "not_interested"
    && disposition !== "wrong_number"
    && disposition !== "disconnected"
    && disposition !== "do_not_call"
  ) {
    return { ok: true, skipped: true, reason: "no_active_phone" };
  }

  const isLeadExit = isAutoCycleLeadExitDisposition(disposition);
  const isManualHold = isAutoCycleManualHoldDisposition(disposition);

  // ── Update target phone ──────────────────────────────────────────
  if (targetPhone) {
    let phonePatch: Record<string, unknown>;

    if (disposition === "dead_phone") {
      phonePatch = {
        attempt_count: Math.max((targetPhone.attempt_count ?? 0) + 1, 1),
        last_attempt_at: nowIso,
        last_outcome: disposition,
        phone_status: "dead",
        exit_reason: "dead_phone",
        next_attempt_number: null,
        next_due_at: null,
        voicemail_drop_next: false,
      };
    } else if (isManualHold) {
      phonePatch = {
        attempt_count: Math.max((targetPhone.attempt_count ?? 0) + 1, 1),
        last_attempt_at: nowIso,
        last_outcome: disposition,
        next_attempt_number: cycleLead.current_round || 1,
        next_due_at: null,
        voicemail_drop_next: false,
        phone_status: "active",
        exit_reason: null,
      };
    } else if (!isLeadExit) {
      const attemptCount = Math.max((targetPhone.attempt_count ?? 0) + 1, 1);
      const nextPlan = planNextAutoCyclePhoneCall(cycleLead.current_round || 1, now);
      phonePatch = {
        attempt_count: attemptCount,
        last_attempt_at: nowIso,
        last_outcome: disposition,
        next_attempt_number: nextPlan.nextAttemptNumber,
        next_due_at: nextPlan.nextDueAt,
        voicemail_drop_next: nextPlan.voicemailDropNext,
        phone_status: nextPlan.phoneStatus,
        exit_reason: null,
      };
    } else {
      phonePatch = {
        last_attempt_at: nowIso,
        last_outcome: disposition,
        phone_status: "exited",
        exit_reason: disposition,
        next_attempt_number: null,
        next_due_at: null,
        voicemail_drop_next: false,
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: phoneUpdateErr } = await (sb.from("dialer_auto_cycle_phones") as any)
      .update(phonePatch)
      .eq("id", targetPhone.id);

    if (phoneUpdateErr) {
      console.error("[auto-cycle-outcome] phone update failed:", phoneUpdateErr.message);
      throw new Error(`Failed to update phone: ${phoneUpdateErr.message}`);
    }
  }

  // ── Exit all phones on lead-exit disposition ─────────────────────
  if (isLeadExit) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: exitErr } = await (sb.from("dialer_auto_cycle_phones") as any)
      .update({
        phone_status: "exited",
        exit_reason: disposition,
        next_attempt_number: null,
        next_due_at: null,
        voicemail_drop_next: false,
      })
      .eq("cycle_lead_id", cycleLead.id)
      .eq("phone_status", "active");

    if (exitErr) {
      console.error("[auto-cycle-outcome] lead exit phone update failed:", exitErr.message);
      throw new Error(`Failed to close lead phones: ${exitErr.message}`);
    }
  }

  // ── Update lead call counters (atomic — prevents lost increments) ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb as any).rpc("increment_lead_call_counters", {
    p_lead_id: leadId,
    p_is_live_answer: LIVE_ANSWER_DISPOSITIONS.has(disposition),
    p_is_voicemail: disposition === "voicemail",
    p_last_contact_at: nowIso,
  }).throwOnError();

  // ── Derive new lead cycle state ──────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: refreshedPhoneRows, error: refreshErr } = await (sb.from("dialer_auto_cycle_phones") as any)
    .select("*")
    .eq("cycle_lead_id", cycleLead.id)
    .order("phone_position", { ascending: true })
    .order("created_at", { ascending: true });

  if (refreshErr) {
    console.error("[auto-cycle-outcome] refresh phone load failed:", refreshErr.message);
    throw new Error(`Failed to refresh phones: ${refreshErr.message}`);
  }

  const refreshedPhones = (refreshedPhoneRows ?? []) as AutoCyclePhoneRowLike[];
  const leadState = deriveLeadCycleState(cycleLead, refreshedPhones, now);
  const activeAfter = refreshedPhones.filter((p) => p.phone_status === "active");
  const dueNowExists = activeAfter.some((p) => {
    const dueMs = p.next_due_at ? new Date(p.next_due_at).getTime() : Number.NEGATIVE_INFINITY;
    return dueMs <= now.getTime();
  });

  let leadPatch:
    | {
        cycle_status: "ready" | "waiting" | "paused" | "exited";
        current_round: number;
        next_due_at: string | null;
        next_phone_id: string | null;
        last_outcome: PublishDisposition;
        exit_reason: string | null;
      };

  if (isLeadExit || activeAfter.length === 0) {
    leadPatch = {
      cycle_status: "exited",
      current_round: leadState.currentRound,
      next_due_at: null,
      next_phone_id: null,
      last_outcome: disposition,
      exit_reason: isLeadExit ? disposition : "completed_cycle",
    };
  } else if (!leadStillEligibleForAutoCycle) {
    leadPatch = {
      cycle_status: "exited",
      current_round: leadState.currentRound,
      next_due_at: null,
      next_phone_id: null,
      last_outcome: disposition,
      exit_reason: "status_changed",
    };
  } else if (isManualHold) {
    leadPatch = {
      cycle_status: "paused",
      current_round: leadState.currentRound,
      next_due_at: null,
      next_phone_id: targetPhone?.phone_id ?? leadState.nextPhoneId,
      last_outcome: disposition,
      exit_reason: "manual_positive_hold",
    };
  } else if (!dueNowExists) {
    if (shouldStopAutoCycleForNoResponseRound(leadState.currentRound)) {
      if (assignedTo) {
        const followUpDueAt = buildAutoCycleThirtyDayFollowUpDueAt(now);
        try {
          const { upsertLeadCallTask } = await import("@/lib/task-lead-sync");
          await upsertLeadCallTask({
            sb,
            leadId,
            assignedTo,
            title: "Follow up in 30 days - no response after 3 call days",
            dueAt: followUpDueAt,
            taskType: "follow_up",
            notes: "Auto-created by Power Dial after 3 consecutive no-response call days.",
          });
        } catch (taskErr) {
          console.error("[auto-cycle-outcome] 30-day follow-up task creation failed:", taskErr);
        }
      }

      leadPatch = {
        cycle_status: "exited",
        current_round: leadState.currentRound,
        next_due_at: null,
        next_phone_id: null,
        last_outcome: disposition,
        exit_reason: "no_response_30_day_follow_up",
      };
    } else {
      const nextRoundDueAt = buildAutoCycleNextRoundDueAt(now);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: normalizeErr } = await (sb.from("dialer_auto_cycle_phones") as any)
        .update({
          next_attempt_number: leadState.currentRound,
          next_due_at: nextRoundDueAt,
          voicemail_drop_next: false,
          exit_reason: null,
        })
        .eq("cycle_lead_id", cycleLead.id)
        .eq("phone_status", "active");

      if (normalizeErr) {
        console.error("[auto-cycle-outcome] next-round phone normalization failed:", normalizeErr.message);
        throw new Error(`Failed to normalize next round: ${normalizeErr.message}`);
      }

      leadPatch = {
        cycle_status: "waiting",
        current_round: leadState.currentRound,
        next_due_at: nextRoundDueAt,
        next_phone_id: pickAutoCyclePhoneIdByPosition(activeAfter),
        last_outcome: disposition,
        exit_reason: null,
      };
    }
  } else {
    leadPatch = {
      cycle_status: "ready",
      current_round: leadState.currentRound,
      next_due_at: leadState.nextDueAt,
      next_phone_id: leadState.nextPhoneId,
      last_outcome: disposition,
      exit_reason: null,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: leadUpdateErr } = await (sb.from("dialer_auto_cycle_leads") as any)
    .update(leadPatch)
    .eq("id", cycleLead.id);

  if (leadUpdateErr) {
    console.error("[auto-cycle-outcome] lead update failed:", leadUpdateErr.message);
    throw new Error(`Failed to update cycle lead: ${leadUpdateErr.message}`);
  }

  if (leadPatch.cycle_status === "waiting" || leadPatch.cycle_status === "exited") {
    try {
      await evictFromDialQueueIfAutoCycleStatusStopsImmediateWork(
        sb,
        leadId,
        leadPatch.cycle_status,
      );
    } catch (queueErr) {
      console.warn("[auto-cycle-outcome] queue eviction failed (non-fatal):", queueErr);
    }
  }

  return {
    ok: true,
    cycleStatus: leadPatch.cycle_status,
    nextDueAt: leadPatch.next_due_at,
    nextPhoneId: leadPatch.next_phone_id,
  };
}
