-- ============================================================
-- Dialer Domain: Session Tables
-- PR1 — Schema seam only. No changes to calls_log or leads.
-- PR2 adds: session_notes and session_extracted_facts API routes.
-- PR3 adds: publish-manager writes to calls_log.
--
-- BOUNDARY RULE: These tables are owned exclusively by the dialer
-- domain (src/lib/dialer/). CRM routes must never query them directly.
-- CRM reads call outcomes from calls_log only (the published record).
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. call_sessions — Live call state (dialer domain source of truth)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS call_sessions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- CRM reference (read pointer only — dialer does not own this entity)
  lead_id          UUID        REFERENCES leads(id) ON DELETE SET NULL,

  -- Who initiated the session
  user_id          UUID        NOT NULL,

  -- Telephony
  twilio_sid       VARCHAR(100),
  phone_dialed     VARCHAR(20) NOT NULL,

  -- Status lifecycle — transitions enforced by DB trigger below
  status           VARCHAR(20) NOT NULL DEFAULT 'initiating'
                   CONSTRAINT ck_call_sessions_status
                   CHECK (status IN ('initiating', 'ringing', 'connected', 'ended', 'failed')),

  -- Timing
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at         TIMESTAMPTZ,
  duration_sec     INTEGER,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Context snapshot: read-only copy of CRM state at call start.
  -- Written once on session creation. Never updated after.
  -- Shape: CRMLeadContext (see src/lib/dialer/crm-bridge.ts)
  context_snapshot JSONB,

  -- Post-call outputs (written by PR2/PR3 features)
  ai_summary       TEXT,
  disposition      VARCHAR(50),

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_sessions_user
  ON call_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_call_sessions_lead
  ON call_sessions(lead_id)
  WHERE lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_call_sessions_status
  ON call_sessions(status);

CREATE INDEX IF NOT EXISTS idx_call_sessions_twilio
  ON call_sessions(twilio_sid)
  WHERE twilio_sid IS NOT NULL;

-- Composite index for the most common query: user's recent sessions
CREATE INDEX IF NOT EXISTS idx_call_sessions_user_started
  ON call_sessions(user_id, started_at DESC);


-- ─────────────────────────────────────────────────────────────
-- 2. session_notes — Per-note stream during a call
--    Table created now. API routes ship in PR2.
--    Realtime enabled now so PR2 can use it immediately.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_notes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID        NOT NULL REFERENCES call_sessions(id) ON DELETE CASCADE,

  note_type       VARCHAR(30) NOT NULL
                  CONSTRAINT ck_session_notes_type
                  CHECK (note_type IN ('transcript_chunk', 'ai_suggestion', 'operator_note')),

  speaker         VARCHAR(20)
                  CONSTRAINT ck_session_notes_speaker
                  CHECK (speaker IN ('operator', 'seller', 'ai') OR speaker IS NULL),

  content         TEXT        NOT NULL,
  confidence      NUMERIC(3,2),   -- 0.00–1.00 for transcript chunks; NULL otherwise

  -- Audit trail for AI vs confirmed content.
  -- RULE: is_confirmed must be true before any fact reaches the client file.
  is_ai_generated BOOLEAN     NOT NULL DEFAULT false,
  is_confirmed    BOOLEAN     NOT NULL DEFAULT false,

  sequence_num    INTEGER     NOT NULL,  -- ordering within session
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_notes_session_seq
  ON session_notes(session_id, sequence_num);

-- Fast lookup: unconfirmed AI suggestions for a session (post-call review)
CREATE INDEX IF NOT EXISTS idx_session_notes_pending_review
  ON session_notes(session_id, is_confirmed)
  WHERE is_ai_generated = true AND is_confirmed = false;


-- ─────────────────────────────────────────────────────────────
-- 3. session_extracted_facts — Structured AI-extracted facts
--    Table created now. Used by PR3 publish flow.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_extracted_facts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       UUID        NOT NULL REFERENCES call_sessions(id) ON DELETE CASCADE,

  fact_type        VARCHAR(50) NOT NULL
                   CONSTRAINT ck_session_facts_type
                   CHECK (fact_type IN (
                     'motivation_signal',
                     'price_mention',
                     'timeline_mention',
                     'condition_note',
                     'objection',
                     'follow_up_intent',
                     'red_flag'
                   )),

  raw_text         TEXT        NOT NULL,  -- verbatim from transcript
  structured_value JSONB,                 -- parsed structured form (e.g. {months: 2})

  -- Audit trail — same gate as session_notes.
  -- RULE: is_confirmed must be true before this fact reaches the client file.
  is_ai_generated  BOOLEAN     NOT NULL DEFAULT true,
  is_confirmed     BOOLEAN     NOT NULL DEFAULT false,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_facts_session
  ON session_extracted_facts(session_id);

CREATE INDEX IF NOT EXISTS idx_session_facts_confirmed
  ON session_extracted_facts(session_id, is_confirmed);


-- ─────────────────────────────────────────────────────────────
-- 4. dialer_events — Dialer-owned audit trail
--    RULE: Dialer code must NEVER write to the CRM's event_log table.
--    All dialer audit events go here instead.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dialer_events (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID        REFERENCES call_sessions(id) ON DELETE SET NULL,
  user_id    UUID        NOT NULL,
  event_type VARCHAR(60) NOT NULL,
  payload    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dialer_events_session
  ON dialer_events(session_id)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dialer_events_user_created
  ON dialer_events(user_id, created_at DESC);


-- ─────────────────────────────────────────────────────────────
-- 5. updated_at auto-update trigger for call_sessions
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION dialer_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_call_sessions_updated_at ON call_sessions;
CREATE TRIGGER tg_call_sessions_updated_at
  BEFORE UPDATE ON call_sessions
  FOR EACH ROW
  EXECUTE FUNCTION dialer_set_updated_at();


-- ─────────────────────────────────────────────────────────────
-- 6. Status transition guard trigger for call_sessions
--    Enforces valid transitions at DB level (belt-and-suspenders
--    alongside the application-layer check in session-manager.ts).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_call_session_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Only evaluate when status is actually changing
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Terminal states: no outbound transitions allowed
  IF OLD.status IN ('ended', 'failed') THEN
    RAISE EXCEPTION
      'call_sessions: cannot transition from terminal status "%"',
      OLD.status
      USING ERRCODE = '23514'; -- check_violation
  END IF;

  -- Valid transition table
  IF NOT (
    (OLD.status = 'initiating' AND NEW.status IN ('ringing', 'connected', 'failed')) OR
    (OLD.status = 'ringing'    AND NEW.status IN ('connected', 'ended', 'failed')) OR
    (OLD.status = 'connected'  AND NEW.status IN ('ended', 'failed'))
  ) THEN
    RAISE EXCEPTION
      'call_sessions: invalid status transition "%" → "%"',
      OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_call_session_transition ON call_sessions;
CREATE TRIGGER tg_call_session_transition
  BEFORE UPDATE OF status ON call_sessions
  FOR EACH ROW
  EXECUTE FUNCTION enforce_call_session_transition();


-- ─────────────────────────────────────────────────────────────
-- 7. RLS — Standard authenticated full access (matches calls_log pattern)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE call_sessions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_notes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_extracted_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE dialer_events           ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access on call_sessions"
  ON call_sessions FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated full access on session_notes"
  ON session_notes FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated full access on session_extracted_facts"
  ON session_extracted_facts FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated full access on dialer_events"
  ON dialer_events FOR ALL TO authenticated
  USING (true) WITH CHECK (true);


-- ─────────────────────────────────────────────────────────────
-- 8. Realtime — Enable for live call features (PR2 depends on this)
-- ─────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE call_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE session_notes;
-- session_extracted_facts and dialer_events are not realtime (batch/audit use)
