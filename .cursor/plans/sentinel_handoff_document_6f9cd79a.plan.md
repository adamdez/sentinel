---
name: Sentinel Handoff Document
overview: Generate a comprehensive handoff document that gives another Claude Opus 4.6 agent complete context to continue building Sentinel from its current state -- covering industry, goals, architecture, schema, file structure, current status, known issues, and what to build next.
todos:
  - id: review-document
    content: User reviews the handoff document for accuracy and completeness before sharing with the other agent
    status: pending
isProject: false
---

# Sentinel ERP -- Complete Handoff Document for Claude Opus 4.6

## 1. INDUSTRY CONTEXT

Sentinel is a **wholesale real estate acquisition ERP** built for **Dominion Home Deals**, a real estate wholesaling company based in Spokane, WA. The business model:

- Identify **distressed properties** (probate, pre-foreclosure, tax lien, divorce, bankruptcy, FSBO, vacant, etc.) before competitors
- Contact property owners, negotiate below-market purchase contracts
- Assign (wholesale) contracts to cash buyers for an assignment fee ($5k-$30k per deal)
- Speed is the competitive advantage -- first to contact wins the deal

**Key terms:**

- **APN** = Assessor's Parcel Number (unique property ID per county)
- **ARV** = After-Repair Value (what a property is worth fixed up)
- **Skip Trace** = Finding owner contact info (phone, email) from public records
- **PropertyRadar** = Third-party API that provides property data, owner info, distress signals, valuations
- **Dominion** = The parent system; Sentinel is its CRM/ERP frontend
- **Ranger Push** = When Dominion's scoring engine pushes a qualified lead to Sentinel

---

## 2. GOVERNING DOCUMENT: DOMINION CHARTER v2.3

The entire system is governed by a strict architectural charter. Key principles:

- **Five strict domains** with unbreakable boundaries (Signal, Scoring, Promotion, Workflow, Analytics)
- **Append-only event stores** for distress_events, scoring_records, event_log (no UPDATE/DELETE)
- **APN + County = immutable property identity** (upserts only, no SELECT-then-INSERT)
- **Deterministic, replayable scoring** (same inputs always produce same outputs)
- **Compliance is sacred** -- DNC scrub, litigant suppression, opt-out enforcement before any dial
- **Phased execution** -- Phase 1 (Hardened Core) must be complete before Phase 2

The full Charter is embedded in the project's Cursor rules. Every code change must respect domain boundaries and invariants.

---

## 3. TECH STACK

- **Framework:** Next.js 15.1.0 (App Router, Turbopack)
- **Language:** TypeScript 5.7.0 (strict mode)
- **React:** 19.0.0
- **Styling:** Tailwind CSS v4 (inline theme in globals.css, NOT tailwind.config.ts)
- **UI Components:** Radix UI primitives + shadcn/ui
- **State Management:** Zustand 5.0.0
- **Animations:** Framer Motion 11.15.0
- **Database:** Supabase (PostgreSQL) with RLS
- **ORM:** Drizzle ORM 0.45.1 (schema definition only; runtime queries use Supabase JS client)
- **Data Fetching:** TanStack React Query 5.62.0
- **Drag-and-Drop:** @hello-pangea/dnd (Pipeline kanban)
- **Toasts:** Sonner 1.7.0
- **Deployment:** Vercel
- **Auth:** Supabase Auth (email/password)

---

## 4. DESIGN SYSTEM

Dark futuristic theme with glassmorphism:

- Background: `#07070d` (deep navy-black)
- Primary/Neon: `#00ff88` (bright green, used for accents, badges, glow)
- Cards: `rgba(13, 13, 20, 0.8)` with `backdrop-blur`
- Glass borders: `rgba(255, 255, 255, 0.06)`
- Score colors: FIRE (orange `#ff6b35`), HOT (red `#ef4444`), WARM (yellow `#eab308`), COLD (blue `#3b82f6`)
- Neon text-shadow: `0 0 8px` and `0 0 16px` layers of `#00ff88`
- All custom CSS variables defined in `src/app/globals.css` `:root` block

---

## 5. PROJECT STRUCTURE

```
src/
  app/
    layout.tsx                          # Root layout (Providers wrapper)
    globals.css                         # Tailwind v4 theme + custom properties
    login/page.tsx                      # Auth page (email/password)
    (sentinel)/                         # Authenticated route group
      layout.tsx                        # Sidebar + TopBar + Modals
      dashboard/page.tsx                # Main dashboard (6-widget grid)
      leads/page.tsx                    # Leads Hub (tabbed: My/Team/Adam/Nathan/Logan)
      pipeline/page.tsx                 # Kanban board (drag-and-drop)
      settings/page.tsx                 # Settings (placeholder)
      analytics/page.tsx                # Analytics (placeholder)
      campaigns/page.tsx                # Campaigns (placeholder)
      contacts/page.tsx                 # Contacts (placeholder)
      dialer/page.tsx                   # Dialer (placeholder)
      docusign/page.tsx                 # DocuSign (placeholder)
      gmail/page.tsx                    # Gmail (placeholder)
      my-calendar/page.tsx              # Calendar (placeholder)
      team-calendar/page.tsx            # Team Calendar (placeholder)
      sales-funnel/
        prospects/page.tsx              # LIVE - Prospects table + detail modal
        leads/page.tsx                  # Sales funnel leads (placeholder)
        leads/my-leads/page.tsx         # My leads sub-page
        facebook-craigslist/page.tsx    # FB/CL source (placeholder)
        ppl/page.tsx                    # PPL source (placeholder)
        negotiation/page.tsx            # Negotiation stage (placeholder)
        disposition/page.tsx            # Disposition stage (placeholder)
        nurture/page.tsx                # Nurture stage (placeholder)
        dead/page.tsx                   # Dead leads (placeholder)
    api/
      prospects/route.ts                # POST (create), PATCH (claim/status)
      prospects/skip-trace/route.ts     # POST (PropertyRadar persons + enrichment)
      ingest/route.ts                   # POST (webhook ingest), GET (docs)
      ingest/propertyradar/route.ts     # POST (single property lookup), GET (docs)
      ranger-push/route.ts             # POST (Dominion push receiver)
      dashboard/layout/route.ts         # GET/PUT (user dashboard layout)
      scoring/replay/route.ts           # POST (admin scoring replay)
      audit/route.ts                    # GET/POST (stubbed)
  components/
    layout/
      sidebar.tsx                       # Navigation with real-time badges
      top-bar.tsx                       # Header bar
      global-search.tsx                 # Live Supabase search
      command-palette.tsx               # Ctrl+K command palette
      team-chat.tsx                     # Team chat panel
      floating-action-button.tsx        # Removed from layout render
    sentinel/
      new-prospect-modal.tsx            # Create prospect form
      prospects/prospect-detail-modal.tsx  # Prospect detail + skip trace
      leads/lead-table.tsx              # Leads table component
      leads/lead-detail-modal.tsx       # Lead detail modal
      leads/lead-segment-control.tsx    # Tab segment switcher
      leads/lead-filters.tsx            # Filter controls
      dashboard/                        # Dashboard grid + 11 widget components
      ai-score-badge.tsx                # Score badge (FIRE/HOT/WARM/COLD)
      glass-card.tsx                    # Glassmorphism card
      pipeline-board.tsx                # Kanban board component
      dialer-widget.tsx                 # Dialer widget
      page-shell.tsx                    # Page wrapper
    ui/                                 # shadcn/ui primitives (do not modify)
  lib/
    supabase.ts                         # Browser client + createServerClient()
    store.ts                            # Zustand store (user, sidebar, features)
    scoring.ts                          # AI Scoring Engine v1.1
    scoring-persistence.ts              # Score writing to Supabase
    compliance.ts                       # DNC/litigant/opt-out (stub data)
    rbac.ts                             # Role permission matrix
    types.ts                            # Shared TypeScript interfaces
    leads-data.ts                       # LeadRow type + TEAM_MEMBERS constant
    audit.ts                            # Audit logging utilities
    feature-flags.ts                    # Feature flag system
    dashboard-config.ts                 # Dashboard widget config
    supabase-realtime.ts                # Realtime subscription helpers
    supabase-types.ts                   # Manual DB type defs
    utils.ts                            # cn() utility
  hooks/
    use-prospects.ts                    # Fetches prospects from Supabase
    use-leads.ts                        # Fetches leads from Supabase
    use-dashboard-layout.ts             # Dashboard layout persistence
    use-command-palette.ts              # Command palette state
    use-optimistic.ts                   # Optimistic update hook
    use-realtime.ts                     # Realtime subscription hook
  providers/
    providers.tsx                        # Root provider stack
    auth-sync-provider.tsx              # Syncs Supabase auth -> Zustand
    modal-provider.tsx                  # Modal state context
    query-provider.tsx                  # React Query provider
    realtime-provider.tsx               # Realtime provider
  db/
    schema.ts                           # Drizzle ORM schema (10 tables)
    index.ts                            # Drizzle client export
    migrations/0000_initial_schema.sql  # Full initial migration
    rls-policies.sql                    # RLS policy definitions
    rls-leads-claim.sql                 # Lead claim policies
    push-to-sentinel.sql                # Dominion -> Sentinel SQL functions
    test-ranger-push.sql                # Test APNs
```

---

## 6. DATABASE SCHEMA (Supabase PostgreSQL)

### Core Tables

**properties** -- Canonical property records (Identity Domain)

- PK: `id` (UUID)
- Unique: `(apn, county)`
- Key columns: `address`, `city`, `state`, `zip`, `owner_name` (NOT NULL), `owner_phone`, `owner_email`, `estimated_value`, `equity_percent`, `bedrooms`, `bathrooms`, `sqft`, `year_built`, `lot_size`, `property_type`, `owner_flags` (JSONB)
- `owner_flags` stores: `manual_entry`, `enrichment_pending`, `pr_raw` (full PropertyRadar data), `persons`, `all_phones`, `all_emails`

**distress_events** -- Append-only signal store

- PK: `id` (UUID), FK: `property_id`
- Unique: `fingerprint` (SHA256 dedup hash)
- Columns: `event_type` (enum), `source`, `severity` (0-10), `raw_data` (JSONB), `confidence`
- TRIGGER: prevents UPDATE/DELETE

**scoring_records** -- Append-only versioned scores

- PK: `id` (UUID), FK: `property_id`
- Columns: `model_version`, `composite_score`, `motivation_score`, `deal_score`, `severity_multiplier`, `recency_decay`, `stacking_bonus`, `owner_factor_score`, `equity_factor_score`, `ai_boost`, `factors` (JSONB)
- TRIGGER: prevents UPDATE/DELETE

**leads** -- Temporal lead lifecycle (Workflow Domain)

- PK: `id` (UUID), FK: `property_id`, `contact_id`
- Columns: `status` (enum: prospect/lead/negotiation/disposition/nurture/dead/closed), `assigned_to`, `priority`, `source`, `tags` (text[]), `lock_version` (optimistic locking), `notes`
- Additional columns added at runtime: `claimed_at`, `claim_expires_at`, `heat_score`

**event_log** -- Append-only audit trail

- PK: `id` (UUID)
- Columns: `user_id`, `action`, `entity_type`, `entity_id`, `details` (JSONB)
- TRIGGER: prevents UPDATE/DELETE

**user_profiles** -- Auth-linked profiles

- PK: `id` (FK to auth.users)
- Columns: `full_name`, `email`, `role` (admin/agent/viewer), `saved_dashboard_layout` (JSONB)

**Also:** `contacts`, `deals`, `tasks`, `campaigns`, `offers` (defined but mostly placeholder)

### Supabase Client Pattern

- **Browser client** (`supabase`): Uses anon key, respects RLS
- **Server client** (`createServerClient()`): Uses service role key, bypasses RLS -- used in ALL API routes
- **Critical**: Direct client-side inserts fail silently due to RLS. All writes go through API routes.

---

## 7. ENVIRONMENT VARIABLES

```
NEXT_PUBLIC_SUPABASE_URL          # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY     # Supabase anon/public key
SUPABASE_SERVICE_ROLE_KEY         # Supabase service role key (bypasses RLS)
DATABASE_URL                      # Direct Postgres connection string
PROPERTYRADAR_API_KEY             # PropertyRadar API bearer token
INGEST_WEBHOOK_SECRET             # Webhook authentication secret
TWILIO_ACCOUNT_SID                # (configured, not wired)
TWILIO_AUTH_TOKEN                 # (configured, not wired)
TWILIO_PHONE_NUMBER               # (configured, not wired)
BATCHDATA_API_TOKEN               # (configured, not wired)
```

---

## 8. CURRENT STATUS -- WHAT WORKS

### Fully Functional

- Login (Supabase auth, email/password, 3 team members: Adam/Nathan/Logan)
- Dashboard with 6-widget drag-and-drop grid (layout persisted per user)
- Prospects page with live Supabase queries, search, filter, sort, real-time subscription
- Prospect detail modal with 8 data sections
- New Prospect modal (saves property + lead via API, bypasses RLS)
- Skip Trace / Enrich button (calls PropertyRadar Persons API for contact info)
- PropertyRadar single-property enrichment (auto-enriches unenriched properties during skip trace)
- Global search (live Supabase search across properties + leads)
- Command palette (Ctrl+K)
- Breaking Leads sidebar (real-time feed of new prospects, score >= 40)
- Leads Hub with 5 tabs (My Leads, Team, Adam's, Nathan's, Logan's) -- live Supabase data
- Pipeline kanban board with drag-and-drop, real-time updates, claim-on-drag
- Sidebar with real-time red dot badges (Prospects, FB/Craigslist, PPL)
- Ranger Push API (receives Dominion pushes)
- Scoring Engine v1.1 (config-driven, deterministic)
- Scoring Replay endpoint (admin-only)
- Event deduplication (fingerprint hash)
- Audit logging to event_log (non-blocking)

### Placeholder Pages (UI Shell Only, No Backend)

- Settings, Analytics, Campaigns, Contacts, Dialer, DocuSign, Gmail, My Calendar, Team Calendar
- Facebook/Craigslist, PPL, Negotiation, Disposition, Nurture, Dead leads

### Dashboard Widgets (UI renders, data is hardcoded/static)

- My Top Prospects, My Top Leads, Live Map, Activity Feed, Next Best Action, Funnel Value, Active Drips, Revenue Impact, Team Chat Preview, Quick Dial

---

## 9. KNOWN ISSUES AND GOTCHAS

1. **RLS blocks all direct client-side writes.** Every insert/update MUST go through an API route using `createServerClient()`. This has caused silent `{}` errors multiple times.
2. `**owner_name` is NOT NULL in properties.** Manual prospect creation must default to "Unknown Owner" if blank.
3. **PropertyRadar enrichment must NOT run inline during save.** It causes Vercel timeouts. Enrichment is deferred to the Skip Trace button.
4. `**event_log.user_id`** is the correct column name (was briefly renamed to `actor_id` in code, now fixed back to `user_id`).
5. **PowerShell does not support `&&`.** Git commands must be chained with `;` or run separately.
6. **Compliance checks are stub data** (`compliance.ts` uses hardcoded Sets). Real DNC/litigant checks are TODO.
7. **No automated PropertyRadar polling exists.** All PropertyRadar data ingestion is manual (via UI buttons or direct API calls). Phase 3 will add scheduled polling.
8. **The Pipeline page still exists** but was removed from sidebar navigation. The Deal Funnel stages serve as the primary workflow.
9. **Dashboard widgets** mostly render static/hardcoded data. They need to be wired to live Supabase queries.
10. `**leads` table has extra columns** (`heat_score`, `claimed_at`, `claim_expires_at`) that exist in the DB but not in the Drizzle schema. The Drizzle schema is the source of truth for structure, but runtime queries use raw Supabase JS.

---

## 10. SCORING MODEL (v1.1)

```
Composite = (BaseSignalScore * SeverityMultiplier * RecencyDecay)
          + StackingBonus + OwnerFactors + EquityFactors + AIBoost
```

Signal weights: probate=28, pre_foreclosure=26, inherited=25, bankruptcy=24, tax_lien=22, divorce=20, fsbo=16, code_violation=14, vacant=12, absentee=10

Severity tiers: 0-2=1.0x, 3-5=1.25x, 6-8=1.5x, 9-10=1.8x

Recency decay: `exp(-0.015 * days)` (~46-day half-life)

Stacking bonus: 2 signals=+6, 3=+14, 4=+22, 5+=+30

Score labels: FIRE >= 85, HOT >= 65, WARM >= 40, COLD < 40

File: `src/lib/scoring.ts`

---

## 11. WHAT TO BUILD NEXT (Charter Phase Alignment)

### Phase 1 Remaining (Hardened Core)

- Wire compliance checks to real DNC database (replace stub in `compliance.ts`)
- Implement optimistic locking on lead claims (use `lock_version`)
- Add status transition guardrails (e.g., can't go from "dead" to "prospect")
- Full test coverage (idempotency, replay, concurrency)
- CI pipeline (GitHub Actions)

### Phase 2 (CRM Maturity)

- Wire dashboard widgets to live data (especially: My Top Prospects, My Top Leads, Activity Feed, Funnel Value)
- Build out Negotiation, Disposition, Nurture, Dead pages with real workflow logic
- Dialer integration (Twilio)
- Task management system
- Contacts page with merge/dedup
- Campaign builder

### Phase 3 (Fast Signal Mode)

- **Automated PropertyRadar polling** (Vercel Cron or pg_cron) -- this is the biggest gap
- Incremental scoring (only re-score affected properties)
- Real-time promotion evaluation
- FSBO adapter, Obituary adapter
- Bulk import endpoint (`/api/ingest/propertyradar/bulk`)

### Phase 4 (Analytics)

- Closed-deal feedback loop
- Signal ROI dashboards
- Model calibration tools
- Conversion tracking

---

## 12. CRITICAL RULES FOR CONTINUATION

1. **Never violate domain boundaries.** Signal domain writes properties + distress_events only. Scoring writes scoring_records only. Workflow manages leads only.
2. **Never make append-only tables mutable.** distress_events, scoring_records, event_log have triggers preventing UPDATE/DELETE.
3. **Always use `createServerClient()` for writes in API routes.** Never rely on client-side Supabase for inserts.
4. **APN + County is the golden identity.** All property upserts use `ON CONFLICT (apn, county) DO UPDATE`.
5. **Scoring must be deterministic.** Same inputs = same outputs. Always version the model.
6. **No feature creep.** Complete the current phase before adding new features.
7. **Compliance before dial.** No lead enters the dial queue without DNC + litigant + opt-out checks.
8. **Keep the dark glassmorphism aesthetic.** All new UI must match the existing neon-green-on-dark theme.
9. **Test for idempotency.** Re-importing the same data must not create duplicates.
10. **Preserve all existing functionality.** Never break what works while adding new features.

---

## 13. TEAM MEMBERS

- **Adam DesJardin** -- Founder, admin role, `adam@dominionhomedeals.com`
- **Nathan J.** -- Agent, `nathan@dominionhomedeals.com`
- **Logan D.** -- Agent, `logan@dominionhomedeals.com`

---

## 14. DEPLOYMENT

- **Production URL:** [https://sentinel-drab-chi.vercel.app](https://sentinel-drab-chi.vercel.app)
- **Git repo:** [https://github.com/adamdez/sentinel](https://github.com/adamdez/sentinel) (branch: `main`)
- **Database:** Supabase hosted PostgreSQL
- **No `vercel.json`** exists yet (needed for cron jobs)

