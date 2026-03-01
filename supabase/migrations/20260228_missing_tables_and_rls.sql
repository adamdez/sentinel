-- ══════════════════════════════════════════════════════════════════════
-- Sentinel ERP — Missing Tables, Schema Fixes & RLS Policies
-- Date: 2026-02-28
--
-- This migration:
--   1. Creates 7 missing tables (calls_log, ad_snapshots, ad_reviews,
--      ad_actions, dnc_list, opt_outs, litigants)
--   2. Adds missing column to user_profiles (personal_cell)
--   3. Fixes scoring_records schema mismatch (equity_multiplier, recency_decay)
--   4. Enables RLS on ALL tables with authenticated-user policies
-- ══════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════════
-- 1. MISSING TABLES
-- ══════════════════════════════════════════════════════════════════════

-- ── calls_log (Dialer + Analytics Domain) ────────────────────────────
-- Used by: use-dialer.ts, analytics.ts, /api/dialer/call, /api/dialer/sms

CREATE TABLE IF NOT EXISTS calls_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  phone_dialed VARCHAR(20) NOT NULL,
  transferred_to_cell VARCHAR(20),
  twilio_sid VARCHAR(100),
  disposition VARCHAR(50) NOT NULL DEFAULT 'initiating',
  duration_sec INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calls_log_user ON calls_log(user_id);
CREATE INDEX IF NOT EXISTS idx_calls_log_lead ON calls_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_calls_log_disposition ON calls_log(disposition);
CREATE INDEX IF NOT EXISTS idx_calls_log_started ON calls_log(started_at);
CREATE INDEX IF NOT EXISTS idx_calls_log_twilio ON calls_log(twilio_sid);


-- ── ad_snapshots (Ads Domain) ────────────────────────────────────────
-- Used by: ads/page.tsx, /api/ads/sync, /api/ads/review

CREATE TABLE IF NOT EXISTS ad_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id VARCHAR(100) NOT NULL,
  campaign_name TEXT,
  ad_group_id VARCHAR(100),
  ad_group_name TEXT,
  ad_id VARCHAR(100),
  headline1 TEXT,
  headline2 TEXT,
  headline3 TEXT,
  description1 TEXT,
  description2 TEXT,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  ctr NUMERIC(8,6) NOT NULL DEFAULT 0,
  avg_cpc NUMERIC(10,2) NOT NULL DEFAULT 0,
  conversions NUMERIC(10,2) NOT NULL DEFAULT 0,
  cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  roas NUMERIC(8,4),
  quality_score INTEGER,
  snapshot_date TIMESTAMPTZ NOT NULL,
  raw_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_snapshots_campaign ON ad_snapshots(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_snapshots_ad ON ad_snapshots(ad_id);
CREATE INDEX IF NOT EXISTS idx_ad_snapshots_date ON ad_snapshots(snapshot_date);


-- ── ad_reviews (Ads Domain) ──────────────────────────────────────────
-- Used by: ads/page.tsx, /api/ads/review

CREATE TABLE IF NOT EXISTS ad_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date TIMESTAMPTZ,
  review_type VARCHAR(50) NOT NULL,
  summary TEXT,
  findings JSONB NOT NULL DEFAULT '[]',
  suggestions JSONB NOT NULL DEFAULT '[]',
  ai_engine VARCHAR(50),
  model_used VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_reviews_type ON ad_reviews(review_type);
CREATE INDEX IF NOT EXISTS idx_ad_reviews_created ON ad_reviews(created_at);


-- ── ad_actions (Ads Domain) ──────────────────────────────────────────
-- Used by: ads/page.tsx, /api/ads/actions, /api/ads/chat

CREATE TABLE IF NOT EXISTS ad_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID REFERENCES ad_reviews(id) ON DELETE CASCADE,
  action_type VARCHAR(50) NOT NULL,
  target_entity TEXT,
  target_id VARCHAR(100),
  old_value TEXT,
  new_value TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'suggested',
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_actions_review ON ad_actions(review_id);
CREATE INDEX IF NOT EXISTS idx_ad_actions_status ON ad_actions(status);
CREATE INDEX IF NOT EXISTS idx_ad_actions_created ON ad_actions(created_at);


-- ── dnc_list (Compliance Domain) ─────────────────────────────────────
-- Used by: compliance.ts (scrubLead, scrubLeadClient, addToDnc)

CREATE TABLE IF NOT EXISTS dnc_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(10) NOT NULL,
  source VARCHAR(100) NOT NULL DEFAULT 'manual',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_dnc_phone UNIQUE (phone)
);

CREATE INDEX IF NOT EXISTS idx_dnc_phone ON dnc_list(phone);


-- ── opt_outs (Compliance Domain) ─────────────────────────────────────
-- Used by: compliance.ts (scrubLead, scrubLeadClient, addToOptOut)

CREATE TABLE IF NOT EXISTS opt_outs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(10) NOT NULL,
  source VARCHAR(100) NOT NULL DEFAULT 'manual',
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_opt_out_phone UNIQUE (phone)
);

CREATE INDEX IF NOT EXISTS idx_opt_outs_phone ON opt_outs(phone);


-- ── litigants (Compliance Domain) ────────────────────────────────────
-- Used by: compliance.ts (scrubLead, scrubLeadClient, addToLitigants)

CREATE TABLE IF NOT EXISTS litigants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(10) NOT NULL,
  name TEXT,
  source VARCHAR(100) NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_litigant_phone UNIQUE (phone)
);

CREATE INDEX IF NOT EXISTS idx_litigants_phone ON litigants(phone);


-- ── audit_log (Compliance/Workflow Domain) ────────────────────────────
-- Used by: sales-funnel/prospects/page.tsx, push-to-sentinel.sql
-- Separate from event_log — tracks user-facing claim/action audit trail

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'lead',
  entity_id TEXT NOT NULL DEFAULT '',
  actor TEXT DEFAULT 'system',
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  user_id UUID,
  details TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_lead ON audit_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);


-- ══════════════════════════════════════════════════════════════════════
-- 2. SCHEMA FIXES — Missing Columns
-- ══════════════════════════════════════════════════════════════════════

-- user_profiles: add personal_cell (used by dialer, settings, twilio voice)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS personal_cell VARCHAR(20);

-- scoring_records: add equity_multiplier (used by predictive-crawler.ts)
ALTER TABLE scoring_records
  ADD COLUMN IF NOT EXISTS equity_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.0;

-- scoring_records: make recency_decay nullable with default
-- (crawler inserts don't provide this value)
ALTER TABLE scoring_records
  ALTER COLUMN recency_decay SET DEFAULT 1.0;

-- scoring_records: ensure recency_decay has a value for existing rows
UPDATE scoring_records SET recency_decay = 1.0 WHERE recency_decay IS NULL;


-- ══════════════════════════════════════════════════════════════════════
-- 3. ROW LEVEL SECURITY — Enable on ALL tables + authenticated policies
-- ══════════════════════════════════════════════════════════════════════
--
-- Strategy: 3-person team, all authenticated users get full CRUD.
-- Service role bypasses RLS automatically.
-- Anon (unauthenticated) gets nothing.
--
-- Note: scoring_predictions already has RLS via its own migration.
-- ══════════════════════════════════════════════════════════════════════

-- ── user_profiles ────────────────────────────────────────────────────
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access on user_profiles"
  ON user_profiles FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── properties ───────────────────────────────────────────────────────
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access on properties"
  ON properties FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── distress_events ──────────────────────────────────────────────────
ALTER TABLE distress_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access on distress_events"
  ON distress_events FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── scoring_records ──────────────────────────────────────────────────
ALTER TABLE scoring_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access on scoring_records"
  ON scoring_records FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── contacts ─────────────────────────────────────────────────────────
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access on contacts"
  ON contacts FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── leads ────────────────────────────────────────────────────────────
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access on leads"
  ON leads FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── deals ────────────────────────────────────────────────────────────
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access on deals"
  ON deals FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── tasks ────────────────────────────────────────────────────────────
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access on tasks"
  ON tasks FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── campaigns ────────────────────────────────────────────────────────
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access on campaigns"
  ON campaigns FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── offers ───────────────────────────────────────────────────────────
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access on offers"
  ON offers FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── event_log ────────────────────────────────────────────────────────
ALTER TABLE event_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access on event_log"
  ON event_log FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── scoring_predictions (already has RLS, add authenticated policy) ──
-- The existing migration only created a generic policy without TO clause.
-- Add explicit authenticated policy if missing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'scoring_predictions'
      AND policyname = 'Authenticated full access on scoring_predictions'
  ) THEN
    EXECUTE 'CREATE POLICY "Authenticated full access on scoring_predictions"
      ON scoring_predictions FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true)';
  END IF;
END $$;

-- ── calls_log (new table) ────────────────────────────────────────────
ALTER TABLE calls_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access on calls_log"
  ON calls_log FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── ad_snapshots (new table) ─────────────────────────────────────────
ALTER TABLE ad_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access on ad_snapshots"
  ON ad_snapshots FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── ad_reviews (new table) ───────────────────────────────────────────
ALTER TABLE ad_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access on ad_reviews"
  ON ad_reviews FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── ad_actions (new table) ───────────────────────────────────────────
ALTER TABLE ad_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access on ad_actions"
  ON ad_actions FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── audit_log (new table) ────────────────────────────────────────────
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access on audit_log"
  ON audit_log FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── dnc_list (new table) ─────────────────────────────────────────────
ALTER TABLE dnc_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access on dnc_list"
  ON dnc_list FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── opt_outs (new table) ─────────────────────────────────────────────
ALTER TABLE opt_outs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access on opt_outs"
  ON opt_outs FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── litigants (new table) ────────────────────────────────────────────
ALTER TABLE litigants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access on litigants"
  ON litigants FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- ══════════════════════════════════════════════════════════════════════
-- 4. REALTIME — Enable for tables that use Supabase Realtime channels
-- ══════════════════════════════════════════════════════════════════════
-- The dialer subscribes to postgres_changes on leads and calls_log.

ALTER PUBLICATION supabase_realtime ADD TABLE leads;
ALTER PUBLICATION supabase_realtime ADD TABLE calls_log;


-- ══════════════════════════════════════════════════════════════════════
-- Done. This migration creates 8 tables, adds 2 columns, fixes 1 default,
-- enables RLS on 19 tables, and adds realtime for 2 tables.
-- ══════════════════════════════════════════════════════════════════════
