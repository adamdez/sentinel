import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { dispositionCategory } from "@/lib/comm-truth";
import { suggestNextCadenceDate } from "@/lib/call-scheduler";
import { exitIntroSop, progressIntroSopForCallAttempt, toIntroSopState } from "@/lib/intro-sop";
import { completeOpenCallTasksForLead, projectLeadFromTasks, upsertLeadCallTask } from "@/lib/task-lead-sync";
import { isPhoneDispositionRelevant, syncLeadPhoneOutcome } from "@/lib/lead-phone-outcome";

const TERMINAL_CALL_DISPOSITIONS = new Set([
  "dead",
  "dead_lead",
  "wrong_number",
  "disconnected",
  "do_not_call",
  "not_interested",
]);

/**
 * POST /api/leads/[id]/log-call
 *
 * Log a call made outside Sentinel (e.g., from a personal cell phone).
 * Inserts into calls_log and updates lead counters identically to
 * the Twilio-based dialer flow — no TwilioSID required.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: leadId } = await params;
  if (!leadId) {
    return NextResponse.json({ error: "Missing lead ID" }, { status: 400 });
  }

  const sb = createServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    disposition: string;
    notes?: string;
    durationSec?: number;
    next_action?: string;
    next_action_due_at?: string;
    phone_number?: string;
    phone_id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.disposition || typeof body.disposition !== "string") {
    return NextResponse.json({ error: "disposition is required" }, { status: 400 });
  }

  // Fetch lead + property for phone and counters
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead, error: leadErr } = await (sb.from("leads") as any)
    .select("id, property_id, total_calls, call_sequence_step, intro_sop_active, intro_day_count, intro_last_call_date, intro_completed_at, intro_exit_category")
    .eq("id", leadId)
    .single();

  if (leadErr || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Get phone from property
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prop } = await (sb.from("properties") as any)
    .select("owner_phone")
    .eq("id", lead.property_id)
    .single();

  const now = new Date().toISOString();

  // Insert call log record (no twilio_sid — external call)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: callLog, error: insertErr } = await (sb.from("calls_log") as any)
    .insert({
      lead_id: leadId,
      property_id: lead.property_id || null,
      user_id: user.id,
      phone_dialed: prop?.owner_phone || "external",
      disposition: body.disposition,
      duration_sec: body.durationSec ?? 0,
      notes: body.notes ?? null,
      started_at: now,
      ended_at: now,
    })
    .select("id")
    .single();

  if (insertErr) {
    console.error("[LogCall] calls_log insert failed:", insertErr);
    return NextResponse.json({ error: "Failed to log call" }, { status: 500 });
  }

  let phoneOutcomeResult: Awaited<ReturnType<typeof syncLeadPhoneOutcome>> | null = null;
  if (isPhoneDispositionRelevant(body.disposition)) {
    try {
      phoneOutcomeResult = await syncLeadPhoneOutcome({
        sb,
        leadId,
        userId: user.id,
        disposition: body.disposition,
        phoneId: body.phone_id ?? null,
        phoneNumber: body.phone_number ?? prop?.owner_phone ?? null,
      });
    } catch (phoneOutcomeErr) {
      console.error("[LogCall] lead phone outcome sync failed:", phoneOutcomeErr);
    }
  }

  // Update lead counters via RPC (same path as dialer)
  const dispoCategory = dispositionCategory(body.disposition);
  const isLive = dispoCategory === "live";
  const isVM = dispoCategory === "voicemail";
  const newTotalCalls = (lead.total_calls ?? 0) + 1;
  const step = lead.call_sequence_step ?? 1;
  const cadenceNext = suggestNextCadenceDate(now, newTotalCalls);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: rpcErr } = await (sb as any).rpc("increment_lead_call_counters", {
    p_lead_id: leadId,
    p_is_live: isLive,
    p_is_voicemail: isVM,
    p_last_contact_at: now,
    p_call_sequence_step: step + 1,
    p_next_call_scheduled_at: cadenceNext ? cadenceNext.toISOString() : null,
    p_clear_sequence: false,
  });

  if (rpcErr) {
    console.error("[LogCall] lead counter update failed:", rpcErr);
  }

  if (body.next_action) {
    try {
      await upsertLeadCallTask({
        sb,
        leadId,
        assignedTo: user.id,
        title: body.next_action,
        dueAt: body.next_action_due_at ?? null,
        taskType: body.next_action.toLowerCase().startsWith("drive by") ? "drive_by" : "callback",
        notes: body.notes,
        sourceType: "lead_follow_up",
        sourceKey: `lead:${leadId}:primary_call`,
      });
    } catch (taskErr) {
      console.error("[LogCall] next_action task sync failed:", taskErr);
    }
    try {
      const { evictFromDialQueueIfDriveBy } = await import("@/lib/dial-queue");
      await evictFromDialQueueIfDriveBy(sb, leadId, body.next_action);
    } catch { /* non-fatal */ }
    if (body.next_action.toLowerCase().startsWith("drive by")) {
      try {
        await exitIntroSop({ sb, leadId, category: "drive_by", userId: user.id });
      } catch { /* non-fatal */ }
    }
  } else if (TERMINAL_CALL_DISPOSITIONS.has(body.disposition)) {
    try {
      await completeOpenCallTasksForLead({
        sb,
        leadId,
        completionNote: `Completed after external call disposition: ${body.disposition}.`,
      });
    } catch (taskErr) {
      console.error("[LogCall] terminal task cleanup failed:", taskErr);
    }
  } else {
    try {
      await projectLeadFromTasks(sb, leadId);
    } catch (taskErr) {
      console.error("[LogCall] lead projection refresh failed:", taskErr);
    }
  }

  let introState = toIntroSopState(lead as Record<string, unknown>);
  try {
    const introResult = await progressIntroSopForCallAttempt({
      sb,
      leadId,
      attemptedAtIso: now,
    });
    if (introResult.state) {
      introState = introResult.state;
    }
  } catch (introError) {
    console.warn("[LogCall] intro SOP progress failed (non-fatal):", introError);
  }

  // Audit log (non-blocking)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sb.from("event_log") as any)
    .insert({
      user_id: user.id,
      action: "dialer.external_call_logged",
      entity_type: "call",
      entity_id: callLog?.id ?? "unknown",
      details: {
        lead_id: leadId,
        disposition: body.disposition,
        source: "external_cell",
      },
    })
    .then(() => {});

  return NextResponse.json({
    success: true,
    callLogId: callLog?.id,
    phone_outcome_applied: phoneOutcomeResult?.applied ?? false,
    phone_outcome_phone_id: phoneOutcomeResult?.phoneId ?? null,
    all_phones_dead: phoneOutcomeResult?.allPhonesDead ?? null,
    new_primary_phone: phoneOutcomeResult?.newPrimaryPhone ?? null,
    intro_sop_active: introState.intro_sop_active,
    intro_day_count: introState.intro_day_count,
    intro_exit_category: introState.intro_exit_category,
    requires_exit_category: introState.requires_exit_category,
  });
}
