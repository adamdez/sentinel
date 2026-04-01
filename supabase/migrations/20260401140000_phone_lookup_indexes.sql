-- Phone lookup indexes for unified inbound caller identification
-- Supports the unifiedPhoneLookup() cascade across all phone-bearing tables

CREATE INDEX IF NOT EXISTS idx_calls_log_phone_dialed
  ON calls_log (phone_dialed);

CREATE INDEX IF NOT EXISTS idx_call_sessions_phone_dialed
  ON call_sessions (phone_dialed);

CREATE INDEX IF NOT EXISTS idx_properties_owner_phone
  ON properties (owner_phone);
