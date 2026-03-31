-- ════════════════════════════════════════════════════════════════════════════════
-- Phase 1: Special Lead Intake Queue — New Tables
-- ════════════════════════════════════════════════════════════════════════════════
--
-- Creates two new tables for the intake workflow:
-- 1. intake_providers — operator-configurable PPL partner sources (e.g., "Lead House")
-- 2. intake_leads — pending leads waiting for approval before entering main CRM
--
-- These tables implement an approval gate: incoming leads from webhooks, email, and
-- APIs queue in intake_leads (not leads table). Operators review and "claim" them
-- via UI, which creates a full lead record with source tracking and auto-cycle suppression.
--

-- ────────────────────────────────────────────────────────────────────────────────
-- intake_providers: Operator-configurable PPL partner sources
-- ────────────────────────────────────────────────────────────────────────────────
-- Stores the list of known PPL providers (e.g., "Lead House", "PPL Partner A").
-- Used for dropdown validation in claim modal + KPI tracking by provider.

CREATE TABLE IF NOT EXISTS intake_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Provider identity
  name VARCHAR(255) UNIQUE NOT NULL,                    -- e.g., "Lead House", "PPL Partner A"
  webhook_vendor VARCHAR(255),                          -- Internal vendor name for webhook detection (e.g., "lead_house")
  description TEXT,

  -- Control flags
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  kpi_tracking_enabled BOOLEAN NOT NULL DEFAULT TRUE,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pre-populate with initial providers
INSERT INTO intake_providers (name, webhook_vendor, description, is_active, kpi_tracking_enabled)
VALUES
  ('Lead House', 'lead_house', 'PPL partner - primary source', TRUE, TRUE),
  ('Other PPL', NULL, 'Catch-all for other PPL partners', TRUE, TRUE)
ON CONFLICT (name) DO NOTHING;

-- Indexes for provider lookup
CREATE INDEX IF NOT EXISTS idx_intake_providers_active
  ON intake_providers(is_active);

-- ────────────────────────────────────────────────────────────────────────────────
-- intake_leads: Pending leads awaiting approval
-- ────────────────────────────────────────────────────────────────────────────────
-- Holds incoming leads from webhooks, email, and APIs before they enter the main
-- leads table. Operator must review and "claim" them (which creates a leads record).
--
-- Workflow: Webhook/Email/API → intake_leads (status = 'pending_review')
--           Operator review → Update status and normalized fields
--           "Claim Lead" button → Creates leads record with from_special_intake = true
--
-- Status lifecycle: pending_review → claimed OR rejected OR duplicate

CREATE TABLE IF NOT EXISTS intake_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Raw intake data (captured at ingest time)
  raw_payload JSONB NOT NULL,                           -- Full raw webhook/email/API payload
  source_channel VARCHAR(255) NOT NULL,                 -- e.g., "vendor_inbound", "email", "webform"
  source_vendor VARCHAR(255),                           -- e.g., "lead_house", "ppl_partner_a"
  source_category VARCHAR(255),                         -- Operator-friendly label (indexed for filtering)
  intake_method VARCHAR(255),                           -- Additional metadata
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Normalized fields (for quick filtering/display without parsing JSON)
  owner_name VARCHAR(255),
  owner_phone VARCHAR(20),                              -- E.164 format preferred
  owner_email VARCHAR(255),
  property_address TEXT,
  property_city VARCHAR(100),
  property_state VARCHAR(2),
  property_zip VARCHAR(10),
  county VARCHAR(100),
  apn VARCHAR(50),

  -- Intake workflow state
  status VARCHAR(50) NOT NULL DEFAULT 'pending_review', -- pending_review | claimed | rejected | duplicate
  review_notes TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  claimed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,

  -- Duplicate detection
  duplicate_of_lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  duplicate_confidence SMALLINT,                        -- 0-100, confidence score

  -- Auditing
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for intake queue filtering and performance
CREATE INDEX IF NOT EXISTS idx_intake_leads_status
  ON intake_leads(status);
CREATE INDEX IF NOT EXISTS idx_intake_leads_source_category
  ON intake_leads(source_category);
CREATE INDEX IF NOT EXISTS idx_intake_leads_received_at
  ON intake_leads(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_intake_leads_owner_phone
  ON intake_leads(owner_phone);
CREATE INDEX IF NOT EXISTS idx_intake_leads_owner_email
  ON intake_leads(owner_email);
CREATE INDEX IF NOT EXISTS idx_intake_leads_duplicate_of
  ON intake_leads(duplicate_of_lead_id);

-- Enable RLS on intake_leads (authenticated users can see all, but updates are gated via API)
ALTER TABLE intake_leads ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can SELECT all intake_leads (for the dashboard)
CREATE POLICY intake_leads_select_policy
  ON intake_leads
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- RLS Policy: Only API routes can INSERT/UPDATE (via service role)
-- The UI uses API routes, not direct DB writes, so these are restrictive
CREATE POLICY intake_leads_insert_policy
  ON intake_leads
  FOR INSERT
  WITH CHECK (FALSE);  -- No direct inserts from client; API routes use service role

CREATE POLICY intake_leads_update_policy
  ON intake_leads
  FOR UPDATE
  USING (FALSE);  -- No direct updates from client; API routes use service role

-- Similarly restrict intake_providers RLS
ALTER TABLE intake_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY intake_providers_select_policy
  ON intake_providers
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY intake_providers_insert_policy
  ON intake_providers
  FOR INSERT
  WITH CHECK (FALSE);

CREATE POLICY intake_providers_update_policy
  ON intake_providers
  FOR UPDATE
  USING (FALSE);
