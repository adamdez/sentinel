-- 1. Add intake_leads to Supabase Realtime publication
--    so sidebar badge counts update in real-time after claim/reject
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'intake_leads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.intake_leads;
  END IF;
END $$;

-- 2. Add unique index on contacts.phone (WHERE NOT NULL)
--    Required for the claim API's upsert on conflict to work correctly.
--    Without this, Postgres silently fails the upsert and no contact is created.
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_phone_unique
  ON contacts (phone)
  WHERE phone IS NOT NULL;
