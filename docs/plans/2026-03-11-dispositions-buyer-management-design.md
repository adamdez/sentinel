# Phase 5A: Dispositions + Buyer Relationship Management — Design

## Summary

Add a compact buyer relationship management and dispositions workflow to Sentinel.
Focused on: structured buyer records, buy-box criteria, deal-to-buyer linking,
outreach tracking, spread visibility, and a dispo board for deals in disposition stage.

Not building: bulk email marketing, auto-matching, buyer portal, deal packet generation.

---

## Data Model

### New table: `buyers`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | default gen_random_uuid() |
| company_name | varchar(255) | nullable |
| contact_name | varchar(255) | required |
| phone | varchar(30) | nullable |
| email | varchar(255) | nullable |
| preferred_contact_method | varchar(20) | phone / email / text, default 'phone' |
| markets | text[] | e.g. ['spokane_county','kootenai_county'] |
| asset_types | text[] | e.g. ['sfr','multi','land'] |
| price_range_low | integer | nullable |
| price_range_high | integer | nullable |
| funding_type | varchar(30) | cash / hard_money / conventional / private |
| proof_of_funds | varchar(20) | verified / submitted / not_submitted, default 'not_submitted' |
| pof_verified_at | timestamptz | nullable — when POF was last verified |
| rehab_tolerance | varchar(20) | none / light / moderate / heavy / gut |
| buyer_strategy | varchar(20) | flip / landlord / developer / wholesale |
| occupancy_pref | varchar(20) | vacant / occupied / either, default 'either' |
| tags | text[] | behavioral: closes_fast, reliable, ghosts, retrades, low_priority, high_volume, local, out_of_state |
| notes | text | nullable |
| status | varchar(10) | active / inactive, default 'active' |
| created_by | uuid | FK to auth.users |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

RLS: authenticated users can read all, insert/update own records.

### New table: `deal_buyers` (junction + outreach)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | default gen_random_uuid() |
| deal_id | uuid FK→deals | ON DELETE CASCADE |
| buyer_id | uuid FK→buyers | ON DELETE CASCADE |
| status | varchar(20) | not_contacted / sent / interested / offered / passed / follow_up / selected |
| date_contacted | timestamptz | nullable |
| contact_method | varchar(20) | phone / email / text, nullable |
| response | text | nullable |
| offer_amount | integer | nullable — buyer's offer amount |
| follow_up_needed | boolean | default false |
| follow_up_at | timestamptz | nullable |
| notes | text | nullable |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |
| UNIQUE | (deal_id, buyer_id) | prevent duplicates |

RLS: authenticated users can read/write all.

### No changes to existing tables

The existing `deals.buyer_id` stays. When a deal_buyer is marked "selected",
the app updates `deals.buyer_id` to that buyer's id.

---

## Design Decisions (from adversarial review)

1. **Separate `buyers` table** (not extending contacts) — clean domain separation.
2. **No tag/strategy overlap** — `buyer_strategy` is the structured field (flip/landlord/developer).
   Tags are behavioral only: closes_fast, reliable, ghosts, retrades, etc.
3. **`pof_verified_at` timestamp** — POF status alone is stale without a date.
4. **Spread visibility** — wherever buyers link to deals, surface:
   contract_price - buyer_offer = assignment_fee. This is the number operators care about.
5. **Dispo Board stays in scope** — standalone page for managing deal-to-buyer workflow.
6. **Junction table for outreach** — proper relational model, not JSONB arrays.

---

## Navigation

New sidebar section **"Dispositions"** between Main and Growth:
- **Buyers** → `/buyers` — buyer list with filters + detail modal
- **Dispo Board** → `/dispo` — deal-centric view for disposition-stage deals

---

## UI Surfaces

### 1. Buyers List Page (`/buyers`)

PageShell + GlassCard table.

**Columns:** contact name, company, markets, strategy, price range, POF, tags, status.

**Filters:** market, asset type, active/inactive, tags, proof of funds, strategy.

**Actions:** Add Buyer button (opens create modal), click row to open detail modal.

### 2. Buyer Detail Modal

Sections:
- **Contact Info** — name, company, phone, email, preferred method
- **Buy Box** — markets, asset types, price range, funding type, rehab tolerance, strategy, occupancy pref
- **Proof of Funds** — status + verified date
- **Tags** — behavioral tag pills (predefined + custom). No strategy tags (that's the structured field).
- **Outreach History** — list of deal_buyers for this buyer, showing deal address, status, dates, spread
- **Notes** — freeform

### 3. Dispo Board (`/dispo`)

Shows deals in `disposition` stage (from leads with status=disposition that have a deals record).

For each deal card:
- Property address, contract price, ARV
- Linked buyers count + status summary (e.g., "3 sent, 1 interested")
- Spread indicator when a buyer has offered

Click deal → expand inline to show linked buyers with:
- Buyer name, status, date contacted, offer amount
- Spread calculation: contract_price vs buyer offer
- Quick status update (dropdown)
- "Link Buyer" action → search/select modal

### 4. Lead Detail Modal Integration

When a lead has an associated deal:
- Add compact "Linked Buyers" summary in the existing BuyerDispoTruthCard area
- Show: count of linked buyers, best offer, current spread
- Link to open the deal on the Dispo Board

---

## API Routes

- `GET /api/buyers` — list with query params (market, status, strategy, tags, search)
- `POST /api/buyers` — create
- `GET /api/buyers/[id]` — detail
- `PATCH /api/buyers/[id]` — update
- `GET /api/deal-buyers?deal_id=X` or `?buyer_id=X` — list links
- `POST /api/deal-buyers` — create link (deal_id + buyer_id)
- `PATCH /api/deal-buyers/[id]` — update outreach status/notes
- `DELETE /api/deal-buyers/[id]` — unlink

---

## Predefined Options

**Markets:** spokane_county, kootenai_county

**Asset types:** sfr, multi, land, mobile, commercial

**Funding types:** cash, hard_money, conventional, private

**Buyer strategies:** flip, landlord, developer, wholesale

**Rehab tolerance:** none, light, moderate, heavy, gut

**Occupancy pref:** vacant, occupied, either

**POF status:** verified, submitted, not_submitted

**Buyer tags (behavioral only):** closes_fast, reliable, ghosts, retrades, low_priority, high_volume, local, out_of_state

**Deal-buyer outreach status:** not_contacted, sent, interested, offered, passed, follow_up, selected

---

## Deferred (Later Phases)

- Bulk buyer email/text outreach campaigns
- Auto-match buyers to deals by buy-box criteria
- Buyer activity/reliability scoring
- Deal packet / marketing material generation
- Buyer portal (external-facing)
- Buyer import from CSV
