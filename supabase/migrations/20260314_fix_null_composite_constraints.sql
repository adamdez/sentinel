-- ══════════════════════════════════════════════════════════════════════
-- Fix NULL composite key constraints on ads_search_terms and ads_daily_metrics
-- Date: 2026-03-14
--
-- Problem: PostgreSQL standard UNIQUE treats NULL != NULL, so rows with
-- (search_term, campaign_id, NULL) are all considered distinct — duplicate
-- rows accumulate instead of being upserted.
--
-- Fix: Drop the existing unique constraints and re-create them using
-- UNIQUE NULLS NOT DISTINCT (PostgreSQL 15+), so NULLs are treated as equal
-- in uniqueness checks, ensuring correct upsert behavior.
-- ══════════════════════════════════════════════════════════════════════


-- ── ads_search_terms ─────────────────────────────────────────────────
-- Drop the auto-generated constraint name (PostgreSQL convention:
-- tablename_col1_col2_col3_key). Also try the likely index name.

ALTER TABLE ads_search_terms
  DROP CONSTRAINT IF EXISTS ads_search_terms_search_term_campaign_id_ad_group_id_key;

DROP INDEX IF EXISTS ads_search_terms_search_term_campaign_id_ad_group_id_key;
DROP INDEX IF EXISTS ads_search_terms_dedup_idx;

ALTER TABLE ads_search_terms
  ADD CONSTRAINT ads_search_terms_dedup
  UNIQUE NULLS NOT DISTINCT (search_term, campaign_id, ad_group_id);


-- ── ads_daily_metrics ─────────────────────────────────────────────────
-- PostgreSQL auto-generates long constraint names; try both the full
-- auto-generated name and common truncated variants.

ALTER TABLE ads_daily_metrics
  DROP CONSTRAINT IF EXISTS ads_daily_metrics_report_date_campaign_id_ad_group_id_keyword__key;

ALTER TABLE ads_daily_metrics
  DROP CONSTRAINT IF EXISTS ads_daily_metrics_report_date_campaign_id_ad_group_id_keyword_id_key;

DROP INDEX IF EXISTS ads_daily_metrics_report_date_campaign_id_ad_group_id_keyword__key;
DROP INDEX IF EXISTS ads_daily_metrics_report_date_campaign_id_ad_group_id_keyword_id_key;
DROP INDEX IF EXISTS ads_daily_metrics_dedup_idx;

ALTER TABLE ads_daily_metrics
  ADD CONSTRAINT ads_daily_metrics_dedup
  UNIQUE NULLS NOT DISTINCT (report_date, campaign_id, ad_group_id, keyword_id);


-- ══════════════════════════════════════════════════════════════════════
-- Done. Both tables now use NULLS NOT DISTINCT constraints so rows with
-- NULL ad_group_id or keyword_id will correctly conflict on upsert
-- instead of accumulating as duplicates.
-- ══════════════════════════════════════════════════════════════════════
