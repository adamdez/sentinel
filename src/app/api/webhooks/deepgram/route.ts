/**
 * POST /api/webhooks/deepgram — WI-1
 *
 * Receives transcript events from the Deepgram relay server.
 * The relay bridges Twilio <Stream> audio to Deepgram live transcription,
 * then POSTs final transcript chunks here for persistence.
 *
 * WRITE PATH:
 *   Deepgram relay → this webhook → session_notes (dialer workspace, volatile)
 *   No writes to leads, deals, or calls_log.
 *
 * AUTH:
 *   Verified via DEEPGRAM_WEBHOOK_SECRET shared secret in the
 *   X-Webhook-Secret header. If the env var is not set, the endpoint
 *   is disabled (returns 503).
 *
 * BOUNDARY RULES:
 *   - Writes ONLY to session_notes via note-manager
 *   - Never writes to leads, deals, calls_log
 *   - Never imports CRM modules directly
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createNote } from "@/lib/dialer/note-manager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────
// Types for incoming webhook payload
// ─────────────────────────────────────────────────────────────

interface TranscriptWebhookPayload {
  /** Event type: "transcript" | "connection.open" | "connection.close" */
  event: string;
  /** Dialer session ID (passed as metadata when stream was created) */
  session_id: string;
  /** User ID that owns the session (for note-manager ownership gate) */
  user_id: string;
  /** Transcript data (only present for event=transcript) */
  transcript?: {
    text: string;
    channel_index: number;   // 0 = operator, 1 = seller
    confidence: number;      // 0.0-1.0
    is_final: boolean;
    speech_final: boolean;
    start: number;           // seconds
    duration: number;        // seconds
  };
  /** Sequence number for ordering (managed by the relay server) */
  sequence_num?: number;
}

// ─────────────────────────────────────────────────────────────
// Per-session sequence counter (in-memory, per-process)
// Relay server can also send sequence_num; we fall back to this
// ─────────────────────────────────────────────────────────────

const _sequenceCounters = new Map<string, number>();

function nextSequence(sessionId: string, relaySeqNum?: number): number {
  if (relaySeqNum !== undefined && relaySeqNum > 0) {
    // Use relay-provided sequence, but track the max
    const current = _sequenceCounters.get(sessionId) ?? 0;
    const next = Math.max(current, relaySeqNum);
    _sequenceCounters.set(sessionId, next);
    return next;
  }

  const current = _sequenceCounters.get(sessionId) ?? 0;
  const next = current + 1;
  _sequenceCounters.set(sessionId, next);
  return next;
}

function cleanupSequence(sessionId: string): void {
  _sequenceCounters.delete(sessionId);
}

// ─────────────────────────────────────────────────────────────
// Channel to speaker mapping
// ─────────────────────────────────────────────────────────────

function channelToSpeaker(channelIndex: number): "operator" | "seller" {
  return channelIndex === 0 ? "operator" : "seller";
}

// ─────────────────────────────────────────────────────────────
// Webhook handler
// ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth gate ─────────────────────────────────────────────
  const webhookSecret = process.env.DEEPGRAM_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.warn("[Deepgram Webhook] DEEPGRAM_WEBHOOK_SECRET not set — endpoint disabled");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 503 },
    );
  }

  const incomingSecret = req.headers.get("x-webhook-secret");
  if (!incomingSecret || incomingSecret !== webhookSecret) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  // ── Parse body ────────────────────────────────────────────
  let payload: TranscriptWebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!payload.event || !payload.session_id) {
    return NextResponse.json(
      { error: "event and session_id are required" },
      { status: 400 },
    );
  }

  // ── Handle connection lifecycle events ────────────────────
  if (payload.event === "connection.open") {
    console.log(`[Deepgram Webhook] Stream opened for session=${payload.session_id}`);
    return NextResponse.json({ ok: true, event: "connection.open" });
  }

  if (payload.event === "connection.close") {
    console.log(`[Deepgram Webhook] Stream closed for session=${payload.session_id}`);
    cleanupSequence(payload.session_id);
    return NextResponse.json({ ok: true, event: "connection.close" });
  }

  // ── Handle transcript events ──────────────────────────────
  if (payload.event !== "transcript") {
    // Unknown event type — accept but ignore
    return NextResponse.json({ ok: true, event: payload.event, ignored: true });
  }

  if (!payload.transcript) {
    return NextResponse.json(
      { error: "transcript data required for transcript event" },
      { status: 400 },
    );
  }

  const { transcript } = payload;

  // Skip interim results — only persist final transcripts
  if (!transcript.is_final) {
    return NextResponse.json({ ok: true, interim: true, persisted: false });
  }

  // Skip empty transcripts
  if (!transcript.text || transcript.text.trim() === "") {
    return NextResponse.json({ ok: true, empty: true, persisted: false });
  }

  // ── Persist final transcript chunk to session_notes ───────
  const sb = createServerClient();
  const seqNum = nextSequence(payload.session_id, payload.sequence_num);
  const speaker = channelToSpeaker(transcript.channel_index);

  const result = await createNote(
    sb,
    payload.session_id,
    payload.user_id,
    {
      note_type: "transcript_chunk",
      content: transcript.text.trim(),
      speaker,
      confidence: Math.max(0, Math.min(1, transcript.confidence)),
      sequence_num: seqNum,
      is_ai_generated: false,
    },
  );

  if (result.error) {
    console.error(
      `[Deepgram Webhook] DROPPED TRANSCRIPT session=${payload.session_id} seq=${seqNum}: ${result.error} (code=${result.code})`,
    );
    // Return 500 so the relay knows delivery failed and can retry
    return NextResponse.json({
      ok: false,
      error: result.error,
      code: result.code,
      persisted: false,
    }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    persisted: true,
    note_id: result.data?.id,
    sequence_num: seqNum,
    speaker,
  });
}
