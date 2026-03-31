-- P1-7: Add market field to leads for Spokane vs Kootenai distinction
-- Backfills from properties.county, creates index for market-filtered queries

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS market TEXT;

COMMENT ON COLUMN leads.market IS
  'Market identifier: spokane or kootenai. Backfilled from properties.county, maintained on new lead creation.';

-- Backfill from properties table
UPDATE leads l
SET market = CASE
  WHEN p.county ILIKE '%Spokane%' THEN 'spokane'
  WHEN p.county ILIKE '%Kootenai%' THEN 'kootenai'
  ELSE NULL
END
FROM properties p
WHERE l.property_id = p.id
  AND l.market IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_market ON leads(market);
