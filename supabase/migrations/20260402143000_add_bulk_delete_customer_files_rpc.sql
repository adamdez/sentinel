CREATE OR REPLACE FUNCTION "public"."delete_customer_files"("p_lead_ids" "uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
AS $$
DECLARE
  v_existing_lead_ids UUID[];
  v_skipped_lead_ids UUID[];
  v_property_ids UUID[];
  v_orphan_property_ids UUID[];
  v_event_entity_ids TEXT[];
  v_deleted_leads INT := 0;
  v_deleted_properties INT := 0;
BEGIN
  IF p_lead_ids IS NULL OR array_length(p_lead_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No lead IDs supplied');
  END IF;

  SELECT
    array_agg(l.id),
    array_agg(DISTINCT l.property_id) FILTER (WHERE l.property_id IS NOT NULL)
  INTO v_existing_lead_ids, v_property_ids
  FROM leads l
  WHERE l.id = ANY(p_lead_ids);

  IF COALESCE(array_length(v_existing_lead_ids, 1), 0) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No matching leads found');
  END IF;

  SELECT array_agg(missing.id)
  INTO v_skipped_lead_ids
  FROM (
    SELECT candidate_id AS id
    FROM unnest(p_lead_ids) AS candidate_id
    EXCEPT
    SELECT existing_id
    FROM unnest(v_existing_lead_ids) AS existing_id
  ) missing;

  SELECT array_agg(existing_id::text)
  INTO v_event_entity_ids
  FROM unnest(v_existing_lead_ids) AS existing_id;

  ALTER TABLE event_log DISABLE TRIGGER trg_event_log_immutable;
  DELETE FROM event_log
  WHERE entity_type = 'lead'
    AND entity_id = ANY(v_event_entity_ids);
  ALTER TABLE event_log ENABLE TRIGGER trg_event_log_immutable;

  DELETE FROM leads
  WHERE id = ANY(v_existing_lead_ids);
  GET DIAGNOSTICS v_deleted_leads = ROW_COUNT;

  IF COALESCE(array_length(v_property_ids, 1), 0) > 0 THEN
    SELECT array_agg(orphaned.property_id)
    INTO v_orphan_property_ids
    FROM (
      SELECT candidate_property_id AS property_id
      FROM unnest(v_property_ids) AS candidate_property_id
      WHERE candidate_property_id IS NOT NULL
      EXCEPT
      SELECT l.property_id
      FROM leads l
      WHERE l.property_id = ANY(v_property_ids)
    ) orphaned;

    IF COALESCE(array_length(v_orphan_property_ids, 1), 0) > 0 THEN
      ALTER TABLE distress_events DISABLE TRIGGER trg_distress_events_immutable;
      DELETE FROM distress_events
      WHERE property_id = ANY(v_orphan_property_ids);
      ALTER TABLE distress_events ENABLE TRIGGER trg_distress_events_immutable;

      ALTER TABLE scoring_records DISABLE TRIGGER trg_scoring_records_immutable;
      DELETE FROM scoring_records
      WHERE property_id = ANY(v_orphan_property_ids);
      ALTER TABLE scoring_records ENABLE TRIGGER trg_scoring_records_immutable;

      DELETE FROM scoring_predictions
      WHERE property_id = ANY(v_orphan_property_ids);

      DELETE FROM properties
      WHERE id = ANY(v_orphan_property_ids);
      GET DIAGNOSTICS v_deleted_properties = ROW_COUNT;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_lead_ids', COALESCE(to_jsonb(v_existing_lead_ids), '[]'::jsonb),
    'skipped_lead_ids', COALESCE(to_jsonb(v_skipped_lead_ids), '[]'::jsonb),
    'deleted_leads', v_deleted_leads,
    'deleted_properties', v_deleted_properties
  );
EXCEPTION
  WHEN OTHERS THEN
    BEGIN
      ALTER TABLE event_log ENABLE TRIGGER trg_event_log_immutable;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    BEGIN
      ALTER TABLE distress_events ENABLE TRIGGER trg_distress_events_immutable;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    BEGIN
      ALTER TABLE scoring_records ENABLE TRIGGER trg_scoring_records_immutable;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    RAISE;
END;
$$;

ALTER FUNCTION "public"."delete_customer_files"("p_lead_ids" "uuid"[]) OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."delete_customer_files"("p_lead_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."delete_customer_files"("p_lead_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_customer_files"("p_lead_ids" "uuid"[]) TO "service_role";
