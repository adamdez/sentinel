-- Compliance Layer Tables
-- Charter v2.3 §VIII: "DNC scrub, Litigant suppression, Opt-out enforcement.
-- No exceptions. All compliance actions logged."
--
-- Run in Supabase Dashboard → SQL Editor

-- ── DNC Registry ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dnc_list (
  phone    TEXT PRIMARY KEY,
  source   TEXT DEFAULT 'manual',
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE dnc_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dnc_select_authenticated" ON dnc_list
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "dnc_insert_authenticated" ON dnc_list
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ── Known Litigants ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS litigants (
  phone    TEXT PRIMARY KEY,
  name     TEXT,
  source   TEXT DEFAULT 'manual',
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE litigants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "litigants_select_authenticated" ON litigants
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "litigants_insert_authenticated" ON litigants
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ── Opt-Out Registry ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS opt_outs (
  phone    TEXT PRIMARY KEY,
  source   TEXT DEFAULT 'manual',
  reason   TEXT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE opt_outs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "opt_outs_select_authenticated" ON opt_outs
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "opt_outs_insert_authenticated" ON opt_outs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ── Indexes for fast lookups ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_dnc_phone ON dnc_list (phone);
CREATE INDEX IF NOT EXISTS idx_litigants_phone ON litigants (phone);
CREATE INDEX IF NOT EXISTS idx_opt_outs_phone ON opt_outs (phone);
