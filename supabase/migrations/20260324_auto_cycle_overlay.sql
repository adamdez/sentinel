-- Auto Cycle overlay state
-- Dialer-owned working queue for lead-first multi-number calling.

CREATE OR REPLACE FUNCTION dialer_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS dialer_auto_cycle_leads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL,
  cycle_status  VARCHAR(20) NOT NULL DEFAULT 'ready',
  current_round INTEGER NOT NULL DEFAULT 1,
  next_due_at   TIMESTAMPTZ,
  next_phone_id UUID REFERENCES lead_phones(id) ON DELETE SET NULL,
  last_outcome  VARCHAR(50),
  exit_reason   VARCHAR(50),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_dialer_auto_cycle_lead UNIQUE (lead_id),
  CONSTRAINT ck_dialer_auto_cycle_status
    CHECK (cycle_status IN ('ready', 'waiting', 'paused', 'exited'))
);

CREATE INDEX IF NOT EXISTS idx_dialer_auto_cycle_leads_user_status
  ON dialer_auto_cycle_leads(user_id, cycle_status, next_due_at);

CREATE INDEX IF NOT EXISTS idx_dialer_auto_cycle_leads_lead
  ON dialer_auto_cycle_leads(lead_id);

CREATE TABLE IF NOT EXISTS dialer_auto_cycle_phones (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_lead_id       UUID NOT NULL REFERENCES dialer_auto_cycle_leads(id) ON DELETE CASCADE,
  lead_id             UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL,
  phone_id            UUID REFERENCES lead_phones(id) ON DELETE CASCADE,
  phone               VARCHAR(32) NOT NULL,
  phone_position      INTEGER NOT NULL DEFAULT 0,
  attempt_count       INTEGER NOT NULL DEFAULT 0,
  next_attempt_number INTEGER,
  next_due_at         TIMESTAMPTZ,
  last_attempt_at     TIMESTAMPTZ,
  last_outcome        VARCHAR(50),
  voicemail_drop_next BOOLEAN NOT NULL DEFAULT false,
  phone_status        VARCHAR(20) NOT NULL DEFAULT 'active',
  exit_reason         VARCHAR(50),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_dialer_auto_cycle_phone UNIQUE (cycle_lead_id, phone_id),
  CONSTRAINT ck_dialer_auto_cycle_phone_status
    CHECK (phone_status IN ('active', 'dead', 'dnc', 'completed', 'exited')),
  CONSTRAINT ck_dialer_auto_cycle_attempt_count
    CHECK (attempt_count >= 0 AND attempt_count <= 5),
  CONSTRAINT ck_dialer_auto_cycle_next_attempt
    CHECK (next_attempt_number IS NULL OR (next_attempt_number >= 1 AND next_attempt_number <= 5))
);

CREATE INDEX IF NOT EXISTS idx_dialer_auto_cycle_phones_cycle
  ON dialer_auto_cycle_phones(cycle_lead_id, phone_status, next_due_at, phone_position);

CREATE INDEX IF NOT EXISTS idx_dialer_auto_cycle_phones_lead
  ON dialer_auto_cycle_phones(lead_id, phone_status, next_due_at);

DROP TRIGGER IF EXISTS tg_dialer_auto_cycle_leads_updated_at ON dialer_auto_cycle_leads;
CREATE TRIGGER tg_dialer_auto_cycle_leads_updated_at
  BEFORE UPDATE ON dialer_auto_cycle_leads
  FOR EACH ROW
  EXECUTE FUNCTION dialer_set_updated_at();

DROP TRIGGER IF EXISTS tg_dialer_auto_cycle_phones_updated_at ON dialer_auto_cycle_phones;
CREATE TRIGGER tg_dialer_auto_cycle_phones_updated_at
  BEFORE UPDATE ON dialer_auto_cycle_phones
  FOR EACH ROW
  EXECUTE FUNCTION dialer_set_updated_at();

ALTER TABLE dialer_auto_cycle_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE dialer_auto_cycle_phones ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'dialer_auto_cycle_leads'
      AND policyname = 'Authenticated full access on dialer_auto_cycle_leads'
  ) THEN
    CREATE POLICY "Authenticated full access on dialer_auto_cycle_leads"
      ON dialer_auto_cycle_leads FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'dialer_auto_cycle_phones'
      AND policyname = 'Authenticated full access on dialer_auto_cycle_phones'
  ) THEN
    CREATE POLICY "Authenticated full access on dialer_auto_cycle_phones"
      ON dialer_auto_cycle_phones FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;
