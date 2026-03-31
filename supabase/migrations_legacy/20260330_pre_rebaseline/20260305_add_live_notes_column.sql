-- Add live_notes JSONB column to calls_log for real-time AI transcription notes
ALTER TABLE calls_log ADD COLUMN IF NOT EXISTS live_notes JSONB DEFAULT NULL;

-- Enable realtime for calls_log (needed for live notes subscription)
ALTER PUBLICATION supabase_realtime ADD TABLE calls_log;
