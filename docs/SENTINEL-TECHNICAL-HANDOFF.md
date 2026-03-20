# Sentinel Technical Handoff

**For: Claude Chat (or any AI/engineer picking up this codebase)**
**Date: 2026-03-18**
**Author: Adam (Dominion Home Deals)**

---

## 1. What Sentinel Is

Sentinel is a **custom-built acquisitions CRM and operating system** for Dominion Home Deals, a 2-person real estate wholesaling / wholetail / novation company operating in Spokane County, WA (primary) and Kootenai County, ID (secondary).

It is not a generic CRM. It is not an ERP. It is a **purpose-built operator workspace** designed to compress the execution loop of a very small team so they can perform like a much larger operation — specifically, to increase **contracts per founder-hour**.

**Team:**
- **Adam** — backend operations, Google Ads, KPI ownership, CRM buildout, management review
- **Logan** — primary acquisitions operator, inbound response, seller calls, follow-up, buyer relationships

**Business goal:** ~$2M/year revenue with 2 people, powered by AI-leveraged tooling that replaces the support labor (VAs, admins, junior analysts) that normally shows up as a wholesaling business scales.

---

## 2. Tech Stack

| Layer | Technology | Version/Notes |
|-------|-----------|---------------|
| Framework | **Next.js** | 15.1.0, App Router, React 19, TypeScript 5.7 |
| Database | **PostgreSQL** via Supabase | Hosted Supabase project |
| ORM | **Drizzle ORM** | 0.45.1, type-safe SQL, migration files in `supabase/migrations/` |
| Auth | **Supabase Auth** | JWT-based, RLS on all tables, role enum: admin/agent/viewer |
| Hosting | **Vercel** | Serverless, cron jobs via `vercel.json` |
| State (client) | **Zustand** 5.0 + **React Query** 5.62 | Zustand for UI state, React Query for server state |
| UI | **Tailwind CSS** 4.0 + **Radix UI** + **Framer Motion** | Utility-first + headless primitives |
| Icons | **Lucide React** | |
| Voice/Telephony | **Twilio Voice SDK** | Browser WebRTC VoIP, inbound/outbound, recording |
| AI (Dialer) | **OpenAI** | gpt-5-mini (fast lane), gpt-5.4 (heavy lane), Responses API |
| AI (Ads) | **Anthropic Claude** | claude-opus-4-6, streaming chat + structured extraction |
| Ads | **Google Ads API v23** | GAQL queries, campaign/keyword/ad management |
| Property Data | **ATTOM** + **PropertyRadar** | Adapters exist but are early-stage |
| Email | **Gmail API** | OAuth integration for email sync |
| Testing | **Vitest** 4.0 + **Playwright** 1.58 | Unit + E2E smoke tests |

---

## 3. Repository Structure

```
C:\Users\adamd\Desktop\Sentinel\
├── src/
│   ├── app/
│   │   ├── (public)/           # Seller-facing pages (/sell, landing pages)
│   │   ├── (sentinel)/         # Auth-protected operator pages
│   │   │   ├── dashboard/      # KPI overview
│   │   │   ├── dialer/         # Outbound/inbound call workspace
│   │   │   │   ├── inbound/    # Inbound call review
│   │   │   │   ├── war-room/   # Real-time team activity
│   │   │   │   ├── review/     # Post-call review + eval
│   │   │   │   └── qa/         # Quality assurance queue
│   │   │   ├── leads/          # Lead list + Lead Detail ([id])
│   │   │   ├── pipeline/       # Kanban deal pipeline
│   │   │   ├── ads/            # Google Ads Command Center
│   │   │   ├── analytics/      # Source/market attribution
│   │   │   ├── buyers/         # Buyer profiles
│   │   │   ├── tasks/          # Follow-up tasks
│   │   │   ├── dispo/          # Disposition workflow
│   │   │   ├── settings/       # Admin (prompt registry, voice, source policies)
│   │   │   └── grok/           # Chat analysis interface
│   │   └── api/
│   │       ├── dialer/         # 30+ dialer endpoints
│   │       │   └── v1/         # Session CRUD, notes, publish, AI lanes
│   │       ├── leads/          # Lead CRUD, opportunity queue, contradiction scan
│   │       ├── ads/            # 17 ads endpoints (sync, intelligence, actions, chat)
│   │       ├── twilio/         # VoIP token, webhooks, status
│   │       ├── inbound/        # Inbound call/email/webform/vendor webhooks
│   │       ├── dossiers/       # AI lead research + artifacts
│   │       ├── enrichment/     # Batch scoring, re-evaluation
│   │       ├── ingest/         # PropertyRadar/ATTOM data import
│   │       ├── analytics/      # KPI summary, source performance
│   │       ├── gmail/          # Email OAuth, inbox, send
│   │       ├── cron/           # Vercel cron jobs
│   │       └── admin/          # Clean-slate, integrity, mass-seed
│   ├── lib/
│   │   ├── dialer/             # ISOLATED dialer domain
│   │   │   ├── types.ts        # CallSessionStatus state machine, CRMLeadContext
│   │   │   ├── session-manager.ts
│   │   │   ├── crm-bridge.ts   # Read-only CRM snapshot for dialer
│   │   │   ├── publish-manager.ts  # Only write path from dialer → CRM
│   │   │   ├── openai-lane-client.ts
│   │   │   ├── post-call-structure.ts
│   │   │   ├── note-manager.ts
│   │   │   ├── qa-checks.ts
│   │   │   ├── stt-provider.ts
│   │   │   ├── ai-trace-writer.ts
│   │   │   ├── inbound-writeback.ts
│   │   │   └── db.ts
│   │   ├── ads/                # Ads system prompt, helpers
│   │   ├── agent/              # AI agent orchestration
│   │   ├── store.ts            # Zustand global state
│   │   ├── supabase.ts         # Client + server Supabase init
│   │   ├── supabase-types.ts   # Manual type mirror of schema
│   │   ├── claude-client.ts    # Anthropic API wrapper
│   │   ├── google-ads.ts       # Google Ads API v23 wrapper
│   │   ├── twilio.ts           # Credential validation
│   │   ├── compliance.ts       # DNC, opt-out, litigant scrubbing
│   │   ├── scoring.ts          # Motivation + deal score calculation
│   │   ├── scoring-predictive.ts
│   │   └── types.ts            # Global types, FeatureFlags
│   ├── components/
│   │   ├── sentinel/           # Domain components (25+ panels/widgets)
│   │   │   ├── master-client-file-modal.tsx  # Lead Detail workspace
│   │   │   ├── post-call-panel.tsx
│   │   │   ├── post-call-draft-panel.tsx
│   │   │   ├── live-assist-panel.tsx         # NEW (untracked)
│   │   │   ├── seller-memory-preview.tsx     # NEW (untracked)
│   │   │   ├── coach-panel.tsx
│   │   │   ├── pipeline-board.tsx
│   │   │   ├── dialer-widget.tsx
│   │   │   ├── dossier-review-card.tsx
│   │   │   ├── contradiction-flags-panel.tsx
│   │   │   └── dashboard/widgets/
│   │   └── ui/                 # Radix primitives (badge, button, etc.)
│   ├── hooks/                  # 28 custom React hooks
│   ├── providers/              # Auth, Coach, Query, Realtime providers
│   └── db/
│       ├── schema.ts           # Drizzle ORM schema (36+ tables)
│       └── index.ts
├── supabase/
│   └── migrations/             # 17 SQL migration files (Feb 28 → Mar 16, 2026)
├── docs/                       # Design docs, test plans
├── public/
├── next.config.ts
├── vercel.json                 # Cron job definitions
├── drizzle.config.ts
├── package.json
└── CLAUDE.md                   # Build doctrine for Claude Code
```

---

## 4. Database Schema (PostgreSQL via Supabase + Drizzle)

### 4.1 Core CRM Tables

**`properties`** — Immutable property identity (APN + county = unique)
- apn, county, address, city, state, zip, ownerName, mailingAddress
- estimatedValue, equityPercent, bedrooms, bathrooms, sqft, yearBuilt, propertyType
- Upsert-only. Never delete or overwrite without explicit override.

**`contacts`** — Individual people
- firstName, lastName, phone, email, contactType
- dncStatus, optOut, litigantFlag (compliance fields)

**`leads`** — Temporal workflow state (the working record)
- propertyId (FK), contactId (FK), status (enum), assignedTo
- motivationLevel (1-5), sellerTimeline, conditionLevel, priceExpectation
- qualificationRoute (offer_ready/follow_up/nurture/dead/escalate)
- qualificationScoreTotal, occupancyScore, equityFlexibilityScore
- callSequenceStep, totalCalls, liveAnswers, voicemailsLeft
- nextFollowUpAt, lastContactAt, promotedAt
- conversionGclid (Google Ads attribution)
- appointmentAt, offerAmount, contractAt, assignmentFeeProjected (milestone tracking)
- lockVersion (optimistic concurrency), notes, tags[], source, priority

**Lead Status Enum:** `staging | prospect | lead | qualified | negotiation | disposition | nurture | dead | closed`

**`deals`** — Deal lifecycle
- leadId, propertyId, status (draft/negotiating/under_contract/assigned/closed/dead)
- askPrice, offerPrice, contractPrice, assignmentFee, arv
- buyerId, dispoPrep, closingStatus, titleCompany

**`tasks`** — Operator follow-up actions
- title, assignedTo, leadId, dueAt, completedAt, status (pending/completed)

**`buyers`** — Buyer profiles for disposition
- contactName, companyName, phone, email, markets[], assetTypes[]
- priceRangeLow/High, fundingType, proofOfFunds, rehabTolerance, arvMax
- closeSpeedDays, reliabilityScore, dealsClosed

### 4.2 Signal & Scoring Tables

**`distress_events`** — Append-only signal domain
- propertyId, eventType (probate/foreclosure/tax_lien/code_violation/vacant/divorce/bankruptcy/fsbo/absentee/inherited/water_shutoff/condemned)
- severity, source, fingerprint (dedup), rawData (JSONB), confidence

**`scoring_records`** — Append-only, versioned scoring
- propertyId, modelVersion, compositeScore, motivationScore, dealScore
- severityMultiplier, recencyDecay, stackingBonus
- ownerFactorScore, equityFactorScore, aiBoost, factors (JSONB)

### 4.3 Dialer Tables (Session-backed call workflow)

**`call_sessions`** — Live session state machine
- leadId, userId, twilioSid, phoneDialed
- status: `initiating → ringing → connected → ended/failed`
- contextSnapshot (JSONB: frozen CRMLeadContext at session start)
- aiSummary, disposition
- State machine enforced at DB level

**`session_notes`** — Per-note stream during calls
- sessionId, noteType (transcript_chunk/ai_suggestion/operator_note)
- speaker (operator/seller/ai), content, confidence
- isAiGenerated, isConfirmed, sequenceNum

**`session_extracted_facts`** — Structured AI extractions from calls
- sessionId, factType (motivation_signal/price_mention/timeline_mention/condition_note/objection/follow_up_intent/red_flag)
- rawText, structuredValue (JSONB), isAiGenerated, isConfirmed

**`dialer_events`** — Audit trail (dialer-owned, not CRM)
- sessionId, userId, eventType, payload (JSONB)

**`calls_log`** — Published call outcomes (CRM-owned, written by publish-manager)
- leadId, userId, phoneDialed
- disposition (completed/voicemail/wrong_number/busy/no_answer/follow_up/appointment/offer_made)
- durationSec, notes, aiSummary, startedAt, endedAt

### 4.4 Intelligence Tables

**`dossiers`** — AI-researched lead intelligence
- leadId, status (proposed/reviewed/flagged/promoted)
- situationSummary, likelyDecisionMaker, topFacts
- recommendedCallAngle, reviewNotes

**`dossier_artifacts`** — Captured evidence
- leadId, sourceUrl, sourceType (court_record/obituary/news/linkedin/property_listing/other)
- capturedAt, extractedNotes, screenshotKey

**`fact_assertions`** — Discrete reviewable claims
- artifactId, leadId, factType, factValue, confidence
- reviewStatus (pending/accepted/rejected), promotedField

**`source_policies`** — Per-source automation policy
- sourceType, policy (approved/review_required/blocked), rationale

**`prompt_registry`** — Workflow prompt versions
- workflow, version, status (testing/active/deprecated), description, changelog

### 4.5 Ads Command Center Tables

- `ads_campaigns`, `ads_ad_groups`, `ads_keywords`, `ads_ads` — Google Ads structure mirror
- `ads_negative_keywords`, `ads_campaign_budgets`, `ads_conversion_actions` — Extended data
- `ads_device_metrics`, `ads_geo_metrics` — Segmented performance
- `ads_daily_metrics` — Time-series performance data
- `ads_search_terms` — Search query data
- `ads_intelligence_briefings` — Dual-model AI analysis output
- `ads_alerts` — Briefing-linked alerts
- `ads_recommendations` — AI action candidates
- `ads_approvals` — Immutable operator decision ledger
- `ads_implementation_logs` — Execution history

### 4.6 Supporting Tables

- `user_profiles` — Auth metadata, role (admin/agent/viewer), preferences, Twilio phone mapping
- `event_log` — CRM audit trail
- `ad_snapshots` — Legacy daily ad data
- `ad_reviews` — Legacy AI analysis output

---

## 5. Key Architectural Boundaries

### 5.1 The Three-Domain Model

```
┌─────────────────────┐     ┌──────────────────────┐     ┌──────────────────────┐
│   ACTION CORE        │     │   DIALER WORKSPACE    │     │  INTELLIGENCE LAYER  │
│   (Sentinel)         │     │                       │     │                      │
│   Leads, stages,     │◄────│   Call sessions,      │     │  Artifacts, facts,   │
│   tasks, calls_log,  │publish│  live notes, AI      │     │  dossiers, scoring,  │
│   offers, dispo,     │only  │  suggestions, seller  │     │  provider data,      │
│   operator views     │     │  memory, transcript   │     │  review queue         │
└─────────────────────┘     └──────────────────────┘     └──────────────────────┘
         ▲                           │                            │
         │                    context snapshot                    │
         │                    (read-only bridge)           sync snapshots
         │                                                (review-gated)
         └────────────────────────────────────────────────────────┘
```

### 5.2 Critical Write-Path Rules

1. **Dialer → CRM:** Only through `publish-manager.ts`. Dialer session data is volatile. Only curated, operator-confirmed outcomes write to `calls_log`.
2. **Intelligence → CRM:** Only through `crm_sync_snapshots` with review policy gate. No raw provider payload ever writes directly to lead tables.
3. **AI → CRM:** Every AI-assisted writeback must have run IDs, prompt version identity, inputs, outputs, and review policy. No magical writebacks.

### 5.3 Boundary File Contract

| File | Role |
|------|------|
| `src/lib/dialer/crm-bridge.ts` | Only read path from CRM → dialer (snapshots lead context) |
| `src/lib/dialer/publish-manager.ts` | Only write path from dialer → CRM (publishes to calls_log) |
| `src/lib/dialer/types.ts` | Zero-import pure TypeScript types. CRM consumes these types only. |

---

## 6. Current Feature State (As-Built, March 2026)

### 6.1 Working / Production-Ready

- **Lead Inbox & Lead Detail** — Full CRUD, status management, qualification fields, notes, tags, assignment
- **Pipeline Board** — Kanban view by stage
- **Task Management** — Follow-up tasks with due dates, assignment
- **Seller Landing Pages** — `/sell` with specialized pages (as-is, foreclosure, inherited, about)
- **Inbound Lead Webhooks** — Email, webform, vendor lead intake
- **Call Logging** — Structured call outcomes via dialer publish flow
- **Scoring Engine** — Composite motivation + deal scores, append-only versioned records
- **Distress Event Tracking** — Probate, foreclosure, tax lien, vacancy, etc.
- **Compliance Layer** — DNC check, opt-out, litigant scrubbing, voice consent ledger
- **Dossier System** — Artifact capture, fact extraction, dossier compilation, review queue
- **Contradiction Detection** — Cross-source inconsistency flagging
- **Source Policy Registry** — Per-source automation/review policy
- **Prompt Registry** — Versioned AI prompt management
- **Google Ads Command Center** — Full sync, dual-model intelligence (Claude + adversarial), recommendation workflow, execution gateway, streaming chat
- **Analytics** — KPI summary, source performance, conversion tracking by source/market
- **Authentication** — Supabase Auth, RLS on all tables, role-based access

### 6.2 Implemented But Needs Hardening

- **Dialer Session Workflow** — Session tables, state machine, CRM snapshot, basic publish flow exist. Live AI notes panel (`live-assist-panel.tsx`) and seller memory (`seller-memory-preview.tsx`) are new/untracked. Post-call draft panel exists. The full loop (pre-call brief → in-call notes → post-call publish → callback scheduling → qualification confirm) needs end-to-end testing under real call conditions.
- **Inbound Call Classification** — Routes exist, classification logic works, but the full inbound → classify → commit → lead-create → calls_log flow needs production testing.
- **War Room** — Page exists, shows real-time team call activity. Needs production validation.
- **SMS** — Route exists (`/api/dialer/sms`), but Washington outbound is call-only by default. SMS is informational/callback only.

### 6.3 Partially Built / Stubs

- **Property Lookup** — PropertyRadar bulk-seed and ATTOM daily-poll routes exist. No universal address search UI yet. No property card UI.
- **Buyer/Dispo Workflow** — Buyers table and basic profiles exist. No buyer-fit scoring, no stale-dispo detection, no dispo board beyond basic list.
- **Live Transcription** — `stt-provider.ts` exists as a routing stub. No live STT integration yet.
- **AI Receptionist / Voice Front Office** — Not built. Strategy documents call for Vapi or Retell on Twilio substrate.
- **Browser Research Runner** — Not built. Planned for probate/county research.
- **Exception Engine** — Concept exists in strategy. No dedicated exception queue or SLA-based alerting yet.

### 6.4 Not Yet Started

- Control plane (run IDs, trace logging, approval framework, eval datasets)
- Universal property lookup UI
- Property card / valuation packet
- MLS / RESO Web API integration
- Durable workflow engine (Inngest/Trigger.dev)
- n8n (not needed yet, optional edge automation)
- AI receptionist
- Buyer-fit scoring
- Trust content generation
- Synthetic seller lab

---

## 7. Cron Jobs (Vercel)

| Schedule | Endpoint | Purpose |
|----------|----------|---------|
| `0 6 * * *` | `/api/ingest/daily-poll` | Daily distress signal ingest |
| `*/15 * * * *` | `/api/enrichment/batch` | Batch scoring every 15 min |
| `0 12 * * *` | `/api/cron/daily-verse` | Daily verse (team morale) |
| `0 4 * * *` | `/api/enrichment/re-evaluate` | Periodic re-scoring |
| `0 13 * * *` | `/api/ads/sync` | Daily Google Ads data sync |
| `30 13 * * *` | `/api/ads/cycle?mode=daily` | Daily ads analysis cycle |
| `0 13 * * 0` | `/api/ads/cycle?mode=weekly` | Weekly ads strategy review |

---

## 8. AI Integration Details

### 8.1 Dialer AI (OpenAI)

**File:** `src/lib/dialer/openai-lane-client.ts`

Six lanes with per-lane model overrides via env vars:

| Lane | Purpose | Default Model |
|------|---------|---------------|
| `pre_call_brief` | Call preparation context | gpt-5-mini |
| `summarize` | Quick post-call summary | gpt-5-mini |
| `draft_note` | Structured post-call capture | gpt-5.4 |
| `qa_notes` | Call quality review | gpt-5-mini |
| `inbound_assist` | Live inbound call assist | gpt-5-mini |
| `objection_strategy` | Real-time objection handling | gpt-5.4 |

Uses OpenAI Responses API format (maps "system" to "developer" role).

### 8.2 Ads AI (Claude)

**File:** `src/lib/claude-client.ts`

- Model: `claude-opus-4-6`
- Streaming chat with 200K context, 10K buffer, auto-trim
- Structured JSON extraction with balanced depth-counter parser
- System prompt: `src/lib/ads/ads-system-prompt.ts` (500+ lines, comprehensive ads operating intelligence)

### 8.3 AI Model Routing

- **Dialer domain** uses OpenAI exclusively (latency-sensitive, call-adjacent)
- **Ads domain** uses Claude exclusively (reasoning-heavy, strategic analysis)
- This split is intentional and should be preserved unless there's a clear reason to change it.

---

## 9. Environment Variables (60+)

Key groups:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_PHONE_NUMBER_ADAM`, `TWILIO_PHONE_NUMBER_LOGAN`
- `OPENAI_API_KEY` + per-lane model overrides (`DIALER_AI_MODEL_PRE_CALL_BRIEF`, etc.)
- `ANTHROPIC_API_KEY`
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_MANAGER_ID`
- `PROPERTYRADAR_API_KEY`, `ATTOM_API_KEY`
- `CRON_SECRET`
- `ESCALATION_TARGET_USER_ID`

---

## 10. Current Git State (as of 2026-03-18)

**Branch:** `main`

**Modified (unstaged):**
- Dialer pages (dialer, inbound, war-room)
- API routes (sms, test, sessions)
- Components (missed-opportunity-queue, post-call panels)
- Dialer types

**New/Untracked:**
- `docs/dialer-manual-test-plan.md`, `docs/dialer-retest-plan.md`
- `docs/plans/2026-03-16-ads-command-center-upgrade-*`
- `src/components/sentinel/live-assist-panel.tsx` (live call AI assist)
- `src/components/sentinel/seller-memory-preview.tsx` (call memory surface)

**Recent commits:**
- Ads command center: GAQL fix, type cast fix, intel action execution, Apply Fix + Discuss buttons, camelCase field names

---

## 11. What the Build Blueprint Says to Do Next

The **Sentinel Build Blueprint (Revised, March 2026)** defines a 10-phase successive build plan. Here is where things stand relative to that plan:

### Phase 0 — Audit + Workflow Lock (1-2 weeks)
**Status: Partially done.** Lead stages exist in the enum. CLAUDE.md captures anti-goals and workflow rules. But there is no single-page stage machine document, no locked ready-to-call criteria, no locked offer-candidate criteria, and no locked post-call required fields definition. The dialer/client-file boundary is documented in the handoff docs but not formally locked in code contracts.

**What's needed:** A one-page stage machine spec. Locked definitions for ready-to-call, post-call required fields, and offer-candidate criteria. Formal dialer boundary contract (which is documented but needs to be enforced through tests or type contracts).

### Phase 1 — Action-Core + Dialer Boundary (2-3 weeks)
**Status: Mostly built.** lead_status enum exists, next_follow_up_at exists, structured call outcomes exist via the dialer session publish flow. Stale-lead logic exists conceptually in scoring but not as explicit hard warnings in the UI. The dialer is architecturally separate (own domain in `src/lib/dialer/`), but it lives inside the same page shell — it is not yet a standalone workspace distinct from Lead Detail.

**What's needed:** No-next-action hard warning in UI. Overdue-follow-up impossible to ignore (dashboard widget or blocking alert). Context snapshot contract formalized as a TypeScript interface with tests. Dialer as a clearly separate workspace surface (not a tab inside Lead Detail).

### Phase 2 — Dialer Workspace + Live AI Notes (2-3 weeks)
**Status: In progress.** `live-assist-panel.tsx` and `seller-memory-preview.tsx` are new untracked files. Post-call draft panel exists. Session notes API exists. But live transcription is still a stub, seller memory retrieval (last 3 calls, unresolved objections) is not fully wired, and the post-call review → publish → client-file flow needs end-to-end validation.

**What's needed:** Live AI notes working end-to-end. Seller memory panel with real data (3 recent call summaries, unresolved objections, promised follow-up). Post-call review flow where Logan confirms what publishes. Prompt caching for the dialer context stack.

### Phases 3-9 — Not started
Control plane, probate dossier, property intelligence, AI receptionist, war room automation, buyer liquidity, trust/moat lanes are all future work per the blueprint.

---

## 12. Blueprint Revision Assessment

I've compared the original blueprint (March 18, 2026) against the revised version with addenda. Here is what changed and what still needs attention:

### What the Revised Blueprint Fixed (Already Addressed)

1. **Dialer elevated to first-class domain** — The original blueprint treated the dialer as Phase 6 (voice front office). The revised version correctly moved dialer workspace improvements to Phases 1-2, recognizing this is where Logan earns money.

2. **Three-workspace boundary added** — Original had two domains (action core + intelligence). Revised correctly adds the dialer workspace as its own bounded domain with explicit write-path rules.

3. **Voice AI platform strategy added** — Section 5.1 adds Vapi/Retell evaluation, which the original lacked entirely. This is correct — building a custom voice stack from scratch is wrong for a 2-person team.

4. **2026 AI tooling landscape section added** — Section 6 covers structured outputs, tool use, prompt caching, long context, MCP, browser-use agents, and workflow orchestration updates. This was missing from the original.

5. **Sales philosophy framework added** — Section 7 integrates NEPQ + Chris Voss tactical empathy into the AI coaching and scripting strategy. This grounds all AI-assisted seller interactions in coherent methodology rather than ad-hoc prompts.

6. **Quick Wins Track added** — Section 14 provides a 1-2 week cadence of small improvements Logan feels immediately. This prevents the trap of months of architecture before calls get better.

7. **Phase acceptance criteria added** — Section 10.5 defines what "done" means for each phase with must-prove and manual-remains categories.

8. **Confidence ladder and contradiction framework added** — Section 9.2 defines weak/probable/strong/verified/rejected states with handling rules.

9. **Source policy and compliance matrix added** — Section 5.3 classifies every provider by permitted use, automation level, review requirement.

10. **Freshness/caching/cost-control policy added** — Section 5.4 defines cache TTLs by field class and stage awareness.

11. **Valuation packet contract added** — Section 9.4 defines what a credible offer workflow requires.

12. **Exception engine spec added** — Section 9.5 defines the specific exceptions Sentinel should surface.

13. **Buyer/dispo operating contract added** — Section 9.6 defines buyer profile structure and dispo metrics.

14. **Operating cadence added** — Section 12.4 defines daily/weekly/quarterly rhythms.

15. **Dialer capabilities roadmap added** — Section 15 sequences near/medium/longer-term dialer features.

### What Still Needs Revision or Attention

1. **PR sequence doesn't match actual codebase state.** The blueprint PR sequence (PR-1 through PR-11) assumes starting from scratch. In reality, much of PR-1 (workflow cleanup) and parts of PR-2/PR-3 (dialer session tables, notes, publish) already exist. The engineer needs to audit which PRs are partially complete vs. truly greenfield. **Recommendation:** Add a "current state vs. blueprint delta" column to the PR table so work isn't duplicated.

2. **Ads Command Center is absent from the blueprint.** The Ads Command Center is one of the most complete features in the codebase (17 API routes, dual-model intelligence, full recommendation workflow, execution gateway). The blueprint doesn't mention it at all — no phase, no PR, no maintenance plan. **Recommendation:** Add a section acknowledging the Ads Command Center as existing infrastructure, with a maintenance/evolution note (e.g., "Ads Command Center is complete and in production. Maintain as-is. Future work: tie ad source attribution to lead/deal outcomes for closed-loop reporting").

3. **Scoring engine not addressed in blueprint.** The scoring engine (motivation + deal + stacking + severity + AI boost) is already built and running on cron. The blueprint discusses scoring conceptually but doesn't address the existing implementation. **Recommendation:** Acknowledge in Phase 0 audit that scoring exists and should be evaluated for alignment with the intelligence layer's future confidence ladder.

4. **Gmail integration not mentioned.** OAuth-based Gmail sync exists. Not mentioned in the blueprint at all. **Recommendation:** Note it as existing infrastructure in the source review appendix.

5. **Trigger.dev vs. Inngest decision still open.** The revised blueprint mentions both but doesn't pick one. The original picked Inngest. For a TypeScript Next.js stack on Vercel, both work. Trigger.dev is open-source and self-hostable. Inngest has better Vercel integration. **Recommendation:** Pick one in Phase 3 based on whichever ships the first durable workflow faster. Don't block on this decision.

6. **n8n guidance could be stronger.** The blueprint says "keep it small" but the team doesn't have n8n yet and shouldn't adopt it unless a clear use case appears. **Recommendation:** Remove n8n from the "to evaluate" list entirely. If the need arises organically, adopt it then. Don't spend cycles evaluating something with no current use case.

7. **Missing: data migration / seed strategy.** The codebase has admin routes for clean-slate and mass-seed, but the blueprint doesn't address how to get real property data, real leads, or real call history into the system for testing. **Recommendation:** Add a note about PropertyRadar bulk import as the first real data source, with ATTOM enrichment on promotion.

8. **Feature flags not addressed.** The codebase has a FeatureFlags system (aiScoring, dialer, ghostMode, teamChat, campaigns). The blueprint doesn't mention feature flags or rollout strategy beyond "rollout flags" in the control plane section. **Recommendation:** In Phase 3 (control plane), formalize the existing feature flag system as part of the rollout infrastructure.

---

## 13. Recommended Next Steps (Priority Order)

Based on the codebase state, the blueprint, and what will actually move the business forward:

### Immediate (This Week)

1. **Commit the outstanding dialer work.** There are modified and untracked files that represent real progress (live-assist-panel, seller-memory-preview, post-call panels). Get these committed and tested.

2. **Write the Phase 0 stage machine spec.** One page. What stages exist, what transitions are legal, what fields are required at each stage, what triggers stale warnings. This already mostly exists in the code but needs to be written down explicitly.

3. **Wire the no-next-action hard warning.** This is the single highest-leverage quick win. If a lead has been contacted and has no next_follow_up_at, it should be impossible to ignore.

### Next 2 Weeks

4. **Finish dialer publish flow end-to-end.** Pre-call brief → call → notes → disposition → publish to calls_log → next action set → lead updated. Test with real Twilio calls.

5. **Wire seller memory retrieval.** When a call starts, pull last 3 call summaries, unresolved objections, promised callbacks, and decision-maker notes into the dialer context. This data already exists in calls_log — it just needs to be surfaced.

6. **Build the daily priority queue.** Top 10 leads to call today based on: overdue follow-up, hot motivation, callback scheduled, no-next-action. This replaces Logan starting his day by scanning the full lead list.

### Next 30 Days

7. **Control plane baseline.** Run IDs on all AI-assisted workflows. This doesn't need to be elaborate — a simple `agent_runs` table with workflow name, prompt version, inputs hash, outputs, review status, and timestamps.

8. **Evaluate Vapi vs. Retell for AI receptionist.** Build a proof-of-concept inbound receptionist that classifies callers and books callbacks. This directly impacts speed-to-lead.

9. **Property lookup MVP.** Wire ATTOM adapter for address-to-property-card. Even without full UI, having a "lookup this address" API that returns owner/mortgage/equity/transaction context is immediately useful for call prep.

---

## 14. Things to Preserve / Not Break

- **Dialer domain isolation.** The `src/lib/dialer/` boundary is well-designed. `crm-bridge.ts` reads, `publish-manager.ts` writes. Don't leak dialer state into CRM tables or vice versa.
- **Append-only scoring.** `scoring_records` and `distress_events` are append-only by design. Don't add UPDATE operations.
- **Optimistic locking on leads.** `lock_version` prevents concurrent mutations. Preserve this.
- **RLS on all tables.** Every table has row-level security. Don't create new tables without RLS policies.
- **AI model split.** OpenAI for dialer (latency), Claude for ads (reasoning). This is intentional.
- **The `calls_log` contract.** This is the CRM's record of call outcomes. The dialer writes here through publish-manager only. Don't create alternate write paths.
- **State machine enforcement on call_sessions.** Status transitions are enforced at the DB level. Don't bypass.

---

## 15. Known Technical Debt / Risks

1. **`supabase-types.ts` is manually maintained.** The type file mirrors the schema but could drift. Consider generating types from the Drizzle schema or Supabase CLI.

2. **`master-client-file-modal.tsx` is 360KB.** This is the Lead Detail workspace and it's very large. The blueprint calls for the dialer to be separate from this file, which is correct — it should not absorb more features.

3. **No automated E2E test coverage for the dialer flow.** Playwright tests exist but need expansion to cover the call session lifecycle.

4. **Cron jobs run on Vercel serverless.** There are timeout constraints (10s on hobby, 60s on pro). Heavy cron jobs (batch enrichment, ads cycle) may need to be moved to a durable workflow engine.

5. **No formal error monitoring.** No Sentry, no error tracking. Production errors go unnoticed unless someone checks logs.

6. **Admin emails hardcoded.** adam@, logan@, nathan@dominionhomedeals.com are hardcoded for admin auto-provisioning. If the team changes, this needs updating.

---

*This document should be treated as a living reference. Update it when major architectural decisions change or when new domains are added.*
