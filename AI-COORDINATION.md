# Sentinel AI Platform Coordination Protocol

> **This file is the single source of truth for all AI coding platforms working on Sentinel.**
> Every AI (Claude Code, Cursor, Codex) MUST read this file at the start of every session.
> Every AI MUST check the rules below before writing to any file.
> Violations create merge conflicts and duplicated work that cost real hours to fix.

---

## Your Identity

Before doing anything, identify which platform you are:

| Platform | How to Know | Your Role |
|----------|------------|-----------|
| **Claude Code** | You are running in a terminal with MCP tools (Supabase, Vercel). You have access to Bash, Edit, Write, Read, and Agent tools. | **Architect + Orchestrator** |
| **Cursor** | You are running inside an IDE with file tabs, visual editing, and inline completion. | **UI + Component + Rapid Iteration** |
| **Codex** | You are running in an isolated sandbox/worktree, typically given a scoped ticket. | **Parallel Grunt Work** |

**If you cannot determine which platform you are, ask the user before writing any code.**

---

## The Three Laws

### Law 1: Stay In Your Lane
Each platform owns specific directories and file types. You MUST NOT write to files outside your ownership unless the user explicitly overrides. See the File Ownership Registry below.

### Law 2: Interface First
When creating something another platform will consume (a new API route, a new hook, a new type), write the TypeScript interface/type FIRST, commit it, and stop. The consuming platform builds against that interface. Never build both sides of a contract in the same session across platforms.

### Law 3: Check Before You Write
Before editing ANY file, verify:
1. Is this file in my ownership zone? (See registry below)
2. Has another platform touched this file in the last 24 hours? (`git log --since="24 hours ago" -- <filepath>`)
3. Am I on the correct branch prefix for my platform? (See branching rules below)

If ANY answer is wrong, STOP and tell the user.

---

## File Ownership Registry

### Claude Code Owns (Architect)
These directories and files are Claude Code territory. Cursor and Codex must not edit them.

```
# Database — Claude Code ONLY
src/db/*                              # Drizzle schema, index, SQL files
supabase/migrations/*                 # All migration files
drizzle.config.ts                     # ORM configuration

# Business Logic Core
src/lib/scoring.ts                    # Scoring engine
src/lib/compliance.ts                 # Compliance rules
src/lib/lead-guardrails.ts            # Lead guard logic
src/lib/enrichment-engine.ts          # Enrichment pipeline
src/lib/action-derivation.ts          # Next-action derivation
src/lib/buyer-fit.ts                  # Buyer-fit scoring
src/lib/audit.ts                      # Audit logging
src/lib/rbac.ts                       # Role-based access
src/lib/api-auth.ts                   # API authentication

# Provider Adapters (design and wiring)
src/lib/twilio.ts                     # Twilio integration
src/lib/google-ads.ts                 # Google Ads integration
src/lib/gmail.ts                      # Gmail integration
src/lib/grok-client.ts                # Grok integration
src/lib/supabase.ts                   # Supabase client
src/lib/supabase-types.ts             # Supabase types

# Agent & Intelligence
src/lib/agent/*                       # Agent framework
src/lib/crawlers/*                    # Browser agents
src/mcp/*                             # MCP server
sentinel-mcp/*                        # MCP package

# Dialer Business Logic
src/lib/dialer/*                      # Dialer core logic (NOT UI)

# API Routes — Core Business Logic
src/app/api/leads/*                   # Lead API
src/app/api/deals/*                   # Deal API
src/app/api/scoring/*                 # Scoring API
src/app/api/enrichment/*              # Enrichment API
src/app/api/ingest/*                  # Data ingestion
src/app/api/imports/*                 # Import pipelines
src/app/api/cron/*                    # Scheduled jobs
src/app/api/twilio/*                  # Twilio webhooks
src/app/api/dialer/*                  # Dialer API routes
src/app/api/dossiers/*                # Dossier API
src/app/api/properties/*              # Property API
src/app/api/property-lookup/*         # Property lookup
src/app/api/inbound/*                 # Inbound handling
src/app/api/audit/*                   # Audit API
src/app/api/auth/*                    # Auth API

# Configuration
next.config.ts                        # Next.js config
vercel.json                           # Vercel config
.env.local                            # Environment (NEVER commit)
.env.example                          # Env template

# Documentation & Coordination
CLAUDE.md                             # Claude Code instructions
AI-COORDINATION.md                    # This file
docs/*                                # All documentation
```

### Cursor Owns (UI + Components)
These directories are Cursor territory. Claude Code may define interfaces/types they consume but must not edit the UI code itself.

```
# All UI Components
src/components/sentinel/*             # Every sentinel component
src/components/ui/*                   # shadcn/ui components
src/components/layout/*               # Layout components

# Page-Level UI (the page.tsx and layout.tsx files)
src/app/(sentinel)/*/page.tsx         # Page components
src/app/(sentinel)/*/layout.tsx       # Layout components
src/app/(sentinel)/layout.tsx         # Root sentinel layout
src/app/(public)/*                    # Public pages

# React Hooks
src/hooks/*                           # All custom hooks

# State Management
src/stores/*                          # Zustand/state stores

# React Providers
src/providers/*                       # Context providers

# Styling
*.css files                           # All stylesheets
tailwind.config.*                     # Tailwind config
components.json                       # shadcn/ui config
postcss.config.mjs                    # PostCSS config
```

### Codex Owns (Isolated Tasks)
Codex works on scoped, isolated deliverables. It does NOT own directories — it gets specific file assignments per ticket.

```
# Codex CAN write to:
src/lib/__tests__/*                   # Unit tests (primary Codex lane)
e2e/*                                 # E2E tests
*.test.ts, *.test.tsx, *.spec.ts      # Any test file anywhere
vitest.config.ts                      # Test configuration

# Codex CAN write to WITH explicit ticket assignment:
src/lib/providers/*                   # Provider adapter code (when assigned)
src/lib/types.ts                      # Type definitions (when assigned)
scripts/*                             # Utility scripts (when assigned)
```

### Shared / Contested Files
These files may be touched by multiple platforms. **Coordination required.**

```
# CONTESTED — requires explicit assignment per session
src/lib/types.ts                      # Shared types — assign to ONE platform per session
src/lib/utils.ts                      # Shared utilities — assign to ONE platform per session
package.json                          # Dependencies — Claude Code adds backend deps,
                                      #   Cursor adds frontend deps, coordinate if both
tsconfig.json                         # TypeScript config — Claude Code only unless discussed
```

---

## Branching Protocol

### Branch Naming
```
feat/*          → Claude Code (structural/backend features)
ui/*            → Cursor (UI/component work)
codex/*         → Codex (isolated tasks in worktrees)
fix/*           → Any platform (bug fixes — include platform name: fix/cc-stale-logic)
```

### Rules
1. **Claude Code merges to `dev` first** when working on the same phase. Structural changes come before UI.
2. **Cursor branches off `dev` AFTER Claude Code's structural PR merges.** UI depends on data contracts.
3. **Codex branches are always fully isolated.** They never depend on in-progress work from other platforms.
4. **No branch lives more than 2 days without merging to `dev`.**
5. **Test on `dev` before merging to `main`.**

### Pre-Merge Checklist (Every Platform)
Before merging ANY branch to `dev`:
- [ ] `npm run build` passes
- [ ] `npm run lint` passes (or no new violations)
- [ ] No files outside your ownership zone were modified
- [ ] If you created a new type/interface another platform needs, it's committed separately first
- [ ] Commit messages include platform tag: `[cc]`, `[cursor]`, or `[codex]`

---

## Interface Contract Protocol

When Claude Code creates something Cursor or Codex will use:

### Step 1: Claude Code defines the contract
```typescript
// src/lib/types.ts or a domain-specific types file
export interface ContextSnapshot {
  lead_id: string;
  owner_name: string | null;
  address: string;
  seller_memory: SellerMemory | null;
  distress_flags: string[];
  prior_calls: CallSummary[];
  // ... full contract
}
```

### Step 2: Claude Code commits and pushes
```bash
git add src/lib/types.ts
git commit -m "[cc] Define ContextSnapshot interface for dialer workspace"
git push
```

### Step 3: Cursor/Codex pull and build against it
```bash
git pull origin dev
# Now build UI components or tests against ContextSnapshot
```

**NEVER have two platforms define the same interface independently.** One platform defines, others consume.

---

## API Route Ownership Split

API routes are split between Claude Code (logic) and Cursor (UI-specific endpoints):

| Route Pattern | Owner | Why |
|--------------|-------|-----|
| `/api/leads/*` | Claude Code | Core lead mutations |
| `/api/deals/*` | Claude Code | Deal state management |
| `/api/dialer/*` | Claude Code | Call session management |
| `/api/scoring/*` | Claude Code | Scoring engine |
| `/api/enrichment/*` | Claude Code | Enrichment pipeline |
| `/api/ingest/*` | Claude Code | Data ingestion |
| `/api/twilio/*` | Claude Code | Twilio webhooks |
| `/api/cron/*` | Claude Code | Scheduled jobs |
| `/api/dossiers/*` | Claude Code | Dossier management |
| `/api/properties/*` | Claude Code | Property data |
| `/api/ads/*` | Claude Code | Ads integration |
| `/api/dashboard/*` | Cursor | Dashboard data for widgets |
| `/api/analytics/*` | Cursor | Analytics display data |
| `/api/settings/*` | Cursor | UI settings |
| `/api/buyers/*` | Claude Code | Buyer data management |
| `/api/dispo/*` | Claude Code | Disposition logic |

**If a new API route is needed:**
- Claude Code creates the route file with the handler logic
- Cursor creates the hook that calls it (`src/hooks/use-*.ts`)
- If both need to exist at the same time, Claude Code creates a stub route that Cursor can call

---

## Current Phase and Active Work

> **Update this section every morning and evening. This is how each platform knows what's in flight.**

### Current Phase: Phase 1–3 (Control plane + Intelligence foundation)

### Active Work
| Task | Platform | Branch | Status | Files Touched |
|------|----------|--------|--------|---------------|
| PR-5: Intelligence foundation | Claude Code | main | **Done** | src/lib/intelligence.ts, src/app/api/dossiers/**, sentinel-mcp/src/tools/query-{dossiers,artifacts,facts}.ts |
| PR-6: Research Agent | Claude Code | main | **Done** | src/agents/research/, src/app/api/agents/research/route.ts |
| Stage transition UI | Cursor | — | Ready (PR-1 merged) | src/components/sentinel/* (see contract below) |
| Review console UI | Cursor | — | Ready (PR-4 merged) | GET/PATCH /api/control-plane/review-queue |
| Feature flag admin UI | Cursor | — | Ready (PR-4 merged) | GET/PATCH /api/control-plane/feature-flags |
| Dossier viewer UI | Cursor | — | Ready (PR-5 merged) | GET /api/dossiers/[lead_id], dossier review/compile/promote endpoints |

### Interface Contracts — Ready for Cursor

**Stage Transition (PR-1):**
`PATCH /api/leads/[id]/stage` — stage transition endpoint. Payload type: `StageTransitionRequest` (in src/lib/types.ts).
`GET /api/leads/[id]/stage` — returns current status, lock_version, next_action, and allowed_transitions array.
Types exported: `StageTransitionRequest`, `StageTransitionResult`, `StageTransitionError` in `src/lib/types.ts`.

Stage change UI should:
1. Call GET /api/leads/[id]/stage to get allowed transitions + current lock_version
2. Show allowed transitions (filter by allowed_transitions array)
3. Require next_action text input when `requires_next_action: true`
4. PATCH with { to, next_action, lock_version }
5. Handle 409 lock conflict by re-fetching and retrying

**Review Queue (PR-4):**
`GET /api/control-plane/review-queue` — list pending proposals from agents
`PATCH /api/control-plane/review-queue` — approve/reject: `{ id, status: 'approved'|'rejected', review_notes? }`
`GET /api/control-plane/feature-flags` — list all flags
`PATCH /api/control-plane/feature-flags` — update: `{ flag_key, enabled?, mode?, metadata? }`
`GET /api/control-plane/agent-runs` — list recent agent runs

**Context Snapshot (PR-2):**
`ContextSnapshot` interface exported from `src/lib/types.ts` — full lead context for dialer workspace.

**Dossier Pipeline (PR-5):**
Full intelligence pipeline API:
- `GET /api/dossiers/[lead_id]` — active reviewed dossier for a lead
- `POST /api/dossiers/[lead_id]` — create proposed dossier
- `PATCH /api/dossiers/[lead_id]/review` — review (accept/flag) a dossier
- `POST /api/dossiers/[lead_id]/compile` — compile artifacts into proposed dossier
- `POST /api/dossiers/[lead_id]/promote` — promote reviewed dossier to lead record
- `GET/POST /api/dossiers/[lead_id]/artifacts` — list/create artifacts
- `GET/POST /api/dossiers/[lead_id]/facts` — list/create fact assertions
- `PATCH/DELETE /api/dossiers/[lead_id]/facts/[fact_id]` — review/delete facts
- `GET/POST /api/dossiers/[lead_id]/runs` — list/create research runs
- `GET /api/dossiers/queue` — review queue with triage scoring
Service layer: `src/lib/intelligence.ts` — `createArtifact`, `createFact` (now returns contradictions), `reviewFact`, `compileDossier`, `reviewDossier`, `syncDossierToLead`
Review executor: `src/lib/control-plane.ts` — `resolveReviewItem(itemId, decision, reviewedBy)` dispatches approved actions (sync_dossier_to_lead, accept_facts, reject_facts, review_dossier)
Session fact promotion: `src/lib/session-fact-promotion.ts` — `promoteSessionFact(input)`, `promoteAllSessionFacts(sessionId, leadId, promotedBy)` bridges dialer → intel pipeline

### Recently Completed
| PR | Platform | Commit | Date | Summary |
|----|----------|--------|------|---------|
| PR-1 | Claude Code | main | 2026-03-19 | Stage machine, guardrails, stale-leads cron |
| PR-2 | Claude Code | main | 2026-03-19 | Sentinel MCP server (13 tools, 2 resources), ContextSnapshot |
| PR-3 | Claude Code | main | 2026-03-19 | CRM bridge fixes, owner_name fallback, next_action wiring, 3-layer prompt cache architecture (Blueprint §15.1) |

**PR-3 Prompt Cache Contracts:**
- `src/lib/dialer/prompt-cache.ts` — 3-layer prompt builder: `assemblePrompt(layered, userMessage)` → `AssembledPrompt`
- Layer builders: `preCallBriefStableBase()`, `preCallBriefSemiStable()`, `preCallBriefDynamic()`, `draftNoteStableBase()`, `draftNoteSemiStable()`, `draftNoteDynamic()`
- `completeDialerAiLayered(input)` — new entry point in `openai-lane-client.ts` for cache-optimized AI calls
- Response `_layerSizes` field: `{ stable, semiStable, dynamic }` byte counts for cache hit analysis
- Pre-call brief and draft-note routes now use layered prompts. All other lanes (`summarize`, `qa_notes`, `inbound_assist`, `objection_strategy`) can be migrated incrementally.

| PR-4 | Claude Code | main | 2026-03-19 | Control plane (agent_runs, review_queue, feature_flags), Exception Agent, morning brief, MCP now 16 tools |
| PR-5 | Claude Code | main | 2026-03-19 | Intelligence pipeline (dossiers, artifacts, facts, research runs, source policies, contradiction flags), MCP now 19 tools, 7 migrations applied. PR-5b: contradiction detection on fact insert, review queue action executor (resolveReviewItem), session fact promotion bridge (dialer → intel pipeline), promote-facts API endpoint |
| PR-6 | Claude Code | main | 2026-03-19 | Research Agent (Claude Agent SDK, probate dossier, gold dataset structure), feature flag seeded, API endpoint at POST /api/agents/research |
| PR-7 | Claude Code | main | 2026-03-19 | Provider adapters (ATTOM, Bricked AI, Regrid scaffold), base adapter pattern, lookup service, canonical fact normalization |
| PR-8 | Claude Code | main | 2026-03-19 | Universal property lookup API, promote-to-lead endpoint, stage machine enforcement, property resolution |

**PR-8 Interface Contracts for Cursor:**
- `POST /api/properties/lookup` — Body: `{ address?, apn?, county?, state?, zip?, providers?: string[] }` → Returns `{ ok, existingProperty, existingLead, configuredProviders, providerResults, providerErrors }`
- `POST /api/properties/promote-to-lead` — Body: `{ propertyId?, address, city?, state?, zip?, county?, ownerName?, apn?, source?, notes?, nextAction }` → Returns `{ ok, created, leadId, lead, propertyId }`
- Property lookup UI: search bar → calls lookup → displays provider results + existing property/lead status
- Promote-to-lead button: calls promote endpoint with `nextAction` required — returns new or existing lead
- Property card component: displays canonical facts from provider results, highlights confidence levels

| PR-9 | Claude Code | main | 2026-03-19 | Vapi voice front office (voice_sessions table, AI receptionist prompt, CRM function calling, webhook handler, setup endpoint, MCP tool), feature flag seeded |

**PR-9 Interface Contracts for Cursor:**
- No direct UI required — Vapi handles the voice interface
- `GET /api/voice/vapi/setup` — returns integration status and setup checklist
- `POST /api/voice/vapi/setup` — creates/updates Vapi assistant configuration
- `POST /api/voice/vapi/webhook` — Vapi server webhook (not called by UI)
- Voice sessions visible via MCP `query_voice_sessions` tool (20 tools total)
- `voice_sessions` table stores all AI-handled call data, linked to leads

**PR-9 Manual Tasks for Adam:**
1. Sign up for Vapi at vapi.ai ($0.05/min + LLM costs)
2. Set `VAPI_API_KEY` environment variable
3. Call `POST /api/voice/vapi/setup` to create assistant (returns VAPI_ASSISTANT_ID)
4. Set `VAPI_ASSISTANT_ID` environment variable
5. In Vapi dashboard: connect Twilio number to the assistant
6. Enable `voice.ai.inbound` feature flag when ready to go live

| PR-10 | Claude Code | main | 2026-03-19 | QA Agent (deterministic post-call analysis, talk ratio, coaching flags) + Follow-Up Agent (LLM-powered draft generation, seller memory, review-gated), API endpoints, feature flags seeded |

**PR-10 Interface Contracts for Cursor:**
- `POST /api/agents/qa` — Body: `{ callLogId, leadId }` → Returns QA rating, score, flags, metrics
- `POST /api/agents/follow-up` — Body: `{ leadId, channel?, operatorNotes? }` → Returns drafts queued for review
- War room page already exists — no changes needed
- QA results visible in agent_runs (query via MCP `query_agent_runs`)
- Follow-up drafts appear in review_queue (query via MCP `query_review_queue`)
- Feature flags: `agent.qa.enabled`, `agent.follow-up.enabled` (both disabled, review_required mode)

| PR-11 | Claude Code | main | 2026-03-19 | Dispo Agent (buyer-fit scoring + LLM outreach drafts, review-gated), API endpoint, feature flag seeded. Buyer-fit scoring engine already existed — Dispo Agent wires it to outreach generation. |

**PR-11 Interface Contracts for Cursor:**
- `POST /api/agents/dispo` — Body: `{ dealId, leadId, maxBuyers?, operatorNotes? }` → Returns ranked buyers + outreach drafts queued for review
- Outreach drafts appear in review_queue (query via MCP `query_review_queue`)
- Feature flag: `agent.dispo.enabled` (disabled, review_required mode)
- Existing buyer-fit scoring at `src/lib/buyer-fit.ts` is used by the Dispo Agent
- Dispo UI: show buyer radar (ranked list with scores + flags), allow operator to select buyer, approve/edit outreach draft

| PR-12 | Claude Code | main | 2026-03-19 | Ads Monitor Agent (deterministic threshold checks, campaign waste detection, CPL/CTR/CPC alerts), gold datasets for all 6 agents, 3-layer prompt cache completion |

**PR-12 Interface Contracts for Cursor:**
- No direct UI required — Ads Monitor is informational, delivers via morning brief + n8n
- `POST /api/agents/ads-monitor` — Body: `{ triggerType?, campaignIds? }` → Returns `AdsMonitorReport` with alerts, summary, metrics
- Feature flag: `agent.ads_monitor.enabled` (disabled by default)
- Alerts appear in agent_runs outputs (query via MCP)
- Existing Ads Command Center UI at `/ads` is the operator-facing surface — no changes needed

| PR-13 | Claude Code | main | 2026-03-19 | n8n integration layer — fire-and-forget webhook dispatcher, 5 typed contracts, all cron/webhook endpoints wired |
| PR-14 | Claude Code | main | 2026-03-19 | Agent fleet E2E wiring: Follow-Up Agent auto-triggers from exception scan (top 5 stale leads per nightly scan), Dispo Agent auto-triggers on stage→disposition transition, review queue PATCH now executes approved actions via resolveReviewItem |
| PR-15 | Claude Code | main | 2026-03-19 | MCP write tools + agent hardening: 2 new MCP tools (resolve_review_item, promote_session_facts), dedup guard on all 6 agents, feature flag key fix (follow-up), build verified clean |
| PR-16 | Claude Code | main | 2026-03-19 | Promote-to-lead auto-triggers Research Agent (fire-and-forget) when nextAction is "research" or "call". Lookup route confirmed read-only (correct architecture). |
| PR-17 | Claude Code | main | 2026-03-20 | CRM projection fields (Blueprint 9.1): 13 new columns on leads, syncDossierToLead writes all fields, confidence scoring, prompt_registry table + 9 seeds, address suggest endpoint, morning brief dashboard API, source attribution reporting |
| PR-18 | Claude Code | main | 2026-03-20 | Dialer context enrichment + control plane expansion: dossier projection in CRM bridge, prompt registry CRUD, voice sessions query, post-call auto-QA trigger, lead score computation endpoint |
| PR-19 | Claude Code | main | 2026-03-20 | Score-ranked operations: nightly score refresh cron, score-ranked lead queue API, batch research trigger, vercel.json cron scheduling |
| PR-20 | Claude Code | main | 2026-03-20 | Intelligence E2E: pre-call brief enriched with dossier data, Research Agent auto-review/promote in auto mode, comps status tracking, LeadContext expanded with 7 dossier fields |
| PR-21 | Claude Code | main | 2026-03-20 | Rip out n8n — replace with direct Slack webhook + Twilio SMS delivery. Deleted n8n-dispatcher.ts and n8n-contracts/. New src/lib/notify.ts handles all 5 notification channels directly. |
| PR-22 | Claude Code | main | 2026-03-20 | Wire weekly-health + db-integrity crons to Slack. Added notifyWeeklyHealth() + notifyIntegrityAudit() to notify.ts. DB audit only fires Slack when issues found. |
| PR-23 | Claude Code | main | 2026-03-20 | Firecrawl county extraction pipeline. New adapter (src/providers/firecrawl/adapter.ts) with Spokane + Kootenai county portals. POST /api/properties/county-extract wires through canonical write path (artifact → facts). |
| PR-24 | Claude Code | main | 2026-03-20 | Skiptrace-on-promotion. promote-to-lead now auto-triggers dualSkipTrace (fire-and-forget). Results stored as intel artifacts + fact assertions — never written directly to leads. |
| PR-25 | Claude Code | main | 2026-03-20 | Follow-Up Agent delivery wiring. Added follow_up_sms, follow_up_email, follow_up_call execution handlers to control plane. SMS sends via Twilio on approval. Email/call create tasks for operator. |
| PR-26 | Claude Code | main | 2026-03-20 | Speed-to-lead SMS notification. New notifyNewInboundLead() fires instant SMS when inbound creates a lead. Wired into inbound-intake-server for all channels (webform, email, vendor). |
| PR-27 | Claude Code | main | 2026-03-20 | Dispo Agent buyer outreach execution. Added buyer_outreach_sms, buyer_outreach_email, buyer_outreach_phone handlers to control plane. Tracks deal_buyers status on outreach. Auto-trigger already wired on stage=disposition entry. |
| PR-28 | Claude Code | main | 2026-03-20 | PropertyRadar adapter (canonical write path). New adapter at src/providers/propertyradar/adapter.ts — lookupProperty + lookupByRadarId. Normalizes 30+ PR fields into canonical facts with confidence levels. Distress signals extracted as individual facts. |
| PR-29 | Claude Code | main | 2026-03-20 | Stale dispo cron + speed-to-lead. New /api/cron/stale-dispo runs daily — finds deals in dispo >48h with no buyer outreach and re-triggers Dispo Agent. Added to vercel.json. |
| PR-30 | Claude Code | main | 2026-03-20 | Provider lookup integration — added PropertyRadar + Firecrawl adapters to lookup-service.ts. All 5 providers (ATTOM, Bricked, Regrid, PropertyRadar, Firecrawl) now available through unified multi-provider lookup. |
| PR-31 | Claude Code | main | 2026-03-20 | Stale follow-up cron. New /api/cron/stale-follow-ups runs Mon-Sat 10am PT — finds active leads with no contact in >5 days (WA) or >7 days (other). Auto-triggers Follow-Up Agent. WA leads default to call channel per blueprint rules. |

**PR-13 Details:** *(superseded by PR-21 — n8n removed, replaced with direct Slack + Twilio SMS)*
- `src/lib/notify.ts` — Direct notification dispatcher (Slack webhook + Twilio SMS)
- All 5 notification channels wired directly:
  1. Missed call alert → SMS via `notifyMissedCall()`
  2. Morning digest → Slack via `notifyMorningDigest()`
  3. Post-call summary → Slack via `notifyPostCallSummary()`
  4. Stale follow-up nudge → SMS via `notifyStaleFollowUp()`
  5. Ads anomaly alert → Slack via `notifyAdsAnomaly()`
- Env vars required: `SLACK_WEBHOOK_URL`, `NOTIFY_SMS_NUMBERS` (comma-separated phone numbers)
- Uses existing Twilio credentials (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`)
- No n8n dependency — Sentinel delivers directly

**Agent Fleet Status (all 6 agents):**

| Agent | System Prompt | Runner | Tools | Review Gate | Gold Dataset | Status |
|-------|:---:|:---:|:---:|:---:|:---:|---|
| Research | done | done | done | done | done | Production-ready |
| QA | done | done | done | done | done | Production-ready |
| Follow-Up | done | done | done | done | done | Production-ready |
| Dispo | done | done | done | done | done | Production-ready |
| Exception | done | done | done | done | done | Production-ready |
| Ads Monitor | done | done | done | done | done | Production-ready |

**PR-15 Details:**
- **MCP Write Tools (22 total now):**
  - `resolve_review_item` — approve/reject review queue proposals, auto-executes approved actions (sync dossier, accept/reject facts, review dossier)
  - `promote_session_facts` — promote confirmed dialer session facts into intel pipeline (creates artifacts + fact assertions)
- **Agent Dedup Guard:** `createAgentRun()` returns `null` if the same agent is already running for the same lead (5-min window). All 6 agents now handle null gracefully.
- **Feature Flag Fix:** `agent.follow_up.enabled` → `agent.follow-up.enabled` (matches code lookup). Stale DB row cleaned.
- **Service layer changes:**
  - `src/lib/control-plane.ts` — `createAgentRun` return type changed to `Promise<string | null>`, added `resolveReviewItem()` + `executeApprovedAction()` dispatcher
  - `src/lib/intelligence.ts` — `createFact` now returns `CreateFactResult` with contradiction detection
  - `src/lib/session-fact-promotion.ts` — bridge from dialer domain to intel pipeline

**PR-17 Details:**
- **CRM Projection Fields (Blueprint 9.1):** 13 new columns on `leads` table:
  - `seller_situation_summary_short`, `recommended_call_angle`, `likely_decision_maker`, `decision_maker_confidence`
  - `top_fact_1`, `top_fact_2`, `top_fact_3`, `recommended_next_action`
  - `property_snapshot_status`, `comps_status`
  - `opportunity_score`, `contactability_score`, `confidence_score`
- **`syncDossierToLead()`** now writes all projection fields when a reviewed dossier is promoted. Includes `computeConfidenceScore()` (fact coverage + source diversity) and `getDMConfidence()` (decision maker confidence ladder).
- **`prompt_registry` table** created + seeded with 9 versions (2 dialer + 6 agents + 1 extraction workflow).
- **New API routes:**
  - `GET /api/properties/suggest?q=` — address typeahead, searches local DB, returns lead linkage
  - `GET /api/dashboard/morning-brief` — on-demand morning brief for operator dashboard (exceptions + callbacks + top 10 leads + pipeline + reviews)
  - `GET /api/dashboard/source-attribution` — source-level conversion funnel for prospect engine bake-off (leads → calls → qualified → contracts by source)
- **Cursor contract:** All 3 new endpoints are ready for UI consumption. Morning brief returns `topLeads` with projection fields. Source attribution returns per-source funnel with `conversionRate` and `contactRate`.

**PR-18 Details:**
- **Dialer context enrichment (Blueprint 9.1 last mile):** `CRMLeadContext` now includes 9 dossier projection fields (`sellerSituationSummary`, `recommendedCallAngle`, `likelyDecisionMaker`, `decisionMakerConfidence`, `topFact1/2/3`, `opportunityScore`, `confidenceScore`). CRM bridge fetches them from leads table. Logan's pre-call screen now shows intelligence pipeline data.
- **Prompt registry API (Blueprint 15.1):**
  - `GET /api/control-plane/prompt-registry` — list prompts, filter by `?workflow=` and `?status=`
  - `POST /api/control-plane/prompt-registry` — register new version (auto-deprecates prior active version for same workflow)
  - `PATCH /api/control-plane/prompt-registry` — update status/description (same auto-deprecation on promote-to-active)
- **Voice sessions query:**
  - `GET /api/control-plane/voice-sessions` — list AI-handled voice sessions, filter by `?status=`, `?direction=`, `?lead_id=`, `?caller_type=`
- **Post-call auto-QA (Blueprint 6.3):** `publishSession()` now auto-triggers QA Agent (fire-and-forget) after every successful call publish. QA runs deterministic analysis (talk ratio, coaching flags, score) without blocking the publish response.
- **Lead score computation (Blueprint 9.2):**
  - `POST /api/leads/compute-scores` — recomputes opportunity_score (distress + equity + motivation + priority), contactability_score (phone + consent + answer rate + recency), confidence_score (fact coverage). Accepts batch of up to 50 lead IDs. Writes scores to leads table.

**PR-18 Cursor Contracts:**
- `CRMLeadContext` type updated — if Cursor uses this type for dialer UI, the new fields are available immediately
- Prompt registry UI: CRUD against `/api/control-plane/prompt-registry` — show workflow, version, status, description
- Voice sessions: read-only list at `/api/control-plane/voice-sessions` — show caller type, intent, status, duration, summary

**PR-19 Details:**
- **Nightly score refresh:** `GET /api/cron/refresh-scores` — recomputes opportunity/contactability/confidence scores for up to 500 active leads in batches of 50. Runs at 6:45am PT (before morning brief at 7am). Secured by CRON_SECRET.
- **Score-ranked lead queue:** `GET /api/leads/score-queue` — returns active leads sorted by weighted composite (50% opportunity + 30% contactability + 20% confidence). Supports `?limit=`, `?status=`, `?min_opportunity=`, `?assigned_to=` filters. Includes all dossier projection fields + property details.
- **Batch research trigger:** `POST /api/agents/research/batch` — kicks off Research Agent for up to 20 leads in parallel (fire-and-forget, dedup guard). Body: `{ leadIds, focusAreas? }`.
- **Cron scheduling:** Added `refresh-scores` to vercel.json crons (6:45am PT daily).

**PR-19 Cursor Contracts:**
- `GET /api/leads/score-queue` — operator-facing "Top Leads" panel. Each lead includes `rank`, `weightedScore`, all projection fields, and property data. Ideal for the morning brief dashboard surface.

**PR-20 Details:**
- **Pre-call brief enriched (Blueprint 3.1 + 9.1):** `buildCallCoPilotPrompt()` now includes an "Intelligence Brief" section with seller situation summary, recommended call angle, decision maker, top facts, and scores from the dossier pipeline. Pre-call brief route wires all 7 dossier projection fields into the prompt.
- **Research Agent auto-review:** When `agent.research.enabled` mode is `auto` AND no contradictions were detected, the Research Agent now auto-reviews and promotes the dossier (calls `reviewDossier()` + `syncDossierToLead()`). Falls back to `queued_for_review` if auto-promote fails.
- **Comps status tracking:** `PATCH /api/leads/update-comps-status` — updates `comps_status` field (pending/stale/current) after comps are pulled. Called by UI or cron.
- **Type changes:** `LeadContext` expanded with `sellerSituationSummary`, `recommendedCallAngle`, `likelyDecisionMaker`, `decisionMakerConfidence`, `topFacts`, `opportunityScore`, `confidenceScore`. `ResearchAgentResult.status` now includes `"auto_promoted"`.

**PR-22 Details:**
- `notifyWeeklyHealth()` — Slack formatted summary: pipeline velocity, intel stats, voice sessions, agent health, quick wins
- `notifyIntegrityAudit()` — Slack alert with critical/high findings + auto-repair summary. Only fires when issues found (silent on clean runs).
- All 7 notification channels now covered: missed call, morning digest, post-call summary, stale follow-up, ads anomaly, weekly health, integrity audit.

**PR-23 Details:**
- `src/providers/firecrawl/adapter.ts` — Extends BaseProviderAdapter. Uses Firecrawl `/scrape` with LLM extraction schema (22 property fields).
- County portals configured: Spokane County WA assessor, Kootenai County ID assessor. URL pattern functions for APN and address lookups.
- `POST /api/properties/county-extract` — Accepts `{ leadId, address?, apn?, county?, state? }` or `{ leadId, url }` for direct URL scrape.
- Write path: Firecrawl response → `dossier_artifacts` (sourceType: firecrawl_county_extract) → `fact_assertions` (canonical field names, medium confidence for known portals, low for arbitrary URLs).
- Contradiction detection runs automatically — if Firecrawl extracts an owner name that conflicts with an existing accepted fact, it flags the contradiction.
- Env: `FIRECRAWL_API_KEY` required.

**PR-24 Details:**
- `promote-to-lead` route now fires `triggerSkiptrace()` (fire-and-forget) after lead creation.
- Skiptrace results stored as intel artifacts (`sourceType: skiptrace_promotion`) — NOT written directly to leads table.
- Facts created: `primary_phone` (promoted_field: phone), `primary_email` (promoted_field: email), `litigator_flag`, individual `phone_number` entries (top 3).
- Confidence scoring: phones with >80% confidence get "high", >50% get "medium", rest get "low".
- Write path preserved: facts go to review queue before CRM sync. Operator approves before phone appears on lead record.

**PR-25 Details:**
- `executeApprovedAction()` in control-plane now handles 3 new actions: `follow_up_sms`, `follow_up_email`, `follow_up_call`.
- `follow_up_sms`: Sends via Twilio directly to lead's phone. Message from approved proposal.
- `follow_up_email`: Creates a task with email draft (to, subject, body). Operator sends from Gmail manually until Gmail OAuth is reliably connected.
- `follow_up_call`: Creates a priority task with AI-drafted call script. Logan makes the actual call.
- All follow-up executions log to `event_log` (action: `follow_up.{channel}_sent`).
- Follow-Up Agent now includes phone/email/leadName in proposal payload so execution handler can send directly.

**PR-25 Cursor Contracts:**
- Review queue items with `action` starting with `follow_up_` now auto-execute on approval. The review queue UI should show the draft body and channel clearly so Logan can review before approving.

### Blocked
*Nothing currently blocked.*

---

## Platform-Specific Instructions

### If You Are Claude Code

**Before every session:**
1. Read this file (AI-COORDINATION.md)
2. Read CLAUDE.md for project-specific instructions
3. Check the Active Work table above — is anyone else touching files you plan to modify?
4. Pull latest `dev` branch

**Your primary responsibilities:**
- Database schema changes and migrations (you are the ONLY platform that touches the database)
- Business logic in `src/lib/` (scoring, compliance, enrichment, lead guards, agent framework)
- API routes for core domains (leads, deals, dialer, scoring, enrichment, ingest, twilio, cron)
- Provider adapter design and wiring
- MCP server implementation
- Agent fleet architecture
- Integration wiring (n8n webhooks, Twilio, provider adapters)
- TypeScript interfaces/types that other platforms consume

**You must NOT:**
- Edit component files in `src/components/`
- Edit page UI in `src/app/(sentinel)/*/page.tsx` (unless purely adding an import for a new API)
- Edit React hooks in `src/hooks/`
- Edit stores in `src/stores/`
- Edit providers in `src/providers/`
- Make styling or layout decisions

**When you create something Cursor needs:**
1. Define the TypeScript interface
2. Create the API route with working logic
3. Commit both with a clear message: `[cc] Add /api/leads/next-actions route + NextAction type`
4. Update the Active Work table in this file
5. Tell the user: "Cursor can now build the UI for this"

---

### If You Are Cursor

**Before every session:**
1. Read this file (AI-COORDINATION.md)
2. Check the Active Work table — are you waiting on any Claude Code deliverables?
3. Pull latest `dev` branch
4. Check for new types/interfaces Claude Code may have added

**Your primary responsibilities:**
- All UI components in `src/components/sentinel/`
- Page layouts in `src/app/(sentinel)/*/page.tsx`
- React hooks in `src/hooks/`
- State management in `src/stores/`
- Styling, responsive design, shadcn/ui customization
- Visual bug fixes and UX improvements
- v0-generated component integration and refinement

**You must NOT:**
- Edit database schema (`src/db/*`) or create migrations (`supabase/migrations/*`)
- Edit core business logic in `src/lib/` (scoring, compliance, enrichment, lead guards, etc.)
- Edit API routes for core domains (leads, deals, dialer, scoring, etc.)
- Edit MCP server code
- Edit agent framework code
- Change `next.config.ts`, `vercel.json`, `drizzle.config.ts`, or environment files
- Create new database tables or columns

**When you need a new API endpoint or data contract:**
1. Tell the user: "I need a [describe endpoint] to build this UI"
2. Wait for Claude Code to create the endpoint and type
3. Build your hook and component against that contract

**When you need a new database field:**
1. Tell the user: "This component needs a [field_name] field on the [table_name] table"
2. Wait for Claude Code to add the migration and update the schema
3. Build your component against the updated type

---

### If You Are Codex

**Before every session:**
1. Read this file (AI-COORDINATION.md)
2. Read your ticket/prompt carefully — you should have a specific, scoped task
3. You are working in an isolated worktree. Your changes will be reviewed via PR.

**Your primary responsibilities:**
- Unit tests for existing code (`src/lib/__tests__/`)
- E2E tests (`e2e/`)
- Provider adapter implementation (when explicitly assigned a specific adapter)
- Type fixes and refactoring (when explicitly assigned specific files)
- Migration scripts (when explicitly assigned)
- Code cleanup tasks (when explicitly assigned)

**You must NOT:**
- Make architectural decisions (suggest them in PR comments if you see issues)
- Create new API routes
- Modify database schema or create migrations (unless your ticket explicitly says to)
- Edit UI components (unless your ticket explicitly says to)
- Change shared types without explicit assignment
- Add new dependencies to package.json without explicit assignment
- Touch any file not listed in your ticket

**Your output should always be:**
1. A clean, reviewable PR on a `codex/*` branch
2. All tests passing
3. No files modified outside your ticket scope
4. Clear commit messages with `[codex]` prefix

**If your ticket is ambiguous:**
- State what you think the ticket means in a PR comment
- Implement the most conservative interpretation
- Flag any decisions you made for the reviewer

---

## Conflict Resolution

### If Two Platforms Need the Same File
1. STOP. Do not edit the file.
2. The platform that owns the file (per the registry above) edits it.
3. If ownership is unclear, Claude Code gets priority (it handles structural changes).
4. If it's a UI file, Cursor gets priority.

### If You Find a Bug in Another Platform's Code
1. Do NOT fix it yourself (unless it's a one-line typo).
2. Note it in the Active Work table or tell the user.
3. The owning platform fixes it in their next session.

### If You Need to Add a Dependency
- **Backend dependency** (API, database, server-side): Claude Code adds it.
- **Frontend dependency** (UI library, component, styling): Cursor adds it.
- **Test dependency** (testing framework, mock library): Codex adds it.
- **Shared dependency** (utility used by both): Claude Code adds it, then Cursor/Codex pull.

---

## Commit Message Format

All commits must include the platform tag:

```
[cc] Add stage transition validation to lead-guardrails.ts
[cursor] Build overdue follow-up dashboard widget
[codex] Add unit tests for ATTOM adapter normalization
[cc] Define ContextSnapshot interface for dialer workspace
[cursor] Wire usePreCallBrief hook to new /api/dialer/context endpoint
[codex] Add E2E test for lead promotion flow
```

This makes `git log` instantly readable for which platform did what.

---

## Daily Sync Checklist

### Morning (Human — 15 minutes)
- [ ] Pull `dev`, check what merged overnight
- [ ] Review any open Codex PRs
- [ ] Update Active Work table in this file
- [ ] Assign today's Codex tickets (2-4 scoped tasks)
- [ ] Decide: what does Claude Code own today? What does Cursor own?
- [ ] Check for merge conflicts on `dev`

### Evening (Human — 10 minutes)
- [ ] Merge completed branches to `dev`
- [ ] Run `npm run build && npm run lint` on `dev`
- [ ] Update Active Work table: mark completed, note blockers
- [ ] Queue tomorrow's Codex tickets
- [ ] Push updated AI-COORDINATION.md to `dev`

---

## Quick Reference: "Can I Touch This File?"

```
Am I Claude Code?
  └─ Is the file in src/db/, supabase/migrations/, src/lib/ (core), src/app/api/ (core),
     sentinel-mcp/, or configuration files?
     ├─ YES → Proceed
     └─ NO → STOP. Tell the user.

Am I Cursor?
  └─ Is the file in src/components/, src/hooks/, src/stores/, src/providers/,
     src/app/(sentinel)/*/page.tsx, or styling files?
     ├─ YES → Proceed
     └─ NO → STOP. Tell the user.

Am I Codex?
  └─ Is the file explicitly listed in my ticket?
     ├─ YES → Is it a test file or explicitly assigned source file?
     │   ├─ YES → Proceed
     │   └─ NO → STOP. Ask in PR comment.
     └─ NO → STOP. Do not touch it.
```

---

## Reference: Blueprint Phase → Platform Mapping

| Phase | PR | Claude Code | Cursor | Codex |
|-------|-----|-------------|--------|-------|
| 0 | PR-0 | n8n setup, AI receptionist config, Claude Code tasks | — | — |
| 1 | PR-1 | Stage machine, next-action logic, stale detection, DB migrations | Hard UI warnings, overdue widget | Stage enum tests, validation tests |
| 1 | PR-2 | MCP server, context snapshot contract, publish idempotency | Dialer workspace UI shell | MCP tool unit tests, snapshot tests |
| 2 | PR-3 | AI pipeline wiring, prompt caching, memory retrieval | Live notes panel, seller memory panel, post-call review UI | Prompt template tests, memory tests |
| 3 | PR-4 | Run registry, agent registry, review queue, Exception Agent, feature flags | Review console UI, feature flag admin UI | Agent run logging tests, flag tests |
| 4 | PR-5 | Artifact-fact-dossier pipeline, sync snapshot logic | Dossier viewer UI | Pipeline unit tests, normalization tests |
| 4 | PR-6 | Claude Agent SDK + Playwright MCP agent | Research results viewer UI | Gold-set evaluation harness |
| 5 | PR-7 | ATTOM/PropertyRadar adapters, Bricked AI API client | — | Adapter unit tests, mapping tests |
| 5 | PR-8 | Promotion flow logic, universal lookup API | Property lookup UI, property card | Lookup API tests |
| 6 | PR-9 | Vapi voice agent, warm transfer, MCP integration | — | Voice integration tests |
| 7 | PR-10 | QA + Follow-Up Agent deployments, task generation | War room UI refinement | Summary eval tests |
| 8 | PR-11 | Buyer-fit logic, InvestorLift API, stale-dispo | Dispo UI, buyer memory UI | Buyer-fit scoring tests |

---

## Document Version

**Last updated:** 2026-03-19
**Updated by:** Claude Code
**Blueprint version:** v4 (March 18, 2026)

> When in doubt: ask the user. When tempted to touch a file outside your lane: ask the user.
> The 10 seconds it takes to ask saves the 2 hours it takes to resolve a merge conflict.
