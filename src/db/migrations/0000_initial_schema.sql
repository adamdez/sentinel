-- Sentinel ERP — Initial Schema Migration
-- Run with: npx drizzle-kit push
-- Or generate: npx drizzle-kit generate

-- ══════════════════════════════════════════════════════════════════════
-- ENUMS
-- ══════════════════════════════════════════════════════════════════════

CREATE TYPE lead_status AS ENUM (
  'prospect', 'lead', 'negotiation', 'disposition', 'nurture', 'dead', 'closed'
);

CREATE TYPE deal_status AS ENUM (
  'draft', 'negotiating', 'under_contract', 'assigned', 'closed', 'dead'
);

CREATE TYPE user_role AS ENUM ('admin', 'agent', 'viewer');

CREATE TYPE distress_type AS ENUM (
  'probate', 'pre_foreclosure', 'tax_lien', 'code_violation',
  'vacant', 'divorce', 'bankruptcy', 'fsbo', 'absentee', 'inherited'
);

-- ══════════════════════════════════════════════════════════════════════
-- TABLES
-- ══════════════════════════════════════════════════════════════════════

-- User Profiles (linked to auth.users)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name VARCHAR(200) NOT NULL,
  email VARCHAR(255) NOT NULL,
  role user_role NOT NULL DEFAULT 'agent',
  avatar_url TEXT,
  phone VARCHAR(20),
  is_active BOOLEAN NOT NULL DEFAULT true,
  saved_dashboard_layout JSONB,
  preferences JSONB NOT NULL DEFAULT '{}',
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Properties (APN + county = canonical identity)
CREATE TABLE IF NOT EXISTS properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apn VARCHAR(50) NOT NULL,
  county VARCHAR(100) NOT NULL,
  address TEXT NOT NULL,
  city VARCHAR(100) NOT NULL DEFAULT '',
  state VARCHAR(2) NOT NULL DEFAULT '',
  zip VARCHAR(10) NOT NULL DEFAULT '',
  owner_name TEXT NOT NULL,
  owner_phone VARCHAR(20),
  owner_email VARCHAR(255),
  estimated_value INTEGER,
  equity_percent NUMERIC(5,2),
  bedrooms INTEGER,
  bathrooms NUMERIC(3,1),
  sqft INTEGER,
  year_built INTEGER,
  lot_size INTEGER,
  property_type VARCHAR(50),
  owner_flags JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_apn_county UNIQUE (apn, county)
);

-- Distress Events (Signal Domain — append-only)
CREATE TABLE IF NOT EXISTS distress_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  event_type distress_type NOT NULL,
  source VARCHAR(100) NOT NULL,
  severity INTEGER NOT NULL DEFAULT 5,
  fingerprint VARCHAR(128) NOT NULL,
  raw_data JSONB NOT NULL DEFAULT '{}',
  confidence NUMERIC(4,3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_distress_fingerprint UNIQUE (fingerprint)
);

-- Scoring Records (Scoring Domain — append-only, versioned)
CREATE TABLE IF NOT EXISTS scoring_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  model_version VARCHAR(20) NOT NULL,
  composite_score INTEGER NOT NULL,
  motivation_score INTEGER NOT NULL,
  deal_score INTEGER NOT NULL,
  severity_multiplier NUMERIC(4,2) NOT NULL,
  recency_decay NUMERIC(4,2) NOT NULL,
  stacking_bonus INTEGER NOT NULL DEFAULT 0,
  owner_factor_score INTEGER NOT NULL DEFAULT 0,
  equity_factor_score NUMERIC(6,2) NOT NULL DEFAULT 0,
  ai_boost INTEGER NOT NULL DEFAULT 0,
  factors JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Contacts
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),
  address TEXT,
  contact_type VARCHAR(50) NOT NULL DEFAULT 'owner',
  source VARCHAR(100),
  dnc_status BOOLEAN NOT NULL DEFAULT false,
  opt_out BOOLEAN NOT NULL DEFAULT false,
  litigant_flag BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Leads (Workflow Domain)
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  status lead_status NOT NULL DEFAULT 'prospect',
  assigned_to UUID,
  priority INTEGER NOT NULL DEFAULT 0,
  source VARCHAR(100),
  promoted_at TIMESTAMPTZ,
  last_contact_at TIMESTAMPTZ,
  next_follow_up_at TIMESTAMPTZ,
  disposition_code VARCHAR(50),
  notes TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  lock_version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deals
CREATE TABLE IF NOT EXISTS deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  status deal_status NOT NULL DEFAULT 'draft',
  ask_price INTEGER,
  offer_price INTEGER,
  contract_price INTEGER,
  assignment_fee INTEGER,
  arv INTEGER,
  repair_estimate INTEGER,
  buyer_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  assigned_to UUID NOT NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  priority INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Campaigns
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  campaign_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  audience_filter JSONB NOT NULL DEFAULT '{}',
  template_id VARCHAR(100),
  sent_count INTEGER NOT NULL DEFAULT 0,
  open_count INTEGER NOT NULL DEFAULT 0,
  click_count INTEGER NOT NULL DEFAULT 0,
  response_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Offers
CREATE TABLE IF NOT EXISTS offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  offer_type VARCHAR(50) NOT NULL,
  amount INTEGER NOT NULL,
  terms TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  offered_by UUID NOT NULL,
  offered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  response TEXT,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Event Log (append-only audit trail)
CREATE TABLE IF NOT EXISTS event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(100) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════════════
-- INDEXES
-- ══════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_properties_county ON properties(county);
CREATE INDEX IF NOT EXISTS idx_properties_owner ON properties(owner_name);
CREATE INDEX IF NOT EXISTS idx_properties_zip ON properties(zip);

CREATE INDEX IF NOT EXISTS idx_distress_property ON distress_events(property_id);
CREATE INDEX IF NOT EXISTS idx_distress_type ON distress_events(event_type);
CREATE INDEX IF NOT EXISTS idx_distress_created ON distress_events(created_at);

CREATE INDEX IF NOT EXISTS idx_scoring_property ON scoring_records(property_id);
CREATE INDEX IF NOT EXISTS idx_scoring_composite ON scoring_records(composite_score);
CREATE INDEX IF NOT EXISTS idx_scoring_version ON scoring_records(model_version);
CREATE INDEX IF NOT EXISTS idx_scoring_created ON scoring_records(created_at);

CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(last_name, first_name);

CREATE INDEX IF NOT EXISTS idx_leads_property ON leads(property_id);
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_priority ON leads(priority);
CREATE INDEX IF NOT EXISTS idx_leads_follow_up ON leads(next_follow_up_at);

CREATE INDEX IF NOT EXISTS idx_deals_lead ON deals(lead_id);
CREATE INDEX IF NOT EXISTS idx_deals_status ON deals(status);
CREATE INDEX IF NOT EXISTS idx_deals_property ON deals(property_id);

CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_type ON campaigns(campaign_type);

CREATE INDEX IF NOT EXISTS idx_offers_deal ON offers(deal_id);
CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(status);

CREATE INDEX IF NOT EXISTS idx_event_log_user ON event_log(user_id);
CREATE INDEX IF NOT EXISTS idx_event_log_entity ON event_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_event_log_action ON event_log(action);
CREATE INDEX IF NOT EXISTS idx_event_log_created ON event_log(created_at);

CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);

-- ══════════════════════════════════════════════════════════════════════
-- TRIGGERS: auto-update updated_at
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_properties_updated BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_contacts_updated BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_leads_updated BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_deals_updated BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_campaigns_updated BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_user_profiles_updated BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ══════════════════════════════════════════════════════════════════════
-- APPEND-ONLY ENFORCEMENT
-- ══════════════════════════════════════════════════════════════════════

-- Prevent UPDATE/DELETE on distress_events
CREATE OR REPLACE FUNCTION prevent_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'This table is append-only. % operations are not allowed.', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_distress_events_immutable
  BEFORE UPDATE OR DELETE ON distress_events
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

CREATE TRIGGER trg_scoring_records_immutable
  BEFORE UPDATE OR DELETE ON scoring_records
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

CREATE TRIGGER trg_event_log_immutable
  BEFORE UPDATE OR DELETE ON event_log
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

-- ══════════════════════════════════════════════════════════════════════
-- AUTO-CREATE PROFILE ON SIGNUP
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    'agent'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
