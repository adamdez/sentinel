
-- ============================================================
-- SAURON V0 — Workflows, SOPs, and Task Engine
-- These tables make Sauron a DOER, not just a reporter
-- ============================================================

-- 1. WORKFLOWS — Repeatable processes Sauron manages
CREATE TABLE sauron.workflows (
    id              TEXT PRIMARY KEY,
    business_id     TEXT REFERENCES sauron.businesses(id),
    name            TEXT NOT NULL,
    description     TEXT,
    trigger_type    TEXT NOT NULL,       -- 'schedule', 'event', 'manual', 'threshold'
    trigger_config  JSONB,              -- cron, event name, threshold conditions
    steps           JSONB NOT NULL,     -- Ordered list of steps
    status          TEXT DEFAULT 'active',
    last_run        TIMESTAMPTZ,
    next_run        TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 2. WORKFLOW_RUNS — Execution history
CREATE TABLE sauron.workflow_runs (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workflow_id     TEXT REFERENCES sauron.workflows(id),
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    status          TEXT DEFAULT 'running',  -- running, completed, failed, skipped
    results         JSONB,
    error_message   TEXT
);

-- 3. TASKS — Assigned work for Dez, Logan, Simon, or Sauron itself
CREATE TABLE sauron.tasks (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id     TEXT REFERENCES sauron.businesses(id),
    assigned_to     TEXT NOT NULL,       -- 'dez', 'logan', 'simon', 'sauron'
    title           TEXT NOT NULL,
    description     TEXT,
    priority        TEXT DEFAULT 'normal',
    status          TEXT DEFAULT 'open', -- open, in_progress, blocked, done
    due_date        DATE,
    context         JSONB,              -- Property info, lead data, whatever's relevant
    created_by      TEXT DEFAULT 'sauron',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_tasks_assigned ON sauron.tasks (assigned_to, status);
CREATE INDEX idx_tasks_business ON sauron.tasks (business_id);
CREATE INDEX idx_tasks_due ON sauron.tasks (due_date) WHERE status != 'done';

-- 4. SOPS — Living standard operating procedures
CREATE TABLE sauron.sops (
    id              TEXT PRIMARY KEY,
    business_id     TEXT REFERENCES sauron.businesses(id),
    title           TEXT NOT NULL,
    category        TEXT,               -- 'lead_management', 'scheduling', 'invoicing', etc.
    content         TEXT NOT NULL,       -- Markdown SOP content
    version         INTEGER DEFAULT 1,
    last_used       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 5. CONTACTS — People across both businesses
CREATE TABLE sauron.contacts (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id     TEXT REFERENCES sauron.businesses(id),
    role            TEXT NOT NULL,       -- 'owner', 'employee', 'contractor', 'lead', 'customer'
    name            TEXT NOT NULL,
    phone           TEXT,
    email           TEXT,
    notes           TEXT,
    active          BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Seed team members
INSERT INTO sauron.contacts (business_id, role, name, notes) VALUES
('dominion', 'owner', 'Dez', 'CEO across both businesses'),
('dominion', 'employee', 'Logan', 'Dominion operations'),
('wrenchready', 'contractor', 'Simon', 'WrenchReady mobile mechanic');

-- 6. LEAD_FOLLOW_UPS — Callback tracking for Dominion
CREATE TABLE sauron.lead_follow_ups (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source          TEXT,               -- 'tax_scout', 'google_ads', 'direct_mail', 'referral'
    source_id       TEXT,               -- pid_num, ad_lead_id, etc.
    owner_name      TEXT,
    property_address TEXT,
    phone           TEXT,
    email           TEXT,
    status          TEXT DEFAULT 'new', -- new, contacted, callback_scheduled, qualified, offer_made, dead
    last_contact    TIMESTAMPTZ,
    next_callback   TIMESTAMPTZ,
    callback_count  INTEGER DEFAULT 0,
    notes           TEXT,
    assigned_to     TEXT DEFAULT 'dez',
    lead_score      INTEGER,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_followups_callback ON sauron.lead_follow_ups (next_callback) 
    WHERE status NOT IN ('dead', 'offer_made');
CREATE INDEX idx_followups_stale ON sauron.lead_follow_ups (last_contact) 
    WHERE status IN ('new', 'contacted', 'callback_scheduled');

-- 7. View: WHO NEEDS A CALLBACK TODAY
CREATE OR REPLACE VIEW sauron.callbacks_due AS
SELECT 
    lf.*,
    CASE 
        WHEN next_callback < NOW() - INTERVAL '48 hours' THEN 'overdue_critical'
        WHEN next_callback < NOW() - INTERVAL '24 hours' THEN 'overdue'
        WHEN next_callback < NOW() THEN 'due_now'
        WHEN next_callback < NOW() + INTERVAL '24 hours' THEN 'due_today'
        ELSE 'upcoming'
    END AS urgency,
    NOW() - last_contact AS time_since_contact
FROM sauron.lead_follow_ups lf
WHERE lf.status NOT IN ('dead', 'offer_made')
ORDER BY 
    CASE 
        WHEN next_callback IS NULL AND status = 'new' THEN 0
        WHEN next_callback < NOW() THEN 1
        ELSE 2
    END,
    next_callback ASC NULLS FIRST;

-- 8. View: WRENCHREADY DAILY OPS
CREATE OR REPLACE VIEW sauron.wrench_daily AS
SELECT
    t.id,
    t.title,
    t.description,
    t.assigned_to,
    t.priority,
    t.status,
    t.due_date,
    t.context
FROM sauron.tasks t
WHERE t.business_id = 'wrenchready'
AND (t.due_date = CURRENT_DATE OR t.due_date = CURRENT_DATE + 1)
AND t.status != 'done'
ORDER BY 
    CASE t.priority 
        WHEN 'critical' THEN 0 
        WHEN 'high' THEN 1 
        WHEN 'normal' THEN 2 
        ELSE 3 
    END,
    t.due_date;

