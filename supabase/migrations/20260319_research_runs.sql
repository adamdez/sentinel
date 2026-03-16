-- ─────────────────────────────────────────────────────────────────────────────
-- Research Runs
--
-- Groups dossier evidence-capture sessions into coherent runs.
-- Each run represents one deliberate pass of research for a lead:
-- starting sources, extracting facts, and optionally compiling a dossier.
--
-- Status lifecycle:
--   open     → Adam started a run and is actively capturing evidence
--   compiled → run was closed by a compile action (dossier_id set)
--   closed   → run was manually closed without compiling
--   abandoned → run was abandoned (no artifacts captured)
--
-- Run linkage (additive FKs on existing tables — nullable, no backfill):
--   dossier_artifacts.run_id → research_runs.id
--   fact_assertions.run_id  → research_runs.id
--
-- Rollback:
--   ALTER TABLE dossier_artifacts DROP COLUMN IF EXISTS run_id;
--   ALTER TABLE fact_assertions   DROP COLUMN IF EXISTS run_id;
--   DROP TABLE IF EXISTS research_runs;
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS research_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  lead_id       UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  property_id   UUID REFERENCES properties(id) ON DELETE SET NULL,

  -- Status lifecycle
  status        TEXT NOT NULL DEFAULT 'open',

  -- Who started the run and when
  started_by    UUID,             -- soft ref auth.users(id)
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- When the run was closed / compiled
  closed_at     TIMESTAMPTZ,

  -- Optional operator notes for this research session
  notes         TEXT,

  -- Link to the dossier produced by this run (set on compile)
  dossier_id    UUID REFERENCES dossiers(id) ON DELETE SET NULL,

  -- Source type mix captured in this run (denormalized for quick display)
  -- e.g. ["probate_filing","assessor"] — updated on artifact capture
  source_mix    JSONB,

  -- Counts (denormalized for run history UI — updated on artifact/fact create)
  artifact_count INTEGER NOT NULL DEFAULT 0,
  fact_count     INTEGER NOT NULL DEFAULT 0,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE research_runs
  ADD CONSTRAINT research_runs_status_check
  CHECK (status IN ('open', 'compiled', 'closed', 'abandoned'));

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_research_runs_lead
  ON research_runs (lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_research_runs_open
  ON research_runs (lead_id, status)
  WHERE status = 'open';

-- ── Add run_id FK to dossier_artifacts ───────────────────────────────────────
-- Nullable — existing rows are from the pre-run-tracking era (run_id = NULL).

ALTER TABLE dossier_artifacts
  ADD COLUMN IF NOT EXISTS run_id UUID REFERENCES research_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dossier_artifacts_run
  ON dossier_artifacts (run_id)
  WHERE run_id IS NOT NULL;

-- ── Add run_id FK to fact_assertions ─────────────────────────────────────────

ALTER TABLE fact_assertions
  ADD COLUMN IF NOT EXISTS run_id UUID REFERENCES research_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fact_assertions_run
  ON fact_assertions (run_id)
  WHERE run_id IS NOT NULL;

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE research_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "research_runs_auth_all" ON research_runs;
CREATE POLICY "research_runs_auth_all" ON research_runs
  FOR ALL
  TO authenticated
  USING  (TRUE)
  WITH CHECK (TRUE);
