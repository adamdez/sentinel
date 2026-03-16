-- Voice Registry
--
-- Stores versioned script copy and handoff-rule configurations for
-- inbound, routing, callback booking, and warm-transfer voice workflows.
--
-- Two registry_type values:
--   "script"       — copy/phrasing for a specific voice workflow step.
--                    description contains the active script text or talking points.
--   "handoff_rule" — structured thresholds for routing decisions.
--                    rule_config JSONB contains the typed configuration.
--
-- Lifecycle (same as prompt_registry):
--   testing    — in use for testing, not yet the default
--   active     — current production version
--   deprecated — replaced, kept for audit trail
--
-- One active row per workflow per registry_type is the convention
-- (not a DB constraint — enforced at the API layer).
--
-- Rollback:
--   DROP TABLE IF EXISTS voice_registry;

CREATE TABLE IF NOT EXISTS voice_registry (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identifies the workflow this entry belongs to.
  -- Bounded app-enforced vocabulary:
  --   inbound_greeting   — first words when Logan picks up a forwarded inbound call
  --   seller_qualifying  — opening qualification sequence for inbound sellers
  --   callback_booking   — language/flow for booking a callback time
  --   warm_transfer      — context card and handoff language for warm transfers
  --   handoff_rules      — routing decision thresholds (registry_type = "handoff_rule")
  workflow      TEXT        NOT NULL,

  -- "script" | "handoff_rule"
  registry_type TEXT        NOT NULL DEFAULT 'script',

  -- Semver-style version label, e.g. "1.0.0"
  version       TEXT        NOT NULL,

  -- "testing" | "active" | "deprecated"
  status        TEXT        NOT NULL DEFAULT 'testing',

  -- Human-readable description. For scripts: the active copy/talking points.
  -- For handoff_rules: summary of the thresholds.
  description   TEXT,

  -- What changed from the prior version.
  changelog     TEXT,

  -- For handoff_rule entries: structured threshold config (JSONB).
  -- Validated at read time against HandoffRuleConfig in voice-registry.ts.
  -- Example schema (see voice-registry.ts for full type):
  -- {
  --   "transfer_requires_warm_ready": true,
  --   "callback_default_hours_ahead": 24,
  --   "defer_to_logan_if_lead_unknown": true,
  --   "max_callback_window_days": 14,
  --   "auto_create_task_on_seller_answered": true
  -- }
  rule_config   JSONB,

  -- Audit
  registered_by UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique (workflow, version, registry_type) — prevents duplicate registrations
ALTER TABLE voice_registry
  ADD CONSTRAINT voice_registry_workflow_version_type_unique
  UNIQUE (workflow, version, registry_type);

ALTER TABLE voice_registry
  ADD CONSTRAINT voice_registry_status_check
  CHECK (status IN ('testing', 'active', 'deprecated'));

ALTER TABLE voice_registry
  ADD CONSTRAINT voice_registry_type_check
  CHECK (registry_type IN ('script', 'handoff_rule'));

CREATE INDEX IF NOT EXISTS idx_voice_registry_workflow_status
  ON voice_registry (workflow, status);

CREATE INDEX IF NOT EXISTS idx_voice_registry_active
  ON voice_registry (registry_type, status)
  WHERE status = 'active';

-- RLS
ALTER TABLE voice_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_voice_registry"
  ON voice_registry FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_write_voice_registry"
  ON voice_registry FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- ── Trigger for updated_at ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_voice_registry_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER tg_voice_registry_updated_at
  BEFORE UPDATE ON voice_registry
  FOR EACH ROW EXECUTE FUNCTION update_voice_registry_updated_at();

-- ── Seed rows ─────────────────────────────────────────────────────────────────
-- These are the baseline v1.0.0 entries. Adam can update status/description inline.

INSERT INTO voice_registry (workflow, registry_type, version, status, description, changelog)
VALUES
  (
    'inbound_greeting', 'script', '1.0.0', 'active',
    'Opening when Logan picks up a forwarded inbound call: "Hi, this is Logan with Dominion Home Deals — who am I speaking with?" Pause. "Thanks [name], and you''re calling about a property you may want to sell?" Keep it brief, confirm the caller before giving any company context.',
    'Initial version. Confirms caller identity before any pitch.'
  ),
  (
    'seller_qualifying', 'script', '1.0.0', 'active',
    'After confirming caller is a seller: "Tell me a little about the property — where is it located and is it currently occupied?" Then: "What''s prompting you to consider selling now?" Listen, do not fill silence. Use existing qual checklist: address, DM, timeline, condition, occupancy, motivation, next commitment.',
    'Initial version. Open questions first, structured checklist second.'
  ),
  (
    'callback_booking', 'script', '1.0.0', 'active',
    'When seller requests callback: "Absolutely — what day and time works best for you?" Then confirm: "I''ll have Logan call you [day] around [time] at this number. Does that work?" Log the time directly in Sentinel. Never promise a specific callback time without logging it.',
    'Initial version. Confirm before logging. Always verify phone number.'
  ),
  (
    'warm_transfer', 'script', '1.0.0', 'active',
    'Before transferring: "Let me get my partner on the line — he works directly on acquisitions and can answer any questions about how we work." After connecting: brief handoff note (address, seller name, situation) before dropping off. If recipient doesn''t answer, fall back to callback booking.',
    'Initial version. Handoff note required. Fallback always callback, never hang up.'
  )
ON CONFLICT (workflow, version, registry_type) DO NOTHING;

-- Handoff rule config v1.0.0
INSERT INTO voice_registry (workflow, registry_type, version, status, description, changelog, rule_config)
VALUES
  (
    'handoff_rules', 'handoff_rule', '1.0.0', 'active',
    'Baseline handoff thresholds: transfer only when seller explicitly agrees (warm_transfer_ready=true). Default callback window 24h ahead. Always create follow-up task on seller-answered calls. Defer to Logan (no auto-routing) for unmatched leads.',
    'Initial version. Conservative defaults — operator-first, no autonomous routing.',
    '{
      "transfer_requires_warm_ready": true,
      "callback_default_hours_ahead": 24,
      "max_callback_window_days": 14,
      "defer_to_logan_if_lead_unknown": true,
      "auto_create_task_on_seller_answered": true,
      "min_situation_summary_chars": 20,
      "require_subject_address_for_transfer": false
    }'::jsonb
  )
ON CONFLICT (workflow, version, registry_type) DO NOTHING;
