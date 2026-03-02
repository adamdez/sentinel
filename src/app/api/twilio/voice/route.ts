import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

/**
 * POST /api/twilio/voice
 *
 * Twilio webhook — called when the AGENT answers their cell phone
 * (agent-first click-to-call). Returns TwiML that bridges
 * the call to the prospect.
 *
 * Query params:
 *   ?agentId=<user_id>&callLogId=<id>&prospectPhone=<e164>
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const agentId = url.searchParams.get("agentId");
  const callLogId = url.searchParams.get("callLogId");
  const prospectPhone = url.searchParams.get("prospectPhone");

  const sb = createServerClient();

  let agentTwilioNumber = "";
  let agentName = "";
  if (agentId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (sb.from("user_profiles") as any)
      .select("full_name, twilio_phone_number")
      .eq("id", agentId)
      .single();

    agentName = (profile?.full_name as string) ?? "";
    agentTwilioNumber = (profile?.twilio_phone_number as string) ?? "";
  }

  const twilioNumber = agentTwilioNumber || process.env.TWILIO_PHONE_NUMBER || "";

  let twiml: string;

  if (prospectPhone) {
    // Agent just picked up — bridge to the prospect.
    // The prospect sees the Twilio number (CNAM "Dominion Homes") as caller ID.
    twiml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      "<Response>",
      '  <Say voice="Polly.Joanna">Sentinel call. Connecting to prospect now.</Say>',
      `  <Dial callerId="${twilioNumber}" timeout="30" action="/api/twilio/voice/status?callLogId=${callLogId ?? ""}&amp;type=dial_complete">`,
      `    <Number>${prospectPhone}</Number>`,
      "  </Dial>",
      "</Response>",
    ].join("\n");
  } else {
    twiml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      "<Response>",
      '  <Say voice="Polly.Joanna">No prospect number available. Goodbye.</Say>',
      "</Response>",
    ].join("\n");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("event_log") as any).insert({
    user_id: agentId ?? SYSTEM_USER_ID,
    action: "twilio.voice_webhook",
    entity_type: "call",
    entity_id: callLogId ?? "unknown",
    details: {
      flow: "agent_first",
      prospect_phone: prospectPhone ? `***${prospectPhone.slice(-4)}` : null,
      agent_name: agentName,
      from_number: twilioNumber,
      timestamp: new Date().toISOString(),
    },
  });

  return new NextResponse(twiml, {
    headers: { "Content-Type": "text/xml" },
  });
}
