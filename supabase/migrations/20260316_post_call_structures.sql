-- ============================================================
-- post_call_structures — structured post-call output
--
-- PURPOSE:
--   Stores the structured output from every published call session:
--   summary_line, promises_made, objection, suggested next action,
--   and deal temperature. Survives beyond the browser tab so seller
--   memory, review, and eval can consume it.
--
-- OWNERSHIP: Dialer domain (like call_sessions, dialer_events).
--   NOT a CRM table. Written by the publish route as a side-effect.
--   Never written by publish-manager.ts.
--
-- BOUNDARY RULES:
--   - One row per session_id (UNIQUE constraint)
--   - Corrections are tracked via correction_status + corrected_at
--   - draft_note_run_id links to dialer_ai_traces for eval
--   - No direct CRM truth updates — just structured dialer-domain data
-- ============================================================

CREATE TABLE IF NOT EXISTS post_call_structures (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID        NOT NULL UNIQUE REFERENCES call_sessions(id) ON DELETE CASCADE,
  calls_log_id          UUID,
  lead_id               UUID        REFERENCES leads(id) ON DELETE SET NULL,

  -- Structured fields (nullable — only populated when the draft or operator provided them)
  summary_line          TEXT,
  promises_made         TEXT,
  objection             TEXT,
  next_task_suggestion  TEXT,
  deal_temperature      VARCHAR(10)
                        CONSTRAINT ck_pcs_temperature
                        CHECK (deal_temperature IS NULL OR deal_temperature IN ('hot','warm','cool','cold','dead')),

  -- AI provenance
  draft_note_run_id     TEXT,
  draft_was_flagged     BOOLEAN     NOT NULL DEFAULT false,

  -- Correction tracking
  correction_status     VARCHAR(20) NOT NULL DEFAULT 'published'
                        CONSTRAINT ck_pcs_correction_status
                        CHECK (correction_status IN ('published', 'corrected')),
  corrected_at          TIMESTAMPTZ,
  corrected_by          UUID,

  -- Audit
  published_by          UUID        NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookups for seller-memory reads (most recent structure per lead)
CREATE INDEX IF NOT EXISTS idx_pcs_lead_id
  ON post_call_structures(lead_id, created_at DESC)
  WHERE lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pcs_session_id
  ON post_call_structures(session_id);

-- RLS
ALTER TABLE post_call_structures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access on post_call_structures"
  ON post_call_structures FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
