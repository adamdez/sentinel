-- ══════════════════════════════════════════════════════════════════════════════
-- RLS Policies: leads table — CLAIM support
-- Run in Supabase SQL Editor (copy-paste the entire file)
-- ══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Anyone can claim unowned leads" ON leads;
DROP POLICY IF EXISTS "Owners can update their own leads" ON leads;

CREATE POLICY "Anyone can claim unowned leads" ON leads
  FOR UPDATE USING (owner_id IS NULL);

CREATE POLICY "Owners can update their own leads" ON leads
  FOR UPDATE USING (owner_id = auth.uid() OR owner_id = 'c0b4d733-607b-4c3c-8049-9e4ba207a258');

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
