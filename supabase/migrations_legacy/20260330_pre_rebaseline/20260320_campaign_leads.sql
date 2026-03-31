-- Campaign leads junction table for outbound call campaigns
-- Tracks which leads are in which campaign, their touch progress, and DNC skips

CREATE TABLE IF NOT EXISTS campaign_leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, in_progress, contacted, completed, skipped
  current_touch INTEGER NOT NULL DEFAULT 0,
  last_touch_at TIMESTAMPTZ,
  next_touch_at TIMESTAMPTZ,
  skip_reason VARCHAR(50),  -- dnc, opted_out, litigator, no_phone, completed
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(campaign_id, lead_id)
);

CREATE INDEX idx_campaign_leads_campaign ON campaign_leads(campaign_id);
CREATE INDEX idx_campaign_leads_lead ON campaign_leads(lead_id);
CREATE INDEX idx_campaign_leads_status ON campaign_leads(status);
CREATE INDEX idx_campaign_leads_next_touch ON campaign_leads(next_touch_at);

-- DNC list table for centralized suppression
-- Checked before any outbound call or SMS

CREATE TABLE IF NOT EXISTS dnc_list (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  reason VARCHAR(100),  -- seller_request, federal_dnc, litigator, internal
  source VARCHAR(100),  -- manual, import, federal_scrub, seller_request
  added_by UUID,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,  -- null = permanent
  UNIQUE(phone)
);

CREATE INDEX idx_dnc_phone ON dnc_list(phone);
