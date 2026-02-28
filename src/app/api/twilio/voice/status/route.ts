import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/twilio/voice/status
 *
 * Called by Twilio after a <Dial> attempt completes.
 * If DialCallStatus !== "completed", the agent didn't answer —
 * return voicemail TwiML.
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const callLogId = url.searchParams.get("callLogId");
  const type = url.searchParams.get("type");

  const formData = await req.formData();
  const dialStatus = formData.get("DialCallStatus")?.toString() ?? "";
  const callDuration = formData.get("DialCallDuration")?.toString() ?? "0";

  const sb = createServerClient();

  if (type === "dial_complete" && dialStatus !== "completed") {
    // Agent didn't answer — drop voicemail
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("event_log") as any).insert({
      user_id: "00000000-0000-0000-0000-000000000000",
      action: "twilio.voicemail_drop",
      entity_type: "call",
      entity_id: callLogId ?? "unknown",
      details: { dial_status: dialStatus, duration: callDuration },
    });

    if (callLogId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("calls_log") as any)
        .update({ voicemail_dropped: true })
        .eq("id", callLogId);
    }

    const vmCallbackUrl = `/api/twilio/voice/recording?callLogId=${callLogId ?? ""}`;

    const twiml = [
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

    return new NextResponse(twiml, {
      headers: { "Content-Type": "text/xml" },
    });
  }

  // Agent answered — call completed normally
  if (callLogId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("calls_log") as any)
      .update({
        transfer_completed: true,
        duration_sec: parseInt(callDuration) || 0,
      })
      .eq("id", callLogId);
  }

  return new NextResponse(
    '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    { headers: { "Content-Type": "text/xml" } },
  );
}
