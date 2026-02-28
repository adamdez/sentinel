import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

/**
 * POST /api/twilio/voice
 *
 * Twilio webhook — called when an outbound call connects.
 * Returns TwiML for warm transfer to agent's personal cell,
 * with professional voicemail on no-answer.
 *
 * Query params (set via statusCallbackUrl):
 *   ?agentId=<user_id>&callLogId=<id>&to=<e164>
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const agentId = url.searchParams.get("agentId");
  const callLogId = url.searchParams.get("callLogId");

  const sb = createServerClient();

  // Look up agent's personal cell from user_profiles
  let personalCell = "";
  if (agentId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (sb.from("user_profiles") as any)
      .select("preferences")
      .eq("id", agentId)
      .single();

    const prefs = profile?.preferences as Record<string, unknown> | undefined;
    personalCell = (prefs?.personal_cell as string) ?? "";
  }

  const callerIdName = "Dominion Homes";
  const twilioNumber = process.env.TWILIO_PHONE_NUMBER ?? "";

  let twiml: string;

  if (personalCell) {
    // Warm transfer: ring agent's personal cell, voicemail on no-answer (30s timeout)
    twiml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      "<Response>",
      `  <Say voice="Polly.Joanna">Connecting you to ${callerIdName}. Please hold.</Say>`,
      `  <Dial callerId="${twilioNumber}" timeout="30" action="/api/twilio/voice/status?callLogId=${callLogId ?? ""}&amp;type=dial_complete">`,
      `    <Number>${personalCell}</Number>`,
      "  </Dial>",
      "</Response>",
    ].join("\n");
  } else {
    // No personal cell configured — play voicemail greeting + record
    twiml = buildVoicemailTwiml(callLogId);
  }

  // Log the voice webhook event
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("event_log") as any).insert({
    user_id: agentId ?? SYSTEM_USER_ID,
    action: "twilio.voice_webhook",
    entity_type: "call",
    entity_id: callLogId ?? "unknown",
    details: {
      has_personal_cell: !!personalCell,
      warm_transfer: !!personalCell,
      timestamp: new Date().toISOString(),
    },
  });

  return new NextResponse(twiml, {
    headers: { "Content-Type": "text/xml" },
  });
}

/**
 * POST /api/twilio/voice/status
 *
 * Called by Twilio after <Dial> completes.
 * If the agent didn't answer, play voicemail greeting.
 */

function buildVoicemailTwiml(callLogId: string | null): string {
  const vmCallbackUrl = `/api/twilio/voice/recording?callLogId=${callLogId ?? ""}`;

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Response>",
    '  <Say voice="Polly.Joanna">',
    "    Thank you for calling Dominion Homes. We are unable to take your call right now.",
    "    Please leave a brief message with your name, property address, and phone number,",
    "    and a member of our team will return your call shortly.",
    "  </Say>",
    `  <Record maxLength="120" action="${vmCallbackUrl}" playBeep="true" />`,
    '  <Say voice="Polly.Joanna">We did not receive a recording. Goodbye.</Say>',
    "</Response>",
  ].join("\n");
}
