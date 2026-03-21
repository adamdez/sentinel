-- ─────────────────────────────────────────────────────────────────────────────
-- Source Attribution & Prospect Engine Bake-Off Infrastructure
-- Blueprint 5.8 + 12.1: Track cost-per-contract by prospect engine
--
-- What this adds:
--   1. source_costs table — monthly spend tracking per prospect engine
--   2. acquisition_cost column on leads — per-lead cost attribution
--   3. Index on leads(source) for fast source-based queries
--
-- Rollback:
--   DROP TABLE IF EXISTS source_costs;
--   ALTER TABLE leads DROP COLUMN IF EXISTS acquisition_cost;
--   DROP INDEX IF EXISTS idx_leads_source;
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Per-lead acquisition cost on leads table
--    Used by cost-per-lead widget and source attribution API.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS acquisition_cost NUMERIC(10,2);

COMMENT ON COLUMN leads.acquisition_cost
  IS 'Per-lead cost attribution (skip trace fee, ad spend allocated, per-record cost). Nullable = no cost data yet.';

-- 2. Index on leads.source for source-based queries (bake-off, attribution, analytics)
CREATE INDEX IF NOT EXISTS idx_leads_source
  ON leads(source)
  WHERE source IS NOT NULL;

-- 3. Source costs table — monthly spend per prospect engine
--    Operators log their monthly subscription + per-record costs here.
--    The source-attribution API joins this to compute cost-per-contract.
CREATE TABLE IF NOT EXISTS source_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Canonical source key (must match normalizeSource output)
  source_key VARCHAR(50) NOT NULL,

  -- Period this cost covers (month granularity)
  period_start DATE NOT NULL,        -- first day of the month, e.g. '2026-03-01'
  period_end   DATE NOT NULL,        -- last day of the month, e.g. '2026-03-31'

  -- Cost breakdown
  subscription_cost  NUMERIC(10,2) NOT NULL DEFAULT 0,  -- monthly platform fee
  per_record_cost    NUMERIC(10,2) NOT NULL DEFAULT 0,  -- skip trace / per-lookup fees
  ad_spend           NUMERIC(10,2) NOT NULL DEFAULT 0,  -- paid ad spend (Google, FB, etc.)
  other_cost         NUMERIC(10,2) NOT NULL DEFAULT 0,  -- direct mail, gas for D4D, etc.

  -- Computed total (app can also compute; stored for convenience)
  total_cost NUMERIC(10,2) GENERATED ALWAYS AS (
    subscription_cost + per_record_cost + ad_spend + other_cost
  ) STORED,

  notes TEXT,                                            -- e.g. "PropertyRadar Pro plan"
  created_by UUID,                                       -- who logged this
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One cost record per source per period
  CONSTRAINT uq_source_cost_period UNIQUE (source_key, period_start)
);

CREATE INDEX IF NOT EXISTS idx_source_costs_source ON source_costs(source_key);
CREATE INDEX IF NOT EXISTS idx_source_costs_period ON source_costs(period_start);

-- RLS: authenticated users can read/write source costs
ALTER TABLE source_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read source_costs"
  ON source_costs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert source_costs"
  ON source_costs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update source_costs"
  ON source_costs FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE source_costs
  IS 'Monthly spend per prospect engine for bake-off cost-per-contract tracking (Blueprint 5.8)';
