# core/ — System of Action

**Owns:** Leads, stages, tasks, notes, calls, offers, dispo states, source/market attribution, operator-facing UI projections, KPI fields.

**Does not own:** Raw provider payloads, AI traces, research artifacts, model logic, live call state, transcripts, dossiers.

**Primary rule:** Fast operator truth only.

## Boundary Rules

- This module NEVER imports from `intel/`, `dialer/`, or `agents/`.
- This module exposes interfaces and types that other modules consume.
- Other modules write into core/ tables ONLY through defined contracts:
  - `intel/` writes through CRM sync snapshots
  - `dialer/` writes through the publish-to-client-file function
  - `agents/` write through the control-plane/ review queue
- Provider-specific field names never appear in this module.

## What belongs here

- Lead CRUD, stage transitions, ownership logic
- Task creation, next-action enforcement, stale-lead detection
- Pipeline queries and projections
- Offer workflow and dispo state management
- Source/market attribution
- KPI computation and reporting queries
- UI components for Lead Detail, Pipeline, Inbox, Dashboard

## What does NOT belong here

- Call session management (→ dialer/)
- Live notes or transcripts (→ dialer/)
- Research artifacts or dossiers (→ intel/)
- Provider API calls (→ providers/)
- Agent logic or prompts (→ agents/)
- Background job definitions (→ workflows/)

## Migration notes

Existing lead, task, pipeline, offer, and dispo code should migrate here over time as it gets touched for feature work. Do not do a bulk move — migrate file by file when you need to modify it.
