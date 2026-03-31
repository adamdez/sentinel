-- ─────────────────────────────────────────────────────────────────────────────
-- CRM Projection Fields (Blueprint Section 9.1)
--
-- These columns on the leads table are populated by syncDossierToLead()
-- when a reviewed dossier is promoted. They give Logan a lean,
-- call-ready summary without opening the full dossier.
--
-- Rollback:
--   ALTER TABLE leads
--     DROP COLUMN IF EXISTS seller_situation_summary_short,
--     DROP COLUMN IF EXISTS recommended_call_angle,
--     DROP COLUMN IF EXISTS likely_decision_maker,
--     DROP COLUMN IF EXISTS decision_maker_confidence,
--     DROP COLUMN IF EXISTS top_fact_1,
--     DROP COLUMN IF EXISTS top_fact_2,
--     DROP COLUMN IF EXISTS top_fact_3,
--     DROP COLUMN IF EXISTS recommended_next_action,
--     DROP COLUMN IF EXISTS property_snapshot_status,
--     DROP COLUMN IF EXISTS comps_status,
--     DROP COLUMN IF EXISTS opportunity_score,
--     DROP COLUMN IF EXISTS contactability_score,
--     DROP COLUMN IF EXISTS confidence_score;
-- ─────────────────────────────────────────────────────────────────────────────

-- Dossier-derived projections (populated by syncDossierToLead)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS seller_situation_summary_short TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS recommended_call_angle TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS likely_decision_maker TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS decision_maker_confidence TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS top_fact_1 TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS top_fact_2 TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS top_fact_3 TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS recommended_next_action TEXT;

-- Property intelligence status
ALTER TABLE leads ADD COLUMN IF NOT EXISTS property_snapshot_status TEXT DEFAULT 'pending';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS comps_status TEXT DEFAULT 'pending';

-- Composite scores (populated by scoring engine + intel pipeline)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS opportunity_score SMALLINT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contactability_score SMALLINT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS confidence_score SMALLINT;

-- Indexes for operator queries
CREATE INDEX IF NOT EXISTS idx_leads_opportunity_score
  ON leads(opportunity_score DESC NULLS LAST)
  WHERE status NOT IN ('dead', 'closed');

CREATE INDEX IF NOT EXISTS idx_leads_property_snapshot_status
  ON leads(property_snapshot_status)
  WHERE property_snapshot_status != 'enriched';

COMMENT ON COLUMN leads.seller_situation_summary_short IS 'From dossier: 1-2 sentence seller situation for pre-call context (max 500 chars)';
COMMENT ON COLUMN leads.recommended_call_angle IS 'From dossier: specific approach for the call';
COMMENT ON COLUMN leads.likely_decision_maker IS 'From dossier: name and role of likely decision maker';
COMMENT ON COLUMN leads.decision_maker_confidence IS 'Confidence in decision maker identification: weak/probable/strong/verified';
COMMENT ON COLUMN leads.top_fact_1 IS 'Most important dossier fact projected for quick reference';
COMMENT ON COLUMN leads.top_fact_2 IS 'Second most important dossier fact';
COMMENT ON COLUMN leads.top_fact_3 IS 'Third most important dossier fact';
COMMENT ON COLUMN leads.recommended_next_action IS 'AI-suggested next action from dossier analysis';
COMMENT ON COLUMN leads.property_snapshot_status IS 'pending | partial | enriched — tracks provider data coverage';
COMMENT ON COLUMN leads.comps_status IS 'pending | stale | current — tracks comp/valuation freshness';
COMMENT ON COLUMN leads.opportunity_score IS 'Composite opportunity score (0-100) from scoring engine + intel';
COMMENT ON COLUMN leads.contactability_score IS 'How reachable is this lead (0-100) — phone quality, answer rate, DNC';
COMMENT ON COLUMN leads.confidence_score IS 'How confident are we in our data (0-100) — fact count, source quality, contradictions';
