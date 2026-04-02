create table if not exists public.founder_work_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  source text not null default 'manual',
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_founder_work_logs_user_start
  on public.founder_work_logs (user_id, started_at);

create index if not exists idx_founder_work_logs_start
  on public.founder_work_logs (started_at);

create index if not exists idx_founder_work_logs_end
  on public.founder_work_logs (ended_at);
