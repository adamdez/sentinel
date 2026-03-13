# Ads Integration Implementation Plan — Revised

_Date: 2026-03-13_
_Based on: adversarial review + operator corrections_

---

## Phase Order

| Phase | Goal | Depends on |
|-------|------|------------|
| **0** | Fix connection — live data in existing UI | Nothing |
| **1** | Normalized schema in Sentinel's Supabase | Phase 0 |
| **2** | Normalized 5-stage sync replaces flat sync | Phase 1 |
| **3** | Minimum attribution bridge (gclid → lead → campaign/keyword) | Phase 1 + 2 |
| **4** | UI rewire — Ads Command Center reads normalized tables | Phase 2 |
| **5** | Recommendations + approvals + mutation gateway | Phase 4 |
| **6** | Richer deal/outcome feedback (lead stage → ads performance view) | Phase 3 + 5 |
| **7** | Campaign proposals + deployment (LATER, manual-first) | Phase 5 + data maturity |

---

## Phase 0: Fix Connection ✅ DONE

- [x] Fix `refreshAccessToken()` env var names → `GOOGLE_ADS_CLIENT_ID` / `GOOGLE_ADS_CLIENT_SECRET`
- [x] Add `login-customer-id` header to `gaqlQuery()` and `mutate()`
- [x] Commit and push
- [ ] Set 6 env vars on Vercel (manual step — operator)
- [ ] Verify: hit "Sync Google Ads" on live site → data appears in Performance tab

---

## Phase 1: Normalized Schema

**Goal:** Create the ads data model in Sentinel's Supabase. This is the foundation everything else builds on.

### Tables to create

```
ads_campaigns          — Google Ads campaigns with market enum
ads_ad_groups          — Ad groups with campaign FK
ads_keywords           — Keywords with ad_group FK, seller_situation
ads_search_terms       — Search terms with waste/opportunity flags
ads_daily_metrics      — Time-series metrics by campaign/ad_group/keyword
ads_lead_attribution   — Bridge: Sentinel lead → ads campaign/keyword via gclid
ads_recommendations    — Structured AI recommendations with risk levels
ads_approvals          — Approval decisions with user identity
ads_implementation_logs — Audit trail for executed changes
ads_sync_logs          — Sync run history and health monitoring
```

### Enums to create

```sql
ads_market             ('spokane', 'kootenai')
ads_risk_level         ('green', 'yellow', 'red')
ads_recommendation_status  ('pending', 'approved', 'testing', 'ignored', 'implemented', 'expired')
ads_approval_decision  ('approved', 'rejected', 'deferred')
ads_seller_situation   (inherited, probate, tired_landlord, ... 12 values)
```

### Schema source

Port from `dominion-ads-ai/database/schema.sql` with these adaptations:
- All table names prefixed with `ads_`
- `ads_lead_attribution.lead_id` references Sentinel's `leads(id)` (UUID), not a separate leads table
- `ads_approvals.decided_by` is UUID referencing `auth.users`, not a text string
- `ads_implementation_logs.implemented_by` is UUID referencing `auth.users`
- RLS enabled on all tables (authenticated users: full CRUD matching Sentinel's pattern)
- All indexes from the source schema preserved with `ads_` prefix

### What NOT to create

- No `leads`, `deals`, `deal_stage_history` tables (Sentinel already has these)
- No `landing_page_variants` (premature — add when needed)
- No `campaign_proposals` or `proposal_actions` (Phase 7)

### Deprecation plan for old tables

- `ad_snapshots`: stop writing after Phase 2 sync switchover. UI switches in Phase 4. Drop table 30 days after.
- `ad_reviews`: keep for now. Claude reviews still write here. Eventually migrate review storage to recommendations.
- `ad_actions`: replace with `ads_recommendations` + `ads_approvals` in Phase 5. Drop after.

---

## Phase 2: Normalized Sync Service

**Goal:** Replace the flat-snapshot sync with the 5-stage idempotent sync from dominion-ads-ai.

### What to port

1. **Sync orchestration** — from `services/sync/google-ads-sync.ts`
   - 5 stages: campaigns → ad_groups → keywords → search_terms → daily_metrics
   - Each stage builds an ID-resolution map (google_id → internal_id)
   - All upserts keyed on Google IDs (idempotent)
   - Market assignment via campaign mapping (default: 'spokane')

2. **Database query functions** — from `database/queries/`
   - `upsertCampaign()`, `upsertAdGroup()`, `upsertKeyword()`
   - `upsertSearchTerm()`, `upsertDailyMetrics()`
   - Lookup functions for ID resolution

3. **Sync logging** — every run logged to `ads_sync_logs` with:
   - sync_type, status, records_fetched, records_upserted
   - date_range_start, date_range_end
   - error_message, duration_ms

### Where it lives in Sentinel

```
src/lib/ads/
  sync.ts              — 5-stage orchestration (port of google-ads-sync.ts)
  queries/
    campaigns.ts       — campaign/ad_group/keyword upserts
    search-terms.ts    — search term upserts and classification
    daily-metrics.ts   — daily metrics upsert
    sync-logs.ts       — sync run tracking
```

### API route changes

- `/api/ads/sync` — rewrite to call new orchestration, stop writing to `ad_snapshots`
- `/api/ads/cycle` — update cron to use new sync service
- Add sync lock: check `ads_sync_logs` for running sync before starting new one

### GAQL queries

Keep Sentinel's existing `google-ads.ts` GAQL queries (they work, already tested with the API). The sync orchestration calls the existing fetch functions but writes to normalized tables instead of flat snapshots.

### Switchover

This is an atomic change to `/api/ads/sync`. After this phase:
- New syncs write to `ads_*` tables only
- Old `ad_snapshots` gets no new data
- UI still reads from `ad_snapshots` until Phase 4 (brief stale period, acceptable)

---

## Phase 3: Minimum Attribution Bridge

**Goal:** Connect Google Ads clicks to Sentinel leads via gclid. This is foundational — the source docs treat attribution as an early layer.

### What gets built

1. **`ads_lead_attribution` table** (already created in Phase 1 schema)

2. **Gclid capture on dominionhomedeals.com** (separate repo change)
   - LeadForm component already captures UTMs via URL params
   - Add `gclid` to the same capture pattern
   - Store in hidden field, submit with form data
   - Lead API on dominionhomedeals.com passes gclid in the lead payload

3. **Sentinel lead intake enhancement**
   - When a lead arrives with gclid, insert into `ads_lead_attribution`
   - Initially: just store `lead_id` + `gclid` + `landing_page` + `market`
   - Campaign/ad_group/keyword FKs are NULL at intake (resolved later)

4. **Background gclid resolver**
   - After each sync, attempt to resolve gclid → click → campaign/ad_group/keyword
   - Uses Google Ads `click_view` resource or matches by date + campaign
   - Updates `ads_lead_attribution` FKs when resolution succeeds
   - If resolution fails (common for old clicks), leave FKs NULL — row still has gclid

### What this enables immediately

- "This lead came from the 'Inherited / Probate' ad group"
- "This keyword generated 3 leads, 1 qualified, 0 contracts — potential waste"
- AI recommendations grounded in lead quality, not just click metrics

### What this does NOT do yet

- Does NOT push stages back to Google Ads (that's Phase 6)
- Does NOT require any UI changes (that's Phase 4)
- Does NOT block on resolving every gclid perfectly

---

## Phase 4: UI Rewire

**Goal:** Ads Command Center reads from normalized tables. Campaign → ad group → keyword drilldown. Market filtering.

### Tab-by-tab changes

**Performance tab:**
- Read from `ads_campaigns` + `ads_daily_metrics` (not `ad_snapshots`)
- Add market selector (Spokane / Kootenai / All)
- Add campaign → ad group → keyword drilldown tables
- Show search terms with waste/opportunity flags
- Show attributed lead count per campaign/ad_group/keyword (from `ads_lead_attribution`)

**AI Review tab:**
- Claude reads from normalized tables for richer context
- Review results still go to `ad_reviews` (migrate to recommendations in Phase 5)
- Show data freshness warning if last sync > 36 hours old

**Ad Copy Lab tab:**
- Works similarly but reads from normalized ad data
- Group by ad group for better organization

**Landing Page tab:**
- No change needed — already works independently

**Chat tab:**
- Update system prompt context to include normalized data + attribution data
- Include lead quality metrics in context when available

### Switchover

After this phase:
- UI reads exclusively from `ads_*` tables
- `ad_snapshots` is fully orphaned — can be dropped after 30 days
- No dual-read period (UI switches in a single deploy)

---

## Phase 5: Recommendations + Approvals + Mutation Gateway

**Goal:** Structured, auditable recommendation workflow. All mutations go through a single gateway.

### Recommendation model

Port from dominion-ads-ai's `recommendations` service:
- `recommendation_type`: keyword_pause, bid_adjust, negative_add, budget_adjust, copy_suggestion, waste_flag, opportunity_flag
- `risk_level`: green (low impact), yellow (moderate), red (high impact)
- `expected_impact`: text explaining what should happen
- `reason`: text explaining why
- Entity FKs: `related_campaign_id`, `related_ad_group_id`, `related_keyword_id`, `related_search_term_id`
- `status`: pending → approved/testing/ignored → implemented/expired

### Approval service

Port from dominion-ads-ai's `approvals` service with Sentinel auth:
- `decided_by` is the authenticated Sentinel user UUID (not hardcoded "operator")
- Decision mapping: approved → approved, testing → testing, ignored → ignored
- Every approval creates a record in `ads_approvals`
- Status transition on `ads_recommendations`

### Mutation gateway

New service — single point for ALL Google Ads write operations:

```typescript
async function executeMutation(recommendationId: UUID, userId: UUID): Promise<MutationResult> {
  // 1. Verify recommendation exists and is approved
  // 2. Verify all entity references are valid (anti-hallucination)
  // 3. Log pre-execution state to ads_implementation_logs
  // 4. Execute mutation via Google Ads API
  // 5. Log post-execution result
  // 6. Transition recommendation to 'implemented'
  // 7. Return result
}
```

Rules:
- Never execute without an approved recommendation
- Never execute if last sync is > 36 hours old (stale data guard)
- Never execute on campaigns < 14 days old
- Log everything before AND after execution
- Store old_value for potential manual rollback

### API routes

- `GET /api/ads/recommendations` — list with filters (status, market, risk_level)
- `POST /api/ads/recommendations` — create (from AI review or manual)
- `PATCH /api/ads/recommendations/[id]` — approve/reject/ignore
- `POST /api/ads/recommendations/[id]/execute` — trigger mutation gateway

### AI integration

Update the cron cycle and AI review to produce `ads_recommendations` instead of `ad_actions`:
- Daily health check → generates recommendations for budget burners, waste keywords
- Weekly full review → generates comprehensive recommendations
- All recommendations are pending until operator approves

### Automation policy (hardcoded for now)

```
ALL mutations require explicit operator approval.
No auto-execution regardless of risk level.
This policy can be relaxed after:
  - 90+ days of conversion data
  - Attribution bridge is populated
  - Operator explicitly opts in via settings
```

---

## Phase 6: Richer Deal/Outcome Feedback

**Goal:** Connect Sentinel pipeline stages to ads performance for business-outcome optimization.

### What gets built

1. **Outcome metrics on ads entities**
   - Query: "For keyword X, how many attributed leads became qualified? Appointments? Contracts?"
   - Join: `ads_lead_attribution` → `leads` → pipeline stage
   - Surface in UI: cost-per-qualified-lead, cost-per-contract by campaign/ad_group/keyword

2. **AI context enrichment**
   - Claude gets outcome data in review context
   - Recommendations can reference: "This keyword has $500 in spend, 4 leads, 0 qualified → waste"
   - vs current: "This keyword has $500 in spend, 20 clicks → unclear"

3. **Offline conversion upload preparation (schema only)**
   - Design the data flow for pushing lead stages back to Google Ads
   - Schema supports it via gclid in `ads_lead_attribution`
   - Do NOT implement the actual upload yet — requires:
     - Conversion-based bidding strategy (not Maximize Clicks)
     - 90+ days of conversion data
     - Standard API access (not Explorer)

### What this does NOT do

- Does NOT auto-upload conversions to Google Ads
- Does NOT change bidding strategy
- Does NOT require any Google Ads API writes

---

## Phase 7: Campaign Proposals + Deployment (LATER)

**Goal:** AI generates full campaign proposals. Human reviews. Eventually system deploys.

### Prerequisites (ALL must be met)

- 90+ days of conversion data
- Attribution bridge populated and proven accurate
- Outcome feedback loop working (Phase 6)
- Standard API access (not Explorer)
- Operator explicit opt-in

### What gets built (when ready)

1. Port campaign proposal types and schema from dominion-ads-ai
2. AI generates structured proposals (ad groups, keywords, RSAs, negatives)
3. Proposal review UI with approve/reject/request-edits workflow
4. Manual build from approved proposal (operator builds in Google Ads UI)
5. LATER: automated deployment from approved proposal (requires Standard API + testing)

### What stays manual

- Campaign creation in Google Ads UI
- Bidding strategy changes
- Geo targeting changes
- Network settings changes
- Budget changes > 50%

---

## Safety Rules (Apply to ALL Phases)

### Never auto-execute

- Any Google Ads mutation without explicit operator approval
- Campaign creation, deletion, or structural changes
- Bidding strategy changes
- Geo targeting or network changes
- Budget changes > 50%

### Always require approval

- Keyword pauses (even if flagged as waste)
- Bid adjustments (even small ones)
- Negative keyword additions
- Any change to a campaign < 14 days old

### Always log

- Every sync run (success or failure) to `ads_sync_logs`
- Every recommendation generated
- Every approval decision with user identity
- Every mutation execution with before/after state
- Every AI review with data freshness timestamp

### Always validate

- Entity IDs referenced in recommendations exist in the database
- Data freshness before any recommendation or mutation (< 36 hours)
- Market assignment on every campaign (no silent defaults)
- Sync lock to prevent concurrent syncs

### Market separation

- Every ads table has a `market` column or FK chain to one
- UI always shows market context
- AI reviews are market-scoped when analyzing
- Recommendations reference specific markets
- Never merge Spokane and Kootenai data in aggregate without explicit "All Markets" selection

---

## Test Requirements

- Sentinel's existing 690 tests must pass after every phase
- Each phase should add tests for new services:
  - Phase 2: sync orchestration unit tests (upsert idempotency, ID resolution)
  - Phase 3: attribution bridge tests (gclid storage, FK resolution)
  - Phase 5: recommendation/approval state machine tests, mutation gateway validation tests
