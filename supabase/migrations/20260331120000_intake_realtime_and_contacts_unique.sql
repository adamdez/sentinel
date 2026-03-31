-- 1. Add intake_leads to Supabase Realtime publication
--    so sidebar badge counts update in real-time after claim/reject
ALTER PUBLICATION supabase_realtime ADD TABLE intake_leads;

-- 2. Add unique index on contacts.phone (WHERE NOT NULL)
--    Required for the claim API's upsert on conflict to work correctly.
--    Without this, Postgres silently fails the upsert and no contact is created.
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_phone_unique
  ON contacts (phone)
  WHERE phone IS NOT NULL;
