/**
 * Dialer AI Trace Writer — Phase 2
 *
 * Fire-and-forget writer to dialer_ai_traces.
 * Every AI invocation in the dialer domain calls writeAiTrace().
 * Failures are non-fatal and never block the main request path.
 *
 * BOUNDARY RULES:
 *   - Import ONLY from ./types and ./db
 *   - Never import from @/lib/supabase or any CRM module
 *   - dialer_ai_traces is a dialer-owned table; this is the only file that writes it
 *
 * TRACE DURABILITY GUARANTEE:
 *   dialer_ai_traces is the cross-invocation queryable trace store.
 *   It is NOT the sole trace record. Each workflow maintains its own
 *   primary-record trace field that is written before this function is called:
 *     - summarize: calls_log.summary_trace (written in the main UPDATE)
 *     - extract:   session_notes.trace_metadata (written by note-manager)
 *   If this INSERT fails, the primary-record trace (run_id, prompt_version,
 *   model, latency_ms) remains intact and the output is still debuggable.
 *   This function adds queryability across invocations — it is not
 *   the last line of trace defense.
 *
 *   On failure: logs a structured console.error with run_id + workflow so the
 *   affected primary record can be found by querying calls_log or session_notes.
 *
 * Usage:
 *   writeAiTrace(sb, { ... }).catch(() => {}); // always fire-and-forget
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

export interface AiTraceReviewInput {
  run_id:           string;
  review_flag:      boolean;
  /** JSON-serializable object stored in review_note for eval/correction data. */
  review_note_data?: Record<string, unknown>;
}

export interface AiTraceInput {
  run_id:         string;
  workflow:       "extract" | "summarize";
  prompt_version: string;
  session_id?:    string | null;
  lead_id?:       string | null;
  call_log_id?:   string | null;
  model:          string;
  provider:       string;
  input_text?:    string | null;  // hashed before storage; raw text never stored
  output_text?:   string | null;  // truncated to 4000 chars
  latency_ms?:    number | null;
}

/**
 * Writes a single row to dialer_ai_traces.
 * Always fire-and-forget — caller must .catch(() => {}) this.
 *
 * input_text is SHA-256 hashed before storage so input content never
 * lands in the trace table. The hash alone enables dedup queries.
 */
export async function writeAiTrace(
  sb: SupabaseClient,
  input: AiTraceInput,
): Promise<void> {
  const inputHash = input.input_text
    ? createHash("sha256").update(input.input_text).digest("hex")
    : null;

  const outputText = input.output_text
    ? input.output_text.slice(0, 4000)
    : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb.from("dialer_ai_traces") as any).insert({
    run_id:         input.run_id,
    workflow:       input.workflow,
    prompt_version: input.prompt_version,
    session_id:     input.session_id ?? null,
    lead_id:        input.lead_id   ?? null,
    call_log_id:    input.call_log_id ?? null,
    model:          input.model,
    provider:       input.provider,
    input_hash:     inputHash,
    output_text:    outputText,
    latency_ms:     input.latency_ms ?? null,
    review_flag:    false,
  });

  if (error) {
    // Structured error log — includes run_id and workflow so the caller can
    // locate the primary-record trace (calls_log.summary_trace or
    // session_notes.trace_metadata) to confirm the output is still traceable.
    // Primary-record traces are written before this call and are unaffected.
    console.error(
      "[ai-trace-writer] dialer_ai_traces INSERT failed — output still traceable via primary record.",
      JSON.stringify({
        run_id:     input.run_id,
        workflow:   input.workflow,
        session_id: input.session_id ?? null,
        lead_id:    input.lead_id   ?? null,
        error:      error.message,
      }),
    );
  }
}

/**
 * Updates review_flag and review_note on an existing dialer_ai_traces row.
 * Called at publish time when the operator has reviewed AI output in Step 3.
 * Always fire-and-forget — caller must .catch(() => {}).
 *
 * On failure: logs structured error with run_id so the row can be found
 * and manually updated if needed. Non-fatal — publish still succeeds.
 */
export async function updateAiTraceReview(
  sb: SupabaseClient,
  input: AiTraceReviewInput,
): Promise<void> {
  const patch: Record<string, unknown> = {
    review_flag: input.review_flag,
  };
  if (input.review_note_data) {
    patch.review_note = JSON.stringify(input.review_note_data);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb.from("dialer_ai_traces") as any)
    .update(patch)
    .eq("run_id", input.run_id);

  if (error) {
    console.error(
      "[ai-trace-writer] dialer_ai_traces review update failed — trace row still exists, review_flag not set.",
      JSON.stringify({ run_id: input.run_id, error: error.message }),
    );
  }
}
