-- Recorded Documents: county-sourced legal events (deeds, liens, court filings)
-- Written by /api/leads/[id]/legal-search from county recorder + court crawlers.

CREATE TABLE IF NOT EXISTS recorded_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  lead_id         UUID REFERENCES leads(id) ON DELETE SET NULL,

  document_type   TEXT NOT NULL,
  instrument_number TEXT,
  recording_date  TIMESTAMPTZ,
  document_date   TIMESTAMPTZ,

  grantor         TEXT,
  grantee         TEXT,

  amount          INTEGER,
  lender_name     TEXT,

  status          TEXT NOT NULL DEFAULT 'active',

  case_number     TEXT,
  court_name      TEXT,
  case_type       TEXT,
  attorney_name   TEXT,
  contact_person  TEXT,
  next_hearing_date TIMESTAMPTZ,
  event_description TEXT,

  source          TEXT NOT NULL,
  source_url      TEXT,
  raw_excerpt     TEXT,
  raw_data        JSONB,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recorded_docs_property ON recorded_documents(property_id);
CREATE INDEX IF NOT EXISTS idx_recorded_docs_lead ON recorded_documents(lead_id);
CREATE INDEX IF NOT EXISTS idx_recorded_docs_type ON recorded_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_recorded_docs_recording_date ON recorded_documents(recording_date);

ALTER TABLE recorded_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on recorded_documents"
  ON recorded_documents
  FOR ALL
  USING (true)
  WITH CHECK (true);
