-- eval_ratings
--
-- Judgment layer on top of dialer_ai_traces.
-- Stores one reviewer verdict per AI output (per run_id).
--
-- PURPOSE:
--   dialer_ai_traces is the EXECUTION LOG (what ran, latency, raw output).
--   eval_ratings is the JUDGMENT LAYER (was this output actually useful?).
--   Together they enable prompt-version comparisons grounded in reviewed outcomes.
--
-- POPULATION:
--   Rows are written as side-effects of existing review actions:
--     - Dossier approve/flag → eval_ratings for workflow "extract"
--     - QA finding mark valid/invalid/corrected → eval_ratings for workflow "qa_notes"
--     - Draft note approve/reject → eval_ratings for workflow "draft_note"
--     - Summarize review (review_flag on trace) → eval_ratings for workflow "summarize"
--   No new operator step is required.
--
-- CONSTRAINT:
--   One rating per run_id. If the operator re-reviews, the existing row is updated.

create table if not exists eval_ratings (
  id              uuid primary key default gen_random_uuid(),

  -- Link to execution log
  run_id          text not null unique,   -- FK-like to dialer_ai_traces.run_id (text, not UUID)
  workflow        text not null,          -- "summarize" | "extract" | "draft_note" | "qa_notes" | "routing"
  prompt_version  text not null,          -- e.g. "2.1.0"
  model           text,                   -- e.g. "grok-3-mini"

  -- Source identifiers (nullable — not all workflows have all three)
  lead_id         uuid references leads(id) on delete set null,
  call_log_id     uuid,                   -- references calls_log(id) loosely (no FK to avoid cascade issues)
  session_id      uuid,                   -- references call_sessions(id) loosely

  -- Reviewer verdict — the core eval signal
  verdict         text not null
                    check (verdict in ('good', 'needs_work', 'incorrect')),

  -- Rubric dimension that explains the verdict
  -- Bounded allowlist: one primary failure mode per row
  rubric_dimension text
                    check (rubric_dimension in (
                      'useful_and_accurate',   -- output was correct and helped the operator
                      'missing_key_fact',      -- output omitted an important fact
                      'hallucinated_fact',     -- output invented something not in source
                      'wrong_tone',            -- output used inappropriate language
                      'wrong_routing',         -- routing/classification was incorrect
                      'incomplete_output',     -- output cut off or missing required fields
                      'low_relevance',         -- output was technically correct but not useful
                      'other'                  -- does not fit above categories
                    )),

  -- Free-text note from Adam explaining the verdict
  reviewer_note   text,

  -- What the output actually said (truncated snapshot for inline display)
  -- Copied from dialer_ai_traces.output_text at write time for denormalized access
  output_snapshot text,

  -- Reviewer
  reviewed_by     uuid references auth.users(id) on delete set null,
  reviewed_at     timestamptz not null default now(),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Indexes for summary queries
create index if not exists idx_eval_ratings_workflow_version
  on eval_ratings(workflow, prompt_version, reviewed_at desc);

create index if not exists idx_eval_ratings_verdict
  on eval_ratings(verdict, workflow, reviewed_at desc);

create index if not exists idx_eval_ratings_lead_id
  on eval_ratings(lead_id) where lead_id is not null;

-- RLS
alter table eval_ratings enable row level security;

create policy "Authenticated users can read eval_ratings"
  on eval_ratings for select
  using (auth.role() = 'authenticated');

create policy "Authenticated users can insert eval_ratings"
  on eval_ratings for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can update eval_ratings"
  on eval_ratings for update
  using (auth.role() = 'authenticated');

-- Updated_at trigger
create or replace function update_eval_ratings_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_eval_ratings_updated_at
  before update on eval_ratings
  for each row execute function update_eval_ratings_updated_at();
