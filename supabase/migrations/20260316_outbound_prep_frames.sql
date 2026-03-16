-- outbound_prep_frames
--
-- Stores assembled context frames for hypothetical outbound warm-transfer calls.
-- PREP ONLY — this table does NOT trigger any live calls.
-- Used to evaluate pilot readiness, opener script coverage, and handoff quality
-- before any autonomous outbound automation is authorized.
--
-- One frame = one assembled snapshot of what context would be available
-- for a given lead at a given moment if an outbound opener were placed.
-- Frames are created manually by operators or review tooling, never by cron.

create table if not exists outbound_prep_frames (
  id                   uuid primary key default gen_random_uuid(),
  lead_id              uuid not null references leads(id) on delete cascade,

  -- Who assembled this frame and when
  assembled_by         uuid references auth.users(id) on delete set null,
  assembled_at         timestamptz not null default now(),

  -- Which opener script was selected for this frame
  -- References voice_registry.workflow = 'outbound_opener' (future pilot script)
  opener_script_key    text,          -- e.g. "outbound_opener_v1"
  opener_script_version text,         -- version string from voice_registry

  -- Snapshot of qual signals at assembly time
  -- Keys mirror CRMLeadContext fields: motivation_level, timeline, total_calls, etc.
  qual_snapshot        jsonb not null default '{}'::jsonb,

  -- Objection tags present at assembly time (array of ObjectionTag enum values)
  objection_tags       text[] not null default '{}',

  -- Trust snippets selected for this frame (array of TrustSnippetKey values)
  trust_snippets_used  text[] not null default '{}',

  -- Seller page links included in frame
  seller_pages_included text[] not null default '{}',

  -- Handoff readiness assessment (deterministic, not AI)
  -- true = all required qual fields present and no blocking objections
  handoff_ready        boolean not null default false,

  -- Human-readable reason if handoff_ready = false
  fallback_reason      text,

  -- Reviewer fields (Adam reviews frames in the pilot prep surface)
  review_status        text not null default 'pending'
                         check (review_status in ('pending', 'approved', 'flagged', 'rejected')),
  reviewer_notes       text,
  reviewed_by          uuid references auth.users(id) on delete set null,
  reviewed_at          timestamptz,

  -- Explicit guard: this column must always be 'prep_only'.
  -- A future migration to enable live calls requires an explicit ALTER TABLE
  -- and code changes — this is intentional friction against accidental activation.
  automation_tier      text not null default 'prep_only'
                         check (automation_tier = 'prep_only'),

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Index for per-lead frame listing (most recent first)
create index if not exists idx_outbound_prep_frames_lead_id
  on outbound_prep_frames(lead_id, assembled_at desc);

-- Index for review queue
create index if not exists idx_outbound_prep_frames_review_status
  on outbound_prep_frames(review_status, assembled_at desc);

-- RLS
alter table outbound_prep_frames enable row level security;

create policy "Authenticated users can read outbound_prep_frames"
  on outbound_prep_frames for select
  using (auth.role() = 'authenticated');

create policy "Authenticated users can insert outbound_prep_frames"
  on outbound_prep_frames for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can update outbound_prep_frames"
  on outbound_prep_frames for update
  using (auth.role() = 'authenticated');

-- Updated_at trigger
create or replace function update_outbound_prep_frames_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_outbound_prep_frames_updated_at
  before update on outbound_prep_frames
  for each row execute function update_outbound_prep_frames_updated_at();
