/**
 * Dialer Session Manager — PR1
 *
 * All CRUD operations for call_sessions and dialer_events.
 * This is the only file that writes to call_sessions.
 *
 * BOUNDARY RULES:
 *   - Import ONLY from ./db, ./types, ./schema-types
 *   - NEVER import from @/lib/supabase (use ./db.ts instead)
 *   - NEVER query leads, calls_log, properties, contacts (use crm-bridge.ts)
 *   - NEVER import from @/lib/lead-guardrails, call-scheduler, compliance, etc.
 *   - NEVER write to event_log (CRM audit table) — use dialer_events instead
 *
 * Future developers: do not add CRM imports here. If you need lead data,
 * call crm-bridge.ts. If you need to publish to the CRM, that belongs in
 * publish-manager.ts (PR3), not here.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  VALID_TRANSITIONS,
  TERMINAL_STATUSES,
  isValidTransition,
  type CallSession,
  type CallSessionStatus,
  type CreateSessionInput,
  type UpdateSessionInput,
  type SessionResult,
  type SessionListResult,
  type DialerEventType,
} from "./types";
import type { CallSessionRow } from "./schema-types";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Maps a raw DB row to the CallSession domain object. */
function rowToSession(row: CallSessionRow): CallSession {
  return {
    id: row.id,
    lead_id: row.lead_id,
    user_id: row.user_id,
    twilio_sid: row.twilio_sid,
    phone_dialed: row.phone_dialed,
    status: row.status,
    started_at: row.started_at,
    ended_at: row.ended_at,
    duration_sec: row.duration_sec,
    updated_at: row.updated_at,
    context_snapshot: row.context_snapshot,
    ai_summary: row.ai_summary,
    disposition: row.disposition,
    created_at: row.created_at,
  };
}

/**
 * Fire-and-forget audit event to dialer_events.
 * Never blocks or throws — dialer audit is informational only.
 */
function auditEvent(
  sb: SupabaseClient,
  event: {
    session_id: string | null;
    user_id: string;
    event_type: DialerEventType;
    payload?: Record<string, unknown>;
  },
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sb.from("dialer_events") as any)
    .insert({
      session_id: event.session_id,
      user_id: event.user_id,
      event_type: event.event_type,
      payload: event.payload ?? null,
    })
    .then(({ error }: { error: unknown }) => {
      if (error) {
        console.error(
          "[Dialer/session-manager] Audit event failed (non-fatal):",
          (error as { message?: string }).message,
        );
      }
    });
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Creates a new call session.
 * The session starts in 'initiating' status.
 */
export async function createSession(
  sb: SupabaseClient,
  input: CreateSessionInput,
  userId: string,
): Promise<SessionResult<CallSession>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("call_sessions") as any)
    .insert({
      lead_id: input.lead_id,
      user_id: userId,
      phone_dialed: input.phone_dialed,
      status: "initiating",
      context_snapshot: input.context_snapshot ?? null,
      started_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("[Dialer/session-manager] createSession failed:", error?.message);
    return { data: null, error: error?.message ?? "Insert failed", code: "DB_ERROR" };
  }

  const session = rowToSession(data as CallSessionRow);

  auditEvent(sb, {
    session_id: session.id,
    user_id: userId,
    event_type: "session.created",
    payload: {
      lead_id: input.lead_id,
      phone_dialed: input.phone_dialed,
    },
  });

  return { data: session, error: null };
}

/**
 * Fetches a single session by ID.
 * Returns FORBIDDEN if the session belongs to a different user.
 * Returns NOT_FOUND if no session exists with this ID.
 */
export async function getSession(
  sb: SupabaseClient,
  sessionId: string,
  userId: string,
): Promise<SessionResult<CallSession>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("call_sessions") as any)
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (error) {
    console.error("[Dialer/session-manager] getSession DB error:", error.message);
    return { data: null, error: error.message, code: "DB_ERROR" };
  }

  if (!data) {
    return { data: null, error: "Session not found", code: "NOT_FOUND" };
  }

  const row = data as CallSessionRow;
  if (row.user_id !== userId) {
    return { data: null, error: "Session belongs to another user", code: "FORBIDDEN" };
  }

  return { data: rowToSession(row), error: null };
}

/** Options for listing sessions. */
export interface ListSessionsOptions {
  limit?: number;
  status?: CallSessionStatus;
  lead_id?: string;
}

/**
 * Lists recent sessions for the authenticated user.
 * Always scoped to userId — never returns another user's sessions.
 * Ordered by started_at DESC.
 */
export async function listRecentSessions(
  sb: SupabaseClient,
  userId: string,
  options: ListSessionsOptions = {},
): Promise<SessionListResult> {
  const limit = Math.min(options.limit ?? 20, 50);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (sb.from("call_sessions") as any)
    .select("*")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (options.status) {
    query = query.eq("status", options.status);
  }

  if (options.lead_id) {
    query = query.eq("lead_id", options.lead_id);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[Dialer/session-manager] listRecentSessions error:", error.message);
    return { data: [], error: error.message };
  }

  const sessions = ((data as CallSessionRow[]) ?? []).map(rowToSession);
  return { data: sessions, error: null };
}

/**
 * Updates a session. Enforces:
 * 1. Ownership — session must belong to userId
 * 2. Status transitions — validated against VALID_TRANSITIONS
 * 3. Terminal protection — ended/failed sessions cannot be updated
 *
 * The DB trigger (tg_call_session_transition) provides a second layer
 * of transition enforcement at the database level.
 */
export async function updateSession(
  sb: SupabaseClient,
  sessionId: string,
  userId: string,
  update: UpdateSessionInput,
): Promise<SessionResult<CallSession>> {
  // Fetch current state for ownership + transition validation
  const current = await getSession(sb, sessionId, userId);
  if (current.error || !current.data) {
    return current as SessionResult<CallSession>;
  }

  const currentSession = current.data;
  const previousStatus = currentSession.status;

  // Status transition validation (application layer)
  if (update.status !== undefined) {
    if (TERMINAL_STATUSES.has(currentSession.status)) {
      return {
        data: null,
        error: `Cannot update a session in terminal status "${currentSession.status}"`,
        code: "INVALID_TRANSITION",
      };
    }

    if (
      update.status !== currentSession.status &&
      !isValidTransition(currentSession.status, update.status)
    ) {
      return {
        data: null,
        error: `Invalid status transition: "${currentSession.status}" → "${update.status}"`,
        code: "INVALID_TRANSITION",
      };
    }
  }

  // Build the update payload — only include provided fields
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = {};
  if (update.status     !== undefined) patch.status       = update.status;
  if (update.twilio_sid !== undefined) patch.twilio_sid   = update.twilio_sid;
  if (update.ended_at   !== undefined) patch.ended_at     = update.ended_at;
  if (update.duration_sec !== undefined) patch.duration_sec = update.duration_sec;
  if (update.disposition  !== undefined) patch.disposition  = update.disposition;
  if (update.ai_summary   !== undefined) patch.ai_summary   = update.ai_summary;

  if (Object.keys(patch).length === 0) {
    // Nothing to update — return current session as-is
    return { data: currentSession, error: null };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("call_sessions") as any)
    .update(patch)
    .eq("id", sessionId)
    .eq("user_id", userId)  // redundant safety: ownership re-checked at DB level
    .select("*")
    .single();

  if (error || !data) {
    // Check if the DB trigger rejected the transition (ERRCODE 23514)
    const pgError = error as { code?: string; message?: string } | null;
    if (pgError?.code === "23514") {
      return {
        data: null,
        error: pgError.message ?? "Invalid status transition (DB constraint)",
        code: "INVALID_TRANSITION",
      };
    }
    console.error("[Dialer/session-manager] updateSession failed:", error?.message);
    return { data: null, error: error?.message ?? "Update failed", code: "DB_ERROR" };
  }

  const updated = rowToSession(data as CallSessionRow);

  // Audit significant state changes
  if (update.status !== undefined && update.status !== previousStatus) {
    const eventType: DialerEventType =
      TERMINAL_STATUSES.has(update.status)
        ? "session.ended"
        : "session.status_changed";

    auditEvent(sb, {
      session_id: sessionId,
      user_id: userId,
      event_type: eventType,
      payload: {
        from: previousStatus,
        to: update.status,
        ...(update.disposition && { disposition: update.disposition }),
      },
    });
  }

  if (update.twilio_sid !== undefined && !currentSession.twilio_sid) {
    auditEvent(sb, {
      session_id: sessionId,
      user_id: userId,
      event_type: "session.twilio_linked",
      payload: { twilio_sid: update.twilio_sid },
    });
  }

  return { data: updated, error: null };
}

// Re-export for route use (avoids routes importing directly from ./types)
export { VALID_TRANSITIONS, CallSessionStatus };
