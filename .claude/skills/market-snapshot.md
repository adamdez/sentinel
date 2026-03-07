# /market-snapshot — Market Conditions Analysis

Analyze current market conditions in target counties. Wholesalers need to know: what's selling, at what price, how fast, and where the distress concentrations are.

## Arguments
Optional: county name. Defaults to all target counties.

## What to do

1. **Sales velocity** — Pull recent sales from county ArcGIS:
   - `querySpokaneRecentSales(currentYear, 1000)` for Spokane
   - Monthly sales volume trend (last 6 months)
   - Median sale price trend
   - Average days on market (if available)

2. **Price distribution** — From recent sales:
   - Median price by property type (SFR, multi-family, land)
   - Price brackets: <$150K, $150-250K, $250-400K, $400K+
   - Which bracket has the most wholesale opportunity? (typically <$250K)
   - Price per sq ft trends

3. **Distress concentration** — From `distress_events`:
   - Count active signals by ZIP code
   - Count by event_type (which distress types are most common?)
   - Heat map data: which neighborhoods have the most distress?
   - Trend: is distress increasing or decreasing?

4. **Inventory analysis** — From `properties` and `leads`:
   - Total properties in DB by county
   - % in staging vs prospect vs active pipeline stages
   - New leads entering pipeline (last 7/30 days)
   - Pipeline conversion rate (staging → prospect → lead → deal)

5. **Competition indicators** — Look for:
   - FSBO listings (from craigslist crawler data)
   - Properties with multiple distress signals (high competition targets)
   - Recently sold distressed properties (who's buying?)
   - Cash sales % (indicates investor activity)

6. **County comparison** — If multiple counties, compare:
   - Median price
   - Distress density (signals per 1000 properties)
   - Data coverage (% of properties enriched)
   - Pipeline depth (how many prospects per county)

7. **Output format**:
   ```
   MARKET SNAPSHOT — [County] — [Date]

   SALES ACTIVITY (Last 30 Days):
   Total Sales: XXX | Median Price: $XXX,XXX | Avg DOM: XX days

   PRICE BRACKETS:
   <$150K:     XX sales (XX%)
   $150-250K:  XX sales (XX%) ← SWEET SPOT
   $250-400K:  XX sales (XX%)
   $400K+:     XX sales (XX%)

   DISTRESS CONCENTRATION:
   Top ZIPs: 99201 (XX signals), 99205 (XX signals), ...
   Top Types: tax_lien (XX), pre_foreclosure (XX), ...

   PIPELINE STATUS:
   Properties: X,XXX | Prospects: XXX | Hot Leads: XX

   OPPORTUNITY SCORE: [HIGH/MED/LOW]
   ```

## Key files
- `src/lib/county-data.ts` — Sales data queries
- `src/lib/crawlers/` — Market data crawlers
