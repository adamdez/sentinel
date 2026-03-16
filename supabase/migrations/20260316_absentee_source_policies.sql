-- Absentee-Landlord Source Policy Seeds
--
-- Adds four new artifact source types for the absentee-landlord dossier workflow.
-- The source_policies table already exists (20260318_source_policies.sql).
-- This migration only inserts new rows — safe to run multiple times (ON CONFLICT DO NOTHING).
--
-- New types:
--   rental_listing           → review_required (Zillow/Craigslist listing, useful but public)
--   mailing_address_mismatch → approved        (assessor-confirmed mailing ≠ property, high signal)
--   property_management_record → review_required (PM company records, useful provenance)
--   tax_delinquency          → approved        (public record, clear burden signal)
--
-- Rollback:
--   DELETE FROM source_policies WHERE source_type IN (
--     'rental_listing', 'mailing_address_mismatch',
--     'property_management_record', 'tax_delinquency'
--   );

INSERT INTO source_policies (source_type, policy, rationale)
VALUES
  (
    'rental_listing',
    'review_required',
    'Public rental listing (Zillow, Craigslist, etc.). Confirms tenant-occupied status and owner intent, but content may be stale or inaccurate. Review before treating as confirmed.'
  ),
  (
    'mailing_address_mismatch',
    'approved',
    'Assessor-confirmed mailing address differs from property address. High-signal absentee indicator. Approved because it is a direct public-record match.'
  ),
  (
    'property_management_record',
    'review_required',
    'Property management company record or listing. Confirms active management relationship and property/tenant context. Review source provenance before treating as confirmed.'
  ),
  (
    'tax_delinquency',
    'approved',
    'County tax delinquency record. Clear financial burden signal. Approved because it is a direct public-record finding.'
  )
ON CONFLICT (source_type) DO NOTHING;
