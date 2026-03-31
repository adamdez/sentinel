-- ─────────────────────────────────────────────────────────────────────────────
-- Prompt Registry
--
-- One row per (workflow, version) pair — the authoritative record of what
-- each AI prompt does, when it was introduced, and whether it is still active.
--
-- This is a config table, not an audit log and not a deployment system.
-- Versions are registered manually (or via API) and their status is updated
-- when a newer version supersedes them.
--
-- status lifecycle:
--   testing    → used in staging / canary; not yet the primary production version
--   active     → current production version for this workflow
--   deprecated → superseded; traces referencing this version are still valid,
--                but new invocations should not use it
--
-- Rollback:
--   DROP TABLE IF EXISTS prompt_registry;
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS prompt_registry (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Workflow identifier — matches the `workflow` column in dialer_ai_traces
  -- and the workflow label used in route-level constants.
  -- Examples: "summarize", "extract", "dossier_compile" (future), "routing" (future)
  workflow    TEXT NOT NULL,

  -- Semver string — matches the constant in the route file.
  -- e.g. "2.1.0", "1.0.0"
  version     TEXT NOT NULL,

  -- Lifecycle status
  status      TEXT NOT NULL DEFAULT 'active',

  -- Human-readable description of what this prompt does.
  description TEXT,

  -- What changed from the prior version. Plain English, concise.
  changelog   TEXT,

  -- Who registered / last updated this entry
  registered_by UUID,          -- soft ref auth.users(id)
  updated_by    UUID,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One version per workflow is always unique
ALTER TABLE prompt_registry
  ADD CONSTRAINT prompt_registry_workflow_version_unique UNIQUE (workflow, version);

ALTER TABLE prompt_registry
  ADD CONSTRAINT prompt_registry_status_check
  CHECK (status IN ('testing', 'active', 'deprecated'));

CREATE INDEX IF NOT EXISTS idx_prompt_registry_workflow
  ON prompt_registry (workflow, status, created_at DESC);

-- ── Seed known versions ───────────────────────────────────────────────────────
-- These match the constants already deployed in route files.

INSERT INTO prompt_registry (workflow, version, status, description, changelog)
VALUES
  (
    'summarize', '2.1.0', 'active',
    'Grok-based call summarizer. Produces 3-5 bullet points covering objections, motivation, property details, next steps, and deal temperature.',
    'Source hierarchy enforced: operator notes used first, AI summary only as labeled fallback. Prevents recursive AI drift from unreviewed prior context.'
  ),
  (
    'summarize', '2.0.0', 'deprecated',
    'Grok-based call summarizer with prior call context block.',
    'Added prior call context to the user message for repeat-call memory. Did not enforce trust order between operator notes and AI summaries.'
  ),
  (
    'extract', '1.0.0', 'active',
    'Claude-based qualifier. Extracts motivation_level (1–5) and seller_timeline from brief operator call notes. Returns structured JSON only.',
    'Initial version. Best-effort extraction; returns null fields on ambiguous input rather than guessing.'
  )
ON CONFLICT (workflow, version) DO NOTHING;

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Authenticated users can read (for review surface).
-- Writes are gated by the API layer (Adam-only PATCH/POST).

ALTER TABLE prompt_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prompt_registry_read" ON prompt_registry;
CREATE POLICY "prompt_registry_read" ON prompt_registry
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "prompt_registry_write" ON prompt_registry;
CREATE POLICY "prompt_registry_write" ON prompt_registry
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
