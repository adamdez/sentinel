# Cursor Build Spec: Full Bricked AI Integration in Comps & ARV Tab

## What This Is

Build a fully functional Bricked AI experience inside Sentinel's "Comps & ARV" tab. Logan should see everything Bricked offers — property photos, interactive comp map with pins, comp cards with MLS photos and selection checkboxes, 5 property detail tabs, repair breakdown, and deal analysis — all without leaving Sentinel. Speed and confidence in the ARV so he can move quickly.

## Data Source

```
POST /api/bricked/analyze
Body: { address: string, leadId?: string, bedrooms?: number, bathrooms?: number, squareFeet?: number, yearBuilt?: number }
Returns: Full BrickedCreateResponse
```

Call this endpoint when the Comps & ARV tab opens for a lead that has an address. Cache the response in React state so tab switching doesn't re-fetch. The endpoint handles ownerFlags persistence automatically when `leadId` is provided.

## Types

All types are importable from `@/providers/bricked/adapter`:

```typescript
import type {
  BrickedCreateResponse, BrickedProperty, BrickedComp,
  BrickedRepair, BrickedPropertyDetails, BrickedLandLocation,
  BrickedMortgageDebt, BrickedMortgage, BrickedOwnership,
  BrickedOwner, BrickedTransaction, BrickedMls, BrickedMlsAgent,
  BrickedAddress, BrickedRenovationScore,
} from "@/providers/bricked/adapter";
```

## Layout

This layout mirrors Bricked's proven design (verified via live screenshot). Two-column layout with content on the left and a Deal Analysis sidebar on the right.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [Subject Property Header]                                              │
│  ┌──────────────────────────────────┐  ┌─────────────────────────────┐  │
│  │  Photo carousel                  │  │  Deal Analysis               │  │
│  │  property.images[]               │  │  ───────────────────────     │  │
│  │  Satellite + interior photos     │  │  After Repair Value          │  │
│  │                                  │  │  $274,518           Bricked  │  │
│  │  ← prev  ● ● ●  next →         │  │                               │  │
│  └──────────────────────────────────┘  │  Current Market Value        │  │
│                                        │  $248,000                    │  │
│  ┌─ Property ─ Land ─ Mortgage ─ Ownership ─ MLS ──┐                  │  │
│  │                                                   │  Est. Repairs   │  │
│  │  [Active tab content]                            │  $35,000        │  │
│  │  Beds: 3  Baths: 2  SqFt: 1,450  Year: 1952    │                  │  │
│  │  Lot: 0.11ac  Garage: Attached  Heating: Oil    │  Comps: 3 sel.  │  │
│  │  ...                                             │                  │  │
│  └──────────────────────────────────────────────────┘  [Open in       │  │
│                                                        Bricked →]     │  │
│                                                       └───────────────┘  │
│                                                                          │
│  ═══ Comparable Properties ═════════════════  3 selected  [ARV] [CMV]   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────────┐│
│  │  [Interactive Leaflet Map]                                           ││
│  │  Subject pin (red/orange) + Comp pins (blue, numbered 1-10)         ││
│  │  Clicking a pin highlights the corresponding comp card below         ││
│  └──────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  ┌─ Comp Card 1 ───────────────────────────────────────────────────────┐│
│  │ ☑ Include in analysis   0.29 mi   MLS                               ││
│  │ ┌────────┐  807 W Grace Ave, Spokane, WA 99205         $250,000    ││
│  │ │  MLS   │  2 beds · 1 bath · 1,095 sqft · Built 1902             ││
│  │ │ photo  │  Sold 8/31/2025 · 84 days on market                    ││
│  │ └────────┘  Adj Value: $258,000                                     ││
│  └──────────────────────────────────────────────────────────────────────┘│
│  ┌─ Comp Card 2 ── ... ────────────────────────────────────────────────┐│
│  └──────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  ═══ Repair Estimates ══════════════════════════════════════════════════ │
│  Roof Replacement    Asphalt shingle, full tear-off           $12,000   │
│  Kitchen Update      Cabinets, counters, appliances           $15,000   │
│  Interior Paint      Full interior, 3 bed/2 bath               $4,500   │
│  Flooring            LVP throughout main level                 $3,500   │
│  ──────────────────────────────────────────────── Total:      $35,000   │
└──────────────────────────────────────────────────────────────────────────┘
```

## Component Structure

### `BrickedAnalysisPanel` — Main Container
Place inside `{activeTab === "comps" && ...}` in `master-client-file-modal.tsx` (line 6834). When Bricked data is available, render this panel. Fall back to existing `CompsTab` when BRICKED_API_KEY is not set or analysis fails.

**Props:**
```typescript
interface BrickedAnalysisPanelProps {
  leadId: string;
  address: string;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  yearBuilt?: number;
  estimatedValue?: number; // AVM for comparison
  computedArv?: number;    // Sentinel's calculated ARV for comparison
}
```

**State management:**
- `analysis: BrickedCreateResponse | null` — the full Bricked response
- `loading: boolean` — fetch in progress
- `error: string | null` — API error message
- Fetch on mount if no cached data in ownerFlags, otherwise use ownerFlags as initial display

### `BrickedPhotoCarousel` — Subject Property Photos
Renders `property.images[]`. Satellite/aerial + interior photos. Left/right arrows, dot indicators. Reuse existing `SubjectPhotoCarousel` pattern from the current CompsTab (line 3612 of master-client-file-modal.tsx).

### `BrickedDealSidebar` — Right Column (THE money-maker)
Fixed position right column. This is Bricked's "Deal Analysis" panel — it's the core underwriting tool. Shows:

- **After Repair Value**: `arv` (green text, large font, editable pencil icon)
- **Offer Price**: Shows calculated offer with a **"Configure" button** that opens the `BrickedOfferConfigModal`
- **Repair Cost**: `totalRepairCost` (editable pencil icon, clickable — scrolls to repair breakdown)
- **Comp Count**: `comps.filter(c => c.selected).length` selected
- **"Open in Bricked →"** button: Opens `dashboardLink ?? shareLink` in `target="_blank"`

### `BrickedOfferConfigModal` — Offer Price Calculator (critical)
This is the deal-making tool. A modal triggered by the "Configure" button next to Offer Price. Two columns:

**Left column — Adjustable Parameters:**
- **Holding Costs**: % input (default 5%), shows dollar amount calculated from ARV
- **Closing Costs**: % input (default 7%), shows dollar amount
- **Wholesale Fee**: $ input (default $10,000 — matches `VALUATION_DEFAULTS.assignmentFeeTarget` from `@/lib/valuation`)
- **Profit Percentage**: % input (default 15%), shows dollar amount
- **Offer Price**: $ input (calculated, but also directly editable for override)

**Right column — Deal Summary (live-updating):**
```
Deal Summary
─────────────────────────────
ARV                  $211,623.00
Repair Cost          -$0.00        (red)
Holding (5%)         -$10,581.15   (red)
Closing (7%)         -$14,813.61   (red)
Wholesale Fee        -$10,000.00   (red)
Profit (15.00%)      -$31,743.45   (red)
─────────────────────────────
Offer Price          $144,485.00   (green, bold)
```

**Formula**: `Offer Price = ARV - Repair Cost - (ARV × Holding%) - (ARV × Closing%) - Wholesale Fee - (ARV × Profit%)`

**Buttons**: Cancel | Save Configuration

**Integration with Sentinel's existing calculator**: The `calculateWholesaleUnderwrite()` function from `@/lib/valuation` already does this math. Reuse it:
```typescript
import { calculateWholesaleUnderwrite, DEFAULTS as VALUATION_DEFAULTS } from "@/lib/valuation";
```

When "Save Configuration" is clicked:
1. Update the sidebar's Offer Price display
2. Pass the configured values to Sentinel's Deal Calculator tab (via shared state or ownerFlags)
3. Persist the offer config to `ownerFlags.bricked_offer_config` for next session

### `BrickedPropertyTabs` — 5 Detail Tabs

Each tab renders a grid of labeled value cards (matching Bricked's exact layout):

**Property** (`property.details`):
| Field | Source |
|-------|--------|
| Beds | `details.bedrooms` |
| Baths | `details.bathrooms` |
| Sq Ft | `details.squareFeet` |
| Year Built | `details.yearBuilt` |
| Lot Size | `details.lotSquareFeet` (convert to acres: / 43560) |
| Occupancy | `details.occupancy` |
| Stories | `details.stories` |
| Sale Date | `details.lastSaleDate` (unix timestamp → date string) |
| Last Sale Price | `details.lastSaleAmount` (format as currency) |
| Basement Type | `details.basementType` |
| Pool Available | `details.poolAvailable` |
| Garage Type | `details.garageType` |
| Garage Sq Ft | `details.garageSquareFeet` |
| AC Type | `details.airConditioningType` |
| Heating Type | `details.heatingType` |
| Heating Fuel | `details.heatingFuelType` |
| HOA Present | `details.hoaPresent` |
| HOA Fee | `details.hoa1Fee` + `details.hoa1FeeFrequency` |
| Legal Description | `details.legalDescription` |
| Renovation Score | `details.renovationScore.score` / `details.renovationScore.confidence` |

**Land/Location** (`property.landLocation`):
| Field | Source |
|-------|--------|
| APN | `landLocation.apn` |
| Zoning | `landLocation.zoning` |
| Land Use | `landLocation.landUse` |
| Property Class | `landLocation.propertyClass` |
| Lot Number | `landLocation.lotNumber` |
| School District | `landLocation.schoolDistrict` |
| Subdivision | `landLocation.subdivision` |
| County | `landLocation.countyName` |

**Mortgage/Debt** (`property.mortgageDebt`):
Summary row:
- Open Mortgage Balance: `mortgageDebt.openMortgageBalance`
- Estimated Equity: `mortgageDebt.estimatedEquity`
- Purchase Method: `mortgageDebt.purchaseMethod`
- LTV Ratio: `mortgageDebt.ltvRatio`

Plus a **Mortgages table** from `mortgageDebt.mortgages[]`:
| Amount | Rate | Loan Type | Term | Recording Date | Maturity Date | Lender |
|--------|------|-----------|------|----------------|---------------|--------|
| `mortgage.amount` | `mortgage.interestRate` | `mortgage.loanType` | `mortgage.term` | `mortgage.recordingDate` (timestamp) | `mortgage.maturityDate` (timestamp) | `mortgage.lenderName` |

**Ownership** (`property.ownership`):
Summary:
- Owner names: `ownership.owners[].firstName + lastName`
- Ownership Length: `ownership.ownershipLength` (years)
- Owner Type: `ownership.ownerType`
- Owner Occupancy: `ownership.ownerOccupancy`
- Tax Amount: `ownership.taxAmount`

Plus a **Sale History table** from `ownership.transactions[]`:
| Date | Amount | Method | Seller | Buyer |
|------|--------|--------|--------|-------|
| `transaction.saleDate` (timestamp) | `transaction.amount` | `transaction.purchaseMethod` | `transaction.sellerNames` | `transaction.buyerNames` |

**MLS** (`property.mls`):
- Status: `mls.status`
- Category: `mls.category`
- Listing Date: `mls.listingDate` (timestamp)
- Listing Price: `mls.amount`
- Days on Market: `mls.daysOnMarket`
- MLS Name: `mls.mlsName`
- MLS Number: `mls.mlsNumber`
- Interior Features: `mls.interiorFeatures`
- Appliance Features: `mls.applianceFeatures`

Agent section:
- Agent Name: `mls.agent.agentName`
- Agent Phone: `mls.agent.agentPhone`
- Office Name: `mls.agent.officeName`
- Office Phone: `mls.agent.officePhone`

### `BrickedCompMap` — Interactive Leaflet Map
Centered on subject property (`property.latitude`, `property.longitude`). Reuse existing Leaflet patterns from `src/components/sentinel/comps/comps-map.tsx`.

- Subject pin: Red/orange marker
- Comp pins: Blue markers with number labels (1, 2, 3, ...)
- Selected comps: Highlighted/larger pins
- Clicking a pin scrolls to and highlights the corresponding comp card below
- Zoom controls

### `BrickedCompCard` — Comp Card
One card per item in `comps[]`:

- **Checkbox**: "Include in analysis" — toggles `selected` state. When toggled, recalculate ARV from selected comps' `adjusted_value` average
- **Distance badge**: calculated from subject lat/lng to comp lat/lng
- **MLS badge**: show if comp has `mls.mlsNumber`
- **Photo**: `comp.images[0]` if available, else placeholder
- **Address**: `comp.address.fullAddress`
- **Details**: `beds · baths · sqft · Built yearBuilt · lotSquareFeet lot sqft`
- **Sale info**: `Sold lastSaleDate · daysOnMarket days on market`
- **Price**: `lastSaleAmount` (large, right-aligned)
- **Adjusted Value**: `adjusted_value` (shown below price if different)
- **Comp Type**: `compType` badge (Sold, Pending, etc.)

### `BrickedRepairsList` — Repair Breakdown
Collapsible section. Renders `repairs[]`:

Each row:
- Repair name (`repair.repair`)
- Description (`repair.description`)
- Cost (`repair.cost`, formatted as currency)

Footer: Total = `totalRepairCost`

## Data Flow

```
User opens Comps & ARV tab
  → Check if ownerFlags has bricked_id (cached from previous analysis)
  → If cached: show instant preview from ownerFlags while fresh fetch runs
  → POST /api/bricked/analyze { address, leadId, beds, baths, sqft, yearBuilt }
  → Response stored in React state → render full BrickedAnalysisPanel
  → Key values auto-persisted to ownerFlags (API handles this)
  → Calculator tab auto-fills ARV + repairs from Bricked data
```

## Styling

Follow existing Sentinel dark theme:
- Cards: `rounded-[10px] border border-white/[0.06] bg-[rgba(12,12,22,0.5)] backdrop-blur-xl`
- Section headers: `text-xs font-semibold text-muted-foreground uppercase tracking-wider`
- Values: `text-foreground font-mono`
- Currency: `font-mono font-bold` (use existing `formatCurrency` from `@/lib/utils`)
- Tabs: Match existing MCF tab styling
- Map: Dark tile layer (CartoDB dark_all, already used in existing CompsMap)
- Photos: `rounded-lg object-cover`
- Buttons: Use existing `Button` from `@/components/ui/button`

## Key UX Requirements

1. **Speed**: Data in 2-3 seconds. If ownerFlags has cached Bricked data, show instantly.
2. **Confidence**: ARV large and prominent. Show comp count, which are selected, confidence signals.
3. **"Open in Bricked"**: Always visible in sidebar. One click to full Bricked interactive dashboard (AI repairs chat, manual comp adjustment).
4. **Fallback**: If BRICKED_API_KEY not set or API fails, show existing CompsTab (PropertyRadar/ATTOM comps).
5. **Tab integration**: Replaces/enhances the existing "Comps & ARV" tab content. Not a new tab.
6. **Comp selection**: Checkboxes on comp cards. When toggled, recalculate the displayed ARV from the average of selected comps' `adjusted_value`.

## Files to Create

```
src/components/sentinel/bricked/
├── bricked-analysis-panel.tsx    — Main container + data fetching
├── bricked-photo-carousel.tsx    — Subject property photos
├── bricked-deal-sidebar.tsx      — ARV/Offer Price/Repairs sidebar
├── bricked-offer-config-modal.tsx — Offer Price Configuration (the money-maker)
├── bricked-property-tabs.tsx     — 5 property detail tabs
├── bricked-comp-map.tsx          — Leaflet map with comp pins
├── bricked-comp-card.tsx         — Individual comp card
└── bricked-repairs-list.tsx      — Itemized repair breakdown
```

## File to Modify

`src/components/sentinel/master-client-file-modal.tsx` — Line 6834, replace or wrap existing CompsTab:

```typescript
{activeTab === "comps" && (
  process.env.NEXT_PUBLIC_BRICKED_ENABLED !== "false" ? (
    <BrickedAnalysisPanel
      leadId={clientFile.id}
      address={clientFile.fullAddress}
      bedrooms={clientFile.bedrooms}
      bathrooms={clientFile.bathrooms}
      sqft={clientFile.sqft}
      yearBuilt={clientFile.yearBuilt}
      estimatedValue={clientFile.estimatedValue}
      computedArv={computedArv}
    />
  ) : (
    <CompsTab cf={clientFile} selectedComps={selectedComps} ... />
  )
)}
```

## Important Notes

- All timestamp fields from Bricked are Unix timestamps (seconds since epoch). Convert with `new Date(timestamp * 1000)`.
- Some fields may be null/undefined. Always use optional chaining and fallback to "Unknown" or hide the field.
- The `selected` field on comps indicates Bricked's AI selection. Honor this as the default, let Logan toggle.
- `adjusted_value` on comps is the price adjusted for differences with the subject property. Show this alongside raw sale price.
- Property images array may be empty. Show a placeholder (MapIcon or Street View link) when no photos.
