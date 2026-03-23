import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { scrubLead } from "@/lib/compliance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

/**
 * POST /api/twilio/sms
 *
 * Twilio webhook for inbound SMS messages.
 * 1. Runs compliance scrub on the sender
 * 2. Logs to calls_log with type "sms_inbound"
 * 3. Returns TwiML auto-reply
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const from = formData.get("From")?.toString() ?? "";
  const to = formData.get("To")?.toString() ?? "";
  const body = formData.get("Body")?.toString() ?? "";
  const messageSid = formData.get("MessageSid")?.toString() ?? "";

  const sb = createServerClient();
  const phone = from.replace(/\D/g, "");

  // 1. Compliance scrub
  const scrub = await scrubLead(phone, SYSTEM_USER_ID, false);

  // 2. Log inbound SMS
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("calls_log") as any).insert({
    user_id: SYSTEM_USER_ID,
    phone_dialed: from,
    twilio_sid: messageSid,
    disposition: "sms_inbound",
    notes: body.slice(0, 1000),
    started_at: new Date().toISOString(),
    ended_at: new Date().toISOString(),
    duration_sec: 0,
  });

  // 3. Audit log
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("event_log") as any).insert({
    user_id: SYSTEM_USER_ID,
    action: "twilio.sms_inbound",
    entity_type: "sms",
    entity_id: messageSid,
    details: {
      from: `***${phone.slice(-4)}`,
      to,
      body_preview: body.slice(0, 100),
      compliant: scrub.allowed,
      blocked_reasons: scrub.blockedReasons,
      timestamp: new Date().toISOString(),
    },
  });

  // 4. No auto-reply — just acknowledge receipt to Twilio silently.
  // Operators reply manually through the dialer messages UI.
  if (!scrub.allowed) {
    console.log(`[SMS] Compliance flagged sender ${phone.slice(-4)}: ${scrub.blockedReasons.join(", ")}`);
  }

  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { "Content-Type": "text/xml" },
  });
}
