# Comp Calculator — Google Sheets Template

Create a new Google Sheet with the 5 tabs below. Each section describes the columns, formulas, and formatting.

---

## Tab 1: Comp Entry

Enter 3-6 comparable sales. Each row is one comp.

| Column | Type | Notes |
|--------|------|-------|
| Comp # | Auto (1-6) | Row identifier |
| Address | Text | Full street address |
| Sale Date | Date | Must be within 6 months |
| Sale Price | Currency | Verified closed price |
| Sq Ft | Number | Living area only |
| Beds | Number | |
| Baths | Number | Can be decimal (2.5) |
| Year Built | Number | |
| Lot Size (sqft) | Number | |
| Price/SqFt | Formula | `= Sale Price / Sq Ft` |
| Condition at Sale | Dropdown | Good / Fair / Needs Work / Major Rehab |
| Distance (mi) | Number | From subject property |
| Days on Market | Number | |
| Adjustment Notes | Text | Size, condition, location adjustments |
| Adjusted Price | Currency | `= Sale Price + manual adjustment` |

**Formatting:** Highlight any comp over 1 mile or older than 90 days in yellow (weaker comp).

---

## Tab 2: Subject Property + ARV

| Row | Label | Value/Formula |
|-----|-------|---------------|
| 1 | Subject Address | (enter) |
| 2 | Subject Sq Ft | (enter) |
| 3 | Subject Beds | (enter) |
| 4 | Subject Baths | (enter) |
| 5 | Subject Year Built | (enter) |
| 6 | Subject Lot Size | (enter) |
| 7 | --- | --- |
| 8 | Avg Comp $/SqFt | `= AVERAGE('Comp Entry'!J2:J7)` |
| 9 | Estimated ARV | `= B2 * B8` (subject sqft x avg ppsf) |
| 10 | ARV Low (conservative) | `= B9 * 0.93` |
| 11 | ARV High (aggressive) | `= B9 * 1.07` |
| 12 | **ARV Used** | `= B10` (defaults to conservative — override if justified) |

**Rule:** Always default to ARV Low. Only use ARV High if 3+ comps support it and condition is verified.

---

## Tab 3: Repair Estimate

13 repair categories with Spokane market cost ranges. Enter the estimate for each.

| Category | Light | Medium | Heavy | Your Estimate |
|----------|-------|--------|-------|---------------|
| Roof | $2,000 | $6,000 | $12,000 | (enter) |
| HVAC | $500 | $3,000 | $8,000 | (enter) |
| Plumbing | $500 | $2,500 | $7,000 | (enter) |
| Electrical | $500 | $2,000 | $6,000 | (enter) |
| Foundation | $0 | $3,000 | $15,000 | (enter) |
| Kitchen | $1,000 | $8,000 | $20,000 | (enter) |
| Bathrooms | $500 | $4,000 | $12,000 | (enter) |
| Flooring | $1,000 | $4,000 | $8,000 | (enter) |
| Paint / Drywall | $1,500 | $4,000 | $8,000 | (enter) |
| Windows / Doors | $500 | $3,000 | $8,000 | (enter) |
| Exterior / Siding | $500 | $3,000 | $10,000 | (enter) |
| Landscaping | $500 | $2,000 | $5,000 | (enter) |
| Misc / Contingency | $500 | $2,000 | $5,000 | (enter) |
| --- | --- | --- | --- | --- |
| **Subtotal** | | | | `= SUM(E2:E14)` |
| **Contingency (+10%)** | | | | `= E15 * 0.10` |
| **Total Rehab Cost** | | | | `= E15 + E16` |

**Tip:** If you haven't walked the property, use Medium estimates and add the contingency. If you have interior photos or a walkthrough, adjust accordingly.

---

## Tab 4: MAO Calculator

| Row | Label | Value/Formula | Notes |
|-----|-------|---------------|-------|
| 1 | ARV Used | `= 'Subject+ARV'!B12` | Pulled from Tab 2 |
| 2 | Total Rehab Cost | `= 'Repair Estimate'!E17` | Pulled from Tab 3 |
| 3 | Wholesale Fee | $15,000 | Default — adjust per deal |
| 4 | Buyer Profit Margin | 25% | Standard for Spokane market |
| 5 | Holding Costs | $5,000 | 3-4 months typical |
| 6 | Closing Costs | $3,000 | Title, escrow, misc |
| 7 | --- | --- | --- |
| 8 | **MAO** | `= B1 - B2 - B3 - (B1 * B4) - B5 - B6` | Maximum Allowable Offer |
| 9 | Offer Range Low | `= B8 * 0.85` | Opening offer (aggressive) |
| 10 | Offer Range High | `= B8 * 1.00` | Ceiling — do not exceed |
| 11 | --- | --- | --- |
| 12 | Quick Check: MAO as % of ARV | `= B8 / B1` | Should be 55-70% |
| 13 | Confidence | (dropdown) | High / Medium / Low |

**Decision guide:**
- MAO > 70% of ARV: Likely too high. Re-check comps or rehab.
- MAO 55-70% of ARV: Normal range for Spokane wholesale.
- MAO < 55% of ARV: Strong deal if the seller accepts. Submit.
- MAO < 40% of ARV: Unlikely to close. Verify numbers or walk away.

---

## Tab 5: Usage Notes

Paste the following guidance into the tab as reference text:

### Comp Sourcing
1. Pull from Propstream, Redfin, or MLS (if available)
2. Prioritize: same neighborhood > same zip > same city
3. 3 comps minimum, 5 preferred
4. Within 6 months, within 1 mile, similar sqft (+/- 20%)

### What Makes a Good Comp
- Same property type (SFR to SFR)
- Similar bed/bath count (+/- 1)
- Similar year built (+/- 15 years)
- Verified closed sale (not pending/active)
- Condition adjustment documented

### Adjustment Rules (Spokane Market)
- Size: +/- $50/sqft for significant differences
- Beds: +/- $5,000 per bedroom
- Baths: +/- $3,000 per bathroom
- Condition: $5,000-$15,000 adjustment per grade
- Garage: +$8,000-$12,000 if subject has garage and comp doesn't

### When to Escalate to Adam
- MAO exceeds $200,000
- Rehab estimate exceeds $50,000
- Foundation or environmental issues present
- Seller is in active litigation
- Fewer than 3 viable comps available

### Seller Communication
- Never share the MAO formula with the seller
- Present as: "Based on comparable sales and the work the property needs..."
- Always present a range, not a single number
- Let the seller respond before negotiating

---

## How to Use This With Sentinel

1. Pull subject property info from Lead Detail (address, sqft, beds, baths, estimated value)
2. Run comps using the CRM's Comps & ARV tab or Propstream
3. Fill in the spreadsheet tabs in order: Comps > Subject > Repairs > MAO
4. Enter the final ARV and MAO back into Lead Detail's Deal Calculator tab
5. Use the offer range when making the verbal offer (see call-assist cards)
