# Phase 5A: Dispositions + Buyer Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build buyer records, deal-to-buyer linking, outreach tracking, a buyer list page, buyer detail modal, and dispo board — all integrated into Sentinel's existing glass morphism UI.

**Architecture:** Two new Supabase tables (`buyers`, `deal_buyers`) with RLS. Next.js API routes for CRUD. React pages under `(sentinel)/buyers` and `(sentinel)/dispo`. Buyer detail modal follows the same pattern as MasterClientFileModal but much simpler. Sidebar gets a new "Dispositions" section.

**Tech Stack:** Next.js App Router, Supabase (PostgreSQL + RLS), TypeScript, Tailwind CSS (glass morphism), Framer Motion, lucide-react, shadcn/Radix UI, sonner toasts.

---

## Task 1: Database Migration — Create `buyers` and `deal_buyers` tables

**Files:**
- Apply via Supabase MCP: migration `create_buyers_and_deal_buyers`

**Step 1: Apply migration**

Use `apply_migration` MCP tool with project_id `imusghlptroddfeycpei`:

```sql
-- ── buyers table ──
CREATE TABLE public.buyers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name varchar(255),
  contact_name varchar(255) NOT NULL,
  phone varchar(30),
  email varchar(255),
  preferred_contact_method varchar(20) DEFAULT 'phone'
    CHECK (preferred_contact_method IN ('phone','email','text')),
  markets text[] DEFAULT '{}',
  asset_types text[] DEFAULT '{}',
  price_range_low integer,
  price_range_high integer,
  funding_type varchar(30)
    CHECK (funding_type IN ('cash','hard_money','conventional','private')),
  proof_of_funds varchar(20) DEFAULT 'not_submitted'
    CHECK (proof_of_funds IN ('verified','submitted','not_submitted')),
  pof_verified_at timestamptz,
  rehab_tolerance varchar(20)
    CHECK (rehab_tolerance IN ('none','light','moderate','heavy','gut')),
  buyer_strategy varchar(20)
    CHECK (buyer_strategy IN ('flip','landlord','developer','wholesale')),
  occupancy_pref varchar(20) DEFAULT 'either'
    CHECK (occupancy_pref IN ('vacant','occupied','either')),
  tags text[] DEFAULT '{}',
  notes text,
  status varchar(10) DEFAULT 'active'
    CHECK (status IN ('active','inactive')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── deal_buyers junction ──
CREATE TABLE public.deal_buyers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES public.buyers(id) ON DELETE CASCADE,
  status varchar(20) DEFAULT 'not_contacted'
    CHECK (status IN ('not_contacted','sent','interested','offered','passed','follow_up','selected')),
  date_contacted timestamptz,
  contact_method varchar(20)
    CHECK (contact_method IS NULL OR contact_method IN ('phone','email','text')),
  response text,
  offer_amount integer,
  follow_up_needed boolean DEFAULT false,
  follow_up_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (deal_id, buyer_id)
);

-- ── Indexes ──
CREATE INDEX idx_buyers_status ON public.buyers(status);
CREATE INDEX idx_buyers_markets ON public.buyers USING gin(markets);
CREATE INDEX idx_buyers_tags ON public.buyers USING gin(tags);
CREATE INDEX idx_deal_buyers_deal ON public.deal_buyers(deal_id);
CREATE INDEX idx_deal_buyers_buyer ON public.deal_buyers(buyer_id);
CREATE INDEX idx_deal_buyers_status ON public.deal_buyers(status);

-- ── RLS ──
ALTER TABLE public.buyers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_buyers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read all buyers"
  ON public.buyers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert buyers"
  ON public.buyers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update buyers"
  ON public.buyers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read all deal_buyers"
  ON public.deal_buyers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert deal_buyers"
  ON public.deal_buyers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update deal_buyers"
  ON public.deal_buyers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete deal_buyers"
  ON public.deal_buyers FOR DELETE TO authenticated USING (true);
```

**Step 2: Verify tables exist**

Query: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('buyers','deal_buyers');`

Expected: 2 rows.

**Step 3: Commit** (no code files yet — migration is applied to Supabase directly)

---

## Task 2: Buyer Types and Constants

**Files:**
- Create: `src/lib/buyer-types.ts`

**Step 1: Create type definitions and option constants**

```typescript
// ── Buyer record types ──

export type BuyerStatus = "active" | "inactive";
export type ContactMethod = "phone" | "email" | "text";
export type FundingType = "cash" | "hard_money" | "conventional" | "private";
export type POFStatus = "verified" | "submitted" | "not_submitted";
export type RehabTolerance = "none" | "light" | "moderate" | "heavy" | "gut";
export type BuyerStrategy = "flip" | "landlord" | "developer" | "wholesale";
export type OccupancyPref = "vacant" | "occupied" | "either";
export type DealBuyerStatus =
  | "not_contacted"
  | "sent"
  | "interested"
  | "offered"
  | "passed"
  | "follow_up"
  | "selected";

export type BuyerRow = {
  id: string;
  company_name: string | null;
  contact_name: string;
  phone: string | null;
  email: string | null;
  preferred_contact_method: ContactMethod;
  markets: string[];
  asset_types: string[];
  price_range_low: number | null;
  price_range_high: number | null;
  funding_type: FundingType | null;
  proof_of_funds: POFStatus;
  pof_verified_at: string | null;
  rehab_tolerance: RehabTolerance | null;
  buyer_strategy: BuyerStrategy | null;
  occupancy_pref: OccupancyPref;
  tags: string[];
  notes: string | null;
  status: BuyerStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type DealBuyerRow = {
  id: string;
  deal_id: string;
  buyer_id: string;
  status: DealBuyerStatus;
  date_contacted: string | null;
  contact_method: ContactMethod | null;
  response: string | null;
  offer_amount: number | null;
  follow_up_needed: boolean;
  follow_up_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields (populated by API)
  buyer?: BuyerRow;
};

// ── Option arrays for UI selects/filters ──

export const MARKET_OPTIONS = [
  { value: "spokane_county", label: "Spokane County, WA" },
  { value: "kootenai_county", label: "Kootenai County, ID" },
] as const;

export const ASSET_TYPE_OPTIONS = [
  { value: "sfr", label: "SFR" },
  { value: "multi", label: "Multi-Family" },
  { value: "land", label: "Land" },
  { value: "mobile", label: "Mobile Home" },
  { value: "commercial", label: "Commercial" },
] as const;

export const FUNDING_TYPE_OPTIONS = [
  { value: "cash", label: "Cash" },
  { value: "hard_money", label: "Hard Money" },
  { value: "conventional", label: "Conventional" },
  { value: "private", label: "Private" },
] as const;

export const POF_STATUS_OPTIONS = [
  { value: "verified", label: "Verified" },
  { value: "submitted", label: "Submitted" },
  { value: "not_submitted", label: "Not Submitted" },
] as const;

export const REHAB_OPTIONS = [
  { value: "none", label: "None" },
  { value: "light", label: "Light" },
  { value: "moderate", label: "Moderate" },
  { value: "heavy", label: "Heavy" },
  { value: "gut", label: "Gut Rehab" },
] as const;

export const STRATEGY_OPTIONS = [
  { value: "flip", label: "Flip" },
  { value: "landlord", label: "Landlord" },
  { value: "developer", label: "Developer" },
  { value: "wholesale", label: "Wholesale" },
] as const;

export const OCCUPANCY_OPTIONS = [
  { value: "vacant", label: "Vacant" },
  { value: "occupied", label: "Occupied" },
  { value: "either", label: "Either" },
] as const;

export const BUYER_TAG_OPTIONS = [
  { value: "closes_fast", label: "Closes Fast" },
  { value: "reliable", label: "Reliable" },
  { value: "ghosts", label: "Ghosts" },
  { value: "retrades", label: "Retrades" },
  { value: "low_priority", label: "Low Priority" },
  { value: "high_volume", label: "High Volume" },
  { value: "local", label: "Local" },
  { value: "out_of_state", label: "Out of State" },
] as const;

export const DEAL_BUYER_STATUS_OPTIONS = [
  { value: "not_contacted", label: "Not Contacted" },
  { value: "sent", label: "Sent" },
  { value: "interested", label: "Interested" },
  { value: "offered", label: "Offered" },
  { value: "passed", label: "Passed" },
  { value: "follow_up", label: "Follow Up" },
  { value: "selected", label: "Selected" },
] as const;

// ── Label helpers ──

export function marketLabel(v: string): string {
  return MARKET_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function assetTypeLabel(v: string): string {
  return ASSET_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function strategyLabel(v: string): string {
  return STRATEGY_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function fundingLabel(v: string): string {
  return FUNDING_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function pofLabel(v: string): string {
  return POF_STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function rehabLabel(v: string): string {
  return REHAB_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function tagLabel(v: string): string {
  return BUYER_TAG_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function dealBuyerStatusLabel(v: string): string {
  return DEAL_BUYER_STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function formatPriceRange(low: number | null, high: number | null): string {
  if (low && high) return `$${(low / 1000).toFixed(0)}k – $${(high / 1000).toFixed(0)}k`;
  if (low) return `$${(low / 1000).toFixed(0)}k+`;
  if (high) return `Up to $${(high / 1000).toFixed(0)}k`;
  return "—";
}
```

**Step 2: Commit**

```bash
git add src/lib/buyer-types.ts
git commit -m "feat(dispo): add buyer type definitions and option constants"
```

---

## Task 3: Buyers API Routes

**Files:**
- Create: `src/app/api/buyers/route.ts` (GET list + POST create)
- Create: `src/app/api/buyers/[id]/route.ts` (GET detail + PATCH update)

**Step 1: Create list/create route**

Create `src/app/api/buyers/route.ts`:

The GET handler should:
- Accept query params: `status`, `market`, `asset_type`, `strategy`, `tag`, `pof`, `search` (text search on contact_name + company_name)
- Return buyers sorted by contact_name
- Use `createServerClient()` from `@/lib/supabase` and the same `requireAuthenticatedUser` pattern from `src/app/api/properties/update/route.ts`

The POST handler should:
- Accept full buyer fields in body
- Set `created_by` to authenticated user id
- Return created buyer

**Step 2: Create detail/update route**

Create `src/app/api/buyers/[id]/route.ts`:

GET: return single buyer by id.
PATCH: update allowed fields, set `updated_at`.

**Step 3: Commit**

```bash
git add src/app/api/buyers/route.ts src/app/api/buyers/\[id\]/route.ts
git commit -m "feat(dispo): add buyers API routes (list, create, detail, update)"
```

---

## Task 4: Deal-Buyers API Routes

**Files:**
- Create: `src/app/api/deal-buyers/route.ts` (GET list + POST create)
- Create: `src/app/api/deal-buyers/[id]/route.ts` (PATCH update + DELETE unlink)

**Step 1: Create list/create route**

Create `src/app/api/deal-buyers/route.ts`:

GET: accept `deal_id` or `buyer_id` query param. Join with `buyers` table to include buyer details. Join with `deals` to include deal address/prices when queried by buyer_id.

POST: accept `{ deal_id, buyer_id }`, create with status `not_contacted`. When status is set to `selected`, also update `deals.buyer_id`.

**Step 2: Create update/delete route**

Create `src/app/api/deal-buyers/[id]/route.ts`:

PATCH: update status, date_contacted, contact_method, response, offer_amount, follow_up_needed, follow_up_at, notes. Set `updated_at`. When status changes to `selected`, update `deals.buyer_id`.

DELETE: remove the link. If this was the `selected` buyer, clear `deals.buyer_id`.

**Step 3: Commit**

```bash
git add src/app/api/deal-buyers/route.ts src/app/api/deal-buyers/\[id\]/route.ts
git commit -m "feat(dispo): add deal-buyers API routes (list, link, update, unlink)"
```

---

## Task 5: useBuyers Hook

**Files:**
- Create: `src/hooks/use-buyers.ts`

**Step 1: Create the hook**

Build a React Query-style hook (or simple useState+useEffect hook matching the pattern in `src/hooks/use-leads.ts`):

```typescript
export function useBuyers(filters?: BuyerFilters) {
  // fetch from /api/buyers with query params
  // return { buyers, loading, error, refetch }
}

export function useDealBuyers(dealId: string | null) {
  // fetch from /api/deal-buyers?deal_id=X
  // return { dealBuyers, loading, error, refetch }
}

export function useBuyerDeals(buyerId: string | null) {
  // fetch from /api/deal-buyers?buyer_id=X
  // return { buyerDeals, loading, error, refetch }
}
```

Use the same `getAuthenticatedProspectPatchHeaders` pattern from `src/lib/prospect-api-client.ts` for auth headers.

**Step 2: Commit**

```bash
git add src/hooks/use-buyers.ts
git commit -m "feat(dispo): add useBuyers and useDealBuyers hooks"
```

---

## Task 6: Sidebar Navigation Update

**Files:**
- Modify: `src/components/layout/sidebar.tsx`

**Step 1: Add Dispositions section**

Add a new icon import at top: `Handshake` from lucide-react (or `DollarSign` if Handshake isn't available — check lucide docs).

Insert a new section into the `sections` array at index 1 (between Main and Growth):

```typescript
{
  title: "Dispositions",
  items: [
    { label: "Buyers", href: "/buyers", icon: Users },
    { label: "Dispo Board", href: "/dispo", icon: Handshake },
  ],
},
```

Note: Reuse `Users` icon for Buyers or use `UserCheck`. Use `Handshake` or `DollarSign` for Dispo Board.

**Step 2: Commit**

```bash
git add src/components/layout/sidebar.tsx
git commit -m "feat(dispo): add Dispositions section to sidebar navigation"
```

---

## Task 7: Buyer Detail Modal Component

**Files:**
- Create: `src/components/sentinel/buyer-detail-modal.tsx`

**Step 1: Build the modal**

Follow the glass morphism pattern from MasterClientFileModal but much simpler.

The modal should have these sections (all in one scrollable view, no tabs needed):

**Header:** Contact name + company name, status badge (active/inactive), close button.

**Contact Info section:** Phone, email, preferred contact method. Editable inline.

**Buy Box section:** Markets (multi-select pills), asset types (multi-select pills), price range (two inputs), funding type (select), rehab tolerance (select), strategy (select), occupancy (select). All editable.

**Proof of Funds section:** Status select + verified date. When status changes to "verified", auto-set pof_verified_at to now.

**Tags section:** Tag pills from BUYER_TAG_OPTIONS. Click to toggle. Support adding custom tags via text input.

**Outreach History section:** List of deal_buyers records for this buyer (from `useBuyerDeals` hook). Show: deal address, status badge, date contacted, offer amount, spread if available. Compact table or card list.

**Notes section:** Textarea, save on blur.

**Footer:** Delete button (sets inactive, doesn't hard delete).

Glass morphism styling: `bg-black/40 backdrop-blur-xl border-white/[0.08]`, same as existing modals.

All edits save via PATCH `/api/buyers/[id]` with toast confirmation.

**Step 2: Commit**

```bash
git add src/components/sentinel/buyer-detail-modal.tsx
git commit -m "feat(dispo): add BuyerDetailModal component"
```

---

## Task 8: Buyers List Page

**Files:**
- Create: `src/app/(sentinel)/buyers/page.tsx`

**Step 1: Build the page**

Use `PageShell` with title "Buyers" and description "Manage buyer relationships and buy-box criteria".

**Actions area:** "Add Buyer" button that opens a create version of BuyerDetailModal.

**Filters bar:** Market select, asset type select, status (active/inactive/all), strategy select, POF status select, tag multi-select, search input.

**Table:** GlassCard containing a table with columns:
- Contact Name (+ company if exists)
- Markets (comma-joined labels)
- Strategy
- Price Range (formatted)
- POF (badge: green=verified, yellow=submitted, gray=not_submitted)
- Tags (pill badges)
- Status (active/inactive badge)

Click row → open BuyerDetailModal with that buyer.

Empty state: "No buyers yet. Add your first buyer to start tracking relationships."

**Step 2: Commit**

```bash
git add src/app/\(sentinel\)/buyers/page.tsx
git commit -m "feat(dispo): add Buyers list page with filters"
```

---

## Task 9: Dispo Board Page

**Files:**
- Create: `src/app/(sentinel)/dispo/page.tsx`

**Step 1: Build the page**

Use `PageShell` with title "Dispo Board" and description "Match buyers to deals in disposition".

**Data source:** Query deals where the related lead has `status = 'disposition'`. Include deal fields (contract_price, offer_price, arv, property address from the joined lead/property).

**Deal cards:** Each deal shows:
- Property address
- Contract price / ARV
- Linked buyers count + status summary (e.g., "2 sent, 1 interested")
- "Link Buyer" button

**Expandable detail:** Click a deal card to expand and show linked buyers:
- Table: buyer name, status (dropdown to update inline), date contacted, contact method, offer amount, spread (contract_price - offer_amount), follow-up date, notes
- "Link Buyer" button opens a search modal to find and link a buyer

**Spread display:** When a buyer has an offer_amount and the deal has a contract_price:
- `Spread: $X` = `offer_amount - contract_price` (this is the assignment fee)
- Color: green if positive, red if negative

**Empty state:** "No deals in disposition stage. Deals enter disposition from the pipeline when a seller accepts an offer."

**Step 2: Commit**

```bash
git add src/app/\(sentinel\)/dispo/page.tsx
git commit -m "feat(dispo): add Dispo Board page with deal-buyer matching"
```

---

## Task 10: Buyer Search/Link Modal

**Files:**
- Create: `src/components/sentinel/buyer-search-modal.tsx`

**Step 1: Build the modal**

Small modal that lets operators search and select a buyer to link to a deal.

- Search input filtering buyers by contact_name + company_name
- Show matching buyers in a compact list with: name, strategy, markets, POF status
- Already-linked buyers shown grayed out with "Linked" badge
- Click buyer → POST `/api/deal-buyers` with deal_id + buyer_id → toast success → close

**Step 2: Commit**

```bash
git add src/components/sentinel/buyer-search-modal.tsx
git commit -m "feat(dispo): add BuyerSearchModal for deal-buyer linking"
```

---

## Task 11: Lead Detail Modal Integration

**Files:**
- Modify: `src/components/sentinel/master-client-file-modal.tsx`

**Step 1: Add linked buyers summary**

In the Overview tab, near the existing BuyerDispoTruthCard (around line ~4500-4600 in the Overview tab section), add a compact "Linked Buyers" card that shows:
- Only visible when the lead has a deal (check `deals` table for this lead)
- Count of linked buyers
- Best buyer offer amount
- Current spread (contract_price - best_offer)
- Link to "/dispo" page

This should use the `useDealBuyers` hook with the deal_id.

Keep this minimal — just a summary card, not a full management surface. The Dispo Board is where the real work happens.

**Step 2: Commit**

```bash
git add src/components/sentinel/master-client-file-modal.tsx
git commit -m "feat(dispo): add linked buyers summary to Lead Detail modal"
```

---

## Task 12: Build Verification and Polish

**Step 1: Run build**

```bash
npm run build
```

Fix any TypeScript errors.

**Step 2: Verify all pages load**

- `/buyers` — empty state shows correctly
- `/dispo` — empty state shows correctly
- Sidebar shows "Dispositions" section with Buyers and Dispo Board links
- Lead Detail modal still works without regression

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat(dispo): build verification and polish"
```

---

## Task 13: Deploy

```bash
git push origin main
```

Vercel auto-deploys from main.
