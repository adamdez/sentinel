-- Prevent duplicate CRM lead rows for the same intake queue item.
-- Nulls remain allowed so non-intake leads are unaffected.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_leads_intake_lead_id
  ON leads(intake_lead_id)
  WHERE intake_lead_id IS NOT NULL;
