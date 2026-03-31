-- Add ALL qualification columns to the leads table.
-- The API (prospects/route.ts PATCH) already writes to these fields,
-- but they were never added to the database schema.
--
-- Existing 5 dimensions (from the API):
--   motivation_level (1-5), seller_timeline, condition_level (1-5),
--   decision_maker_confirmed, price_expectation, qualification_route
--
-- New 2 dimensions for the 7-factor scorecard:
--   occupancy_score (1-5), equity_flexibility_score (1-5)
--
-- Computed total:
--   qualification_score_total (7-35, server-computed)

-- ── Base qualification fields (match existing API expectations) ──

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS motivation_level smallint
    CHECK (motivation_level IS NULL OR (motivation_level >= 1 AND motivation_level <= 5)),
  ADD COLUMN IF NOT EXISTS seller_timeline text
    CHECK (seller_timeline IS NULL OR seller_timeline IN ('immediate', '30_days', '60_days', 'flexible', 'unknown')),
  ADD COLUMN IF NOT EXISTS condition_level smallint
    CHECK (condition_level IS NULL OR (condition_level >= 1 AND condition_level <= 5)),
  ADD COLUMN IF NOT EXISTS decision_maker_confirmed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS price_expectation numeric,
  ADD COLUMN IF NOT EXISTS qualification_route text
    CHECK (qualification_route IS NULL OR qualification_route IN ('offer_ready', 'follow_up', 'nurture', 'dead', 'escalate'));

-- ── New scorecard dimensions ──

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS occupancy_score smallint
    CHECK (occupancy_score IS NULL OR (occupancy_score >= 1 AND occupancy_score <= 5)),
  ADD COLUMN IF NOT EXISTS equity_flexibility_score smallint
    CHECK (equity_flexibility_score IS NULL OR (equity_flexibility_score >= 1 AND equity_flexibility_score <= 5)),
  ADD COLUMN IF NOT EXISTS qualification_score_total smallint
    CHECK (qualification_score_total IS NULL OR (qualification_score_total >= 7 AND qualification_score_total <= 35));

-- ── Indexes ──

CREATE INDEX IF NOT EXISTS idx_leads_qualification_route
  ON leads (qualification_route)
  WHERE qualification_route IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_needs_qualification
  ON leads (status, qualification_route)
  WHERE status = 'lead' AND qualification_route IS NULL;

-- ── Column comments ──

COMMENT ON COLUMN leads.motivation_level IS '1-5: seller motivation to sell';
COMMENT ON COLUMN leads.seller_timeline IS 'Seller timeline: immediate, 30_days, 60_days, flexible, unknown';
COMMENT ON COLUMN leads.condition_level IS '1-5: property condition for acquisition readiness';
COMMENT ON COLUMN leads.decision_maker_confirmed IS 'Whether the decision maker has been confirmed';
COMMENT ON COLUMN leads.price_expectation IS 'Seller asking price or price expectation in dollars';
COMMENT ON COLUMN leads.qualification_route IS 'Routing decision: offer_ready, follow_up, nurture, dead, escalate';
COMMENT ON COLUMN leads.occupancy_score IS '1-5: occupancy status (1=tenant w/ lease, 5=vacant)';
COMMENT ON COLUMN leads.equity_flexibility_score IS '1-5: equity and deal flexibility (1=underwater, 5=high equity)';
COMMENT ON COLUMN leads.qualification_score_total IS 'Server-computed sum of 7 qualification dimensions (7-35)';

