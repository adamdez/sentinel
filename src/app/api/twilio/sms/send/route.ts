import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";
import { getTwilioCredentials, isTwilioError, friendlyTwilioError } from "@/lib/twilio";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/twilio/sms/send
 *
 * Send an outbound SMS and log it to sms_messages.
 * Body: { to: string, body: string, leadId?: string }
 */
export async function POST(req: NextRequest) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const creds = getTwilioCredentials();
  if (isTwilioError(creds)) {
    return NextResponse.json(creds, { status: 500 });
  }

  const { to, body: messageBody, leadId } = await req.json();

  if (!to || typeof to !== "string") {
    return NextResponse.json({ error: "to is required" }, { status: 400 });
  }
  if (!messageBody || typeof messageBody !== "string" || messageBody.trim().length === 0) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }

  const sb = createDialerClient();

  // Determine which Twilio number to send FROM based on lead assignment
  let fromNumber = creds.from;
  if (leadId) {
    const { data: lead } = await sb.from("leads")
      .select("assigned_to")
      .eq("id", leadId)
      .maybeSingle();

    if (lead?.assigned_to) {
      const { data: profile } = await sb.from("user_profiles")
        .select("email")
        .eq("id", lead.assigned_to)
        .maybeSingle();

      const email = (profile?.email as string) ?? "";
      if (email.toLowerCase().includes("adam")) {
        fromNumber = process.env.TWILIO_PHONE_NUMBER_ADAM ?? creds.from;
      } else {
        fromNumber = process.env.TWILIO_PHONE_NUMBER_LOGAN ?? creds.from;
      }
    }
  }

  // Normalize destination to E.164
  const digits = to.replace(/\D/g, "");
  const e164 = digits.length === 10 ? `+1${digits}` : digits.startsWith("1") && digits.length === 11 ? `+${digits}` : to;

  // Send via Twilio REST API
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${creds.sid}/Messages.json`;
  const statusCallbackUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://sentinel.dominionhomedeals.com"}/api/twilio/sms/status`;

  const params = new URLSearchParams({
    To: e164,
    From: fromNumber,
    Body: messageBody.slice(0, 1600),
    StatusCallback: statusCallbackUrl,
  });

  const twilioRes = await fetch(twilioUrl, {
    method: "POST",
    headers: {
      Authorization: creds.authHeader,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const twilioData = await twilioRes.json();

  if (!twilioRes.ok) {
    console.error("[SMS Send] Twilio error:", twilioData);
    return NextResponse.json(
      { error: friendlyTwilioError(twilioData.message ?? "Unknown error") },
      { status: 502 },
    );
  }

  // Log outbound message to sms_messages
  const { error: insertErr } = await sb.from("sms_messages").insert({
    phone: e164,
    direction: "outbound",
    body: messageBody.slice(0, 2000),
    twilio_sid: twilioData.sid ?? null,
    twilio_status: twilioData.status ?? "queued",
    lead_id: leadId ?? null,
    user_id: user.id,
  });

  if (insertErr) {
    console.error("[SMS Send] DB insert failed (message was sent):", insertErr);
  }

  return NextResponse.json({
    success: true,
    sid: twilioData.sid,
    status: twilioData.status,
  });
}
