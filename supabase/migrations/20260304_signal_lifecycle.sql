-- Signal Lifecycle: add status tracking, real event dates, and verification timestamps
-- to distress_events. This enables freshness-based scoring, signal verification on
-- re-enrichment, and resolved-signal exclusion.

-- Signal status: active (confirmed), resolved (no longer true), expired (aged out), unknown (never verified)
ALTER TABLE distress_events
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS event_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- Default all existing rows to 'unknown' (column default handles this for new inserts)
UPDATE distress_events SET status = 'unknown' WHERE status IS NULL;

-- Index for scoring queries that filter by status
CREATE INDEX IF NOT EXISTS idx_distress_events_status ON distress_events(status);

-- Composite index for property + status lookups (used in scoring and verification)
CREATE INDEX IF NOT EXISTS idx_distress_events_property_status
  ON distress_events(property_id, status);

COMMENT ON COLUMN distress_events.status IS 'Signal lifecycle: active | resolved | expired | unknown';
COMMENT ON COLUMN distress_events.event_date IS 'When the actual distress event occurred (not ingestion date)';
COMMENT ON COLUMN distress_events.last_verified_at IS 'Last time this signal was confirmed still active via re-enrichment';
COMMENT ON COLUMN distress_events.resolved_at IS 'When the signal was confirmed resolved (foreclosure cured, tax paid, etc.)';
