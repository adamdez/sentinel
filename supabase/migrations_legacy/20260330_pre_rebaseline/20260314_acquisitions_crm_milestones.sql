-- Acquisitions CRM Foundation: Milestone Capture & Attribution Visibility
-- Slice 1 Migration

-- 1. Add qualified to lead_status enum (if not exists)
-- Using a DO block to safely add the enum value
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'lead_status' AND e.enumlabel = 'qualified') THEN
        ALTER TYPE lead_status ADD VALUE 'qualified' AFTER 'lead';
    END IF;
END
$$;

-- 2. Add milestone fields to leads table
ALTER TABLE leads 
  ADD COLUMN IF NOT EXISTS conversion_gclid TEXT,
  ADD COLUMN IF NOT EXISTS appointment_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS offer_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS contract_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assignment_fee_projected NUMERIC(12,2);

-- 3. Milestone Audit Trail Indexes (using existing event_log)
-- No changes needed to event_log table itself, but we should ensure 
-- we have an index on details->>'milestone' if we plan to query it often.
-- However, standard entity_type/entity_id indexing is usually enough for single-lead views.

-- 4. Attribution helper indexes (for performance on joined reads)
-- These tables (ads_lead_attribution, etc.) already exist but may need indexes
CREATE INDEX IF NOT EXISTS idx_ads_lead_attribution_lead_id ON ads_lead_attribution(lead_id);
CREATE INDEX IF NOT EXISTS idx_ads_campaigns_google_id ON ads_campaigns(google_campaign_id);
CREATE INDEX IF NOT EXISTS idx_ads_ad_groups_google_id ON ads_ad_groups(google_ad_group_id);
CREATE INDEX IF NOT EXISTS idx_ads_keywords_google_id ON ads_keywords(google_keyword_id);
