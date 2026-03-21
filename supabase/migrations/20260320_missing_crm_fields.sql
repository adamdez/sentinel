-- ─────────────────────────────────────────────────────────────────────────────
-- Missing CRM Projection Fields
--
-- Adds buyer_fit_score and dossier_url to the leads table.
-- These complement the CRM projection columns from 20260320_crm_projection_fields.sql.
--
-- Rollback:
--   ALTER TABLE leads
--     DROP COLUMN IF EXISTS buyer_fit_score,
--     DROP COLUMN IF EXISTS dossier_url;
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE leads ADD COLUMN IF NOT EXISTS buyer_fit_score SMALLINT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS dossier_url TEXT;

COMMENT ON COLUMN leads.buyer_fit_score IS 'How well this lead matches active buyer criteria (0-100)';
COMMENT ON COLUMN leads.dossier_url IS 'Direct link to the promoted dossier for quick reference';
