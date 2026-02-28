-- calls_log — Power Dialer Call History
-- Charter v2.3 §IV Workflow Domain: Assignment, Dial queue, Dispositions, Notes
-- Append-only call records. Each call attempt = one row.
-- RLS: authenticated users can read all, insert own.

CREATE TABLE IF NOT EXISTS calls_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      UUID REFERENCES leads(id) ON DELETE SET NULL,
  property_id  UUID REFERENCES properties(id) ON DELETE SET NULL,
  user_id      UUID NOT NULL,
  phone_dialed TEXT NOT NULL,
  twilio_sid   TEXT,
  disposition  TEXT NOT NULL DEFAULT 'no_answer',
  duration_sec INTEGER DEFAULT 0,
  notes        TEXT,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at     TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE calls_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calls_log_select_authenticated" ON calls_log
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "calls_log_insert_authenticated" ON calls_log
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "calls_log_update_own" ON calls_log
  FOR UPDATE USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_calls_log_user_id ON calls_log (user_id);
CREATE INDEX IF NOT EXISTS idx_calls_log_lead_id ON calls_log (lead_id);
CREATE INDEX IF NOT EXISTS idx_calls_log_started_at ON calls_log (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_log_disposition ON calls_log (disposition);
