-- ══════════════════════════════════════════════════════════════════════════════
-- Extend lead_status enum: add 'My Leads'
-- Run in Supabase SQL Editor (copy-paste the entire file)
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'My Leads';

-- Confirm all values now exist
SELECT unnest(enum_range(NULL::lead_status)) AS status_value;
