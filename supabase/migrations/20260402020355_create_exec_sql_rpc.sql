
CREATE OR REPLACE FUNCTION public.exec_sql(query text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result json;
BEGIN
    -- Safety: only allow SELECT statements
    IF NOT (lower(trim(query)) LIKE 'select%') THEN
        RAISE EXCEPTION 'Only SELECT queries are allowed via exec_sql';
    END IF;

    EXECUTE 'SELECT json_agg(row_to_json(t)) FROM (' || query || ') t'
    INTO result;

    RETURN COALESCE(result, '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO anon;
GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO authenticated;

