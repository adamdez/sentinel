-- ─────────────────────────────────────────────────────────────────────────────
-- Prompt Registry — draft_note v1.0.0 seed
--
-- Registers the draft_note workflow introduced by the post-call note generator.
-- No schema changes — the prompt_registry table already exists.
--
-- Rollback: DELETE FROM prompt_registry WHERE workflow = 'draft_note' AND version = '1.0.0';
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO prompt_registry (workflow, version, status, description, changelog)
VALUES
  (
    'draft_note', '1.0.0', 'active',
    'Grok-based post-call note drafter. Extracts summary_line, promises_made, objection, next_task_suggestion, and deal_temperature from brief operator call notes. Returns structured JSON only. Draft is operator-reviewed before publish.',
    'Initial version. Best-effort extraction with conservative null fallbacks. Operator must confirm, edit, or reject the draft before it flows through publish-manager. No direct CRM writes from this workflow.'
  )
ON CONFLICT (workflow, version) DO NOTHING;
