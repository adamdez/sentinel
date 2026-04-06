-- Add fingerprint column to recorded_documents for deduplication on upsert.
-- The legal-search route generates a SHA-256 fingerprint per document
-- (based on leadId + instrumentNumber or caseNumber or type+date+grantor)
-- and upserts on this column to prevent duplicates across repeated scans.

ALTER TABLE public.recorded_documents
  ADD COLUMN IF NOT EXISTS fingerprint text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_recorded_doc_fingerprint
  ON public.recorded_documents (fingerprint)
  WHERE fingerprint IS NOT NULL;
