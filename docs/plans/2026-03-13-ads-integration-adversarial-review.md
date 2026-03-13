# Adversarial Architecture Review: Port dominion-ads-ai into Sentinel

_Date: 2026-03-13_
_Reviewer: Principal Systems Architect (multi-lens adversarial review)_
_Scope: Migration of dominion-ads-ai into Sentinel's Ads module_

---

## A. Current-State Summary (Grounded in Source Docs)

### What is already built

**In dominion-ads-ai (separate repo, separate Supabase `xhoadxrtipyvypiivimg`):**
- Normalized schema: `campaigns`, `ad_groups`, `keywords`, `search_terms`, `daily_metrics`
- 5-stage idempotent sync orchestration with ID-resolution maps
- Google Ads REST client (v23, read-only via searchStream)
- OAuth2 token management with in-memory caching
- Recommendation queue: insert, transition, fetch with market/risk filters
- Approval service: record decision, log implementation, status transition
- Campaign proposal system: full JSONB proposals with ad groups, RSAs, negatives
- Recommendation API endpoint (PATCH for approve/test/ignore)
- Search term analyzer: intent classification, waste/opportunity detection, seller-situation tagging
- Sync logging table
- Type definitions for all entities
- Complete launch pack with Spokane Search campaign build sheet (4 ad groups, 32 keywords)
- Operating guardrails document governing AI behavior, build order, automation policy

**In Sentinel (main repo, Supabase `imusghlptroddfeycpei`):**
- 5-tab Ads Command Center UI (Performance, AI Review, Ad Copy Lab, Landing Page, Chat)
- Flat `ad_snapshots` table (denormalized campaign+ad metrics)
- `ad_reviews` table (Claude analysis results)
- `ad_actions` table (suggested/approved/applied actions)
- Google Ads API client (v18) with GAQL queries AND mutation support (bids, pause, budget)
- Claude integration: streaming chat, structured analysis, landing page review
- Action execution pipeline: approve → execute mutation → log
- Cron cycle: daily health checks, weekly full AI review
- Full CRM: leads, pipeline, dialer, follow-up, scoring, source attribution
- 690 passing tests

### What is partially built

- **Google Ads connection in Sentinel**: API client exists but env vars not set on Vercel. The sync endpoint exists but writes flat snapshots, not normalized data. Missing `login-customer-id` header for MCC access.
- **Attribution**: dominion-ads-ai has `lead_attribution` table design with gclid/campaign/keyword FKs. Sentinel has `source` field on leads but NO gclid capture, NO campaign-to-lead linkage.
- **Approval workflow in Sentinel**: `ad_actions` has status (suggested/approved/applied/rejected) but no structured recommendation model, no risk levels, no audit trail, no implementation logs.

### What is still missing

1. **No gclid capture on dominionhomedeals.com/sell landing page** — the form does NOT pass gclid to the lead API. UTMs are captured but gclid is not stored in Sentinel's leads table.
2. **No attribution bridge** — even if gclid were captured, there's no table in Sentinel linking a lead to a specific campaign/ad_group/keyword.
3. **No offline conversion feedback** — Google Ads cannot learn which clicks became contracts. This means automated bidding will optimize for form fills, not deal quality.
4. **No market column on ads tables in Sentinel** — Sentinel's ad_snapshots has no market field.
5. **Auth on approvals is placeholder** — dominion-ads-ai uses hardcoded `"operator"` string. Sentinel's actions route checks user auth but doesn't log WHO approved.
6. **No sync logging in Sentinel** — sync failures are silent.
7. **Sentinel's Google Ads client uses v18; dominion-ads-ai uses v23** — version mismatch that could cause subtle API behavior differences.

### Assumptions in the proposal that are wrong or outdated

1. **"Keep ad_snapshots temporarily"** — This creates dual data paths. The UI will be confused about which tables to read from during migration. This is more dangerous than it sounds.
2. **"Phase 5: Auto-execute green actions"** — The source docs explicitly say "do not automate before measurement exists" and "read-only integrations before write actions." The Spokane campaign is brand new with minimal conversion data. Auto-execution is premature.
3. **"Phase 6: Campaign proposals — AI deploys to Google Ads"** — DOMINION_ADS_STATUS.md section 14C explicitly states "There is still no Google Ads write/deployment layer" and "the first Search campaign must still be built manually." The OPERATING_GUARDRAILS.md build order puts write actions as step 8, the final step.
4. **The proposal assumes env var naming is the only code fix needed** — Sentinel's `google-ads.ts` is missing the `login-customer-id` header entirely. Without it, MCC-child queries will fail. This is a code bug, not just a config issue.
5. **The proposal doesn't mention API version alignment** — v18 vs v23 is a real difference. Some GAQL fields have changed.

---

## B. Verdict on the Proposal

### What is correct

- Normalized schema is the right model. Flat ad_snapshots cannot support drilldown, attribution, or structured recommendations.
- Keeping Sentinel as the operating shell and porting dominion-ads-ai's data model in is the right direction.
- The `ads_` prefix to avoid table name collisions with existing leads/deals is pragmatic.
- Not porting dominion-ads-ai's leads/deals tables is correct — Sentinel's CRM is more complete.
- The phased approach is correct in principle.

### What must change

1. **Phase ordering is wrong.** You cannot rewire the UI (Phase 3) before you have data flowing through the new sync (Phase 2). But more critically, you should NOT touch the UI until sync is proven stable and the attribution bridge exists. Otherwise you get a pretty dashboard showing disconnected data.

2. **Attribution bridge is missing from ALL phases.** This is the single most important architectural gap. Without it, the AI optimizes ad metrics, not business outcomes. The source docs repeatedly emphasize "optimize for contracts, not clicks."

3. **The dual-table period must be eliminated or strictly bounded.** Having both `ad_snapshots` and `ads_campaigns/ads_daily_metrics` readable by the UI is a data trust disaster. Switch over atomically within a single deploy.

4. **The approval state machine needs hardening before mutation execution.** The current `ad_actions` status flow (suggested → approved → applied) has no risk gating, no implementation logging, no rollback tracking. Porting the recommendation model should happen BEFORE enabling any new mutation paths.

5. **Env var naming must be unified across both the API client and all references.** The proposal mentions this but doesn't specify the exact mapping or that `gaqlQuery()` needs the `login-customer-id` header added.

### What is dangerous

1. **Auto-execute green actions (Phase 5)** — With a brand-new Search account, thin conversion data, and Explorer-level API access, auto-executing bid/pause changes is irresponsible. A bad keyword pause could kill the only performing ad group. A bad bid adjustment on a $30/day budget wastes a full day. This must be approval-required until there are 90+ days of conversion data AND the operator explicitly opts in.

2. **AI deploying campaigns to Google Ads (Phase 6)** — Creating campaigns programmatically requires Standard API access (not Explorer). More importantly, a malformed campaign creation can burn budget instantly with no impressions, bad geo targeting, or wrong bidding strategy. The source docs explicitly put this last in the build order.

3. **Silent sync failures** — If the daily cron sync fails, the AI reviews stale data and makes stale recommendations. Without sync logging and health alerting, you won't know until you notice the dashboard numbers haven't changed.

4. **No rollback on mutations** — If an approved action (pause keyword, change bid) makes things worse, there's no automated "undo" path. The `ad_actions` table stores `old_value` but nothing uses it for rollback.

### What is missing

1. **Attribution bridge table** — How does Sentinel know which lead came from which Google Ads keyword?
2. **Gclid capture** — The landing page form must pass gclid to the lead API.
3. **Offline conversion feedback design** — Even if not built now, the schema must support pushing lead stages back to Google Ads.
4. **Sync health monitoring** — Alert if sync hasn't run in 36+ hours.
5. **Mutation execution gateway** — A single service that validates, executes, logs, and tracks ALL Google Ads mutations. Currently mutations are scattered across `/api/ads/actions` and `/api/ads/cycle`.
6. **Rate limiting on API calls** — Google Ads API has quotas. Concurrent syncs or rapid retries could hit them.
7. **Error classification** — Not all sync errors are equal. Auth failures (token expired) vs API errors (quota) vs data errors (bad campaign ID) need different handling.

---

## C. Corrected Target Architecture

### Major services and boundaries

```
┌─────────────────────────────────────────────────────────┐
│  SENTINEL (Next.js on Vercel)                           │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Ads Command  │  │ CRM (Leads,  │  │ Analytics    │  │
│  │ Center UI    │  │ Pipeline,    │  │              │  │
│  │ (5 tabs)     │  │ Dialer)      │  │              │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                  │          │
│  ┌──────┴─────────────────┴──────────────────┴───────┐  │
│  │              API Routes Layer                      │  │
│  │  /api/ads/sync    /api/ads/recommendations         │  │
│  │  /api/ads/actions /api/ads/review                  │  │
│  │  /api/ads/chat    /api/ads/cycle                   │  │
│  └──────┬─────────────────┬──────────────────────────┘  │
│         │                 │                              │
│  ┌──────┴──────┐  ┌──────┴──────┐                       │
│  │ Google Ads  │  │ Mutation    │                       │
│  │ Sync Service│  │ Gateway     │                       │
│  │ (read-only) │  │ (all writes)│                       │
│  └──────┬──────┘  └──────┬──────┘                       │
│         │                │                              │
│  ┌──────┴────────────────┴───────┐                      │
│  │  Google Ads API Client (v18)  │                      │
│  │  + login-customer-id header   │                      │
│  └──────┬────────────────────────┘                      │
│         │                                               │
│  ┌──────┴───────────────────────┐                       │
│  │  Supabase (imusghlptrod...)  │                       │
│  │                              │                       │
│  │  Ads tables (ads_*)          │                       │
│  │  CRM tables (leads, etc.)    │                       │
│  │  Attribution bridge          │                       │
│  │  (ads_lead_attribution)      │                       │
│  └──────────────────────────────┘                       │
└─────────────────────────────────────────────────────────┘
```

### Key boundaries

1. **Sync Service** — Read-only. Pulls from Google Ads API, writes to normalized `ads_*` tables. Logs every run to `ads_sync_logs`.
2. **Mutation Gateway** — Single point for ALL Google Ads write operations. Every mutation must: (a) have an approved recommendation, (b) log before execution, (c) log result after execution, (d) store old_value for potential rollback.
3. **Attribution Bridge** — `ads_lead_attribution` table linking Sentinel leads to ads entities via gclid and campaign/keyword FKs.
4. **AI Review Engine** — Claude analyzes normalized data, produces structured recommendations with risk levels. Does NOT execute. Only queues.
5. **Approval Queue** — All recommendations flow through the queue. Operator approves/rejects. Only approved items reach the Mutation Gateway.

---

## D. Required Schema Plan

### Port directly (adapt naming to `ads_` prefix)

| Table | Source | Notes |
|-------|--------|-------|
| `ads_campaigns` | dominion-ads-ai `campaigns` | Add RLS. Keep `market` enum. |
| `ads_ad_groups` | dominion-ads-ai `ad_groups` | FK to ads_campaigns |
| `ads_keywords` | dominion-ads-ai `keywords` | FK to ads_ad_groups. Keep `seller_situation`. |
| `ads_search_terms` | dominion-ads-ai `search_terms` | Keep waste/opportunity flags, classification fields |
| `ads_daily_metrics` | dominion-ads-ai `daily_metrics` | FK chain to campaigns/ad_groups/keywords |
| `ads_sync_logs` | dominion-ads-ai `sync_logs` | Critical for monitoring |

### Adapt to Sentinel

| Table | Source | Adaptation |
|-------|--------|------------|
| `ads_recommendations` | dominion-ads-ai `recommendations` | Drop lead/deal FKs (use attribution bridge instead). Add `created_by` (system vs manual). |
| `ads_approvals` | dominion-ads-ai `approvals` | Change `decided_by` from text to UUID FK on Sentinel's auth.users. |
| `ads_implementation_logs` | dominion-ads-ai `implementation_logs` | Change `implemented_by` to UUID FK. Add `rollback_available` boolean. |

### Replace with integration bridge

| Table | Source | Replacement |
|-------|--------|-------------|
| `ads_lead_attribution` | dominion-ads-ai `lead_attribution` | New table bridging Sentinel's `leads.id` to `ads_campaigns.id`, `ads_keywords.id`, etc. via gclid. Does NOT duplicate lead data. |

### Do NOT port

| Table | Reason |
|-------|--------|
| `leads` | Sentinel has a complete lead system |
| `deals` | Sentinel has pipeline/deal tracking |
| `deal_stage_history` | Sentinel has its own audit patterns |
| `landing_page_variants` | Premature. Schema only, no implementation. Add when needed. |
| `campaign_proposals` + `proposal_actions` | Port later as Phase 5. Not needed for initial sync/recommendations. |

### Deprecate in Sentinel

| Table | Action |
|-------|--------|
| `ad_snapshots` | Keep temporarily, stop writing to it after sync switchover. Drop after 30 days. |
| `ad_reviews` | Keep. Claude reviews are still useful. But recommendations should go to `ads_recommendations`, not as unstructured JSON in `ad_reviews.suggestions`. |
| `ad_actions` | Replace with `ads_recommendations` + `ads_approvals` + `ads_implementation_logs`. More structured, auditable, and safe. |

### New enums needed in Sentinel's Supabase

```sql
CREATE TYPE ads_market AS ENUM ('spokane', 'kootenai');
CREATE TYPE ads_risk_level AS ENUM ('green', 'yellow', 'red');
CREATE TYPE ads_recommendation_status AS ENUM (
  'pending', 'approved', 'testing', 'ignored', 'implemented', 'expired'
);
CREATE TYPE ads_approval_decision AS ENUM ('approved', 'rejected', 'deferred');
CREATE TYPE ads_seller_situation AS ENUM (
  'inherited', 'probate', 'tired_landlord', 'tenant_issues',
  'major_repairs', 'foundation_mold_damage', 'divorce',
  'foreclosure', 'relocation', 'vacant_property', 'low_intent', 'unknown'
);
```

---

## E. Lead/Deal Attribution Strategy

This is the most important section. Without this, the AI optimizes for clicks, not contracts.

### The problem

Currently:
- Google Ads generates a click → user lands on `/sell` → fills form → lead created in Sentinel
- Sentinel knows the lead source is "Google Ads" (via UTM or generic source field)
- Sentinel does NOT know which campaign, ad group, keyword, or search term generated the lead
- Google Ads does NOT know which clicks became qualified leads, appointments, offers, or contracts

This means:
- The AI cannot recommend "pause keyword X because it generates unqualified leads"
- The AI cannot recommend "increase budget on ad group Y because it generates contracts"
- Google Ads automated bidding optimizes for form fills, not deal quality

### The solution (3 layers)

**Layer 1: Gclid capture (landing page → Sentinel)**

The `/sell` landing page on dominionhomedeals.com must:
1. Read `gclid` from URL params on page load (Google auto-tags all ad clicks with gclid)
2. Store it in hidden form field or sessionStorage
3. Submit it with the lead form data
4. Sentinel's lead API stores it in `ads_lead_attribution`

This requires a change to the dominionhomedeals.com repo (the consumer site), NOT Sentinel. The LeadForm component already captures UTMs — adding gclid is the same pattern.

**Layer 2: Attribution bridge table (`ads_lead_attribution`)**

```sql
CREATE TABLE ads_lead_attribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id),
  gclid TEXT,
  campaign_id BIGINT REFERENCES ads_campaigns(id),
  ad_group_id BIGINT REFERENCES ads_ad_groups(id),
  keyword_id BIGINT REFERENCES ads_keywords(id),
  search_term TEXT,
  landing_page TEXT,
  market ads_market,
  click_timestamp TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ads_lead_attribution_lead ON ads_lead_attribution(lead_id);
CREATE INDEX idx_ads_lead_attribution_gclid ON ads_lead_attribution(gclid) WHERE gclid IS NOT NULL;
CREATE INDEX idx_ads_lead_attribution_campaign ON ads_lead_attribution(campaign_id);
CREATE INDEX idx_ads_lead_attribution_keyword ON ads_lead_attribution(keyword_id);
```

**How it gets populated:**
1. Lead arrives with gclid → immediate insert with just `lead_id` + `gclid` + `landing_page` + `market`
2. Background job (or next sync cycle) resolves gclid → campaign/ad_group/keyword by matching against `ads_daily_metrics` or Google Ads click data
3. If gclid resolution fails (common for clicks > 90 days old), the row still exists with gclid but null FKs

**Layer 3: Outcome feedback (Sentinel → Google Ads, LATER)**

When a lead progresses through Sentinel's pipeline:
- lead → qualified → appointment → offer → contract → closed

Each stage transition can be pushed back to Google Ads as an offline conversion via the Google Ads API `ConversionUpload` service. This teaches Google's bidding algorithms which clicks lead to real business outcomes.

**This is NOT built now.** But the schema supports it because:
- `ads_lead_attribution` has the gclid (required for offline conversion upload)
- Sentinel's pipeline stages are already tracked
- The bridge table provides the linkage

**When to build Layer 3:** After 90+ days of conversion data AND after switching from Maximize Clicks to a conversion-based bidding strategy (Target CPA or Maximize Conversions).

### What this enables for the AI

With attribution in place, Claude can analyze:
- "Keyword X has 15 clicks, $180 spent, 3 leads, 0 qualified → waste candidate"
- "Ad group Y has 8 clicks, $96 spent, 2 leads, 1 contract → increase budget"
- "Spokane inherited keywords convert to qualified at 40% vs 15% for generic → shift budget"

Without attribution, Claude can only say:
- "Keyword X has 15 clicks at $12 avg CPC" — which tells you nothing about business value.

---

## F. Safe Automation Policy

Grounded in OPERATING_GUARDRAILS.md: "do not automate before measurement exists" and "read-only integrations before write actions."

### Auto-generated only (no execution)

| Action | Condition |
|--------|-----------|
| Search term waste flagging | Always. AI classifies, human reviews. |
| Search term opportunity flagging | Always. AI classifies, human reviews. |
| Keyword bid recommendations | Always generated. Never auto-executed. |
| New negative keyword suggestions | Always generated. Human adds manually or approves. |
| Ad copy improvement suggestions | Always generated. Human reviews. |
| Weekly performance summary | Always generated and stored. |
| Budget reallocation suggestions | Always generated with reasoning. |

### Approval-required (AI generates, human approves, system executes)

| Action | Condition | Risk level |
|--------|-----------|------------|
| Pause a keyword | Only after 14+ days of data AND > $50 spend with 0 conversions | Yellow |
| Adjust keyword bid (< 30% change) | Only after 14+ days of data | Yellow |
| Add a negative keyword | Any time — low risk but still requires approval | Green (but still approval-required) |
| Enable a paused keyword | Only with clear reasoning | Yellow |

### Never auto-executed (require manual action in Google Ads UI)

| Action | Reason |
|--------|--------|
| Create new campaign | Too many settings that can silently waste budget (geo, networks, bidding) |
| Create new ad group | Requires keyword strategy review |
| Change bidding strategy | Major strategic decision with budget implications |
| Change daily budget by > 50% | High financial impact |
| Change geo targeting | Can silently leak budget out of market |
| Adjust keyword bid by > 50% | Too aggressive for thin data |
| Any mutation on a campaign < 14 days old | Insufficient data to make changes |

### Blocked until better data exists

| Action | Required data maturity |
|--------|----------------------|
| Auto-execute ANY mutation | 90+ days of conversion data, 50+ leads attributed, operator opt-in |
| Offline conversion upload | 90+ days of data, conversion-based bidding strategy active |
| Campaign proposal deployment | Standard API access (not Explorer), tested in sandbox first |
| Cross-market budget optimization | Both markets must have 30+ days of independent data |

---

## G. Corrected Phased Implementation Plan

### Phase 0: Fix the Connection (1 hour) — DO FIRST

**Goal:** Get data flowing from Google Ads into Sentinel NOW, even into the existing flat tables.

1. Fix `google-ads.ts` — add `login-customer-id` header to `gaqlQuery()` using `GOOGLE_ADS_LOGIN_CUSTOMER_ID` env var
2. Fix `refreshAccessToken()` to read `GOOGLE_ADS_CLIENT_ID` / `GOOGLE_ADS_CLIENT_SECRET` (currently reads `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`)
3. Add all 6 Google Ads env vars to Sentinel's Vercel deployment
4. Test: hit "Sync Google Ads" button on the live site → confirm data appears in Performance tab
5. Commit + deploy

**Why first:** This gives you live data in the existing UI while we build the normalized replacement. You can see if the campaign is running, check spend, and use AI Review immediately.

### Phase 1: Normalized Schema Migration (2-3 hours)

**Goal:** Create the new ads tables in Sentinel's Supabase.

1. Write Supabase migration with all `ads_*` tables, enums, indexes, and RLS policies
2. Apply migration to Sentinel's Supabase (`imusghlptroddfeycpei`)
3. Create `ads_lead_attribution` bridge table
4. Verify schema via `list_tables`
5. Do NOT touch the UI yet. Do NOT remove old tables yet.

### Phase 2: Port Sync Service (3-4 hours)

**Goal:** Replace the flat-snapshot sync with the 5-stage normalized sync.

1. Port `google-ads-sync.ts` orchestration into Sentinel's `src/lib/` or `src/services/`
2. Port the database query functions (upsert campaigns, ad_groups, keywords, search_terms, daily_metrics)
3. Port the GAQL queries (or adapt Sentinel's existing ones to populate normalized tables)
4. Add sync logging to `ads_sync_logs`
5. Replace `/api/ads/sync` route to use new orchestration
6. Update `/api/ads/cycle` cron to use new sync
7. Test: run sync → verify data in new tables
8. Stop writing to `ad_snapshots` (but keep the table for now)

### Phase 3: Rewire UI to Normalized Data (4-6 hours)

**Goal:** The Ads Command Center reads from `ads_*` tables.

1. Update Performance tab to query `ads_campaigns` + `ads_daily_metrics` (with market filter)
2. Add campaign → ad group → keyword drilldown (impossible with flat snapshots)
3. Update AI Review tab: Claude reads from normalized tables instead of snapshots
4. Update Ad Copy Lab to work with normalized data
5. Ensure market selector works (Spokane / Kootenai / All)
6. Remove ad_snapshots reads from UI
7. Test all 5 tabs with live data

### Phase 4: Recommendations + Approvals (4-6 hours)

**Goal:** Structured, auditable recommendation workflow.

1. Port recommendation queue service
2. Port approval service with proper user identity (from Sentinel auth, not hardcoded "operator")
3. Port implementation logging
4. Create `/api/ads/recommendations` route (GET list, POST create, PATCH approve/reject)
5. Wire AI Review tab to create `ads_recommendations` instead of unstructured `ad_actions`
6. Wire approve/reject buttons to the approval service
7. Build Mutation Gateway: single service that validates recommendation is approved, executes mutation, logs result
8. Wire approved recommendations → Mutation Gateway → Google Ads API
9. Test full flow: AI generates recommendation → operator approves → system executes → implementation logged

### Phase 5: Attribution Bridge (2-3 hours, partially external)

**Goal:** Connect ads data to CRM outcomes.

1. **In dominionhomedeals.com repo:** Add gclid capture to LeadForm component
2. **In Sentinel:** Update lead creation API to accept and store gclid
3. **In Sentinel:** Create background job that resolves gclid → campaign/ad_group/keyword and populates `ads_lead_attribution`
4. **In Sentinel:** Update Analytics to show source → campaign → keyword → lead → deal chain
5. Test: create test lead with gclid → verify attribution populated

### Phase 6: Campaign Proposals (LATER — after 90 days of data)

**Goal:** AI generates structured campaign proposals for human review.

1. Port campaign proposal types and schema
2. Build proposal generation (Claude analyzes data, produces structured CampaignProposal)
3. Build proposal review UI
4. Approval workflow for proposals
5. **Do NOT build deployment to Google Ads** — operator builds manually from approved proposal
6. Build deployment only after Standard API access AND operator confidence

---

## H. Red-Team Section: Failure Modes, Blind Spots, Hidden Risks

### 1. Token expiry during long sync
**Risk:** OAuth access token expires mid-sync (5-stage process can take 30+ seconds). Stage 4 or 5 fails silently.
**Mitigation:** Token refresh at start of each stage, not just once. Or check token age before each API call.

### 2. Duplicate recommendations on retry
**Risk:** If the cron cycle generates recommendations and then crashes before marking complete, the next run generates duplicates.
**Mitigation:** Idempotency key on recommendations (hash of type + entity + date). Check before insert.

### 3. Stale data driving AI recommendations
**Risk:** Sync fails for 3 days. AI reviews the last successful sync data and recommends pausing a keyword that is now performing well.
**Mitigation:** Every AI review must include data freshness check. If last sync is > 36 hours old, flag the review as "stale data" and surface a warning.

### 4. Market misattribution
**Risk:** New campaign added in Google Ads without updating the `CAMPAIGN_MARKET_MAP`. Defaults to 'spokane'. Kootenai data pollutes Spokane reporting.
**Mitigation:** Alert on unmapped campaigns. Require explicit market assignment before data is included in market-filtered views.

### 5. Explorer API access limitations
**Risk:** Explorer-level developer token has lower query quotas and cannot perform some mutation types. System appears to work in testing but fails under production load.
**Mitigation:** Document exact Explorer limitations. Test mutation paths with Explorer token before relying on them. Plan Standard access application timeline.

### 6. AI hallucinating keyword IDs
**Risk:** Claude generates a recommendation referencing a keyword_id that doesn't exist in the database. Mutation gateway tries to execute on non-existent entity.
**Mitigation:** Mutation gateway must validate all entity references against the database before executing. Never trust AI-generated IDs without verification.

### 7. Budget concentration risk
**Risk:** AI recommends pausing 3 of 4 ad groups, concentrating all budget on one. If that ad group underperforms, entire daily budget is wasted on a single theme.
**Mitigation:** Never allow AI to pause more than 50% of active ad groups in a single recommendation batch. Require manual override for campaign-reshaping changes.

### 8. Conversion tracking gap
**Risk:** Google Ads conversion tags on `/sell` only fire for form submissions and click-to-call. Phone calls from search results (call extensions) are not tracked. You're measuring a subset of actual conversions.
**Mitigation:** Acknowledge this in all CPL calculations. Label CPL as "form CPL" not "total CPL." Add call tracking (Twilio forwarding number on ads) later.

### 9. RLS policy gaps on ads tables
**Risk:** New `ads_*` tables are created without RLS. Any authenticated Supabase user can read/write all ads data.
**Mitigation:** Every migration must include RLS enable + policies. Match Sentinel's existing RLS patterns.

### 10. Rate limiting on Google Ads API
**Risk:** If both the cron sync AND a manual "Sync Google Ads" button click run simultaneously, you hit Google's API rate limits.
**Mitigation:** Lock mechanism — check `ads_sync_logs` for a running sync before starting a new one. If one is running, return "sync already in progress."

---

## I. Final Implementation Brief

### For the coding agent:

**Context:** Sentinel is a Next.js 15.1 acquisitions CRM deployed on Vercel. It has an Ads Command Center page that currently shows "No Ad Data Yet" because Google Ads credentials aren't configured. The goal is to (a) get data flowing immediately, then (b) replace the flat `ad_snapshots` model with a normalized schema ported from the `dominion-ads-ai` project.

**Immediate (Phase 0):**
1. In `src/lib/google-ads.ts`: change `refreshAccessToken()` to read `GOOGLE_ADS_CLIENT_ID` and `GOOGLE_ADS_CLIENT_SECRET` (currently reads `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`)
2. In `src/lib/google-ads.ts`: add `"login-customer-id": process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID` header to `gaqlQuery()` and `mutate()` functions
3. Add env vars to Vercel: `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID=8540090319`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID=6108142037`, `GOOGLE_ADS_REFRESH_TOKEN`
4. Deploy and verify sync works

**Then (Phase 1-4):**
- Follow the phased plan in Section G above
- Use dominion-ads-ai's `database/schema.sql` as the schema source (adapt table names to `ads_` prefix)
- Port sync orchestration from `services/sync/google-ads-sync.ts`
- Port recommendation/approval services from `services/recommendations/` and `services/approvals/`
- Rewire UI tabs to read from normalized tables
- Build Mutation Gateway as single execution point

**Critical rules:**
- Never auto-execute mutations without explicit operator approval
- Every mutation must be logged before and after execution
- All recommendations must include risk_level
- Market separation (Spokane vs Kootenai) must be preserved on every table and query
- Sync must log every run to `ads_sync_logs`
- Run Sentinel's existing test suite after every phase — must stay at 690+ passing

---

## J. Final Recommendation

**Proceed with revisions.**

The proposal's direction is correct but the plan as written has critical gaps:

1. **Attribution bridge is entirely missing** — this must be added as a phase, not an afterthought
2. **Auto-execution policy is too aggressive** — the source docs explicitly forbid premature automation
3. **Phase ordering needs Phase 0** (quick fix to get data flowing NOW) before the full migration
4. **Campaign proposal deployment to Google Ads should be explicitly deferred** until Standard API access and 90+ days of data
5. **The dual-table transition period needs an atomic switchover plan**, not "keep temporarily"

The corrected plan in Section G is the version to build from. Start with Phase 0 today — it's a 1-hour fix that lights up the existing dashboard. Then execute Phases 1-4 over the next 1-2 weeks. Phase 5 (attribution) should be built as soon as the normalized sync is stable. Phase 6 (proposals) waits until the campaign has meaningful data.

**Do not build Phase 5 (Proactive AI auto-execution) or Phase 6 (Campaign deployment) from the original proposal until:**
- The Spokane campaign has 90+ days of conversion data
- Attribution bridge is live and populated
- Operator has explicitly opted in to expanded automation
- Developer token is upgraded from Explorer to Standard access
