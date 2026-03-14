/**
 * Dialer domain DB row types — PR1
 *
 * Raw TypeScript mirrors of the dialer DB tables.
 * These are NOT Drizzle definitions. The dialer domain deliberately
 * does NOT add its tables to src/db/schema.ts (CRM-owned Drizzle schema).
 *
 * BOUNDARY RULE:
 *   - This file imports ONLY from ./types.ts
 *   - Never import from @/db/schema (CRM Drizzle schema)
 *   - Never import from @/lib/supabase-types (CRM type mirrors)
 *
 * Future extraction: this file becomes the canonical type source in
 * the dialer package. No changes needed to callers.
 */

import type { CallSessionStatus, CRMLeadContext } from "./types";

// ─────────────────────────────────────────────────────────────
// call_sessions
// ─────────────────────────────────────────────────────────────

export interface CallSessionRow {
  id: string;
  lead_id: string | null;
  user_id: string;
  twilio_sid: string | null;
  phone_dialed: string;
  status: CallSessionStatus;
  started_at: string;
  ended_at: string | null;
  duration_sec: number | null;
  updated_at: string;
  context_snapshot: CRMLeadContext | null;
  ai_summary: string | null;
  disposition: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────
// session_notes (table exists, API routes ship in PR2)
// ─────────────────────────────────────────────────────────────

export type SessionNoteType = "transcript_chunk" | "ai_suggestion" | "operator_note";
export type SessionNoteSpeaker = "operator" | "seller" | "ai";

export interface SessionNoteRow {
  id: string;
  session_id: string;
  note_type: SessionNoteType;
  speaker: SessionNoteSpeaker | null;
  content: string;
  confidence: number | null;    // 0.00–1.00 for transcript_chunk; null otherwise
  is_ai_generated: boolean;
  is_confirmed: boolean;
  sequence_num: number;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────
// session_extracted_facts (table exists, API routes ship in PR3)
// ─────────────────────────────────────────────────────────────

export type SessionFactType =
  | "motivation_signal"
  | "price_mention"
  | "timeline_mention"
  | "condition_note"
  | "objection"
  | "follow_up_intent"
  | "red_flag";

export interface SessionExtractedFactRow {
  id: string;
  session_id: string;
  fact_type: SessionFactType;
  raw_text: string;
  structured_value: Record<string, unknown> | null;
  is_ai_generated: boolean;
  is_confirmed: boolean;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────
// dialer_events
// ─────────────────────────────────────────────────────────────

export interface DialerEventRow {
  id: string;
  session_id: string | null;
  user_id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}
