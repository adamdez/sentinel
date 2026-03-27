-- ════════════════════════════════════════════════════════════════════════════════
-- Phase 1: Special Lead Intake Queue — Leads Table Alterations
-- ════════════════════════════════════════════════════════════════════════════════
--
-- Modifies the leads table to:
-- 1. Track which intake_lead record this lead came from (via intake_lead_id FK)
-- 2. Flag leads that came from special intake queue (via from_special_intake boolean)
-- 3. Auto-cycle suppression: leads with from_special_intake = TRUE are skipped by
--    jeff-auto-redial cron until next_action is explicitly set to something other than "review"
--

-- Add intake_lead_id column (nullable FK to intake_leads)
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS intake_lead_id UUID REFERENCES intake_leads(id) ON DELETE SET NULL;

-- Add from_special_intake flag (default FALSE for backward compatibility)
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS from_special_intake BOOLEAN NOT NULL DEFAULT FALSE;

-- Add source_category column to track provider/source in leads table itself (denormalized for performance)
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS source_category VARCHAR(255);

-- Index on intake_lead_id for efficient lookups
CREATE INDEX IF NOT EXISTS idx_leads_intake_lead_id
  ON leads(intake_lead_id);

-- Index on from_special_intake for filtering special intakes in auto-cycle cron
CREATE INDEX IF NOT EXISTS idx_leads_from_special_intake
  ON leads(from_special_intake);

-- Index on source_category for KPI filtering and reporting
CREATE INDEX IF NOT EXISTS idx_leads_source_category
  ON leads(source_category);

-- Composite index for auto-cycle: (from_special_intake, next_action, status)
-- Used in cron query: WHERE from_special_intake = true AND next_action != 'call' AND status IN (...)
CREATE INDEX IF NOT EXISTS idx_leads_auto_cycle_suppression
  ON leads(from_special_intake, next_action, status);
