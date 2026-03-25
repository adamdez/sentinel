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
  deriveLeadCycleState,
  isAutoCycleLeadExitDisposition,
  nextAttemptPlan,
  normalizePhoneForCompare,
  type AutoCycleLeadRowLike,
  type AutoCyclePhoneRowLike,
} from "./auto-cycle";
import type { PublishDisposition } from "./types";

// ── Disposition translation: Vapi → Auto-cycle ─────────────────────

/**
 * Maps a Vapi calls_log disposition to the auto-cycle vocabulary.
 * Returns null if the disposition should NOT trigger an auto-cycle update
 * (e.g. errors — we don't want to burn an attempt on a pipeline failure).
 */
export function mapVapiDispositionToAutoCycle(disposition: string): PublishDisposition | null {
  switch (disposition) {
    case "transferred":  return "follow_up";       // live answer → operator takes over
    case "no_answer":    return "no_answer";        // advance phone attempt
    case "voicemail":    return "voicemail";         // advance phone attempt
    case "completed":    return "completed";         // conversation happened, exit
    case "ai_ended":     return "not_interested";    // Jeff screened out, exit
    default:             return null;                // error, spam, unknown → skip
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

  if (!targetPhone && disposition !== "dead_lead" && disposition !== "disqualified" && disposition !== "not_interested") {
    return { ok: true, skipped: true, reason: "no_active_phone" };
  }

  const isLeadExit = isAutoCycleLeadExitDisposition(disposition);

  // ── Update target phone ──────────────────────────────────────────
  if (targetPhone) {
    let phonePatch: Record<string, unknown>;

    if (disposition === "dead_phone") {
      phonePatch = {
        last_attempt_at: nowIso,
        last_outcome: disposition,
        phone_status: "dead",
        exit_reason: "dead_phone",
        next_attempt_number: null,
        next_due_at: null,
        voicemail_drop_next: false,
      };
    } else if (!isLeadExit) {
      const attemptCount = Math.min((targetPhone.attempt_count ?? 0) + 1, 5);
      const nextPlan = nextAttemptPlan(attemptCount, now);
      phonePatch = {
        attempt_count: attemptCount,
        last_attempt_at: nowIso,
        last_outcome: disposition,
        next_attempt_number: nextPlan.nextAttemptNumber,
        next_due_at: nextPlan.nextDueAt,
        voicemail_drop_next: nextPlan.voicemailDropNext,
        phone_status: nextPlan.phoneStatus,
        exit_reason: nextPlan.phoneStatus === "completed" ? "completed_cycle" : null,
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

  // ── Update lead call counters ────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leadCounts, error: leadCountsErr } = await (sb.from("leads") as any)
    .select("total_calls, live_answers, voicemails_left")
    .eq("id", leadId)
    .single();

  if (!leadCountsErr && leadCounts) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("leads") as any)
      .update({
        total_calls: (leadCounts.total_calls ?? 0) + 1,
        live_answers: (leadCounts.live_answers ?? 0) + (LIVE_ANSWER_DISPOSITIONS.has(disposition) ? 1 : 0),
        voicemails_left: (leadCounts.voicemails_left ?? 0) + (disposition === "voicemail" ? 1 : 0),
        last_contact_at: nowIso,
      })
      .eq("id", leadId);
  }

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

  const leadPatch = activeAfter.length === 0 || isLeadExit
    ? {
        cycle_status: "exited" as const,
        current_round: leadState.currentRound,
        next_due_at: null,
        next_phone_id: null,
        last_outcome: disposition,
        exit_reason: isLeadExit ? disposition : "completed_cycle",
      }
    : {
        cycle_status: (dueNowExists ? "ready" : "waiting") as string,
        current_round: leadState.currentRound,
        next_due_at: leadState.nextDueAt,
        next_phone_id: leadState.nextPhoneId,
        last_outcome: disposition,
        exit_reason: null,
      };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: leadUpdateErr } = await (sb.from("dialer_auto_cycle_leads") as any)
    .update(leadPatch)
    .eq("id", cycleLead.id);

  if (leadUpdateErr) {
    console.error("[auto-cycle-outcome] lead update failed:", leadUpdateErr.message);
    throw new Error(`Failed to update cycle lead: ${leadUpdateErr.message}`);
  }

  return {
    ok: true,
    cycleStatus: leadPatch.cycle_status,
    nextDueAt: leadPatch.next_due_at,
    nextPhoneId: leadPatch.next_phone_id,
  };
}
