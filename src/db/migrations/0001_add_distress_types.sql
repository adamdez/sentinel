-- Add water_shutoff and condemned to distress_type enum
-- These types were referenced in code but missing from the Postgres enum.
-- water_shutoff: utility shut-off notices indicating severe financial hardship (35-point signal weight)
-- condemned: condemned/uninhabitable properties (20-point signal weight)

ALTER TYPE distress_type ADD VALUE IF NOT EXISTS 'water_shutoff';
ALTER TYPE distress_type ADD VALUE IF NOT EXISTS 'condemned';
