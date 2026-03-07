# /comps-pull — Comparable Sales Analysis

Pull and analyze comparable sales for a property to establish ARV. Uses free county ArcGIS data first, then paid APIs as fallback.

## Arguments
The user will provide: property address, APN, or property ID. Optionally a radius/area and timeframe.

## What to do

1. **Identify the subject property** — Look up the property in the DB or by APN/address.

2. **Pull county comp sales** — Use the free ArcGIS endpoints:
   - For Spokane County: `querySpokaneCompSales(apn, yearsBack)` from `src/lib/county-data.ts`
   - For broader market context: `querySpokaneRecentSales(year, limit, minPrice)`
   - For Kootenai County: Note that sales layers aren't confirmed yet — flag this gap

3. **Filter to relevant comps** — From the raw sales data:
   - Same ZIP code or within 0.5 mile radius
   - Similar property type (check `prop_use_code` and `vacant_land_flag`)
   - Sold within last 12 months preferred, 24 months acceptable
   - Exclude $0 transfers, quit claims, and nominal sales
   - Exclude vacant land sales for improved property comps (and vice versa)

4. **Calculate ARV metrics** — From filtered comps:
   - Median sale price
   - Average sale price
   - Price range (low to high)
   - Price per square foot (if data available)
   - Number of comps used
   - Days on market average (if available)

5. **Cross-reference with other sources** — Check:
   - PropertyRadar AVM from `owner_flags.pr_raw.AVM`
   - ATTOM AVM if available
   - Tax assessed value from county records
   - Compare all values and flag any major discrepancies (>15% difference)

6. **Confidence assessment** — Rate the ARV confidence:
   - HIGH: 3+ comps within 12 months, tight price range (<15% spread), agrees with AVM
   - MEDIUM: 2 comps or wider timeframe, moderate spread, some AVM agreement
   - LOW: 0-1 comps, wide spread, or no AVM comparison available

7. **Output format** — Produce:
   ```
   SUBJECT: [address] | APN: [apn]

   COMPARABLE SALES:
   #  Address                  Sale Price    Date        Dist.
   1  123 Main St              $285,000     2025-11-15   0.2mi
   2  456 Oak Ave              $299,000     2025-09-22   0.3mi
   ...

   ARV ANALYSIS:
   Median Comp Price:  $XXX,XXX
   Average Comp Price: $XXX,XXX
   PR AVM:             $XXX,XXX
   Tax Assessed:       $XXX,XXX

   RECOMMENDED ARV: $XXX,XXX (confidence: HIGH/MED/LOW)
   Comps Used: X | Timeframe: X months | Spread: X%
   ```

## Key files
- `src/lib/county-data.ts` — Free ArcGIS comp sales endpoints
- `src/lib/attom.ts` — ATTOM valuation (paid, optional)
