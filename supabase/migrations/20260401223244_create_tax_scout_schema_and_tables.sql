
-- ============================================================
-- SPOKANE TAX SCOUT — Standalone Bolt-On Schema
-- Deployed: 2026-04-01
-- Purpose: Find tax-delinquent properties in Spokane County
-- Unplug: DROP SCHEMA tax_scout CASCADE;
-- ============================================================

CREATE SCHEMA IF NOT EXISTS tax_scout;

-- 1. PARCELS — The universe of Spokane County parcels
CREATE TABLE tax_scout.parcels (
    pid_num         TEXT PRIMARY KEY,
    owner_name      TEXT,
    site_address    TEXT,
    city            TEXT,
    state           TEXT DEFAULT 'WA',
    zip             TEXT,
    property_use    TEXT,
    tax_code_area   TEXT,
    acreage         NUMERIC,
    land_size_sqft  INTEGER,
    harvested_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_parcels_address ON tax_scout.parcels (site_address);
CREATE INDEX idx_parcels_owner ON tax_scout.parcels (owner_name);
CREATE INDEX idx_parcels_use ON tax_scout.parcels (property_use);

-- 2. TAX_STATUS — Year-by-year tax payment data per parcel
CREATE TABLE tax_scout.tax_status (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pid_num         TEXT NOT NULL REFERENCES tax_scout.parcels(pid_num),
    tax_year        INTEGER NOT NULL,
    annual_charges  NUMERIC(12,2),
    remaining_owing NUMERIC(12,2),
    is_delinquent   BOOLEAN GENERATED ALWAYS AS (remaining_owing > 0) STORED,
    scraped_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(pid_num, tax_year)
);

CREATE INDEX idx_tax_status_delinquent ON tax_scout.tax_status (is_delinquent) WHERE is_delinquent = TRUE;
CREATE INDEX idx_tax_status_pid ON tax_scout.tax_status (pid_num);
CREATE INDEX idx_tax_status_year ON tax_scout.tax_status (tax_year);

-- 3. TAX_RECEIPTS — Payment history
CREATE TABLE tax_scout.tax_receipts (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pid_num         TEXT NOT NULL REFERENCES tax_scout.parcels(pid_num),
    tax_year        INTEGER NOT NULL,
    receipt_number  TEXT,
    receipt_date    DATE,
    receipt_amount  NUMERIC(12,2),
    scraped_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 4. SCRAPE_LOG — Track scraper progress (resumable)
CREATE TABLE tax_scout.scrape_log (
    pid_num         TEXT PRIMARY KEY REFERENCES tax_scout.parcels(pid_num),
    status          TEXT DEFAULT 'pending',
    last_scraped    TIMESTAMPTZ,
    error_message   TEXT,
    retry_count     INTEGER DEFAULT 0
);

-- 5. REFRESH FUNCTION
CREATE OR REPLACE FUNCTION tax_scout.refresh_delinquent_leads()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY tax_scout.delinquent_leads;
END;
$$ LANGUAGE plpgsql;

