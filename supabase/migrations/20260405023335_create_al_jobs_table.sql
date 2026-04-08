
-- Al Boreland async job queue
-- Every delegation, crew run, or heavy task gets a row here
-- Al fires and forgets, Dez can check status anytime

CREATE TABLE IF NOT EXISTS al_jobs (
  id            BIGSERIAL PRIMARY KEY,
  job_type      TEXT NOT NULL,                        -- 'delegate_to_ceo' | 'crew_run' | 'deep_research'
  ceo_id        TEXT,                                  -- e.g. 'dominion-homes'
  ceo_name      TEXT,                                  -- e.g. 'Dominion Homes CEO'
  task          TEXT NOT NULL,                         -- the task description sent
  context       TEXT,                                  -- optional extra context
  status        TEXT NOT NULL DEFAULT 'pending',       -- pending | running | done | error
  result        TEXT,                                  -- CEO/crew output when done
  error_msg     TEXT,                                  -- error details if failed
  triggered_by  TEXT,                                  -- 'al_chat' | 'claude_code'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ
);

-- Index for Al's status queries
CREATE INDEX IF NOT EXISTS al_jobs_status_idx ON al_jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS al_jobs_type_idx   ON al_jobs(job_type, created_at DESC);

-- RLS: service role only (Al's server uses service key)
ALTER TABLE al_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role full access" ON al_jobs
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
;
