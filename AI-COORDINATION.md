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
src/lib/grok-client.ts               # Grok integration
src/lib/supabase.ts                   # Supabase client
src/lib/supabase-types.ts            # Supabase types

# Agent & Intelligence
src/lib/agent/*                       # Agent framework
src/lib/crawlers/*                    # Browser agents
src/mcp/*                             # MCP server
sentinel-mcp/*                        # MCP package

# API Routes — Core Business Logic
src/app/api/leads/*                   # Lead API
src/app/api/deals/*                   # Deal API
src/app/api/scoring/*                 # Scoring API
src/app/api/enrichment/*              # Enrichment API
src/app/api/ingest/*                  # Data ingestion
src/app/api/imports/*                 # Import pipelines
src/app/api/cron/*                    # Scheduled jobs
src/app/api/twilio/*                  # Twilio webhooks
src/app/api/dossiers/*                # Dossier API
src/app/api/properties/*              # Property API
src/app/api/property-lookup/*         # Property lookup
src/app/api/inbound/*                 # Inbound handling
src/app/api/audit/*                   # Audit API
src/app/api/auth/*                    # Auth API

# Inngest (background jobs)
src/inngest/*                         # Inngest functions + client
src/app/api/inngest/*                 # Inngest serve route

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

# React Providers (including Twilio, voice, theme)
src/providers/*                       # Context providers

# Styling
*.css files                           # All stylesheets
tailwind.config.*                     # Tailwind config
components.json                       # shadcn/ui config
postcss.config.mjs                    # PostCSS config
```

### Shared / Contested Files
These files are touched by both platforms routinely. **Coordination required — last writer wins, merge carefully.**

```
# SHARED — both platforms touch these regularly
src/lib/dialer/types.ts               # Dialer types (CC adds dispositions, Cursor adds UI types)
src/lib/dialer/publish-manager.ts     # CC owns logic, Cursor may fix bugs blocking UI
src/lib/dialer/schema-types.ts        # Shared dialer schemas
src/app/api/dialer/*                  # CC owns routes, Cursor fixes when blocking dialer UI
src/app/api/prospects/route.ts        # CC owns, Cursor patches for UI-blocking bugs
src/lib/skip-trace.ts                 # CC owns, Cursor may touch for UI integration
src/lib/types.ts                      # Shared types — assign to ONE platform per session
src/lib/utils.ts                      # Shared utilities — assign to ONE platform per session
package.json                          # CC adds backend deps, Cursor adds frontend deps
tsconfig.json                         # Claude Code only unless discussed
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
scripts/*                             # Utility scripts (when assigned)
```

---

## Branching Protocol

### Current Reality
All work currently ships directly to `main`. Both Claude Code and Cursor commit and push to `main`, then deploy to Vercel production.

### Branch Naming (when feature branches are used)
```
feat/*          → Claude Code (structural/backend features)
ui/*            → Cursor (UI/component work)
codex/*         → Codex (isolated tasks in worktrees)
fix/*           → Any platform (bug fixes — include platform name: fix/cc-stale-logic)
```

### Pre-Push Checklist (Every Platform)
Before pushing to `main`:
- [ ] `npm run build` passes locally
- [ ] No files outside your ownership zone were modified (unless user overrode)
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
  // ... full contract
}
```

### Step 2: Claude Code commits and pushes
```bash
git commit -m "[cc] Define ContextSnapshot interface for dialer workspace"
git push
```

### Step 3: Cursor pulls and builds against it
```bash
git pull origin main
# Now build UI components against ContextSnapshot
```

**NEVER have two platforms define the same interface independently.** One platform defines, others consume.

---

## API Route Ownership Split

| Route Pattern | Owner | Why |
|--------------|-------|-----|
| `/api/leads/*` | Claude Code | Core lead mutations |
| `/api/deals/*` | Claude Code | Deal state management |
| `/api/dialer/*` | **Shared** | CC owns logic; Cursor fixes UI-blocking bugs |
| `/api/scoring/*` | Claude Code | Scoring engine |
| `/api/enrichment/*` | Claude Code | Enrichment pipeline |
| `/api/ingest/*` | Claude Code | Data ingestion |
| `/api/twilio/*` | Claude Code | Twilio webhooks |
| `/api/cron/*` | Claude Code | Scheduled jobs |
| `/api/dossiers/*` | Claude Code | Dossier management |
| `/api/properties/*` | Claude Code | Property data |
| `/api/voice/*` | **Shared** | CC owns Vapi logic; Cursor owns browser voice |
| `/api/ads/*` | Claude Code | Ads integration |
| `/api/dashboard/*` | Cursor | Dashboard data for widgets |
| `/api/analytics/*` | Cursor | Analytics display data |
| `/api/settings/*` | Cursor | UI settings |
| `/api/buyers/*` | Claude Code | Buyer data management |
| `/api/dispo/*` | Claude Code | Disposition logic |
| `/api/street-view` | Cursor | Image proxy for property carousel |
| `/api/property-photos` | Cursor | Photo aggregation for property carousel |
| `/api/inngest/*` | Claude Code | Background job serve route |
| `/api/prospects/*` | **Shared** | CC owns lead creation; Cursor patches UI-blocking bugs |

**If a new API route is needed:**
- Claude Code creates the route file with the handler logic
- Cursor creates the hook that calls it (`src/hooks/use-*.ts`)
- If both need to exist at the same time, Claude Code creates a stub route that Cursor can call

---

## Current Phase and Active Work

> **Update this section every morning and evening. This is how each platform knows what's in flight.**

### Current Phase: Production hardening + daily-use UX

The foundation (31 PRs: database, business logic, agent fleet, intelligence pipeline, MCP server, provider adapters, voice front office, notification delivery) was shipped March 19–20 by Claude Code.

Since March 21, work has focused on **making the dialer and CRM usable for daily calling** — fixing bugs, building missing UI, and wiring features end-to-end.

### Active Work (March 25, 2026)
| Task | Platform | Status | Key Files |
|------|----------|--------|-----------|
| Property carousel — Street View + photo merge | Cursor | **Done** | master-client-file-modal.tsx, /api/property-photos, /api/street-view |
| Auto-cycle dialer (call next lead automatically) | Claude Code | **In progress** | src/lib/dialer/auto-cycle.ts, /api/dialer/v1/auto-cycle/* |
| Outbound batch calling (Vapi) | Claude Code | **In progress** | /api/voice/vapi/outbound/*, src/inngest/functions/outbound-batch.ts |
| Live coaching — NEPQ + Voss labels | Claude Code | **Done** | Live assist panel styling |
| GOOGLE_STREET_VIEW_KEY setup | Adam (manual) | **Pending** | Vercel env var — needed for property photos |

### Recently Shipped (March 23–25)
| What | Platform | Commit(s) |
|------|----------|-----------|
| Task system UX overhaul — identity, context, accountability, inline call | Cursor | 12abaa0, 8cd77f8, 30f4957 |
| Dead phone UX + Dead Phone/Dead Lead dispositions + consent removal | Cursor | 53906e4, 86bc2de |
| Implementation gap closure (dossier placeholder, missed queue retry, phone cycling) | Cursor | 86bc2de |
| SMS Messages Inbox — table, webhook, send/threads, dialer panel | Cursor | 3c4259f |
| Legal tab — county recorder + court crawlers | Cursor | 728b1b5, e766657 |
| Property Intel persistence — Bricked cache, deal config | Cursor | 6fe011b |
| Deep crawl pipeline — Firecrawl Agent + Perplexity | Cursor | 7986b04 |
| Phone cycling, dead phone marking, stage controls, default filter | Cursor | 5415f63 |
| Warm transfer + Jeff's transfer brief | Claude Code | 93d150d, 9772017 |
| System hardening — silent failures, webhook auth, image config | Claude Code | 95918fe |
| Live coaching — faster polling, shorter cooldowns, token cap | Claude Code | b951f4d, ce2f319 |
| Outbound call drop fix — Twilio sig validation hostname | Cursor | b86524e |

### Blocked
*Nothing currently blocked (pending GOOGLE_STREET_VIEW_KEY for full property photos).*

---

## Foundation PRs (March 19–20, All Shipped)

These 31 PRs built the entire backend. Contracts are all consumed. Kept here as reference only — do not update.

<details>
<summary>Click to expand PR history (PR-1 through PR-31)</summary>

| PR | Date | Summary |
|----|------|---------|
| PR-1 | 3/19 | Stage machine, guardrails, stale-leads cron |
| PR-2 | 3/19 | MCP server (13 tools, 2 resources), ContextSnapshot |
| PR-3 | 3/19 | CRM bridge fixes, 3-layer prompt cache architecture |
| PR-4 | 3/19 | Control plane (agent_runs, review_queue, feature_flags), Exception Agent |
| PR-5 | 3/19 | Intelligence pipeline (dossiers, artifacts, facts, research runs) |
| PR-6 | 3/19 | Research Agent (Claude Agent SDK, probate dossier, gold dataset) |
| PR-7 | 3/19 | Provider adapters (ATTOM, Bricked AI, Regrid scaffold) |
| PR-8 | 3/19 | Universal property lookup API, promote-to-lead endpoint |
| PR-9 | 3/19 | Vapi voice front office (AI receptionist, CRM function calling) |
| PR-10 | 3/19 | QA Agent + Follow-Up Agent (post-call analysis, draft generation) |
| PR-11 | 3/19 | Dispo Agent (buyer-fit scoring + LLM outreach drafts) |
| PR-12 | 3/19 | Ads Monitor Agent, gold datasets for all 6 agents, prompt cache completion |
| PR-13 | 3/19 | n8n integration layer (superseded by PR-21) |
| PR-14 | 3/19 | Agent fleet E2E wiring (Follow-Up auto-trigger, Dispo auto-trigger) |
| PR-15 | 3/19 | MCP write tools (22 total), agent dedup guard |
| PR-16 | 3/19 | Promote-to-lead auto-triggers Research Agent |
| PR-17 | 3/20 | CRM projection fields (13 columns), prompt_registry table, morning brief API |
| PR-18 | 3/20 | Dialer context enrichment, prompt registry CRUD, post-call auto-QA |
| PR-19 | 3/20 | Score-ranked lead queue, nightly score refresh cron |
| PR-20 | 3/20 | Pre-call brief enriched with dossier data, Research Agent auto-review |
| PR-21 | 3/20 | Rip out n8n — replace with direct Slack webhook + Twilio SMS |
| PR-22 | 3/20 | Wire weekly-health + db-integrity crons to Slack |
| PR-23 | 3/20 | Firecrawl county extraction pipeline |
| PR-24 | 3/20 | Skiptrace-on-promotion (dual skip trace, fire-and-forget) |
| PR-25 | 3/20 | Follow-Up Agent delivery wiring (SMS, email, call execution) |
| PR-26 | 3/20 | Speed-to-lead SMS notification on inbound lead |
| PR-27 | 3/20 | Dispo Agent buyer outreach execution |
| PR-28 | 3/20 | PropertyRadar adapter (canonical write path) |
| PR-29 | 3/20 | Stale dispo cron + speed-to-lead |
| PR-30 | 3/20 | All 5 providers in unified multi-provider lookup |
| PR-31 | 3/20 | Stale follow-up cron (Mon-Sat 10am PT) |

**Agent Fleet Status (all 6 agents): Production-ready** — Research, QA, Follow-Up, Dispo, Exception, Ads Monitor.

**Key contracts consumed by Cursor:**
- `ContextSnapshot` / `CRMLeadContext` — dialer workspace context (includes 9 dossier projection fields)
- `GET/PATCH /api/leads/[id]/stage` — stage transitions with lock_version
- `GET /api/leads/score-queue` — score-ranked lead queue
- `GET /api/dashboard/morning-brief` — morning brief for dashboard
- Intelligence pipeline CRUD — `/api/dossiers/[lead_id]/*`
- Prompt registry — `/api/control-plane/prompt-registry`
- Notification: `src/lib/notify.ts` — direct Slack webhook + Twilio SMS (no n8n)

</details>

---

## Warm Transfer Screen Pop (Handoff — 2026-03-24)

**Status: Backend done, UI partially shipped (transfer brief shows on ring).**

The transfer-brief API (`/api/dialer/v1/transfer-brief`) returns full client file context when Jeff transfers a call. Key fields: `leadUrl`, `lead` snapshot, `property`, `recentCalls`, `openTasks`, `jeffNotes[]`.

**Remaining UI work:**
- Auto-open client file modal on transfer ring (when `leadId` is present)
- Show `jeffNotes` array prominently in the transfer overlay
- Render `recentCalls` and `openTasks` in transfer context

---

## Platform-Specific Instructions

### If You Are Claude Code

**Before every session:**
1. Read this file (AI-COORDINATION.md)
2. Read CLAUDE.md for project-specific instructions
3. Check the Active Work table above — is anyone else touching files you plan to modify?
4. Pull latest `main`

**Your primary responsibilities:**
- Database schema changes and migrations (you are the ONLY platform that touches the database)
- Business logic in `src/lib/` (scoring, compliance, enrichment, lead guards, agent framework)
- API routes for core domains (leads, deals, dialer, scoring, enrichment, ingest, twilio, cron)
- Provider adapter design and wiring
- MCP server implementation
- Agent fleet architecture
- Integration wiring (Slack webhooks, Twilio, provider adapters)
- TypeScript interfaces/types that other platforms consume
- Inngest background job functions

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
3. Pull latest `main`
4. Check for new types/interfaces Claude Code may have added

**Your primary responsibilities:**
- All UI components in `src/components/sentinel/`
- Page layouts in `src/app/(sentinel)/*/page.tsx`
- React hooks in `src/hooks/`
- State management in `src/stores/`
- React providers in `src/providers/` (Twilio, theme, modal, etc.)
- Styling, responsive design, shadcn/ui customization
- Visual bug fixes and UX improvements
- Property photo/image proxy routes (`/api/street-view`, `/api/property-photos`)

**You must NOT:**
- Edit database schema (`src/db/*`) or create migrations (`supabase/migrations/*`)
- Edit core business logic in `src/lib/` (scoring, compliance, enrichment, lead guards, etc.)
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

**Bug-fix exception:** When a Claude Code-owned route has a bug that blocks UI work, Cursor may fix it with the user's permission. Mark the commit clearly: `[cursor] Fix <route> — <what was broken>`.

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
- Code cleanup tasks (when explicitly assigned)

**You must NOT:**
- Make architectural decisions (suggest them in PR comments if you see issues)
- Create new API routes
- Modify database schema or create migrations (unless your ticket explicitly says to)
- Edit UI components (unless your ticket explicitly says to)
- Change shared types without explicit assignment
- Add new dependencies to package.json without explicit assignment
- Touch any file not listed in your ticket

---

## Conflict Resolution

### If Two Platforms Need the Same File
1. STOP. Do not edit the file.
2. The platform that owns the file (per the registry above) edits it.
3. If ownership is unclear, Claude Code gets priority (it handles structural changes).
4. If it's a UI file, Cursor gets priority.

### If You Find a Bug in Another Platform's Code
1. Do NOT fix it yourself (unless it's a one-line typo or it's blocking your work — see bug-fix exception above).
2. Note it in the Active Work table or tell the user.
3. The owning platform fixes it in their next session.

### If You Need to Add a Dependency
- **Backend dependency** (API, database, server-side): Claude Code adds it.
- **Frontend dependency** (UI library, component, styling): Cursor adds it.
- **Test dependency** (testing framework, mock library): Codex adds it.
- **Shared dependency** (utility used by both): Claude Code adds it, then Cursor pulls.

---

## Commit Message Format

All commits must include the platform tag:

```
[cc] Add stage transition validation to lead-guardrails.ts
[cursor] Build overdue follow-up dashboard widget
[codex] Add unit tests for ATTOM adapter normalization
```

This makes `git log` instantly readable for which platform did what.

---

## Quick Reference: "Can I Touch This File?"

```
Am I Claude Code?
  └─ Is the file in src/db/, supabase/migrations/, src/lib/ (core), src/app/api/ (core),
     sentinel-mcp/, src/inngest/, or configuration files?
     ├─ YES → Proceed
     └─ NO → STOP. Tell the user.

Am I Cursor?
  └─ Is the file in src/components/, src/hooks/, src/stores/, src/providers/,
     src/app/(sentinel)/*/page.tsx, or styling files?
     ├─ YES → Proceed
     └─ NO → Is it in the SHARED list and blocking your UI work?
        ├─ YES → Fix with user permission, tag commit clearly
        └─ NO → STOP. Tell the user.

Am I Codex?
  └─ Is the file explicitly listed in my ticket?
     ├─ YES → Is it a test file or explicitly assigned source file?
     │   ├─ YES → Proceed
     │   └─ NO → STOP. Ask in PR comment.
     └─ NO → STOP. Do not touch it.
```

---

## Document Version

**Last updated:** 2026-03-25
**Updated by:** Cursor
**Blueprint version:** v4 (March 18, 2026)

> When in doubt: ask the user. When tempted to touch a file outside your lane: ask the user.
> The 10 seconds it takes to ask saves the 2 hours it takes to resolve a merge conflict.
