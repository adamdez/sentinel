-- Add task_type and notes columns to tasks table.
-- These are referenced by runtime code (API routes, Vapi handler) but were
-- never added to the physical table.  task_type enables chip-based task
-- classification; notes stores optional context added by the operator.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_type VARCHAR(50) DEFAULT 'follow_up';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notes TEXT;

-- Index for filtering by type (callback views, etc.)
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks (task_type);

-- Composite index: lead's most-recent pending task (bidirectional sync lookup)
CREATE INDEX IF NOT EXISTS idx_tasks_lead_pending ON tasks (lead_id, status, due_at ASC)
  WHERE status = 'pending';
