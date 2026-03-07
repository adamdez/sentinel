# /deal-calc — Wholesale Deal Analysis Calculator

Analyze a specific property's wholesale deal potential. Takes a property ID, address, or APN and produces the full deal math a wholesaler needs to make an offer.

## Arguments
The user will provide one of: property ID, address, or APN.

## What to do

1. **Fetch property data** — Query the `properties` table for the target property. Join to `distress_events` and `scoring_records`.

2. **Compute ARV (After Repair Value)** — Use multiple data points:
   - `estimated_value` from PropertyRadar AVM
   - County ArcGIS comp sales (call `querySpokaneCompSales` or `queryKootenaiOwnerByPIN`)
   - ATTOM AVM if available in owner_flags
   - Median of all available values = ARV estimate
   - Note confidence level based on how many data points agree

3. **Estimate repairs** — Based on property condition indicators:
   - Vacant + code_violation = heavy rehab ($40-60K)
   - Vacant only = moderate rehab ($20-40K)
   - Absentee + old sale = light rehab ($10-20K)
   - Owner-occupied, recent updates = minimal ($5-10K)
   - Default if no condition signals: $25K (conservative)

4. **Run the 70% rule** — Standard wholesale formula:
   - MAO (Maximum Allowable Offer) = ARV × 0.70 - Repairs - Assignment Fee
   - Assignment fee target: $25,000 (company average)
   - Show the formula: MAO = $ARV × 0.70 - $Repairs - $25,000

5. **Equity analysis** — Calculate:
   - Current equity = estimated_value - total_loan_balance
   - Equity % = equity / estimated_value
   - Is the deal possible? (MAO must be > loan balance for non-short-sale)
   - If underwater: flag as short-sale candidate

6. **Distress urgency** — From distress_events:
   - What signals are active? (probate, foreclosure, tax lien, etc.)
   - How urgent? (foreclosure auction date, tax sale deadline, etc.)
   - Motivation score from scoring_records
   - Days-until-distress from predictive scoring

7. **Comparable sales** — Pull recent sales:
   - Same ZIP or area from county ArcGIS
   - Filter to similar property type and size
   - Show top 5 most relevant comps with prices and dates

8. **Output the deal sheet** — Formatted summary:
   ```
   PROPERTY: [address]
   OWNER: [name] | PHONE: [phone] | EMAIL: [email]

   ARV ESTIMATE: $XXX,XXX (confidence: high/med/low)
   REPAIR ESTIMATE: $XX,XXX
   MAO (70% RULE): $XXX,XXX
   CURRENT EQUITY: $XX,XXX (XX%)
   LOAN BALANCE: $XXX,XXX

   DISTRESS SIGNALS: [list with severity]
   URGENCY: [timeline]
   MOTIVATION SCORE: XX/100

   COMPS: [top 5 with prices]

   VERDICT: [Strong Deal / Marginal / Pass] + reasoning
   ```

## Key files
- `src/lib/county-data.ts` — Free comp sales
- `src/lib/scoring.ts` — Scoring engine
- `src/lib/scoring-predictive.ts` — Predictive scoring
- `src/lib/attom.ts` — ATTOM valuation data
