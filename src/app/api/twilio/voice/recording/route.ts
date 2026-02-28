import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/twilio/voice/recording
 *
 * Called by Twilio after voicemail recording completes.
 * Logs the recording URL to calls_log.
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const callLogId = url.searchParams.get("callLogId");

  const formData = await req.formData();
  const recordingUrl = formData.get("RecordingUrl")?.toString() ?? "";
  const recordingDuration = formData.get("RecordingDuration")?.toString() ?? "0";

  const sb = createServerClient();

  if (callLogId && recordingUrl) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("calls_log") as any)
      .update({
        voicemail_url: recordingUrl,
        voicemail_duration: parseInt(recordingDuration) || 0,
        voicemail_dropped: true,
      })
      .eq("id", callLogId);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("event_log") as any).insert({
    user_id: "00000000-0000-0000-0000-000000000000",
    action: "twilio.voicemail_recorded",
    entity_type: "call",
    entity_id: callLogId ?? "unknown",
    details: {
      recording_url: recordingUrl,
      duration: recordingDuration,
      timestamp: new Date().toISOString(),
    },
  });

  return new NextResponse(
    '<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">Thank you. Goodbye.</Say></Response>',
    { headers: { "Content-Type": "text/xml" } },
  );
}
