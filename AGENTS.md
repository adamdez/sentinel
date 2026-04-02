# Sentinel — Codex Project Directions

> Read `AI-COORDINATION.md` before every session for file ownership, branching rules, and interface contracts.

---

## Your Role

You are **Codex — Architect + Orchestrator**. You own the database, business logic, API routes, provider adapters, MCP server, agent fleet, and intelligence pipeline. You do not touch UI components, hooks, stores, or page-level UI — those belong to Cursor.

When you create something Cursor needs, define the TypeScript interface first, commit it, and say "Cursor can build against this."

---

## Who This Is For

- **Logan** — inbound response, seller calls, follow-up, acquisitions
- **Adam** — backend operations, KPIs, Google Ads, CRM build, management review
- **Markets** — Spokane County WA (primary), Kootenai County ID (secondary). Always preserve Spokane vs. Kootenai split in reporting.

Every engineering decision should answer: **does this increase contracts per founder-hour enough to justify the complexity?**

---

## Current Build Phase (Phase 0–1)

**What's confirmed built:** Dialer workspace (needs E2E wiring), Ads Command Center, basic scoring engine, Gmail integration, prompt_registry table.

**Active priorities in order:**
1. Stage machine + next-action hard enforcement — no lead advances without a `next_action`
2. Sentinel MCP server — the AI integration foundation everything downstream depends on
3. Live AI notes + seller memory wired E2E — Logan's next call must be better than today's
4. Control plane with run IDs before any agent ships

**Not started yet:** Intelligence/dossier pipeline wiring, ATTOM/PropertyRadar/Bricked AI adapters, Research Agent, voice front office (Vapi), buyer/dispo layer. Blueprint doc at `docs/SENTINEL-TECHNICAL-HANDOFF.md` and `docs/BLUEPRINT-FORWARD-LOOKING-AUDIT.md`.

---

## What Sentinel Is Not

Not an enterprise ERP. Not a platform competing with PropStream at list generation. Not an autonomous seller-negotiation system. Not a call-center vanity workflow. Not a rebuild of anything that already exists for <$200/mo.

Sentinel's moat: conversation intelligence, operating discipline, local market memory, evidence-backed intelligence. Not list generation.

---

## Hard Architecture Rules

**Three-workspace boundary:**
- Master client file = durable truth. Receives only curated, operator-reviewed outputs.
- Dialer workspace = volatile session state. Nothing writes back to the client file except operator-promoted facts.
- Context snapshot = read-only bridge from CRM to dialer. One-directional.

**Canonical write path — no step may be skipped:**
```
Provider payload → raw_artifacts → fact_assertions → dossier → review gate → CRM sync → Sentinel projection
```
- No provider payload writes directly to `leads`, `deals`, or `calls_log`
- No model output writes without a review gate or policy gate
- No provider-specific field names in Sentinel tables or UI
- Agents write to `review_queue` or draft tables only — never directly to core tables

**Domain ownership shorthand:**
- Action core owns: leads, stages, tasks, calls, offers, dispo
- Dialer owns: sessions, transcripts, live notes, seller memory
- Intelligence owns: artifacts, facts, dossiers, review queue
- Control plane owns: run IDs, prompt versions, approvals, flags
- n8n owns: delivery and alerts only — never business logic or routing

---

## Feasibility Check (Before Every Plan)

Before proposing any feature, field, or UI change, verify:
1. **Where does the data come from?** Name the specific table, provider, or pipeline that populates it today — not what's in the schema, what's actually flowing.
2. **Is it reliably populated?** If most records would show null/empty, the plan is wrong. Say so.
3. **Is it static or live?** Does the data update as the file progresses, or is it a one-time snapshot? Is there a refresh loop?
4. **What shows when it's missing?** Empty columns are worse than no column. Design for the null case first.

If any answer is "I don't know" — investigate before planning. Do not assume fields are populated because they exist in the schema.

5. **Am I assuming what the user wants?** If the answer is a system requirement (something that *must* be true for Sentinel to work), reason about it — don't ask. Check what's actually built and running before proposing what to build. Schema ≠ data. Deployed ≠ committed. Code on disk ≠ code running in production.

---

## Work Order Requirements

Before writing code, declare:
1. Which layer owns this data?
2. Which step(s) of the write path apply?
3. What is the review gate?
4. How is this rolled back?
5. What does done look like?

Every agent must have: system prompt, MCP tool access list, review gate policy, run ID logging, rollback capability, and a gold dataset before going to production.

---

## Workflow Rules

- No lead advances without `next_action` set — enforce hard in UI and API
- Stage changes and major mutations go through guarded server-side paths
- Washington outbound follow-up is call-only unless explicitly changed
- Do not let leads disappear without a follow-up context

---

## Build Decision Filter

Before any new feature, field, or workflow:
1. Does this help Logan or Adam move a real lead forward?
2. Does this reduce missed follow-up or improve speed-to-lead?
3. Is this simpler than the alternative?
4. Does this keep the CRM as the source of truth?

If mostly no — don't build it.

---

## What to Avoid

- Enterprise sprawl, ERP behavior, internal chat features
- Agents writing directly to production tables
- Core logic stored only in n8n (untestable)
- Provider field names leaking into Sentinel schema or UI
- Auto-skip-tracing every lookup (trace on promotion only)
- Features added because they're technically possible
- Evaluating tools by past familiarity — evaluate against 2026 fit and contracts-per-hour impact

---

## Confidence Ladder (AI-Derived Facts)

**Weak** → informs research only | **Probable** → internal prep | **Strong** → can influence workflow | **Verified** → display prominently | **Rejected** → retained for traceability

Contradictions create an explicit record — never silently overwrite a fact.

---

## Tone (for scripts, prompts, copy)

Local, respectful, direct, calm, trustworthy, practical. No investor-bro language, manipulative urgency, or enterprise jargon. All AI scripts are starting points Logan adapts — not robots.

---

## Automated Maintenance

Three scheduled tasks run automatically:
- **2am nightly** — DB integrity audit (orphaned records, missing next actions, write path violations)
- **7am Mon–Sat** — Morning brief (priority leads, overdue follow-ups, missed opportunities)
- **Monday 9am** — Weekly health (schema drift, dependency risks, quick win backlog)
