-- Add current_dossier_id to leads for CRM sync projection (Blueprint Section 9.1)
-- This is the pointer from the lead record to the most recently promoted/reviewed dossier.
--
-- Rollback:
--   ALTER TABLE leads DROP COLUMN IF EXISTS current_dossier_id;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS current_dossier_id uuid REFERENCES dossiers(id);

CREATE INDEX IF NOT EXISTS idx_leads_current_dossier_id
  ON leads(current_dossier_id)
  WHERE current_dossier_id IS NOT NULL;

COMMENT ON COLUMN leads.current_dossier_id IS 'FK to the most recently promoted/reviewed dossier — set by syncDossierToLead()';
