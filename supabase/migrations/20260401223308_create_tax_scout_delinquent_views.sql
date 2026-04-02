
-- 5. DELINQUENT_LEADS — The gold. Scored and ranked.
CREATE MATERIALIZED VIEW tax_scout.delinquent_leads AS
SELECT
    p.pid_num,
    p.owner_name,
    p.site_address,
    p.city,
    p.zip,
    p.property_use,
    p.acreage,
    p.tax_code_area,
    COUNT(DISTINCT ts.tax_year) FILTER (WHERE ts.is_delinquent) 
        AS years_delinquent,
    ARRAY_AGG(DISTINCT ts.tax_year ORDER BY ts.tax_year) 
        FILTER (WHERE ts.is_delinquent) 
        AS delinquent_years,
    SUM(ts.remaining_owing) FILTER (WHERE ts.is_delinquent) 
        AS total_owing,
    MAX(ts.tax_year) AS latest_tax_year,
    (
        COUNT(DISTINCT ts.tax_year) FILTER (WHERE ts.is_delinquent) * 25 +
        LEAST(COALESCE(SUM(ts.remaining_owing) FILTER (WHERE ts.is_delinquent), 0) / 1000, 25) +
        CASE WHEN p.property_use ILIKE '%single%' THEN 25 
             WHEN p.property_use ILIKE '%duplex%' THEN 20
             WHEN p.property_use ILIKE '%multi%' THEN 15
             ELSE 10 END
    )::INTEGER AS lead_score
FROM tax_scout.parcels p
JOIN tax_scout.tax_status ts ON ts.pid_num = p.pid_num
WHERE EXISTS (
    SELECT 1 FROM tax_scout.tax_status ts2 
    WHERE ts2.pid_num = p.pid_num 
    AND ts2.is_delinquent = TRUE
)
GROUP BY p.pid_num, p.owner_name, p.site_address, p.city, p.zip,
         p.property_use, p.acreage, p.tax_code_area;

CREATE UNIQUE INDEX idx_delinquent_leads_pid ON tax_scout.delinquent_leads (pid_num);
CREATE INDEX idx_delinquent_leads_score ON tax_scout.delinquent_leads (lead_score DESC);
CREATE INDEX idx_delinquent_leads_years ON tax_scout.delinquent_leads (years_delinquent DESC);

-- 6. SENTINEL FEED — The only thing Sentinel ever touches
CREATE OR REPLACE VIEW tax_scout.sentinel_feed AS
SELECT
    pid_num,
    owner_name,
    site_address,
    city,
    zip,
    property_use,
    years_delinquent,
    delinquent_years,
    total_owing,
    lead_score,
    'spokane_tax_delinquent' AS lead_source,
    NOW() AS feed_generated_at
FROM tax_scout.delinquent_leads
WHERE years_delinquent >= 2
ORDER BY lead_score DESC;

COMMENT ON VIEW tax_scout.sentinel_feed IS 
    'Read-only feed for Sentinel. This is the ONLY coupling point. DROP SCHEMA tax_scout CASCADE to unplug.';

