
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS source_list_name text,
  ADD COLUMN IF NOT EXISTS source_vendor text;

-- Backfill from existing JSONB
UPDATE leads l
SET
  source_list_name = p.owner_flags->'prospecting_intake'->>'source_list_name',
  source_vendor     = p.owner_flags->'prospecting_intake'->>'source_vendor'
FROM properties p
WHERE p.id = l.property_id
  AND (
    p.owner_flags->'prospecting_intake'->>'source_list_name' IS NOT NULL
    OR p.owner_flags->'prospecting_intake'->>'source_vendor' IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_leads_source_list_name ON leads (source_list_name);
;
