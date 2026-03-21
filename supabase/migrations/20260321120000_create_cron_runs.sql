-- Cron run ledger — tracks every cron execution for observability
CREATE TABLE IF NOT EXISTS cron_runs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cron_name text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  items_processed int DEFAULT 0,
  items_failed int DEFAULT 0,
  error_message text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_cron_runs_name_started ON cron_runs(cron_name, started_at DESC);
CREATE INDEX idx_cron_runs_status ON cron_runs(status) WHERE status = 'running';

-- Retention: auto-delete runs older than 90 days
-- (Will be handled by a cleanup cron, not a DB trigger)

COMMENT ON TABLE cron_runs IS 'Tracks every cron job execution for operational visibility. Part of silent-failure hardening.';
