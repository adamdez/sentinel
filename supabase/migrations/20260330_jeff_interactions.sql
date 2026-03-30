alter table public.tasks
  add column if not exists source_type text,
  add column if not exists source_key text,
  add column if not exists voice_session_id uuid,
  add column if not exists jeff_interaction_id uuid;

create index if not exists idx_tasks_source on public.tasks(source_type, source_key);
create index if not exists idx_tasks_voice_session on public.tasks(voice_session_id) where voice_session_id is not null;
create index if not exists idx_tasks_jeff_interaction on public.tasks(jeff_interaction_id) where jeff_interaction_id is not null;

create unique index if not exists uq_tasks_source_identity
  on public.tasks(source_type, source_key)
  where source_type is not null and source_key is not null;

create table if not exists public.jeff_interactions (
  id uuid primary key default gen_random_uuid(),
  voice_session_id uuid not null,
  lead_id uuid references public.leads(id) on delete set null,
  calls_log_id uuid,
  interaction_type text not null,
  status text not null default 'needs_review',
  summary text,
  callback_requested boolean not null default false,
  callback_due_at timestamptz,
  callback_timing_text text,
  transfer_outcome text,
  assigned_to uuid,
  task_id uuid,
  policy_version text not null,
  metadata jsonb not null default '{}'::jsonb,
  reviewed_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_jeff_interactions_voice_session unique (voice_session_id)
);

create index if not exists idx_jeff_interactions_lead
  on public.jeff_interactions(lead_id, created_at desc);

create index if not exists idx_jeff_interactions_status
  on public.jeff_interactions(status, created_at desc);

create index if not exists idx_jeff_interactions_task
  on public.jeff_interactions(task_id)
  where task_id is not null;

alter table public.jeff_interactions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'jeff_interactions'
      and policyname = 'Authenticated users can read Jeff interactions'
  ) then
    create policy "Authenticated users can read Jeff interactions" on public.jeff_interactions
      for select to authenticated using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'jeff_interactions'
      and policyname = 'Service role can manage Jeff interactions'
  ) then
    create policy "Service role can manage Jeff interactions" on public.jeff_interactions
      for all to service_role using (true) with check (true);
  end if;
end $$;

drop trigger if exists jeff_interactions_updated_at on public.jeff_interactions;
create trigger jeff_interactions_updated_at
  before update on public.jeff_interactions
  for each row execute function extensions.moddatetime(updated_at);
