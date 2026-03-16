/**
 * Post-Call Structure — types + assembly
 *
 * Defines the shape of structured post-call output and provides a pure
 * assembly function that maps publish-time inputs into the insert row.
 *
 * BOUNDARY:
 *   - Pure TypeScript, zero DB imports
 *   - Client and server safe
 *   - Never writes — assembly only
 */

// ── Deal temperature vocabulary ───────────────────────────────────────────────

export type DealTemperature = "hot" | "warm" | "cool" | "cold" | "dead";

export const DEAL_TEMPERATURES: DealTemperature[] = ["hot", "warm", "cool", "cold", "dead"];

export const DEAL_TEMP_LABELS: Record<DealTemperature, { label: string; color: string }> = {
  hot:  { label: "Hot",  color: "text-red-400" },
  warm: { label: "Warm", color: "text-orange-400" },
  cool: { label: "Cool", color: "text-blue-400" },
  cold: { label: "Cold", color: "text-slate-400" },
  dead: { label: "Dead", color: "text-zinc-500" },
};

// ── DB row shape ──────────────────────────────────────────────────────────────

export interface PostCallStructureRow {
  id:                    string;
  session_id:            string;
  calls_log_id:          string | null;
  lead_id:               string | null;
  summary_line:          string | null;
  promises_made:         string | null;
  objection:             string | null;
  next_task_suggestion:  string | null;
  deal_temperature:      DealTemperature | null;
  draft_note_run_id:     string | null;
  draft_was_flagged:     boolean;
  correction_status:     "published" | "corrected";
  corrected_at:          string | null;
  corrected_by:          string | null;
  published_by:          string;
  created_at:            string;
  updated_at:            string;
}

// ── Input from publish body ───────────────────────────────────────────────────

export interface PostCallStructureInput {
  summary_line?:         string | null;
  promises_made?:        string | null;
  objection?:            string | null;
  next_task_suggestion?: string | null;
  deal_temperature?:     string | null;
}

// ── Assembly context (passed by the publish route) ────────────────────────────

export interface AssembleStructureContext {
  sessionId:          string;
  callsLogId:         string | null;
  leadId:             string | null;
  publishedBy:        string;
  draftNoteRunId:     string | null;
  draftWasFlagged:    boolean;
  input:              PostCallStructureInput;
}

// ── Assembly ──────────────────────────────────────────────────────────────────

const VALID_TEMPS = new Set<string>(DEAL_TEMPERATURES);

function trimOrNull(v: unknown, maxLen: number): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  return v.trim().slice(0, maxLen);
}

/**
 * Assembles a post_call_structures insert row from publish-time context.
 * Pure function — no side effects, no DB calls.
 */
export function assemblePostCallStructure(ctx: AssembleStructureContext): Record<string, unknown> {
  const { sessionId, callsLogId, leadId, publishedBy, draftNoteRunId, draftWasFlagged, input } = ctx;

  const tempRaw = input.deal_temperature;
  const dealTemp: DealTemperature | null =
    typeof tempRaw === "string" && VALID_TEMPS.has(tempRaw)
      ? (tempRaw as DealTemperature)
      : null;

  return {
    session_id:            sessionId,
    calls_log_id:          callsLogId,
    lead_id:               leadId,
    summary_line:          trimOrNull(input.summary_line, 200),
    promises_made:         trimOrNull(input.promises_made, 200),
    objection:             trimOrNull(input.objection, 200),
    next_task_suggestion:  trimOrNull(input.next_task_suggestion, 200),
    deal_temperature:      dealTemp,
    draft_note_run_id:     draftNoteRunId,
    draft_was_flagged:     draftWasFlagged,
    correction_status:     "published",
    published_by:          publishedBy,
  };
}

// ── Correction input ──────────────────────────────────────────────────────────

export interface PostCallCorrectionInput {
  summary_line?:         string | null;
  promises_made?:        string | null;
  objection?:            string | null;
  next_task_suggestion?: string | null;
  deal_temperature?:     string | null;
}

/**
 * Builds the patch object for a correction, only including fields present in the input.
 */
export function buildCorrectionPatch(input: PostCallCorrectionInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  if (input.summary_line !== undefined)         patch.summary_line         = trimOrNull(input.summary_line, 200);
  if (input.promises_made !== undefined)        patch.promises_made        = trimOrNull(input.promises_made, 200);
  if (input.objection !== undefined)            patch.objection            = trimOrNull(input.objection, 200);
  if (input.next_task_suggestion !== undefined) patch.next_task_suggestion = trimOrNull(input.next_task_suggestion, 200);

  if (input.deal_temperature !== undefined) {
    const tempRaw = input.deal_temperature;
    patch.deal_temperature = typeof tempRaw === "string" && VALID_TEMPS.has(tempRaw)
      ? tempRaw
      : null;
  }

  return patch;
}
