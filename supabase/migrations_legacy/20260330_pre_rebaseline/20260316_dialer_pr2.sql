-- ============================================================
-- Dialer PR2: trace metadata + calls_log session linkage
-- ============================================================

-- 1. Trace metadata column for AI-generated session notes.
--    NULL for transcript_chunk and operator_note rows.
--    Shape: { model, provider, latency_ms, generated_at, input_tokens?, output_tokens? }
--    Written only when session_notes.is_ai_generated = true.
ALTER TABLE session_notes
  ADD COLUMN IF NOT EXISTS trace_metadata JSONB;

-- 2. Back-reference from calls_log to the dialer session that produced it.
--    Written at call initiation by /api/dialer/call when sessionId is supplied.
--    NULL for all calls created before PR2. publish-manager (PR3) queries by this column.
ALTER TABLE calls_log
  ADD COLUMN IF NOT EXISTS dialer_session_id UUID
    REFERENCES call_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_calls_log_dialer_session
  ON calls_log(dialer_session_id)
  WHERE dialer_session_id IS NOT NULL;
