import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { scrubLead } from "@/lib/compliance";
import { resolveSmsLead } from "@/lib/sms/lead-resolution";
import { normalizePhone } from "@/lib/upsert-contact";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

/**
 * POST /api/twilio/sms
 *
 * Twilio webhook for inbound SMS messages.
 * 1. Auto-matches sender to a lead by phone number
 * 2. Runs compliance scrub on the sender
 * 3. Logs to sms_messages table
 * 4. Returns empty TwiML (no auto-reply)
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const from = formData.get("From")?.toString() ?? "";
  const to = formData.get("To")?.toString() ?? "";
  const body = formData.get("Body")?.toString() ?? "";
  const messageSid = formData.get("MessageSid")?.toString() ?? "";

  const sb = createServerClient();
  const phone = from.replace(/\D/g, "");
  const normalizedFrom = normalizePhone(from) ?? `+${phone}`;
  const resolution = await resolveSmsLead(sb, from);
  const matchedLeadId = resolution.leadId;
  const matchedAssignedTo = resolution.assignedTo;

  // 2. Compliance scrub
  const scrub = await scrubLead(phone, SYSTEM_USER_ID, false);

  // 3. Log to sms_messages
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("sms_messages") as any).insert({
    phone: normalizedFrom,
    direction: "inbound",
    body: body.slice(0, 2000),
    twilio_sid: messageSid,
    lead_id: matchedLeadId,
    user_id: matchedAssignedTo,
  });

  // 4. Audit log
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
      matched_lead_id: matchedLeadId,
      resolution_state: resolution.resolutionState,
      match_source: resolution.matchSource,
      suggested_lead_id: resolution.suggestedMatch?.leadId ?? null,
      timestamp: new Date().toISOString(),
    },
  });

  if (!scrub.allowed) {
    console.log(`[SMS] Compliance flagged sender ${phone.slice(-4)}: ${scrub.blockedReasons.join(", ")}`);
  }

  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { "Content-Type": "text/xml" },
  });
}
