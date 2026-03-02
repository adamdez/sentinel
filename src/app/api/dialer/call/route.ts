import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { scrubLead } from "@/lib/compliance";
import { scheduleNextCall } from "@/lib/call-scheduler";
import { getTwilioCredentials, isTwilioError, friendlyTwilioError } from "@/lib/twilio";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

/**
 * POST /api/dialer/call
 *
 * Initiates a Twilio outbound call and logs it to calls_log.
 *
 * Body: { phone, leadId, propertyId, userId, ghostMode? }
 *
 * Flow:
 *   1. Compliance scrub (unless ghost mode)
 *   2. Create Twilio call via REST API
 *   3. Insert calls_log record
 *   4. Audit log
 *   5. Return call SID
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const reqAuthHeader = req.headers.get("authorization");
  const bearerToken = reqAuthHeader?.replace("Bearer ", "");
  const { data: { user } } = await sb.auth.getUser(bearerToken);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const creds = getTwilioCredentials();
  if (isTwilioError(creds)) {
    console.error("[Dialer] Twilio credential error:", creds.error, "—", creds.hint);
    return NextResponse.json({ error: creds.error }, { status: 500 });
  }
  const { sid, from: fallbackFrom, authHeader } = creds;

  let body: {
    phone: string;
    leadId?: string;
    propertyId?: string;
    userId?: string;
    ghostMode?: boolean;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.phone) {
    return NextResponse.json({ error: "phone is required" }, { status: 400 });
  }

  const phone = body.phone.replace(/\D/g, "");
  if (phone.length < 10) {
    return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
  }

  const e164 = phone.length === 10 ? `+1${phone}` : `+${phone}`;
  const userId = user.id;

  // 1. Compliance scrub
  const scrub = await scrubLead(body.phone, userId, body.ghostMode ?? false);
  if (!scrub.allowed) {
    return NextResponse.json(
      { error: "Compliance blocked", reasons: scrub.blockedReasons },
      { status: 403 }
    );
  }

  // 2. Lookup agent's profile: personal_cell for warm transfer,
  //    twilio_phone_number for outbound caller ID, full_name for CNAM
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: agentProfile } = await (sb.from("user_profiles") as any)
    .select("personal_cell, twilio_phone_number, full_name")
    .eq("id", userId)
    .single();

  const agentCell = (agentProfile?.personal_cell as string) ?? "";
  const agentTwilioNumber = (agentProfile?.twilio_phone_number as string) ?? "";
  const agentFullName = (agentProfile?.full_name as string) ?? "";

  // Determine the From number: user's assigned Twilio number, or env fallback
  const from = agentTwilioNumber || fallbackFrom;
  if (!from) {
    return NextResponse.json(
      { error: "No Twilio phone number configured for this user or in environment" },
      { status: 500 }
    );
  }

  // Build per-user caller ID name (max 15 chars for CNAM standard)
  const firstName = agentFullName.split(" ")[0] || "";
  const callerIdName = firstName
    ? `Dominion ${firstName}`.substring(0, 15)
    : "Dominion Homes";

  // 3. Twilio REST API — create call with warm transfer webhook
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  // Insert calls_log first so we have the ID for the webhook URL
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: callLog, error: logErr } = await (sb.from("calls_log") as any)
    .insert({
      lead_id: body.leadId || null,
      property_id: body.propertyId || null,
      user_id: userId,
      phone_dialed: e164,
      transferred_to_cell: agentCell || null,
      disposition: "initiating",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (logErr) {
    console.error("[Dialer] calls_log insert failed:", logErr);
  }

  const voiceWebhookUrl = `${siteUrl}/api/twilio/voice?agentId=${encodeURIComponent(userId)}&callLogId=${encodeURIComponent(callLog?.id ?? "")}`;
  const statusCallbackUrl = `${siteUrl}/api/twilio/voice/status?callLogId=${encodeURIComponent(callLog?.id ?? "")}&type=call_status`;

  const formData = new URLSearchParams({
    To: e164,
    From: from,
    Url: voiceWebhookUrl,
    StatusCallback: statusCallbackUrl,
    StatusCallbackEvent: "initiated ringing answered completed",
  });

  let twilioSid: string | null = null;
  let twilioError: string | null = null;

  try {
    const res = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    const data = await res.json();

    if (!res.ok) {
      const rawMsg = data.message ?? `Twilio HTTP ${res.status}`;
      twilioError = friendlyTwilioError(rawMsg);
      console.error("[Dialer] Twilio error:", data);
    } else {
      twilioSid = data.sid;
      console.log("[Dialer] Call initiated:", twilioSid, "From:", from, "CallerID:", callerIdName);
    }
  } catch (err) {
    twilioError = err instanceof Error ? err.message : "Network error";
    console.error("[Dialer] Twilio fetch failed:", err);
  }

  // 3. Update calls_log with Twilio SID
  if (callLog?.id && twilioSid) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("calls_log") as any)
      .update({ twilio_sid: twilioSid, disposition: "in_progress" })
      .eq("id", callLog.id);
  }

  // 4. Audit log (non-blocking)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sb.from("event_log") as any).insert({
    user_id: userId,
    action: "dialer.call_initiated",
    entity_type: "call",
    entity_id: callLog?.id ?? twilioSid ?? "unknown",
    details: {
      phone: `***${phone.slice(-4)}`,
      lead_id: body.leadId,
      twilio_sid: twilioSid,
      from_number: from,
      caller_id_name: callerIdName,
      transferred_to: agentCell ? `***${agentCell.slice(-4)}` : null,
      ghost_mode: body.ghostMode ?? false,
    },
  });

  if (twilioError) {
    return NextResponse.json({
      success: false,
      error: twilioError,
      callLogId: callLog?.id ?? null,
    }, { status: 502 });
  }

  return NextResponse.json({
    success: true,
    callSid: twilioSid,
    callLogId: callLog?.id ?? null,
    phone: e164,
    transferTo: agentCell || null,
  });
}

/**
 * PATCH /api/dialer/call
 *
 * Updates a call record with disposition, duration, notes.
 * Body: { callLogId, disposition, durationSec?, notes?, endedAt? }
 */
export async function PATCH(req: NextRequest) {
  const sb = createServerClient();
  const patchToken = req.headers.get("authorization")?.replace("Bearer ", "");
  const { data: { user: patchUser } } = await sb.auth.getUser(patchToken);
  if (!patchUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    callLogId: string;
    disposition: string;
    durationSec?: number;
    notes?: string;
    endedAt?: string;
    userId?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.callLogId || !body.disposition) {
    return NextResponse.json({ error: "callLogId and disposition required" }, { status: 400 });
  }

  const endedAt = body.endedAt ?? new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb.from("calls_log") as any)
    .update({
      disposition: body.disposition,
      duration_sec: body.durationSec ?? 0,
      notes: body.notes ?? null,
      ended_at: endedAt,
    })
    .eq("id", body.callLogId);

  if (error) {
    console.error("[Dialer] calls_log update failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // ── 7-Day Power Sequence: update lead counters + schedule next call ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: callRow } = await (sb.from("calls_log") as any)
    .select("lead_id")
    .eq("id", body.callLogId)
    .single();

  if (callRow?.lead_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead } = await (sb.from("leads") as any)
      .select("call_sequence_step, total_calls, live_answers, voicemails_left")
      .eq("id", callRow.lead_id)
      .single();

    if (lead) {
      const step: number = lead.call_sequence_step ?? 1;
      const isLive = !["no_answer", "voicemail", "ghost", "skip_trace", "in_progress", "initiating", "sms_outbound"].includes(body.disposition);
      const isVM = body.disposition === "voicemail";

      const sched = scheduleNextCall(step, endedAt, body.disposition);

      const updatePayload: Record<string, unknown> = {
        total_calls: (lead.total_calls ?? 0) + 1,
        live_answers: (lead.live_answers ?? 0) + (isLive ? 1 : 0),
        voicemails_left: (lead.voicemails_left ?? 0) + (isVM ? 1 : 0),
        call_sequence_step: sched.sequenceStep,
        next_call_scheduled_at: sched.nextCallAt,
        last_contact_at: endedAt,
        updated_at: new Date().toISOString(),
      };

      // Auto-revert to prospect after 7-day sequence with no live answer
      if (sched.isComplete && !isLive) {
        updatePayload.status = "prospect";
        updatePayload.assigned_to = null;
        updatePayload.call_sequence_step = 1;
        updatePayload.next_call_scheduled_at = null;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("leads") as any)
        .update(updatePayload)
        .eq("id", callRow.lead_id);
    }
  }

  // Audit log (non-blocking)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sb.from("event_log") as any).insert({
    user_id: patchUser.id,
    action: "dialer.call_dispositioned",
    entity_type: "call",
    entity_id: body.callLogId,
    details: {
      disposition: body.disposition,
      duration_sec: body.durationSec,
    },
  });

  return NextResponse.json({ success: true });
}
