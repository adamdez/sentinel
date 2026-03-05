-- ── Conversion Tracking: Stage Transition Snapshots ──────────────────
-- Captures lead state at every status change for conversion analytics.
-- Enables: signal-to-deal conversion rates, pipeline velocity,
-- score calibration, and dead lead analysis.

CREATE TABLE IF NOT EXISTS lead_stage_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES leads(id),
  property_id UUID NOT NULL REFERENCES properties(id),
  from_status VARCHAR(30),
  to_status VARCHAR(30) NOT NULL,
  score_at_transition NUMERIC(5,2),
  tier_at_transition VARCHAR(20),
  signal_types TEXT[],
  signal_combination VARCHAR(255),
  import_source VARCHAR(50),
  days_in_previous_stage INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_lead ON lead_stage_snapshots(lead_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_to_status ON lead_stage_snapshots(to_status);
CREATE INDEX IF NOT EXISTS idx_snapshots_signal_combo ON lead_stage_snapshots(signal_combination);
CREATE INDEX IF NOT EXISTS idx_snapshots_created_at ON lead_stage_snapshots(created_at);
