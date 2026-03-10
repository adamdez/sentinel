-- Canonical qualification scale contract fix
-- Standardize motivation_level and condition_level to 1-5 for API + DB parity.

UPDATE leads
SET motivation_level = LEAST(5, GREATEST(1, motivation_level))
WHERE motivation_level IS NOT NULL;

UPDATE leads
SET condition_level = LEAST(5, GREATEST(1, condition_level))
WHERE condition_level IS NOT NULL;

ALTER TABLE leads
  DROP CONSTRAINT IF EXISTS chk_leads_motivation_level_range,
  DROP CONSTRAINT IF EXISTS leads_motivation_level_check,
  DROP CONSTRAINT IF EXISTS chk_leads_condition_level_range,
  DROP CONSTRAINT IF EXISTS leads_condition_level_check;

ALTER TABLE leads
  ADD CONSTRAINT chk_leads_motivation_level_range
    CHECK (motivation_level IS NULL OR motivation_level BETWEEN 1 AND 5),
  ADD CONSTRAINT chk_leads_condition_level_range
    CHECK (condition_level IS NULL OR condition_level BETWEEN 1 AND 5);

COMMENT ON COLUMN leads.motivation_level IS '1-5: seller motivation to sell';
COMMENT ON COLUMN leads.condition_level IS '1-5: property condition for acquisition readiness';
