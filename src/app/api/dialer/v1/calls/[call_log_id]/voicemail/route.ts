export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";

function normalizeRecordingMediaUrl(recordingUrl: string, format: "mp3" | "wav"): string {
  const trimmed = recordingUrl.trim();
  if (!trimmed) return trimmed;
  if (trimmed.endsWith(".mp3") || trimmed.endsWith(".wav")) return trimmed;
  return `${trimmed}.${format}`;
}

function isTwilioRecordingUrl(recordingUrl: string): boolean {
  try {
    const parsed = new URL(recordingUrl);
    return parsed.hostname.endsWith("twilio.com");
  } catch {
    return false;
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ call_log_id: string }> },
) {
  const authHeader = req.headers.get("authorization");
  const user = await getDialerUser(authHeader);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { call_log_id: callLogId } = await context.params;
  if (!callLogId) {
    return NextResponse.json({ error: "call_log_id required" }, { status: 400 });
  }

  const requestedFormat = new URL(req.url).searchParams.get("format");
  const format: "mp3" | "wav" = requestedFormat === "wav" ? "wav" : "mp3";
  const sb = createDialerClient(authHeader);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: callLog, error } = await (sb.from("calls_log") as any)
    .select("id, recording_url")
    .eq("id", callLogId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const recordingUrl = callLog?.recording_url?.trim() ?? "";
  if (!recordingUrl) {
    return NextResponse.json({ error: "Voicemail recording not found" }, { status: 404 });
  }

  const mediaUrl = normalizeRecordingMediaUrl(recordingUrl, format);
  const headers = new Headers();
  if (isTwilioRecordingUrl(mediaUrl)) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
    const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
    if (!accountSid || !authToken) {
      return NextResponse.json({ error: "Twilio recording proxy is not configured" }, { status: 503 });
    }
    headers.set("Authorization", `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`);
  }

  const mediaResponse = await fetch(mediaUrl, { headers, cache: "no-store" });
  if (!mediaResponse.ok || !mediaResponse.body) {
    return NextResponse.json(
      { error: `Twilio recording fetch failed (${mediaResponse.status})` },
      { status: mediaResponse.status || 502 },
    );
  }

  const responseHeaders = new Headers();
  responseHeaders.set("Content-Type", mediaResponse.headers.get("content-type") ?? (format === "wav" ? "audio/wav" : "audio/mpeg"));
  responseHeaders.set("Cache-Control", "private, no-store, max-age=0");

  return new NextResponse(mediaResponse.body, {
    status: 200,
    headers: responseHeaders,
  });
}
