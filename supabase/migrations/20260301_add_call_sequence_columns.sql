-- 7-Day Power Sequence: add call scheduling columns to leads
-- Run this in the Supabase SQL Editor

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS next_call_scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS call_sequence_step     INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS total_calls            INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS live_answers           INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS voicemails_left        INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_leads_next_call
  ON leads (next_call_scheduled_at)
  WHERE next_call_scheduled_at IS NOT NULL;
