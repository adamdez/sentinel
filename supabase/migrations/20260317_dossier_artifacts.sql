-- ─────────────────────────────────────────────────────────────────────────────
-- Dossier Artifacts
--
-- Stores individual pieces of operator-captured public-source evidence
-- linked to a lead's dossier workflow.
--
-- Each row is one artifact: a URL, its type, extracted notes/facts, and
-- optional provenance metadata (screenshot filename, capture date, etc.).
-- Artifacts are operator-created and review-gated — they feed into a
-- proposed dossier via the compile endpoint, not directly into leads.
--
-- Rollback:
--   DROP TABLE IF EXISTS dossier_artifacts;
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dossier_artifacts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  lead_id        UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  property_id    UUID REFERENCES properties(id) ON DELETE SET NULL,

  -- Optional link to the dossier this artifact was compiled into.
  -- NULL until an artifact is included in a compile run.
  dossier_id     UUID REFERENCES dossiers(id) ON DELETE SET NULL,

  -- Source provenance
  source_url     TEXT,                          -- URL of the public record
  source_type    TEXT NOT NULL DEFAULT 'other', -- probate_filing | obituary | assessor | court_record | news | other
  source_label   TEXT,                          -- human-readable label, e.g. "Spokane County Probate Docket"
  captured_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Extracted content
  extracted_notes TEXT,                         -- operator's manual extraction / key facts from the source
  raw_excerpt     TEXT,                         -- optional copy-paste of relevant source text (not shown in UI)

  -- Optional screenshot / file provenance (for future storage)
  screenshot_key  TEXT,                         -- storage object key if a screenshot was saved (future)
  screenshot_url  TEXT,                         -- public URL of screenshot if available (future)

  -- Who captured it
  captured_by     UUID,                         -- auth.users(id) soft ref

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_dossier_artifacts_lead
  ON dossier_artifacts (lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dossier_artifacts_dossier
  ON dossier_artifacts (dossier_id)
  WHERE dossier_id IS NOT NULL;

-- RLS
ALTER TABLE dossier_artifacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dossier_artifacts_auth_all" ON dossier_artifacts;
CREATE POLICY "dossier_artifacts_auth_all" ON dossier_artifacts
  FOR ALL
  TO authenticated
  USING  (TRUE)
  WITH CHECK (TRUE);
