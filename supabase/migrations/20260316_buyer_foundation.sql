-- ─────────────────────────────────────────────────────────────────────────────
-- Buyer Foundation Migration
--
-- Creates the buyers, deal_buyers, and buyer_zip_preferences tables that the
-- existing code in /api/buyers, /api/deal-buyers, hooks/use-buyers, and the
-- buyers page depends on.
--
-- Also adds the missing columns to deals and leads that dispo/closing routes
-- already query but that were never migrated.
--
-- Rollback: see comment block at bottom of file.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. buyers ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS buyers (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core identity
  contact_name             TEXT NOT NULL,
  company_name             TEXT,
  phone                    TEXT,
  email                    TEXT,

  -- Contact preference
  preferred_contact_method TEXT NOT NULL DEFAULT 'phone',

  -- Buy box
  markets                  TEXT[]   NOT NULL DEFAULT '{}',
  asset_types              TEXT[]   NOT NULL DEFAULT '{}',
  price_range_low          INTEGER,
  price_range_high         INTEGER,
  funding_type             TEXT,         -- cash | hard_money | conventional | private
  proof_of_funds           TEXT NOT NULL DEFAULT 'not_submitted',  -- verified | submitted | not_submitted
  pof_verified_at          TIMESTAMPTZ,
  rehab_tolerance          TEXT,         -- none | light | moderate | heavy | gut
  buyer_strategy           TEXT,         -- flip | landlord | developer | wholesale
  occupancy_pref           TEXT NOT NULL DEFAULT 'either',         -- vacant | occupied | either

  -- Metadata / tags
  tags                     TEXT[]   NOT NULL DEFAULT '{}',
  notes                    TEXT,
  status                   TEXT NOT NULL DEFAULT 'active',         -- active | inactive

  -- SLAUD Phase 1 additions: buyer reliability / deal velocity signals
  arv_max                  INTEGER,          -- max ARV this buyer will pay against
  close_speed_days         SMALLINT,         -- typical days-to-close
  reliability_score        SMALLINT          -- 1-5 manual rating
                             CHECK (reliability_score IS NULL OR reliability_score BETWEEN 1 AND 5),
  deals_closed             SMALLINT NOT NULL DEFAULT 0,  -- running count of completed deals
  last_contacted_at        TIMESTAMPTZ,      -- last time we reached out (any deal)
  do_not_contact           BOOLEAN  NOT NULL DEFAULT FALSE,

  -- Ownership / audit
  created_by               UUID,             -- auth.users(id) — soft ref, no FK to avoid RLS complexity
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes useful for filter queries in /api/buyers GET
CREATE INDEX IF NOT EXISTS idx_buyers_status         ON buyers (status);
CREATE INDEX IF NOT EXISTS idx_buyers_last_contacted ON buyers (last_contacted_at DESC NULLS LAST);

-- RLS
ALTER TABLE buyers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "buyers_auth_all" ON buyers;
CREATE POLICY "buyers_auth_all" ON buyers
  FOR ALL
  TO authenticated
  USING  (TRUE)
  WITH CHECK (TRUE);

-- ── 2. deal_buyers ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS deal_buyers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id          UUID NOT NULL REFERENCES deals (id) ON DELETE CASCADE,
  buyer_id         UUID NOT NULL REFERENCES buyers (id) ON DELETE CASCADE,

  -- Outreach lifecycle
  status           TEXT NOT NULL DEFAULT 'not_contacted',
    -- not_contacted | queued | sent | interested | offered | passed | follow_up | selected
  date_contacted   TIMESTAMPTZ,
  contact_method   TEXT,          -- phone | email | text
  response         TEXT,
  offer_amount     INTEGER,
  follow_up_needed BOOLEAN NOT NULL DEFAULT FALSE,
  follow_up_at     TIMESTAMPTZ,
  responded_at     TIMESTAMPTZ,
  selection_reason TEXT,
  notes            TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT deal_buyers_unique UNIQUE (deal_id, buyer_id)
);

CREATE INDEX IF NOT EXISTS idx_deal_buyers_deal  ON deal_buyers (deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_buyers_buyer ON deal_buyers (buyer_id);
CREATE INDEX IF NOT EXISTS idx_deal_buyers_status ON deal_buyers (status);

ALTER TABLE deal_buyers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deal_buyers_auth_all" ON deal_buyers;
CREATE POLICY "deal_buyers_auth_all" ON deal_buyers
  FOR ALL
  TO authenticated
  USING  (TRUE)
  WITH CHECK (TRUE);

-- ── 3. buyer_zip_preferences ─────────────────────────────────────────────────
-- Stores per-buyer zip code preferences for future buyer radar use.
-- Not yet surfaced in UI; created now so schema is complete for Phase 1.

CREATE TABLE IF NOT EXISTS buyer_zip_preferences (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id   UUID NOT NULL REFERENCES buyers (id) ON DELETE CASCADE,
  zip        VARCHAR(10) NOT NULL,
  county     VARCHAR(100),          -- Spokane County, Kootenai County, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT buyer_zip_pref_unique UNIQUE (buyer_id, zip)
);

CREATE INDEX IF NOT EXISTS idx_buyer_zip_buyer ON buyer_zip_preferences (buyer_id);
CREATE INDEX IF NOT EXISTS idx_buyer_zip_zip   ON buyer_zip_preferences (zip);

ALTER TABLE buyer_zip_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "buyer_zip_pref_auth_all" ON buyer_zip_preferences;
CREATE POLICY "buyer_zip_pref_auth_all" ON buyer_zip_preferences
  FOR ALL
  TO authenticated
  USING  (TRUE)
  WITH CHECK (TRUE);

-- ── 4. Fix deals.buyer_id FK: contacts → buyers ──────────────────────────────
-- The Drizzle schema had deals.buyer_id referencing contacts(id).
-- The deal_buyers PATCH route sets deals.buyer_id = buyer_id (from buyers table),
-- so the FK must point to buyers, not contacts.
--
-- We drop the old FK constraint (by its generated name) and re-add it pointing
-- to buyers. Using DO block to handle name variations across environments.

DO $$
DECLARE
  r RECORD;
BEGIN
  -- Drop any existing FK on deals.buyer_id regardless of constraint name
  FOR r IN
    SELECT conname
    FROM   pg_constraint
    WHERE  conrelid = 'deals'::regclass
      AND  contype  = 'f'
      AND  conname  LIKE '%buyer_id%'
  LOOP
    EXECUTE 'ALTER TABLE deals DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END;
$$;

-- Re-add FK pointing to buyers table (nullable, set null on delete)
ALTER TABLE deals
  ADD CONSTRAINT deals_buyer_id_fkey
  FOREIGN KEY (buyer_id) REFERENCES buyers (id) ON DELETE SET NULL;

-- ── 5. ADD missing columns to deals ──────────────────────────────────────────
-- These columns are queried by /api/dispo and /api/deals/[id]/closing but
-- were never created in the database.

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS dispo_prep         JSONB,
  ADD COLUMN IF NOT EXISTS entered_dispo_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closing_target_date DATE,
  ADD COLUMN IF NOT EXISTS closing_status     TEXT,
  ADD COLUMN IF NOT EXISTS closing_notes      TEXT,
  ADD COLUMN IF NOT EXISTS title_company      TEXT,
  ADD COLUMN IF NOT EXISTS earnest_money_deposited BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS inspection_complete     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS closing_checklist  JSONB;

-- ── 6. ADD missing columns to leads ──────────────────────────────────────────

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS monetizability_score SMALLINT
    CHECK (monetizability_score IS NULL OR monetizability_score BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS dispo_friction_level TEXT;
  -- dispo_friction_level values: low | medium | high (not enum — easier to extend)

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK INSTRUCTIONS (run manually if needed):
--
--   DROP TABLE IF EXISTS buyer_zip_preferences;
--   DROP TABLE IF EXISTS deal_buyers;
--   DROP TABLE IF EXISTS buyers;
--
--   ALTER TABLE deals
--     DROP CONSTRAINT IF EXISTS deals_buyer_id_fkey,
--     DROP COLUMN IF EXISTS dispo_prep,
--     DROP COLUMN IF EXISTS entered_dispo_at,
--     DROP COLUMN IF EXISTS closing_target_date,
--     DROP COLUMN IF EXISTS closing_status,
--     DROP COLUMN IF EXISTS closing_notes,
--     DROP COLUMN IF EXISTS title_company,
--     DROP COLUMN IF EXISTS earnest_money_deposited,
--     DROP COLUMN IF EXISTS inspection_complete,
--     DROP COLUMN IF EXISTS closing_checklist;
--
--   ALTER TABLE leads
--     DROP COLUMN IF EXISTS monetizability_score,
--     DROP COLUMN IF EXISTS dispo_friction_level;
--
--   -- Restore original FK if needed:
--   ALTER TABLE deals
--     ADD CONSTRAINT deals_buyer_id_fkey
--     FOREIGN KEY (buyer_id) REFERENCES contacts (id) ON DELETE SET NULL;
-- ─────────────────────────────────────────────────────────────────────────────
