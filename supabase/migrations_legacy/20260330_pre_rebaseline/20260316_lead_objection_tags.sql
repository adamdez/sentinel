-- ─────────────────────────────────────────────────────────────────────────────
-- Lead Objection Tags
--
-- Stores structured objection signals captured at post-call publish time.
-- Each row is one objection instance for one lead, linked to the call that
-- surfaced it. Operators select from an allowlist (enforced in app layer)
-- plus an optional short freeform note.
--
-- Key design choices:
--   - Operator-tagged, not AI-auto-classified. AI may suggest a tag later,
--     but the stored value is always operator-reviewed.
--   - status: open (still blocking) | resolved (operator closed it).
--   - Multiple tags per call are permitted (one row each).
--   - tag is TEXT not an enum — the allowlist is enforced in the application
--     layer (OBJECTION_TAGS in types.ts), not the DB, so adding new tags
--     does not require a migration.
--
-- Rollback:
--   DROP TABLE IF EXISTS lead_objection_tags;
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lead_objection_tags (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which lead this objection belongs to
  lead_id       UUID NOT NULL,      -- soft ref leads(id)

  -- Which call surfaced this objection (nullable — can be added outside a call)
  call_log_id   UUID,               -- soft ref calls_log(id)

  -- Allowlist tag from OBJECTION_TAGS in types.ts
  -- e.g. price_too_low | not_ready | need_to_think | talking_to_realtor |
  --      wants_retail | inherited_dispute | repair_concerns | bad_timing |
  --      pre_list | other
  tag           TEXT NOT NULL,

  -- Optional short operator note (max 120 chars enforced in app layer)
  note          TEXT,

  -- Lifecycle: open = still blocking; resolved = operator closed it
  status        TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'resolved')),

  -- Who tagged it and when
  tagged_by     UUID NOT NULL,      -- soft ref auth.users(id)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Who resolved it and when
  resolved_by   UUID,               -- soft ref auth.users(id)
  resolved_at   TIMESTAMPTZ
);

-- Indexes for the most common read paths
CREATE INDEX IF NOT EXISTS idx_objection_tags_lead_open
  ON lead_objection_tags (lead_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_objection_tags_tag_status
  ON lead_objection_tags (tag, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_objection_tags_call_log
  ON lead_objection_tags (call_log_id)
  WHERE call_log_id IS NOT NULL;

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Authenticated users read all (same pattern as other dialer tables).
-- Writes are gated by the API layer.

ALTER TABLE lead_objection_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "objection_tags_read" ON lead_objection_tags;
CREATE POLICY "objection_tags_read" ON lead_objection_tags
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "objection_tags_write" ON lead_objection_tags;
CREATE POLICY "objection_tags_write" ON lead_objection_tags
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
