-- Enrichment Pipeline v1.0
-- Add "staging" status for leads that need automated enrichment
-- before being visible to agents as prospects.
--
-- Flow: staging → (enrichment bot runs) → prospect → lead → ...

ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'staging' BEFORE 'prospect';
