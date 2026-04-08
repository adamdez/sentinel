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
  hot:  { label: "Hot",  color: "text-foreground" },
  warm: { label: "Warm", color: "text-foreground" },
  cool: { label: "Cool", color: "text-foreground" },
  cold: { label: "Cold", color: "text-foreground" },
  dead: { label: "Dead", color: "text-foreground" },
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
  callback_timing_hint:  string | null;
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
  callback_timing_hint?: string | null;
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

function titleCase(value: string): string {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function formatCallbackHint(callbackAt: string | null | undefined): string | null {
  if (typeof callbackAt !== "string" || !callbackAt.trim()) return null;
  const parsed = new Date(callbackAt);
  if (Number.isNaN(parsed.getTime())) return trimOrNull(callbackAt, 120);

  try {
    const pretty = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(parsed);
    return `Callback set for ${pretty}`;
  } catch {
    return "Callback scheduled";
  }
}

function fallbackSummaryFromDisposition(disposition: string | null | undefined): string | null {
  if (typeof disposition !== "string" || !disposition.trim()) return null;
  return `${titleCase(disposition)} call outcome recorded.`;
}

export function hasPostCallStructureContent(input: PostCallStructureInput | null | undefined): boolean {
  if (!input) return false;
  return Boolean(
    trimOrNull(input.summary_line, 200) ||
    trimOrNull(input.promises_made, 200) ||
    trimOrNull(input.objection, 200) ||
    trimOrNull(input.next_task_suggestion, 200) ||
    trimOrNull(input.callback_timing_hint, 120) ||
    (typeof input.deal_temperature === "string" && VALID_TEMPS.has(input.deal_temperature)),
  );
}

export function mergePostCallStructureFields(
  primary: PostCallStructureInput | null | undefined,
  fallback: PostCallStructureInput | null | undefined,
): PostCallStructureInput {
  const dealTemperature =
    typeof primary?.deal_temperature === "string" && VALID_TEMPS.has(primary.deal_temperature)
      ? primary.deal_temperature
      : typeof fallback?.deal_temperature === "string" && VALID_TEMPS.has(fallback.deal_temperature)
        ? fallback.deal_temperature
        : null;

  return {
    summary_line: trimOrNull(primary?.summary_line, 200) ?? trimOrNull(fallback?.summary_line, 200),
    promises_made: trimOrNull(primary?.promises_made, 200) ?? trimOrNull(fallback?.promises_made, 200),
    objection: trimOrNull(primary?.objection, 200) ?? trimOrNull(fallback?.objection, 200),
    next_task_suggestion:
      trimOrNull(primary?.next_task_suggestion, 200) ?? trimOrNull(fallback?.next_task_suggestion, 200),
    callback_timing_hint:
      trimOrNull(primary?.callback_timing_hint, 120) ?? trimOrNull(fallback?.callback_timing_hint, 120),
    deal_temperature: dealTemperature,
  };
}

export function buildFallbackPostCallStructureInput(args: {
  disposition?: string | null;
  summary?: string | null;
  nextAction?: string | null;
  callbackAt?: string | null;
}): PostCallStructureInput {
  return {
    summary_line: trimOrNull(args.summary, 200) ?? fallbackSummaryFromDisposition(args.disposition),
    next_task_suggestion: trimOrNull(args.nextAction, 200),
    callback_timing_hint: formatCallbackHint(args.callbackAt),
  };
}

export function buildSellerMemoryBullets(input: {
  summaryLine?: string | null;
  promisesMade?: string | null;
  objection?: string | null;
  nextTaskSuggestion?: string | null;
  callbackTimingHint?: string | null;
  dealTemperature?: string | null;
  fallbackText?: string | null;
}): string[] {
  const bullets: string[] = [];

  const pushBullet = (label: string | null, value: string | null, maxLen: number) => {
    if (!value) return;
    const text = label ? `${label}: ${value}` : value;
    const trimmed = text.trim().slice(0, maxLen);
    if (!trimmed || bullets.includes(trimmed)) return;
    bullets.push(trimmed);
  };

  pushBullet(null, trimOrNull(input.summaryLine, 200) ?? trimOrNull(input.fallbackText, 200), 140);
  pushBullet("Promise", trimOrNull(input.promisesMade, 200), 140);
  pushBullet("Blocker", trimOrNull(input.objection, 200), 140);
  pushBullet("Next", trimOrNull(input.nextTaskSuggestion, 200), 140);
  pushBullet("Callback", trimOrNull(input.callbackTimingHint, 120), 140);

  if (bullets.length < 4) {
    const temp =
      typeof input.dealTemperature === "string" && VALID_TEMPS.has(input.dealTemperature)
        ? titleCase(input.dealTemperature)
        : null;
    pushBullet("Temperature", temp, 80);
  }

  return bullets.slice(0, 4);
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
    callback_timing_hint:  trimOrNull(input.callback_timing_hint, 120),
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
  callback_timing_hint?: string | null;
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
  if (input.callback_timing_hint !== undefined) patch.callback_timing_hint = trimOrNull(input.callback_timing_hint, 120);

  if (input.deal_temperature !== undefined) {
    const tempRaw = input.deal_temperature;
    patch.deal_temperature = typeof tempRaw === "string" && VALID_TEMPS.has(tempRaw)
      ? tempRaw
      : null;
  }

  return patch;
}
