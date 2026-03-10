---
name: comp-calculator-builder
description: Builds the comp calculator spreadsheet spec with column headers, formulas, repair buckets, and MAO logic.
user_invocable: true
---

# Comp Calculator Spec Builder

## Purpose
Build a spreadsheet-first comp calculator for early-stage underwriting. This is the one deliverable that can remain outside the CRM temporarily.

## Honest framing
- Comping at this stage is imprecise. Do not pretend otherwise.
- Spokane County data is available via ArcGIS REST (comp sales 2015-present) and Zillow
- The calculator should help Logan arrive at a defensible range, not a fake-precise number
- Better to present a range than a single number

## Spreadsheet structure

### Tab 1: Comp Entry
Columns:
- `comp_address` — address of comparable sale
- `sale_date` — date of sale
- `sale_price` — recorded sale price
- `sqft` — square footage
- `price_per_sqft` — calculated: sale_price / sqft
- `bedrooms` — bed count
- `bathrooms` — bath count
- `year_built` — year built
- `lot_size_sqft` — lot size
- `condition_at_sale` — estimated condition (good/fair/poor)
- `distance_miles` — distance from subject property
- `days_on_market` — DOM if available
- `adjustment_notes` — free text for manual adjustments
- `adjusted_price` — sale_price + manual adjustments

### Tab 2: Subject Property + ARV
- `subject_address`
- `subject_sqft`, `subject_beds`, `subject_baths`, `subject_year_built`, `subject_lot_sqft`
- `avg_comp_price_per_sqft` — average of comps' price_per_sqft
- `estimated_arv` — subject_sqft * avg_comp_price_per_sqft
- `arv_low` — estimated_arv * 0.93 (conservative)
- `arv_high` — estimated_arv * 1.07 (optimistic)
- `arv_used` — default to arv_low for safety

### Tab 3: Repair Estimate
Repair buckets with rough cost ranges (Spokane market):
| Category | Light | Medium | Heavy |
|----------|-------|--------|-------|
| Roof | $0 | $5,000 | $12,000 |
| HVAC | $0 | $3,000 | $8,000 |
| Plumbing | $0 | $2,000 | $6,000 |
| Electrical | $0 | $1,500 | $5,000 |
| Foundation | $0 | $3,000 | $15,000 |
| Kitchen | $0 | $5,000 | $15,000 |
| Bathrooms | $0 | $2,000 | $8,000 |
| Flooring | $0 | $3,000 | $7,000 |
| Paint/Drywall | $0 | $2,000 | $5,000 |
| Windows/Doors | $0 | $2,000 | $6,000 |
| Exterior/Siding | $0 | $2,000 | $8,000 |
| Landscaping | $0 | $1,000 | $3,000 |
| Misc/Contingency | $0 | $2,000 | $5,000 |
- `total_repair_estimate` — sum of selected buckets
- `repair_contingency` — total_repair_estimate * 0.10 (always add 10%)
- `total_rehab_cost` — total_repair_estimate + repair_contingency

### Tab 4: MAO Calculator
- `arv_used` — from Tab 2
- `total_rehab_cost` — from Tab 3
- `wholesale_fee` — target assignment fee (default $15,000)
- `buyer_profit_margin` — percentage the end buyer needs (default 25%)
- `holding_costs` — estimated holding costs (default $5,000)
- `closing_costs` — estimated closing costs (default $3,000)
- **MAO formula:** `arv_used - total_rehab_cost - wholesale_fee - (arv_used * buyer_profit_margin) - holding_costs - closing_costs`
- `mao_result` — the maximum allowable offer
- `offer_range_low` — mao_result * 0.85
- `offer_range_high` — mao_result * 1.00
- `confidence_level` — manual: "high" (3+ good comps), "medium" (1-2 comps or older), "low" (no comps, pure estimate)

### Tab 5: Usage Notes
- How to find comps (Zillow, Redfin, county ArcGIS)
- What makes a good comp (same neighborhood, similar size, sold within 6 months)
- When to adjust (larger/smaller sqft, better/worse condition, different lot size)
- When to escalate to Adam (low confidence, unusual property, high-value deal)
- How to explain the offer range to a seller

## CRM fields to store later
When the CRM absorbs underwriting:
- `estimated_arv`, `arv_confidence`
- `total_rehab_estimate`
- `mao_result`
- `offer_range_low`, `offer_range_high`
- `wholesale_fee_target`
- `comp_count`, `comp_avg_ppsf`

## Output format
Produce as a detailed spec with column headers, formulas, and usage notes. Include sample data for one hypothetical Spokane property to show how the math works.
