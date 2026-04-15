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
  const parsedDuration = Number.parseInt(recordingDuration, 10) || 0;
  const recordedAt = new Date().toISOString();

  const sb = createServerClient();

  if (callLogId && recordingUrl) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingCall, error: fetchErr } = await (sb.from("calls_log") as any)
      .select("id, metadata")
      .eq("id", callLogId)
      .maybeSingle();

    if (fetchErr) {
      console.error("[twilio/voice/recording] failed to load call log:", fetchErr.message);
      return NextResponse.json({ error: "Failed to load call log" }, { status: 500 });
    }

    const existingMetadata =
      existingCall && typeof existingCall.metadata === "object" && existingCall.metadata !== null
        ? existingCall.metadata
        : {};

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateErr } = await (sb.from("calls_log") as any)
      .update({
        disposition: "voicemail",
        recording_url: recordingUrl,
        metadata: {
          ...existingMetadata,
          voicemail_duration: parsedDuration,
          voicemail_recorded_at: recordedAt,
        },
      })
      .eq("id", callLogId);

    if (updateErr) {
      console.error("[twilio/voice/recording] failed to save voicemail:", updateErr.message);
      return NextResponse.json({ error: "Failed to save voicemail" }, { status: 500 });
    }
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
      timestamp: recordedAt,
    },
  });

  return new NextResponse(
    '<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">Thank you. Goodbye.</Say></Response>',
    { headers: { "Content-Type": "text/xml" } },
  );
}
