-- Add transfer_brief JSONB column to voice_sessions
-- Stores structured notes from Jeff's conversation before warm transfer.
-- Logan's browser overlay reads this to display pre-call context.

ALTER TABLE voice_sessions
ADD COLUMN IF NOT EXISTS transfer_brief jsonb DEFAULT NULL;

COMMENT ON COLUMN voice_sessions.transfer_brief IS 'Structured brief from AI (Jeff) before warm transfer — shown to operator on incoming call overlay';
