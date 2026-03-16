/**
 * Inbound Writeback Contract
 *
 * Writes inbound call outcomes to CRM tables after explicit operator approval.
 * This is the narrowly-scoped sibling of publishSession for inbound calls.
 *
 * BOUNDARY RULES:
 *   - The ONLY file in the inbound domain that writes CRM tables (calls_log, leads)
 *   - Called ONLY from the commit route after explicit operator approval
 *   - Must receive an inbound_event_id and a fully-reviewed InboundWritebackInput
 *   - No session ownership check (inbound calls have no session) — ownership
 *     is verified at the route layer via getDialerUser()
 *   - Does NOT import crm-bridge.ts
 *   - Does NOT import publish-manager.ts
 *
 * Approved writes:
 *   1. calls_log INSERT (one row per committed inbound call — never updates existing)
 *   2. leads.notes UPDATE (only when update_lead_notes = true and lead_id is known)
 *   3. dialer_events INSERT (inbound.committed event for audit trail)
 *
 * Non-writes (explicitly deferred):
 *   - leads.motivation_level, leads.seller_timeline, leads.condition_level
 *     (we may not be speaking to the DM — skip qual writes)
 *   - leads.qualification_route (too consequential without a full session context)
 *   - calls_log.session_id (null — no outbound session on inbound calls)
 *   - contacts, properties, buyers tables (out of scope for v1)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  InboundWritebackInput,
  InboundWritebackDraft,
  InboundDisposition,
} from "./types";

export type { InboundWritebackInput, InboundWritebackDraft };

// ── Result shape ──────────────────────────────────────────────────────────────

export interface InboundWritebackResult {
  ok:           boolean;
  calls_log_id: string | null;
  lead_notes_updated: boolean;
  error?:       string;
}

// ── Duration from disposition ─────────────────────────────────────────────────
// Inbound calls don't have Twilio duration. Use a sentinel null — honest.
// Future: if Twilio sends DialCallDuration on the action callback, pass it in.

// ── Disposition mapping to calls_log.disposition ─────────────────────────────
// calls_log.disposition is a text column — no enum constraint.
// Map InboundDisposition to a meaningful value that won't conflict with
// the PROVISIONAL_DISPOSITIONS set in publish-manager.ts.
const DISPOSITION_MAP: Record<InboundDisposition, string> = {
  seller_answered:     "completed",
  new_lead:            "completed",
  voicemail:           "voicemail",
  wrong_number:        "no_answer",
  callback_requested:  "follow_up",
  appointment:         "appointment",
  no_action:           "completed",
};

// ── commitInboundWriteback ────────────────────────────────────────────────────

/**
 * Commits a reviewed inbound writeback draft to CRM tables.
 *
 * @param sb          - Supabase client (authenticated, server-side)
 * @param userId      - The operator who approved the commit
 * @param inboundEventId - The inbound.answered or inbound.missed event_id this call belongs to
 * @param leadId      - CRM lead_id if the caller was matched to a lead (may be null for new leads)
 * @param fromNumber  - Caller's phone number (E.164)
 * @param input       - The reviewed and approved writeback field set
 */
export async function commitInboundWriteback(
  sb:              SupabaseClient,
  userId:          string,
  inboundEventId:  string,
  leadId:          string | null,
  fromNumber:      string | null,
  input:           InboundWritebackInput,
): Promise<InboundWritebackResult> {

  // ── 1. Guard: check for existing commit on this inbound event ──────────────
  // Prevent double-commit if the operator submits twice.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (sb.from("dialer_events") as any)
    .select("id, metadata")
    .eq("event_type", "inbound.committed")
    .contains("metadata", { inbound_event_id: inboundEventId })
    .maybeSingle();

  if (existing) {
    const existingCallsLogId = existing.metadata?.calls_log_id as string | null;
    return {
      ok:                  true,
      calls_log_id:        existingCallsLogId ?? null,
      lead_notes_updated:  false,
      error:               "Already committed — returning existing calls_log_id",
    };
  }

  // ── 2. Validate disposition ────────────────────────────────────────────────
  const mappedDisposition = DISPOSITION_MAP[input.disposition];
  if (!mappedDisposition) {
    return {
      ok:                 false,
      calls_log_id:       null,
      lead_notes_updated: false,
      error:              `Unknown disposition: ${input.disposition}`,
    };
  }

  // ── 3. INSERT calls_log row ────────────────────────────────────────────────
  // session_id is null — inbound calls have no outbound dialer session.
  // source = "inbound" distinguishes from outbound call history.

  const noteToWrite = (input.note_draft ?? input.situation_summary ?? "").trim() || null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: callsLogRow, error: callsLogErr } = await (sb.from("calls_log") as any)
    .insert({
      lead_id:      leadId,
      session_id:   null,
      called_at:    new Date().toISOString(),
      disposition:  mappedDisposition,
      notes:        noteToWrite,
      duration_sec: null,    // honest null — Twilio duration not captured here
      ai_summary:   null,
      source:       "inbound",
      metadata: {
        caller_type:      input.caller_type,
        subject_address:  input.subject_address ?? null,
        from_number:      fromNumber,
        inbound_event_id: inboundEventId,
        note_source:      input.note_source ?? "operator",
        committed_by:     userId,
        committed_at:     new Date().toISOString(),
      },
    })
    .select("id")
    .single();

  if (callsLogErr) {
    console.error("[inbound-writeback] calls_log INSERT failed:", callsLogErr.message);
    return {
      ok:                 false,
      calls_log_id:       null,
      lead_notes_updated: false,
      error:              `calls_log write failed: ${callsLogErr.message}`,
    };
  }

  const callsLogId: string = callsLogRow.id;

  // ── 4. Optional: update leads.notes ───────────────────────────────────────
  // Only when:
  //   - update_lead_notes = true (explicit operator approval)
  //   - lead_id is known
  //   - note_draft is non-empty
  // This is the only CRM truth write. It OVERWRITES existing leads.notes.
  // Operator must explicitly approve this in the review UI.
  let leadNotesUpdated = false;

  if (input.update_lead_notes && leadId && noteToWrite) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: leadNotesErr } = await (sb.from("leads") as any)
      .update({
        notes:      noteToWrite,
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId);

    if (leadNotesErr) {
      // Non-fatal — calls_log is the primary write; leads.notes is bonus
      console.error("[inbound-writeback] leads.notes UPDATE failed (non-fatal):", leadNotesErr.message);
    } else {
      leadNotesUpdated = true;
    }
  }

  // ── 5. Write inbound.committed audit event ────────────────────────────────
  // Fire-and-forget — never blocks commit result.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sb.from("dialer_events") as any)
    .insert({
      event_type: "inbound.committed",
      lead_id:    leadId,
      session_id: null,
      task_id:    null,
      metadata: {
        inbound_event_id:  inboundEventId,
        calls_log_id:      callsLogId,
        caller_type:       input.caller_type,
        disposition:       input.disposition,
        subject_address:   input.subject_address ?? null,
        note_source:       input.note_source ?? "operator",
        update_lead_notes: input.update_lead_notes ?? false,
        lead_notes_updated: leadNotesUpdated,
        committed_by:      userId,
        committed_at:      new Date().toISOString(),
      },
    })
    .then(({ error }: { error: unknown }) => {
      if (error) {
        console.error(
          "[inbound-writeback] inbound.committed event write failed (non-fatal):",
          (error as { message?: string }).message,
        );
      }
    });

  return {
    ok:                  true,
    calls_log_id:        callsLogId,
    lead_notes_updated:  leadNotesUpdated,
  };
}

// ── buildDraftFromEvents ──────────────────────────────────────────────────────

/**
 * Assembles an InboundWritebackDraft from the dialer_events chain for an
 * inbound call (inbound.answered/missed + inbound.classified + inbound.outcome).
 * Used by the draft GET route to populate the review UI without a stored draft.
 *
 * Priority for fields:
 *   1. inbound.classified (structured operator intake — highest trust)
 *   2. inbound.outcome (disposition + notes)
 *   3. inbound.answered/missed (from_number, lead_id)
 */
export function buildDraftFromEvents(events: Array<{
  event_type: string;
  metadata:   Record<string, unknown>;
}>): Omit<InboundWritebackDraft, "saved_at" | "committed" | "calls_log_id"> {

  const base     = events.find((e) => e.event_type === "inbound.answered" || e.event_type === "inbound.missed");
  const classify = events.find((e) => e.event_type === "inbound.classified");
  const outcome  = events.find((e) => e.event_type === "inbound.outcome");

  const leadId      = (base?.metadata?.lead_id     ?? classify?.metadata?.lead_id     ?? null) as string | null;
  const fromNumber  = (base?.metadata?.from_number ?? classify?.metadata?.from_number ?? null) as string | null;
  const inboundEventId = (base?.metadata?.id ?? "") as string;

  const callerType: InboundWritebackDraft["caller_type"] =
    (classify?.metadata?.caller_type as InboundWritebackDraft["caller_type"]) ?? "unknown";

  const subjectAddress = (classify?.metadata?.subject_address ?? null) as string | null;
  const situationSummary = (classify?.metadata?.situation_summary ?? null) as string | null;
  const preferredCallback = (classify?.metadata?.preferred_callback ?? null) as string | null;

  // Derive inbound disposition
  const outcomeDisp = outcome?.metadata?.disposition as string | null;
  const classifyCallback = classify?.metadata?.warm_transfer_ready ? "appointment" : null;
  const rawDisp = outcomeDisp ?? classifyCallback ?? "seller_answered";

  // Map outcome disposition vocabulary to InboundDisposition
  const dispMap: Record<string, InboundDisposition> = {
    answered:            "seller_answered",
    voicemail:           "voicemail",
    wrong_number:        "wrong_number",
    callback_requested:  "callback_requested",
    appointment:         "appointment",
    seller_answered:     "seller_answered",
    new_lead:            "new_lead",
    no_action:           "no_action",
  };
  const disposition: InboundDisposition = dispMap[rawDisp] ?? "seller_answered";

  const callbackAt = (outcome?.metadata?.callback_date ?? preferredCallback ?? null) as string | null;

  // Build note draft — prefer classify situation_summary, fall back to outcome notes
  const outNotes = (outcome?.metadata?.notes ?? null) as string | null;
  const noteDraft = situationSummary ?? outNotes ?? null;

  return {
    inbound_event_id:  inboundEventId,
    lead_id:           leadId,
    from_number:       fromNumber,
    caller_type:       callerType,
    subject_address:   subjectAddress,
    situation_summary: situationSummary,
    note_draft:        noteDraft,
    disposition,
    callback_at:       callbackAt,
    note_source:       "operator" as const,
    update_lead_notes: false,   // always defaults to false — operator must opt in
  };
}
