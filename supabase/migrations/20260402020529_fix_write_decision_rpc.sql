
CREATE OR REPLACE FUNCTION public.write_decision(
    p_business_id text,
    p_department text,
    p_zone int,
    p_decision text,
    p_reasoning text,
    p_action_taken text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result json;
BEGIN
    INSERT INTO sauron.decisions (business_id, department, zone, decision, reasoning, action_taken, status, created_at)
    VALUES (p_business_id, p_department, p_zone, p_decision, p_reasoning, p_action_taken, 'executed', now())
    RETURNING row_to_json(decisions.*) INTO result;
    RETURN result;
END;
$$;

