# /dispo-prep — Disposition Package Preparation

Prepare a disposition package for a property under contract. Once we have a signed purchase agreement, we need to market the deal to cash buyers FAST. This skill builds the buyer-facing package.

## Arguments
The user will provide: property address, ID, or APN, plus the contract price.

## What to do

1. **Pull all property data** — Fetch from DB:
   - Full property record (address, beds/baths, sqft, lot size, year built)
   - Owner and title info
   - All available photos (Zillow/Apify scrape, Google Street View)
   - County assessor data (tax value, zoning, legal description)

2. **Compute deal numbers** — From contract price:
   ```
   CONTRACT PRICE:     $XXX,XXX
   ESTIMATED ARV:      $XXX,XXX (from comps)
   ESTIMATED REPAIRS:  $XX,XXX
   ASSIGNMENT FEE:     $XX,XXX (our profit)
   BUYER'S ALL-IN:     $XXX,XXX (contract + assignment + repairs)
   BUYER'S EQUITY:     $XX,XXX (ARV - all-in)
   BUYER'S ROI:        XX% (equity / all-in)
   ```

3. **Pull comparable sales** — Run comps analysis:
   - 5 best comps from county ArcGIS
   - Include: address, sale price, date, distance
   - Calculate price/sqft for subject vs comps
   - Show the ARV is supported by data

4. **Repair scope estimate** — Based on:
   - Property age and condition indicators
   - Vacant/occupied status
   - Code violations if any
   - Standard rehab cost tiers for Spokane/CDA market

5. **Build the package summary**:
   ```
   INVESTMENT OPPORTUNITY — [Address]

   HIGHLIGHTS:
   - [Key selling point: below market, high equity, easy rehab, etc.]
   - ARV: $XXX,XXX | Contract: $XXX,XXX | Spread: $XX,XXX
   - [beds/baths/sqft/lot/year]

   DEAL NUMBERS:
   [table from step 2]

   COMPARABLE SALES:
   [table from step 3]

   PROPERTY DETAILS:
   [address, legal description, zoning, utilities]

   PHOTOS: [list available photos/links]

   TIMELINE: [closing date, inspection period, assignment deadline]
   ```

6. **Buyer list targeting** — Recommend:
   - Which buyer segment (fix-and-flip, buy-and-hold, landlord)
   - Price range buyers to target
   - Market the deal via: buyer list email, social media, networking

## Key files
- `src/lib/county-data.ts` — Comp sales
- `src/app/(sentinel)/disposition/` — Disposition UI page
