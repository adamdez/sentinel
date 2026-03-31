-- Delete Customer File Function
--
-- Permanently removes a lead and its associated property (if orphaned).
-- Uses session_replication_role = 'replica' to bypass scoring_predictions
-- DO INSTEAD NOTHING rules that silently block DELETE operations.
--
-- Returns JSONB: { success: true, property_deleted: bool }

CREATE OR REPLACE FUNCTION delete_customer_file(p_lead_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Step 2: Delete the lead (FK cascades handle deals CASCADE, calls_log/tasks SET NULL)
  DELETE FROM leads WHERE id = p_lead_id;

  -- Step 3: Check if the property is orphaned (no other leads reference it)
  IF v_property_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_other_leads
    FROM leads
    WHERE property_id = v_property_id;

    IF v_other_leads = 0 THEN
      -- Bypass scoring_predictions DO INSTEAD NOTHING rules
      SET LOCAL session_replication_role = 'replica';

      -- Delete scoring_predictions first (blocked by rules without replica mode)
      DELETE FROM scoring_predictions WHERE property_id = v_property_id;

      -- Now delete the property (cascades to distress_events + scoring_records)
      DELETE FROM properties WHERE id = v_property_id;

      -- Restore normal replication role
      SET LOCAL session_replication_role = 'origin';

      v_property_deleted := TRUE;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'property_deleted', v_property_deleted
  );
END;
$$;
