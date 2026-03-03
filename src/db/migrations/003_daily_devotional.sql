-- Daily Devotional table: one row per day with ESV verse + Reformed commentary
CREATE TABLE IF NOT EXISTS daily_devotional (
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

CREATE UNIQUE INDEX IF NOT EXISTS uq_devotional_date ON daily_devotional (display_date);

-- Allow service role full access (API routes use service role)
ALTER TABLE daily_devotional ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON daily_devotional
  FOR ALL
  USING (true)
  WITH CHECK (true);
