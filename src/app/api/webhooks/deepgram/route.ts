/**
 * POST /api/webhooks/deepgram
 *
 * Receives transcript events from the Deepgram relay server and writes them
 * to the dialer workspace only.
 */

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient } from "@/lib/dialer/db";
import { createNote } from "@/lib/dialer/note-manager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface TranscriptWebhookPayload {
  event: string;
  session_id: string;
  user_id: string;
  call_log_id?: string;
  transcript?: {
    text: string;
    channel_index: number;
    confidence: number;
    is_final: boolean;
    speech_final: boolean;
    start: number;
    duration: number;
  };
  sequence_num?: number;
}

const sequenceCounters = new Map<string, number>();

function nextSequence(sessionId: string, relaySeqNum?: number): number {
  if (relaySeqNum !== undefined && relaySeqNum > 0) {
    const current = sequenceCounters.get(sessionId) ?? 0;
    const next = Math.max(current, relaySeqNum);
    sequenceCounters.set(sessionId, next);
    return next;
  }

  const next = (sequenceCounters.get(sessionId) ?? 0) + 1;
  sequenceCounters.set(sessionId, next);
  return next;
}

function cleanupSequence(sessionId: string): void {
  sequenceCounters.delete(sessionId);
}

function channelToSpeaker(channelIndex: number): "operator" | "seller" {
  return channelIndex === 0 ? "operator" : "seller";
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.DEEPGRAM_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.warn("[Deepgram Webhook] DEEPGRAM_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const incomingSecret = req.headers.get("x-webhook-secret");
  if (!incomingSecret || incomingSecret !== webhookSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: TranscriptWebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!payload.event || !payload.session_id) {
    return NextResponse.json({ error: "event and session_id are required" }, { status: 400 });
  }

  if (payload.event === "connection.open") {
    console.log(`[Deepgram Webhook] Stream opened for session=${payload.session_id}`);
    return NextResponse.json({ ok: true, event: "connection.open" });
  }

  if (payload.event === "connection.close") {
    console.log(`[Deepgram Webhook] Stream closed for session=${payload.session_id}`);
    cleanupSequence(payload.session_id);
    return NextResponse.json({ ok: true, event: "connection.close" });
  }

  if (payload.event !== "transcript") {
    return NextResponse.json({ ok: true, event: payload.event, ignored: true });
  }

  if (!payload.transcript) {
    return NextResponse.json({ error: "transcript data required for transcript event" }, { status: 400 });
  }

  const transcript = payload.transcript;
  if (!transcript.is_final) {
    return NextResponse.json({ ok: true, interim: true, persisted: false });
  }

  if (!transcript.text || transcript.text.trim() === "") {
    return NextResponse.json({ ok: true, empty: true, persisted: false });
  }

  const sb = createDialerClient();
  const seqNum = nextSequence(payload.session_id, payload.sequence_num);
  const speaker = channelToSpeaker(transcript.channel_index);

  const result = await createNote(sb, payload.session_id, payload.user_id, {
    note_type: "transcript_chunk",
    content: transcript.text.trim(),
    speaker,
    confidence: Math.max(0, Math.min(1, transcript.confidence)),
    sequence_num: seqNum,
    is_ai_generated: false,
  });

  if (result.error) {
    console.error(
      `[Deepgram Webhook] DROPPED TRANSCRIPT session=${payload.session_id} seq=${seqNum}: ${result.error} (code=${result.code})`
    );
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        code: result.code,
        persisted: false,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    persisted: true,
    note_id: result.data?.id,
    sequence_num: seqNum,
    speaker,
    call_log_id: payload.call_log_id ?? null,
  });
}
