import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/twilio/voice/status
 *
 * Called by Twilio after the <Dial> to the prospect completes.
 *
 * Agent-first flow:
 *   - Agent is already on the line.
 *   - If DialCallStatus !== "completed", the prospect didn't answer.
 *     Tell the agent and end the call (the agent can also leave a VM
 *     naturally if the prospect's voicemail picks up before timeout).
 *   - If DialCallStatus === "completed", the call finished normally.
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
    // Prospect didn't answer — inform the agent who is still on the line
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("event_log") as any).insert({
      user_id: "00000000-0000-0000-0000-000000000000",
      action: "twilio.prospect_no_answer",
      entity_type: "call",
      entity_id: callLogId ?? "unknown",
      details: { dial_status: dialStatus, duration: callDuration },
    });

    if (callLogId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("calls_log") as any)
        .update({ disposition: "no_answer" })
        .eq("id", callLogId);
    }

    const twiml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      "<Response>",
      '  <Say voice="Polly.Joanna">The prospect did not answer. Goodbye.</Say>',
      "</Response>",
    ].join("\n");

    return new NextResponse(twiml, {
      headers: { "Content-Type": "text/xml" },
    });
  }

  // Prospect answered and the call completed normally
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
