# Tina V1 Build Guide

Last updated: 2026-03-27

This document is the persistent implementation guide for `Tina`, the business-tax feature inside Sentinel. It exists so the plan does not depend on chat history.

Related persistent docs:

- `docs/tina/TINA_RESEARCH_POLICY.md` for how Tina may hunt for ideas broadly while validating narrowly before anything reaches a return

## Product Summary

Tina is a private tax-prep workspace for one business owner and one tax year at a time.

V1 goals:

- live inside Sentinel for speed and reuse of auth/session plumbing
- remain isolated enough to extract into a standalone product later
- guide the owner from prior-year return and current-year records to a filing-ready package
- use AI for extraction, classification, reconciliation, issue generation, and explanations
- keep tax math, readiness gates, and auditability deterministic

V1 non-goals:

- direct IRS e-file
- IRS XML generation
- multi-customer practice management
- support for every filing lane
- replacing legal/compliance review

## Core Decisions

- Tina uses its own route group, layout, components, and API namespace.
- Tina shares only generic Sentinel infrastructure:
  - auth/session
  - shared providers
  - shared Supabase helpers
  - shared generic UI primitives
- Tina must not depend on Sentinel feature stores, CRM data models, or page-shell components.
- Tina is branded as `Tina` in the UI, but persistence and code should stay tax-domain based (`tax_*`, `src/tina/*`) for clarity and future extraction.
- The first deterministic filing lane is `Schedule C / single-member LLC`.
- Unsupported lanes must fail closed with a clear message instead of pretending the return is ready.
- Prior-year return is strongly preferred, but Tina must have a fallback organizer workflow if it is missing.

## Tina UX Direction

Tina should feel distinct from Sentinel without turning into a joke product.

Tone:

- warm
- sharp
- lightly playful
- credible enough for tax prep and CPA review

Character use:

- subtle llama motifs are welcome
- Tina can use small personality moments in empty states, checklist copy, and status messages
- avoid cartoon behavior in high-stakes review and approval flows

Primary UX model:

- form-first
- checklist/inbox driven
- AI explanations on demand
- no chat-first experience

### Plain-language rule

Tina must be easy enough to follow that a smart 8-year-old could move through the flow with help from an adult who has the documents.

That means:

- one action per step whenever possible
- short sentences
- simple words before tax words
- every question explains why Tina is asking
- every request explains what the document is and where the owner might find it
- always provide an `I'm not sure yet` path when it is safe
- avoid dense walls of text in the main flow
- never make the user decode internal tax-engine language to move forward

Working test:

- if a sentence sounds like it was written for an accountant, rewrite it
- if a button label does not tell the user what happens next, rewrite it
- if a user could feel dumb for not knowing the answer, soften the prompt and add a fallback path

## Architectural Shape

### 1. Isolation Boundary

Tina should be organized as a bounded module:

- `src/app/(tina)` for Tina pages and layouts
- `src/app/api/tina/*` for Tina API routes
- `src/tina/*` for Tina domain code, config, types, and components

Allowed imports into Tina:

- `@/lib/supabase`
- generic shared providers
- generic shared UI primitives
- generic utility helpers

Avoid importing:

- `@/components/sentinel/*`
- `@/components/layout/*`
- `@/lib/store`
- feature-specific hooks tied to leads, dialer, campaigns, CRM, or ops workflows

### 2. Three-Part System

#### Deterministic tax engine

Owns:

- tax math
- supported line calculations
- carryforward application
- readiness gates
- package completeness
- validation checks

#### AI reasoning layer

GPT-5.4 owns:

- prior-return extraction
- document classification
- field extraction
- reconciliation suggestions
- document requests
- issue explanations
- authority-backed recommendation drafting

#### Workflow + audit layer

Owns:

- workpaper layers
- issue lifecycle
- authority labeling
- versioning
- human approvals
- package generation

## Workpaper Model

Every material amount must trace through these layers:

1. `book_original`
2. `ai_cleanup`
3. `tax_adjustment`
4. `reviewer_final`

Nothing should jump directly from raw source data to final return output without a traceable chain.

## Stage Model

Tina V1 uses a 6-stage workflow:

1. Prior-year bootstrap
2. Business facts organizer
3. Filing-lane recommendation and confirmation
4. Document/API ingestion
5. Reconciliation and issue resolution
6. Filing-ready package delivery

Each stage needs:

- clear current status
- required inputs
- blocking vs non-blocking conditions
- next action

## Core Records

The first Tina data model should include:

- `tax_workspace`
- `business_tax_profile`
- `tax_document`
- `tax_source_fact`
- `qb_connection`
- `workpaper_line`
- `tax_issue`
- `authority_citation`
- `tax_package`
- `ai_run`

## API Surface

The first Tina API surface should cover:

- workspace create/load
- prior-return upload and extraction
- organizer save/update
- filing-lane proposal/confirmation
- document upload/import
- QuickBooks sync
- reconciliation run
- issue resolution
- package generation/download

## Initial Build Order

### Phase 1

- Tina route group and shell
- Tina starter page
- Tina guide in repo
- isolated Tina domain folders
- navigation entry from Sentinel

### Phase 2

- workspace persistence
- organizer and stage state
- prior-return uploader
- document vault scaffolding

## Current Implemented Foundation

As of 2026-03-26, Tina already has:

- a private Tina route group and Tina-specific shell inside Sentinel
- a persistent Tina guide in this repo
- a Tina domain folder and Tina API namespace
- a local + account-backed workspace draft
- a plain-language Stage 1 and Stage 2 flow
- deterministic filing-lane recommendation for the first supported lane
- a secure Tina document vault for uploads
- request-linked document tracking so saved papers can satisfy checklist items
- signed-link opening for saved Tina papers
- a saved bootstrap review with plain-language facts, blockers, and next actions
- per-document reading results for saved papers
- real first-pass spreadsheet reading for CSV and XLSX documents
- a first AI reading path for PDFs, Word docs, and images when OpenAI is configured
- a persistent source-fact layer built from saved paper readings
- first mismatch detection between organizer answers and extracted paper facts
- a first deterministic money-picture read for spreadsheet books and bank papers
- a document-linked issue queue and prep board that compare organizer answers to saved-paper facts
- book-side clues for date ranges, money in, money out, payroll, sales tax, contractors, and inventory when Tina can see them in spreadsheets
- a first research-idea queue that turns business facts and paper clues into leads Tina should investigate before filing
- a persistent research-policy document that separates idea hunting from filing authority
- a proof-card / authority-dossier layer that shows what each tax idea still needs before it can affect the return
- an authority-trail layer that shows which kinds of law or guidance Tina still needs and what a reviewer would be deciding
- saved authority work items inside the workspace for citations, memo notes, disclosure decisions, and reviewer calls
- a live GPT-5.4 authority-research route that can run a deep web-backed pass for one idea and save sources, memo text, and missing-authority notes
- a first saved workpaper snapshot that turns book-side clues into traceable money-story lines with linked papers and linked issues
- a saved cleanup-plan layer that turns trusted money-story lines into reviewable cleanup ideas before anything can move into `ai_cleanup`
- a saved `ai_cleanup` layer that only accepts human-approved, issue-free cleanup ideas and preserves traceability back to original workpaper lines and reviewer approval
- a saved `tax_adjustment` layer that turns approved `ai_cleanup` lines into reviewable tax-treatment candidates, while blocking special cases behind authority review when needed
- a saved `reviewer_final` layer that turns human-approved tax adjustments into the first return-facing review lines without pretending Tina has a filing package yet
- a first deterministic Schedule C draft layer that maps only the supported reviewer-final lines into a small form preview while keeping fragile items in review notes instead of forcing them into the form
- a first package-readiness layer that explains exactly what still blocks a filing-ready package and which draft boxes or notes each blocker is tied to
- a first CPA handoff packet layer that lays out what a reviewer would receive, which packet sections are ready, and which sections are still waiting or blocked
- tests for filing-lane logic, draft parsing, and checklist coverage
- a standalone research-policy module for broad idea discovery vs primary-authority validation

This means Tina now has real movement from `book_original` into `ai_cleanup`, then into `tax_adjustment`, then into `reviewer_final`, then into a first Schedule C draft preview, then into a package-readiness check, and now into a first CPA handoff packet manifest. The next major step is turning that packet into real downloadable artifacts and a final signoff screen so Tina can show exactly what a reviewer would export and approve.

## First Adversarial Review Gate

The first deep antagonistic review is due after these three things exist together:

- prior-return extraction or document extraction is live
- issue / blocker generation is live
- the deterministic engine starts producing reviewable tax outputs or workpaper values

Why this is the right moment:

- before that point, the biggest risks are mostly product-shape and UX issues
- after that point, the risks become trust, traceability, false confidence, and incorrect tax conclusions

As of 2026-03-26, this gate is now due because Tina has:

- live document extraction
- live issue and blocker generation
- the first reviewer-facing workpaper values

From this point on, every new Tina money or tax layer should be built assuming adversarial review is active.

### Phase 3

- QuickBooks ingestion
- extraction pipeline
- issue/request engine
- workpaper layers

### Phase 4

- deterministic Schedule C engine
- supported Washington calculations
- review surfaces
- package generation

## Testing Priorities

- auth gating
- Tina route isolation
- unsupported-lane fail-closed behavior
- prior-return bootstrap behavior
- document parsing failure handling
- workpaper traceability
- deterministic math correctness
- package-readiness gating

## Notes For Future Extraction

If Tina later becomes a standalone product:

- move `src/tina/*` and `src/app/(tina)` into a new app
- replace shared auth/session integration
- replace shared UI primitives only if needed
- keep the tax domain model and Tina workflow intact

That means every new Tina file added during V1 should be written as if it may one day leave this repo.
