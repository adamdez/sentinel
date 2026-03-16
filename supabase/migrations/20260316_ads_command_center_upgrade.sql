-- ============================================================
-- Ads Command Center Upgrade Migration
-- New tables: ads_negative_keywords, ads_campaign_budgets,
--   ads_conversion_actions, ads_device_metrics, ads_geo_metrics,
--   ads_intelligence_briefings, ads_alerts
-- New columns on ads_keywords, ads_recommendations
-- ============================================================

-- 1. ads_negative_keywords
CREATE TABLE IF NOT EXISTS ads_negative_keywords (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER REFERENCES ads_campaigns(id) ON DELETE CASCADE,
  ad_group_id INTEGER REFERENCES ads_ad_groups(id) ON DELETE CASCADE,
  google_criterion_id TEXT NOT NULL,
  keyword_text TEXT NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'BROAD',
  level TEXT NOT NULL CHECK (level IN ('campaign', 'ad_group')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (google_criterion_id)
);

CREATE INDEX IF NOT EXISTS idx_ads_neg_kw_campaign ON ads_negative_keywords(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ads_neg_kw_ad_group ON ads_negative_keywords(ad_group_id);

-- 2. ads_campaign_budgets
CREATE TABLE IF NOT EXISTS ads_campaign_budgets (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES ads_campaigns(id) ON DELETE CASCADE,
  google_budget_id TEXT NOT NULL,
  daily_budget_micros BIGINT NOT NULL DEFAULT 0,
  delivery_method TEXT DEFAULT 'STANDARD',
  is_shared BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (google_budget_id)
);

CREATE INDEX IF NOT EXISTS idx_ads_budgets_campaign ON ads_campaign_budgets(campaign_id);

-- 3. ads_conversion_actions
CREATE TABLE IF NOT EXISTS ads_conversion_actions (
  id SERIAL PRIMARY KEY,
  google_conversion_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT,
  status TEXT,
  counting_type TEXT,
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. ads_device_metrics
CREATE TABLE IF NOT EXISTS ads_device_metrics (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER REFERENCES ads_campaigns(id) ON DELETE CASCADE,
  device TEXT NOT NULL,
  report_date DATE NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  cost_micros BIGINT NOT NULL DEFAULT 0,
  conversions NUMERIC(12,2) NOT NULL DEFAULT 0,
  UNIQUE (campaign_id, device, report_date)
);

CREATE INDEX IF NOT EXISTS idx_ads_device_metrics_date ON ads_device_metrics(report_date);

-- 5. ads_geo_metrics
CREATE TABLE IF NOT EXISTS ads_geo_metrics (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER REFERENCES ads_campaigns(id) ON DELETE CASCADE,
  geo_name TEXT NOT NULL,
  geo_type TEXT NOT NULL DEFAULT 'city',
  report_date DATE NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  cost_micros BIGINT NOT NULL DEFAULT 0,
  conversions NUMERIC(12,2) NOT NULL DEFAULT 0,
  UNIQUE (campaign_id, geo_name, report_date)
);

CREATE INDEX IF NOT EXISTS idx_ads_geo_metrics_date ON ads_geo_metrics(report_date);

-- 6. ads_intelligence_briefings
CREATE TABLE IF NOT EXISTS ads_intelligence_briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_date DATE NOT NULL,
  account_status TEXT NOT NULL DEFAULT 'unknown',
  executive_summary TEXT,
  total_estimated_monthly_waste NUMERIC(12,2) DEFAULT 0,
  total_estimated_monthly_opportunity NUMERIC(12,2) DEFAULT 0,
  data_points JSONB DEFAULT '[]'::JSONB,
  adversarial_result JSONB,
  trigger TEXT NOT NULL CHECK (trigger IN ('manual', 'daily_cron', 'weekly_cron')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ads_intel_briefings_date ON ads_intelligence_briefings(created_at DESC);

-- 7. ads_alerts
CREATE TABLE IF NOT EXISTS ads_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_id UUID REFERENCES ads_intelligence_briefings(id) ON DELETE CASCADE,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ads_alerts_unread ON ads_alerts(read) WHERE read = FALSE;

-- 8. New columns on ads_keywords for quality score components
ALTER TABLE ads_keywords
  ADD COLUMN IF NOT EXISTS quality_score INTEGER,
  ADD COLUMN IF NOT EXISTS expected_ctr TEXT,
  ADD COLUMN IF NOT EXISTS ad_relevance TEXT,
  ADD COLUMN IF NOT EXISTS landing_page_experience TEXT;

-- 9. New column on ads_recommendations for source briefing link
ALTER TABLE ads_recommendations
  ADD COLUMN IF NOT EXISTS source_briefing_id UUID;

-- Note: We don't add a FK to ads_intelligence_briefings here because the
-- ads_recommendations table may predate this migration and adding a FK
-- retroactively could fail if there are orphaned rows. The application
-- layer enforces the relationship.

-- 10. Add 'executed' to recommendation status if using enum
DO $$
BEGIN
  ALTER TYPE ads_recommendation_status ADD VALUE IF NOT EXISTS 'executed';
EXCEPTION
  WHEN undefined_object THEN
    -- status is text, not enum — no action needed
    NULL;
END $$;
