-- AI Call Notes: add recording, transcription, AI summary columns to calls_log
-- Also add call_consent to leads for one-time consent tracking
-- Run this in the Supabase SQL Editor

ALTER TABLE calls_log
  ADD COLUMN IF NOT EXISTS recording_url      TEXT,
  ADD COLUMN IF NOT EXISTS transcription      TEXT,
  ADD COLUMN IF NOT EXISTS ai_summary         TEXT,
  ADD COLUMN IF NOT EXISTS summary_timestamp  TIMESTAMPTZ;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS call_consent       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS call_consent_at    TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_calls_log_ai_summary
  ON calls_log (lead_id)
  WHERE ai_summary IS NOT NULL;
