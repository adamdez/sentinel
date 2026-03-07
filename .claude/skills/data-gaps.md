# /data-gaps — Systematic Data Gap Finder

Find systematic data gaps across the entire pipeline that are preventing leads from becoming actionable prospects. Unlike /enrich-audit (which counts fill rates), this skill traces WHY gaps exist and proposes specific code fixes.

## What to do

1. **Trace the data flow** — For each critical field, map source → storage → usage:
   - `owner_name`: PR Fields=All → `enrichment-engine.ts` → `properties.owner_name`
   - `owner_phone`: PR Fields=All → `enrichment-engine.ts` → `properties.owner_phone`
   - `estimated_value`: PR AVM + ATTOM AVM → `enrichment-engine.ts` → `properties.estimated_value`
   - `equity_percent`: PR EquityPercent → `enrichment-engine.ts` → `properties.equity_percent`
   - `distress signals`: PR flags → `distress-signals.ts` → `distress_events` table
   - `mailing_address`: PR mailing fields → `enrichment-engine.ts` → `properties.owner_flags.mailing_address`

2. **Check field extraction** — Read `enrichment-engine.ts` and verify:
   - Are we extracting ALL useful fields from PR API responses?
   - Are we storing them in the right DB columns?
   - Are there PR fields we're ignoring that would fill gaps?
   - Are there ATTOM fields we're ignoring?

3. **Check PR field requests** — Verify the PR API calls:
   - Are we requesting Fields=All for per-property enrichment?
   - In bulk-seed, which fields are requested? Are any critical ones missing?
   - Compare requested fields vs what we actually extract/store

4. **Identify phantom references** — Search the codebase for:
   - Field names that are referenced but never populated
   - DB columns that are always null because no code writes to them
   - Signal detection rules that check fields we never request from APIs
   - Scoring inputs that are always null/default

5. **Check the sufficiency gate** — Read `enrichment-gate.ts`:
   - What fields does it require?
   - Are any required fields systematically missing from our data sources?
   - Is the gate too strict (blocking good leads) or too loose (promoting garbage)?

6. **Cross-reference sources** — For each gap:
   - Can PropertyRadar fill it? (check PR API docs/response)
   - Can county ArcGIS fill it? (check county-data.ts capabilities)
   - Can ATTOM fill it? (check attom.ts endpoints)
   - Can CSV import fill it? (check assessor bulk downloads)
   - Is there a free source we're not using?

7. **Produce fix plan** — For each gap, specify:
   ```
   GAP: [field name] — [X% of properties missing]
   ROOT CAUSE: [why it's missing]
   FIX: [specific code change needed]
   FILE: [which file to modify]
   EFFORT: [low/med/high]
   IMPACT: [how many leads this unblocks]
   ```

## Key files
- `src/lib/enrichment-engine.ts` — Where fields get extracted and stored
- `src/lib/enrichment-gate.ts` — What the promotion gate requires
- `src/lib/distress-signals.ts` — Signal detection field dependencies
- `src/app/api/ingest/propertyradar/bulk-seed/route.ts` — Bulk ingestion fields
