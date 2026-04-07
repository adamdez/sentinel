-- Intro SOP tracking for 3-day calling workflow + explicit exit categorization.
-- Additive only; no destructive changes.

alter table public.leads
  add column if not exists intro_sop_active boolean not null default true,
  add column if not exists intro_day_count integer not null default 0,
  add column if not exists intro_last_call_date date,
  add column if not exists intro_completed_at timestamptz,
  add column if not exists intro_exit_category text,
  add column if not exists intro_exit_reason text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leads_intro_day_count_range'
  ) then
    alter table public.leads
      add constraint leads_intro_day_count_range
      check (intro_day_count >= 0 and intro_day_count <= 3);
  end if;
end
$$;

create index if not exists idx_leads_intro_sop_active
  on public.leads (intro_sop_active, intro_day_count, intro_completed_at);

create index if not exists idx_leads_intro_exit_category
  on public.leads (intro_exit_category);
