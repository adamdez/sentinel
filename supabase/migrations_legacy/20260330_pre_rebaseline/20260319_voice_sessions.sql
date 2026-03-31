-- Voice AI sessions table
-- Tracks every AI-handled inbound/outbound call through Vapi
-- Part of the dialer domain — volatile session state, not CRM truth

CREATE EXTENSION IF NOT EXISTS moddatetime WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS voice_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_sid text,
  vapi_call_id text,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_number text,
  to_number text,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  caller_type text CHECK (caller_type IN ('seller', 'buyer', 'vendor', 'spam', 'unknown', NULL)),
  caller_intent text,
  status text NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing', 'ai_handling', 'transferred', 'completed', 'failed', 'voicemail')),
  transferred_to text,
  transfer_reason text,
  summary text,
  extracted_facts jsonb DEFAULT '[]',
  callback_requested boolean DEFAULT false,
  callback_time text,
  assistant_id text,
  model_used text,
  duration_seconds integer,
  cost_cents integer,
  recording_url text,
  transcript text,
  feature_flag text DEFAULT 'voice.ai.inbound',
  run_id uuid REFERENCES agent_runs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_voice_sessions_lead ON voice_sessions(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_voice_sessions_status ON voice_sessions(status);
CREATE INDEX IF NOT EXISTS idx_voice_sessions_vapi ON voice_sessions(vapi_call_id) WHERE vapi_call_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_voice_sessions_created ON voice_sessions(created_at DESC);

ALTER TABLE voice_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read voice sessions" ON voice_sessions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role can manage voice sessions" ON voice_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE TRIGGER voice_sessions_updated_at
  BEFORE UPDATE ON voice_sessions
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);
