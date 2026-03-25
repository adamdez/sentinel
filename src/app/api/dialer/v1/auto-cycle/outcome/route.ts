export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";
import {
  deriveLeadCycleState,
  isAutoCycleLeadExitDisposition,
  nextAttemptPlan,
  normalizePhoneForCompare,
  type AutoCycleLeadRowLike,
  type AutoCyclePhoneRowLike,
} from "@/lib/dialer/auto-cycle";
import type { PublishDisposition } from "@/lib/dialer/types";

const LIVE_ANSWER_DISPOSITIONS = new Set<PublishDisposition>([
  "completed",
  "follow_up",
  "appointment",
  "offer_made",
]);

export async function POST(req: NextRequest) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { leadId?: string; disposition?: PublishDisposition; phoneNumber?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.leadId || !body.disposition) {
    return NextResponse.json({ error: "leadId and disposition are required" }, { status: 400 });
  }

  const sb = createDialerClient();
  const now = new Date();
  const nowIso = now.toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cycleLeadRow, error: cycleLeadErr } = await (sb.from("dialer_auto_cycle_leads") as any)
    .select("*")
    .eq("lead_id", body.leadId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (cycleLeadErr) {
    console.error("[auto-cycle outcome] lead load failed:", cycleLeadErr.message);
    return NextResponse.json({ error: "Failed to load Auto Cycle lead" }, { status: 500 });
  }

  if (!cycleLeadRow) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const cycleLead = cycleLeadRow as AutoCycleLeadRowLike;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: phoneRows, error: phoneErr } = await (sb.from("dialer_auto_cycle_phones") as any)
    .select("*")
    .eq("cycle_lead_id", cycleLead.id)
    .order("phone_position", { ascending: true })
    .order("created_at", { ascending: true });

  if (phoneErr) {
    console.error("[auto-cycle outcome] phone load failed:", phoneErr.message);
    return NextResponse.json({ error: "Failed to load Auto Cycle phones" }, { status: 500 });
  }

  const phones = (phoneRows ?? []) as AutoCyclePhoneRowLike[];
  const normalizedPhone = normalizePhoneForCompare(body.phoneNumber);
  const activePhones = phones.filter((phone) => phone.phone_status === "active");
  const targetPhone = activePhones.find((phone) => normalizePhoneForCompare(phone.phone) === normalizedPhone)
    ?? activePhones.find((phone) => phone.phone_id === cycleLead.next_phone_id)
    ?? activePhones[0]
    ?? null;

  if (!targetPhone && body.disposition !== "dead_lead" && body.disposition !== "disqualified" && body.disposition !== "not_interested") {
    return NextResponse.json({ ok: true, skipped: true, reason: "no_active_phone" });
  }

  const isLeadExit = isAutoCycleLeadExitDisposition(body.disposition);

  if (targetPhone) {
    let phonePatch: Record<string, unknown> | null = null;

    if (body.disposition === "dead_phone") {
      phonePatch = {
        last_attempt_at: nowIso,
        last_outcome: body.disposition,
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
        last_outcome: body.disposition,
        next_attempt_number: nextPlan.nextAttemptNumber,
        next_due_at: nextPlan.nextDueAt,
        voicemail_drop_next: nextPlan.voicemailDropNext,
        phone_status: nextPlan.phoneStatus,
        exit_reason: nextPlan.phoneStatus === "completed" ? "completed_cycle" : null,
      };
    } else {
      phonePatch = {
        last_attempt_at: nowIso,
        last_outcome: body.disposition,
        phone_status: "exited",
        exit_reason: body.disposition,
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
      console.error("[auto-cycle outcome] phone update failed:", phoneUpdateErr.message);
      return NextResponse.json({ error: "Failed to update Auto Cycle phone" }, { status: 500 });
    }
  }

  if (isLeadExit) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: exitErr } = await (sb.from("dialer_auto_cycle_phones") as any)
      .update({
        phone_status: "exited",
        exit_reason: body.disposition,
        next_attempt_number: null,
        next_due_at: null,
        voicemail_drop_next: false,
      })
      .eq("cycle_lead_id", cycleLead.id)
      .eq("phone_status", "active");

    if (exitErr) {
      console.error("[auto-cycle outcome] lead exit phone update failed:", exitErr.message);
      return NextResponse.json({ error: "Failed to close Auto Cycle lead" }, { status: 500 });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leadCounts, error: leadCountsErr } = await (sb.from("leads") as any)
    .select("total_calls, live_answers, voicemails_left")
    .eq("id", body.leadId)
    .single();

  if (!leadCountsErr && leadCounts) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("leads") as any)
      .update({
        total_calls: (leadCounts.total_calls ?? 0) + 1,
        live_answers: (leadCounts.live_answers ?? 0) + (LIVE_ANSWER_DISPOSITIONS.has(body.disposition) ? 1 : 0),
        voicemails_left: (leadCounts.voicemails_left ?? 0) + (body.disposition === "voicemail" ? 1 : 0),
        last_contact_at: nowIso,
      })
      .eq("id", body.leadId);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: refreshedPhoneRows, error: refreshErr } = await (sb.from("dialer_auto_cycle_phones") as any)
    .select("*")
    .eq("cycle_lead_id", cycleLead.id)
    .order("phone_position", { ascending: true })
    .order("created_at", { ascending: true });

  if (refreshErr) {
    console.error("[auto-cycle outcome] refresh phone load failed:", refreshErr.message);
    return NextResponse.json({ error: "Failed to refresh Auto Cycle lead" }, { status: 500 });
  }

  const refreshedPhones = (refreshedPhoneRows ?? []) as AutoCyclePhoneRowLike[];
  const leadState = deriveLeadCycleState(cycleLead, refreshedPhones, now);
  const activeAfter = refreshedPhones.filter((phone) => phone.phone_status === "active");
  const dueNowExists = activeAfter.some((phone) => {
    const dueMs = phone.next_due_at ? new Date(phone.next_due_at).getTime() : Number.NEGATIVE_INFINITY;
    return dueMs <= now.getTime();
  });

  const leadPatch = activeAfter.length === 0 || isLeadExit
    ? {
        cycle_status: "exited",
        current_round: leadState.currentRound,
        next_due_at: null,
        next_phone_id: null,
        last_outcome: body.disposition,
        exit_reason: isLeadExit ? body.disposition : "completed_cycle",
      }
    : {
        cycle_status: dueNowExists ? "ready" : "waiting",
        current_round: leadState.currentRound,
        next_due_at: leadState.nextDueAt,
        next_phone_id: leadState.nextPhoneId,
        last_outcome: body.disposition,
        exit_reason: null,
      };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: leadUpdateErr } = await (sb.from("dialer_auto_cycle_leads") as any)
    .update(leadPatch)
    .eq("id", cycleLead.id);

  if (leadUpdateErr) {
    console.error("[auto-cycle outcome] lead update failed:", leadUpdateErr.message);
    return NextResponse.json({ error: "Failed to update Auto Cycle state" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    lead_id: body.leadId,
    disposition: body.disposition,
    cycle_status: leadPatch.cycle_status,
    next_due_at: leadPatch.next_due_at,
    next_phone_id: leadPatch.next_phone_id,
  });
}
