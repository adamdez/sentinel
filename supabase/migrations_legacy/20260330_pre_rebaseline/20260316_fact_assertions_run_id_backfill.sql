-- ============================================================
-- One-time backfill: fact_assertions.run_id from parent artifacts
--
-- PROBLEM:
--   Facts created before the run_id threading fix have NULL run_id
--   even though their parent dossier_artifact has a run_id.
--
-- FIX:
--   Set fact_assertions.run_id = dossier_artifacts.run_id
--   WHERE the fact currently has no run_id but the artifact does.
--
-- SAFETY:
--   - Only touches rows where run_id IS NULL (never overwrites)
--   - Joins on artifact_id which is NOT NULL and FK-constrained
--   - Idempotent — safe to re-run
-- ============================================================

UPDATE fact_assertions fa
SET    run_id = da.run_id
FROM   dossier_artifacts da
WHERE  fa.artifact_id = da.id
  AND  fa.run_id IS NULL
  AND  da.run_id IS NOT NULL;
