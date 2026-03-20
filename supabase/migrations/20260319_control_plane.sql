-- PR-4: Control Plane — agent_runs, review_queue, feature_flags
-- Blueprint Section 4.1: "Control plane / runtime: Owns run IDs, prompt versions,
-- tool logs, eval datasets, approvals, rollout flags, event flows, feature flags."
-- Blueprint Section 4.4: "Agents write proposals to review queues or draft tables."

-- ─── agent_runs ─────────────────────────────────────────────────────
-- Every AI agent invocation gets a row. Traces inputs, outputs, cost, duration.
-- Blueprint: "No durable CRM writeback from untraced runs."

CREATE TABLE IF NOT EXISTS agent_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name      text NOT NULL,              -- e.g. 'exception', 'research', 'follow_up', 'qa', 'dispo', 'ads_monitor'
  trigger_type    text NOT NULL DEFAULT 'manual', -- 'cron', 'manual', 'event', 'webhook'
  trigger_ref     text,                       -- cron job name, event_log ID, or webhook source
  status          text NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed', 'cancelled'
  lead_id         uuid REFERENCES leads(id) ON DELETE SET NULL,
  inputs          jsonb NOT NULL DEFAULT '{}',
  outputs         jsonb NOT NULL DEFAULT '{}',
  error           text,
  prompt_version  text,                       -- FK conceptual to prompt_registry.workflow+version
  model           text,                       -- e.g. 'claude-opus-4-6'
  input_tokens    integer,
  output_tokens   integer,
  cost_cents      integer,                    -- total cost in cents
  duration_ms     integer,
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_runs_agent_name ON agent_runs (agent_name, started_at DESC);
CREATE INDEX idx_agent_runs_status ON agent_runs (status) WHERE status = 'running';
CREATE INDEX idx_agent_runs_lead ON agent_runs (lead_id) WHERE lead_id IS NOT NULL;

-- RLS: authenticated users can read all runs, only service role inserts
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_runs_read" ON agent_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "agent_runs_service_write" ON agent_runs FOR ALL TO service_role USING (true);

-- ─── review_queue ───────────────────────────────────────────────────
-- Proposals from agents awaiting operator approval.
-- Blueprint Section 4.4: "Operator-approved proposals are promoted to durable CRM state."

CREATE TABLE IF NOT EXISTS review_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  agent_name      text NOT NULL,
  entity_type     text NOT NULL,              -- 'lead', 'property', 'dossier', 'task', 'fact'
  entity_id       uuid,                       -- the lead/property/etc this proposal targets
  action          text NOT NULL,              -- 'update_field', 'create_record', 'promote_fact', 'stage_transition'
  proposal        jsonb NOT NULL DEFAULT '{}', -- the proposed changes
  rationale       text,                       -- agent's explanation for the proposal
  status          text NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'expired'
  priority        smallint NOT NULL DEFAULT 5, -- 0-10, higher = more urgent
  reviewed_by     uuid,                       -- user who approved/rejected
  reviewed_at     timestamptz,
  review_notes    text,                       -- operator's note on approval/rejection
  expires_at      timestamptz,                -- auto-expire stale proposals
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_review_queue_status ON review_queue (status, priority DESC) WHERE status = 'pending';
CREATE INDEX idx_review_queue_entity ON review_queue (entity_type, entity_id) WHERE status = 'pending';
CREATE INDEX idx_review_queue_agent ON review_queue (agent_name, created_at DESC);

ALTER TABLE review_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "review_queue_read" ON review_queue FOR SELECT TO authenticated USING (true);
CREATE POLICY "review_queue_service_write" ON review_queue FOR ALL TO service_role USING (true);
-- Operators can update status (approve/reject) on pending items
CREATE POLICY "review_queue_operator_update" ON review_queue FOR UPDATE TO authenticated
  USING (status = 'pending')
  WITH CHECK (status IN ('approved', 'rejected'));

-- ─── feature_flags ──────────────────────────────────────────────────
-- Blueprint Section 12.3: Feature flag strategy.
-- Controls AI workflows: shadow mode, review-required, full-auto.

CREATE TABLE IF NOT EXISTS feature_flags (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key        text NOT NULL UNIQUE,       -- e.g. 'agent.exception.enabled', 'agent.research.auto_approve'
  enabled         boolean NOT NULL DEFAULT false,
  mode            text NOT NULL DEFAULT 'off', -- 'off', 'shadow', 'review_required', 'auto'
  description     text,
  metadata        jsonb NOT NULL DEFAULT '{}', -- per-user overrides, rollout percentage, etc.
  updated_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_feature_flags_key ON feature_flags (flag_key);

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feature_flags_read" ON feature_flags FOR SELECT TO authenticated USING (true);
CREATE POLICY "feature_flags_service_write" ON feature_flags FOR ALL TO service_role USING (true);

-- ─── Seed default feature flags ─────────────────────────────────────
INSERT INTO feature_flags (flag_key, enabled, mode, description) VALUES
  ('agent.exception.enabled', true, 'review_required', 'Exception Agent: nightly scan + morning brief'),
  ('agent.research.enabled', false, 'off', 'Research Agent: lead enrichment + dossier drafting'),
  ('agent.follow_up.enabled', false, 'off', 'Follow-Up Agent: personalized follow-up drafts'),
  ('agent.qa.enabled', false, 'off', 'QA Agent: post-call quality analysis'),
  ('agent.dispo.enabled', false, 'off', 'Dispo Agent: buyer-fit ranking + outreach'),
  ('agent.ads_monitor.enabled', false, 'off', 'Ads Monitor Agent: performance alerts + waste detection')
ON CONFLICT (flag_key) DO NOTHING;
