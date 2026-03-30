# Tina V1 Build Guide

Last updated: 2026-03-29

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

As of 2026-03-29, Tina already has:

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
- source-fact spreadsheet clues for fixed assets, repair-vs-capitalization, and smaller equipment, so fringe research cards can surface from uploaded books even when the owner missed the organizer checkbox
- a first research-idea queue that turns business facts and paper clues into leads Tina should investigate before filing
- a broader discovery queue that now includes self-employed benefit checks, startup-cost review, and NAICS-driven industry-edge research prompts
- a more nuanced fringe-opportunity queue that now includes repair-vs-capitalization safe-harbor review and smaller-equipment write-off review when the business has asset activity
- LLC-aware filing-lane intake that separates the LLC legal shell from its federal tax treatment, including default single-member, default multi-member, S-corp election, C-corp election, and the married-couple community-property owner-return edge
- document-backed LLC lane confidence so saved prior returns or election papers can fill missing/default LLC tax-path answers, while explicit organizer-vs-paper conflicts fail closed for review
- server-side derived-workspace reconciliation across downstream build routes, from workpapers through final signoff, so stale browser snapshots cannot quietly turn an LLC return-type conflict into a falsely ready packet
- a persistent research-policy document that separates idea hunting from filing authority
- a code-backed IRS authority registry for Tina's supported 2025 Schedule C lane, with runtime sources separated from annual watch sources so future freshness gates have a real manifest to enforce
- a shared IRS authority manifest in `src/tina/data/irs-authority-registry.json`, so Tina's runtime sources, annual watch sources, and supported tax year live in one auditable place
- a live IRS authority watcher in `scripts/tina-irs-authority-watch.mjs`, with `npm run tina:irs-watch` writing machine-readable snapshots plus a human summary under `output/tina-irs-authority-watch/`
- an owner-facing IRS support check inside the Federal business form packet card, so Tina can calmly say whether the current packet tax year is waiting, certified, or not certified
- a live IRS freshness-watch status inside the Federal business form packet card, so Tina can calmly show whether the latest watched IRS report is a clean baseline, a clean rerun, missing, or needs review
- explicit IRS-year-support export blockers, so official-form HTML and PDF exports now tell the user why Tina is blocked instead of only saying the packet is not ready
- changed or failed IRS freshness-watch results now block package readiness and official-form export until someone reviews the watch output and recertifies the IRS support lane
- a proof-card / authority-dossier layer that shows what each tax idea still needs before it can affect the return
- an authority-trail layer that shows which kinds of law or guidance Tina still needs and what a reviewer would be deciding
- a saved authority-work layer with GPT-5.4 research runs, source trails, memo notes, disclosure state, and reviewer decisions
- a second adversarial stress-test pass for fringe or edge ideas so Tina can try to disprove a tax move before anyone trusts it
- challenge results that save weak spots, reviewer questions, and survival/failure verdicts alongside the authority memo
- reconciled research routes so Tina rebuilds derived workspace state before a research or challenge run
- a server-owned deeper research queue route, so the workspace and live harness can poll one shared queue instead of micromanaging one idea-specific `process` call at a time
- a single workspace queue heartbeat for deeper research and challenge work, so Tina now schedules retries and stale-run recovery through one calmer background loop instead of two separate browser-side schedulers
- an in-process background-dispatch layer for the shared research queue, so `/api/tina/research/process-queue` can return on a short heartbeat while one deeper GPT pass keeps running in the background
- stale-workspace protection for manual saves plus orphaned-background-job write guards, so an older tab or older background run cannot quietly overwrite newer Tina research state
- narrower runtime research profiles plus saved-paper grounding lines for the heaviest fringe asset lanes, so GPT starts from a smaller fact pattern instead of treating fixed-assets review like an unlimited depreciation survey
- bounded per-dossier research and challenge request windows, so deeper GPT passes now fail fast instead of sitting in `running` indefinitely
- tighter challenge prompts that keep links in structured citation fields instead of inside the reviewer memo, so the saved challenge lane is calmer and more consistent
- authority-text normalization on both save and workspace load, so saved research/challenge memos, reviewer notes, and citations can shed stray smart-quote noise or non-English fragments instead of preserving them forever in resume-mode artifacts
- latest-workspace-safe authority result saves, so long research and challenge runs now reload the newest saved draft before writing back their finished memo or challenge result
- challenge-output normalization that trims overlong GPT warning/question lines before Tina saves them, so deeper challenge passes are less likely to fail on oversized reviewer bullets
- authority-review status normalization so saved `do_not_use` decisions now fail closed to `rejected` instead of leaving state-gate cards looking half-alive in `ready_for_reviewer`
- a verified fresh-build fringe harness result plus resume reruns showing that all five surfaced fringe cards can now complete their challenge lanes on 2026-03-29, with later targeted reruns proving the saved artifacts can also be cleaned and reclassified without replaying the whole owner flow
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
- a richer single-file HTML review packet export that a reviewer can open and print without unpacking raw markdown notes
- a final review bundle package that now carries both the plain markdown artifacts and the richer HTML packet in one downloadable file
- a first year-specific official-form packet layer for the supported Schedule C lane, with mapped form lines and a downloadable HTML packet that is closer to real paperwork
- a printable PDF export for the official-form packet so Tina can hand over a cleaner paperwork file instead of only HTML
- a first year-versioned field template for the supported 2025 Schedule C lane so Tina can place values into known form boxes instead of only printing a table
- a first official support-schedule path for Schedule C line 27a so Tina can carry an other-expenses breakout alongside the form packet
- a standalone-friendly PDF render path that uses temp files plus Python fallbacks instead of assuming one local command shape forever
- safety banners inside Tina's HTML and PDF paperwork exports so review-only outputs do not look quietly filing-ready
- export builders that now render Tina's saved reviewed snapshots instead of quietly recalculating packet state at download time
- export routes that now rebuild Tina's derived packet state server-side before rendering paperwork, so forged `complete` flags in the browser cannot quietly turn into trusted-looking exports
- a first downloadable CPA review brief so Tina can export a human-readable packet summary instead of only showing packet status on-screen
- a saved final-signoff layer with simple human checks, reviewer notes, and confirmation state
- a first multi-file review bundle export so Tina can hand over an owner summary, CPA packet, open-items list, source index, and signoff note together
- a single-file review-bundle package download so Tina can hand over the whole review set in one safer browser-friendly file
- a shared artifact manifest so Tina can show exactly which packet files are ready, waiting, or blocked, and whether each file lives inside the bundle, as its own download, or both
- a first full handoff packet export that assembles Tina's file map, review story, and official-form layer into one printable HTML handoff file
- tests for filing-lane logic, draft parsing, and checklist coverage
- a standalone research-policy module for broad idea discovery vs primary-authority validation
- stable packet identity across Tina's review exports, with packet ID, packet version, and packet fingerprint carried into the artifact manifest and export files
- packet-aware export filenames so downloaded Tina artifacts can be matched back to a specific packet revision even outside the app
- final signoff confirmations pinned to the exact packet revision they approved, so Tina can clear or refuse stale confirmations instead of letting them float across packet changes
- final signoff review progress now pinned to the active packet revision on the server too, so checked boxes from an older packet do not survive a save/load roundtrip after the packet content changes
- a server-backed packet history for exported Tina packets, so review bundles and paperwork can be tied to saved packet snapshots instead of only the live browser draft
- exact saved-packet re-export support, so Tina can redownload a specific server-saved packet revision instead of only whatever the live workspace looks like today
- a read-only saved-packet inspector inside Tina, so a reviewer can reopen an older server-saved packet revision, inspect its exact artifact state, and redownload that specific snapshot without mutating the live draft
- a live-vs-saved packet comparison layer, so Tina can explain what changed between an older saved packet and today’s live packet instead of leaving the reviewer to guess
- export-time draft flushing plus autosave pausing, so Tina can save the live draft before manual packet exports and lower the chance of packet-history races between background saves and explicit downloads
- a dedicated saved-packet review route, so Tina can deep-link into one exact server-saved packet revision and keep older packet inspection out of the live workspace flow
- a saved-packet reviewer trail, so each packet revision can carry its own reviewer decision, notes, and small history without mutating the live workspace packet
- a dedicated saved-packet history page, so reviewers can search, filter, and reopen older packet revisions without digging through the live workspace
- saved-packet reviewer decisions now traveling inside Tina's exported review files and bundle metadata, so downloaded artifacts tell the same review story the app does
- a saved-packet restore flow, so one exact older packet can become today's live workspace again without manual rebuilding
- a dedicated QuickBooks/books intake lane, so owners have one obvious place to hand Tina their bookkeeping export now while we prepare the future live QuickBooks connect
- a Tina-only books connection snapshot plus normalized books-import snapshot, so uploaded QuickBooks or P&L files can be sorted into one clean bookkeeping lane before they touch tax work
- first-pass books sorting that pulls out coverage, money-in, money-out, and clue chips from uploaded bookkeeping files, then saves that view inside the Tina workspace
- books-lane actions in the Tina UI for "use uploads now," "plan live QuickBooks later," and "let Tina sort these books," while keeping the language simple and low-stress
- books-aware issue-queue logic, so Tina can flag waiting book files, fuzzy book files, and likely partial-year coverage from the normalized books snapshot instead of only raw paper clues
- bookkeeping context carried into CPA-facing packet output, so reviewers can see Tina's books-lane summary and per-file bookkeeping status alongside the return and paperwork layers
- an explicit Tina route-group auth gate, so the Tina pages no longer render as a local-only fallback when the user is logged out and now bounce cleanly into Sentinel's login flow first

This means Tina now has real movement from `book_original` into `ai_cleanup`, then into `tax_adjustment`, then into `reviewer_final`, then into a first Schedule C draft preview, then into a package-readiness check, then into a CPA handoff packet manifest, then into a downloadable review brief, then into a final signoff step plus a multi-file review bundle, then into an official-form HTML and PDF packet, then into a shared file manifest for the whole handoff set, then into a first assembled full handoff packet, and now into a year-versioned Schedule C field template plus a line-27a support-schedule path that drive more official-looking paperwork output. The next major step is hardening these outputs into a more formal CPA-ready package set with stronger artifact contracts, wider line coverage, and later true official form rendering/filling.

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
- owner-flow simplicity
- unsupported-lane fail-closed behavior
- prior-return bootstrap behavior
- document parsing failure handling
- workpaper traceability
- deterministic math correctness
- package-readiness gating

## IRS Freshness Lane

Tina's IRS-facing honesty now has a real maintenance path.

Current files:

- registry manifest: `src/tina/data/irs-authority-registry.json`
- registry reader: `src/tina/lib/irs-authority-registry.ts`
- watch-status reader: `src/tina/lib/irs-authority-watch.ts`
- live watch script: `scripts/tina-irs-authority-watch.mjs`
- latest watch summary: `output/tina-irs-authority-watch/summary.md`

Current rule:

- Tina may only claim IRS-facing support for the exact filing lane and tax year covered by the registry
- the current supported federal lane is the 2025 Schedule C owner-return path
- if the packet tax year is explicit and falls outside the curated registry year, Tina must stay in review mode and block IRS-facing export claims
- if the watcher sees changed or failed IRS sources, Tina should treat that as a recertification signal, not as a silent background detail
- the workspace should surface the latest watch result in plain language so the reviewer does not have to go hunting in `output/` to learn whether the last IRS watch was clean
- changed or failed watch results should now flow into Tina's readiness and official-form export blockers, while a merely missing watch run stays visible but non-blocking for now

Current operator command:

- `npm run tina:irs-watch`

That command should:

- fetch every IRS source in the shared manifest
- save the latest metadata and body hash in `output/tina-irs-authority-watch/latest.json`
- save a timestamped report snapshot in `output/tina-irs-authority-watch/`
- write a human-readable summary in `output/tina-irs-authority-watch/summary.md`

Annual recertification expectation:

- refresh the manifest if the supported lane or tax year changes
- run `npm run tina:irs-watch`
- inspect changed or failed sources
- update Tina's deterministic rules, form coverage, and copy where needed
- rerun Tina tests and a browser proof before claiming the new tax year is certified

## Persistent Testing Harness

Tina now has a reusable owner-flow test lane:

- local-only Tina tester setup in [scripts/ensure-tina-test-user.mjs](C:\Users\adamd\Desktop\Sentinel\scripts\ensure-tina-test-user.mjs)
- reusable fabricated-business fixture pack in [scripts/build-tina-fixture-pack.py](C:\Users\adamd\Desktop\Sentinel\scripts\build-tina-fixture-pack.py)
- end-to-end owner journey runner in [scripts/tina-owner-flow-check.mjs](C:\Users\adamd\Desktop\Sentinel\scripts\tina-owner-flow-check.mjs)
- test notes and usage in [docs/tina/TINA_OWNER_FLOW_TESTING.md](C:\Users\adamd\Desktop\Sentinel\docs\tina\TINA_OWNER_FLOW_TESTING.md)

That harness now covers both:

- a calm clean sole-prop lane
- a messy-books lane with partial-year books, payroll hints, contractor hints, sales-tax clues, inventory clues, and Idaho clues

The owner-flow rule is stronger now:

- messy books should still turn into only the next few asks
- clue-driven follow-up papers should show up on the main Tina card in plain language
- deeper review records should not replace the owner-facing next-step guidance
- Tina should balance the visible top asks so the owner sees a smart mix of follow-up paper, structural fix, and simple answer when that helps
- Tina should explain why each ask is showing up: starter step, paper clue, fuller-year fix, or human check

The current owner-flow rule is now explicit:

- Tina should show one strong next step
- Tina should only show the next few asks on the main screen
- deeper reviewer and CPA tools should stay hidden by default

## Notes For Future Extraction

If Tina later becomes a standalone product:

- move `src/tina/*` and `src/app/(tina)` into a new app
- replace shared auth/session integration
- replace shared UI primitives only if needed
- keep the tax domain model and Tina workflow intact

That means every new Tina file added during V1 should be written as if it may one day leave this repo.
