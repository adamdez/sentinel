-- ══════════════════════════════════════════════════════════════════════════════
-- Dominion → Sentinel: push_to_sentinel(p_apn text)
-- Run in Supabase SQL Editor (copy-paste the entire file)
--
-- Prerequisites:
--   1. pg_net extension enabled (for HTTP POST to Sentinel API)
--   2. dominion_heat_scores table populated by Dominion scoring engine
--   3. parcels table populated by Dominion ingestion pipeline
-- ══════════════════════════════════════════════════════════════════════════════


-- ── 0. Enable pg_net for outbound HTTP from inside Postgres ─────────────────

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;


-- ── 1. Source tables (Dominion side) — skip if they already exist ───────────

CREATE TABLE IF NOT EXISTS parcels (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    apn             text NOT NULL,
    county          text NOT NULL DEFAULT 'maricopa',
    address         text NOT NULL,
    owner_name      text NOT NULL,
    city            text DEFAULT '',
    state           text DEFAULT 'AZ',
    zip             text DEFAULT '',
    estimated_value integer,
    equity_percent  numeric(5,2),
    raw_data        jsonb DEFAULT '{}'::jsonb,
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now(),
    CONSTRAINT uq_parcels_apn_county UNIQUE (apn, county)
);

CREATE INDEX IF NOT EXISTS idx_parcels_apn ON parcels (apn);

CREATE TABLE IF NOT EXISTS dominion_heat_scores (
    id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    apn              text NOT NULL,
    county           text NOT NULL DEFAULT 'maricopa',
    prowler_id       uuid DEFAULT gen_random_uuid(),
    heat_score       integer NOT NULL CHECK (heat_score >= 0 AND heat_score <= 100),
    tags             jsonb DEFAULT '[]'::jsonb,
    breakdown        jsonb DEFAULT '{}'::jsonb,
    ghost_mode_used  boolean DEFAULT false,
    scored_at        timestamptz DEFAULT now(),
    expires_at       timestamptz DEFAULT now() + interval '30 days',
    CONSTRAINT fk_heat_apn FOREIGN KEY (apn, county)
        REFERENCES parcels (apn, county) ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_heat_scores_apn ON dominion_heat_scores (apn);
CREATE INDEX IF NOT EXISTS idx_heat_scores_score ON dominion_heat_scores (heat_score DESC);
CREATE INDEX IF NOT EXISTS idx_heat_scores_scored ON dominion_heat_scores (scored_at DESC);


-- ── 2. Push tracking table — tracks every Dominion→Sentinel push ────────────

CREATE TABLE IF NOT EXISTS ranger_pushes (
    id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    apn                 text NOT NULL,
    county              text NOT NULL DEFAULT 'maricopa',
    prowler_id          uuid NOT NULL,
    heat_score          integer NOT NULL,
    payload             jsonb NOT NULL,
    pg_net_request_id   bigint,
    sentinel_url        text NOT NULL,
    status              text NOT NULL DEFAULT 'sent',
    error_message       text,
    pushed_at           timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ranger_pushes_apn ON ranger_pushes (apn);
CREATE INDEX IF NOT EXISTS idx_ranger_pushes_status ON ranger_pushes (status);
CREATE INDEX IF NOT EXISTS idx_ranger_pushes_pushed ON ranger_pushes (pushed_at DESC);


-- ── 3. Audit log (Dominion side) — append-only ─────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    action          text NOT NULL,
    entity_type     text NOT NULL,
    entity_id       text NOT NULL,
    actor           text DEFAULT 'system',
    payload         jsonb DEFAULT '{}'::jsonb,
    ip_address      text,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log (action);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log (created_at DESC);


-- ══════════════════════════════════════════════════════════════════════════════
-- 4. THE FUNCTION
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Usage:
--   SELECT push_to_sentinel('123-45-678');
--   SELECT push_to_sentinel('123-45-678', 'https://sentinel.yoursite.com/api/ranger-push');
--
-- Returns jsonb with success status, IDs, and score.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION push_to_sentinel(
    p_apn           text,
    p_sentinel_url  text DEFAULT 'http://localhost:3000/api/ranger-push'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_parcel        record;
    v_score         record;
    v_payload       jsonb;
    v_prowler_id    uuid;
    v_push_id       uuid;
    v_request_id    bigint;
    v_pushed_at     timestamptz := now();
BEGIN

    -- ────────────────────────────────────────────────────────────────────
    -- STEP 1: Look up the parcel by APN
    -- ────────────────────────────────────────────────────────────────────

    SELECT *
      INTO v_parcel
      FROM parcels
     WHERE apn = p_apn
     ORDER BY updated_at DESC
     LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION '[RangerPush] Parcel not found for APN: %', p_apn
            USING HINT = 'Verify the APN exists in the parcels table.';
    END IF;

    -- ────────────────────────────────────────────────────────────────────
    -- STEP 2: Pull the highest qualifying heat score (>= 75)
    -- ────────────────────────────────────────────────────────────────────

    SELECT *
      INTO v_score
      FROM dominion_heat_scores
     WHERE apn = p_apn
       AND heat_score >= 75
       AND (expires_at IS NULL OR expires_at > now())
     ORDER BY heat_score DESC, scored_at DESC
     LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION '[RangerPush] No qualifying heat score (>= 75) found for APN: %', p_apn
            USING HINT = 'The lead must score >= 75 before it can be pushed to Sentinel.';
    END IF;

    v_prowler_id := COALESCE(v_score.prowler_id, gen_random_uuid());

    -- ────────────────────────────────────────────────────────────────────
    -- STEP 3: Build Charter Section 7 payload
    -- ────────────────────────────────────────────────────────────────────

    v_payload := jsonb_build_object(
        'prowler_id',       v_prowler_id,
        'apn',              v_parcel.apn,
        'heat_score',       v_score.heat_score,
        'tags',             COALESCE(v_score.tags, '[]'::jsonb),
        'breakdown',        COALESCE(v_score.breakdown, '{}'::jsonb),
        'ghost_mode_used',  COALESCE(v_score.ghost_mode_used, false),
        'pushed_at',        v_pushed_at,
        'audit_url',        format(
                                'https://dominion.app/audit/parcels/%s/pushes/%s',
                                p_apn,
                                v_prowler_id
                            ),
        'address',          v_parcel.address,
        'owner_name',       v_parcel.owner_name,
        'county',           v_parcel.county
    );

    RAISE NOTICE '🚀 RANGER PUSH PAYLOAD BUILT — APN: %, Score: %, Prowler: %',
        p_apn, v_score.heat_score, v_prowler_id;

    -- ────────────────────────────────────────────────────────────────────
    -- STEP 4: POST to Sentinel API via pg_net
    -- ────────────────────────────────────────────────────────────────────
    -- pg_net is async: returns a request ID immediately.
    -- The actual HTTP response lands in net._http_response.
    -- If pg_net is unavailable, this block catches the error and
    -- falls back to logging only (MVP mode).
    -- ────────────────────────────────────────────────────────────────────

    BEGIN
        SELECT net.http_post(
            url     := p_sentinel_url,
            headers := '{"Content-Type": "application/json"}'::jsonb,
            body    := v_payload
        ) INTO v_request_id;

        RAISE NOTICE '📡 HTTP POST queued — pg_net request ID: %', v_request_id;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '⚠️  pg_net unavailable — payload logged but HTTP POST skipped. Error: %', SQLERRM;
        v_request_id := NULL;
    END;

    -- ────────────────────────────────────────────────────────────────────
    -- STEP 5: Insert into leads table (Sentinel schema)
    -- Upserts: if a prospect-status lead already exists for this
    -- property, update it; otherwise create a new one.
    -- ────────────────────────────────────────────────────────────────────

    -- Find property ID from Sentinel's properties table (it may have
    -- been created by a prior ingest or by the Sentinel API handling
    -- this same push). If it doesn't exist yet, we create the lead
    -- after Sentinel processes the HTTP push. For now, insert into
    -- the local ranger_pushes tracker.
    -- ────────────────────────────────────────────────────────────────────

    v_push_id := gen_random_uuid();

    INSERT INTO ranger_pushes (
        id, apn, county, prowler_id, heat_score,
        payload, pg_net_request_id, sentinel_url, status, pushed_at
    ) VALUES (
        v_push_id,
        p_apn,
        v_parcel.county,
        v_prowler_id,
        v_score.heat_score,
        v_payload,
        v_request_id,
        p_sentinel_url,
        CASE WHEN v_request_id IS NOT NULL THEN 'sent' ELSE 'logged_only' END,
        v_pushed_at
    );

    -- ────────────────────────────────────────────────────────────────────
    -- STEP 6: Append-only audit trail
    -- ────────────────────────────────────────────────────────────────────

    INSERT INTO audit_log (
        action, entity_type, entity_id, actor, payload, created_at
    ) VALUES (
        'ranger_push.sent',
        'parcel',
        p_apn,
        'dominion_system',
        jsonb_build_object(
            'push_id',          v_push_id,
            'prowler_id',       v_prowler_id,
            'heat_score',       v_score.heat_score,
            'sentinel_url',     p_sentinel_url,
            'pg_net_request_id', v_request_id,
            'ghost_mode_used',  COALESCE(v_score.ghost_mode_used, false),
            'tags',             COALESCE(v_score.tags, '[]'::jsonb)
        ),
        v_pushed_at
    );

    RAISE NOTICE '✅ RANGER PUSH COMPLETE — APN: %, Push ID: %, Request ID: %',
        p_apn, v_push_id, v_request_id;

    -- ────────────────────────────────────────────────────────────────────
    -- STEP 7: Return success
    -- ────────────────────────────────────────────────────────────────────

    RETURN jsonb_build_object(
        'success',              true,
        'apn',                  p_apn,
        'county',               v_parcel.county,
        'heat_score',           v_score.heat_score,
        'prowler_id',           v_prowler_id,
        'push_id',              v_push_id,
        'pg_net_request_id',    v_request_id,
        'sentinel_url',         p_sentinel_url,
        'pushed_at',            v_pushed_at
    );

END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- 5. HELPER: Check push delivery status (reads pg_net response table)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION check_push_status(p_request_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net
AS $$
DECLARE
    v_response record;
BEGIN
    SELECT *
      INTO v_response
      FROM net._http_response
     WHERE id = p_request_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'status', 'pending',
            'request_id', p_request_id,
            'message', 'Response not yet received — pg_net is async'
        );
    END IF;

    -- Update ranger_pushes with the result
    UPDATE ranger_pushes
       SET status = CASE
               WHEN v_response.status_code BETWEEN 200 AND 299 THEN 'delivered'
               ELSE 'failed'
           END,
           error_message = CASE
               WHEN v_response.status_code BETWEEN 200 AND 299 THEN NULL
               ELSE format('HTTP %s: %s', v_response.status_code, left(v_response.content::text, 500))
           END
     WHERE pg_net_request_id = p_request_id;

    RETURN jsonb_build_object(
        'status',       CASE WHEN v_response.status_code BETWEEN 200 AND 299 THEN 'delivered' ELSE 'failed' END,
        'request_id',   p_request_id,
        'http_status',  v_response.status_code,
        'response',     v_response.content::jsonb
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'status', 'error',
        'request_id', p_request_id,
        'message', SQLERRM
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- 6. BATCH PUSH: Push all qualifying leads above threshold
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION push_all_qualifying(
    p_min_score     integer DEFAULT 75,
    p_sentinel_url  text DEFAULT 'http://localhost:3000/api/ranger-push',
    p_limit         integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_apn       text;
    v_results   jsonb := '[]'::jsonb;
    v_result    jsonb;
    v_count     integer := 0;
    v_errors    integer := 0;
BEGIN
    FOR v_apn IN
        SELECT DISTINCT dhs.apn
          FROM dominion_heat_scores dhs
          JOIN parcels p ON p.apn = dhs.apn AND p.county = dhs.county
         WHERE dhs.heat_score >= p_min_score
           AND (dhs.expires_at IS NULL OR dhs.expires_at > now())
           AND NOT EXISTS (
               SELECT 1 FROM ranger_pushes rp
                WHERE rp.apn = dhs.apn
                  AND rp.status IN ('sent', 'delivered')
                  AND rp.pushed_at > now() - interval '24 hours'
           )
         ORDER BY dhs.heat_score DESC
         LIMIT p_limit
    LOOP
        BEGIN
            v_result := push_to_sentinel(v_apn, p_sentinel_url);
            v_results := v_results || jsonb_build_array(v_result);
            v_count := v_count + 1;
        EXCEPTION WHEN OTHERS THEN
            v_errors := v_errors + 1;
            v_results := v_results || jsonb_build_array(
                jsonb_build_object('apn', v_apn, 'success', false, 'error', SQLERRM)
            );
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'success',      true,
        'pushed',       v_count,
        'errors',       v_errors,
        'min_score',    p_min_score,
        'results',      v_results,
        'completed_at', now()
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- 7. GRANT PERMISSIONS
-- ══════════════════════════════════════════════════════════════════════════════

GRANT EXECUTE ON FUNCTION push_to_sentinel(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION check_push_status(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION push_all_qualifying(integer, text, integer) TO service_role;

-- Allow authenticated users (agents/admins) to call the push function
GRANT EXECUTE ON FUNCTION push_to_sentinel(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION push_all_qualifying(integer, text, integer) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- 8. QUICK TEST (uncomment to run)
-- ══════════════════════════════════════════════════════════════════════════════

-- Insert test parcel:
--
-- INSERT INTO parcels (apn, county, address, owner_name)
-- VALUES ('999-88-777', 'maricopa', '1423 Oak Valley Dr, Phoenix AZ 85001', 'Margaret Henderson')
-- ON CONFLICT (apn, county) DO NOTHING;
--
-- Insert test heat score:
--
-- INSERT INTO dominion_heat_scores (apn, county, heat_score, tags, breakdown)
-- VALUES (
--     '999-88-777',
--     'maricopa',
--     94,
--     '["probate", "vacant"]'::jsonb,
--     '{"motivation": 88, "deal": 76, "severity_multiplier": 1.4, "stacking_bonus": 12, "owner_factor": 8, "equity_factor": 15, "ai_boost": 10}'::jsonb
-- );
--
-- Push it:
--
-- SELECT push_to_sentinel('999-88-777');
--
-- Check delivery:
--
-- SELECT * FROM ranger_pushes ORDER BY pushed_at DESC LIMIT 5;
-- SELECT check_push_status( (SELECT pg_net_request_id FROM ranger_pushes ORDER BY pushed_at DESC LIMIT 1) );
--
-- Batch push all >= 80:
--
-- SELECT push_all_qualifying(80);
