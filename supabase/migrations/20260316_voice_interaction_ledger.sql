-- Voice Interaction Ledger
--
-- Structured audit log for voice interactions (inbound, outbound-follow-up,
-- warm-transfer, and future automation-prep interactions).
--
-- Purpose:
--   - Operational transparency: what kind of call, under what consent basis,
--     with which automation tier was active.
--   - Risk visibility: quickly surface interactions that warrant review
--     (AI-assisted + no consent basis, DNC-adjacent, high-risk caller types).
--   - Future outbound prep: "automation_prep" tier lets Adam track which
--     interactions were classified for future outbound activation WITHOUT
--     activating outbound now.
--
-- Design constraints:
--   - One row per inbound event (classify or answered). FK to dialer_events.
--   - Ledger writes are best-effort in routes — they never fail the main response.
--   - NOT a compliance gate. Does NOT block voice functionality.
--   - Risk tier is computed deterministically at write time, correctable by Adam.
--
-- Rollback:
--   DROP TABLE IF EXISTS voice_interaction_ledger;

CREATE TABLE IF NOT EXISTS voice_interaction_ledger (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- FK to the triggering dialer_event (inbound.answered, inbound.classified,
  -- transfer.connected, transfer.failed_fallback, or future outbound events).
  -- ON DELETE SET NULL: ledger survives event deletion for audit purposes.
  event_id        UUID        REFERENCES dialer_events(id) ON DELETE SET NULL,

  -- Lead associated with this interaction, if matched at call time.
  lead_id         UUID        REFERENCES leads(id) ON DELETE SET NULL,

  -- ── What kind of interaction is this? ────────────────────────────────────
  -- Bounded app-enforced vocabulary:
  --   inbound_seller          — inbound call classified as seller
  --   inbound_buyer           — inbound call classified as buyer
  --   inbound_unknown         — inbound call, caller type not yet determined
  --   inbound_spam_vendor     — spam or vendor (low risk, still logged)
  --   outbound_follow_up      — operator-initiated outbound follow-up call
  --   warm_transfer_attempt   — warm transfer attempted from inbound call
  --   automation_prep         — flagged for future automation consideration (prep only)
  interaction_type TEXT        NOT NULL DEFAULT 'inbound_unknown',

  -- ── Consent / source basis ────────────────────────────────────────────────
  -- How did this caller come to us, or why are we calling them?
  --   inbound_response        — caller initiated contact (cleanest basis)
  --   prior_opt_in            — prior seller inquiry, existing relationship
  --   marketing_list          — from a purchased or generated list (higher scrutiny)
  --   referral                — referral from another party
  --   unknown                 — not determined at time of call
  consent_basis   TEXT        NOT NULL DEFAULT 'unknown',

  -- ── Automation tier ───────────────────────────────────────────────────────
  --   operator_led            — human operator managed the call manually
  --   ai_assisted             — AI-generated content (draft, routing) was used
  --   automation_prep         — marked as candidate for future automation
  --                             (NOT active automation — prep/flagging only)
  automation_tier TEXT        NOT NULL DEFAULT 'operator_led',

  -- ── Risk tier ─────────────────────────────────────────────────────────────
  -- Computed deterministically at write time from consent_basis + automation_tier.
  --   low        — operator_led + inbound_response (cleanest)
  --   medium     — ai_assisted OR unknown consent_basis
  --   high       — automation_prep OR marketing_list OR dnc_flag = true
  --   review     — needs explicit operator review (set by system or operator)
  risk_tier       TEXT        NOT NULL DEFAULT 'low',

  -- ── Script class ──────────────────────────────────────────────────────────
  -- Which voice_registry workflow script was in effect. Nullable — not always known.
  -- E.g. "seller_qualifying@1.0.0"
  script_class    TEXT,

  -- ── Handoff rule version ──────────────────────────────────────────────────
  -- Which handoff_rule version was active. Nullable.
  -- E.g. "1.0.0"
  handoff_rule_version TEXT,

  -- ── Quick flags ───────────────────────────────────────────────────────────
  -- DNC-adjacent flag. Set when: lead has do_not_contact = true, or caller
  -- explicitly asked to stop contact. Does not block the call — flags for review.
  dnc_flag        BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Whether an AI model was involved in producing any content shown to the operator.
  ai_assisted     BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Whether a human operator was in the loop for this interaction.
  operator_led    BOOLEAN     NOT NULL DEFAULT TRUE,

  -- ── Operator review ───────────────────────────────────────────────────────
  -- Adam can mark an entry as reviewed, corrected, or dismissed.
  -- review_status: "pending" | "reviewed" | "corrected" | "dismissed"
  review_status   TEXT        NOT NULL DEFAULT 'pending',
  review_note     TEXT,
  reviewed_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,

  -- ── Context ───────────────────────────────────────────────────────────────
  -- Freeform notes written at ledger-entry time (from event metadata, not user-entered).
  context_notes   TEXT,

  -- ── Audit ─────────────────────────────────────────────────────────────────
  created_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Constraints
ALTER TABLE voice_interaction_ledger
  ADD CONSTRAINT vcl_interaction_type_check CHECK (interaction_type IN (
    'inbound_seller', 'inbound_buyer', 'inbound_unknown', 'inbound_spam_vendor',
    'outbound_follow_up', 'warm_transfer_attempt', 'automation_prep'
  ));

ALTER TABLE voice_interaction_ledger
  ADD CONSTRAINT vcl_consent_basis_check CHECK (consent_basis IN (
    'inbound_response', 'prior_opt_in', 'marketing_list', 'referral', 'unknown'
  ));

ALTER TABLE voice_interaction_ledger
  ADD CONSTRAINT vcl_automation_tier_check CHECK (automation_tier IN (
    'operator_led', 'ai_assisted', 'automation_prep'
  ));

ALTER TABLE voice_interaction_ledger
  ADD CONSTRAINT vcl_risk_tier_check CHECK (risk_tier IN (
    'low', 'medium', 'high', 'review'
  ));

ALTER TABLE voice_interaction_ledger
  ADD CONSTRAINT vcl_review_status_check CHECK (review_status IN (
    'pending', 'reviewed', 'corrected', 'dismissed'
  ));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_vcl_event_id      ON voice_interaction_ledger (event_id);
CREATE INDEX IF NOT EXISTS idx_vcl_lead_id       ON voice_interaction_ledger (lead_id);
CREATE INDEX IF NOT EXISTS idx_vcl_risk_tier     ON voice_interaction_ledger (risk_tier, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vcl_review_status ON voice_interaction_ledger (review_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vcl_created_at    ON voice_interaction_ledger (created_at DESC);

-- RLS
ALTER TABLE voice_interaction_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_vcl"
  ON voice_interaction_ledger FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_write_vcl"
  ON voice_interaction_ledger FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_vcl_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER tg_vcl_updated_at
  BEFORE UPDATE ON voice_interaction_ledger
  FOR EACH ROW EXECUTE FUNCTION update_vcl_updated_at();
