-- ══════════════════════════════════════════════════════════════════════════════
-- Dominion → Sentinel: Test Ranger Pushes
-- Run in Supabase SQL Editor — copy-paste the entire file
--
-- Prerequisite: push-to-sentinel.sql must be executed first
--               (creates tables, function, and pg_net extension)
-- ══════════════════════════════════════════════════════════════════════════════


-- ── STEP 1: Seed test parcels ───────────────────────────────────────────────

INSERT INTO parcels (apn, county, address, owner_name, city, state, zip, estimated_value, equity_percent)
VALUES
    ('SPK-2025-001', 'maricopa', '4201 E Camelback Rd, Phoenix AZ 85018', 'Eleanor Voss',       'Phoenix',     'AZ', '85018', 485000, 78.00),
    ('SPK-2025-002', 'maricopa', '1910 N Scottsdale Rd, Tempe AZ 85281',  'Raymond Alcazar',    'Tempe',       'AZ', '85281', 340000, 61.50),
    ('SPK-2025-003', 'maricopa', '7340 W Indian School Rd, Mesa AZ 85210','Theresa Whitfield',  'Mesa',        'AZ', '85210', 275000, 52.00)
ON CONFLICT (apn, county) DO UPDATE SET
    address         = EXCLUDED.address,
    owner_name      = EXCLUDED.owner_name,
    estimated_value = EXCLUDED.estimated_value,
    equity_percent  = EXCLUDED.equity_percent,
    updated_at      = now();


-- ── STEP 2: Seed heat scores ────────────────────────────────────────────────

INSERT INTO dominion_heat_scores (apn, county, heat_score, tags, breakdown, ghost_mode_used)
VALUES
    (
        'SPK-2025-001', 'maricopa', 100,
        '["probate", "vacant", "inherited"]'::jsonb,
        '{"motivation": 96, "deal": 92, "severity_multiplier": 1.8, "stacking_bonus": 18, "owner_factor": 14, "equity_factor": 22, "ai_boost": 15}'::jsonb,
        false
    ),
    (
        'SPK-2025-002', 'maricopa', 86,
        '["pre_foreclosure", "absentee"]'::jsonb,
        '{"motivation": 82, "deal": 74, "severity_multiplier": 1.4, "stacking_bonus": 8, "owner_factor": 10, "equity_factor": 12, "ai_boost": 8}'::jsonb,
        false
    ),
    (
        'SPK-2025-003', 'maricopa', 79,
        '["tax_lien", "code_violation"]'::jsonb,
        '{"motivation": 70, "deal": 65, "severity_multiplier": 1.2, "stacking_bonus": 6, "owner_factor": 5, "equity_factor": 8, "ai_boost": 4}'::jsonb,
        true
    );


-- ══════════════════════════════════════════════════════════════════════════════
-- STEP 3: Push all three to Sentinel
--
-- Run each SELECT one at a time, or highlight all three and execute together.
-- Each returns a jsonb result with success status, push_id, and request_id.
-- ══════════════════════════════════════════════════════════════════════════════

-- 🔥 FIRE — Eleanor Voss — Probate + Vacant + Inherited — Score 100
SELECT push_to_sentinel('SPK-2025-001');

-- 🔥 FIRE — Raymond Alcazar — Pre-Foreclosure + Absentee — Score 86
SELECT push_to_sentinel('SPK-2025-002');

-- 🟠 HOT — Theresa Whitfield — Tax Lien + Code Violation — Score 79
SELECT push_to_sentinel('SPK-2025-003');


-- ══════════════════════════════════════════════════════════════════════════════
-- STEP 4: Verify pushes landed
--
-- Check the ranger_pushes table to confirm all three were sent.
-- ══════════════════════════════════════════════════════════════════════════════

SELECT apn, heat_score, status, pg_net_request_id, pushed_at
  FROM ranger_pushes
 ORDER BY pushed_at DESC
 LIMIT 5;


-- ══════════════════════════════════════════════════════════════════════════════
-- STEP 5: Check delivery (run after a few seconds)
--
-- pg_net is async — the HTTP response may take 1-3 seconds to arrive.
-- Run this after a short wait to see if Sentinel returned 200.
-- ══════════════════════════════════════════════════════════════════════════════

SELECT rp.apn,
       rp.heat_score,
       rp.status,
       check_push_status(rp.pg_net_request_id) AS sentinel_response
  FROM ranger_pushes rp
 WHERE rp.apn IN ('SPK-2025-001', 'SPK-2025-002', 'SPK-2025-003')
 ORDER BY rp.heat_score DESC;


-- ══════════════════════════════════════════════════════════════════════════════
-- WHAT TO DO NEXT:
--
--   1. Open Sentinel in your browser:
--      → http://localhost:3000/dashboard
--
--   2. Refresh the page (Ctrl+R / Cmd+R)
--
--   3. Check the "My Top Prospects" widget on the dashboard:
--      → Eleanor Voss (100 FIRE) should appear at the top
--      → Raymond Alcazar (86 FIRE) should appear second
--      → Theresa Whitfield (79 HOT) should appear third
--
--   4. Open the Prospects page:
--      → http://localhost:3000/sales-funnel/prospects
--      → All three leads should appear with status = "prospect"
--
--   5. Check the Sentinel server console (terminal running next dev)
--      for the 🚀 RANGER PUSH RECEIVED log entries
--
--   6. Optional — verify the audit trail in Sentinel:
--      → http://localhost:3000/api/audit
--      → Look for "ranger_push.received" actions
--
-- ══════════════════════════════════════════════════════════════════════════════
