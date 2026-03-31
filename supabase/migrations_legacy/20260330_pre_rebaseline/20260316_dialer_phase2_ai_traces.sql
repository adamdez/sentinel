-- Dialer Phase 2 — AI Trace Log
--
-- Adds dialer_ai_traces table.
-- Every AI invocation in the dialer domain writes one row here (fire-and-forget).
-- Provides the data foundation for a future review/eval surface:
--   - query bad outputs by workflow, prompt version, or date range
--   - compare output quality across prompt versions
--   - flag individual runs for human review
--   - build eval datasets from production traces
--
-- This table is dialer-owned. It is never read by CRM routes.

CREATE TABLE IF NOT EXISTS dialer_ai_traces (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          UUID        NOT NULL,
  workflow        TEXT        NOT NULL,   -- "extract" | "summarize" | future
  prompt_version  TEXT        NOT NULL,   -- semver string matching constant in route
  session_id      UUID        REFERENCES call_sessions(id) ON DELETE SET NULL,
  lead_id         UUID        REFERENCES leads(id)         ON DELETE SET NULL,
  call_log_id     UUID        REFERENCES calls_log(id)     ON DELETE SET NULL,
  model           TEXT        NOT NULL,
  provider        TEXT        NOT NULL,
  input_hash      TEXT,                   -- SHA-256 of the input text; enables dedup queries
  output_text     TEXT,                   -- raw AI output (truncated to 4000 chars)
  latency_ms      INTEGER,
  review_flag     BOOLEAN     NOT NULL DEFAULT FALSE,  -- set true to mark for human review
  review_note     TEXT,                   -- human note when review_flag is set
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index: find all traces for a session (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_ai_traces_session
  ON dialer_ai_traces (session_id)
  WHERE session_id IS NOT NULL;

-- Index: find traces by workflow + prompt version (for eval/comparison)
CREATE INDEX IF NOT EXISTS idx_ai_traces_workflow_version
  ON dialer_ai_traces (workflow, prompt_version, created_at DESC);

-- Index: find flagged traces (for review queue)
CREATE INDEX IF NOT EXISTS idx_ai_traces_review_flag
  ON dialer_ai_traces (review_flag, created_at DESC)
  WHERE review_flag = TRUE;

-- Index: lookup by run_id (for correlation with session_notes.trace_metadata)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_traces_run_id
  ON dialer_ai_traces (run_id);

-- RLS: dialer service role bypasses; operators can read their own session traces
ALTER TABLE dialer_ai_traces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_ai_traces"
  ON dialer_ai_traces FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "operators_read_own_session_traces"
  ON dialer_ai_traces FOR SELECT
  TO authenticated
  USING (
    session_id IN (
      SELECT id FROM call_sessions WHERE user_id = auth.uid()
    )
  );
