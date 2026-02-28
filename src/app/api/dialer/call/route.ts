import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { scrubLead } from "@/lib/compliance";

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

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!sid || !token || !from) {
    return NextResponse.json(
      { error: "Twilio credentials not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)" },
      { status: 500 }
    );
  }

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
  const userId = body.userId || SYSTEM_USER_ID;

  // 1. Compliance scrub
  const scrub = await scrubLead(body.phone, userId, body.ghostMode ?? false);
  if (!scrub.allowed) {
    return NextResponse.json(
      { error: "Compliance blocked", reasons: scrub.blockedReasons },
      { status: 403 }
    );
  }

  // 2. Lookup agent's personal cell for warm transfer
  let agentCell = "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: agentProfile } = await (sb.from("user_profiles") as any)
    .select("personal_cell")
    .eq("id", userId)
    .single();
  agentCell = (agentProfile?.personal_cell as string) ?? "";

  // 3. Twilio REST API — create call with warm transfer webhook
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`;
  const authHeader = "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");

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
    CallerIdName: "Dominion Homes",
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
      twilioError = data.message ?? `Twilio HTTP ${res.status}`;
      console.error("[Dialer] Twilio error:", data);
    } else {
      twilioSid = data.sid;
      console.log("[Dialer] Call initiated:", twilioSid);
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

  const sb = createServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb.from("calls_log") as any)
    .update({
      disposition: body.disposition,
      duration_sec: body.durationSec ?? 0,
      notes: body.notes ?? null,
      ended_at: body.endedAt ?? new Date().toISOString(),
    })
    .eq("id", body.callLogId);

  if (error) {
    console.error("[Dialer] calls_log update failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Audit log (non-blocking)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sb.from("event_log") as any).insert({
    user_id: body.userId || SYSTEM_USER_ID,
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
