# Property Intel Persistence — Cursor Build Spec

## Problem

The Property Intel tab (`BrickedAnalysisPanel`) calls the Bricked API fresh on every mount. When you navigate away and come back, it re-fetches from Bricked. If Bricked returns an error, different data, or a 404 — the data is gone. There is no indication that data was previously pulled. The user has to "pull" it again every time.

## Current State (verified, not assumed)

### What IS saved to DB today

The `/api/bricked/analyze` route saves these fields to `properties.owner_flags` (JSONB merge) after a successful Bricked API call:

| Key | Source | Type |
|-----|--------|------|
| `bricked_id` | `data.id` | string |
| `bricked_arv` | `data.arv` | number |
| `comp_arv` | `data.arv` (duplicate) | number |
| `bricked_cmv` | `data.cmv` | number |
| `bricked_repair_cost` | `data.totalRepairCost` | number |
| `bricked_repairs` | `data.repairs` | array of repair objects |
| `bricked_share_link` | `data.shareLink` | string (URL) |
| `bricked_dashboard_link` | `data.dashboardLink` | string (URL) |
| `bricked_equity` | `data.property.mortgageDebt.estimatedEquity` | number |
| `bricked_open_mortgage` | `data.property.mortgageDebt.openMortgageBalance` | number |
| `bricked_owner_names` | `data.property.ownership.owners` joined | string |
| `bricked_ownership_years` | `data.property.ownership.ownershipLength` | number |
| `bricked_renovation_score` | `data.property.details.renovationScore.score` | number |
| `bricked_subject_images` | `data.property.images` | array of image URLs |
| `comp_count` | count of selected comps | number |

### What is NOT saved to DB today

These are returned by Bricked and rendered in the UI but never persisted:

- **Full comps array** — individual comp addresses, sale prices, sqft, distances, photos, selected flags
- **Full property.details** — lot size, year built, beds/baths as reported by Bricked (may differ from import data)
- **Full property.mortgageDebt** — loan origination date, lender, loan type, all mortgage details
- **Full property.ownership** — ownership history chain, deed type, acquisition date, purchase price per owner
- **MLS history** — historic listings with dates, prices, days on market, agents
- **Comp photos** — individual comp property images
- **Property location/land data** — zoning, flood zone, lot dimensions
- **Deal analysis config** — user's chosen rehab cost, assignment fee %, wholesale margin — only in React state (`dealConfig`), never saved

### What the component does on mount

File: `src/components/sentinel/bricked/bricked-analysis-panel.tsx`

1. `useEffect` fires on mount (line 95-99), guarded by `fetched.current` ref
2. Calls `fetchAnalysis()` which POSTs to `/api/bricked/analyze`
3. If successful, sets `analysis` state with full Bricked response
4. If error, shows error message
5. **Never checks `properties.owner_flags` for cached data**
6. On unmount, `fetched.current` resets — next mount triggers a fresh API call

### What the component does NOT do

- Does not receive cached Bricked data as props
- Does not check if `owner_flags` has `bricked_id` or `bricked_arv` before calling the API
- Does not show cached data while refreshing
- Does not save the full Bricked response to DB
- Does not persist `dealConfig` (rehab $, assignment fee %, wholesale margin)
- Does not persist `repairTotal` edits
- Does not persist comp selection changes

## Requirements

### 1. Save the FULL Bricked response to DB

When `/api/bricked/analyze` gets a successful response, save the **entire response object** to `properties.owner_flags.bricked_full_response` as JSONB. This is the single source of truth for all Bricked data on this property.

**File:** `src/app/api/bricked/analyze/route.ts`

Add to the `flags` object before the JSONB merge (around line 133):
```typescript
flags.bricked_full_response = data; // full Bricked API response
flags.bricked_fetched_at = new Date().toISOString(); // timestamp of last pull
```

This means the full comps array, property details, mortgage data, ownership history, MLS history, and photos are all persisted.

### 2. Load cached data on mount — API call is optional

**File:** `src/components/sentinel/bricked/bricked-analysis-panel.tsx`

**New props needed from parent:**
```typescript
export interface BrickedAnalysisPanelProps {
  leadId: string;
  address: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  sqft?: number | null;
  yearBuilt?: number | null;
  estimatedValue?: number | null;
  computedArv?: number;
  // NEW: cached Bricked data from properties.owner_flags
  cachedBrickedResponse?: BrickedAnalysisResponse | null;
  cachedBrickedFetchedAt?: string | null;
}
```

**New mount behavior:**
1. If `cachedBrickedResponse` is provided and non-null:
   - Set `analysis` state immediately (no loading spinner)
   - Show a subtle "Last pulled: {cachedBrickedFetchedAt}" timestamp
   - Show a "Refresh" button (replaces auto-fetch)
   - Do NOT call the Bricked API on mount
2. If `cachedBrickedResponse` is null/undefined:
   - Show current "Start Analysis" button behavior
   - When clicked, fetch from API and save to DB
3. "Refresh" button:
   - Calls `/api/bricked/analyze` to get fresh data
   - Updates DB (already happens)
   - Updates `analysis` state
   - Shows "Last pulled: just now"

### 3. Parent passes cached data as props

**File:** `src/components/sentinel/master-client-file-modal.tsx`

The parent already fetches the lead + property data. It has access to `properties.owner_flags`. Pass the cached Bricked response to the panel:

```typescript
<BrickedAnalysisPanel
  leadId={lead.id}
  address={property.address}
  // ... existing props ...
  cachedBrickedResponse={property.owner_flags?.bricked_full_response ?? null}
  cachedBrickedFetchedAt={property.owner_flags?.bricked_fetched_at ?? null}
/>
```

### 4. Persist deal config and repair edits

**File:** `src/components/sentinel/bricked/bricked-analysis-panel.tsx`

The `handleRepairsSave` (line 119) and `handleConfigSave` (line 123) currently have `// Future: persist` comments. Wire them:

When deal config changes (rehab $, assignment fee %, wholesale margin):
- PATCH `/api/bricked/analyze` or a new endpoint to merge into `owner_flags.deal_config`
- On next mount, load `deal_config` from `cachedBrickedResponse` or `owner_flags.deal_config`

When repair edits are saved:
- Merge into `owner_flags.bricked_repairs_edited` (keep original `bricked_repairs` for reference)
- On next mount, use edited repairs if they exist, otherwise original

### 5. Persist comp selection changes

When the user selects/deselects comps, the selection should be saved to `owner_flags.bricked_comp_selection` as an array of indices. On next mount, restore the selection from DB instead of using Bricked's default `selected` flags.

## What NOT to do

- Do NOT call the Bricked API on every mount. The API costs money per call and the data doesn't change daily.
- Do NOT show a loading spinner when cached data exists. Show the cached data immediately.
- Do NOT delete or overwrite cached data when the API errors. Keep the last successful pull.
- Do NOT strip any fields from the Bricked response before saving. Save the full object — it's the source of truth.
- Do NOT assume fields are populated. Every Bricked field should have a null check before rendering. Show "—" for missing values, not empty space.

## Files to modify

1. `src/app/api/bricked/analyze/route.ts` — save full response + timestamp to owner_flags
2. `src/components/sentinel/bricked/bricked-analysis-panel.tsx` — accept cached props, load from cache first, add Refresh button
3. `src/components/sentinel/master-client-file-modal.tsx` — pass cached Bricked data as props from owner_flags
4. `src/components/sentinel/bricked/bricked-deal-sidebar.tsx` — may need to accept persisted deal config
5. `src/components/sentinel/bricked/bricked-repairs-list.tsx` — may need to accept persisted repair edits

## Success criteria

1. Open a lead file → Property Intel tab shows cached Bricked data instantly (no API call, no loading spinner)
2. Close browser, clear cache, reopen — same data appears
3. Click "Refresh" — fresh data from Bricked API, updates cache
4. Change deal config (rehab $, margins) → close and reopen → config is preserved
5. Edit repairs → close and reopen → edits are preserved
6. Select/deselect comps → close and reopen → selection is preserved
7. If Bricked API errors on refresh → cached data remains displayed, error toast shown
8. If no Bricked data has ever been pulled → show "Start Analysis" button (current behavior)
