/**
 * Dialer Note Manager — PR2
 *
 * All CRUD for session_notes. The only file that writes to session_notes.
 *
 * BOUNDARY RULES:
 *   - Import ONLY from ./db, ./types, ./schema-types, ./session-manager
 *   - NEVER import from @/lib/supabase or any CRM module
 *   - NEVER query call_sessions directly — use getSession() for ownership checks
 *   - NEVER write trace_metadata unless is_ai_generated is true
 *
 * Future developers: do not add CRM reads or writes here.
 * If you need to publish a note's content to calls_log, that belongs in
 * publish-manager.ts (PR3), not here.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { type TraceMetadata, type SessionErrorCode } from "./types";
import type {
  SessionNoteRow,
  SessionNoteType,
  SessionNoteSpeaker,
} from "./schema-types";
import { getSession } from "./session-manager";

// ─────────────────────────────────────────────────────────────
// Input / Output types
// ─────────────────────────────────────────────────────────────

export interface CreateNoteInput {
  note_type: SessionNoteType;
  content: string;
  speaker?: SessionNoteSpeaker;
  confidence?: number;       // 0.00–1.00; required when note_type = "transcript_chunk"
  sequence_num: number;
  is_ai_generated?: boolean; // default false
  trace_metadata?: TraceMetadata; // only written when is_ai_generated: true
}

export interface ListNotesOptions {
  note_type?: SessionNoteType;
  is_confirmed?: boolean;
  is_ai_generated?: boolean;
}

export interface ConfirmNoteInput {
  is_confirmed?: boolean;
  content?: string; // only permitted when is_ai_generated: true
}

export interface NoteResult<T> {
  data: T | null;
  error: string | null;
  code?: SessionErrorCode;
}

export interface NoteListResult {
  data: SessionNoteRow[];
  error: string | null;
  code?: SessionErrorCode;
}

// ─────────────────────────────────────────────────────────────
// createNote
// ─────────────────────────────────────────────────────────────

/**
 * Creates a note for a session.
 * Validates session ownership via getSession() before any insert.
 */
export async function createNote(
  sb: SupabaseClient,
  sessionId: string,
  userId: string,
  input: CreateNoteInput,
): Promise<NoteResult<SessionNoteRow>> {
  // Ownership gate
  const sessionResult = await getSession(sb, sessionId, userId);
  if (sessionResult.error || !sessionResult.data) {
    return { data: null, error: sessionResult.error, code: sessionResult.code };
  }

  // Validation
  if (!input.content?.trim()) {
    return { data: null, error: "content is required", code: "VALIDATION_ERROR" };
  }
  if (input.note_type === "transcript_chunk" && input.confidence === undefined) {
    return {
      data: null,
      error: "confidence is required for transcript_chunk (0.00–1.00)",
      code: "VALIDATION_ERROR",
    };
  }
  if (input.confidence !== undefined && (input.confidence < 0 || input.confidence > 1)) {
    return {
      data: null,
      error: "confidence must be between 0.00 and 1.00",
      code: "VALIDATION_ERROR",
    };
  }

  const isAI = input.is_ai_generated ?? false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("session_notes") as any)
    .insert({
      session_id:      sessionId,
      note_type:       input.note_type,
      content:         input.content.trim(),
      speaker:         input.speaker ?? null,
      confidence:      input.confidence ?? null,
      sequence_num:    input.sequence_num,
      is_ai_generated: isAI,
      is_confirmed:    false,
      // trace_metadata only stored for AI-generated notes
      trace_metadata:  (isAI && input.trace_metadata) ? input.trace_metadata : null,
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("[Dialer/note-manager] createNote failed:", error?.message);
    return { data: null, error: error?.message ?? "Insert failed", code: "DB_ERROR" };
  }

  return { data: data as SessionNoteRow, error: null };
}

// ─────────────────────────────────────────────────────────────
// listNotes
// ─────────────────────────────────────────────────────────────

/**
 * Lists notes for a session ordered by sequence_num ASC.
 * Validates ownership before querying.
 */
export async function listNotes(
  sb: SupabaseClient,
  sessionId: string,
  userId: string,
  options: ListNotesOptions = {},
): Promise<NoteListResult> {
  const sessionResult = await getSession(sb, sessionId, userId);
  if (sessionResult.error || !sessionResult.data) {
    return { data: [], error: sessionResult.error ?? "Session not found", code: sessionResult.code };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (sb.from("session_notes") as any)
    .select("*")
    .eq("session_id", sessionId)
    .order("sequence_num", { ascending: true });

  if (options.note_type !== undefined) {
    query = query.eq("note_type", options.note_type);
  }
  if (options.is_confirmed !== undefined) {
    query = query.eq("is_confirmed", options.is_confirmed);
  }
  if (options.is_ai_generated !== undefined) {
    query = query.eq("is_ai_generated", options.is_ai_generated);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[Dialer/note-manager] listNotes failed:", error.message);
    return { data: [], error: error.message, code: "DB_ERROR" };
  }

  return { data: (data as SessionNoteRow[]) ?? [], error: null };
}

// ─────────────────────────────────────────────────────────────
// confirmNote
// ─────────────────────────────────────────────────────────────

/**
 * Confirms or edits a note.
 * Content edits are only permitted on AI-generated notes (is_ai_generated: true).
 * The note must belong to the given session, which must belong to the given user.
 */
export async function confirmNote(
  sb: SupabaseClient,
  noteId: string,
  sessionId: string,
  userId: string,
  update: ConfirmNoteInput,
): Promise<NoteResult<SessionNoteRow>> {
  if (update.is_confirmed === undefined && update.content === undefined) {
    return { data: null, error: "No updatable fields provided", code: "VALIDATION_ERROR" };
  }

  // Ownership gate
  const sessionResult = await getSession(sb, sessionId, userId);
  if (sessionResult.error || !sessionResult.data) {
    return { data: null, error: sessionResult.error, code: sessionResult.code };
  }

  // Fetch the note — validates it belongs to this session
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing, error: fetchErr } = await (sb.from("session_notes") as any)
    .select("id, session_id, is_ai_generated")
    .eq("id", noteId)
    .eq("session_id", sessionId)
    .maybeSingle();

  if (fetchErr) {
    console.error("[Dialer/note-manager] confirmNote fetch failed:", fetchErr.message);
    return { data: null, error: fetchErr.message, code: "DB_ERROR" };
  }
  if (!existing) {
    return { data: null, error: "Note not found", code: "NOT_FOUND" };
  }
  if (update.content !== undefined && !existing.is_ai_generated) {
    return {
      data: null,
      error: "content edits only allowed on AI-generated notes",
      code: "VALIDATION_ERROR",
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = {};
  if (update.is_confirmed !== undefined) patch.is_confirmed = update.is_confirmed;
  if (update.content      !== undefined) patch.content      = update.content.trim();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("session_notes") as any)
    .update(patch)
    .eq("id", noteId)
    .select("*")
    .single();

  if (error || !data) {
    console.error("[Dialer/note-manager] confirmNote update failed:", error?.message);
    return { data: null, error: error?.message ?? "Update failed", code: "DB_ERROR" };
  }

  return { data: data as SessionNoteRow, error: null };
}
