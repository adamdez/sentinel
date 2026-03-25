-- Add auto-cycle context to voice_sessions so the webhook can route
-- Jeff's outbound call outcomes back to the auto-cycle system.

ALTER TABLE voice_sessions
  ADD COLUMN IF NOT EXISTS auto_cycle_lead_id UUID REFERENCES dialer_auto_cycle_leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_cycle_phone_id UUID REFERENCES dialer_auto_cycle_phones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_voice_sessions_auto_cycle_lead
  ON voice_sessions(auto_cycle_lead_id)
  WHERE auto_cycle_lead_id IS NOT NULL;
