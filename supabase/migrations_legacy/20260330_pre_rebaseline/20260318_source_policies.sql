-- ─────────────────────────────────────────────────────────────────────────────
-- Source Policy Registry
--
-- Maps each ArtifactSourceType to an explicit evidence policy.
-- Policies control how artifacts of each type are treated during
-- dossier compile and review:
--
--   approved        — clean evidence, compiles without warnings
--   review_required — allowed in compile but surfaces a warning in
--                     the compile response and dossier review UI
--   blocked         — excluded from compile by default; warning at
--                     capture time. Can be overridden with include_blocked.
--
-- This is a config table, not an audit log. One row per source_type.
-- Updated by Adam via /settings/source-policies admin UI.
--
-- Default seed:
--   probate_filing  → approved        (primary trusted source for this workflow)
--   assessor        → approved        (public record, low risk)
--   court_record    → approved        (public record, low risk)
--   obituary        → review_required (useful but needs context check)
--   news            → review_required (can be stale or inaccurate)
--   other           → review_required (unknown provenance by definition)
--
-- Rollback:
--   DROP TABLE IF EXISTS source_policies;
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS source_policies (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The ArtifactSourceType value this policy governs.
  source_type    TEXT NOT NULL UNIQUE,

  -- Evidence policy for this source type.
  -- approved | review_required | blocked
  policy         TEXT NOT NULL DEFAULT 'review_required',

  -- Human-readable rationale (shown to Adam in the admin UI).
  rationale      TEXT,

  -- Who last changed the policy and when (soft audit trail).
  updated_by     UUID,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE source_policies
  ADD CONSTRAINT source_policies_policy_check
  CHECK (policy IN ('approved', 'review_required', 'blocked'));

-- ── Seed default policies ────────────────────────────────────────────────────

INSERT INTO source_policies (source_type, policy, rationale) VALUES
  ('probate_filing',  'approved',        'Primary trusted source — official county probate filing. Low risk, high value.'),
  ('assessor',        'approved',        'Public record — county assessor / tax roll. Reliable for ownership and property data.'),
  ('court_record',    'approved',        'Public court record. Generally reliable; verify case number and jurisdiction.'),
  ('obituary',        'review_required', 'Useful for deceased confirmation and heir context, but may be incomplete or from unreliable publications. Always cross-reference.'),
  ('news',            'review_required', 'News articles can be stale, inaccurate, or lack legal standing. Use only to corroborate — never as sole evidence.'),
  ('other',           'review_required', 'Unclassified source. Review provenance before including in a dossier.')
ON CONFLICT (source_type) DO NOTHING;

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE source_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "source_policies_auth_all" ON source_policies;
CREATE POLICY "source_policies_auth_all" ON source_policies
  FOR ALL
  TO authenticated
  USING  (TRUE)
  WITH CHECK (TRUE);
