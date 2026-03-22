-- ============================================================
-- Live Coach v2
-- Dialer-only cached Discovery Map state + prompt registry seed
-- ============================================================

ALTER TABLE call_sessions
  ADD COLUMN IF NOT EXISTS live_coach_state JSONB;

COMMENT ON COLUMN call_sessions.live_coach_state IS
  'Dialer-only cached live coach state. Stores discovery map, structured live notes, last processed transcript sequence, and latest best move. Never synced to CRM tables.';

INSERT INTO prompt_registry (workflow, version, status, description, changelog)
VALUES (
  'live_coach',
  '2.0.0',
  'active',
  'Discovery Map strategist. Uses deterministic gap detection first, then GPT-5 to refine the next live-call move.',
  'Introduces DB-backed live coach state, structured notes, highest-priority gap tracking, and fast gap-aware coaching.'
)
ON CONFLICT (workflow, version) DO NOTHING;
