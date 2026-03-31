-- ============================================================
-- calls_log: add columns for Vapi voice sessions + inbound calls
-- ============================================================
-- The original calls_log schema was outbound-only (phone_dialed NOT NULL,
-- no direction/source). Inbound-writeback already writes called_at, source,
-- and metadata without a migration. This migration formalises those columns
-- and adds voice_session_id for Vapi end-of-call writes.
--
-- phone_dialed: relaxed to nullable — inbound Vapi calls have from_number
-- but not always a dialed number.

-- 1. Relax phone_dialed NOT NULL → nullable
ALTER TABLE calls_log ALTER COLUMN phone_dialed DROP NOT NULL;

-- 2. Add direction column (outbound for legacy rows, inbound for Vapi/inbound)
ALTER TABLE calls_log
  ADD COLUMN IF NOT EXISTS direction VARCHAR(10) DEFAULT 'outbound';

-- 3. Add called_at (explicit call timestamp vs. created_at)
ALTER TABLE calls_log
  ADD COLUMN IF NOT EXISTS called_at TIMESTAMPTZ;

-- 4. Add source (e.g. 'dialer', 'vapi', 'inbound', 'manual')
ALTER TABLE calls_log
  ADD COLUMN IF NOT EXISTS source VARCHAR(30);

-- 5. Add metadata JSONB for flexible provider-specific data
ALTER TABLE calls_log
  ADD COLUMN IF NOT EXISTS metadata JSONB;

-- 6. Add voice_session_id — back-reference to voice_sessions for Vapi calls
ALTER TABLE calls_log
  ADD COLUMN IF NOT EXISTS voice_session_id UUID
    REFERENCES voice_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_calls_log_voice_session
  ON calls_log(voice_session_id)
  WHERE voice_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_calls_log_direction
  ON calls_log(direction);

CREATE INDEX IF NOT EXISTS idx_calls_log_source
  ON calls_log(source)
  WHERE source IS NOT NULL;
