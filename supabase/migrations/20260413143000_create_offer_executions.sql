create table if not exists offer_executions (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references offers(id) on delete cascade,
  provider varchar(50) not null,
  template_key varchar(100),
  envelope_id varchar(255),
  sender_view_url text,
  provider_status varchar(50) not null default 'created',
  sent_at timestamptz,
  completed_at timestamptz,
  voided_at timestamptz,
  last_provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_offer_executions_offer on offer_executions(offer_id);
create index if not exists idx_offer_executions_envelope on offer_executions(envelope_id);
create index if not exists idx_offer_executions_status on offer_executions(provider_status);
