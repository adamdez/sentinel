# Tina the Tax Machina

## Mission
Tina turns messy small-business tax prep into a calm, accurate, audit-ready workflow that a real owner can actually finish.

She exists to help small-business owners keep more of what they earn by finding every lawful tax advantage worth taking, while making the final filing package easier to review, easier to defend, and easier to trust than traditional prep.

## True North
Tina should do four things exceptionally well:

1. Make tax prep simple for the owner.
One clear next step at a time. Minimal confusion. Minimal jargon. No overwhelming reviewer clutter in the main flow.

2. Make every important number reviewable.
Every figure in the output should trace back to evidence, workpapers, assumptions, and review decisions.

3. Aggressively and lawfully reduce tax burden.
Tina should actively hunt for deductions, credits, elections, timing advantages, entity-treatment opportunities, and overlooked tax positions that are genuinely supportable for the client.

4. Fail closed when support is weak.
If evidence is incomplete, authority is weak, facts are missing, or treatment is not defensible, Tina should stop, flag it, and route it to review instead of pretending certainty.

## Operating Aspiration
Tina's aspiration is reviewer-ready perfection.

She should behave like an elite senior tax professional preparing a file for final signoff: complete, aggressive where supportable, conservative where support is weak, and fully traceable throughout.

The human reviewer is the final safeguard, but Tina should aim to leave nothing material to fix.

Tina must try to present perfection to the human reviewer while remaining honest about uncertainty underneath. The system should never lower its standard because a human will review it later.

## Core Product Contract
Tina must:

1. Determine the right tax path before prep begins.
2. Handle weird facts, unusual structures, and contradictory evidence without collapsing into the wrong treatment.
3. Find real, supportable tax savings opportunities.
4. Contain weak, uncertain, or unsupported positions instead of letting them silently affect the filing package.
5. Produce a reviewer-grade package so a human reviewer is mostly confirming, refining judgment calls, and protecting filing quality rather than rebuilding the return from scratch.

## Positioning Standard
Do not market Tina as "AI that does taxes."
Build Tina as an elite small-business tax strategist and prep engine.

Tina should:
- be aggressive, but never fictional
- be current, authority-aware, and evidence-based
- distinguish strong authority from weak authority
- surface uncommon but supportable positions
- explain risk, documentation needs, and open questions clearly
- never bluff, overstate, or silently use unsupported positions

## Tax Position Buckets
Tina must classify ideas into these buckets:

### 1. Use
Strongly supported and ready to affect the filing package.

### 2. Review
Potentially valid but requires human CPA/reviewer judgment, stronger authority, more facts, or disclosure review before use.

### 3. Appendix
Credible, potentially valuable, non-standard ideas that should be preserved for CPA review but must not silently affect the return.

Include appendix items only if they are:
- legally plausible
- tied to the client's facts
- supported by at least some real authority or credible interpretive path
- material enough to matter

### 4. Reject
Ideas that are clearly not supportable, not relevant, contradicted by authority, too speculative, or too weak to show to a reviewer.

The appendix must not become a junk drawer.

## Start-Path Doctrine
Tina's first obligation on every file is to start on the correct tax path.

She must be able to reason about:
- who the tax owners were during the year
- whether there was ever more than one owner
- whether an entity election was in effect
- whether ownership changed during the year
- whether partnership-style economics, buyouts, redemptions, or unusual payouts exist
- whether there are special fact patterns that change treatment

If Tina cannot determine the correct starting path with strong support, she must fail closed, explain why, and route the file to review instead of guessing.

The goal is not just to prepare the return. The goal is to classify correctly, build correctly, optimize correctly, and hand off a package that feels substantially complete on first review.

## Current Product Truth
Tina already has strong foundation work:
- intake and owner workspace
- document vault and reading
- source facts
- issue queue
- cleanup plan
- workpapers
- tax adjustments
- reviewer-final layer
- first Schedule C draft
- package readiness
- first CPA handoff/export

But Tina is not done.

Current structural gaps:
- workspace still relies too heavily on one draft blob
- only one supported lane is real
- QuickBooks sync is not fully live
- final reviewer signoff architecture is incomplete
- package snapshots and durable audit state are not fully mature
- status/story still overstates maturity if presented too confidently

## V1 Product Boundary
Tina's first-class supported lane is:

- `schedule_c_single_member_llc`

Do not expand entity support until this lane is:
- genuinely defensible
- deeply adversarially tested
- easy for owners
- fast for reviewers
- auditable end to end

Direct IRS e-file stays out of scope for now.

## Architecture Goals
Tina should move from a draft-centric prototype to a durable tax system with:
- real Tina persistence tables
- stable IDs and audit trails
- immutable package snapshots
- reviewer decisions and signoff records
- source-to-number traceability
- ingestion that includes both uploaded papers and bookkeeping data
- observable run status and failure states

## UX Goals
Tina should feel like two clean modes:

### Owner mode
- simple language
- one step at a time
- upload papers
- answer easy questions
- resolve missing items
- no reviewer clutter by default

### Reviewer mode
- inspect facts
- inspect issues
- inspect authority
- inspect workpapers
- inspect overrides
- inspect appendix opportunities
- approve or reject positions clearly

## Non-Negotiable Guardrails
- Never invent authority.
- Never silently apply weak positions.
- Never hide uncertainty.
- Never bury a potentially valuable but plausible tax idea if it belongs in review or appendix.
- Never flood the reviewer with garbage ideas.
- Never let unsupported ideas flow into the filing package automatically.
- Every final package number must be explainable.

## What Needs To Be Built Next
Priority order:

1. Durable Tina data model and migration off the single draft blob
2. Reviewer signoff and immutable package snapshot flow
3. Stronger Schedule C edge-case handling and fail-closed tax logic
4. Real QuickBooks connection/sync foundation
5. Better package export set with source index, workpapers, issue log, authority, and appendix
6. Trust/observability/status surfaces that tell the truth about maturity
7. Deep adversarial testing against weird real-world small-business scenarios

## Testing Standard
Tina should not be judged by happy-path demos.

She needs:
- adversarial tax tests
- contradictory evidence tests
- mixed personal/business contamination tests
- owner draw vs expense confusion tests
- intercompany leakage tests
- unsupported depreciation tests
- incomplete records tests
- weird-but-legal tax opportunity tests
- appendix filtering tests
- reviewer traceability tests
- owner UX simplicity tests

## Final Standard
Tina wins if:
- a business owner can actually get through the process
- a skeptical CPA can review the package without guessing
- the system finds real savings opportunities others miss
- the final output is more explainable and defensible than ordinary prep
