ALTER TABLE public.recorded_documents
  ADD COLUMN IF NOT EXISTS fingerprint text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_recorded_doc_fingerprint
  ON public.recorded_documents (fingerprint)
  WHERE fingerprint IS NOT NULL;;
