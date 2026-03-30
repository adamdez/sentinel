ALTER TABLE leads
ADD COLUMN IF NOT EXISTS dial_queue_active BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS dial_queue_added_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS dial_queue_added_by UUID,
ADD COLUMN IF NOT EXISTS skip_trace_status TEXT NOT NULL DEFAULT 'not_started',
ADD COLUMN IF NOT EXISTS skip_trace_completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS skip_trace_last_attempted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS skip_trace_last_error TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_dial_queue_assigned
ON leads (assigned_to, dial_queue_active, dial_queue_added_at DESC)
WHERE dial_queue_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_leads_skip_trace_status
ON leads (skip_trace_status, skip_trace_completed_at DESC);
