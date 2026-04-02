
-- Agent hierarchy for Sauron's operating structure
CREATE TABLE sauron.agents (
    id              TEXT PRIMARY KEY,
    role            TEXT NOT NULL,       -- 'ceo', 'ops_manager', 'department_head'
    business_id     TEXT,                -- NULL for CEO (cross-business), set for ops managers and dept heads
    department      TEXT,                -- NULL for CEO and ops managers, set for dept heads
    reports_to      TEXT REFERENCES sauron.agents(id),
    name            TEXT NOT NULL,
    mandate         TEXT NOT NULL,       -- What this agent is responsible for
    first_actions   TEXT,                -- What this agent should do first when activated
    last_report     TEXT,                -- Most recent report from this agent
    last_report_at  TIMESTAMPTZ,
    status          TEXT DEFAULT 'inactive', -- 'active', 'inactive', 'reporting'
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- CEO
INSERT INTO sauron.agents (id, role, name, mandate, first_actions) VALUES
('ceo', 'ceo', 'Sauron', 
 'Set priorities across both businesses. Allocate resources. Make cross-business decisions. Report to the board (Dez). Read ops manager reports and decide.',
 'Read latest ops manager reports. Check owner feed for pending Zone 3+ items. Review daily scorecard. Set priorities for the day.');

-- Ops Managers
INSERT INTO sauron.agents (id, role, business_id, reports_to, name, mandate, first_actions) VALUES
('ops_dominion', 'ops_manager', 'dominion', 'ceo', 'Dominion Ops Manager',
 'Own all departments for Dominion Home Deals. Synthesize department reports. Present best options to CEO. Ensure Logan has leads and deals are flowing.',
 'Collect reports from all Dominion department agents. Check: are leads flowing? Is Logan calling? Are deals progressing? What is broken?'),
('ops_wrenchready', 'ops_manager', 'wrenchready', 'ceo', 'WrenchReady Ops Manager',
 'Own all departments for WrenchReady Mobile. Synthesize department reports. Present best options to CEO. Ensure Simon is on a wrench and customers get what they were promised.',
 'Collect reports from all WrenchReady department agents. Check: is Simon booked? Are parts ordered? Are reviews being requested? Is the phone being answered?');

-- Dominion Department Agents
INSERT INTO sauron.agents (id, role, business_id, department, reports_to, name, mandate, first_actions) VALUES
('dom_marketing', 'department_head', 'dominion', 'marketing', 'ops_dominion', 'Dominion Marketing',
 'Google Ads monitoring and optimization. Direct mail campaigns. SEO and web presence. Attribution tracking. Cost per lead and cost per contract.',
 'Check Google Ads account AW-17965617288. Is it active? What are the metrics? Is dominion-ads-ai deployed? Review ad copy and keywords.'),
('dom_sales', 'department_head', 'dominion', 'sales', 'ops_dominion', 'Dominion Sales',
 'Lead pipeline management. Callback tracking. Call prep. Stale lead detection. Logan performance tracking.',
 'Check Sentinel CRM for active leads. How many callbacks are overdue? What is Logan working? Are call prep dossiers being generated?'),
('dom_data', 'department_head', 'dominion', 'data', 'ops_dominion', 'Dominion Data Intelligence',
 'Tax Scout delinquent properties. Probate filings. Market comps. Buyer memory. Data quality.',
 'Check tax_scout schema. How many parcels loaded? Is the scraper running? Are delinquent leads being scored and fed to the pipeline?'),
('dom_operations', 'department_head', 'dominion', 'operations', 'ops_dominion', 'Dominion Operations',
 'Property walkthroughs. Task assignment. Workflow coordination between Dez and Logan.',
 'Check sauron.tasks for Dominion. What is assigned? What is overdue? Is the workflow between Dez and Logan documented?'),
('dom_finance', 'department_head', 'dominion', 'finance', 'ops_dominion', 'Dominion Finance',
 'Deal economics. Ad spend tracking. Revenue forecasting. Cash flow.',
 'Check: what deals are in progress? What has been spent on marketing? What is the projected revenue this month?'),

-- WrenchReady Department Agents
('wr_marketing', 'department_head', 'wrenchready', 'marketing', 'ops_wrenchready', 'WrenchReady Marketing',
 'Google Ads monitoring. GBP management. Review velocity. Referral tracking. Cost per booking.',
 'Check Google Ads account 298-300-9450. Are campaigns delivering after tag fix? What are impressions/clicks? Audit ad copy and geo targeting.'),
('wr_sales', 'department_head', 'wrenchready', 'sales', 'ops_wrenchready', 'WrenchReady Sales',
 'Lead intake and screening. Booking pipeline. Missed call recovery. Estimate turnaround.',
 'Check: how are leads coming in? Is OpenPhone answering? Is there an AI voice receptionist? What is the intake-to-booking conversion rate?'),
('wr_operations', 'department_head', 'wrenchready', 'operations', 'ops_wrenchready', 'WrenchReady Operations',
 'Simon schedule and dispatch. Parts ordering. Route optimization. Appointment confirmations. Van readiness.',
 'Check: is Jobber set up? What is Simon scheduled for tomorrow? Are parts pre-ordered? Is the day-before confirmation process working?'),
('wr_customer_success', 'department_head', 'wrenchready', 'customer_success', 'ops_wrenchready', 'WrenchReady Customer Success',
 'Review requests. 48-hour follow-ups. Deferred work pipeline. Maintenance reminders. Comeback tracking.',
 'Check: are review requests going out within 10 min of job completion? Is the deferred work pipeline tracking SOON items? What is the current review count?'),
('wr_finance', 'department_head', 'wrenchready', 'finance', 'ops_wrenchready', 'WrenchReady Finance',
 'Invoice tracking. ARO monitoring. GP/hr calculation. Ad spend vs revenue. Tax reserve.',
 'Check: are invoices being sent? What is the current ARO? Is the tax reserve being funded? What is Simon''s GP/hr?');

