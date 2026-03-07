# /prospect-health — Prospect Data Quality Check

Audit the quality of promoted prospects. A prospect that's missing key data is useless to the calling agents — they need owner name, phone, address, distress context, and deal numbers to have a productive conversation.

## What to do

1. **Prospect inventory** — Count all leads with status='prospect'. For each, join to properties and distress_events.

2. **Contact readiness** — For each prospect, check:
   - Has owner_name (not "Unknown Owner")
   - Has owner_phone (primary contact method)
   - Has owner_email (secondary)
   - Has mailing_address (for mail campaigns)
   - Grade: A (phone+name), B (name only), C (neither)

3. **Deal readiness** — For each prospect, check:
   - Has estimated_value / ARV
   - Has equity_percent
   - Has at least 1 active distress signal
   - Has a score >= 40 (silver+)
   - Grade: A (all), B (missing 1), C (missing 2+)

4. **Signal quality** — For prospects with signals:
   - Are signals status='active' or 'unknown' or 'unverified'?
   - How old are the signals (days since event)?
   - Are any AI-generated (needs verification)?
   - Do any have real case numbers, filing dates, amounts?

5. **Comps & ARV data** — For each prospect, check:
   - Does the property have county sale records (from county-data.ts)?
   - Does owner_flags contain PR comp data?
   - Is there enough data to compute an ARV?
   - Are there recent sales in the same area for comparison?

6. **Action items** — Produce a prioritized list:
   - Prospects that are call-ready right now (name + phone + signal + value)
   - Prospects that need skip-trace (name but no phone)
   - Prospects that need enrichment (missing key fields)
   - Prospects that should be demoted back to staging (insufficient data)

## Output format
Produce a table/summary the user can act on immediately, with specific prospect IDs and what's missing.

## Key files
- `src/lib/enrichment-gate.ts` — What the gate requires
- `src/lib/scoring.ts` — Score interpretation
- `src/lib/county-data.ts` — Comp sales data source
