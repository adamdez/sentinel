
create table if not exists public.al_memories (
  id bigint generated always as identity primary key,
  category text not null default 'general',
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.al_memories is 'Persistent memory for Al Boreland - key facts, decisions, preferences that persist across sessions';

create index idx_al_memories_category on public.al_memories(category);
create index idx_al_memories_updated on public.al_memories(updated_at desc);
;
