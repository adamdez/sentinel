create table if not exists public.jeff_control_settings (
  id uuid primary key default gen_random_uuid(),
  control_key text not null unique default 'primary',
  enabled boolean not null default false,
  mode text not null default 'manual_only',
  soft_paused boolean not null default false,
  emergency_halt boolean not null default false,
  daily_max_calls integer not null default 120,
  per_run_max_calls integer not null default 10,
  business_hours_only boolean not null default true,
  allowed_start_hour integer not null default 7,
  allowed_end_hour integer not null default 20,
  quality_review_enabled boolean not null default true,
  policy_version text not null default 'jeff-outbound-2026-03-30',
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_jeff_control_settings_key on public.jeff_control_settings(control_key);

insert into public.jeff_control_settings (
  control_key,
  enabled,
  mode,
  soft_paused,
  emergency_halt,
  daily_max_calls,
  per_run_max_calls,
  business_hours_only,
  allowed_start_hour,
  allowed_end_hour,
  quality_review_enabled,
  policy_version
)
values (
  'primary',
  false,
  'manual_only',
  false,
  false,
  120,
  10,
  true,
  7,
  20,
  true,
  'jeff-outbound-2026-03-30'
)
on conflict (control_key) do nothing;

create table if not exists public.jeff_queue_entries (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  selected_phone text,
  queue_tier text not null default 'eligible',
  queue_status text not null default 'active',
  approved_by uuid,
  approved_at timestamptz not null default now(),
  last_voice_session_id uuid,
  last_call_status text,
  last_called_at timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_jeff_queue_lead unique (lead_id)
);

create index if not exists idx_jeff_queue_entries_tier_status
  on public.jeff_queue_entries(queue_tier, queue_status, approved_at desc);

create index if not exists idx_jeff_queue_entries_last_called
  on public.jeff_queue_entries(last_called_at desc nulls last);

create table if not exists public.jeff_quality_reviews (
  id uuid primary key default gen_random_uuid(),
  voice_session_id uuid not null,
  reviewer_id uuid not null,
  review_tags text[] not null default '{}',
  score integer,
  notes text,
  policy_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_jeff_quality_review unique (voice_session_id, reviewer_id)
);

create index if not exists idx_jeff_quality_reviews_session on public.jeff_quality_reviews(voice_session_id);
create index if not exists idx_jeff_quality_reviews_created on public.jeff_quality_reviews(created_at desc);
