import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { sendAndLogSMS } from "@/lib/sms/send";

/**
 * POST /api/dialer/sms
 *
 * Sends an outbound SMS via Twilio (delegates to shared sendAndLogSMS).
 * Body: { phone, message, leadId?, propertyId?, userId?, force? }
 *
 * C1: Now delegates to shared SMS function for consistent compliance,
 * FROM routing, sms_messages logging, and calls_log backward compat.
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const bearerToken = req.headers.get("authorization")?.replace("Bearer ", "");
  const { data: { user } } = await sb.auth.getUser(bearerToken);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const userId = body.userId || user.id;

  // force = true means operator explicitly overrode compliance (e.g. appointment confirmations)
  const context = body.force ? "operator_forced" as const : "cold_outbound" as const;

  const result = await sendAndLogSMS({
    to: body.phone,
    body: body.message,
    context,
    leadId: body.leadId,
    userId,
    propertyId: body.propertyId,
    logToCallsLog: true, // backward compat with reporting
  });

  if (!result.success) {
    if (result.blocked) {
      return NextResponse.json(
        { error: result.error, reasons: result.blockedReasons, wa_blocked: result.blockedReasons?.includes("wa_cold_outbound") },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({
    success: true,
    messageSid: result.messageSid,
    phone: body.phone,
  });
}
