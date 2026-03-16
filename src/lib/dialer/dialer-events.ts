/**
 * Dialer Events — shared read helpers
 *
 * Two write conventions exist in dialer_events:
 *   1. Outbound session events (publish-manager.ts): lead_id inside payload JSONB,
 *      task_id inside payload JSONB, session_id + user_id top-level.
 *   2. Inbound events (twilio/inbound, classify, transfer): lead_id + task_id as
 *      top-level columns, metadata JSONB for structured context.
 *
 * These helpers resolve lead_id and task_id from either convention so read-side
 * code can work consistently regardless of which writer produced the row.
 *
 * BOUNDARY:
 *   - Pure TypeScript, zero DB imports.
 *   - Client and server safe.
 *   - Never writes — only interprets row shapes.
 */

// ── Row shape (minimum columns needed for these helpers) ──────────────────────

export interface DialerEventRow {
  id:          string;
  event_type:  string;
  session_id?: string | null;
  user_id?:    string | null;
  lead_id?:    string | null;
  task_id?:    string | null;
  payload?:    Record<string, unknown> | null;
  metadata?:   Record<string, unknown> | null;
  created_at:  string;
}

// ── Read helpers ───────────────────────────────────────────────────────────────

/**
 * Extracts lead_id from a dialer_events row, checking top-level first
 * then falling back to payload.lead_id (outbound convention).
 */
export function readEventLeadId(row: DialerEventRow): string | null {
  if (row.lead_id) return row.lead_id;
  if (typeof row.payload?.lead_id === "string") return row.payload.lead_id;
  return null;
}

/**
 * Extracts task_id from a dialer_events row, checking top-level first
 * then falling back to payload.task_id (outbound convention).
 */
export function readEventTaskId(row: DialerEventRow): string | null {
  if (row.task_id) return row.task_id;
  if (typeof row.payload?.task_id === "string") return row.payload.task_id;
  return null;
}

/**
 * Extracts the structured metadata JSONB, checking metadata first
 * then falling back to payload (outbound convention).
 */
export function readEventMeta(row: DialerEventRow): Record<string, unknown> {
  return row.metadata ?? row.payload ?? {};
}
