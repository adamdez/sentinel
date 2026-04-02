# TINA_CURRENT_BUILD_STATUS

## Current State
Tina is a strong foundation, not a finished tax product.

She already behaves like a guided tax-prep workspace with early review logic, but she is not yet a fully durable, reviewer-grade, end-to-end business tax system.

## What Is Already Implemented
### Workspace and owner flow
- dedicated Tina workspace inside Sentinel
- simplified "one step at a time" owner-facing UX
- prior-return intake
- supporting document upload flow
- local + account-backed draft behavior
- guidance around next action and missing papers

### Document and evidence layer
- secure document vault
- per-document open/link flow
- document reading pipeline
- spreadsheet reading
- AI-assisted reading for some non-spreadsheet docs when configured
- structured source-fact extraction from readings

### Tax-prep foundation layers
- filing-lane recommendation
- bootstrap review
- issue queue
- workpaper build
- cleanup plan
- AI cleanup layer
- tax adjustment layer
- reviewer-final layer
- first deterministic Schedule C draft
- package readiness check
- first CPA handoff packet
- first downloadable CPA review export

### Research and authority foundation
- research ideas
- research policy
- authority work items
- authority dossiers / trails concept
- reviewer decision concepts around authority usage

### Testing foundation
- substantial Tina test suite
- adversarial gauntlet exists
- tests around issue queue, package readiness, workpapers, schedule C, research policy, etc.

## What Is Only Partially Implemented
### Persistence
- Tina still relies too much on one large workspace draft object
- current workspace persistence is stored through `user_profiles.preferences`
- many Tina layers are durable only as part of that draft, not as first-class tables

### Reviewer workflow
- reviewer-final logic exists
- package readiness exists
- CPA packet exists
- but there is not yet a true immutable reviewer signoff workflow with explicit approval state and durable package snapshots

### Product truth/status
- Tina still reports itself as `foundation`
- this is directionally honest, but the product story and status surfaces need to be made more precise and more useful

### UX separation
- owner UX is simpler now
- but owner mode and reviewer mode are still not cleanly separated as distinct operating modes

### Authority handling
- authority/research groundwork exists
- but the full `Use / Review / Appendix / Reject` operating model is not yet deeply wired through the entire system

## What Is Missing
### 1. Durable Tina data model
Missing first-class Tina records for things like:
- workspaces
- business profiles
- Tina documents
- source facts
- issues
- workpapers
- AI runs
- review decisions
- package snapshots
- QuickBooks connections

### 2. Real migration off the draft blob
- current draft endpoint is still the operational center
- Tina needs a compatibility bridge, then a move to durable table-backed persistence

### 3. Immutable signoff and package completion
Missing:
- final reviewer signoff object
- durable package snapshot history
- clear approval lifecycle
- explicit "ready for CPA review" vs "provisional" vs "blocked"
- prevention of silent post-approval drift

### 4. Real QuickBooks integration
Not fully live:
- OAuth/connect flow
- token storage pattern for QB
- sync status
- account mapping
- repeat sync handling
- ledger-source provenance

### 5. Reviewer appendix lane
Need a true system for:
- surfacing non-standard but plausible tax opportunities
- keeping them out of the return by default
- attaching authority, assumptions, and upside
- rejecting low-quality noise before it reaches the reviewer

### 6. Stronger edge-case tax logic
Still needs heavier handling for:
- owner draws vs expenses
- mixed-use/personal contamination
- auto/home-office edge cases
- contractor vs payroll ambiguity
- depreciation / fixed asset treatment
- inventory / COGS edge cases
- unsupported multistate situations
- contradictory evidence across papers/books

### 7. Trust and observability
Need:
- run logs
- extraction failure visibility
- sync telemetry
- human-review-required states
- confidence/readiness scoring that tells the truth

## Biggest Current Risks
### 1. Draft-blob risk
A polished UI on top of one large draft object can look more complete than it really is. This is the biggest architectural risk.

### 2. False confidence risk
Tina already has enough logic to feel impressive, but without durable signoff, snapshotting, and stronger fail-closed behavior, she could still appear more defensible than she is.

### 3. Reviewer clutter risk
If advanced tax/research/reviewer surfaces keep growing without mode separation, owner simplicity will erode.

### 4. Appendix quality risk
If appendix ideas are not filtered ruthlessly, Tina could become noisy instead of valuable.

## Exact Next Implementation Order
### Phase 1: Persistence foundation
- add Tina tables in DB schema
- add migration
- create Tina repository/service layer
- migrate workspace API to load/save durable records
- keep current draft endpoint as bridge only
- preserve current UI behavior during transition

### Phase 2: Reviewer signoff architecture
- add reviewer decision records
- add package snapshot records
- add signoff gating rules
- add explicit package state machine
- make export come from immutable snapshot, not only live draft state

### Phase 3: Owner vs reviewer mode split
- keep owner flow simple and collapsed
- move deep review surfaces behind reviewer mode
- make signoff/review actions clearly reviewer-only

### Phase 4: Appendix and authority model
- wire `Use / Review / Appendix / Reject`
- require authority and assumptions for appendix items
- prevent appendix items from silently flowing into returns
- improve reviewer visibility into unusual but plausible savings ideas

### Phase 5: QuickBooks integration
- add QB connection record
- implement OAuth/connect flow
- add sync jobs/status
- map ledger data into Tina evidence model
- dedupe repeat syncs and preserve provenance

### Phase 6: Harder tax logic and adversarial testing
- add more fail-closed checks
- expand adversarial scenarios
- test weird small-business fact patterns
- test unsupported/contradictory source combinations
- test appendix filtering quality

### Phase 7: Truthful maturity surfaces
- update Tina status route
- add operational telemetry
- expose readiness honestly
- make "foundation vs reviewer-ready" visible and real

## Suggested First Milestone
The best first standalone-project milestone is:

**"Tina Reviewer-Grade Schedule C Core"**

That milestone should include:
- durable Tina persistence
- reviewer signoff state
- immutable package snapshot export
- stronger Schedule C edge-case gating
- owner/reviewer mode split
- truthful readiness/status surface

## Definition of Done For That Milestone
Tina is ready for the next level when:
- workspace data is no longer operationally dependent on one draft blob
- a reviewer can sign off on a stable package snapshot
- final output is traceable to evidence
- unsupported positions fail closed
- appendix ideas are useful and filtered
- owner flow remains simple
- reviewer flow is faster, clearer, and more defensible than before
