-- Dialer Phase 2 — Trace and Task Creation
--
-- 1. Adds summary_trace JSONB to calls_log for AI observability on summaries.
--    Stores run_id, prompt_version, model, provider, latency_ms, generated_at.
--    Falls through harmlessly on conflict — existing rows are unchanged.
--
-- 2. No changes to session_notes (trace_metadata already added in PR2).
-- 3. No schema changes needed for task creation —
--    publish-manager inserts into the existing tasks table.

-- ── calls_log: add summary_trace column ──────────────────────────────────────

ALTER TABLE calls_log
  ADD COLUMN IF NOT EXISTS summary_trace JSONB;

COMMENT ON COLUMN calls_log.summary_trace IS
  'Trace metadata for the AI summary: run_id, prompt_version, model, provider, latency_ms, generated_at.
   Set by /api/dialer/summarize. Used for eval and rollback of bad AI summaries.';

-- ── Index: find calls_log rows by summary run_id (for eval queries) ───────────

CREATE INDEX IF NOT EXISTS idx_calls_log_summary_run_id
  ON calls_log ((summary_trace->>'run_id'))
  WHERE summary_trace IS NOT NULL;
