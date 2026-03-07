# /bulk-ingest — Bulk Data Ingestion Strategy

Plan and execute bulk data ingestion from external sources (CSV downloads, PropertyRadar exports, county assessor rolls, etc.) into the Sentinel pipeline.

## Arguments
The user will describe the data source (e.g., "Spokane County assessor CSV", "PropertyRadar export of Kootenai foreclosures", "Excel spreadsheet of tax auction properties").

## What to do

1. **Analyze the source data** — If a file path is provided:
   - Read the first 20 rows to understand the schema
   - Count total rows
   - Identify key fields: APN, address, owner name, property value
   - Check for duplicates within the file
   - Identify the county/market coverage

2. **Map fields to Sentinel schema** — Create a mapping:
   ```
   Source Field       → Sentinel Field         → Table.Column
   Parcel Number      → APN                    → properties.apn
   Owner Name         → owner_name             → properties.owner_name
   Site Address       → address                → properties.address
   Mailing Address    → mailing_address        → properties.owner_flags.mailing_address
   Assessed Value     → estimated_value        → properties.estimated_value
   ```

3. **Check for existing endpoint** — Do we already have an ingestion route?
   - `/api/ingest/propertyradar/bulk-seed` — for PR data
   - `/api/ingest/csv-backfill` — for CSV owner/address gap-fill by APN
   - If no suitable endpoint exists, create one

4. **Dedup strategy** — Before inserting:
   - Match by APN first (most reliable)
   - If no APN, match by address normalization
   - For matching records: UPDATE gaps only (don't overwrite existing good data)
   - For new records: INSERT with source tracking

5. **Execute ingestion** — Either:
   - Use existing API endpoint with curl/fetch
   - Build a new route if needed
   - Run in batches (50-100 records per batch to avoid timeouts)
   - Track: inserted, updated, skipped, errors

6. **Post-ingestion** — After loading:
   - Trigger enrichment batch for new records
   - Run re-evaluate for updated staging leads
   - Report results: X new properties, Y updated, Z skipped

7. **Data quality checks** — After ingestion:
   - Are APNs in the expected format for the county?
   - Are addresses parseable?
   - Are values reasonable (not $0, not $999M)?
   - Are owner names real (not "UNKNOWN" or empty)?

## Key files
- `src/app/api/ingest/propertyradar/bulk-seed/route.ts`
- `src/app/api/ingest/csv-backfill/route.ts`
- `src/lib/enrichment-engine.ts`
- `src/app/api/enrichment/re-evaluate/route.ts`
