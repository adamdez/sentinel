-- Delivery run ledger — tracks fire-and-forget webhook/notification deliveries
CREATE TABLE IF NOT EXISTS delivery_runs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  channel text NOT NULL,
  event_type text NOT NULL,
  payload jsonb,
  status text NOT NULL DEFAULT 'queued',
  error_message text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  entity_type text,
  entity_id text
);

CREATE INDEX idx_delivery_runs_status ON delivery_runs(status) WHERE status IN ('queued', 'failed');
CREATE INDEX idx_delivery_runs_channel_created ON delivery_runs(channel, created_at DESC);
CREATE INDEX idx_delivery_runs_entity ON delivery_runs(entity_type, entity_id) WHERE entity_type IS NOT NULL;

COMMENT ON TABLE delivery_runs IS 'Tracks webhook/notification deliveries. Replaces fire-and-forget .catch(() => {}) pattern.';
