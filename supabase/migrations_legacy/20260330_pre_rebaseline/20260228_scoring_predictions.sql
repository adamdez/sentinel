-- Predictive Scoring Engine v2.0
-- Append-only table for forward-looking distress predictions.
-- Domain: Scoring Domain — never mutates workflow tables.

CREATE TABLE IF NOT EXISTS scoring_predictions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  model_version VARCHAR(20) NOT NULL,
  predictive_score INTEGER NOT NULL,
  days_until_distress INTEGER NOT NULL,
  confidence NUMERIC(5,2) NOT NULL,
  owner_age_inference INTEGER,
  equity_burn_rate NUMERIC(8,4),
  absentee_duration_days INTEGER,
  tax_delinquency_trend NUMERIC(8,4),
  life_event_probability NUMERIC(5,2),
  features JSONB NOT NULL DEFAULT '{}',
  factors JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_predictions_property ON scoring_predictions(property_id);
CREATE INDEX IF NOT EXISTS idx_predictions_score ON scoring_predictions(predictive_score);
CREATE INDEX IF NOT EXISTS idx_predictions_days ON scoring_predictions(days_until_distress);
CREATE INDEX IF NOT EXISTS idx_predictions_version ON scoring_predictions(model_version);
CREATE INDEX IF NOT EXISTS idx_predictions_created ON scoring_predictions(created_at);

-- Append-only enforcement: block UPDATE and DELETE
CREATE OR REPLACE RULE scoring_predictions_no_update AS
  ON UPDATE TO scoring_predictions DO INSTEAD NOTHING;

CREATE OR REPLACE RULE scoring_predictions_no_delete AS
  ON DELETE TO scoring_predictions DO INSTEAD NOTHING;

-- Enable RLS (service role bypasses for API routes)
ALTER TABLE scoring_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on scoring_predictions"
  ON scoring_predictions FOR ALL
  USING (true)
  WITH CHECK (true);
