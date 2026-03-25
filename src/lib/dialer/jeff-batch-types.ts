/**
 * Jeff batch outbound types — UI contract for the Jeff tab on the dialer.
 *
 * Cursor builds the Jeff tab against these types.
 * Claude Code owns the backend that produces/consumes them.
 */

/** Per-lead status within a Jeff batch run */
export type JeffCallStatus =
  | "idle"         // not yet queued
  | "queued"       // selected for batch, waiting to be called
  | "calling"      // Vapi call in progress
  | "transferred"  // Jeff got a live answer and transferred to operator
  | "completed"    // call finished (any terminal outcome)
  | "failed"       // Vapi error or session creation failure
  | "skipped";     // DNC, no phone, or business hours violation

/** A lead in the Jeff batch view */
export interface JeffBatchLead {
  leadId: string;
  leadName: string;
  phone: string;
  phoneId: string | null;
  autoCycleRound: number;
  autoCycleStatus: string;
  remainingPhones: number;
  voicemailDropNext: boolean;
  jeffStatus: JeffCallStatus;
  voiceSessionId: string | null;
  disposition: string | null;
  error: string | null;
}

/** State for the Jeff batch panel */
export interface JeffBatchState {
  batchId: string | null;
  leads: JeffBatchLead[];
  inProgress: boolean;
  startedAt: string | null;
}
