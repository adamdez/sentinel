import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { scrubLead } from "@/lib/compliance";
import { getTwilioCredentials, isTwilioError, friendlyTwilioError } from "@/lib/twilio";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

/**
 * POST /api/dialer/sms
 *
 * Sends an outbound SMS via Twilio.
 * Body: { phone, message, leadId?, propertyId?, userId? }
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const bearerToken = req.headers.get("authorization")?.replace("Bearer ", "");
  const { data: { user } } = await sb.auth.getUser(bearerToken);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const creds = getTwilioCredentials();
  if (isTwilioError(creds)) {
    console.error("[Dialer/SMS] Twilio credential error:", creds.error, "—", creds.hint);
    return NextResponse.json({ error: creds.error }, { status: 500 });
  }
  const { sid, authHeader, from } = creds;

  if (!from) {
    return NextResponse.json(
      { error: "No Twilio phone number configured (TWILIO_PHONE_NUMBER)" },
      { status: 500 },
    );
  }

  let body: {
    phone: string;
    message: string;
    leadId?: string;
    propertyId?: string;
    userId?: string;
    force?: boolean;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.phone || !body.message) {
    return NextResponse.json({ error: "phone and message required" }, { status: 400 });
  }

  const phone = body.phone.replace(/\D/g, "");
  const e164 = phone.length === 10 ? `+1${phone}` : `+${phone}`;
  const userId = body.userId || user.id;

  // Compliance scrub
  const scrub = await scrubLead(body.phone, userId, false);
  if (!scrub.allowed) {
    return NextResponse.json(
      { error: "Compliance blocked", reasons: scrub.blockedReasons },
      { status: 403 },
    );
  }

  // WA state SMS compliance guard — Washington outbound follow-up is call-only
  // unless the operator explicitly forces (e.g. appointment confirmations).
  if (!body.force) {
    let leadState: string | null = null;
    if (body.leadId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: leadRow } = await (sb.from("leads") as any)
        .select("property_id")
        .eq("id", body.leadId)
        .maybeSingle();
      if (leadRow?.property_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: propRow } = await (sb.from("properties") as any)
          .select("state")
          .eq("id", leadRow.property_id)
          .maybeSingle();
        leadState = propRow?.state ?? null;
      }
    }
    if (leadState && leadState.toUpperCase() === "WA") {
      return NextResponse.json(
        {
          error: "Washington state follow-up SMS blocked — WA outbound follow-up is call-only. Set force: true for non-follow-up SMS (e.g. appointment confirmations).",
          wa_blocked: true,
        },
        { status: 403 },
      );
    }
  }

  // Send via Twilio
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;

  const formData = new URLSearchParams({
    To: e164,
    From: from,
    Body: body.message,
  });

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
      const rawMsg = data.message ?? "Twilio SMS failed";
      console.error("[Dialer/SMS] Twilio error:", data);
      return NextResponse.json(
        { error: friendlyTwilioError(rawMsg) },
        { status: 502 },
      );
    }

    // Log to calls_log
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("calls_log") as any).insert({
      lead_id: body.leadId || null,
      property_id: body.propertyId || null,
      user_id: userId,
      phone_dialed: e164,
      twilio_sid: data.sid,
      disposition: "sms_outbound",
      notes: body.message.slice(0, 500),
      started_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
      duration_sec: 0,
    });

    // Audit
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sb.from("event_log") as any).insert({
      user_id: userId,
      action: "dialer.sms_sent",
      entity_type: "sms",
      entity_id: data.sid,
      details: {
        phone: `***${phone.slice(-4)}`,
        lead_id: body.leadId,
        message_preview: body.message.slice(0, 50),
      },
    });

    return NextResponse.json({
      success: true,
      messageSid: data.sid,
      phone: e164,
    });
  } catch (err) {
    console.error("[Dialer/SMS]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
