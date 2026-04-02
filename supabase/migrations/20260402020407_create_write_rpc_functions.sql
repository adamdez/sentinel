
-- Write a CEO decision
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
    INSERT INTO sauron.decisions (business_id, department, zone, decision, reasoning, action_taken, decided_at)
    VALUES (p_business_id, p_department, p_zone, p_decision, p_reasoning, p_action_taken, now())
    RETURNING row_to_json(decisions.*) INTO result;
    RETURN result;
END;
$$;

-- Update an agent's report
CREATE OR REPLACE FUNCTION public.update_agent_report(
    p_agent_id text,
    p_report text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result json;
BEGIN
    UPDATE sauron.agents
    SET last_report = p_report, last_report_at = now()
    WHERE id = p_agent_id
    RETURNING row_to_json(agents.*) INTO result;
    RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.write_decision TO service_role;
GRANT EXECUTE ON FUNCTION public.update_agent_report TO service_role;

