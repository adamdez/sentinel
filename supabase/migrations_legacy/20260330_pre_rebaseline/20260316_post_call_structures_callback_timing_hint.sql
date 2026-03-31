-- Add callback timing hint to structured post-call output.
-- Keeps callback preference reusable in seller-memory/review without parsing free text.
ALTER TABLE post_call_structures
  ADD COLUMN IF NOT EXISTS callback_timing_hint TEXT;

