/**
 * Dialer domain types — PR1
 *
 * BOUNDARY RULE: This file has ZERO imports. It is pure TypeScript types.
 * All dialer files import from here. CRM files must never import from here.
 *
 * Future extraction: copy this file as-is into the dialer package.
 */

// ─────────────────────────────────────────────────────────────
// Call Session Status State Machine
// ─────────────────────────────────────────────────────────────

export type CallSessionStatus =
  | "initiating"  // session created, call not yet ringing
  | "ringing"     // Twilio confirmed outbound ringing
  | "connected"   // call answered, conversation in progress
  | "ended"       // call completed normally (terminal)
  | "failed";     // call failed to connect or errored (terminal)

/**
 * Valid status transitions. Enforced both here (application layer)
 * and in the DB trigger (tg_call_session_transition).
 *
 * Terminal states (ended, failed) have empty arrays — no outbound transitions.
 */
export const VALID_TRANSITIONS: Record<CallSessionStatus, CallSessionStatus[]> = {
  initiating: ["ringing", "connected", "failed"],
  ringing:    ["connected", "ended", "failed"],
  connected:  ["ended", "failed"],
  ended:      [],
  failed:     [],
};

export const TERMINAL_STATUSES: ReadonlySet<CallSessionStatus> = new Set([
  "ended",
  "failed",
]);

/** Returns true if the given status transition is valid. */
export function isValidTransition(
  from: CallSessionStatus,
  to: CallSessionStatus,
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─────────────────────────────────────────────────────────────
// Domain Objects
// ─────────────────────────────────────────────────────────────

/**
 * The dialer's read-only snapshot of CRM state at call start.
 * Built by crm-bridge.ts. Stored in call_sessions.context_snapshot.
 * Never updated after session creation.
 *
 * In extraction (Stage 3+), crm-bridge.ts returns this via HTTP.
 * The shape of this interface is the API contract between CRM and dialer.
 */
export interface CRMLeadContext {
  leadId: string;
  ownerName: string | null;
  phone: string | null;
  address: string | null;

  // Qualification signals (read-only at call time)
  motivationLevel: number | null;       // 1–5
  sellerTimeline: string | null;        // immediate | 30_days | 60_days | flexible | unknown
  qualificationRoute: string | null;    // offer_ready | follow_up | nurture | dead | escalate

  // Call history summary
  totalCalls: number;
  liveAnswers: number;
  lastCallDisposition: string | null;
  lastCallDate: string | null;          // ISO timestamp
  nextCallScheduledAt: string | null;   // ISO timestamp

  // Last-call content — for live-call memory surface.
  // lastCallNotes: operator-published summary from publish-manager (highest trust).
  //   Written by publish-manager to calls_log.notes. Shown without qualification.
  // lastCallAiSummary: raw AI output from /api/dialer/summarize (lower trust).
  //   Only used when lastCallNotes is absent. Always labeled as AI-generated.
  lastCallNotes: string | null;
  lastCallAiSummary: string | null;

  // Open follow-up or appointment task for this lead, if any.
  // Sourced from tasks table via crm-bridge (operator-created or publish-manager-created).
  // Answers "what was promised on the last call / why are we calling now?"
  // openTaskTitle: the task title as written at publish time (e.g. "Follow up — Sarah Johnson")
  // openTaskDueAt: ISO timestamp of the task due date, for displaying when it was promised
  // Both null if no pending task exists for this lead.
  openTaskTitle: string | null;
  openTaskDueAt: string | null;
}

/**
 * A dialer call session. Maps 1:1 to a call_sessions row.
 */
export interface CallSession {
  id: string;
  lead_id: string | null;
  user_id: string;
  twilio_sid: string | null;
  phone_dialed: string;
  status: CallSessionStatus;
  started_at: string;          // ISO timestamp
  ended_at: string | null;
  duration_sec: number | null;
  updated_at: string;
  context_snapshot: CRMLeadContext | null;
  ai_summary: string | null;
  disposition: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────
// Input / Output shapes for service layer
// ─────────────────────────────────────────────────────────────

export interface CreateSessionInput {
  lead_id: string;
  phone_dialed: string;
  context_snapshot?: CRMLeadContext;  // built automatically by route if omitted
}

export interface UpdateSessionInput {
  status?: CallSessionStatus;
  twilio_sid?: string;
  ended_at?: string;       // ISO timestamp
  duration_sec?: number;
  disposition?: string;
  ai_summary?: string;
}

// ─────────────────────────────────────────────────────────────
// Service result types
// ─────────────────────────────────────────────────────────────

export type SessionErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "INVALID_TRANSITION"
  | "DB_ERROR"
  | "VALIDATION_ERROR";

export interface SessionResult<T> {
  data: T | null;
  error: string | null;
  code?: SessionErrorCode;
}

export interface SessionListResult {
  data: CallSession[];
  error: string | null;
}

// ─────────────────────────────────────────────────────────────
// Dialer event types (for dialer_events table)
// ─────────────────────────────────────────────────────────────

export type DialerEventType =
  // Session lifecycle (written by session-manager.ts)
  | "session.created"
  | "session.status_changed"
  | "session.twilio_linked"
  | "session.ended"
  // Publish-time outcomes (written by publish-manager.ts)
  // call.published: every successful publishSession — core workflow event
  | "call.published"
  // follow_up.task_created: a tasks row was created at publish time
  | "follow_up.task_created"
  // follow_up.callback_date_defaulted: operator skipped date entry; task due_at was defaulted
  //   to next business morning. Signal for callback slippage measurement.
  | "follow_up.callback_date_defaulted"
  // ai_output.reviewed: operator reached Step 3 and published with an extract_run_id present.
  //   Captures motivation_corrected and timeline_corrected for eval loop.
  | "ai_output.reviewed"
  // ai_output.flagged: operator explicitly flagged the AI summary as bad in Step 3.
  | "ai_output.flagged";

// ─────────────────────────────────────────────────────────────
// Trace metadata — PR2
// Attached to AI-generated session notes (session_notes.trace_metadata).
// ─────────────────────────────────────────────────────────────

export interface TraceMetadata {
  model: string;           // e.g. "claude-opus-4-6"
  provider: string;        // "anthropic" | "openai" | "xai" | "stub"
  latency_ms: number;
  generated_at: string;    // ISO timestamp
  input_tokens?: number;
  output_tokens?: number;
  /** Semver string identifying the prompt template that produced this output. */
  prompt_version?: string;
  /** UUID assigned to this specific invocation for audit / eval correlation. */
  run_id?: string;
}

// ─────────────────────────────────────────────────────────────
// Publish types — PR3
// Used by publish-manager.ts and the publish route.
// ─────────────────────────────────────────────────────────────

/**
 * Human-meaningful call outcomes accepted by the publish endpoint.
 *
 * "completed" is intentionally included: it signals "we talked, no richer
 * classification needed." It is also in PROVISIONAL_DISPOSITIONS inside
 * publish-manager.ts because Twilio sets it as a technical call-ended state
 * that a richer human outcome should supersede. Publishing "completed"
 * explicitly over Twilio's "completed" is a harmless no-op; publishing
 * "voicemail" over Twilio's "completed" is the expected enrichment path.
 *
 * Machine/provisional states (initiated, ringing_agent, etc.) are excluded.
 */
export type PublishDisposition =
  | "completed"       // connected, talked to seller — no richer outcome needed
  | "voicemail"       // left or attempted voicemail
  | "no_answer"       // no pickup, no voicemail left
  | "not_interested"  // seller declined
  | "follow_up"       // needs callback / follow-up
  | "appointment"     // set appointment on this call
  | "offer_made"      // made an offer on this call
  | "disqualified";   // definitively dead

export const PUBLISH_DISPOSITIONS: readonly PublishDisposition[] = [
  "completed", "voicemail", "no_answer", "not_interested",
  "follow_up", "appointment", "offer_made", "disqualified",
] as const;

export type SellerTimeline = "immediate" | "30_days" | "60_days" | "flexible" | "unknown";
export const SELLER_TIMELINES: readonly SellerTimeline[] = [
  "immediate", "30_days", "60_days", "flexible", "unknown",
] as const;

export type QualificationRoute = "offer_ready" | "follow_up" | "nurture" | "dead" | "escalate";
export const QUALIFICATION_ROUTES: readonly QualificationRoute[] = [
  "offer_ready", "follow_up", "nurture", "dead", "escalate",
] as const;

export interface PublishInput {
  disposition: PublishDisposition;
  duration_sec?: number;
  motivation_level?: 1 | 2 | 3 | 4 | 5;
  seller_timeline?: SellerTimeline;
  qualification_route?: QualificationRoute;
  summary?: string;
  /**
   * ISO8601 datetime. When provided and disposition is follow_up or appointment,
   * publish-manager creates a tasks row for the operator.
   */
  callback_at?: string;
  /**
   * User ID to assign the created task to. Defaults to the session owner (userId).
   */
  task_assigned_to?: string;
  /**
   * run_id from the most recent extract invocation in this session.
   * When present, the publish route updates the corresponding dialer_ai_traces
   * row with review_flag and ai_corrections, closing the operator review loop.
   */
  extract_run_id?: string;
  /**
   * True if Logan explicitly flagged the AI summary as bad in Step 3.
   * Sets review_flag = true on the dialer_ai_traces row for extract_run_id.
   */
  summary_flagged?: boolean;
  /**
   * Which AI-suggested qualification fields the operator corrected.
   * Captured from the aiSuggested set in PostCallPanel at publish time.
   */
  ai_corrections?: {
    motivation_corrected: boolean;
    timeline_corrected: boolean;
  };
}

export interface PublishResult {
  ok: boolean;
  calls_log_id: string | null;
  lead_id: string | null;
  /** UUID of the tasks row created, if callback_at was provided. */
  task_id?: string | null;
  error?: string;
  /**
   * INVALID_TRANSITION = session not yet in a terminal state.
   * DB_ERROR = Supabase write failed.
   * NOT_FOUND / FORBIDDEN = session ownership check failed.
   */
  code?: SessionErrorCode;
}
