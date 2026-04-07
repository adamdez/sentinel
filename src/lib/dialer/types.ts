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

  // PR-1: the operator's committed next step for this lead.
  // Written by publish-manager (at call end) or update_next_action MCP tool (agent/async).
  // nextAction:       imperative description of what needs to happen next.
  // nextActionDueAt:  ISO timestamp deadline, null if no deadline set.
  // Both null on first contact or when no action has been committed yet.
  nextAction: string | null;
  nextActionDueAt: string | null;

  // PR-18: Dossier projection fields (Blueprint 9.1).
  // Populated from leads table CRM projection columns, which are synced
  // from the most recently promoted dossier via syncDossierToLead().
  // All null until the Research Agent runs and a dossier is promoted.
  sellerSituationSummary: string | null;
  recommendedCallAngle: string | null;
  likelyDecisionMaker: string | null;
  decisionMakerConfidence: string | null; // weak | probable | strong | verified
  topFact1: string | null;
  topFact2: string | null;
  topFact3: string | null;
  opportunityScore: number | null;        // 0-100
  confidenceScore: number | null;         // 0-100

  // Open objections from previous calls — gives Logan immediate context
  // on what blocked the deal last time. Sourced from lead_objection_tags.
  openObjections: Array<{ tag: string; note: string | null; created_at: string }> | null;

  // Phone roster for dialer phone cycling.
  // Populated from lead_phones table. The dialer uses this to show all
  // available phones and auto-load the next un-called number.
  availablePhones: LeadPhone[] | null;
  nextPhoneToDial: string | null;       // phone number of the next un-called active phone
  phonesAttemptedCount: number;          // how many active phones have been called
  phonesActiveCount: number;             // total active (non-dead, non-dnc) phones
}

/**
 * A phone number associated with a lead, sourced from the lead_phones table.
 * Used by dialer for phone cycling and by contact tab for display/management.
 */
export interface LeadPhone {
  id: string;
  phone: string;
  label: "mobile" | "landline" | "voip" | "unknown";
  source: string;
  status: "active" | "dead" | "dnc";
  dead_reason: string | null;
  is_primary: boolean;
  position: number;
  last_called_at: string | null;
  call_count: number;
}

export type AutoCycleStatus = "ready" | "waiting" | "paused" | "exited";
export type AutoCyclePhoneStatus = "active" | "dead" | "dnc" | "completed" | "exited";

export interface AutoCycleLeadState {
  id: string;
  leadId: string;
  cycleStatus: AutoCycleStatus;
  currentRound: number;
  nextDueAt: string | null;
  nextPhoneId: string | null;
  lastOutcome: string | null;
  exitReason: string | null;
  readyNow: boolean;
  voicemailDropNext: boolean;
  remainingPhones: number;
}

export interface AutoCyclePhoneState {
  id: string;
  cycleLeadId: string;
  leadId: string;
  phoneId: string | null;
  phone: string;
  phonePosition: number;
  attemptCount: number;
  nextAttemptNumber: number | null;
  nextDueAt: string | null;
  lastAttemptAt: string | null;
  lastOutcome: string | null;
  voicemailDropNext: boolean;
  phoneStatus: AutoCyclePhoneStatus;
  exitReason: string | null;
  dueNow: boolean;
}

// ─────────────────────────────────────────────────────────────
// Repeat-call memory — richer context fetched on-demand
// ─────────────────────────────────────────────────────────────

/**
 * Source/provenance of a memory value.
 * operator = written/confirmed by a human operator.
 * ai        = derived by an AI model, not yet operator-confirmed.
 * system    = computed by the system from structured data (e.g. call count).
 */
export type MemorySource = "operator" | "ai" | "system";

/**
 * A single historical call entry for the memory surface.
 * Shows up to 3 of these in the repeat-call memory block.
 */
export interface CallMemoryEntry {
  callLogId:    string;
  date:         string;           // ISO timestamp
  disposition:  string | null;
  durationSec:  number | null;
  /** Operator-written note (calls_log.notes). Highest trust. */
  notes:        string | null;
  /** AI-generated summary (calls_log.ai_summary). Lower trust. */
  aiSummary:    string | null;
  /** Which content field to show first: "notes" | "ai" | null */
  preferSource: "notes" | "ai" | null;
}

/**
 * Rich repeat-call memory block.
 * Fetched on-demand from /api/dialer/v1/leads/[lead_id]/call-memory.
 * NOT frozen in context_snapshot — always current at fetch time.
 *
 * All fields are optional / nullable — the panel must degrade gracefully
 * when fields are absent (first contact, no notes, no dossier, etc.).
 */
export interface RepeatCallMemory {
  leadId: string;

  // ── Decision-maker context ────────────────────────────────
  /** Operator-written note about who is the likely decision-maker.
   *  Sourced from leads.decision_maker_note.
   *  source = "operator" if decision_maker_confirmed = true, else "ai" */
  decisionMakerNote:      string | null;
  decisionMakerSource:    MemorySource | null;
  decisionMakerConfirmed: boolean;

  // ── Recent call history ───────────────────────────────────
  /** Last 3 calls, most recent first. */
  recentCalls: CallMemoryEntry[];

  // ── Staleness signal ──────────────────────────────────────
  /** Days since last live answer (disposition = completed/follow_up/appointment/offer_made).
   *  null if no live answers on record. Used for freshness cues. */
  daysSinceLastLiveAnswer: number | null;

  /** Days since any contact (last call regardless of outcome).
   *  null if never called. */
  daysSinceLastContact: number | null;

  // ── Structured post-call data (from most recent call) ────
  /** Promises made during the most recent call (from post_call_structures). */
  lastCallPromises:        string | null;
  /** Primary unresolved objection from the most recent call. */
  lastCallObjection:       string | null;
  /** Suggested next action from the most recent call. */
  lastCallNextAction:      string | null;
  /** Best callback timing preference captured from most recent call. */
  lastCallCallbackTiming:  string | null;
  /** Deal temperature from the most recent call. */
  lastCallDealTemperature: string | null;
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
  lead_id: string | null;
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
  | "ai_output.flagged"
  // inbound.missed: a seller called the Dominion number and the call was not answered.
  //   Creates a callback task and surfaces in the missed-inbound recovery queue.
  | "inbound.missed"
  // inbound.answered: the call was forwarded and the operator picked up.
  //   Written by the Twilio action callback when DialCallStatus=in-progress.
  //   Surfaces context on the live inbound page.
  | "inbound.answered"
  // inbound.outcome: operator logged the outcome of a live inbound call.
  //   Written by POST /api/dialer/v1/inbound/[event_id]/outcome.
  //   Mirrors the outbound PublishDisposition vocabulary.
  | "inbound.outcome"
  // inbound.classified: operator classified the caller type and captured structured intake.
  //   Written by POST /api/dialer/v1/inbound/[event_id]/classify.
  //   metadata contains caller_type, seller intake fields, routing action.
  | "inbound.classified"
  // transfer.attempted: operator initiated a warm transfer (three-way or handoff).
  //   Written by POST /api/dialer/v1/inbound/[event_id]/transfer with outcome=attempted.
  | "transfer.attempted"
  // transfer.connected: warm transfer was completed — recipient answered and seller was connected.
  //   Written by POST …/transfer with outcome=connected.
  | "transfer.connected"
  // transfer.failed_fallback: warm transfer was attempted but recipient did not answer,
  //   or transfer failed. Operator fell back to callback booking.
  //   Written by POST …/transfer with outcome=no_answer|callback_fallback|failed.
  | "transfer.failed_fallback"
  // inbound.recovered: operator explicitly marked the missed inbound as recovered
  //   (callback was completed or lead was reached another way).
  | "inbound.recovered"
  // inbound.dismissed: operator dismissed the missed-inbound signal with a reason.
  | "inbound.dismissed"
  // inbound.draft_pending: operator has reviewed a live inbound seller call and
  //   assembled a writeback draft (caller type, situation summary, disposition,
  //   callback commitment) but has not yet committed it to CRM tables.
  //   Draft fields live in metadata. The draft is non-destructive until committed.
  | "inbound.draft_pending"
  // inbound.committed: operator approved the inbound draft. A calls_log row was
  //   created and (optionally) leads.notes was updated via the narrow writeback contract.
  //   metadata contains calls_log_id and the approved field set.
  | "inbound.committed"
  // outbound.ai_handled: Jeff (Vapi) completed an outbound call.
  //   Written by the Vapi webhook end-of-call handler for outbound direction.
  | "outbound.ai_handled"
  // session.unlinked_warning: outbound session created without a linked lead_id.
  //   The dialer attempted auto-linking via unifiedPhoneLookup but found no match.
  //   Creates an audit trail for calls made to numbers not yet in the CRM.
  | "session.unlinked_warning";

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
  | "dead_phone"      // phone is disconnected/wrong number — mark phone dead, try another
  | "not_interested"  // seller declined
  | "follow_up"       // needs callback / follow-up
  | "appointment"     // set appointment on this call
  | "offer_made"      // made an offer on this call
  | "disqualified"    // disqualify → nurture (recyclable)
  | "dead_lead";      // disqualify → dead (archived, gone)

export const PUBLISH_DISPOSITIONS: readonly PublishDisposition[] = [
  "completed", "voicemail", "no_answer", "dead_phone", "not_interested",
  "follow_up", "appointment", "offer_made", "disqualified", "dead_lead",
] as const;

export type SellerTimeline = "immediate" | "30_days" | "60_days" | "flexible" | "unknown";
export const SELLER_TIMELINES: readonly SellerTimeline[] = [
  "immediate", "30_days", "60_days", "flexible", "unknown",
] as const;

export type QualificationRoute = "offer_ready" | "follow_up" | "nurture" | "dead" | "escalate";
export const QUALIFICATION_ROUTES: readonly QualificationRoute[] = [
  "offer_ready", "follow_up", "nurture", "dead", "escalate",
] as const;

// ─────────────────────────────────────────────────────────────
// Objection tags — operator-facing allowlist
// ─────────────────────────────────────────────────────────────

/**
 * Structured objection tags for post-call capture.
 *
 * Application-layer allowlist — the DB column is TEXT so new tags can be
 * added here without a migration. The tag value is stored verbatim in
 * lead_objection_tags.tag and must appear in this list to be accepted by
 * the publish route.
 *
 * Add new tags here when patterns emerge from operator review.
 * Never rename an existing tag — create a new one and deprecate the old.
 */
export type ObjectionTag =
  | "price_too_low"
  | "not_ready_to_sell"
  | "need_to_think"
  | "talking_to_realtor"
  | "wants_full_retail"
  | "inherited_dispute"
  | "repair_concerns"
  | "bad_timing"
  | "pre_list"
  | "other";

export const OBJECTION_TAGS: readonly ObjectionTag[] = [
  "price_too_low",
  "not_ready_to_sell",
  "need_to_think",
  "talking_to_realtor",
  "wants_full_retail",
  "inherited_dispute",
  "repair_concerns",
  "bad_timing",
  "pre_list",
  "other",
] as const;

/** Human-readable labels for display. */
export const OBJECTION_TAG_LABELS: Record<ObjectionTag, string> = {
  price_too_low:       "Price too low",
  not_ready_to_sell:   "Not ready to sell",
  need_to_think:       "Needs to think",
  talking_to_realtor:  "Talking to realtor",
  wants_full_retail:   "Wants full retail",
  inherited_dispute:   "Inherited / dispute",
  repair_concerns:     "Repair concerns",
  bad_timing:          "Bad timing",
  pre_list:            "Pre-listing",
  other:               "Other",
};

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
  /**
   * Free-text next action for the lead (e.g. "Call back Tuesday 2pm", "Send offer").
   * Written to leads.next_action when provided.
   */
  next_action?: string;
  /**
   * ISO8601 datetime for when the next action is due.
   * Written to leads.next_action_due_at when provided.
   */
  next_action_due_at?: string;
  /**
   * Structured objection tags captured at post-call time.
   * Each entry is one objection instance.
   * publish-manager writes these to lead_objection_tags (non-fatal on failure).
   * Tags must be valid ObjectionTag values — invalid tags are silently dropped.
   */
  objection_tags?: Array<{
    tag:  ObjectionTag;
    note: string | null;
  }>;
  /**
   * Distress signals discovered during the call (e.g. bankruptcy, probate, divorce).
   * publish-manager writes these to distress_events with source "operator_call"
   * and triggers an immediate score recompute for the lead.
   */
  distress_signals?: string[];
  /** Qual checklist confirmations toggled by operator in post-call closeout. */
  qual_confirmed?: {
    decision_maker_confirmed?: boolean;
    condition_level?: number;
    occupancy_score?: number;
  };
}

export interface PublishResult {
  ok: boolean;
  calls_log_id: string | null;
  lead_id: string | null;
  intro_sop_active?: boolean;
  intro_day_count?: number;
  intro_exit_category?: string | null;
  requires_exit_category?: boolean;
  /** UUID of the tasks row created, if callback_at was provided. */
  task_id?: string | null;
  error?: string;
  /** Non-fatal warnings (e.g. "task_creation_failed") surfaced to the UI. */
  warnings?: string[];
  /**
   * INVALID_TRANSITION = session not yet in a terminal state.
   * DB_ERROR = Supabase write failed.
   * NOT_FOUND / FORBIDDEN = session ownership check failed.
   */
  code?: SessionErrorCode;
}

// ─────────────────────────────────────────────────────────────
// Inbound writeback contract — PR inbound-summary
// Used by inbound-writeback.ts and the inbound draft/commit routes.
// ─────────────────────────────────────────────────────────────

/**
 * Caller type for inbound classification.
 * Mirrors InboundCallerType in the classify route — kept here as the
 * authoritative type so future AI receptionist behavior can reference it.
 */
export type InboundCallerType = "seller" | "buyer" | "vendor" | "spam" | "unknown";

/**
 * The approved field set for inbound-to-CRM writeback.
 *
 * This is intentionally narrower than PublishInput:
 *   - No qualification fields (we don't know the caller is the DM yet)
 *   - No AI trace plumbing (no session to trace against)
 *   - No overwrite of existing disposition unless explicitly provided
 *
 * Fields map to their CRM targets:
 *   caller_type        → calls_log metadata (informational, not a DB column)
 *   subject_address    → calls_log metadata (property is not verified yet)
 *   situation_summary  → calls_log.notes (requires operator review before write)
 *   disposition        → calls_log.disposition
 *   callback_at        → tasks.due_at (creates a task if present)
 *   note_draft         → operator-edited version of situation_summary shown in the review UI
 *
 * Durable writes:
 *   calls_log row created (INSERT) — one per committed inbound call
 *   leads.notes — ONLY if update_lead_notes = true AND the inbound event has a lead_id
 *     (never auto-written — requires explicit operator approval in the review UI)
 */
export interface InboundWritebackInput {
  caller_type:        InboundCallerType;
  subject_address?:   string | null;
  situation_summary?: string | null;   // raw capture from classify
  note_draft?:        string | null;   // operator-edited version (used for calls_log.notes)
  disposition:        InboundDisposition;
  callback_at?:       string | null;   // ISO — for task creation
  /** If true, also writes note_draft to leads.notes (only if lead_id is known) */
  update_lead_notes?: boolean;
  /** Source of the note_draft — "operator" or "ai_draft" */
  note_source?:       "operator" | "ai_draft";
}

/**
 * Inbound call dispositions accepted by the writeback contract.
 * Narrower than PublishDisposition — inbound calls have a different vocabulary.
 * "seller_answered" = we talked to a known seller
 * "new_lead"        = caller appears to be a new seller (no existing lead_id)
 * All others match InboundDisposition from the outcome route.
 */
export type InboundDisposition =
  | "seller_answered"
  | "new_lead"
  | "voicemail"
  | "wrong_number"
  | "callback_requested"
  | "appointment"
  | "no_action";

export const INBOUND_DISPOSITIONS: readonly InboundDisposition[] = [
  "seller_answered", "new_lead", "voicemail", "wrong_number",
  "callback_requested", "appointment", "no_action",
] as const;

/**
 * The reviewable draft assembled from inbound call data.
 * Stored in dialer_events.metadata for inbound.draft_pending events.
 * Shown to the operator for approve / edit / reject.
 */
export interface InboundWritebackDraft {
  /** The inbound event_id this draft belongs to (inbound.answered or inbound.missed) */
  inbound_event_id:  string;
  lead_id:           string | null;
  from_number:       string | null;
  caller_type:       InboundCallerType;
  subject_address:   string | null;
  /** Raw capture from classify — may be AI-derived */
  situation_summary: string | null;
  /** Operator-edited note, defaults to situation_summary if not edited */
  note_draft:        string | null;
  disposition:       InboundDisposition;
  callback_at:       string | null;
  /** Source label shown in the review UI */
  note_source:       "operator" | "ai_draft";
  /** Whether the operator explicitly approved writing note_draft to leads.notes */
  update_lead_notes: boolean;
  /** ISO timestamp of when the draft was last saved */
  saved_at:          string;
  /** Whether this draft has already been committed (read-only after commit) */
  committed:         boolean;
  calls_log_id:      string | null;   // set after commit
}
