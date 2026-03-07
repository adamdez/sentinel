-- Add "staging" to lead_status enum
-- This value is used throughout the codebase but was missing from the original schema.
-- If already present (added manually via Supabase dashboard), this is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'lead_status'::regtype
    AND enumlabel = 'staging'
  ) THEN
    ALTER TYPE lead_status ADD VALUE 'staging' BEFORE 'prospect';
  END IF;
END
$$;
