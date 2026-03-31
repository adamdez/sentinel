ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS dial_queue_active BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS dial_queue_added_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dial_queue_added_by UUID;

CREATE INDEX IF NOT EXISTS idx_leads_dial_queue
  ON public.leads (assigned_to, dial_queue_active, dial_queue_added_at DESC)
  WHERE dial_queue_active = TRUE;
