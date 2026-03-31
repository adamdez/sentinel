-- ─────────────────────────────────────────────────────────────────────────────
-- Fact Assertions
--
-- Discrete, reviewable claim rows derived from dossier_artifacts.
-- Each row is one factual claim about a lead extracted from one artifact.
--
-- Every fact MUST reference an artifact (artifact_id NOT NULL) so source
-- provenance is always traceable. The artifact in turn references a lead,
-- so lead_id here is a denormalized fast-path for queries.
--
-- Lifecycle:
--   pending  → operator has not reviewed this fact yet
--   accepted → operator confirmed this fact is credible
--   rejected → operator dismissed this fact (bad source, wrong lead, stale)
--
-- promoted_field: optional hint that this fact should surface in a dossier
--   field (e.g. "situation_summary", "likely_decision_maker"). This is a
--   proposal only — facts never write directly to leads or dossiers.
--   Durable writes still go through the existing review/promote path.
--
-- Rollback:
--   DROP TABLE IF EXISTS fact_assertions;
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fact_assertions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Every fact must point back to a source artifact.
  artifact_id     UUID NOT NULL REFERENCES dossier_artifacts(id) ON DELETE CASCADE,

  -- Denormalized for fast lead-level queries (mirrors artifact.lead_id).
  lead_id         UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,

  -- Categorical fact type for grouping and filtering.
  -- ownership | deceased | heir | probate_status | financial |
  -- property_condition | timeline | contact_info | other
  fact_type       TEXT NOT NULL DEFAULT 'other',

  -- Short claim string, e.g. "Filed for probate 2024-11-12"
  -- or "Property appears vacant based on assessor photo"
  fact_value      TEXT NOT NULL,

  -- Operator confidence in the fact's accuracy.
  -- unverified (default) | low | medium | high
  confidence      TEXT NOT NULL DEFAULT 'unverified',

  -- Review status lifecycle.
  review_status   TEXT NOT NULL DEFAULT 'pending',

  -- Optional hint: which dossier field this fact should inform.
  -- e.g. "situation_summary", "likely_decision_maker", "recommended_call_angle"
  -- Null = no specific field mapping, still visible in fact list.
  -- This is a PROPOSAL only — never an automatic write.
  promoted_field  TEXT,

  -- Who reviewed it and when
  reviewed_by     UUID,   -- soft ref to auth.users(id)
  reviewed_at     TIMESTAMPTZ,

  -- Who asserted the fact (operator who extracted it)
  asserted_by     UUID,   -- soft ref to auth.users(id)

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Constraints ───────────────────────────────────────────────────────────────

ALTER TABLE fact_assertions
  ADD CONSTRAINT fact_assertions_fact_type_check
  CHECK (fact_type IN (
    'ownership', 'deceased', 'heir', 'probate_status',
    'financial', 'property_condition', 'timeline', 'contact_info', 'other'
  ));

ALTER TABLE fact_assertions
  ADD CONSTRAINT fact_assertions_confidence_check
  CHECK (confidence IN ('unverified', 'low', 'medium', 'high'));

ALTER TABLE fact_assertions
  ADD CONSTRAINT fact_assertions_review_status_check
  CHECK (review_status IN ('pending', 'accepted', 'rejected'));

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Fast lead-level listing (primary query pattern in FactAssertionsPanel)
CREATE INDEX IF NOT EXISTS idx_fact_assertions_lead
  ON fact_assertions (lead_id, created_at DESC);

-- Fast artifact-level listing (for provenance traces)
CREATE INDEX IF NOT EXISTS idx_fact_assertions_artifact
  ON fact_assertions (artifact_id);

-- Review queue: pending facts across all leads (for future ops review surface)
CREATE INDEX IF NOT EXISTS idx_fact_assertions_pending
  ON fact_assertions (review_status, created_at DESC)
  WHERE review_status = 'pending';

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE fact_assertions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fact_assertions_auth_all" ON fact_assertions;
CREATE POLICY "fact_assertions_auth_all" ON fact_assertions
  FOR ALL
  TO authenticated
  USING  (TRUE)
  WITH CHECK (TRUE);
