-- ─────────────────────────────────────────────────────────────────────────────
-- Dossier Foundation
--
-- Adds a bounded `dossiers` table to store and gate AI-generated lead
-- intelligence. Proposed dossiers are never shown to operators; only
-- dossiers with status = 'reviewed' surface in Lead Detail.
--
-- Also adds leads.decision_maker_note — the only durable lead field that the
-- explicit promote path writes to.
--
-- Rollback:
--   DROP TABLE IF EXISTS dossiers;
--   ALTER TABLE leads DROP COLUMN IF EXISTS decision_maker_note;
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. dossiers ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dossiers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which lead and property this dossier belongs to
  lead_id               UUID NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
  property_id           UUID REFERENCES properties (id) ON DELETE SET NULL,

  -- Review lifecycle: proposed → reviewed | flagged → promoted
  -- proposed   = AI output saved, not yet reviewed by operator
  -- reviewed   = operator confirmed it is usable intelligence
  -- flagged    = operator flagged as inaccurate or unusable
  -- promoted   = reviewed fields have been written to the lead record
  status                TEXT NOT NULL DEFAULT 'proposed'
                          CHECK (status IN ('proposed', 'reviewed', 'flagged', 'promoted')),

  -- Structured operator-facing fields (mapped from aiDossier at write time)
  situation_summary     TEXT,          -- short 1-2 sentence summary
  likely_decision_maker TEXT,          -- name/role of person to call
  top_facts             JSONB,         -- [{fact: string, source: string}]
  recommended_call_angle TEXT,         -- maps from aiDossier.suggestedApproach
  verification_checklist JSONB,        -- [{item: string, verified: boolean}]
  source_links          JSONB,         -- [{label: string, url: string}]

  -- Traceability — full AI output preserved, never shown in operator UI
  raw_ai_output         JSONB,         -- complete aiDossier blob
  ai_run_id             TEXT,          -- crawl run timestamp or dialer trace run_id

  -- Review metadata
  reviewed_by           UUID,          -- auth.users(id) — soft ref
  reviewed_at           TIMESTAMPTZ,
  review_notes          TEXT,

  -- Audit
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_dossiers_lead_status
  ON dossiers (lead_id, status);

CREATE INDEX IF NOT EXISTS idx_dossiers_lead_created
  ON dossiers (lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dossiers_status
  ON dossiers (status)
  WHERE status IN ('proposed', 'reviewed');

-- RLS
ALTER TABLE dossiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dossiers_auth_all" ON dossiers;
CREATE POLICY "dossiers_auth_all" ON dossiers
  FOR ALL
  TO authenticated
  USING  (TRUE)
  WITH CHECK (TRUE);

-- ── 2. leads.decision_maker_note ─────────────────────────────────────────────
-- Written ONLY through the explicit promote path (POST /api/dossiers/[id]/promote).
-- Never written by AI pipelines directly.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS decision_maker_note TEXT;
