-- Relax fact_assertions.fact_type so adapter/provider-specific keys can persist.
--
-- Why:
-- The original dossier schema only allowed a short fixed list of fact_type values
-- (ownership, financial, probate_status, etc.). The newer research pipeline now
-- writes richer keys such as:
--   - provider_bricked_arv_estimate
--   - provider_propertyradar_owner_names
--   - tax_delinquency_amount
--   - primary_phone
-- Those inserts currently fail with:
--   fact_assertions_fact_type_check
--
-- We still keep a lightweight guardrail by requiring lowercase slug-style keys.

ALTER TABLE fact_assertions
  DROP CONSTRAINT IF EXISTS fact_assertions_fact_type_check;

ALTER TABLE fact_assertions
  ADD CONSTRAINT fact_assertions_fact_type_check
  CHECK (fact_type ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$');
