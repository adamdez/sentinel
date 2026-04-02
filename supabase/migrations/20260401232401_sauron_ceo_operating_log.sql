
-- ============================================================
-- SAURON CEO OPERATING LOG
-- This is how the AI CEO thinks, decides, and acts.
-- The owner sees a filtered view of this.
-- ============================================================

-- 1. DECISIONS — Every decision the AI CEO makes, with reasoning
CREATE TABLE sauron.decisions (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id     TEXT REFERENCES sauron.businesses(id),
    department      TEXT NOT NULL,     -- 'marketing', 'sales', 'operations', 'finance', 'customer_success', 'compliance', 'data', 'systems', 'people', 'sops'
    zone            INTEGER NOT NULL,  -- 1=auto, 2=act+log, 3=propose+wait, 4=human_only
    decision        TEXT NOT NULL,     -- What was decided
    reasoning       TEXT,             -- Why — data-backed
    action_taken    TEXT,             -- What Sauron actually did
    outcome         TEXT,             -- What happened as a result (filled later)
    data_inputs     JSONB,            -- What data informed the decision
    status          TEXT DEFAULT 'executed', -- executed, proposed, approved, vetoed, rolled_back
    rollback_plan   TEXT,             -- How to undo this if it goes wrong
    rollback_deadline TIMESTAMPTZ,    -- Auto-rollback if metrics decline
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ
);

CREATE INDEX idx_decisions_zone ON sauron.decisions (zone) WHERE zone >= 3;
CREATE INDEX idx_decisions_dept ON sauron.decisions (department);
CREATE INDEX idx_decisions_status ON sauron.decisions (status) WHERE status = 'proposed';

-- 2. MONEY_LOG — Every dollar in and every dollar out, tracked
CREATE TABLE sauron.money_log (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id     TEXT REFERENCES sauron.businesses(id),
    direction       TEXT NOT NULL,    -- 'in' or 'out'
    category        TEXT NOT NULL,    -- 'ad_spend', 'revenue', 'parts', 'software', 'insurance', 'fuel', 'assignment_fee', 'service_revenue'
    amount          NUMERIC(12,2) NOT NULL,
    description     TEXT,
    source          TEXT,             -- 'google_ads', 'jobber', 'manual', 'stripe', 'title_company'
    reference_id    TEXT,             -- invoice #, deal #, campaign ID
    logged_at       DATE DEFAULT CURRENT_DATE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_money_business_date ON sauron.money_log (business_id, logged_at DESC);

-- 3. OWNER_FEED — The filtered view of what Dez sees
--    This is NOT the full decision log. This is the curated feed.
CREATE OR REPLACE VIEW sauron.owner_feed AS
SELECT
    d.id,
    d.business_id,
    b.name as business_name,
    d.department,
    d.zone,
    d.decision,
    d.reasoning,
    d.action_taken,
    d.status,
    d.created_at,
    CASE d.zone
        WHEN 1 THEN 'handled'           -- You never see these unless you drill in
        WHEN 2 THEN 'done — FYI'        -- Quick scan
        WHEN 3 THEN 'needs your call'   -- You decide
        WHEN 4 THEN 'you must do this'  -- Only you
    END as owner_action
FROM sauron.decisions d
JOIN sauron.businesses b ON b.id = d.business_id
WHERE 
    -- Zone 1: only show if something unusual happened
    (d.zone = 1 AND d.status = 'rolled_back')
    -- Zone 2: show all (brief scan)
    OR d.zone = 2
    -- Zone 3: show all pending
    OR (d.zone = 3 AND d.status = 'proposed')
    -- Zone 4: always show
    OR d.zone = 4
ORDER BY
    CASE d.zone WHEN 4 THEN 0 WHEN 3 THEN 1 WHEN 2 THEN 2 ELSE 3 END,
    d.created_at DESC;

-- 4. DAILY_SCORECARD — What the AI CEO produces every morning
CREATE TABLE sauron.daily_scorecards (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    scorecard_date  DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Dominion
    dom_leads_new           INTEGER DEFAULT 0,
    dom_leads_contacted     INTEGER DEFAULT 0,
    dom_callbacks_due       INTEGER DEFAULT 0,
    dom_callbacks_overdue   INTEGER DEFAULT 0,
    dom_offers_out          INTEGER DEFAULT 0,
    dom_contracts_active    INTEGER DEFAULT 0,
    dom_ad_spend            NUMERIC(10,2) DEFAULT 0,
    dom_ad_leads            INTEGER DEFAULT 0,
    dom_ad_cpl              NUMERIC(10,2),
    dom_tax_scout_new       INTEGER DEFAULT 0,
    dom_revenue_mtd         NUMERIC(12,2) DEFAULT 0,
    
    -- WrenchReady
    wr_jobs_today           INTEGER DEFAULT 0,
    wr_jobs_tomorrow        INTEGER DEFAULT 0,
    wr_unconfirmed          INTEGER DEFAULT 0,
    wr_revenue_today        NUMERIC(10,2) DEFAULT 0,
    wr_revenue_mtd          NUMERIC(12,2) DEFAULT 0,
    wr_reviews_requested    INTEGER DEFAULT 0,
    wr_reviews_received     INTEGER DEFAULT 0,
    wr_deferred_pipeline    NUMERIC(12,2) DEFAULT 0,
    wr_invoices_overdue     INTEGER DEFAULT 0,
    wr_ad_spend             NUMERIC(10,2) DEFAULT 0,
    wr_ad_bookings          INTEGER DEFAULT 0,
    wr_simon_wrench_pct     NUMERIC(5,2),
    wr_aro                  NUMERIC(10,2),
    
    -- Sauron meta
    decisions_made_z1       INTEGER DEFAULT 0,
    decisions_made_z2       INTEGER DEFAULT 0,
    decisions_pending_z3    INTEGER DEFAULT 0,
    decisions_pending_z4    INTEGER DEFAULT 0,
    tasks_completed         INTEGER DEFAULT 0,
    tasks_overdue           INTEGER DEFAULT 0,
    system_health           TEXT DEFAULT 'green',  -- green, yellow, red
    
    -- The brief itself
    morning_brief           TEXT,
    
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(scorecard_date)
);

-- 5. CEO_CAPABILITIES — What Sauron can actually do (not aspirational)
CREATE TABLE sauron.capabilities (
    id              TEXT PRIMARY KEY,
    department      TEXT NOT NULL,
    capability      TEXT NOT NULL,
    status          TEXT NOT NULL,     -- 'live', 'wired', 'planned', 'blocked'
    autonomy_level  TEXT NOT NULL,     -- 'autonomous', 'visibility', 'approval', 'human_only'
    data_source     TEXT,              -- Where the data comes from
    blocker         TEXT,              -- What's preventing this from working
    priority        INTEGER DEFAULT 5, -- 1=critical, 5=nice-to-have
    business_id     TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Seed the current state of every capability
INSERT INTO sauron.capabilities (id, department, capability, status, autonomy_level, data_source, blocker, priority, business_id) VALUES
-- MARKETING — what works today
('mkt_wr_ads_monitor', 'marketing', 'WrenchReady Google Ads monitoring', 'blocked', 'visibility', 'Google Ads API', 'Google tag missing on site. Conversion tracking not set up.', 1, 'wrenchready'),
('mkt_dom_ads_monitor', 'marketing', 'Dominion Google Ads monitoring', 'wired', 'visibility', 'dominion-ads-ai repo', 'Conversion tracking env vars not set on Vercel. Campaigns paused.', 1, 'dominion'),
('mkt_dom_ads_optimize', 'marketing', 'Dominion ad optimization recommendations', 'wired', 'approval', 'dominion-ads-ai AI layer', 'App needs deployment and connection to live data.', 2, 'dominion'),
('mkt_seo_gbp', 'marketing', 'GBP posting and review responses', 'planned', 'autonomous', 'Google Business Profile API', 'No API connection yet.', 3, NULL),
('mkt_direct_mail', 'marketing', 'Direct mail campaign management', 'planned', 'approval', 'Mail vendor API', 'No vendor selected.', 4, 'dominion'),

-- SALES
('sales_callbacks', 'sales', 'Lead callback monitoring and alerts', 'live', 'autonomous', 'sauron.lead_follow_ups', 'No leads in system yet.', 1, 'dominion'),
('sales_call_prep', 'sales', 'Call prep dossier generation', 'planned', 'autonomous', 'tax_scout + SCOUT + Sentinel CRM', 'Tax Scout scraper not running. SCOUT requires browser.', 2, 'dominion'),
('sales_intake_wr', 'sales', 'WrenchReady intake and screening', 'planned', 'autonomous', 'OpenPhone + AI voice', 'AI voice receptionist not configured.', 2, 'wrenchready'),
('sales_stale_sweep', 'sales', 'Stale lead detection and escalation', 'live', 'autonomous', 'sauron.lead_follow_ups', 'No leads flowing yet.', 2, 'dominion'),

-- OPERATIONS
('ops_simon_schedule', 'operations', 'Simon daily schedule and dispatch', 'planned', 'autonomous', 'Jobber', 'Jobber not connected.', 1, 'wrenchready'),
('ops_parts_ordering', 'operations', 'Parts pre-ordering and will-call', 'planned', 'approval', 'Parts vendor APIs / manual', 'No integration. Manual process.', 3, 'wrenchready'),
('ops_route_optimization', 'operations', 'Route optimization for Simon', 'planned', 'autonomous', 'Jobber + Google Maps', 'Jobber not connected.', 3, 'wrenchready'),
('ops_task_assignment', 'operations', 'Task routing to Dez/Logan/Simon', 'live', 'autonomous', 'sauron.tasks', 'Schema live. n8n workflow not built.', 2, NULL),
('ops_property_walkthrough', 'operations', 'Property walkthrough tracking', 'planned', 'visibility', 'Sentinel CRM', 'No walkthrough module in CRM.', 4, 'dominion'),
('ops_appointment_confirm', 'operations', 'Day-before appointment confirmations', 'planned', 'autonomous', 'Jobber + OpenPhone', 'Neither connected.', 2, 'wrenchready'),

-- FINANCE
('fin_daily_pl', 'finance', 'Daily P&L snapshot', 'planned', 'visibility', 'Jobber + Google Ads + Sentinel', 'No revenue data flowing.', 2, NULL),
('fin_invoice_chase', 'finance', 'Invoice follow-up automation', 'planned', 'autonomous', 'Jobber', 'Jobber not connected.', 2, 'wrenchready'),
('fin_deal_economics', 'finance', 'Deal-level economics tracking', 'planned', 'visibility', 'Sentinel CRM', 'No deal tracking module.', 3, 'dominion'),
('fin_cash_forecast', 'finance', 'Cash flow forecast', 'planned', 'visibility', 'Bank + all revenue sources', 'No bank connection.', 4, NULL),
('fin_ad_roi', 'finance', 'Ad spend vs revenue ROI', 'planned', 'visibility', 'dominion-ads-ai + Jobber', 'Need revenue data to close the loop.', 2, NULL),

-- CUSTOMER SUCCESS
('cs_review_request', 'customer_success', 'Auto review request after job', 'planned', 'autonomous', 'Jobber + OpenPhone/SMS', 'Jobber not connected. n8n workflow not built.', 1, 'wrenchready'),
('cs_followup_48hr', 'customer_success', '48-hour post-service check-in', 'planned', 'autonomous', 'Jobber + SMS', 'Jobber not connected.', 2, 'wrenchready'),
('cs_deferred_work', 'customer_success', 'Deferred work pipeline and reminders', 'planned', 'autonomous', 'Jobber + SMS', 'Jobber not connected.', 2, 'wrenchready'),
('cs_maintenance_remind', 'customer_success', 'Maintenance interval reminders', 'planned', 'autonomous', 'Jobber + SMS', 'Jobber not connected.', 3, 'wrenchready'),

-- DATA & INTELLIGENCE
('data_tax_scout', 'data', 'Tax delinquent property detection', 'wired', 'autonomous', 'tax_scout schema + ArcGIS', 'Scraper not running on VPS.', 1, 'dominion'),
('data_probate', 'data', 'Probate filing monitor', 'planned', 'autonomous', 'Court clerk records', 'Need to call clerk and set up data feed.', 2, 'dominion'),
('data_market_intel', 'data', 'Market comps and ARV data', 'planned', 'visibility', 'MLS / data vendor', 'No connection.', 3, 'dominion'),
('data_buyer_memory', 'data', 'Buyer preference and reliability tracking', 'planned', 'visibility', 'Sentinel CRM', 'No buyer module.', 3, 'dominion'),

-- COMPLIANCE
('comp_license_tracking', 'compliance', 'License and insurance expiry alerts', 'planned', 'autonomous', 'Manual entry + reminders', 'Not tracked yet.', 3, NULL),
('comp_contact_limits', 'compliance', 'Contact frequency and DNC compliance', 'planned', 'autonomous', 'Sentinel CRM', 'No contact tracking.', 2, 'dominion'),

-- SYSTEMS
('sys_n8n_monitor', 'systems', 'n8n workflow health monitoring', 'live', 'autonomous', 'n8n API', 'Connected. Brain-to-Obsidian workflow running.', 2, NULL),
('sys_vercel_status', 'systems', 'Website deployment status', 'planned', 'autonomous', 'Vercel API', 'Not wired.', 3, NULL),
('sys_supabase_health', 'systems', 'Database health and backup', 'live', 'autonomous', 'Supabase', 'Connected and healthy.', 3, NULL),

-- SOPs
('sop_auto_capture', 'sops', 'Auto-detect repeated manual tasks', 'planned', 'autonomous', 'sauron.tasks pattern detection', 'Logic not implemented.', 4, NULL),
('sop_library', 'sops', 'Searchable SOP library', 'live', 'visibility', 'sauron.sops + Obsidian', 'Schema live. No SOPs written yet.', 3, NULL);

