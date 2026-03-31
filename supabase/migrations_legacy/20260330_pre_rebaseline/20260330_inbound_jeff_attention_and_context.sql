alter table public.jeff_interactions
  add column if not exists direction text not null default 'outbound',
  add column if not exists caller_phone text,
  add column if not exists caller_name text,
  add column if not exists property_address text;

update public.jeff_interactions
set direction = 'outbound'
where direction is null;

create index if not exists idx_jeff_interactions_direction_status
  on public.jeff_interactions (direction, status, created_at desc);
