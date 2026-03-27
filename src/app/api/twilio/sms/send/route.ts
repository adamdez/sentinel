import { NextRequest, NextResponse } from "next/server";
import { getDialerUser } from "@/lib/dialer/db";
import { sendAndLogSMS } from "@/lib/sms/send";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/twilio/sms/send
 *
 * Send an outbound SMS and log it to sms_messages (delegates to shared sendAndLogSMS).
 * Body: { to: string, body: string, leadId?: string }
 *
 * C1: Now delegates to shared SMS function for consistent compliance,
 * FROM routing via user_profiles.twilio_phone_number (not email matching),
 * sms_messages logging, and StatusCallback on all sends.
 */
export async function POST(req: NextRequest) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { to, body: messageBody, leadId } = await req.json();

  if (!to || typeof to !== "string") {
    return NextResponse.json({ error: "to is required" }, { status: 400 });
  }
  if (!messageBody || typeof messageBody !== "string" || messageBody.trim().length === 0) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }

  // SMS tile sends are replies to inbound — NOT cold outbound
  // This means WA state block does NOT apply (replying is allowed)
  const result = await sendAndLogSMS({
    to,
    body: messageBody,
    context: "reply_to_inbound",
    leadId: leadId ?? null,
    userId: user.id,
  });

  if (!result.success) {
    if (result.blocked) {
      return NextResponse.json(
        { error: result.error, reasons: result.blockedReasons },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({
    success: true,
    sid: result.messageSid,
    status: "queued",
  });
}
