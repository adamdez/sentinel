# /enrich-audit — Data Enrichment Completeness Audit

Audit data completeness across all properties and leads. Identify systematic gaps that prevent leads from being promoted or prospects from being actionable.

## What to do

1. **Field coverage report** — Query all properties and calculate fill rates for every critical field:
   - `owner_name` — % not "Unknown Owner" or null
   - `address` — % not "Unknown" or null
   - `estimated_value` — % not null and > 0
   - `equity_percent` — % not null
   - `county` — % not null
   - `apn` — % not null or not starting with CRAWL-/TEMP-/MANUAL-
   - `owner_phone` — % not null
   - `owner_email` — % not null
   - `mailing_address` — % not null (from owner_flags)
   - `owner_flags.pr_raw` — % that have PropertyRadar data

2. **Signal coverage** — Count distress_events per property:
   - Properties with 0 signals
   - Properties with 1 signal
   - Properties with 2+ signals
   - Signal type distribution (how many probate, foreclosure, tax_lien, etc.)
   - How many signals are status='active' vs 'unknown' vs 'unverified'

3. **Scoring coverage** — Check scoring_records:
   - Properties with scores vs without
   - Score distribution (how many platinum/gold/silver/bronze)
   - Average score by county
   - Properties scored but below MIN_STORE_SCORE (30)

4. **Source attribution** — Break down data by source:
   - How many properties came from PropertyRadar bulk-seed vs mass-seed
   - How many from CSV import
   - How many from crawlers
   - Which source produces the most complete data

5. **Identify the worst gaps** — Rank the missing data by business impact:
   - Missing owner_name blocks all outreach
   - Missing phone/email blocks skip-trace
   - Missing estimated_value blocks deal analysis
   - Missing signals blocks scoring
   - Missing address blocks mailing campaigns

6. **Recommend fixes** — For each gap, suggest specific remediation:
   - Re-run enrichment batch for properties with missing PR data
   - Run county ArcGIS backfill for supported counties
   - CSV backfill from assessor downloads
   - ATTOM gap-fill for valuation data
   - Skip-trace API for contact info

## Key tables
- `properties` — All property records
- `leads` — Lead status and source tracking
- `distress_events` — Signal records
- `scoring_records` — Score history
