// Creates the daily_devotional table via Supabase's internal SQL execution
// Run: node scripts/create-devotional-table.mjs

const SUPABASE_URL = "https://imusghlptroddfeycpei.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error("Set SUPABASE_SERVICE_ROLE_KEY env var");
  process.exit(1);
}

const sql = `
CREATE TABLE IF NOT EXISTS public.daily_devotional (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  display_date date NOT NULL UNIQUE,
  verse_ref text NOT NULL,
  verse_text text NOT NULL,
  author text NOT NULL,
  commentary text NOT NULL,
  source_url text NOT NULL,
  source_title text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.daily_devotional ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'daily_devotional' AND policyname = 'allow_all'
  ) THEN
    CREATE POLICY allow_all ON public.daily_devotional FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
`;

// Use the pg_graphql or direct HTTP approach
const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
  method: "POST",
  headers: {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  },
});

// The PostgREST approach doesn't support DDL. Print instructions instead.
console.log("=== Run this SQL in your Supabase SQL Editor ===");
console.log("Dashboard: https://supabase.com/dashboard/project/imusghlptroddfeycpei/sql/new");
console.log("");
console.log(sql);
console.log("================================================");
