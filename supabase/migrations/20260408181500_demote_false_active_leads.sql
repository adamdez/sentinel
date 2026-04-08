-- Separate true Active from intro-stage Lead rows.
-- Any untouched lead-stage records that only looked "active" because of the
-- old alias should return to Prospect.

update public.leads
set
  status = 'prospect',
  promoted_at = null
where status = 'lead'
  and coalesce(total_calls, 0) = 0
  and last_contact_at is null
  and qualification_route is null
  and motivation_level is null
  and seller_timeline is null
  and condition_level is null
  and coalesce(decision_maker_confirmed, false) = false
  and price_expectation is null
  and nullif(btrim(coalesce(next_action, '')), '') is null
  and nullif(btrim(coalesce(disposition_code, '')), '') is null
  and nullif(btrim(coalesce(notes, '')), '') is null;
