do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_enum e on t.oid = e.enumtypid
    where t.typname = 'lead_status'
      and e.enumlabel = 'active'
  ) then
    alter type public.lead_status add value 'active' after 'lead';
  end if;
end $$;
