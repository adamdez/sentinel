-- Dominion v1 qualification fields for lead-level operator capture

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS motivation_level SMALLINT,
  ADD COLUMN IF NOT EXISTS seller_timeline VARCHAR(20),
  ADD COLUMN IF NOT EXISTS condition_level SMALLINT,
  ADD COLUMN IF NOT EXISTS decision_maker_confirmed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS price_expectation INTEGER,
  ADD COLUMN IF NOT EXISTS qualification_route VARCHAR(20);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_leads_motivation_level_range'
  ) THEN
    ALTER TABLE leads
      ADD CONSTRAINT chk_leads_motivation_level_range
      CHECK (motivation_level IS NULL OR motivation_level BETWEEN 1 AND 5);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_leads_condition_level_range'
  ) THEN
    ALTER TABLE leads
      ADD CONSTRAINT chk_leads_condition_level_range
      CHECK (condition_level IS NULL OR condition_level BETWEEN 1 AND 5);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_leads_seller_timeline'
  ) THEN
    ALTER TABLE leads
      ADD CONSTRAINT chk_leads_seller_timeline
      CHECK (
        seller_timeline IS NULL
        OR seller_timeline IN ('immediate', '30_days', '60_days', 'flexible', 'unknown')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_leads_qualification_route'
  ) THEN
    ALTER TABLE leads
      ADD CONSTRAINT chk_leads_qualification_route
      CHECK (
        qualification_route IS NULL
        OR qualification_route IN ('offer_ready', 'follow_up', 'nurture', 'dead', 'escalate')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leads_qualification_route_not_null
  ON leads (qualification_route)
  WHERE qualification_route IS NOT NULL;
