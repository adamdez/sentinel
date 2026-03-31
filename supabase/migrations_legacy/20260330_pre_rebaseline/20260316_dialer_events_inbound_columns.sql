-- ============================================================
-- dialer_events: add inbound-flow columns
--
-- PROBLEM:
--   The original dialer_events schema (20260315) was built for
--   the outbound session-backed call path:
--     id, session_id, user_id (NOT NULL), event_type, payload
--
--   The inbound/missed-call flow (added later) writes:
--     lead_id, task_id, metadata
--   and does not always have a user_id (system-initiated events).
--
-- FIX:
--   1. Make user_id nullable (inbound events are system-initiated)
--   2. Add lead_id (reference to leads table)
--   3. Add task_id (loose reference to tasks table)
--   4. Add metadata (JSONB, used by inbound events)
--
-- publish-manager.ts continues to use session_id + user_id + payload
-- for outbound session events — no change to that path.
-- ============================================================

-- 1. Make user_id nullable
ALTER TABLE dialer_events ALTER COLUMN user_id DROP NOT NULL;

-- 2. Add inbound-flow columns
ALTER TABLE dialer_events
  ADD COLUMN IF NOT EXISTS lead_id  UUID REFERENCES leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS task_id  UUID,
  ADD COLUMN IF NOT EXISTS metadata JSONB;

-- 3. Indexes for inbound event queries
CREATE INDEX IF NOT EXISTS idx_dialer_events_lead_id
  ON dialer_events(lead_id)
  WHERE lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dialer_events_event_type
  ON dialer_events(event_type, created_at DESC);
