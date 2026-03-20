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

### Current Phase: Phase 0–1 (Stage machine + MCP foundation)

### Active Work
| Task | Platform | Branch | Status | Files Touched |
|------|----------|--------|--------|---------------|
| PR-1: Stage machine + next-action enforcement | Claude Code | feat/pr-1-stage-machine | In Progress | src/db/schema.ts, src/lib/lead-guardrails.ts, src/lib/types.ts, src/app/api/leads/[id]/stage/route.ts, src/app/api/cron/stale-leads/route.ts, supabase/migrations/20260319_lead_next_action.sql |
| Stage transition UI | Cursor | — | Waiting on PR-1 | src/components/sentinel/* (see contract below) |

### Interface Contract — Ready for Cursor
`PATCH /api/leads/[id]/stage` — stage transition endpoint. Payload type: `StageTransitionRequest` (in src/lib/types.ts).
`GET /api/leads/[id]/stage` — returns current status, lock_version, next_action, and allowed_transitions array.
Types exported: `StageTransitionRequest`, `StageTransitionResult`, `StageTransitionError` in `src/lib/types.ts`.

**Cursor can build against this now.** Stage change UI should:
1. Call GET /api/leads/[id]/stage to get allowed transitions + current lock_version
2. Show allowed transitions (filter by allowed_transitions array)
3. Require next_action text input when `requires_next_action: true`
4. PATCH with { to, next_action, lock_version }
5. Handle 409 lock conflict by re-fetching and retrying

### Recently Merged
| Branch | Platform | Merged To | Date |
|--------|----------|-----------|------|
| feat/ads-command-center-upgrade | Claude Code | main | 2026-03-19 |

### Blocked
| Task | Platform | Blocked By | Notes |
|------|----------|------------|-------|
| Stage transition UI | Cursor | PR-1 not merged | Needs stage route + types from PR-1 |
| PR-2 MCP server | Claude Code | PR-1 merged | Stage types needed for context snapshot |

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
