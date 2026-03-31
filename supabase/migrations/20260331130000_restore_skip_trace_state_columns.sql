ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS skip_trace_status TEXT NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS skip_trace_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS skip_trace_last_attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS skip_trace_last_error TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_skip_trace_status
  ON public.leads (skip_trace_status, skip_trace_completed_at DESC);
