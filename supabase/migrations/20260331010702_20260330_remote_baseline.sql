-- Sentinel local bootstrap baseline.
-- Replaces the previous marker-only baseline so local Supabase can build the full schema from scratch.
-- Remote production already has this migration version recorded, so changing this file only affects fresh/local environments.

CREATE SCHEMA IF NOT EXISTS "extensions";
CREATE EXTENSION IF NOT EXISTS moddatetime WITH SCHEMA "extensions";




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."ad_action_status" AS ENUM (
    'suggested',
    'approved',
    'applied',
    'rejected'
);


ALTER TYPE "public"."ad_action_status" OWNER TO "postgres";


CREATE TYPE "public"."ad_action_type" AS ENUM (
    'bid_adjust',
    'pause_keyword',
    'enable_keyword',
    'update_copy',
    'add_keyword',
    'budget_adjust',
    'pause_ad',
    'enable_ad'
);


ALTER TYPE "public"."ad_action_type" OWNER TO "postgres";


CREATE TYPE "public"."ad_review_type" AS ENUM (
    'copy',
    'performance',
    'landing_page',
    'strategy'
);


ALTER TYPE "public"."ad_review_type" OWNER TO "postgres";


CREATE TYPE "public"."ads_approval_decision" AS ENUM (
    'approved',
    'rejected',
    'deferred'
);


ALTER TYPE "public"."ads_approval_decision" OWNER TO "postgres";


CREATE TYPE "public"."ads_market" AS ENUM (
    'spokane',
    'kootenai'
);


ALTER TYPE "public"."ads_market" OWNER TO "postgres";


CREATE TYPE "public"."ads_recommendation_status" AS ENUM (
    'pending',
    'approved',
    'testing',
    'ignored',
    'implemented',
    'expired',
    'executed'
);


ALTER TYPE "public"."ads_recommendation_status" OWNER TO "postgres";


CREATE TYPE "public"."ads_risk_level" AS ENUM (
    'green',
    'yellow',
    'red'
);


ALTER TYPE "public"."ads_risk_level" OWNER TO "postgres";


CREATE TYPE "public"."ads_seller_situation" AS ENUM (
    'inherited',
    'probate',
    'tired_landlord',
    'tenant_issues',
    'major_repairs',
    'foundation_mold_damage',
    'divorce',
    'foreclosure',
    'relocation',
    'vacant_property',
    'low_intent',
    'unknown'
);


ALTER TYPE "public"."ads_seller_situation" OWNER TO "postgres";


CREATE TYPE "public"."deal_status" AS ENUM (
    'draft',
    'negotiating',
    'under_contract',
    'assigned',
    'closed',
    'dead'
);


ALTER TYPE "public"."deal_status" OWNER TO "postgres";


CREATE TYPE "public"."distress_type" AS ENUM (
    'probate',
    'pre_foreclosure',
    'tax_lien',
    'code_violation',
    'vacant',
    'divorce',
    'bankruptcy',
    'fsbo',
    'absentee',
    'inherited',
    'water_shutoff',
    'condemned'
);


ALTER TYPE "public"."distress_type" OWNER TO "postgres";


CREATE TYPE "public"."lead_status" AS ENUM (
    'staging',
    'prospect',
    'lead',
    'negotiation',
    'disposition',
    'nurture',
    'dead',
    'closed',
    'My Leads'
);


ALTER TYPE "public"."lead_status" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'admin',
    'agent',
    'viewer'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."append_live_note"("p_call_log_id" "uuid", "p_note" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE calls_log
  SET live_notes = COALESCE(live_notes, '[]'::jsonb) || to_jsonb(p_note)
  WHERE id = p_call_log_id;
END;
$$;


ALTER FUNCTION "public"."append_live_note"("p_call_log_id" "uuid", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_dominion_heat_score"("p_apn" "text") RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_score integer := 0;
  v_breakdown jsonb := '{}'::jsonb;
  rec record;
BEGIN
  -- Get all signals for this APN
  FOR rec IN 
    SELECT signal_type, event_date 
    FROM distress_signals 
    WHERE apn = p_apn 
    ORDER BY event_date DESC
  LOOP
    CASE rec.signal_type
      WHEN 'pre_probate' THEN 
        v_score := v_score + 50; 
        v_breakdown := v_breakdown || jsonb_build_object('pre_probate', 50);
      WHEN 'probate' THEN 
        v_score := v_score + 40; 
        v_breakdown := v_breakdown || jsonb_build_object('probate', 40);
      WHEN 'trustee_sale' THEN 
        v_score := v_score + 42; 
        v_breakdown := v_breakdown || jsonb_build_object('trustee_sale', 42);
      WHEN 'lis_pendens' THEN 
        v_score := v_score + 38; 
        v_breakdown := v_breakdown || jsonb_build_object('lis_pendens', 38);
      WHEN 'water_shutoff' THEN 
        v_score := v_score + 35; 
        v_breakdown := v_breakdown || jsonb_build_object('water_shutoff', 35);
      WHEN 'judgment_lien' THEN 
        v_score := v_score + 35; 
        v_breakdown := v_breakdown || jsonb_build_object('judgment_lien', 35);
      WHEN 'mechanic_lien' THEN 
        v_score := v_score + 32; 
        v_breakdown := v_breakdown || jsonb_build_object('mechanic_lien', 32);
      WHEN 'tax_delinquent' THEN 
        v_score := v_score + 30; 
        v_breakdown := v_breakdown || jsonb_build_object('tax_delinquent', 30);
      WHEN 'absentee_high_equity' THEN 
        v_score := v_score + 25; 
        v_breakdown := v_breakdown || jsonb_build_object('absentee_high_equity', 25);
      WHEN 'code_violation' THEN 
        v_score := v_score + 20; 
        v_breakdown := v_breakdown || jsonb_build_object('code_violation', 20);
      -- Add any new signal type here later — auto-included
    END CASE;
  END LOOP;

  -- Cap at 100 and apply stale decay (–1 point per day over 90 days)
  v_score := LEAST(v_score, 100);
  -- (full decay logic in next version once we have dates)

  -- Save the score
  INSERT INTO dominion_heat_scores (apn, score, breakdown, calculated_at)
  VALUES (p_apn, v_score, v_breakdown, now())
  ON CONFLICT (apn) 
  DO UPDATE SET score = v_score, breakdown = v_breakdown, calculated_at = now();

  RETURN v_score;
END;
$$;


ALTER FUNCTION "public"."calculate_dominion_heat_score"("p_apn" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_push_status"("p_request_id" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'net'
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


ALTER FUNCTION "public"."check_push_status"("p_request_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."count_leads_missing_phone_rows"() RETURNS bigint
    LANGUAGE "sql" STABLE
    AS $$
  SELECT COUNT(*)
  FROM leads l
  JOIN properties p ON l.property_id = p.id
  WHERE l.status IN ('lead', 'negotiation', 'disposition', 'prospect')
    AND p.owner_phone IS NOT NULL
    AND p.owner_phone != ''
    AND NOT EXISTS (
      SELECT 1 FROM lead_phones lp WHERE lp.lead_id = l.id
    );
$$;


ALTER FUNCTION "public"."count_leads_missing_phone_rows"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_customer_file"("p_lead_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_property_id UUID;
  v_other_leads INT;
  v_property_deleted BOOLEAN := FALSE;
BEGIN
  -- Step 1: Look up the lead's property_id
  SELECT property_id INTO v_property_id
  FROM leads
  WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lead not found');
  END IF;

  -- Step 2: Clean up append-only tables that reference this lead directly
  -- These have prevent_mutation() triggers, so disable them temporarily
  ALTER TABLE event_log DISABLE TRIGGER trg_event_log_immutable;
  DELETE FROM event_log WHERE entity_type = 'lead' AND entity_id = p_lead_id::text;
  ALTER TABLE event_log ENABLE TRIGGER trg_event_log_immutable;

  -- Step 3: Delete the lead (FK cascades handle deals, calls_log, tasks, etc.)
  DELETE FROM leads WHERE id = p_lead_id;

  -- Step 4: Check if the property is orphaned (no other leads reference it)
  IF v_property_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_other_leads
    FROM leads
    WHERE property_id = v_property_id;

    IF v_other_leads = 0 THEN
      -- Delete from append-only tables that reference property
      ALTER TABLE distress_events DISABLE TRIGGER trg_distress_events_immutable;
      DELETE FROM distress_events WHERE property_id = v_property_id;
      ALTER TABLE distress_events ENABLE TRIGGER trg_distress_events_immutable;

      ALTER TABLE scoring_records DISABLE TRIGGER trg_scoring_records_immutable;
      DELETE FROM scoring_records WHERE property_id = v_property_id;
      ALTER TABLE scoring_records ENABLE TRIGGER trg_scoring_records_immutable;

      -- Delete scoring_predictions (no_delete rule already dropped)
      DELETE FROM scoring_predictions WHERE property_id = v_property_id;

      -- Now delete the property
      DELETE FROM properties WHERE id = v_property_id;

      v_property_deleted := TRUE;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'property_deleted', v_property_deleted
  );
END;
$$;


ALTER FUNCTION "public"."delete_customer_file"("p_lead_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dialer_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."dialer_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_call_session_transition"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Only evaluate when status is actually changing
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Terminal states: no outbound transitions allowed
  IF OLD.status IN ('ended', 'failed') THEN
    RAISE EXCEPTION
      'call_sessions: cannot transition from terminal status "%"',
      OLD.status
      USING ERRCODE = '23514'; -- check_violation
  END IF;

  -- Valid transition table
  IF NOT (
    (OLD.status = 'initiating' AND NEW.status IN ('ringing', 'connected', 'failed')) OR
    (OLD.status = 'ringing'    AND NEW.status IN ('connected', 'ended', 'failed')) OR
    (OLD.status = 'connected'  AND NEW.status IN ('ended', 'failed'))
  ) THEN
    RAISE EXCEPTION
      'call_sessions: invalid status transition "%" → "%"',
      OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_call_session_transition"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_role"() RETURNS "public"."user_role"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."get_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_lead_call_counters"("p_lead_id" "uuid", "p_is_live_answer" boolean, "p_is_voicemail" boolean, "p_last_contact_at" timestamp with time zone) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE leads SET
    total_calls = COALESCE(total_calls, 0) + 1,
    live_answers = COALESCE(live_answers, 0) + CASE WHEN p_is_live_answer THEN 1 ELSE 0 END,
    voicemails_left = COALESCE(voicemails_left, 0) + CASE WHEN p_is_voicemail THEN 1 ELSE 0 END,
    last_contact_at = p_last_contact_at
  WHERE id = p_lead_id;
END;
$$;


ALTER FUNCTION "public"."increment_lead_call_counters"("p_lead_id" "uuid", "p_is_live_answer" boolean, "p_is_voicemail" boolean, "p_last_contact_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_lead_call_counters"("p_lead_id" "uuid", "p_is_live" boolean DEFAULT false, "p_is_voicemail" boolean DEFAULT false, "p_last_contact_at" timestamp with time zone DEFAULT "now"(), "p_call_sequence_step" integer DEFAULT NULL::integer, "p_next_call_scheduled_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_clear_sequence" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_result JSONB;
BEGIN
  UPDATE leads
  SET
    total_calls = COALESCE(total_calls, 0) + 1,
    live_answers = COALESCE(live_answers, 0) + CASE WHEN p_is_live THEN 1 ELSE 0 END,
    voicemails_left = COALESCE(voicemails_left, 0) + CASE WHEN p_is_voicemail THEN 1 ELSE 0 END,
    last_contact_at = p_last_contact_at,
    call_sequence_step = CASE
      WHEN p_clear_sequence THEN 1
      WHEN p_call_sequence_step IS NOT NULL THEN p_call_sequence_step
      ELSE call_sequence_step
    END,
    next_call_scheduled_at = CASE
      WHEN p_clear_sequence THEN NULL
      WHEN p_next_call_scheduled_at IS NOT NULL THEN p_next_call_scheduled_at
      ELSE next_call_scheduled_at
    END,
    updated_at = NOW()
  WHERE id = p_lead_id
  RETURNING jsonb_build_object(
    'total_calls', total_calls,
    'live_answers', live_answers,
    'voicemails_left', voicemails_left,
    'last_contact_at', last_contact_at,
    'call_sequence_step', call_sequence_step,
    'next_call_scheduled_at', next_call_scheduled_at,
    'status', status,
    'lock_version', lock_version
  ) INTO v_result;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Lead not found: %', p_lead_id;
  END IF;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."increment_lead_call_counters"("p_lead_id" "uuid", "p_is_live" boolean, "p_is_voicemail" boolean, "p_last_contact_at" timestamp with time zone, "p_call_sequence_step" integer, "p_next_call_scheduled_at" timestamp with time zone, "p_clear_sequence" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_lead_phone_call_count"("p_lead_id" "uuid", "p_phone_suffix" "text") RETURNS "void"
    LANGUAGE "sql"
    AS $$
  UPDATE lead_phones
  SET call_count = call_count + 1,
      last_called_at = now(),
      updated_at = now()
  WHERE lead_id = p_lead_id
    AND phone LIKE '%' || p_phone_suffix;
$$;


ALTER FUNCTION "public"."increment_lead_phone_call_count"("p_lead_id" "uuid", "p_phone_suffix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT get_user_role() = 'admin';
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RAISE EXCEPTION 'This table is append-only. % operations are not allowed.', TG_OP;
END;
$$;


ALTER FUNCTION "public"."prevent_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."push_all_qualifying"("p_min_score" integer DEFAULT 75, "p_sentinel_url" "text" DEFAULT 'http://localhost:3000/api/ranger-push'::"text", "p_limit" integer DEFAULT 50) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
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


ALTER FUNCTION "public"."push_all_qualifying"("p_min_score" integer, "p_sentinel_url" "text", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."push_to_sentinel"("p_apn" "text", "p_sentinel_url" "text" DEFAULT 'http://localhost:3000/api/ranger-push'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
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


ALTER FUNCTION "public"."push_to_sentinel"("p_apn" "text", "p_sentinel_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_entered_dispo_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.entered_dispo_at IS NULL THEN
    NEW.entered_dispo_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_entered_dispo_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_eval_ratings_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_eval_ratings_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_lead_contradiction_flags_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_lead_contradiction_flags_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."ad_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "review_id" "uuid",
    "action_type" "public"."ad_action_type" NOT NULL,
    "target_entity" character varying(50) NOT NULL,
    "target_id" character varying(100) NOT NULL,
    "old_value" "text",
    "new_value" "text",
    "status" "public"."ad_action_status" DEFAULT 'suggested'::"public"."ad_action_status" NOT NULL,
    "applied_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ad_actions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ad_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "snapshot_date" timestamp with time zone NOT NULL,
    "review_type" "public"."ad_review_type" NOT NULL,
    "summary" "text" NOT NULL,
    "findings" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "suggestions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "ai_engine" character varying(20) NOT NULL,
    "model_used" character varying(50),
    "tokens_used" integer,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "adversarial_review" "jsonb"
);


ALTER TABLE "public"."ad_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ad_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" character varying(50) NOT NULL,
    "campaign_name" character varying(255) NOT NULL,
    "ad_group_id" character varying(50),
    "ad_group_name" character varying(255),
    "ad_id" character varying(50),
    "headline1" "text",
    "headline2" "text",
    "headline3" "text",
    "description1" "text",
    "description2" "text",
    "impressions" integer DEFAULT 0 NOT NULL,
    "clicks" integer DEFAULT 0 NOT NULL,
    "ctr" numeric(8,4),
    "avg_cpc" numeric(10,2),
    "conversions" numeric(10,2) DEFAULT 0,
    "cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "roas" numeric(10,2),
    "quality_score" integer,
    "snapshot_date" timestamp with time zone NOT NULL,
    "raw_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ad_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ads_ad_groups" (
    "id" bigint NOT NULL,
    "google_ad_group_id" "text" NOT NULL,
    "campaign_id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "status" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ads_ad_groups" OWNER TO "postgres";


ALTER TABLE "public"."ads_ad_groups" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ads_ad_groups_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ads_ads" (
    "id" bigint NOT NULL,
    "google_ad_id" "text" NOT NULL,
    "ad_group_id" bigint,
    "campaign_id" bigint,
    "headlines" "jsonb",
    "descriptions" "jsonb",
    "status" "text",
    "impressions" bigint DEFAULT 0,
    "clicks" bigint DEFAULT 0,
    "cost_micros" bigint DEFAULT 0,
    "conversions" double precision DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ads_ads" OWNER TO "postgres";


ALTER TABLE "public"."ads_ads" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ads_ads_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ads_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "briefing_id" "uuid",
    "severity" "text" NOT NULL,
    "message" "text" NOT NULL,
    "read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ads_alerts_severity_check" CHECK (("severity" = ANY (ARRAY['info'::"text", 'warning'::"text", 'critical'::"text"])))
);


ALTER TABLE "public"."ads_alerts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ads_approvals" (
    "id" bigint NOT NULL,
    "recommendation_id" bigint NOT NULL,
    "decision" "public"."ads_approval_decision" NOT NULL,
    "decided_by" "uuid" NOT NULL,
    "reason" "text",
    "decided_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ads_approvals" OWNER TO "postgres";


ALTER TABLE "public"."ads_approvals" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ads_approvals_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ads_campaign_budgets" (
    "id" integer NOT NULL,
    "campaign_id" integer NOT NULL,
    "google_budget_id" "text" NOT NULL,
    "daily_budget_micros" bigint DEFAULT 0 NOT NULL,
    "delivery_method" "text" DEFAULT 'STANDARD'::"text",
    "is_shared" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ads_campaign_budgets" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."ads_campaign_budgets_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."ads_campaign_budgets_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."ads_campaign_budgets_id_seq" OWNED BY "public"."ads_campaign_budgets"."id";



CREATE TABLE IF NOT EXISTS "public"."ads_campaigns" (
    "id" bigint NOT NULL,
    "google_campaign_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "market" "public"."ads_market" NOT NULL,
    "status" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "campaign_type" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "search_impression_share" double precision,
    "search_top_impression_pct" double precision,
    "search_abs_top_impression_pct" double precision
);


ALTER TABLE "public"."ads_campaigns" OWNER TO "postgres";


ALTER TABLE "public"."ads_campaigns" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ads_campaigns_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ads_conversion_actions" (
    "id" integer NOT NULL,
    "google_conversion_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "type" "text",
    "status" "text",
    "counting_type" "text",
    "category" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ads_conversion_actions" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."ads_conversion_actions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."ads_conversion_actions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."ads_conversion_actions_id_seq" OWNED BY "public"."ads_conversion_actions"."id";



CREATE TABLE IF NOT EXISTS "public"."ads_daily_metrics" (
    "id" bigint NOT NULL,
    "report_date" "date" NOT NULL,
    "campaign_id" bigint,
    "ad_group_id" bigint,
    "keyword_id" bigint,
    "market" "public"."ads_market",
    "impressions" integer DEFAULT 0 NOT NULL,
    "clicks" integer DEFAULT 0 NOT NULL,
    "cost_micros" bigint DEFAULT 0 NOT NULL,
    "conversions" numeric(10,2) DEFAULT 0 NOT NULL,
    "conversion_value_micros" bigint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ads_daily_metrics" OWNER TO "postgres";


ALTER TABLE "public"."ads_daily_metrics" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ads_daily_metrics_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ads_device_metrics" (
    "id" integer NOT NULL,
    "campaign_id" integer,
    "device" "text" NOT NULL,
    "report_date" "date" NOT NULL,
    "impressions" integer DEFAULT 0 NOT NULL,
    "clicks" integer DEFAULT 0 NOT NULL,
    "cost_micros" bigint DEFAULT 0 NOT NULL,
    "conversions" numeric(12,2) DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."ads_device_metrics" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."ads_device_metrics_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."ads_device_metrics_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."ads_device_metrics_id_seq" OWNED BY "public"."ads_device_metrics"."id";



CREATE TABLE IF NOT EXISTS "public"."ads_geo_metrics" (
    "id" integer NOT NULL,
    "campaign_id" integer,
    "geo_name" "text" NOT NULL,
    "geo_type" "text" DEFAULT 'city'::"text" NOT NULL,
    "report_date" "date" NOT NULL,
    "impressions" integer DEFAULT 0 NOT NULL,
    "clicks" integer DEFAULT 0 NOT NULL,
    "cost_micros" bigint DEFAULT 0 NOT NULL,
    "conversions" numeric(12,2) DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."ads_geo_metrics" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."ads_geo_metrics_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."ads_geo_metrics_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."ads_geo_metrics_id_seq" OWNED BY "public"."ads_geo_metrics"."id";



CREATE TABLE IF NOT EXISTS "public"."ads_implementation_logs" (
    "id" bigint NOT NULL,
    "recommendation_id" bigint,
    "approval_id" bigint,
    "action_taken" "text" NOT NULL,
    "result" "text",
    "implemented_by" "uuid" NOT NULL,
    "implemented_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text"
);


ALTER TABLE "public"."ads_implementation_logs" OWNER TO "postgres";


ALTER TABLE "public"."ads_implementation_logs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ads_implementation_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ads_intelligence_briefings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "briefing_date" "date" NOT NULL,
    "account_status" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "executive_summary" "text",
    "total_estimated_monthly_waste" numeric(12,2) DEFAULT 0,
    "total_estimated_monthly_opportunity" numeric(12,2) DEFAULT 0,
    "data_points" "jsonb" DEFAULT '[]'::"jsonb",
    "adversarial_result" "jsonb",
    "trigger" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ads_intelligence_briefings_trigger_check" CHECK (("trigger" = ANY (ARRAY['manual'::"text", 'daily_cron'::"text", 'weekly_cron'::"text"])))
);


ALTER TABLE "public"."ads_intelligence_briefings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ads_keywords" (
    "id" bigint NOT NULL,
    "google_keyword_id" "text" NOT NULL,
    "ad_group_id" bigint NOT NULL,
    "text" "text" NOT NULL,
    "match_type" "text" NOT NULL,
    "status" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "seller_situation" "public"."ads_seller_situation",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "quality_score" integer,
    "expected_ctr" "text",
    "ad_relevance" "text",
    "landing_page_experience" "text"
);


ALTER TABLE "public"."ads_keywords" OWNER TO "postgres";


ALTER TABLE "public"."ads_keywords" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ads_keywords_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ads_lead_attribution" (
    "id" bigint NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "gclid" "text",
    "campaign_id" bigint,
    "ad_group_id" bigint,
    "keyword_id" bigint,
    "search_term_id" bigint,
    "landing_page" "text",
    "landing_domain" "text",
    "source_channel" "text" DEFAULT 'google_ads'::"text" NOT NULL,
    "market" "public"."ads_market",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ads_lead_attribution" OWNER TO "postgres";


ALTER TABLE "public"."ads_lead_attribution" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ads_lead_attribution_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ads_negative_keywords" (
    "id" integer NOT NULL,
    "campaign_id" integer,
    "ad_group_id" integer,
    "google_criterion_id" "text" NOT NULL,
    "keyword_text" "text" NOT NULL,
    "match_type" "text" DEFAULT 'BROAD'::"text" NOT NULL,
    "level" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ads_negative_keywords_level_check" CHECK (("level" = ANY (ARRAY['campaign'::"text", 'ad_group'::"text"])))
);


ALTER TABLE "public"."ads_negative_keywords" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."ads_negative_keywords_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."ads_negative_keywords_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."ads_negative_keywords_id_seq" OWNED BY "public"."ads_negative_keywords"."id";



CREATE TABLE IF NOT EXISTS "public"."ads_recommendations" (
    "id" bigint NOT NULL,
    "recommendation_type" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "expected_impact" "text",
    "risk_level" "public"."ads_risk_level" NOT NULL,
    "approval_required" boolean DEFAULT true NOT NULL,
    "status" "public"."ads_recommendation_status" DEFAULT 'pending'::"public"."ads_recommendation_status" NOT NULL,
    "market" "public"."ads_market",
    "seller_situation" "public"."ads_seller_situation",
    "related_campaign_id" bigint,
    "related_ad_group_id" bigint,
    "related_keyword_id" bigint,
    "related_search_term_id" bigint,
    "related_lead_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_briefing_id" "uuid"
);


ALTER TABLE "public"."ads_recommendations" OWNER TO "postgres";


ALTER TABLE "public"."ads_recommendations" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ads_recommendations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ads_search_terms" (
    "id" bigint NOT NULL,
    "search_term" "text" NOT NULL,
    "campaign_id" bigint,
    "ad_group_id" bigint,
    "keyword_id" bigint,
    "market" "public"."ads_market",
    "seller_situation" "public"."ads_seller_situation",
    "intent_label" "text",
    "impressions" integer DEFAULT 0 NOT NULL,
    "clicks" integer DEFAULT 0 NOT NULL,
    "cost_micros" bigint DEFAULT 0 NOT NULL,
    "conversions" numeric(10,2) DEFAULT 0 NOT NULL,
    "conversion_value_micros" bigint DEFAULT 0 NOT NULL,
    "is_waste" boolean DEFAULT false,
    "is_opportunity" boolean DEFAULT false,
    "first_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ads_search_terms" OWNER TO "postgres";


ALTER TABLE "public"."ads_search_terms" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ads_search_terms_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ads_sync_logs" (
    "id" bigint NOT NULL,
    "sync_type" "text" NOT NULL,
    "status" "text" NOT NULL,
    "records_fetched" integer DEFAULT 0,
    "records_upserted" integer DEFAULT 0,
    "date_range_start" "date",
    "date_range_end" "date",
    "error_message" "text",
    "duration_ms" integer,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone
);


ALTER TABLE "public"."ads_sync_logs" OWNER TO "postgres";


ALTER TABLE "public"."ads_sync_logs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ads_sync_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ads_system_prompts" (
    "id" integer NOT NULL,
    "prompt_key" "text" DEFAULT 'default'::"text" NOT NULL,
    "prompt_text" "text" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ads_system_prompts" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."ads_system_prompts_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."ads_system_prompts_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."ads_system_prompts_id_seq" OWNED BY "public"."ads_system_prompts"."id";



CREATE TABLE IF NOT EXISTS "public"."agent_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agent_name" "text" NOT NULL,
    "trigger_type" "text" DEFAULT 'manual'::"text" NOT NULL,
    "trigger_ref" "text",
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "lead_id" "uuid",
    "inputs" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "outputs" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "error" "text",
    "prompt_version" "text",
    "model" "text",
    "input_tokens" integer,
    "output_tokens" integer,
    "cost_cents" integer,
    "duration_ms" integer,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."agent_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" bigint NOT NULL,
    "apn" "text",
    "action" "text" NOT NULL,
    "details" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "entity_type" "text" DEFAULT 'lead'::"text",
    "entity_id" "text" DEFAULT ''::"text",
    "actor" "text" DEFAULT 'system'::"text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb",
    "ip_address" "text",
    "lead_id" "uuid",
    "user_id" "uuid"
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."audit_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."audit_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."audit_log_id_seq" OWNED BY "public"."audit_log"."id";



CREATE TABLE IF NOT EXISTS "public"."buyers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_name" character varying(255),
    "contact_name" character varying(255) NOT NULL,
    "phone" character varying(30),
    "email" character varying(255),
    "preferred_contact_method" character varying(20) DEFAULT 'phone'::character varying,
    "markets" "text"[] DEFAULT '{}'::"text"[],
    "asset_types" "text"[] DEFAULT '{}'::"text"[],
    "price_range_low" integer,
    "price_range_high" integer,
    "funding_type" character varying(30),
    "proof_of_funds" character varying(20) DEFAULT 'not_submitted'::character varying,
    "pof_verified_at" timestamp with time zone,
    "rehab_tolerance" character varying(20),
    "buyer_strategy" character varying(20),
    "occupancy_pref" character varying(20) DEFAULT 'either'::character varying,
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "notes" "text",
    "status" character varying(10) DEFAULT 'active'::character varying,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "buyers_buyer_strategy_check" CHECK ((("buyer_strategy")::"text" = ANY ((ARRAY['flip'::character varying, 'landlord'::character varying, 'developer'::character varying, 'wholesale'::character varying])::"text"[]))),
    CONSTRAINT "buyers_funding_type_check" CHECK ((("funding_type")::"text" = ANY ((ARRAY['cash'::character varying, 'hard_money'::character varying, 'conventional'::character varying, 'private'::character varying])::"text"[]))),
    CONSTRAINT "buyers_occupancy_pref_check" CHECK ((("occupancy_pref")::"text" = ANY ((ARRAY['vacant'::character varying, 'occupied'::character varying, 'either'::character varying])::"text"[]))),
    CONSTRAINT "buyers_preferred_contact_method_check" CHECK ((("preferred_contact_method")::"text" = ANY ((ARRAY['phone'::character varying, 'email'::character varying, 'text'::character varying])::"text"[]))),
    CONSTRAINT "buyers_proof_of_funds_check" CHECK ((("proof_of_funds")::"text" = ANY ((ARRAY['verified'::character varying, 'submitted'::character varying, 'not_submitted'::character varying])::"text"[]))),
    CONSTRAINT "buyers_rehab_tolerance_check" CHECK ((("rehab_tolerance")::"text" = ANY ((ARRAY['none'::character varying, 'light'::character varying, 'moderate'::character varying, 'heavy'::character varying, 'gut'::character varying])::"text"[]))),
    CONSTRAINT "buyers_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['active'::character varying, 'inactive'::character varying])::"text"[])))
);


ALTER TABLE "public"."buyers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."call_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "twilio_sid" character varying(100),
    "phone_dialed" character varying(20) NOT NULL,
    "status" character varying(20) DEFAULT 'initiating'::character varying NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "duration_sec" integer,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "context_snapshot" "jsonb",
    "ai_summary" "text",
    "disposition" character varying(50),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ck_call_sessions_status" CHECK ((("status")::"text" = ANY ((ARRAY['initiating'::character varying, 'ringing'::character varying, 'connected'::character varying, 'ended'::character varying, 'failed'::character varying])::"text"[])))
);


ALTER TABLE "public"."call_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calls_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid",
    "property_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "phone_dialed" "text",
    "twilio_sid" "text",
    "disposition" "text" DEFAULT 'no_answer'::"text" NOT NULL,
    "duration_sec" integer DEFAULT 0,
    "notes" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recording_url" "text",
    "transcription" "text",
    "ai_summary" "text",
    "summary_timestamp" timestamp with time zone,
    "dialer_session_id" "uuid",
    "direction" character varying(10) DEFAULT 'outbound'::character varying,
    "called_at" timestamp with time zone,
    "source" character varying(20) DEFAULT 'dialer'::character varying,
    "metadata" "jsonb",
    "voice_session_id" "uuid"
);


ALTER TABLE "public"."calls_log" OWNER TO "postgres";


COMMENT ON COLUMN "public"."calls_log"."ai_summary" IS 'Grok-generated 3-5 bullet summary of the call';



COMMENT ON COLUMN "public"."calls_log"."direction" IS 'inbound or outbound';



COMMENT ON COLUMN "public"."calls_log"."source" IS 'dialer, vapi, inbound, manual';



COMMENT ON COLUMN "public"."calls_log"."voice_session_id" IS 'FK to voice_sessions for Vapi-originated calls';



CREATE TABLE IF NOT EXISTS "public"."campaign_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "status" character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    "current_touch" integer DEFAULT 0 NOT NULL,
    "last_touch_at" timestamp with time zone,
    "next_touch_at" timestamp with time zone,
    "skip_reason" character varying(50),
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."campaign_leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "campaign_type" character varying(50) NOT NULL,
    "status" character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    "audience_filter" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "template_id" character varying(100),
    "sent_count" integer DEFAULT 0 NOT NULL,
    "open_count" integer DEFAULT 0 NOT NULL,
    "click_count" integer DEFAULT 0 NOT NULL,
    "response_count" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."campaigns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "first_name" character varying(100) NOT NULL,
    "last_name" character varying(100) NOT NULL,
    "phone" character varying(20),
    "email" character varying(255),
    "address" "text",
    "contact_type" character varying(50) DEFAULT 'owner'::character varying NOT NULL,
    "source" character varying(100),
    "dnc_status" boolean DEFAULT false NOT NULL,
    "opt_out" boolean DEFAULT false NOT NULL,
    "litigant_flag" boolean DEFAULT false NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cron_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cron_name" "text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "items_processed" integer DEFAULT 0,
    "items_failed" integer DEFAULT 0,
    "error_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."cron_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_devotional" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "display_date" "date" NOT NULL,
    "verse_ref" "text" NOT NULL,
    "verse_text" "text" NOT NULL,
    "author" "text" NOT NULL,
    "commentary" "text" NOT NULL,
    "source_url" "text" NOT NULL,
    "source_title" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."daily_devotional" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deal_buyers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deal_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "status" character varying(20) DEFAULT 'not_contacted'::character varying,
    "date_contacted" timestamp with time zone,
    "contact_method" character varying(20),
    "response" "text",
    "offer_amount" integer,
    "follow_up_needed" boolean DEFAULT false,
    "follow_up_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "responded_at" timestamp with time zone,
    "selection_reason" "text",
    CONSTRAINT "deal_buyers_contact_method_check" CHECK ((("contact_method" IS NULL) OR (("contact_method")::"text" = ANY ((ARRAY['phone'::character varying, 'email'::character varying, 'text'::character varying])::"text"[])))),
    CONSTRAINT "deal_buyers_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['not_contacted'::character varying, 'queued'::character varying, 'sent'::character varying, 'interested'::character varying, 'offered'::character varying, 'passed'::character varying, 'follow_up'::character varying, 'selected'::character varying])::"text"[])))
);


ALTER TABLE "public"."deal_buyers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "property_id" "uuid" NOT NULL,
    "status" "public"."deal_status" DEFAULT 'draft'::"public"."deal_status" NOT NULL,
    "ask_price" integer,
    "offer_price" integer,
    "contract_price" integer,
    "assignment_fee" integer,
    "arv" integer,
    "repair_estimate" integer,
    "buyer_id" "uuid",
    "closed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "dispo_prep" "jsonb",
    "entered_dispo_at" timestamp with time zone,
    "closing_target_date" timestamp with time zone,
    "closing_status" "text",
    "closing_notes" "text",
    "title_company" "text",
    "earnest_money_deposited" boolean DEFAULT false,
    "inspection_complete" boolean DEFAULT false,
    "closing_checklist" "jsonb",
    CONSTRAINT "deals_closing_status_check" CHECK ((("closing_status" IS NULL) OR ("closing_status" = ANY (ARRAY['under_contract'::"text", 'title_work'::"text", 'inspection'::"text", 'closing_scheduled'::"text", 'closed'::"text", 'fell_through'::"text"]))))
);


ALTER TABLE "public"."deals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "channel" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "payload" "jsonb",
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "entity_type" "text",
    "entity_id" "text"
);


ALTER TABLE "public"."delivery_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dialer_ai_traces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "run_id" "uuid" NOT NULL,
    "workflow" "text" NOT NULL,
    "prompt_version" "text" NOT NULL,
    "session_id" "uuid",
    "lead_id" "uuid",
    "call_log_id" "uuid",
    "model" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "input_hash" "text",
    "output_text" "text",
    "latency_ms" integer,
    "review_flag" boolean DEFAULT false NOT NULL,
    "review_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dialer_ai_traces" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dialer_auto_cycle_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "cycle_status" character varying(20) DEFAULT 'ready'::character varying NOT NULL,
    "current_round" integer DEFAULT 1 NOT NULL,
    "next_due_at" timestamp with time zone,
    "next_phone_id" "uuid",
    "last_outcome" character varying(50),
    "exit_reason" character varying(50),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ck_dialer_auto_cycle_status" CHECK ((("cycle_status")::"text" = ANY ((ARRAY['ready'::character varying, 'waiting'::character varying, 'paused'::character varying, 'exited'::character varying])::"text"[])))
);


ALTER TABLE "public"."dialer_auto_cycle_leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dialer_auto_cycle_phones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cycle_lead_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "phone_id" "uuid",
    "phone" character varying(32) NOT NULL,
    "phone_position" integer DEFAULT 0 NOT NULL,
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "next_attempt_number" integer,
    "next_due_at" timestamp with time zone,
    "last_attempt_at" timestamp with time zone,
    "last_outcome" character varying(50),
    "voicemail_drop_next" boolean DEFAULT false NOT NULL,
    "phone_status" character varying(20) DEFAULT 'active'::character varying NOT NULL,
    "exit_reason" character varying(50),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "consecutive_failures" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "ck_dialer_auto_cycle_attempt_count" CHECK ((("attempt_count" >= 0) AND ("attempt_count" <= 5))),
    CONSTRAINT "ck_dialer_auto_cycle_next_attempt" CHECK ((("next_attempt_number" IS NULL) OR (("next_attempt_number" >= 1) AND ("next_attempt_number" <= 5)))),
    CONSTRAINT "ck_dialer_auto_cycle_phone_status" CHECK ((("phone_status")::"text" = ANY ((ARRAY['active'::character varying, 'dead'::character varying, 'dnc'::character varying, 'completed'::character varying, 'exited'::character varying])::"text"[])))
);


ALTER TABLE "public"."dialer_auto_cycle_phones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dialer_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid",
    "user_id" "uuid",
    "event_type" character varying(60) NOT NULL,
    "payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "lead_id" "uuid",
    "task_id" "uuid",
    "metadata" "jsonb"
);


ALTER TABLE "public"."dialer_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."distress_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "property_id" "uuid" NOT NULL,
    "event_type" "public"."distress_type" NOT NULL,
    "source" character varying(100) NOT NULL,
    "severity" integer DEFAULT 5 NOT NULL,
    "fingerprint" character varying(128) NOT NULL,
    "raw_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "confidence" numeric(4,3),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" character varying(20) DEFAULT 'unknown'::character varying,
    "event_date" timestamp with time zone,
    "last_verified_at" timestamp with time zone,
    "resolved_at" timestamp with time zone
);


ALTER TABLE "public"."distress_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."distress_signals" (
    "id" bigint NOT NULL,
    "apn" "text",
    "signal_type" "text" NOT NULL,
    "event_date" "date" NOT NULL,
    "source_url" "text",
    "raw_data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."distress_signals" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."distress_signals_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."distress_signals_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."distress_signals_id_seq" OWNED BY "public"."distress_signals"."id";



CREATE TABLE IF NOT EXISTS "public"."dnc_list" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "phone" character varying(10) NOT NULL,
    "source" character varying(100) DEFAULT 'manual'::character varying NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dnc_list" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dominion_heat_scores" (
    "apn" "text" NOT NULL,
    "heat_score" integer,
    "breakdown" "jsonb",
    "scored_at" timestamp with time zone DEFAULT "now"(),
    "tags" "jsonb" DEFAULT '[]'::"jsonb",
    "ghost_mode_used" boolean DEFAULT false,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '30 days'::interval),
    "county" "text" DEFAULT 'Spokane'::"text",
    "prowler_id" "uuid" DEFAULT "gen_random_uuid"(),
    CONSTRAINT "dominion_heat_scores_score_check" CHECK ((("heat_score" >= 0) AND ("heat_score" <= 100)))
);


ALTER TABLE "public"."dominion_heat_scores" OWNER TO "postgres";


COMMENT ON TABLE "public"."dominion_heat_scores" IS 'Dominion Heat Score 0-100 per Charter weights';



CREATE TABLE IF NOT EXISTS "public"."dossier_artifacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "property_id" "uuid",
    "dossier_id" "uuid",
    "source_url" "text",
    "source_type" "text" DEFAULT 'other'::"text" NOT NULL,
    "source_label" "text",
    "captured_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "extracted_notes" "text",
    "raw_excerpt" "text",
    "screenshot_key" "text",
    "screenshot_url" "text",
    "captured_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "run_id" "uuid"
);


ALTER TABLE "public"."dossier_artifacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dossiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "property_id" "uuid",
    "status" "text" DEFAULT 'proposed'::"text" NOT NULL,
    "situation_summary" "text",
    "likely_decision_maker" "text",
    "top_facts" "jsonb",
    "recommended_call_angle" "text",
    "verification_checklist" "jsonb",
    "source_links" "jsonb",
    "raw_ai_output" "jsonb",
    "ai_run_id" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "review_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "dossiers_status_check" CHECK (("status" = ANY (ARRAY['proposed'::"text", 'reviewed'::"text", 'flagged'::"text", 'promoted'::"text"])))
);


ALTER TABLE "public"."dossiers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."eval_ratings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "run_id" "text" NOT NULL,
    "workflow" "text" NOT NULL,
    "prompt_version" "text" NOT NULL,
    "model" "text",
    "lead_id" "uuid",
    "call_log_id" "uuid",
    "session_id" "uuid",
    "verdict" "text" NOT NULL,
    "rubric_dimension" "text",
    "reviewer_note" "text",
    "output_snapshot" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "eval_ratings_rubric_dimension_check" CHECK (("rubric_dimension" = ANY (ARRAY['useful_and_accurate'::"text", 'missing_key_fact'::"text", 'hallucinated_fact'::"text", 'wrong_tone'::"text", 'wrong_routing'::"text", 'incomplete_output'::"text", 'low_relevance'::"text", 'other'::"text"]))),
    CONSTRAINT "eval_ratings_verdict_check" CHECK (("verdict" = ANY (ARRAY['good'::"text", 'needs_work'::"text", 'incorrect'::"text"])))
);


ALTER TABLE "public"."eval_ratings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "action" character varying(100) NOT NULL,
    "entity_type" character varying(50) NOT NULL,
    "entity_id" character varying(100) NOT NULL,
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "ip_address" character varying(45),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."event_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fact_assertions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "artifact_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "fact_type" "text" DEFAULT 'other'::"text" NOT NULL,
    "fact_value" "text" NOT NULL,
    "confidence" "text" DEFAULT 'unverified'::"text" NOT NULL,
    "review_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "promoted_field" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "asserted_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "run_id" "uuid",
    CONSTRAINT "fact_assertions_confidence_check" CHECK (("confidence" = ANY (ARRAY['unverified'::"text", 'low'::"text", 'medium'::"text", 'high'::"text"]))),
    CONSTRAINT "fact_assertions_review_status_check" CHECK (("review_status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."fact_assertions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feature_flags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "flag_key" "text" NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "mode" "text" DEFAULT 'off'::"text" NOT NULL,
    "description" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."feature_flags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."intake_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "raw_payload" "jsonb" NOT NULL,
    "source_channel" character varying(255) NOT NULL,
    "source_vendor" character varying(255),
    "source_category" character varying(255),
    "intake_method" character varying(255),
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "owner_name" character varying(255),
    "owner_phone" character varying(20),
    "owner_email" character varying(255),
    "property_address" "text",
    "property_city" character varying(100),
    "property_state" character varying(2),
    "property_zip" character varying(10),
    "county" character varying(100),
    "apn" character varying(50),
    "status" character varying(50) DEFAULT 'pending_review'::character varying NOT NULL,
    "review_notes" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "claimed_by" "uuid",
    "claimed_at" timestamp with time zone,
    "duplicate_of_lead_id" "uuid",
    "duplicate_confidence" smallint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."intake_leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."intake_providers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "webhook_vendor" character varying(255),
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "kpi_tracking_enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approved_email_patterns" "text"[] DEFAULT '{}'::"text"[]
);


ALTER TABLE "public"."intake_providers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jeff_control_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "control_key" "text" DEFAULT 'primary'::"text" NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "mode" "text" DEFAULT 'manual_only'::"text" NOT NULL,
    "soft_paused" boolean DEFAULT false NOT NULL,
    "emergency_halt" boolean DEFAULT false NOT NULL,
    "daily_max_calls" integer DEFAULT 120 NOT NULL,
    "per_run_max_calls" integer DEFAULT 10 NOT NULL,
    "business_hours_only" boolean DEFAULT true NOT NULL,
    "allowed_start_hour" integer DEFAULT 7 NOT NULL,
    "allowed_end_hour" integer DEFAULT 20 NOT NULL,
    "quality_review_enabled" boolean DEFAULT true NOT NULL,
    "policy_version" "text" DEFAULT 'jeff-outbound-2026-03-30'::"text" NOT NULL,
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."jeff_control_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jeff_interactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "voice_session_id" "uuid" NOT NULL,
    "lead_id" "uuid",
    "calls_log_id" "uuid",
    "interaction_type" "text" NOT NULL,
    "status" "text" DEFAULT 'needs_review'::"text" NOT NULL,
    "summary" "text",
    "callback_requested" boolean DEFAULT false NOT NULL,
    "callback_due_at" timestamp with time zone,
    "callback_timing_text" "text",
    "transfer_outcome" "text",
    "assigned_to" "uuid",
    "task_id" "uuid",
    "policy_version" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "reviewed_at" timestamp with time zone,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "direction" "text" DEFAULT 'outbound'::"text" NOT NULL,
    "caller_phone" "text",
    "caller_name" "text",
    "property_address" "text"
);


ALTER TABLE "public"."jeff_interactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jeff_quality_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "voice_session_id" "uuid" NOT NULL,
    "reviewer_id" "uuid" NOT NULL,
    "review_tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "score" integer,
    "notes" "text",
    "policy_version" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."jeff_quality_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jeff_queue_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "selected_phone" "text",
    "queue_tier" "text" DEFAULT 'eligible'::"text" NOT NULL,
    "queue_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_voice_session_id" "uuid",
    "last_call_status" "text",
    "last_called_at" timestamp with time zone,
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."jeff_queue_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_contradiction_flags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "check_type" "text" NOT NULL,
    "severity" "text" DEFAULT 'warn'::"text" NOT NULL,
    "description" "text" NOT NULL,
    "evidence_a" "jsonb",
    "evidence_b" "jsonb",
    "fact_id" "uuid",
    "artifact_id" "uuid",
    "status" "text" DEFAULT 'unreviewed'::"text" NOT NULL,
    "review_note" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "scanned_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lead_contradiction_flags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_objection_tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "call_log_id" "uuid",
    "tag" "text" NOT NULL,
    "note" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "tagged_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_by" "uuid",
    "resolved_at" timestamp with time zone,
    CONSTRAINT "lead_objection_tags_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'resolved'::"text"])))
);


ALTER TABLE "public"."lead_objection_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_phones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "property_id" "uuid",
    "phone" "text" NOT NULL,
    "label" "text" DEFAULT 'unknown'::"text",
    "source" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text",
    "dead_reason" "text",
    "dead_marked_by" "uuid",
    "dead_marked_at" timestamp with time zone,
    "is_primary" boolean DEFAULT false,
    "position" smallint DEFAULT 0,
    "last_called_at" timestamp with time zone,
    "call_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."lead_phones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_stage_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "property_id" "uuid" NOT NULL,
    "from_status" character varying(30),
    "to_status" character varying(30) NOT NULL,
    "score_at_transition" numeric(5,2),
    "tier_at_transition" character varying(20),
    "signal_types" "text"[],
    "signal_combination" character varying(255),
    "import_source" character varying(50),
    "days_in_previous_stage" integer,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."lead_stage_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "property_id" "uuid" NOT NULL,
    "contact_id" "uuid",
    "status" "public"."lead_status" DEFAULT 'prospect'::"public"."lead_status" NOT NULL,
    "assigned_to" "uuid",
    "priority" integer DEFAULT 0 NOT NULL,
    "source" character varying(100),
    "promoted_at" timestamp with time zone,
    "last_contact_at" timestamp with time zone,
    "next_follow_up_at" timestamp with time zone,
    "disposition_code" character varying(50),
    "notes" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "lock_version" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "owner_id" "uuid",
    "claimed_at" timestamp with time zone,
    "claim_expires_at" timestamp with time zone,
    "call_consent" boolean DEFAULT false,
    "call_consent_at" timestamp with time zone,
    "next_call_scheduled_at" timestamp with time zone,
    "call_sequence_step" integer DEFAULT 1 NOT NULL,
    "total_calls" integer DEFAULT 0 NOT NULL,
    "live_answers" integer DEFAULT 0 NOT NULL,
    "voicemails_left" integer DEFAULT 0 NOT NULL,
    "motivation_level" smallint,
    "seller_timeline" "text",
    "condition_level" smallint,
    "decision_maker_confirmed" boolean DEFAULT false,
    "price_expectation" numeric,
    "qualification_route" "text",
    "occupancy_score" smallint,
    "equity_flexibility_score" smallint,
    "qualification_score_total" smallint,
    "next_action" "text",
    "next_action_due_at" timestamp with time zone,
    "decision_maker_note" "text",
    "current_dossier_id" "uuid",
    "seller_situation_summary_short" "text",
    "recommended_call_angle" "text",
    "likely_decision_maker" "text",
    "decision_maker_confidence" "text",
    "top_fact_1" "text",
    "top_fact_2" "text",
    "top_fact_3" "text",
    "recommended_next_action" "text",
    "property_snapshot_status" "text" DEFAULT 'pending'::"text",
    "comps_status" "text" DEFAULT 'pending'::"text",
    "opportunity_score" smallint,
    "contactability_score" smallint,
    "confidence_score" smallint,
    "buyer_fit_score" smallint,
    "dossier_url" "text",
    "acquisition_cost" numeric(10,2),
    "market" "text",
    "scores_updated_at" timestamp with time zone,
    "intake_lead_id" "uuid",
    "from_special_intake" boolean DEFAULT false NOT NULL,
    "source_category" character varying(255),
    "entered_dispo_at" timestamp with time zone,
    "pinned" boolean DEFAULT false NOT NULL,
    "pinned_at" timestamp with time zone,
    "pinned_by" "uuid",
    "dial_queue_active" boolean DEFAULT false NOT NULL,
    "dial_queue_added_at" timestamp with time zone,
    "dial_queue_added_by" "uuid",
    "skip_trace_status" "text" DEFAULT 'not_started'::"text" NOT NULL,
    "skip_trace_completed_at" timestamp with time zone,
    "skip_trace_last_attempted_at" timestamp with time zone,
    "skip_trace_last_error" "text",
    CONSTRAINT "leads_condition_level_check" CHECK ((("condition_level" IS NULL) OR (("condition_level" >= 1) AND ("condition_level" <= 10)))),
    CONSTRAINT "leads_equity_flexibility_score_check" CHECK ((("equity_flexibility_score" IS NULL) OR (("equity_flexibility_score" >= 1) AND ("equity_flexibility_score" <= 5)))),
    CONSTRAINT "leads_motivation_level_check" CHECK ((("motivation_level" IS NULL) OR (("motivation_level" >= 1) AND ("motivation_level" <= 10)))),
    CONSTRAINT "leads_occupancy_score_check" CHECK ((("occupancy_score" IS NULL) OR (("occupancy_score" >= 1) AND ("occupancy_score" <= 5)))),
    CONSTRAINT "leads_qualification_route_check" CHECK ((("qualification_route" IS NULL) OR ("qualification_route" = ANY (ARRAY['offer_ready'::"text", 'follow_up'::"text", 'nurture'::"text", 'dead'::"text", 'escalate'::"text"])))),
    CONSTRAINT "leads_qualification_score_total_check" CHECK ((("qualification_score_total" IS NULL) OR (("qualification_score_total" >= 7) AND ("qualification_score_total" <= 35)))),
    CONSTRAINT "leads_seller_timeline_check" CHECK ((("seller_timeline" IS NULL) OR ("seller_timeline" = ANY (ARRAY['immediate'::"text", '30_days'::"text", '60_days'::"text", 'flexible'::"text", 'unknown'::"text"]))))
);


ALTER TABLE "public"."leads" OWNER TO "postgres";


COMMENT ON COLUMN "public"."leads"."motivation_level" IS '1-10: seller motivation to sell';



COMMENT ON COLUMN "public"."leads"."seller_timeline" IS 'Seller timeline: immediate, 30_days, 60_days, flexible, unknown';



COMMENT ON COLUMN "public"."leads"."condition_level" IS '1-10: property condition (1=needs full rehab, 10=move-in ready)';



COMMENT ON COLUMN "public"."leads"."decision_maker_confirmed" IS 'Whether the decision maker has been confirmed';



COMMENT ON COLUMN "public"."leads"."price_expectation" IS 'Seller asking price or price expectation in dollars';



COMMENT ON COLUMN "public"."leads"."qualification_route" IS 'Routing decision: offer_ready, follow_up, nurture, dead, escalate';



COMMENT ON COLUMN "public"."leads"."occupancy_score" IS '1-5: occupancy status (1=tenant w/ lease, 5=vacant)';



COMMENT ON COLUMN "public"."leads"."equity_flexibility_score" IS '1-5: equity and deal flexibility (1=underwater, 5=high equity)';



COMMENT ON COLUMN "public"."leads"."qualification_score_total" IS 'Server-computed sum of 7 qualification dimensions (7-35)';



COMMENT ON COLUMN "public"."leads"."current_dossier_id" IS 'FK to the most recently promoted/reviewed dossier — set by syncDossierToLead()';



COMMENT ON COLUMN "public"."leads"."buyer_fit_score" IS 'How well this lead matches active buyer criteria (0-100)';



COMMENT ON COLUMN "public"."leads"."dossier_url" IS 'Direct link to the promoted dossier for quick reference';



COMMENT ON COLUMN "public"."leads"."acquisition_cost" IS 'Per-lead acquisition cost from the originating prospect engine.';



COMMENT ON COLUMN "public"."leads"."market" IS 'Market identifier: spokane or kootenai. Backfilled from properties.county, maintained on new lead creation.';



CREATE TABLE IF NOT EXISTS "public"."litigants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "phone" character varying(10) NOT NULL,
    "name" "text",
    "source" character varying(100) DEFAULT 'manual'::character varying NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."litigants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."offers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deal_id" "uuid" NOT NULL,
    "offer_type" character varying(50) NOT NULL,
    "amount" integer NOT NULL,
    "terms" "text",
    "status" character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    "offered_by" "uuid" NOT NULL,
    "offered_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "response" "text",
    "responded_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."offers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."opt_outs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "phone" character varying(10) NOT NULL,
    "source" character varying(100) DEFAULT 'manual'::character varying NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."opt_outs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parcels" (
    "apn" "text" NOT NULL,
    "county" "text" NOT NULL,
    "address" "text",
    "owner_name" "text",
    "owner_address" "text",
    "property_type" "text",
    "last_sale_date" "date",
    "last_sale_price" numeric,
    "assessed_value" numeric,
    "equity_percent" numeric,
    "latitude" numeric,
    "longitude" numeric,
    "raw_data" "jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "city" "text" DEFAULT ''::"text",
    "state" "text" DEFAULT 'WA'::"text",
    "zip" "text" DEFAULT ''::"text",
    "estimated_value" numeric,
    CONSTRAINT "parcels_county_check" CHECK (("county" = ANY (ARRAY['Spokane'::"text", 'Kootenai'::"text"])))
);


ALTER TABLE "public"."parcels" OWNER TO "postgres";


COMMENT ON TABLE "public"."parcels" IS 'Golden Record – 350k parcels Spokane + Kootenai';



CREATE TABLE IF NOT EXISTS "public"."post_call_structures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "calls_log_id" "uuid",
    "lead_id" "uuid",
    "summary_line" "text",
    "promises_made" "text",
    "objection" "text",
    "next_task_suggestion" "text",
    "deal_temperature" character varying(10),
    "draft_note_run_id" "text",
    "draft_was_flagged" boolean DEFAULT false NOT NULL,
    "correction_status" character varying(20) DEFAULT 'published'::character varying NOT NULL,
    "corrected_at" timestamp with time zone,
    "corrected_by" "uuid",
    "published_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "callback_timing_hint" "text",
    CONSTRAINT "ck_pcs_correction_status" CHECK ((("correction_status")::"text" = ANY ((ARRAY['published'::character varying, 'corrected'::character varying])::"text"[]))),
    CONSTRAINT "ck_pcs_temperature" CHECK ((("deal_temperature" IS NULL) OR (("deal_temperature")::"text" = ANY ((ARRAY['hot'::character varying, 'warm'::character varying, 'cool'::character varying, 'cold'::character varying, 'dead'::character varying])::"text"[]))))
);


ALTER TABLE "public"."post_call_structures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prompt_registry" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workflow" "text" NOT NULL,
    "version" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "description" "text",
    "changelog" "text",
    "registered_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "prompt_registry_status_check" CHECK (("status" = ANY (ARRAY['testing'::"text", 'active'::"text", 'deprecated'::"text"])))
);


ALTER TABLE "public"."prompt_registry" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."properties" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "apn" character varying(50) NOT NULL,
    "county" character varying(100) NOT NULL,
    "address" "text" NOT NULL,
    "city" character varying(100) DEFAULT ''::character varying NOT NULL,
    "state" character varying(2) DEFAULT ''::character varying NOT NULL,
    "zip" character varying(10) DEFAULT ''::character varying NOT NULL,
    "owner_name" "text" NOT NULL,
    "owner_phone" character varying(20),
    "owner_email" character varying(255),
    "estimated_value" integer,
    "equity_percent" numeric(5,2),
    "bedrooms" integer,
    "bathrooms" numeric(3,1),
    "sqft" integer,
    "year_built" integer,
    "lot_size" integer,
    "property_type" character varying(50),
    "owner_flags" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text"
);


ALTER TABLE "public"."properties" OWNER TO "postgres";


COMMENT ON COLUMN "public"."properties"."notes" IS 'General notes about the property (synced from Master Client File edit)';



CREATE TABLE IF NOT EXISTS "public"."ranger_pushes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "apn" "text" NOT NULL,
    "county" "text" DEFAULT 'Spokane'::"text" NOT NULL,
    "prowler_id" "uuid" NOT NULL,
    "heat_score" integer NOT NULL,
    "payload" "jsonb" NOT NULL,
    "pg_net_request_id" bigint,
    "sentinel_url" "text" NOT NULL,
    "status" "text" DEFAULT 'sent'::"text" NOT NULL,
    "error_message" "text",
    "pushed_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ranger_pushes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recorded_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "property_id" "uuid" NOT NULL,
    "lead_id" "uuid",
    "document_type" "text" NOT NULL,
    "instrument_number" "text",
    "recording_date" timestamp with time zone,
    "document_date" timestamp with time zone,
    "grantor" "text",
    "grantee" "text",
    "amount" integer,
    "lender_name" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "case_number" "text",
    "court_name" "text",
    "case_type" "text",
    "attorney_name" "text",
    "contact_person" "text",
    "next_hearing_date" timestamp with time zone,
    "event_description" "text",
    "source" "text" NOT NULL,
    "source_url" "text",
    "raw_excerpt" "text",
    "raw_data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."recorded_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."research_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "property_id" "uuid",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "started_by" "uuid",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_at" timestamp with time zone,
    "notes" "text",
    "dossier_id" "uuid",
    "source_mix" "jsonb",
    "artifact_count" integer DEFAULT 0 NOT NULL,
    "fact_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "research_runs_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'compiled'::"text", 'closed'::"text", 'abandoned'::"text"])))
);


ALTER TABLE "public"."research_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."review_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "run_id" "uuid" NOT NULL,
    "agent_name" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid",
    "action" "text" NOT NULL,
    "proposal" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "rationale" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "priority" smallint DEFAULT 5 NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "review_notes" "text",
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."review_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scoring_predictions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "property_id" "uuid" NOT NULL,
    "model_version" character varying(20) NOT NULL,
    "predictive_score" integer NOT NULL,
    "days_until_distress" integer NOT NULL,
    "confidence" numeric(5,2) NOT NULL,
    "owner_age_inference" integer,
    "equity_burn_rate" numeric(8,4),
    "absentee_duration_days" integer,
    "tax_delinquency_trend" numeric(8,4),
    "life_event_probability" numeric(5,2),
    "features" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "factors" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."scoring_predictions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scoring_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "property_id" "uuid" NOT NULL,
    "model_version" character varying(20) NOT NULL,
    "composite_score" integer NOT NULL,
    "motivation_score" integer NOT NULL,
    "deal_score" integer NOT NULL,
    "severity_multiplier" numeric(4,2) NOT NULL,
    "recency_decay" numeric(4,2) DEFAULT 1.0 NOT NULL,
    "stacking_bonus" integer DEFAULT 0 NOT NULL,
    "owner_factor_score" integer DEFAULT 0 NOT NULL,
    "equity_factor_score" numeric(6,2) DEFAULT 0 NOT NULL,
    "ai_boost" integer DEFAULT 0 NOT NULL,
    "factors" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "equity_multiplier" numeric(4,2) DEFAULT 1.0 NOT NULL
);


ALTER TABLE "public"."scoring_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_extracted_facts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "fact_type" character varying(50) NOT NULL,
    "raw_text" "text" NOT NULL,
    "structured_value" "jsonb",
    "is_ai_generated" boolean DEFAULT true NOT NULL,
    "is_confirmed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ck_session_facts_type" CHECK ((("fact_type")::"text" = ANY ((ARRAY['motivation_signal'::character varying, 'price_mention'::character varying, 'timeline_mention'::character varying, 'condition_note'::character varying, 'objection'::character varying, 'follow_up_intent'::character varying, 'red_flag'::character varying])::"text"[])))
);


ALTER TABLE "public"."session_extracted_facts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "note_type" character varying(30) NOT NULL,
    "speaker" character varying(20),
    "content" "text" NOT NULL,
    "confidence" numeric(3,2),
    "is_ai_generated" boolean DEFAULT false NOT NULL,
    "is_confirmed" boolean DEFAULT false NOT NULL,
    "sequence_num" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "trace_metadata" "jsonb",
    CONSTRAINT "ck_session_notes_speaker" CHECK (((("speaker")::"text" = ANY ((ARRAY['operator'::character varying, 'seller'::character varying, 'ai'::character varying])::"text"[])) OR ("speaker" IS NULL))),
    CONSTRAINT "ck_session_notes_type" CHECK ((("note_type")::"text" = ANY ((ARRAY['transcript_chunk'::character varying, 'ai_suggestion'::character varying, 'operator_note'::character varying])::"text"[])))
);


ALTER TABLE "public"."session_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sms_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "phone" "text" NOT NULL,
    "direction" "text" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "twilio_sid" "text",
    "twilio_status" "text",
    "lead_id" "uuid",
    "user_id" "uuid",
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "sms_messages_direction_check" CHECK (("direction" = ANY (ARRAY['inbound'::"text", 'outbound'::"text"])))
);


ALTER TABLE "public"."sms_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."source_costs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" NOT NULL,
    "month" "date" NOT NULL,
    "subscription_cost" numeric(10,2) DEFAULT 0,
    "per_record_cost" numeric(10,2) DEFAULT 0,
    "ad_spend" numeric(10,2) DEFAULT 0,
    "other_cost" numeric(10,2) DEFAULT 0,
    "total_cost" numeric(10,2) GENERATED ALWAYS AS ((((COALESCE("subscription_cost", (0)::numeric) + COALESCE("per_record_cost", (0)::numeric)) + COALESCE("ad_spend", (0)::numeric)) + COALESCE("other_cost", (0)::numeric))) STORED,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "source_key" character varying(50),
    "period_start" "date",
    "period_end" "date",
    "created_by" "uuid"
);


ALTER TABLE "public"."source_costs" OWNER TO "postgres";


COMMENT ON TABLE "public"."source_costs" IS 'Monthly spend per prospect engine for bake-off cost-per-contract tracking.';



CREATE TABLE IF NOT EXISTS "public"."source_policies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_type" "text" NOT NULL,
    "policy" "text" DEFAULT 'review_required'::"text" NOT NULL,
    "rationale" "text",
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "source_policies_policy_check" CHECK (("policy" = ANY (ARRAY['approved'::"text", 'review_required'::"text", 'blocked'::"text"])))
);


ALTER TABLE "public"."source_policies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" character varying(255) NOT NULL,
    "description" "text",
    "assigned_to" "uuid" NOT NULL,
    "lead_id" "uuid",
    "deal_id" "uuid",
    "due_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "priority" integer DEFAULT 0 NOT NULL,
    "status" character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "task_type" "text" DEFAULT 'follow_up'::"text",
    "contact_id" "uuid",
    "notes" "text",
    "source_type" "text",
    "source_key" "text",
    "voice_session_id" "uuid",
    "jeff_interaction_id" "uuid"
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" NOT NULL,
    "full_name" character varying(200) NOT NULL,
    "email" character varying(255) NOT NULL,
    "role" "public"."user_role" DEFAULT 'agent'::"public"."user_role" NOT NULL,
    "avatar_url" "text",
    "phone" character varying(20),
    "is_active" boolean DEFAULT true NOT NULL,
    "saved_dashboard_layout" "jsonb",
    "preferences" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_seen_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "personal_cell" "text",
    "twilio_phone_number" character varying(20)
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."user_profiles"."personal_cell" IS 'Agent''s personal cell for Twilio warm transfer (E.164 format, e.g. +15095551234)';



CREATE TABLE IF NOT EXISTS "public"."voice_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "call_sid" "text",
    "vapi_call_id" "text",
    "direction" "text" NOT NULL,
    "from_number" "text",
    "to_number" "text",
    "lead_id" "uuid",
    "caller_type" "text",
    "caller_intent" "text",
    "status" "text" DEFAULT 'ringing'::"text" NOT NULL,
    "transferred_to" "text",
    "transfer_reason" "text",
    "summary" "text",
    "extracted_facts" "jsonb" DEFAULT '[]'::"jsonb",
    "callback_requested" boolean DEFAULT false,
    "callback_time" "text",
    "assistant_id" "text",
    "model_used" "text",
    "duration_seconds" integer,
    "cost_cents" integer,
    "recording_url" "text",
    "transcript" "text",
    "feature_flag" "text" DEFAULT 'voice.ai.inbound'::"text",
    "run_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "transfer_brief" "jsonb",
    "auto_cycle_lead_id" "uuid",
    "auto_cycle_phone_id" "uuid",
    "metadata" "jsonb",
    CONSTRAINT "voice_sessions_caller_type_check" CHECK (("caller_type" = ANY (ARRAY['seller'::"text", 'buyer'::"text", 'vendor'::"text", 'spam'::"text", 'unknown'::"text", NULL::"text"]))),
    CONSTRAINT "voice_sessions_direction_check" CHECK (("direction" = ANY (ARRAY['inbound'::"text", 'outbound'::"text"]))),
    CONSTRAINT "voice_sessions_status_check" CHECK (("status" = ANY (ARRAY['ringing'::"text", 'ai_handling'::"text", 'transferred'::"text", 'completed'::"text", 'failed'::"text", 'voicemail'::"text"])))
);


ALTER TABLE "public"."voice_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workflow_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workflow_name" character varying(100) NOT NULL,
    "status" character varying(20) DEFAULT 'running'::character varying NOT NULL,
    "current_step" character varying(100) NOT NULL,
    "inputs" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "step_outputs" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "error" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone
);


ALTER TABLE "public"."workflow_runs" OWNER TO "postgres";


ALTER TABLE ONLY "public"."ads_campaign_budgets" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."ads_campaign_budgets_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."ads_conversion_actions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."ads_conversion_actions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."ads_device_metrics" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."ads_device_metrics_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."ads_geo_metrics" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."ads_geo_metrics_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."ads_negative_keywords" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."ads_negative_keywords_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."ads_system_prompts" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."ads_system_prompts_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."audit_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."audit_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."distress_signals" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."distress_signals_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."ad_actions"
    ADD CONSTRAINT "ad_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ad_reviews"
    ADD CONSTRAINT "ad_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ad_snapshots"
    ADD CONSTRAINT "ad_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ads_ad_groups"
    ADD CONSTRAINT "ads_ad_groups_google_ad_group_id_key" UNIQUE ("google_ad_group_id");



ALTER TABLE ONLY "public"."ads_ad_groups"
    ADD CONSTRAINT "ads_ad_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ads_ads"
    ADD CONSTRAINT "ads_ads_google_ad_id_key" UNIQUE ("google_ad_id");



ALTER TABLE ONLY "public"."ads_ads"
    ADD CONSTRAINT "ads_ads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ads_alerts"
    ADD CONSTRAINT "ads_alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ads_approvals"
    ADD CONSTRAINT "ads_approvals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ads_campaign_budgets"
    ADD CONSTRAINT "ads_campaign_budgets_google_budget_id_key" UNIQUE ("google_budget_id");



ALTER TABLE ONLY "public"."ads_campaign_budgets"
    ADD CONSTRAINT "ads_campaign_budgets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ads_campaigns"
    ADD CONSTRAINT "ads_campaigns_google_campaign_id_key" UNIQUE ("google_campaign_id");



ALTER TABLE ONLY "public"."ads_campaigns"
    ADD CONSTRAINT "ads_campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ads_conversion_actions"
    ADD CONSTRAINT "ads_conversion_actions_google_conversion_id_key" UNIQUE ("google_conversion_id");



ALTER TABLE ONLY "public"."ads_conversion_actions"
    ADD CONSTRAINT "ads_conversion_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ads_daily_metrics"
    ADD CONSTRAINT "ads_daily_metrics_dedup" UNIQUE NULLS NOT DISTINCT ("report_date", "campaign_id", "ad_group_id", "keyword_id");



ALTER TABLE ONLY "public"."ads_daily_metrics"
    ADD CONSTRAINT "ads_daily_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ads_device_metrics"
    ADD CONSTRAINT "ads_device_metrics_campaign_id_device_report_date_key" UNIQUE ("campaign_id", "device", "report_date");



ALTER TABLE ONLY "public"."ads_device_metrics"
    ADD CONSTRAINT "ads_device_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ads_geo_metrics"
    ADD CONSTRAINT "ads_geo_metrics_campaign_id_geo_name_report_date_key" UNIQUE ("campaign_id", "geo_name", "report_date");



ALTER TABLE ONLY "public"."ads_geo_metrics"
    ADD CONSTRAINT "ads_geo_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ads_implementation_logs"
    ADD CONSTRAINT "ads_implementation_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ads_implementation_logs"
    ADD CONSTRAINT "ads_implementation_logs_rec_id_unique" UNIQUE ("recommendation_id");



ALTER TABLE ONLY "public"."ads_intelligence_briefings"
    ADD CONSTRAINT "ads_intelligence_briefings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ads_keywords"
    ADD CONSTRAINT "ads_keywords_google_keyword_id_key" UNIQUE ("google_keyword_id");



ALTER TABLE ONLY "public"."ads_keywords"
    ADD CONSTRAINT "ads_keywords_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ads_lead_attribution"
    ADD CONSTRAINT "ads_lead_attribution_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ads_negative_keywords"
    ADD CONSTRAINT "ads_negative_keywords_google_criterion_id_key" UNIQUE ("google_criterion_id");



ALTER TABLE ONLY "public"."ads_negative_keywords"
    ADD CONSTRAINT "ads_negative_keywords_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ads_recommendations"
    ADD CONSTRAINT "ads_recommendations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ads_search_terms"
    ADD CONSTRAINT "ads_search_terms_dedup" UNIQUE NULLS NOT DISTINCT ("search_term", "campaign_id", "ad_group_id");



ALTER TABLE ONLY "public"."ads_search_terms"
    ADD CONSTRAINT "ads_search_terms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ads_sync_logs"
    ADD CONSTRAINT "ads_sync_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ads_system_prompts"
    ADD CONSTRAINT "ads_system_prompts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ads_system_prompts"
    ADD CONSTRAINT "ads_system_prompts_prompt_key_key" UNIQUE ("prompt_key");



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."buyers"
    ADD CONSTRAINT "buyers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."call_sessions"
    ADD CONSTRAINT "call_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calls_log"
    ADD CONSTRAINT "calls_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_leads"
    ADD CONSTRAINT "campaign_leads_campaign_id_lead_id_key" UNIQUE ("campaign_id", "lead_id");



ALTER TABLE ONLY "public"."campaign_leads"
    ADD CONSTRAINT "campaign_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cron_runs"
    ADD CONSTRAINT "cron_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_devotional"
    ADD CONSTRAINT "daily_devotional_display_date_key" UNIQUE ("display_date");



ALTER TABLE ONLY "public"."daily_devotional"
    ADD CONSTRAINT "daily_devotional_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deal_buyers"
    ADD CONSTRAINT "deal_buyers_deal_id_buyer_id_key" UNIQUE ("deal_id", "buyer_id");



ALTER TABLE ONLY "public"."deal_buyers"
    ADD CONSTRAINT "deal_buyers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_runs"
    ADD CONSTRAINT "delivery_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dialer_ai_traces"
    ADD CONSTRAINT "dialer_ai_traces_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dialer_auto_cycle_leads"
    ADD CONSTRAINT "dialer_auto_cycle_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dialer_auto_cycle_phones"
    ADD CONSTRAINT "dialer_auto_cycle_phones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dialer_events"
    ADD CONSTRAINT "dialer_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."distress_events"
    ADD CONSTRAINT "distress_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."distress_signals"
    ADD CONSTRAINT "distress_signals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dnc_list"
    ADD CONSTRAINT "dnc_list_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dominion_heat_scores"
    ADD CONSTRAINT "dominion_heat_scores_pkey" PRIMARY KEY ("apn");



ALTER TABLE ONLY "public"."dossier_artifacts"
    ADD CONSTRAINT "dossier_artifacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dossiers"
    ADD CONSTRAINT "dossiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."eval_ratings"
    ADD CONSTRAINT "eval_ratings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."eval_ratings"
    ADD CONSTRAINT "eval_ratings_run_id_key" UNIQUE ("run_id");



ALTER TABLE ONLY "public"."event_log"
    ADD CONSTRAINT "event_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fact_assertions"
    ADD CONSTRAINT "fact_assertions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feature_flags"
    ADD CONSTRAINT "feature_flags_flag_key_key" UNIQUE ("flag_key");



ALTER TABLE ONLY "public"."feature_flags"
    ADD CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."intake_leads"
    ADD CONSTRAINT "intake_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."intake_providers"
    ADD CONSTRAINT "intake_providers_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."intake_providers"
    ADD CONSTRAINT "intake_providers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jeff_control_settings"
    ADD CONSTRAINT "jeff_control_settings_control_key_key" UNIQUE ("control_key");



ALTER TABLE ONLY "public"."jeff_control_settings"
    ADD CONSTRAINT "jeff_control_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jeff_interactions"
    ADD CONSTRAINT "jeff_interactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jeff_quality_reviews"
    ADD CONSTRAINT "jeff_quality_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jeff_queue_entries"
    ADD CONSTRAINT "jeff_queue_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_contradiction_flags"
    ADD CONSTRAINT "lead_contradiction_flags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_objection_tags"
    ADD CONSTRAINT "lead_objection_tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_phones"
    ADD CONSTRAINT "lead_phones_lead_id_phone_key" UNIQUE ("lead_id", "phone");



ALTER TABLE ONLY "public"."lead_phones"
    ADD CONSTRAINT "lead_phones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_stage_snapshots"
    ADD CONSTRAINT "lead_stage_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."litigants"
    ADD CONSTRAINT "litigants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."offers"
    ADD CONSTRAINT "offers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."opt_outs"
    ADD CONSTRAINT "opt_outs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parcels"
    ADD CONSTRAINT "parcels_pkey" PRIMARY KEY ("apn");



ALTER TABLE ONLY "public"."post_call_structures"
    ADD CONSTRAINT "post_call_structures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post_call_structures"
    ADD CONSTRAINT "post_call_structures_session_id_key" UNIQUE ("session_id");



ALTER TABLE ONLY "public"."prompt_registry"
    ADD CONSTRAINT "prompt_registry_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prompt_registry"
    ADD CONSTRAINT "prompt_registry_workflow_version_unique" UNIQUE ("workflow", "version");



ALTER TABLE ONLY "public"."properties"
    ADD CONSTRAINT "properties_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ranger_pushes"
    ADD CONSTRAINT "ranger_pushes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recorded_documents"
    ADD CONSTRAINT "recorded_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."research_runs"
    ADD CONSTRAINT "research_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."review_queue"
    ADD CONSTRAINT "review_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scoring_predictions"
    ADD CONSTRAINT "scoring_predictions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scoring_records"
    ADD CONSTRAINT "scoring_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_extracted_facts"
    ADD CONSTRAINT "session_extracted_facts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_notes"
    ADD CONSTRAINT "session_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sms_messages"
    ADD CONSTRAINT "sms_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."source_costs"
    ADD CONSTRAINT "source_costs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."source_costs"
    ADD CONSTRAINT "source_costs_source_month_key" UNIQUE ("source", "month");



ALTER TABLE ONLY "public"."source_policies"
    ADD CONSTRAINT "source_policies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."source_policies"
    ADD CONSTRAINT "source_policies_source_type_key" UNIQUE ("source_type");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."properties"
    ADD CONSTRAINT "uq_apn_county" UNIQUE ("apn", "county");



ALTER TABLE ONLY "public"."dialer_auto_cycle_leads"
    ADD CONSTRAINT "uq_dialer_auto_cycle_lead" UNIQUE ("lead_id");



ALTER TABLE ONLY "public"."dialer_auto_cycle_phones"
    ADD CONSTRAINT "uq_dialer_auto_cycle_phone" UNIQUE ("cycle_lead_id", "phone_id");



ALTER TABLE ONLY "public"."distress_events"
    ADD CONSTRAINT "uq_distress_fingerprint" UNIQUE ("fingerprint");



ALTER TABLE ONLY "public"."dnc_list"
    ADD CONSTRAINT "uq_dnc_phone" UNIQUE ("phone");



ALTER TABLE ONLY "public"."jeff_interactions"
    ADD CONSTRAINT "uq_jeff_interactions_voice_session" UNIQUE ("voice_session_id");



ALTER TABLE ONLY "public"."jeff_quality_reviews"
    ADD CONSTRAINT "uq_jeff_quality_review" UNIQUE ("voice_session_id", "reviewer_id");



ALTER TABLE ONLY "public"."jeff_queue_entries"
    ADD CONSTRAINT "uq_jeff_queue_lead" UNIQUE ("lead_id");



ALTER TABLE ONLY "public"."litigants"
    ADD CONSTRAINT "uq_litigant_phone" UNIQUE ("phone");



ALTER TABLE ONLY "public"."opt_outs"
    ADD CONSTRAINT "uq_opt_out_phone" UNIQUE ("phone");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."voice_sessions"
    ADD CONSTRAINT "voice_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflow_runs"
    ADD CONSTRAINT "workflow_runs_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "ads_lead_attribution_gclid_key" ON "public"."ads_lead_attribution" USING "btree" ("gclid") WHERE ("gclid" IS NOT NULL);



CREATE UNIQUE INDEX "ads_sync_logs_running_singleton" ON "public"."ads_sync_logs" USING "btree" ("status") WHERE ("status" = 'running'::"text");



CREATE INDEX "idx_ad_actions_review" ON "public"."ad_actions" USING "btree" ("review_id");



CREATE INDEX "idx_ad_actions_status" ON "public"."ad_actions" USING "btree" ("status");



CREATE INDEX "idx_ad_reviews_date" ON "public"."ad_reviews" USING "btree" ("snapshot_date");



CREATE INDEX "idx_ad_reviews_type" ON "public"."ad_reviews" USING "btree" ("review_type");



CREATE INDEX "idx_ad_snapshots_ad" ON "public"."ad_snapshots" USING "btree" ("ad_id");



CREATE INDEX "idx_ad_snapshots_campaign" ON "public"."ad_snapshots" USING "btree" ("campaign_id");



CREATE INDEX "idx_ad_snapshots_date" ON "public"."ad_snapshots" USING "btree" ("snapshot_date");



CREATE INDEX "idx_ads_alerts_unread" ON "public"."ads_alerts" USING "btree" ("read") WHERE ("read" = false);



CREATE INDEX "idx_ads_budgets_campaign" ON "public"."ads_campaign_budgets" USING "btree" ("campaign_id");



CREATE INDEX "idx_ads_campaigns_market" ON "public"."ads_campaigns" USING "btree" ("market");



CREATE INDEX "idx_ads_daily_metrics_campaign" ON "public"."ads_daily_metrics" USING "btree" ("campaign_id");



CREATE INDEX "idx_ads_daily_metrics_date" ON "public"."ads_daily_metrics" USING "btree" ("report_date");



CREATE INDEX "idx_ads_device_metrics_date" ON "public"."ads_device_metrics" USING "btree" ("report_date");



CREATE INDEX "idx_ads_geo_metrics_date" ON "public"."ads_geo_metrics" USING "btree" ("report_date");



CREATE INDEX "idx_ads_intel_briefings_date" ON "public"."ads_intelligence_briefings" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_ads_lead_attribution_lead" ON "public"."ads_lead_attribution" USING "btree" ("lead_id");



CREATE INDEX "idx_ads_neg_kw_ad_group" ON "public"."ads_negative_keywords" USING "btree" ("ad_group_id");



CREATE INDEX "idx_ads_neg_kw_campaign" ON "public"."ads_negative_keywords" USING "btree" ("campaign_id");



CREATE INDEX "idx_ads_recommendations_market" ON "public"."ads_recommendations" USING "btree" ("market");



CREATE INDEX "idx_ads_recommendations_risk" ON "public"."ads_recommendations" USING "btree" ("risk_level");



CREATE INDEX "idx_ads_recommendations_status" ON "public"."ads_recommendations" USING "btree" ("status");



CREATE INDEX "idx_ads_search_terms_market" ON "public"."ads_search_terms" USING "btree" ("market");



CREATE INDEX "idx_ads_search_terms_opportunity" ON "public"."ads_search_terms" USING "btree" ("is_opportunity") WHERE ("is_opportunity" = true);



CREATE INDEX "idx_ads_search_terms_waste" ON "public"."ads_search_terms" USING "btree" ("is_waste") WHERE ("is_waste" = true);



CREATE INDEX "idx_ads_sync_logs_started" ON "public"."ads_sync_logs" USING "btree" ("started_at");



CREATE INDEX "idx_ads_sync_logs_type" ON "public"."ads_sync_logs" USING "btree" ("sync_type");



CREATE INDEX "idx_agent_runs_agent_name" ON "public"."agent_runs" USING "btree" ("agent_name", "started_at" DESC);



CREATE INDEX "idx_agent_runs_lead" ON "public"."agent_runs" USING "btree" ("lead_id") WHERE ("lead_id" IS NOT NULL);



CREATE INDEX "idx_agent_runs_status" ON "public"."agent_runs" USING "btree" ("status") WHERE ("status" = 'running'::"text");



CREATE INDEX "idx_ai_traces_review_flag" ON "public"."dialer_ai_traces" USING "btree" ("review_flag", "created_at" DESC) WHERE ("review_flag" = true);



CREATE UNIQUE INDEX "idx_ai_traces_run_id" ON "public"."dialer_ai_traces" USING "btree" ("run_id");



CREATE INDEX "idx_ai_traces_session" ON "public"."dialer_ai_traces" USING "btree" ("session_id") WHERE ("session_id" IS NOT NULL);



CREATE INDEX "idx_ai_traces_workflow_version" ON "public"."dialer_ai_traces" USING "btree" ("workflow", "prompt_version", "created_at" DESC);



CREATE INDEX "idx_audit_log_action" ON "public"."audit_log" USING "btree" ("action");



CREATE INDEX "idx_audit_log_created" ON "public"."audit_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_audit_log_entity" ON "public"."audit_log" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_audit_log_lead" ON "public"."audit_log" USING "btree" ("lead_id");



CREATE INDEX "idx_buyers_markets" ON "public"."buyers" USING "gin" ("markets");



CREATE INDEX "idx_buyers_status" ON "public"."buyers" USING "btree" ("status");



CREATE INDEX "idx_buyers_tags" ON "public"."buyers" USING "gin" ("tags");



CREATE INDEX "idx_call_sessions_lead" ON "public"."call_sessions" USING "btree" ("lead_id") WHERE ("lead_id" IS NOT NULL);



CREATE INDEX "idx_call_sessions_status" ON "public"."call_sessions" USING "btree" ("status");



CREATE INDEX "idx_call_sessions_twilio" ON "public"."call_sessions" USING "btree" ("twilio_sid") WHERE ("twilio_sid" IS NOT NULL);



CREATE INDEX "idx_call_sessions_user" ON "public"."call_sessions" USING "btree" ("user_id");



CREATE INDEX "idx_call_sessions_user_started" ON "public"."call_sessions" USING "btree" ("user_id", "started_at" DESC);



CREATE INDEX "idx_calls_log_ai_summary" ON "public"."calls_log" USING "btree" ("lead_id") WHERE ("ai_summary" IS NOT NULL);



CREATE INDEX "idx_calls_log_dialer_session" ON "public"."calls_log" USING "btree" ("dialer_session_id") WHERE ("dialer_session_id" IS NOT NULL);



CREATE INDEX "idx_calls_log_direction" ON "public"."calls_log" USING "btree" ("direction");



CREATE INDEX "idx_calls_log_disposition" ON "public"."calls_log" USING "btree" ("disposition");



CREATE INDEX "idx_calls_log_lead" ON "public"."calls_log" USING "btree" ("lead_id");



CREATE INDEX "idx_calls_log_lead_id" ON "public"."calls_log" USING "btree" ("lead_id");



CREATE INDEX "idx_calls_log_lead_summary" ON "public"."calls_log" USING "btree" ("lead_id", "summary_timestamp" DESC);



CREATE INDEX "idx_calls_log_source" ON "public"."calls_log" USING "btree" ("source");



CREATE INDEX "idx_calls_log_started" ON "public"."calls_log" USING "btree" ("started_at");



CREATE INDEX "idx_calls_log_started_at" ON "public"."calls_log" USING "btree" ("started_at" DESC);



CREATE INDEX "idx_calls_log_twilio" ON "public"."calls_log" USING "btree" ("twilio_sid");



CREATE INDEX "idx_calls_log_user" ON "public"."calls_log" USING "btree" ("user_id");



CREATE INDEX "idx_calls_log_user_id" ON "public"."calls_log" USING "btree" ("user_id");



CREATE INDEX "idx_calls_log_voice_session" ON "public"."calls_log" USING "btree" ("voice_session_id") WHERE ("voice_session_id" IS NOT NULL);



CREATE UNIQUE INDEX "idx_calls_log_voice_session_uniq" ON "public"."calls_log" USING "btree" ("voice_session_id") WHERE ("voice_session_id" IS NOT NULL);



CREATE INDEX "idx_campaign_leads_campaign" ON "public"."campaign_leads" USING "btree" ("campaign_id");



CREATE INDEX "idx_campaign_leads_lead" ON "public"."campaign_leads" USING "btree" ("lead_id");



CREATE INDEX "idx_campaign_leads_next_touch" ON "public"."campaign_leads" USING "btree" ("next_touch_at");



CREATE INDEX "idx_campaign_leads_status" ON "public"."campaign_leads" USING "btree" ("status");



CREATE INDEX "idx_campaigns_status" ON "public"."campaigns" USING "btree" ("status");



CREATE INDEX "idx_campaigns_type" ON "public"."campaigns" USING "btree" ("campaign_type");



CREATE INDEX "idx_contacts_email" ON "public"."contacts" USING "btree" ("email");



CREATE INDEX "idx_contacts_name" ON "public"."contacts" USING "btree" ("last_name", "first_name");



CREATE INDEX "idx_contacts_phone" ON "public"."contacts" USING "btree" ("phone");



CREATE UNIQUE INDEX "idx_contacts_phone_unique" ON "public"."contacts" USING "btree" ("phone") WHERE ("phone" IS NOT NULL);



CREATE INDEX "idx_contradiction_flags_lead" ON "public"."lead_contradiction_flags" USING "btree" ("lead_id", "created_at" DESC);



CREATE INDEX "idx_contradiction_flags_severity" ON "public"."lead_contradiction_flags" USING "btree" ("severity", "created_at" DESC);



CREATE INDEX "idx_contradiction_flags_status" ON "public"."lead_contradiction_flags" USING "btree" ("status", "created_at" DESC) WHERE ("status" = 'unreviewed'::"text");



CREATE INDEX "idx_cron_runs_name_started" ON "public"."cron_runs" USING "btree" ("cron_name", "started_at" DESC);



CREATE INDEX "idx_cron_runs_status" ON "public"."cron_runs" USING "btree" ("status") WHERE ("status" = 'running'::"text");



CREATE INDEX "idx_deal_buyers_buyer" ON "public"."deal_buyers" USING "btree" ("buyer_id");



CREATE INDEX "idx_deal_buyers_deal" ON "public"."deal_buyers" USING "btree" ("deal_id");



CREATE INDEX "idx_deal_buyers_status" ON "public"."deal_buyers" USING "btree" ("status");



CREATE INDEX "idx_deals_lead" ON "public"."deals" USING "btree" ("lead_id");



CREATE INDEX "idx_deals_property" ON "public"."deals" USING "btree" ("property_id");



CREATE INDEX "idx_deals_status" ON "public"."deals" USING "btree" ("status");



CREATE INDEX "idx_delivery_runs_channel_created" ON "public"."delivery_runs" USING "btree" ("channel", "created_at" DESC);



CREATE INDEX "idx_delivery_runs_entity" ON "public"."delivery_runs" USING "btree" ("entity_type", "entity_id") WHERE ("entity_type" IS NOT NULL);



CREATE INDEX "idx_delivery_runs_status" ON "public"."delivery_runs" USING "btree" ("status") WHERE ("status" = ANY (ARRAY['queued'::"text", 'failed'::"text"]));



CREATE INDEX "idx_dialer_auto_cycle_leads_lead" ON "public"."dialer_auto_cycle_leads" USING "btree" ("lead_id");



CREATE INDEX "idx_dialer_auto_cycle_leads_user_status" ON "public"."dialer_auto_cycle_leads" USING "btree" ("user_id", "cycle_status", "next_due_at");



CREATE INDEX "idx_dialer_auto_cycle_phones_cycle" ON "public"."dialer_auto_cycle_phones" USING "btree" ("cycle_lead_id", "phone_status", "next_due_at", "phone_position");



CREATE INDEX "idx_dialer_auto_cycle_phones_lead" ON "public"."dialer_auto_cycle_phones" USING "btree" ("lead_id", "phone_status", "next_due_at");



CREATE INDEX "idx_dialer_events_event_type" ON "public"."dialer_events" USING "btree" ("event_type", "created_at" DESC);



CREATE INDEX "idx_dialer_events_lead_id" ON "public"."dialer_events" USING "btree" ("lead_id") WHERE ("lead_id" IS NOT NULL);



CREATE INDEX "idx_dialer_events_session" ON "public"."dialer_events" USING "btree" ("session_id") WHERE ("session_id" IS NOT NULL);



CREATE INDEX "idx_dialer_events_user_created" ON "public"."dialer_events" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_distress_created" ON "public"."distress_events" USING "btree" ("created_at");



CREATE INDEX "idx_distress_events_property_status" ON "public"."distress_events" USING "btree" ("property_id", "status");



CREATE INDEX "idx_distress_events_status" ON "public"."distress_events" USING "btree" ("status");



CREATE INDEX "idx_distress_property" ON "public"."distress_events" USING "btree" ("property_id");



CREATE INDEX "idx_distress_type" ON "public"."distress_events" USING "btree" ("event_type");



CREATE INDEX "idx_dnc_phone" ON "public"."dnc_list" USING "btree" ("phone");



CREATE INDEX "idx_dossier_artifacts_dossier" ON "public"."dossier_artifacts" USING "btree" ("dossier_id") WHERE ("dossier_id" IS NOT NULL);



CREATE INDEX "idx_dossier_artifacts_lead" ON "public"."dossier_artifacts" USING "btree" ("lead_id", "created_at" DESC);



CREATE INDEX "idx_dossier_artifacts_run" ON "public"."dossier_artifacts" USING "btree" ("run_id") WHERE ("run_id" IS NOT NULL);



CREATE INDEX "idx_dossiers_lead_created" ON "public"."dossiers" USING "btree" ("lead_id", "created_at" DESC);



CREATE INDEX "idx_dossiers_lead_status" ON "public"."dossiers" USING "btree" ("lead_id", "status");



CREATE INDEX "idx_dossiers_status" ON "public"."dossiers" USING "btree" ("status") WHERE ("status" = ANY (ARRAY['proposed'::"text", 'reviewed'::"text"]));



CREATE INDEX "idx_eval_ratings_lead_id" ON "public"."eval_ratings" USING "btree" ("lead_id") WHERE ("lead_id" IS NOT NULL);



CREATE INDEX "idx_eval_ratings_verdict" ON "public"."eval_ratings" USING "btree" ("verdict", "workflow", "reviewed_at" DESC);



CREATE INDEX "idx_eval_ratings_workflow_version" ON "public"."eval_ratings" USING "btree" ("workflow", "prompt_version", "reviewed_at" DESC);



CREATE INDEX "idx_event_log_action" ON "public"."event_log" USING "btree" ("action");



CREATE INDEX "idx_event_log_created" ON "public"."event_log" USING "btree" ("created_at");



CREATE INDEX "idx_event_log_entity" ON "public"."event_log" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_event_log_user" ON "public"."event_log" USING "btree" ("user_id");



CREATE INDEX "idx_fact_assertions_artifact" ON "public"."fact_assertions" USING "btree" ("artifact_id");



CREATE INDEX "idx_fact_assertions_lead" ON "public"."fact_assertions" USING "btree" ("lead_id", "created_at" DESC);



CREATE INDEX "idx_fact_assertions_pending" ON "public"."fact_assertions" USING "btree" ("review_status", "created_at" DESC) WHERE ("review_status" = 'pending'::"text");



CREATE INDEX "idx_fact_assertions_run" ON "public"."fact_assertions" USING "btree" ("run_id") WHERE ("run_id" IS NOT NULL);



CREATE UNIQUE INDEX "idx_feature_flags_key" ON "public"."feature_flags" USING "btree" ("flag_key");



CREATE INDEX "idx_heat_scores" ON "public"."dominion_heat_scores" USING "btree" ("heat_score" DESC);



CREATE INDEX "idx_heat_scores_apn" ON "public"."dominion_heat_scores" USING "btree" ("apn");



CREATE INDEX "idx_heat_scores_score" ON "public"."dominion_heat_scores" USING "btree" ("heat_score" DESC);



CREATE INDEX "idx_heat_scores_scored" ON "public"."dominion_heat_scores" USING "btree" ("scored_at" DESC);



CREATE INDEX "idx_intake_leads_duplicate_of" ON "public"."intake_leads" USING "btree" ("duplicate_of_lead_id");



CREATE INDEX "idx_intake_leads_owner_email" ON "public"."intake_leads" USING "btree" ("owner_email");



CREATE INDEX "idx_intake_leads_owner_phone" ON "public"."intake_leads" USING "btree" ("owner_phone");



CREATE INDEX "idx_intake_leads_received_at" ON "public"."intake_leads" USING "btree" ("received_at" DESC);



CREATE INDEX "idx_intake_leads_source_category" ON "public"."intake_leads" USING "btree" ("source_category");



CREATE INDEX "idx_intake_leads_status" ON "public"."intake_leads" USING "btree" ("status");



CREATE INDEX "idx_jeff_control_settings_key" ON "public"."jeff_control_settings" USING "btree" ("control_key");



CREATE INDEX "idx_jeff_interactions_direction_status" ON "public"."jeff_interactions" USING "btree" ("direction", "status", "created_at" DESC);



CREATE INDEX "idx_jeff_interactions_lead" ON "public"."jeff_interactions" USING "btree" ("lead_id", "created_at" DESC);



CREATE INDEX "idx_jeff_interactions_status" ON "public"."jeff_interactions" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "idx_jeff_interactions_task" ON "public"."jeff_interactions" USING "btree" ("task_id") WHERE ("task_id" IS NOT NULL);



CREATE INDEX "idx_jeff_quality_reviews_created" ON "public"."jeff_quality_reviews" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_jeff_quality_reviews_session" ON "public"."jeff_quality_reviews" USING "btree" ("voice_session_id");



CREATE INDEX "idx_jeff_queue_entries_last_called" ON "public"."jeff_queue_entries" USING "btree" ("last_called_at" DESC NULLS LAST);



CREATE INDEX "idx_jeff_queue_entries_tier_status" ON "public"."jeff_queue_entries" USING "btree" ("queue_tier", "queue_status", "approved_at" DESC);



CREATE INDEX "idx_lead_phones_lead_active" ON "public"."lead_phones" USING "btree" ("lead_id") WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_lead_phones_phone" ON "public"."lead_phones" USING "btree" ("phone");



CREATE INDEX "idx_leads_assigned" ON "public"."leads" USING "btree" ("assigned_to");



CREATE INDEX "idx_leads_auto_cycle_suppression" ON "public"."leads" USING "btree" ("from_special_intake", "next_action", "status");



CREATE INDEX "idx_leads_current_dossier_id" ON "public"."leads" USING "btree" ("current_dossier_id") WHERE ("current_dossier_id" IS NOT NULL);



CREATE INDEX "idx_leads_dial_queue" ON "public"."leads" USING "btree" ("assigned_to", "dial_queue_active", "dial_queue_added_at" DESC) WHERE ("dial_queue_active" = true);



CREATE INDEX "idx_leads_follow_up" ON "public"."leads" USING "btree" ("next_follow_up_at");



CREATE INDEX "idx_leads_from_special_intake" ON "public"."leads" USING "btree" ("from_special_intake");



CREATE INDEX "idx_leads_intake_lead_id" ON "public"."leads" USING "btree" ("intake_lead_id");



CREATE INDEX "idx_leads_market" ON "public"."leads" USING "btree" ("market") WHERE ("market" IS NOT NULL);



CREATE INDEX "idx_leads_needs_qualification" ON "public"."leads" USING "btree" ("status", "qualification_route") WHERE (("status" = 'lead'::"public"."lead_status") AND ("qualification_route" IS NULL));



CREATE INDEX "idx_leads_next_action_due" ON "public"."leads" USING "btree" ("next_action_due_at") WHERE ("next_action_due_at" IS NOT NULL);



CREATE INDEX "idx_leads_next_action_null" ON "public"."leads" USING "btree" ("id") WHERE (("next_action" IS NULL) AND ("status" <> ALL (ARRAY['dead'::"public"."lead_status", 'closed'::"public"."lead_status", 'staging'::"public"."lead_status"])));



CREATE INDEX "idx_leads_next_call" ON "public"."leads" USING "btree" ("next_call_scheduled_at") WHERE ("next_call_scheduled_at" IS NOT NULL);



CREATE INDEX "idx_leads_opportunity_score" ON "public"."leads" USING "btree" ("opportunity_score" DESC NULLS LAST) WHERE ("status" <> ALL (ARRAY['dead'::"public"."lead_status", 'closed'::"public"."lead_status"]));



CREATE INDEX "idx_leads_owner_expires" ON "public"."leads" USING "btree" ("owner_id", "claim_expires_at");



CREATE INDEX "idx_leads_pinned" ON "public"."leads" USING "btree" ("pinned") WHERE ("pinned" = true);



CREATE INDEX "idx_leads_priority" ON "public"."leads" USING "btree" ("priority");



CREATE INDEX "idx_leads_property" ON "public"."leads" USING "btree" ("property_id");



CREATE INDEX "idx_leads_property_snapshot_status" ON "public"."leads" USING "btree" ("property_snapshot_status") WHERE ("property_snapshot_status" <> 'enriched'::"text");



CREATE INDEX "idx_leads_qualification_route" ON "public"."leads" USING "btree" ("qualification_route") WHERE ("qualification_route" IS NOT NULL);



CREATE INDEX "idx_leads_skip_trace_status" ON "public"."leads" USING "btree" ("skip_trace_status", "skip_trace_completed_at" DESC);



CREATE INDEX "idx_leads_source" ON "public"."leads" USING "btree" ("source") WHERE ("source" IS NOT NULL);



CREATE INDEX "idx_leads_source_category" ON "public"."leads" USING "btree" ("source_category");



CREATE INDEX "idx_leads_status" ON "public"."leads" USING "btree" ("status");



CREATE INDEX "idx_litigants_phone" ON "public"."litigants" USING "btree" ("phone");



CREATE INDEX "idx_objection_tags_call_log" ON "public"."lead_objection_tags" USING "btree" ("call_log_id") WHERE ("call_log_id" IS NOT NULL);



CREATE INDEX "idx_objection_tags_lead_open" ON "public"."lead_objection_tags" USING "btree" ("lead_id", "status", "created_at" DESC);



CREATE INDEX "idx_objection_tags_tag_status" ON "public"."lead_objection_tags" USING "btree" ("tag", "status", "created_at" DESC);



CREATE INDEX "idx_offers_deal" ON "public"."offers" USING "btree" ("deal_id");



CREATE INDEX "idx_offers_status" ON "public"."offers" USING "btree" ("status");



CREATE INDEX "idx_opt_outs_phone" ON "public"."opt_outs" USING "btree" ("phone");



CREATE INDEX "idx_parcels_apn" ON "public"."parcels" USING "btree" ("apn");



CREATE INDEX "idx_parcels_county" ON "public"."parcels" USING "btree" ("county");



CREATE INDEX "idx_pcs_lead_id" ON "public"."post_call_structures" USING "btree" ("lead_id", "created_at" DESC) WHERE ("lead_id" IS NOT NULL);



CREATE INDEX "idx_pcs_session_id" ON "public"."post_call_structures" USING "btree" ("session_id");



CREATE INDEX "idx_predictions_created" ON "public"."scoring_predictions" USING "btree" ("created_at");



CREATE INDEX "idx_predictions_days" ON "public"."scoring_predictions" USING "btree" ("days_until_distress");



CREATE INDEX "idx_predictions_property" ON "public"."scoring_predictions" USING "btree" ("property_id");



CREATE INDEX "idx_predictions_score" ON "public"."scoring_predictions" USING "btree" ("predictive_score");



CREATE INDEX "idx_predictions_version" ON "public"."scoring_predictions" USING "btree" ("model_version");



CREATE INDEX "idx_prompt_registry_workflow" ON "public"."prompt_registry" USING "btree" ("workflow", "status", "created_at" DESC);



CREATE INDEX "idx_properties_county" ON "public"."properties" USING "btree" ("county");



CREATE INDEX "idx_properties_owner" ON "public"."properties" USING "btree" ("owner_name");



CREATE INDEX "idx_properties_zip" ON "public"."properties" USING "btree" ("zip");



CREATE INDEX "idx_ranger_pushes_apn" ON "public"."ranger_pushes" USING "btree" ("apn");



CREATE INDEX "idx_ranger_pushes_pushed" ON "public"."ranger_pushes" USING "btree" ("pushed_at" DESC);



CREATE INDEX "idx_ranger_pushes_status" ON "public"."ranger_pushes" USING "btree" ("status");



CREATE INDEX "idx_recorded_docs_lead" ON "public"."recorded_documents" USING "btree" ("lead_id");



CREATE INDEX "idx_recorded_docs_property" ON "public"."recorded_documents" USING "btree" ("property_id");



CREATE INDEX "idx_recorded_docs_recording_date" ON "public"."recorded_documents" USING "btree" ("recording_date");



CREATE INDEX "idx_recorded_docs_type" ON "public"."recorded_documents" USING "btree" ("document_type");



CREATE INDEX "idx_research_runs_lead" ON "public"."research_runs" USING "btree" ("lead_id", "created_at" DESC);



CREATE INDEX "idx_research_runs_open" ON "public"."research_runs" USING "btree" ("lead_id", "status") WHERE ("status" = 'open'::"text");



CREATE INDEX "idx_review_queue_agent" ON "public"."review_queue" USING "btree" ("agent_name", "created_at" DESC);



CREATE INDEX "idx_review_queue_entity" ON "public"."review_queue" USING "btree" ("entity_type", "entity_id") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_review_queue_status" ON "public"."review_queue" USING "btree" ("status", "priority" DESC) WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_scoring_composite" ON "public"."scoring_records" USING "btree" ("composite_score");



CREATE INDEX "idx_scoring_created" ON "public"."scoring_records" USING "btree" ("created_at");



CREATE INDEX "idx_scoring_property" ON "public"."scoring_records" USING "btree" ("property_id");



CREATE INDEX "idx_scoring_version" ON "public"."scoring_records" USING "btree" ("model_version");



CREATE INDEX "idx_session_facts_confirmed" ON "public"."session_extracted_facts" USING "btree" ("session_id", "is_confirmed");



CREATE INDEX "idx_session_facts_session" ON "public"."session_extracted_facts" USING "btree" ("session_id");



CREATE INDEX "idx_session_notes_pending_review" ON "public"."session_notes" USING "btree" ("session_id", "is_confirmed") WHERE (("is_ai_generated" = true) AND ("is_confirmed" = false));



CREATE INDEX "idx_session_notes_session_seq" ON "public"."session_notes" USING "btree" ("session_id", "sequence_num");



CREATE INDEX "idx_signals_apn" ON "public"."distress_signals" USING "btree" ("apn");



CREATE INDEX "idx_signals_type" ON "public"."distress_signals" USING "btree" ("signal_type");



CREATE INDEX "idx_sms_messages_lead" ON "public"."sms_messages" USING "btree" ("lead_id", "created_at" DESC);



CREATE INDEX "idx_sms_messages_phone" ON "public"."sms_messages" USING "btree" ("phone", "created_at" DESC);



CREATE INDEX "idx_sms_messages_unread" ON "public"."sms_messages" USING "btree" ("user_id", "read_at") WHERE ("read_at" IS NULL);



CREATE INDEX "idx_snapshots_created_at" ON "public"."lead_stage_snapshots" USING "btree" ("created_at");



CREATE INDEX "idx_snapshots_lead" ON "public"."lead_stage_snapshots" USING "btree" ("lead_id");



CREATE INDEX "idx_snapshots_signal_combo" ON "public"."lead_stage_snapshots" USING "btree" ("signal_combination");



CREATE INDEX "idx_snapshots_to_status" ON "public"."lead_stage_snapshots" USING "btree" ("to_status");



CREATE INDEX "idx_source_costs_period" ON "public"."source_costs" USING "btree" ("period_start") WHERE ("period_start" IS NOT NULL);



CREATE INDEX "idx_source_costs_source" ON "public"."source_costs" USING "btree" ("source");



CREATE INDEX "idx_tasks_assigned" ON "public"."tasks" USING "btree" ("assigned_to");



CREATE INDEX "idx_tasks_due" ON "public"."tasks" USING "btree" ("due_at");



CREATE INDEX "idx_tasks_jeff_interaction" ON "public"."tasks" USING "btree" ("jeff_interaction_id") WHERE ("jeff_interaction_id" IS NOT NULL);



CREATE INDEX "idx_tasks_lead_pending" ON "public"."tasks" USING "btree" ("lead_id", "status", "due_at") WHERE (("status")::"text" = 'pending'::"text");



CREATE INDEX "idx_tasks_source" ON "public"."tasks" USING "btree" ("source_type", "source_key");



CREATE INDEX "idx_tasks_status" ON "public"."tasks" USING "btree" ("status");



CREATE INDEX "idx_tasks_type" ON "public"."tasks" USING "btree" ("task_type");



CREATE INDEX "idx_tasks_voice_session" ON "public"."tasks" USING "btree" ("voice_session_id") WHERE ("voice_session_id" IS NOT NULL);



CREATE INDEX "idx_user_profiles_email" ON "public"."user_profiles" USING "btree" ("email");



CREATE INDEX "idx_user_profiles_role" ON "public"."user_profiles" USING "btree" ("role");



CREATE INDEX "idx_voice_sessions_auto_cycle_lead" ON "public"."voice_sessions" USING "btree" ("auto_cycle_lead_id") WHERE ("auto_cycle_lead_id" IS NOT NULL);



CREATE INDEX "idx_voice_sessions_created" ON "public"."voice_sessions" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_voice_sessions_lead" ON "public"."voice_sessions" USING "btree" ("lead_id") WHERE ("lead_id" IS NOT NULL);



CREATE INDEX "idx_voice_sessions_status" ON "public"."voice_sessions" USING "btree" ("status");



CREATE INDEX "idx_voice_sessions_vapi" ON "public"."voice_sessions" USING "btree" ("vapi_call_id") WHERE ("vapi_call_id" IS NOT NULL);



CREATE INDEX "idx_workflow_runs_name" ON "public"."workflow_runs" USING "btree" ("workflow_name");



CREATE INDEX "idx_workflow_runs_started" ON "public"."workflow_runs" USING "btree" ("started_at" DESC);



CREATE INDEX "idx_workflow_runs_status" ON "public"."workflow_runs" USING "btree" ("status");



CREATE UNIQUE INDEX "uq_devotional_date" ON "public"."daily_devotional" USING "btree" ("display_date");



CREATE UNIQUE INDEX "uq_tasks_source_identity" ON "public"."tasks" USING "btree" ("source_type", "source_key") WHERE (("source_type" IS NOT NULL) AND ("source_key" IS NOT NULL));



CREATE RULE "scoring_predictions_no_update" AS
    ON UPDATE TO "public"."scoring_predictions" DO INSTEAD NOTHING;



CREATE OR REPLACE TRIGGER "jeff_interactions_updated_at" BEFORE UPDATE ON "public"."jeff_interactions" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "tg_call_session_transition" BEFORE UPDATE OF "status" ON "public"."call_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_call_session_transition"();



CREATE OR REPLACE TRIGGER "tg_call_sessions_updated_at" BEFORE UPDATE ON "public"."call_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."dialer_set_updated_at"();



CREATE OR REPLACE TRIGGER "tg_contradiction_flags_updated_at" BEFORE UPDATE ON "public"."lead_contradiction_flags" FOR EACH ROW EXECUTE FUNCTION "public"."update_lead_contradiction_flags_updated_at"();



CREATE OR REPLACE TRIGGER "tg_dialer_auto_cycle_leads_updated_at" BEFORE UPDATE ON "public"."dialer_auto_cycle_leads" FOR EACH ROW EXECUTE FUNCTION "public"."dialer_set_updated_at"();



CREATE OR REPLACE TRIGGER "tg_dialer_auto_cycle_phones_updated_at" BEFORE UPDATE ON "public"."dialer_auto_cycle_phones" FOR EACH ROW EXECUTE FUNCTION "public"."dialer_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_campaigns_updated" BEFORE UPDATE ON "public"."campaigns" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_contacts_updated" BEFORE UPDATE ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_deals_set_entered_dispo_at" BEFORE INSERT ON "public"."deals" FOR EACH ROW EXECUTE FUNCTION "public"."set_entered_dispo_at"();



CREATE OR REPLACE TRIGGER "trg_deals_updated" BEFORE UPDATE ON "public"."deals" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_distress_events_immutable" BEFORE DELETE OR UPDATE ON "public"."distress_events" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_mutation"();



CREATE OR REPLACE TRIGGER "trg_eval_ratings_updated_at" BEFORE UPDATE ON "public"."eval_ratings" FOR EACH ROW EXECUTE FUNCTION "public"."update_eval_ratings_updated_at"();



CREATE OR REPLACE TRIGGER "trg_event_log_immutable" BEFORE DELETE OR UPDATE ON "public"."event_log" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_mutation"();



CREATE OR REPLACE TRIGGER "trg_leads_set_entered_dispo_at" AFTER UPDATE OF "status" ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."set_entered_dispo_at"();



CREATE OR REPLACE TRIGGER "trg_leads_updated" BEFORE UPDATE ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_properties_updated" BEFORE UPDATE ON "public"."properties" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_scoring_records_immutable" BEFORE DELETE OR UPDATE ON "public"."scoring_records" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_mutation"();



CREATE OR REPLACE TRIGGER "trg_set_entered_dispo_at" BEFORE INSERT ON "public"."deals" FOR EACH ROW EXECUTE FUNCTION "public"."set_entered_dispo_at"();



CREATE OR REPLACE TRIGGER "trg_tasks_updated" BEFORE UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_user_profiles_updated" BEFORE UPDATE ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "voice_sessions_updated_at" BEFORE UPDATE ON "public"."voice_sessions" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



ALTER TABLE ONLY "public"."ad_actions"
    ADD CONSTRAINT "ad_actions_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "public"."ad_reviews"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ads_ad_groups"
    ADD CONSTRAINT "ads_ad_groups_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."ads_campaigns"("id");



ALTER TABLE ONLY "public"."ads_ads"
    ADD CONSTRAINT "ads_ads_ad_group_id_fkey" FOREIGN KEY ("ad_group_id") REFERENCES "public"."ads_ad_groups"("id");



ALTER TABLE ONLY "public"."ads_ads"
    ADD CONSTRAINT "ads_ads_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."ads_campaigns"("id");



ALTER TABLE ONLY "public"."ads_alerts"
    ADD CONSTRAINT "ads_alerts_briefing_id_fkey" FOREIGN KEY ("briefing_id") REFERENCES "public"."ads_intelligence_briefings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ads_approvals"
    ADD CONSTRAINT "ads_approvals_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."ads_approvals"
    ADD CONSTRAINT "ads_approvals_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "public"."ads_recommendations"("id");



ALTER TABLE ONLY "public"."ads_campaign_budgets"
    ADD CONSTRAINT "ads_campaign_budgets_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."ads_campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ads_daily_metrics"
    ADD CONSTRAINT "ads_daily_metrics_ad_group_id_fkey" FOREIGN KEY ("ad_group_id") REFERENCES "public"."ads_ad_groups"("id");



ALTER TABLE ONLY "public"."ads_daily_metrics"
    ADD CONSTRAINT "ads_daily_metrics_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."ads_campaigns"("id");



ALTER TABLE ONLY "public"."ads_daily_metrics"
    ADD CONSTRAINT "ads_daily_metrics_keyword_id_fkey" FOREIGN KEY ("keyword_id") REFERENCES "public"."ads_keywords"("id");



ALTER TABLE ONLY "public"."ads_device_metrics"
    ADD CONSTRAINT "ads_device_metrics_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."ads_campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ads_geo_metrics"
    ADD CONSTRAINT "ads_geo_metrics_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."ads_campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ads_implementation_logs"
    ADD CONSTRAINT "ads_implementation_logs_approval_id_fkey" FOREIGN KEY ("approval_id") REFERENCES "public"."ads_approvals"("id");



ALTER TABLE ONLY "public"."ads_implementation_logs"
    ADD CONSTRAINT "ads_implementation_logs_implemented_by_fkey" FOREIGN KEY ("implemented_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."ads_implementation_logs"
    ADD CONSTRAINT "ads_implementation_logs_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "public"."ads_recommendations"("id");



ALTER TABLE ONLY "public"."ads_keywords"
    ADD CONSTRAINT "ads_keywords_ad_group_id_fkey" FOREIGN KEY ("ad_group_id") REFERENCES "public"."ads_ad_groups"("id");



ALTER TABLE ONLY "public"."ads_lead_attribution"
    ADD CONSTRAINT "ads_lead_attribution_ad_group_id_fkey" FOREIGN KEY ("ad_group_id") REFERENCES "public"."ads_ad_groups"("id");



ALTER TABLE ONLY "public"."ads_lead_attribution"
    ADD CONSTRAINT "ads_lead_attribution_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."ads_campaigns"("id");



ALTER TABLE ONLY "public"."ads_lead_attribution"
    ADD CONSTRAINT "ads_lead_attribution_keyword_id_fkey" FOREIGN KEY ("keyword_id") REFERENCES "public"."ads_keywords"("id");



ALTER TABLE ONLY "public"."ads_lead_attribution"
    ADD CONSTRAINT "ads_lead_attribution_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ads_lead_attribution"
    ADD CONSTRAINT "ads_lead_attribution_search_term_id_fkey" FOREIGN KEY ("search_term_id") REFERENCES "public"."ads_search_terms"("id");



ALTER TABLE ONLY "public"."ads_negative_keywords"
    ADD CONSTRAINT "ads_negative_keywords_ad_group_id_fkey" FOREIGN KEY ("ad_group_id") REFERENCES "public"."ads_ad_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ads_negative_keywords"
    ADD CONSTRAINT "ads_negative_keywords_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."ads_campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ads_recommendations"
    ADD CONSTRAINT "ads_recommendations_related_ad_group_id_fkey" FOREIGN KEY ("related_ad_group_id") REFERENCES "public"."ads_ad_groups"("id");



ALTER TABLE ONLY "public"."ads_recommendations"
    ADD CONSTRAINT "ads_recommendations_related_campaign_id_fkey" FOREIGN KEY ("related_campaign_id") REFERENCES "public"."ads_campaigns"("id");



ALTER TABLE ONLY "public"."ads_recommendations"
    ADD CONSTRAINT "ads_recommendations_related_keyword_id_fkey" FOREIGN KEY ("related_keyword_id") REFERENCES "public"."ads_keywords"("id");



ALTER TABLE ONLY "public"."ads_recommendations"
    ADD CONSTRAINT "ads_recommendations_related_lead_id_fkey" FOREIGN KEY ("related_lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ads_recommendations"
    ADD CONSTRAINT "ads_recommendations_related_search_term_id_fkey" FOREIGN KEY ("related_search_term_id") REFERENCES "public"."ads_search_terms"("id");



ALTER TABLE ONLY "public"."ads_search_terms"
    ADD CONSTRAINT "ads_search_terms_ad_group_id_fkey" FOREIGN KEY ("ad_group_id") REFERENCES "public"."ads_ad_groups"("id");



ALTER TABLE ONLY "public"."ads_search_terms"
    ADD CONSTRAINT "ads_search_terms_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."ads_campaigns"("id");



ALTER TABLE ONLY "public"."ads_search_terms"
    ADD CONSTRAINT "ads_search_terms_keyword_id_fkey" FOREIGN KEY ("keyword_id") REFERENCES "public"."ads_keywords"("id");



ALTER TABLE ONLY "public"."ads_system_prompts"
    ADD CONSTRAINT "ads_system_prompts_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."buyers"
    ADD CONSTRAINT "buyers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."call_sessions"
    ADD CONSTRAINT "call_sessions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."calls_log"
    ADD CONSTRAINT "calls_log_dialer_session_id_fkey" FOREIGN KEY ("dialer_session_id") REFERENCES "public"."call_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."calls_log"
    ADD CONSTRAINT "calls_log_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."calls_log"
    ADD CONSTRAINT "calls_log_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."calls_log"
    ADD CONSTRAINT "calls_log_voice_session_id_fkey" FOREIGN KEY ("voice_session_id") REFERENCES "public"."voice_sessions"("id");



ALTER TABLE ONLY "public"."campaign_leads"
    ADD CONSTRAINT "campaign_leads_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_leads"
    ADD CONSTRAINT "campaign_leads_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deal_buyers"
    ADD CONSTRAINT "deal_buyers_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."buyers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deal_buyers"
    ADD CONSTRAINT "deal_buyers_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."buyers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dialer_ai_traces"
    ADD CONSTRAINT "dialer_ai_traces_call_log_id_fkey" FOREIGN KEY ("call_log_id") REFERENCES "public"."calls_log"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dialer_ai_traces"
    ADD CONSTRAINT "dialer_ai_traces_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dialer_ai_traces"
    ADD CONSTRAINT "dialer_ai_traces_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."call_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dialer_auto_cycle_leads"
    ADD CONSTRAINT "dialer_auto_cycle_leads_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dialer_auto_cycle_leads"
    ADD CONSTRAINT "dialer_auto_cycle_leads_next_phone_id_fkey" FOREIGN KEY ("next_phone_id") REFERENCES "public"."lead_phones"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dialer_auto_cycle_phones"
    ADD CONSTRAINT "dialer_auto_cycle_phones_cycle_lead_id_fkey" FOREIGN KEY ("cycle_lead_id") REFERENCES "public"."dialer_auto_cycle_leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dialer_auto_cycle_phones"
    ADD CONSTRAINT "dialer_auto_cycle_phones_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dialer_auto_cycle_phones"
    ADD CONSTRAINT "dialer_auto_cycle_phones_phone_id_fkey" FOREIGN KEY ("phone_id") REFERENCES "public"."lead_phones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dialer_events"
    ADD CONSTRAINT "dialer_events_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dialer_events"
    ADD CONSTRAINT "dialer_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."call_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."distress_events"
    ADD CONSTRAINT "distress_events_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."distress_signals"
    ADD CONSTRAINT "distress_signals_apn_fkey" FOREIGN KEY ("apn") REFERENCES "public"."parcels"("apn") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dominion_heat_scores"
    ADD CONSTRAINT "dominion_heat_scores_apn_fkey" FOREIGN KEY ("apn") REFERENCES "public"."parcels"("apn");



ALTER TABLE ONLY "public"."dossier_artifacts"
    ADD CONSTRAINT "dossier_artifacts_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossiers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dossier_artifacts"
    ADD CONSTRAINT "dossier_artifacts_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dossier_artifacts"
    ADD CONSTRAINT "dossier_artifacts_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dossier_artifacts"
    ADD CONSTRAINT "dossier_artifacts_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."research_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dossiers"
    ADD CONSTRAINT "dossiers_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dossiers"
    ADD CONSTRAINT "dossiers_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."eval_ratings"
    ADD CONSTRAINT "eval_ratings_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."eval_ratings"
    ADD CONSTRAINT "eval_ratings_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fact_assertions"
    ADD CONSTRAINT "fact_assertions_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "public"."dossier_artifacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fact_assertions"
    ADD CONSTRAINT "fact_assertions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fact_assertions"
    ADD CONSTRAINT "fact_assertions_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."research_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."intake_leads"
    ADD CONSTRAINT "intake_leads_claimed_by_fkey" FOREIGN KEY ("claimed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."intake_leads"
    ADD CONSTRAINT "intake_leads_duplicate_of_lead_id_fkey" FOREIGN KEY ("duplicate_of_lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."intake_leads"
    ADD CONSTRAINT "intake_leads_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."jeff_interactions"
    ADD CONSTRAINT "jeff_interactions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."jeff_queue_entries"
    ADD CONSTRAINT "jeff_queue_entries_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_contradiction_flags"
    ADD CONSTRAINT "lead_contradiction_flags_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "public"."dossier_artifacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lead_contradiction_flags"
    ADD CONSTRAINT "lead_contradiction_flags_fact_id_fkey" FOREIGN KEY ("fact_id") REFERENCES "public"."fact_assertions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lead_contradiction_flags"
    ADD CONSTRAINT "lead_contradiction_flags_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_phones"
    ADD CONSTRAINT "lead_phones_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_phones"
    ADD CONSTRAINT "lead_phones_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lead_stage_snapshots"
    ADD CONSTRAINT "lead_stage_snapshots_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_stage_snapshots"
    ADD CONSTRAINT "lead_stage_snapshots_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_current_dossier_id_fkey" FOREIGN KEY ("current_dossier_id") REFERENCES "public"."dossiers"("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_intake_lead_id_fkey" FOREIGN KEY ("intake_lead_id") REFERENCES "public"."intake_leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."offers"
    ADD CONSTRAINT "offers_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_call_structures"
    ADD CONSTRAINT "post_call_structures_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."post_call_structures"
    ADD CONSTRAINT "post_call_structures_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."call_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recorded_documents"
    ADD CONSTRAINT "recorded_documents_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recorded_documents"
    ADD CONSTRAINT "recorded_documents_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."research_runs"
    ADD CONSTRAINT "research_runs_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossiers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."research_runs"
    ADD CONSTRAINT "research_runs_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."research_runs"
    ADD CONSTRAINT "research_runs_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."review_queue"
    ADD CONSTRAINT "review_queue_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scoring_predictions"
    ADD CONSTRAINT "scoring_predictions_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scoring_records"
    ADD CONSTRAINT "scoring_records_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_extracted_facts"
    ADD CONSTRAINT "session_extracted_facts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."call_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_notes"
    ADD CONSTRAINT "session_notes_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."call_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sms_messages"
    ADD CONSTRAINT "sms_messages_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."voice_sessions"
    ADD CONSTRAINT "voice_sessions_auto_cycle_lead_id_fkey" FOREIGN KEY ("auto_cycle_lead_id") REFERENCES "public"."dialer_auto_cycle_leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."voice_sessions"
    ADD CONSTRAINT "voice_sessions_auto_cycle_phone_id_fkey" FOREIGN KEY ("auto_cycle_phone_id") REFERENCES "public"."dialer_auto_cycle_phones"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."voice_sessions"
    ADD CONSTRAINT "voice_sessions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."voice_sessions"
    ADD CONSTRAINT "voice_sessions_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE SET NULL;



CREATE POLICY "Anyone can claim unowned leads" ON "public"."leads" FOR UPDATE USING (("owner_id" IS NULL));



CREATE POLICY "Authenticated full access on ad_actions" ON "public"."ad_actions" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated full access on ad_reviews" ON "public"."ad_reviews" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated full access on ad_snapshots" ON "public"."ad_snapshots" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated full access on audit_log" ON "public"."audit_log" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated full access on call_sessions" ON "public"."call_sessions" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated full access on calls_log" ON "public"."calls_log" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated full access on dialer_auto_cycle_leads" ON "public"."dialer_auto_cycle_leads" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated full access on dialer_auto_cycle_phones" ON "public"."dialer_auto_cycle_phones" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated full access on dialer_events" ON "public"."dialer_events" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated full access on dnc_list" ON "public"."dnc_list" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated full access on litigants" ON "public"."litigants" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated full access on opt_outs" ON "public"."opt_outs" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated full access on post_call_structures" ON "public"."post_call_structures" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated full access on scoring_predictions" ON "public"."scoring_predictions" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated full access on session_extracted_facts" ON "public"."session_extracted_facts" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated full access on session_notes" ON "public"."session_notes" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users can delete deal_buyers" ON "public"."deal_buyers" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can insert ad_actions" ON "public"."ad_actions" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can insert ad_reviews" ON "public"."ad_reviews" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can insert ad_snapshots" ON "public"."ad_snapshots" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can insert buyers" ON "public"."buyers" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can insert deal_buyers" ON "public"."deal_buyers" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can insert eval_ratings" ON "public"."eval_ratings" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can insert source_costs" ON "public"."source_costs" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can insert system prompts" ON "public"."ads_system_prompts" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can manage ads_ad_groups" ON "public"."ads_ad_groups" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can manage ads_approvals" ON "public"."ads_approvals" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can manage ads_campaigns" ON "public"."ads_campaigns" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can manage ads_daily_metrics" ON "public"."ads_daily_metrics" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can manage ads_implementation_logs" ON "public"."ads_implementation_logs" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can manage ads_keywords" ON "public"."ads_keywords" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can manage ads_lead_attribution" ON "public"."ads_lead_attribution" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can manage ads_recommendations" ON "public"."ads_recommendations" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can manage ads_search_terms" ON "public"."ads_search_terms" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can manage ads_sync_logs" ON "public"."ads_sync_logs" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can manage lead phones" ON "public"."lead_phones" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users can manage source_costs" ON "public"."source_costs" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can read Jeff interactions" ON "public"."jeff_interactions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read ad_actions" ON "public"."ad_actions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read ad_reviews" ON "public"."ad_reviews" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read ad_snapshots" ON "public"."ad_snapshots" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read all buyers" ON "public"."buyers" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read all deal_buyers" ON "public"."deal_buyers" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read eval_ratings" ON "public"."eval_ratings" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can read source_costs" ON "public"."source_costs" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read system prompts" ON "public"."ads_system_prompts" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read voice sessions" ON "public"."voice_sessions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can update ad_actions" ON "public"."ad_actions" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can update ad_reviews" ON "public"."ad_reviews" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can update buyers" ON "public"."buyers" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users can update deal_buyers" ON "public"."deal_buyers" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users can update eval_ratings" ON "public"."eval_ratings" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can update source_costs" ON "public"."source_costs" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users can update system prompts" ON "public"."ads_system_prompts" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Dev user can insert leads" ON "public"."leads" FOR INSERT WITH CHECK (true);



CREATE POLICY "Owners can update their leads" ON "public"."leads" FOR UPDATE USING ((("owner_id" = "auth"."uid"()) OR ("owner_id" IS NULL)));



CREATE POLICY "Owners can update their own leads" ON "public"."leads" FOR UPDATE USING ((("owner_id" = "auth"."uid"()) OR ("owner_id" = 'c0b4d733-607b-4c3c-8049-9e4ba207a258'::"uuid")));



CREATE POLICY "Service role can manage Jeff interactions" ON "public"."jeff_interactions" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage voice sessions" ON "public"."voice_sessions" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access" ON "public"."daily_devotional" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access ad_actions" ON "public"."ad_actions" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access ad_reviews" ON "public"."ad_reviews" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access ad_snapshots" ON "public"."ad_snapshots" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access on recorded_documents" ON "public"."recorded_documents" USING (true) WITH CHECK (true);



CREATE POLICY "Team can insert leads" ON "public"."leads" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Team read all leads" ON "public"."leads" FOR SELECT USING (true);



ALTER TABLE "public"."ad_actions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ad_reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ad_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ads_ad_groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ads_ads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ads_approvals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ads_campaigns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ads_daily_metrics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ads_implementation_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ads_keywords" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ads_lead_attribution" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ads_recommendations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ads_search_terms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ads_sync_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ads_system_prompts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_runs_read" ON "public"."agent_runs" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "agent_runs_service_write" ON "public"."agent_runs" TO "service_role" USING (true);



CREATE POLICY "allow_all" ON "public"."daily_devotional" USING (true) WITH CHECK (true);



ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "authenticated_insert_contradiction_flags" ON "public"."lead_contradiction_flags" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "authenticated_read_contradiction_flags" ON "public"."lead_contradiction_flags" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated_update_contradiction_flags" ON "public"."lead_contradiction_flags" FOR UPDATE TO "authenticated" USING (true);



ALTER TABLE "public"."buyers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."call_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."calls_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "calls_log_insert_authenticated" ON "public"."calls_log" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "calls_log_select_authenticated" ON "public"."calls_log" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "calls_log_update_own" ON "public"."calls_log" FOR UPDATE USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."campaigns" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaigns_delete" ON "public"."campaigns" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "campaigns_insert" ON "public"."campaigns" FOR INSERT WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'agent'::"public"."user_role"])));



CREATE POLICY "campaigns_select" ON "public"."campaigns" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "campaigns_update" ON "public"."campaigns" FOR UPDATE USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'agent'::"public"."user_role"])));



ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contacts_delete" ON "public"."contacts" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "contacts_insert" ON "public"."contacts" FOR INSERT WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'agent'::"public"."user_role"])));



CREATE POLICY "contacts_select" ON "public"."contacts" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "contacts_update" ON "public"."contacts" FOR UPDATE USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'agent'::"public"."user_role"])));



ALTER TABLE "public"."daily_devotional" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deal_buyers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "deals_delete" ON "public"."deals" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "deals_insert" ON "public"."deals" FOR INSERT WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'agent'::"public"."user_role"])));



CREATE POLICY "deals_select" ON "public"."deals" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "deals_update" ON "public"."deals" FOR UPDATE USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'agent'::"public"."user_role"])));



ALTER TABLE "public"."dialer_ai_traces" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dialer_auto_cycle_leads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dialer_auto_cycle_phones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dialer_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."distress_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "distress_events_insert" ON "public"."distress_events" FOR INSERT WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'agent'::"public"."user_role"])));



CREATE POLICY "distress_events_select" ON "public"."distress_events" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."dnc_list" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dossier_artifacts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dossier_artifacts_auth_all" ON "public"."dossier_artifacts" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."dossiers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dossiers_auth_all" ON "public"."dossiers" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."eval_ratings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "event_log_insert" ON "public"."event_log" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "event_log_select_admin" ON "public"."event_log" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "event_log_select_own" ON "public"."event_log" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."fact_assertions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fact_assertions_auth_all" ON "public"."fact_assertions" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."feature_flags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "feature_flags_read" ON "public"."feature_flags" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "feature_flags_service_write" ON "public"."feature_flags" TO "service_role" USING (true);



ALTER TABLE "public"."intake_leads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "intake_leads_insert_policy" ON "public"."intake_leads" FOR INSERT WITH CHECK (false);



CREATE POLICY "intake_leads_select_policy" ON "public"."intake_leads" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "intake_leads_update_policy" ON "public"."intake_leads" FOR UPDATE USING (false);



ALTER TABLE "public"."intake_providers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "intake_providers_insert_policy" ON "public"."intake_providers" FOR INSERT WITH CHECK (false);



CREATE POLICY "intake_providers_select_policy" ON "public"."intake_providers" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "intake_providers_update_policy" ON "public"."intake_providers" FOR UPDATE USING (false);



ALTER TABLE "public"."jeff_interactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lead_contradiction_flags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lead_objection_tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lead_phones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "leads_claim" ON "public"."leads" FOR UPDATE USING ((("public"."get_user_role"() = 'agent'::"public"."user_role") AND ("assigned_to" IS NULL)));



CREATE POLICY "leads_delete" ON "public"."leads" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "leads_insert" ON "public"."leads" FOR INSERT WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'agent'::"public"."user_role"])));



CREATE POLICY "leads_select" ON "public"."leads" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "leads_update_admin" ON "public"."leads" FOR UPDATE USING ("public"."is_admin"());



CREATE POLICY "leads_update_own" ON "public"."leads" FOR UPDATE USING ((("public"."get_user_role"() = 'agent'::"public"."user_role") AND ("assigned_to" = "auth"."uid"())));



ALTER TABLE "public"."litigants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "objection_tags_read" ON "public"."lead_objection_tags" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "objection_tags_write" ON "public"."lead_objection_tags" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."offers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "offers_insert" ON "public"."offers" FOR INSERT WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'agent'::"public"."user_role"])));



CREATE POLICY "offers_select" ON "public"."offers" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "offers_update" ON "public"."offers" FOR UPDATE USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'agent'::"public"."user_role"])));



CREATE POLICY "operators_read_own_session_traces" ON "public"."dialer_ai_traces" FOR SELECT TO "authenticated" USING (("session_id" IN ( SELECT "call_sessions"."id"
   FROM "public"."call_sessions"
  WHERE ("call_sessions"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."opt_outs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."post_call_structures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."prompt_registry" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "prompt_registry_read" ON "public"."prompt_registry" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "prompt_registry_write" ON "public"."prompt_registry" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."properties" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "properties_delete" ON "public"."properties" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "properties_insert" ON "public"."properties" FOR INSERT WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'agent'::"public"."user_role"])));



CREATE POLICY "properties_select" ON "public"."properties" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "properties_update" ON "public"."properties" FOR UPDATE USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'agent'::"public"."user_role"])));



ALTER TABLE "public"."recorded_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."research_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "research_runs_auth_all" ON "public"."research_runs" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."review_queue" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "review_queue_operator_update" ON "public"."review_queue" FOR UPDATE TO "authenticated" USING (("status" = 'pending'::"text")) WITH CHECK (("status" = ANY (ARRAY['approved'::"text", 'rejected'::"text"])));



CREATE POLICY "review_queue_read" ON "public"."review_queue" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "review_queue_service_write" ON "public"."review_queue" TO "service_role" USING (true);



ALTER TABLE "public"."scoring_predictions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scoring_records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "scoring_records_insert" ON "public"."scoring_records" FOR INSERT WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'agent'::"public"."user_role"])));



CREATE POLICY "scoring_records_select" ON "public"."scoring_records" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "service_role_all_ai_traces" ON "public"."dialer_ai_traces" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_all_contradiction_flags" ON "public"."lead_contradiction_flags" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."session_extracted_facts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."session_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."source_costs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."source_policies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "source_policies_auth_all" ON "public"."source_policies" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tasks_insert" ON "public"."tasks" FOR INSERT WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'agent'::"public"."user_role"])));



CREATE POLICY "tasks_select" ON "public"."tasks" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "tasks_update_admin" ON "public"."tasks" FOR UPDATE USING ("public"."is_admin"());



CREATE POLICY "tasks_update_own" ON "public"."tasks" FOR UPDATE USING ((("public"."get_user_role"() = 'agent'::"public"."user_role") AND ("assigned_to" = "auth"."uid"())));



ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_profiles_select" ON "public"."user_profiles" FOR SELECT USING (true);



CREATE POLICY "user_profiles_update_admin" ON "public"."user_profiles" FOR UPDATE USING ("public"."is_admin"());



CREATE POLICY "user_profiles_update_own" ON "public"."user_profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."voice_sessions" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."append_live_note"("p_call_log_id" "uuid", "p_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."append_live_note"("p_call_log_id" "uuid", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."append_live_note"("p_call_log_id" "uuid", "p_note" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_dominion_heat_score"("p_apn" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_dominion_heat_score"("p_apn" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_dominion_heat_score"("p_apn" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_push_status"("p_request_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."check_push_status"("p_request_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_push_status"("p_request_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."count_leads_missing_phone_rows"() TO "anon";
GRANT ALL ON FUNCTION "public"."count_leads_missing_phone_rows"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_leads_missing_phone_rows"() TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_customer_file"("p_lead_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_customer_file"("p_lead_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_customer_file"("p_lead_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."dialer_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."dialer_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."dialer_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_call_session_transition"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_call_session_transition"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_call_session_transition"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_lead_call_counters"("p_lead_id" "uuid", "p_is_live_answer" boolean, "p_is_voicemail" boolean, "p_last_contact_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_lead_call_counters"("p_lead_id" "uuid", "p_is_live_answer" boolean, "p_is_voicemail" boolean, "p_last_contact_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_lead_call_counters"("p_lead_id" "uuid", "p_is_live_answer" boolean, "p_is_voicemail" boolean, "p_last_contact_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_lead_call_counters"("p_lead_id" "uuid", "p_is_live" boolean, "p_is_voicemail" boolean, "p_last_contact_at" timestamp with time zone, "p_call_sequence_step" integer, "p_next_call_scheduled_at" timestamp with time zone, "p_clear_sequence" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_lead_call_counters"("p_lead_id" "uuid", "p_is_live" boolean, "p_is_voicemail" boolean, "p_last_contact_at" timestamp with time zone, "p_call_sequence_step" integer, "p_next_call_scheduled_at" timestamp with time zone, "p_clear_sequence" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_lead_call_counters"("p_lead_id" "uuid", "p_is_live" boolean, "p_is_voicemail" boolean, "p_last_contact_at" timestamp with time zone, "p_call_sequence_step" integer, "p_next_call_scheduled_at" timestamp with time zone, "p_clear_sequence" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_lead_phone_call_count"("p_lead_id" "uuid", "p_phone_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_lead_phone_call_count"("p_lead_id" "uuid", "p_phone_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_lead_phone_call_count"("p_lead_id" "uuid", "p_phone_suffix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_mutation"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_mutation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_mutation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."push_all_qualifying"("p_min_score" integer, "p_sentinel_url" "text", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."push_all_qualifying"("p_min_score" integer, "p_sentinel_url" "text", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."push_all_qualifying"("p_min_score" integer, "p_sentinel_url" "text", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."push_to_sentinel"("p_apn" "text", "p_sentinel_url" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."push_to_sentinel"("p_apn" "text", "p_sentinel_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."push_to_sentinel"("p_apn" "text", "p_sentinel_url" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_entered_dispo_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_entered_dispo_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_entered_dispo_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_eval_ratings_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_eval_ratings_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_eval_ratings_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_lead_contradiction_flags_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_lead_contradiction_flags_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_lead_contradiction_flags_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."ad_actions" TO "anon";
GRANT ALL ON TABLE "public"."ad_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."ad_actions" TO "service_role";



GRANT ALL ON TABLE "public"."ad_reviews" TO "anon";
GRANT ALL ON TABLE "public"."ad_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."ad_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."ad_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."ad_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."ad_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."ads_ad_groups" TO "anon";
GRANT ALL ON TABLE "public"."ads_ad_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."ads_ad_groups" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ads_ad_groups_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ads_ad_groups_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ads_ad_groups_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ads_ads" TO "anon";
GRANT ALL ON TABLE "public"."ads_ads" TO "authenticated";
GRANT ALL ON TABLE "public"."ads_ads" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ads_ads_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ads_ads_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ads_ads_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ads_alerts" TO "anon";
GRANT ALL ON TABLE "public"."ads_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."ads_alerts" TO "service_role";



GRANT ALL ON TABLE "public"."ads_approvals" TO "anon";
GRANT ALL ON TABLE "public"."ads_approvals" TO "authenticated";
GRANT ALL ON TABLE "public"."ads_approvals" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ads_approvals_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ads_approvals_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ads_approvals_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ads_campaign_budgets" TO "anon";
GRANT ALL ON TABLE "public"."ads_campaign_budgets" TO "authenticated";
GRANT ALL ON TABLE "public"."ads_campaign_budgets" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ads_campaign_budgets_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ads_campaign_budgets_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ads_campaign_budgets_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ads_campaigns" TO "anon";
GRANT ALL ON TABLE "public"."ads_campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."ads_campaigns" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ads_campaigns_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ads_campaigns_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ads_campaigns_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ads_conversion_actions" TO "anon";
GRANT ALL ON TABLE "public"."ads_conversion_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."ads_conversion_actions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ads_conversion_actions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ads_conversion_actions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ads_conversion_actions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ads_daily_metrics" TO "anon";
GRANT ALL ON TABLE "public"."ads_daily_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."ads_daily_metrics" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ads_daily_metrics_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ads_daily_metrics_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ads_daily_metrics_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ads_device_metrics" TO "anon";
GRANT ALL ON TABLE "public"."ads_device_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."ads_device_metrics" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ads_device_metrics_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ads_device_metrics_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ads_device_metrics_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ads_geo_metrics" TO "anon";
GRANT ALL ON TABLE "public"."ads_geo_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."ads_geo_metrics" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ads_geo_metrics_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ads_geo_metrics_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ads_geo_metrics_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ads_implementation_logs" TO "anon";
GRANT ALL ON TABLE "public"."ads_implementation_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."ads_implementation_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ads_implementation_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ads_implementation_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ads_implementation_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ads_intelligence_briefings" TO "anon";
GRANT ALL ON TABLE "public"."ads_intelligence_briefings" TO "authenticated";
GRANT ALL ON TABLE "public"."ads_intelligence_briefings" TO "service_role";



GRANT ALL ON TABLE "public"."ads_keywords" TO "anon";
GRANT ALL ON TABLE "public"."ads_keywords" TO "authenticated";
GRANT ALL ON TABLE "public"."ads_keywords" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ads_keywords_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ads_keywords_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ads_keywords_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ads_lead_attribution" TO "anon";
GRANT ALL ON TABLE "public"."ads_lead_attribution" TO "authenticated";
GRANT ALL ON TABLE "public"."ads_lead_attribution" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ads_lead_attribution_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ads_lead_attribution_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ads_lead_attribution_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ads_negative_keywords" TO "anon";
GRANT ALL ON TABLE "public"."ads_negative_keywords" TO "authenticated";
GRANT ALL ON TABLE "public"."ads_negative_keywords" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ads_negative_keywords_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ads_negative_keywords_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ads_negative_keywords_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ads_recommendations" TO "anon";
GRANT ALL ON TABLE "public"."ads_recommendations" TO "authenticated";
GRANT ALL ON TABLE "public"."ads_recommendations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ads_recommendations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ads_recommendations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ads_recommendations_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ads_search_terms" TO "anon";
GRANT ALL ON TABLE "public"."ads_search_terms" TO "authenticated";
GRANT ALL ON TABLE "public"."ads_search_terms" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ads_search_terms_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ads_search_terms_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ads_search_terms_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ads_sync_logs" TO "anon";
GRANT ALL ON TABLE "public"."ads_sync_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."ads_sync_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ads_sync_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ads_sync_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ads_sync_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ads_system_prompts" TO "anon";
GRANT ALL ON TABLE "public"."ads_system_prompts" TO "authenticated";
GRANT ALL ON TABLE "public"."ads_system_prompts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ads_system_prompts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ads_system_prompts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ads_system_prompts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."agent_runs" TO "anon";
GRANT ALL ON TABLE "public"."agent_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_runs" TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."buyers" TO "anon";
GRANT ALL ON TABLE "public"."buyers" TO "authenticated";
GRANT ALL ON TABLE "public"."buyers" TO "service_role";



GRANT ALL ON TABLE "public"."call_sessions" TO "anon";
GRANT ALL ON TABLE "public"."call_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."call_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."calls_log" TO "anon";
GRANT ALL ON TABLE "public"."calls_log" TO "authenticated";
GRANT ALL ON TABLE "public"."calls_log" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_leads" TO "anon";
GRANT ALL ON TABLE "public"."campaign_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_leads" TO "service_role";



GRANT ALL ON TABLE "public"."campaigns" TO "anon";
GRANT ALL ON TABLE "public"."campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."contacts" TO "anon";
GRANT ALL ON TABLE "public"."contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."contacts" TO "service_role";



GRANT ALL ON TABLE "public"."cron_runs" TO "anon";
GRANT ALL ON TABLE "public"."cron_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."cron_runs" TO "service_role";



GRANT ALL ON TABLE "public"."daily_devotional" TO "anon";
GRANT ALL ON TABLE "public"."daily_devotional" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_devotional" TO "service_role";



GRANT ALL ON TABLE "public"."deal_buyers" TO "anon";
GRANT ALL ON TABLE "public"."deal_buyers" TO "authenticated";
GRANT ALL ON TABLE "public"."deal_buyers" TO "service_role";



GRANT ALL ON TABLE "public"."deals" TO "anon";
GRANT ALL ON TABLE "public"."deals" TO "authenticated";
GRANT ALL ON TABLE "public"."deals" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_runs" TO "anon";
GRANT ALL ON TABLE "public"."delivery_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_runs" TO "service_role";



GRANT ALL ON TABLE "public"."dialer_ai_traces" TO "anon";
GRANT ALL ON TABLE "public"."dialer_ai_traces" TO "authenticated";
GRANT ALL ON TABLE "public"."dialer_ai_traces" TO "service_role";



GRANT ALL ON TABLE "public"."dialer_auto_cycle_leads" TO "anon";
GRANT ALL ON TABLE "public"."dialer_auto_cycle_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."dialer_auto_cycle_leads" TO "service_role";



GRANT ALL ON TABLE "public"."dialer_auto_cycle_phones" TO "anon";
GRANT ALL ON TABLE "public"."dialer_auto_cycle_phones" TO "authenticated";
GRANT ALL ON TABLE "public"."dialer_auto_cycle_phones" TO "service_role";



GRANT ALL ON TABLE "public"."dialer_events" TO "anon";
GRANT ALL ON TABLE "public"."dialer_events" TO "authenticated";
GRANT ALL ON TABLE "public"."dialer_events" TO "service_role";



GRANT ALL ON TABLE "public"."distress_events" TO "anon";
GRANT ALL ON TABLE "public"."distress_events" TO "authenticated";
GRANT ALL ON TABLE "public"."distress_events" TO "service_role";



GRANT ALL ON TABLE "public"."distress_signals" TO "anon";
GRANT ALL ON TABLE "public"."distress_signals" TO "authenticated";
GRANT ALL ON TABLE "public"."distress_signals" TO "service_role";



GRANT ALL ON SEQUENCE "public"."distress_signals_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."distress_signals_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."distress_signals_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."dnc_list" TO "anon";
GRANT ALL ON TABLE "public"."dnc_list" TO "authenticated";
GRANT ALL ON TABLE "public"."dnc_list" TO "service_role";



GRANT ALL ON TABLE "public"."dominion_heat_scores" TO "anon";
GRANT ALL ON TABLE "public"."dominion_heat_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."dominion_heat_scores" TO "service_role";



GRANT ALL ON TABLE "public"."dossier_artifacts" TO "anon";
GRANT ALL ON TABLE "public"."dossier_artifacts" TO "authenticated";
GRANT ALL ON TABLE "public"."dossier_artifacts" TO "service_role";



GRANT ALL ON TABLE "public"."dossiers" TO "anon";
GRANT ALL ON TABLE "public"."dossiers" TO "authenticated";
GRANT ALL ON TABLE "public"."dossiers" TO "service_role";



GRANT ALL ON TABLE "public"."eval_ratings" TO "anon";
GRANT ALL ON TABLE "public"."eval_ratings" TO "authenticated";
GRANT ALL ON TABLE "public"."eval_ratings" TO "service_role";



GRANT ALL ON TABLE "public"."event_log" TO "anon";
GRANT ALL ON TABLE "public"."event_log" TO "authenticated";
GRANT ALL ON TABLE "public"."event_log" TO "service_role";



GRANT ALL ON TABLE "public"."fact_assertions" TO "anon";
GRANT ALL ON TABLE "public"."fact_assertions" TO "authenticated";
GRANT ALL ON TABLE "public"."fact_assertions" TO "service_role";



GRANT ALL ON TABLE "public"."feature_flags" TO "anon";
GRANT ALL ON TABLE "public"."feature_flags" TO "authenticated";
GRANT ALL ON TABLE "public"."feature_flags" TO "service_role";



GRANT ALL ON TABLE "public"."intake_leads" TO "anon";
GRANT ALL ON TABLE "public"."intake_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."intake_leads" TO "service_role";



GRANT ALL ON TABLE "public"."intake_providers" TO "anon";
GRANT ALL ON TABLE "public"."intake_providers" TO "authenticated";
GRANT ALL ON TABLE "public"."intake_providers" TO "service_role";



GRANT ALL ON TABLE "public"."jeff_control_settings" TO "anon";
GRANT ALL ON TABLE "public"."jeff_control_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."jeff_control_settings" TO "service_role";



GRANT ALL ON TABLE "public"."jeff_interactions" TO "anon";
GRANT ALL ON TABLE "public"."jeff_interactions" TO "authenticated";
GRANT ALL ON TABLE "public"."jeff_interactions" TO "service_role";



GRANT ALL ON TABLE "public"."jeff_quality_reviews" TO "anon";
GRANT ALL ON TABLE "public"."jeff_quality_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."jeff_quality_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."jeff_queue_entries" TO "anon";
GRANT ALL ON TABLE "public"."jeff_queue_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."jeff_queue_entries" TO "service_role";



GRANT ALL ON TABLE "public"."lead_contradiction_flags" TO "anon";
GRANT ALL ON TABLE "public"."lead_contradiction_flags" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_contradiction_flags" TO "service_role";



GRANT ALL ON TABLE "public"."lead_objection_tags" TO "anon";
GRANT ALL ON TABLE "public"."lead_objection_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_objection_tags" TO "service_role";



GRANT ALL ON TABLE "public"."lead_phones" TO "anon";
GRANT ALL ON TABLE "public"."lead_phones" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_phones" TO "service_role";



GRANT ALL ON TABLE "public"."lead_stage_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."lead_stage_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_stage_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."leads" TO "anon";
GRANT ALL ON TABLE "public"."leads" TO "authenticated";
GRANT ALL ON TABLE "public"."leads" TO "service_role";



GRANT ALL ON TABLE "public"."litigants" TO "anon";
GRANT ALL ON TABLE "public"."litigants" TO "authenticated";
GRANT ALL ON TABLE "public"."litigants" TO "service_role";



GRANT ALL ON TABLE "public"."offers" TO "anon";
GRANT ALL ON TABLE "public"."offers" TO "authenticated";
GRANT ALL ON TABLE "public"."offers" TO "service_role";



GRANT ALL ON TABLE "public"."opt_outs" TO "anon";
GRANT ALL ON TABLE "public"."opt_outs" TO "authenticated";
GRANT ALL ON TABLE "public"."opt_outs" TO "service_role";



GRANT ALL ON TABLE "public"."parcels" TO "anon";
GRANT ALL ON TABLE "public"."parcels" TO "authenticated";
GRANT ALL ON TABLE "public"."parcels" TO "service_role";



GRANT ALL ON TABLE "public"."post_call_structures" TO "anon";
GRANT ALL ON TABLE "public"."post_call_structures" TO "authenticated";
GRANT ALL ON TABLE "public"."post_call_structures" TO "service_role";



GRANT ALL ON TABLE "public"."prompt_registry" TO "anon";
GRANT ALL ON TABLE "public"."prompt_registry" TO "authenticated";
GRANT ALL ON TABLE "public"."prompt_registry" TO "service_role";



GRANT ALL ON TABLE "public"."properties" TO "anon";
GRANT ALL ON TABLE "public"."properties" TO "authenticated";
GRANT ALL ON TABLE "public"."properties" TO "service_role";



GRANT ALL ON TABLE "public"."ranger_pushes" TO "anon";
GRANT ALL ON TABLE "public"."ranger_pushes" TO "authenticated";
GRANT ALL ON TABLE "public"."ranger_pushes" TO "service_role";



GRANT ALL ON TABLE "public"."recorded_documents" TO "anon";
GRANT ALL ON TABLE "public"."recorded_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."recorded_documents" TO "service_role";



GRANT ALL ON TABLE "public"."research_runs" TO "anon";
GRANT ALL ON TABLE "public"."research_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."research_runs" TO "service_role";



GRANT ALL ON TABLE "public"."review_queue" TO "anon";
GRANT ALL ON TABLE "public"."review_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."review_queue" TO "service_role";



GRANT ALL ON TABLE "public"."scoring_predictions" TO "anon";
GRANT ALL ON TABLE "public"."scoring_predictions" TO "authenticated";
GRANT ALL ON TABLE "public"."scoring_predictions" TO "service_role";



GRANT ALL ON TABLE "public"."scoring_records" TO "anon";
GRANT ALL ON TABLE "public"."scoring_records" TO "authenticated";
GRANT ALL ON TABLE "public"."scoring_records" TO "service_role";



GRANT ALL ON TABLE "public"."session_extracted_facts" TO "anon";
GRANT ALL ON TABLE "public"."session_extracted_facts" TO "authenticated";
GRANT ALL ON TABLE "public"."session_extracted_facts" TO "service_role";



GRANT ALL ON TABLE "public"."session_notes" TO "anon";
GRANT ALL ON TABLE "public"."session_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."session_notes" TO "service_role";



GRANT ALL ON TABLE "public"."sms_messages" TO "anon";
GRANT ALL ON TABLE "public"."sms_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."sms_messages" TO "service_role";



GRANT ALL ON TABLE "public"."source_costs" TO "anon";
GRANT ALL ON TABLE "public"."source_costs" TO "authenticated";
GRANT ALL ON TABLE "public"."source_costs" TO "service_role";



GRANT ALL ON TABLE "public"."source_policies" TO "anon";
GRANT ALL ON TABLE "public"."source_policies" TO "authenticated";
GRANT ALL ON TABLE "public"."source_policies" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."voice_sessions" TO "anon";
GRANT ALL ON TABLE "public"."voice_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."voice_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."workflow_runs" TO "anon";
GRANT ALL ON TABLE "public"."workflow_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_runs" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







