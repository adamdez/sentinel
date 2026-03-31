-- PR-1: Add next_action and next_action_due_at to leads
--
-- next_action: free-text field describing what the operator needs to do next.
--   Required (enforced at the API layer) for any stage-advancing transition.
--   NULL is valid on historical/imported leads; the API will flag these.
--
-- next_action_due_at: optional deadline for the next action.
--   Feeds stale detection and the morning brief queue.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS next_action_due_at timestamptz;

-- Index for stale detection cron (leads with overdue next actions)
CREATE INDEX IF NOT EXISTS idx_leads_next_action_due
  ON leads (next_action_due_at)
  WHERE next_action_due_at IS NOT NULL;

-- Index for queue sorting by null next_action (flags leads without a next step)
CREATE INDEX IF NOT EXISTS idx_leads_next_action_null
  ON leads (id)
  WHERE next_action IS NULL AND status NOT IN ('dead', 'closed', 'staging');
