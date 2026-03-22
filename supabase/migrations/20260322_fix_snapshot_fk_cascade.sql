-- Fix lead_stage_snapshots FK constraints that default to RESTRICT,
-- blocking lead and property deletion.

ALTER TABLE lead_stage_snapshots
  DROP CONSTRAINT IF EXISTS lead_stage_snapshots_lead_id_fkey;

ALTER TABLE lead_stage_snapshots
  ADD CONSTRAINT lead_stage_snapshots_lead_id_fkey
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

ALTER TABLE lead_stage_snapshots
  DROP CONSTRAINT IF EXISTS lead_stage_snapshots_property_id_fkey;

ALTER TABLE lead_stage_snapshots
  ADD CONSTRAINT lead_stage_snapshots_property_id_fkey
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
