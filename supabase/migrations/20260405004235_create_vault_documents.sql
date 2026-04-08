
CREATE TABLE IF NOT EXISTS vault_documents (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  path text NOT NULL UNIQUE,
  section text NOT NULL,
  content text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vault_documents_section_idx ON vault_documents(section);

-- Allow service role full access
ALTER TABLE vault_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON vault_documents
  FOR ALL TO service_role USING (true) WITH CHECK (true);
;
