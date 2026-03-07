# /api-cost-audit — Paid API Usage vs Free Alternatives

Audit all paid API calls and identify where free county/state data can replace them. The goal is to minimize the $500/mo ATTOM spend and optimize PropertyRadar credit usage.

## What to do

1. **Inventory all paid API calls** — Search the codebase for:
   - PropertyRadar calls (`PROPERTYRADAR_API_KEY`, `api.propertyradar.com`)
   - ATTOM calls (`ATTOM_API_KEY`, `api.gateway.attomdata.com`)
   - OpenClaw/AI calls (`OPENCLAW_API_KEY`)
   - Grok/xAI calls (`XAI_API_KEY`)
   - Apify calls (`APIFY_API_KEY`)
   - Google Maps calls (`GOOGLE_MAPS_API_KEY`)

2. **Map each call to its purpose** — For each API call:
   - What data does it fetch? (owner name, valuation, foreclosure status, etc.)
   - Where is it called from? (enrichment batch, deep crawl, on-demand, etc.)
   - How often? (per-property, daily, on-demand)
   - What's the estimated cost per call?

3. **Check free alternatives** — For each paid data point:
   - Is this available from Spokane County ArcGIS? (owner, sales, parcels)
   - Is this available from Kootenai County GIS?
   - Is this available from state-level data? (courts, SoS, IDWR)
   - Is this available from bulk CSV downloads?
   - Can we cache it to reduce repeated calls?

4. **PropertyRadar credit analysis** — Specifically check:
   - Are we calling Fields=All when we only need specific fields?
   - Are we re-fetching data we already have in the DB?
   - Can the enrichment batch skip PR calls for properties with sufficient data?
   - Are bulk-seed/mass-seed using credits efficiently?

5. **ATTOM $500/mo audit** — Check:
   - Which ATTOM endpoints are we actually calling? (6 registered in attom.ts)
   - How many calls per day/month?
   - Which data is duplicated by PR or county sources?
   - Can we reduce to stay under a lower tier?
   - Should we cancel entirely and rely on PR + county?

6. **AI cost audit** — Check:
   - OpenClaw agents: are they producing verified, useful data or hallucinations?
   - Grok synthesis: is the output actionable or verbose filler?
   - Can some agent tasks be replaced with direct API calls?
   - What's the per-prospect cost of deep crawl?

7. **Produce recommendations** — Ranked by savings:
   ```
   CURRENT MONTHLY SPEND:
   - ATTOM: $500/mo
   - PropertyRadar: ~$X/mo (based on credit usage)
   - OpenClaw/AI: ~$X/mo
   - Other: $X/mo

   RECOMMENDED CUTS:
   1. [specific recommendation] — saves $X/mo
   2. [specific recommendation] — saves $X/mo
   ...

   FREE DATA COVERAGE:
   - Owner names: X% from county, Y% from PR
   - Valuations: X% from county, Y% from ATTOM
   - Signals: X% from crawlers, Y% from PR
   ```

## Key files
- `src/lib/attom.ts` — ATTOM wrapper
- `src/lib/enrichment-engine.ts` — Where API calls happen
- `src/lib/county-data.ts` — Free county data
- `src/lib/openclaw-client.ts` — AI agent costs
- `src/app/api/prospects/deep-crawl/route.ts` — Deep research costs
