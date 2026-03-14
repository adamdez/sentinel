-- ══════════════════════════════════════════════════════════════════════
-- Sentinel ERP — Ads Workflow Tables
-- Date: 2026-03-14
--
-- This migration creates three tables required by the Ads Command Center
-- recommendation and approval workflow:
--   1. ads_recommendations — AI-generated action candidates
--   2. ads_approvals       — Immutable operator decision ledger (FK to ads_recommendations)
--   3. ads_implementation_logs — Execution log per approved recommendation
-- ══════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════════
-- 1. TABLES
-- ══════════════════════════════════════════════════════════════════════

-- ── ads_recommendations ───────────────────────────────────────────────
-- Referenced by:
--   src/lib/ads/recommendations.ts       (insert)
--   src/app/api/ads/approvals/route.ts   (read / status transition)
--   src/lib/ads/gateway/simulator.ts     (read)

CREATE TABLE IF NOT EXISTS ads_recommendations (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_type   VARCHAR(50) NOT NULL,
  risk_level            VARCHAR(10) NOT NULL DEFAULT 'yellow',
  expected_impact       TEXT        NOT NULL DEFAULT '',
  reason                TEXT        NOT NULL DEFAULT '',
  status                VARCHAR(20) NOT NULL DEFAULT 'pending'
                          CONSTRAINT ads_recommendations_status_check
                          CHECK (status IN ('pending', 'approved', 'rejected')),
  market                VARCHAR(50),
  related_campaign_id   UUID        REFERENCES ads_campaigns(id) ON DELETE SET NULL,
  related_ad_group_id   UUID        REFERENCES ads_ad_groups(id) ON DELETE SET NULL,
  related_keyword_id    UUID        REFERENCES ads_keywords(id)  ON DELETE SET NULL,
  source_review_id      UUID        REFERENCES ad_reviews(id)    ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ads_rec_status        ON ads_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_ads_rec_campaign      ON ads_recommendations(related_campaign_id);
CREATE INDEX IF NOT EXISTS idx_ads_rec_ad_group      ON ads_recommendations(related_ad_group_id);
CREATE INDEX IF NOT EXISTS idx_ads_rec_keyword       ON ads_recommendations(related_keyword_id);
CREATE INDEX IF NOT EXISTS idx_ads_rec_source_review ON ads_recommendations(source_review_id);
CREATE INDEX IF NOT EXISTS idx_ads_rec_created       ON ads_recommendations(created_at DESC);


-- ── ads_approvals ─────────────────────────────────────────────────────
-- Immutable ledger. Rows are INSERT-only; no UPDATE or DELETE should ever
-- touch this table. Each row is a timestamped audit record of an operator
-- decision (approved | rejected) on a recommendation.
--
-- Referenced by:
--   src/app/api/ads/approvals/route.ts (PATCH handler — insert on decision)

CREATE TABLE IF NOT EXISTS ads_approvals (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID        NOT NULL REFERENCES ads_recommendations(id) ON DELETE CASCADE,
  decided_by        UUID        NOT NULL,
  decision          VARCHAR(20) NOT NULL
                      CONSTRAINT ads_approvals_decision_check
                      CHECK (decision IN ('approved', 'rejected')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ads_approvals_rec_id  ON ads_approvals(recommendation_id);
CREATE INDEX IF NOT EXISTS idx_ads_approvals_decided ON ads_approvals(decided_by);
CREATE INDEX IF NOT EXISTS idx_ads_approvals_created ON ads_approvals(created_at DESC);


-- ── ads_implementation_logs ───────────────────────────────────────────
-- Execution ledger for each implementation attempt (real or simulated).
-- One row per recommendation run attempt; duplicate-prevention is enforced
-- at the application layer (see simulator.ts).
--
-- Referenced by:
--   src/lib/ads/gateway/simulator.ts (duplicate check + mock insert)

CREATE TABLE IF NOT EXISTS ads_implementation_logs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID        NOT NULL REFERENCES ads_recommendations(id) ON DELETE CASCADE,
  operator_id       UUID        NOT NULL,
  status            VARCHAR(50) NOT NULL DEFAULT 'MOCK_SUCCESS',
  details           TEXT,
  attempted_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ads_impl_rec_id   ON ads_implementation_logs(recommendation_id);
CREATE INDEX IF NOT EXISTS idx_ads_impl_operator ON ads_implementation_logs(operator_id);
CREATE INDEX IF NOT EXISTS idx_ads_impl_status   ON ads_implementation_logs(status);
CREATE INDEX IF NOT EXISTS idx_ads_impl_attempted ON ads_implementation_logs(attempted_at DESC);


-- ══════════════════════════════════════════════════════════════════════
-- 2. ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════════════════
--
-- Strategy: small team, all authenticated users get full CRUD.
-- Service role bypasses RLS automatically.
-- Anon (unauthenticated) gets nothing.
-- ══════════════════════════════════════════════════════════════════════

-- ── ads_recommendations ───────────────────────────────────────────────
ALTER TABLE ads_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access on ads_recommendations"
  ON ads_recommendations FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── ads_approvals ─────────────────────────────────────────────────────
ALTER TABLE ads_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access on ads_approvals"
  ON ads_approvals FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── ads_implementation_logs ───────────────────────────────────────────
ALTER TABLE ads_implementation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access on ads_implementation_logs"
  ON ads_implementation_logs FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- ══════════════════════════════════════════════════════════════════════
-- Done. This migration creates 3 tables with RLS, 10 indexes, and FK
-- relationships to ads_campaigns, ads_ad_groups, ads_keywords, ad_reviews.
-- ══════════════════════════════════════════════════════════════════════
