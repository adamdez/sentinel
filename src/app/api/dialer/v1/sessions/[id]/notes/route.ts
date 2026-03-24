/**
 * POST /api/dialer/v1/sessions/[id]/notes  — create a note
 * GET  /api/dialer/v1/sessions/[id]/notes  — list notes for a session
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";
import {
  createNote,
  listNotes,
  type CreateNoteInput,
  type ListNotesOptions,
} from "@/lib/dialer/note-manager";
import type { SessionNoteType, SessionNoteSpeaker } from "@/lib/dialer/schema-types";
import type { TraceMetadata } from "@/lib/dialer/types";

type RouteContext = { params: Promise<{ id: string }> };

const VALID_NOTE_TYPES: SessionNoteType[] = [
  "transcript_chunk",
  "ai_suggestion",
  "operator_note",
];
const VALID_SPEAKERS: SessionNoteSpeaker[] = ["operator", "seller", "ai"];

function errorStatus(code?: string): number {
  if (code === "FORBIDDEN")   return 403;
  if (code === "NOT_FOUND")   return 404;
  if (code === "VALIDATION_ERROR") return 400;
  return 500;
}

// ─── POST ────────────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: RouteContext) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: sessionId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate note_type
  const note_type = body.note_type as string | undefined;
  if (!note_type || !VALID_NOTE_TYPES.includes(note_type as SessionNoteType)) {
    return NextResponse.json(
      { error: `Invalid note_type: "${note_type ?? ""}"` },
      { status: 400 },
    );
  }

  // Validate speaker if provided
  const speaker = body.speaker as string | undefined;
  if (speaker !== undefined && !VALID_SPEAKERS.includes(speaker as SessionNoteSpeaker)) {
    return NextResponse.json(
      { error: `Invalid speaker: "${speaker}"` },
      { status: 400 },
    );
  }

  // sequence_num is required
  if (body.sequence_num === undefined || typeof body.sequence_num !== "number") {
    return NextResponse.json(
      { error: "sequence_num is required (integer)" },
      { status: 400 },
    );
  }

  const isAI = body.is_ai_generated === true;

  const input: CreateNoteInput = {
    note_type:       note_type as SessionNoteType,
    content:         typeof body.content === "string" ? body.content : "",
    speaker:         speaker as SessionNoteSpeaker | undefined,
    confidence:      typeof body.confidence === "number" ? body.confidence : undefined,
    sequence_num:    body.sequence_num as number,
    is_ai_generated: isAI,
    trace_metadata:  isAI ? (body.trace_metadata as TraceMetadata | undefined) : undefined,
  };

  const sb = createDialerClient();
  const result = await createNote(sb, sessionId, user.id, input);

  if (result.error || !result.data) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: errorStatus(result.code) },
    );
  }

  return NextResponse.json({ note: result.data }, { status: 201 });
}

// ─── GET ─────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: RouteContext) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: sessionId } = await params;
  const { searchParams } = new URL(req.url);

  const options: ListNotesOptions = {};

  const noteType = searchParams.get("note_type");
  if (noteType) {
    if (!VALID_NOTE_TYPES.includes(noteType as SessionNoteType)) {
      return NextResponse.json(
        { error: `Invalid note_type filter: "${noteType}"` },
        { status: 400 },
      );
    }
    options.note_type = noteType as SessionNoteType;
  }

  const isConfirmed = searchParams.get("is_confirmed");
  if (isConfirmed === "true")  options.is_confirmed = true;
  if (isConfirmed === "false") options.is_confirmed = false;

  const isAI = searchParams.get("is_ai_generated");
  if (isAI === "true")  options.is_ai_generated = true;
  if (isAI === "false") options.is_ai_generated = false;

  const afterSequence = searchParams.get("after_sequence");
  if (afterSequence !== null) {
    const parsed = Number.parseInt(afterSequence, 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return NextResponse.json(
        { error: `Invalid after_sequence filter: "${afterSequence}"` },
        { status: 400 },
      );
    }
    options.after_sequence_num = parsed;
  }

  const limit = searchParams.get("limit");
  if (limit !== null) {
    const parsed = Number.parseInt(limit, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return NextResponse.json(
        { error: `Invalid limit filter: "${limit}"` },
        { status: 400 },
      );
    }
    options.limit = parsed;
  }

  const sb = createDialerClient();
  const result = await listNotes(sb, sessionId, user.id, options);

  if (result.error) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: errorStatus(result.code) },
    );
  }

  return NextResponse.json({ notes: result.data });
}
