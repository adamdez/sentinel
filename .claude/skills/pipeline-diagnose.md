# /pipeline-diagnose — Enrichment Pipeline Diagnostics

Diagnose why leads aren't flowing from staging → prospect. This is the #1 operational concern — if the pipeline is stuck, no deals get made.

## What to do

1. **Count leads by status** — Query Supabase for lead counts grouped by status (staging, prospect, lead, negotiation, dead, nurture). Compare against the funnel target: 10,000+ staging → 2,000 prospects → 200 offers → 40 deals.

2. **Check enrichment batch cron** — Read `src/app/api/enrichment/batch/route.ts`. Verify it's:
   - Picking up staging leads correctly (status='staging', ordered by priority)
   - Calling PropertyRadar with Fields=All
   - Running signal detection from `distress-signals.ts`
   - Running scoring from `scoring.ts`
   - Checking the data sufficiency gate from `enrichment-gate.ts`
   - Promoting to prospect when gate passes

3. **Audit the data sufficiency gate** — Read `src/lib/enrichment-gate.ts`. Check what fields are required for promotion. Query a sample of 20 staging leads that have been enriched (have notes containing "Enriched") but NOT promoted. For each, check which gate fields are missing.

4. **Check recent enrichment runs** — Query `event_log` for recent `enrichment.*` actions. Look for error patterns, zero-enrichment runs, or API failures.

5. **Sample property data quality** — For 10 random staging leads with property_id, fetch the property record and check:
   - `owner_name` — is it "Unknown Owner" or real?
   - `address` — is it "Unknown" or real?
   - `estimated_value` — is it null or populated?
   - `owner_flags` — does it have PR data?
   - Count of `distress_events` for this property
   - Count of `scoring_records` for this property

6. **Identify bottlenecks** — Produce a clear report:
   - How many leads are stuck in staging and why
   - What's the most common missing field pattern
   - How many leads have been enriched but not promoted
   - How many leads haven't been enriched at all
   - What % of PropertyRadar lookups are succeeding vs failing
   - Recommended actions to unblock the pipeline

## Key files
- `src/app/api/enrichment/batch/route.ts` — Cron batch processor
- `src/lib/enrichment-engine.ts` — Core enrichment logic
- `src/lib/enrichment-gate.ts` — Data sufficiency gate
- `src/lib/distress-signals.ts` — Signal detection
- `src/lib/scoring.ts` — Scoring engine

## Database tables
- `leads` — Lead records with status, property_id, priority, tags
- `properties` — Property data (owner, address, value, flags)
- `distress_events` — Detected distress signals per property
- `scoring_records` — Score history per property
- `event_log` — System event audit trail
