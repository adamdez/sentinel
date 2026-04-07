# Tina Deliverable Promise And Final-Filing Gaps

Last updated: 2026-04-07

This document draws a hard line between:

- what Tina can be sold as today
- what Tina must not be sold as yet
- what still has to exist before Tina can honestly claim direct filing readiness

This is a delivery document, not a hype document.

## What Tina Can Be Sold As Today

Safe current promise:

Tina is a guarded tax-prep and CPA-handoff system for supported Schedule C style files. She can organize source documents, surface contradictions and missing items, build a supported first Schedule C draft, assemble a CPA review packet, and block stale or weak package states before handoff.

In plain client language:

- Tina can help get your books and tax documents into a review-ready state.
- Tina can organize the evidence behind the return.
- Tina can prepare a first supported Schedule C draft for review.
- Tina can package the file so a CPA or reviewer has a cleaner handoff.
- Tina is designed to stop instead of bluffing when support is weak or the file is not safely ready.

## What Tina Must Not Be Sold As Yet

Do not currently promise:

- direct submission to IRS.gov
- IRS e-file generation
- final filing package completion without human review
- universal business-return coverage
- safe completion of 1120-S or 1065 files
- replacement for CPA, legal, or compliance review

Reason:

The current Tina checkout is still explicitly built around `ready_for_cpa` and `CPA handoff`, not direct filing. The V1 build guide also lists direct IRS e-file and IRS XML generation as non-goals for this build.

## Delivery Language You Can Use Today

Recommended operator-facing line:

"Tina helps prepare and organize supported business tax files, builds a defensible Schedule C draft, and assembles a CPA-ready review packet with source traceability and block/attention checks."

Recommended client-facing line:

"We use Tina to organize your tax documents, reconcile the file, prepare a supported first draft for review, and make sure the handoff package is clean before a human reviewer signs off."

Recommended internal-sales line:

"Tina is currently a guarded preparation and handoff engine, not yet a direct IRS submission engine."

## Delivery Language You Should Avoid

- "Tina files taxes directly with the IRS."
- "Tina finishes the return and it is ready to submit without review."
- "Tina supports all business entity types end to end."
- "Tina replaces a CPA."

## Current Honest Deliverable

Today Tina is closest to this deliverable:

- supported lane: `Schedule C / single-member LLC`
- output class: `review-ready draft and CPA packet`
- trust posture: `fail closed when unsupported, stale, or contradicted`
- human requirement: `CPA or qualified reviewer still needed before final filing`

## What Must Exist Before Tina Can Be Sold As Submission-Ready

These are not polish items. They are delivery blockers.

### 1. Final Federal Filing Package Layer

Must exist:

- full return package assembly beyond the first Schedule C draft
- final signoff screen with explicit filing status
- governed distinction between draft, reviewer-approved, and filing-approved artifacts
- no use of `ready_for_cpa` language where filing-ready language would be implied

Why it matters:

Right now Tina can reach a strong handoff state, but that is still a reviewer-state, not a filing-state.

### 2. Direct E-File Or IRS Submission Layer

Must exist:

- direct e-file workflow or governed export into a real filing system
- form/output generation that matches filing-channel requirements
- submission validation checks
- transmission status handling, rejection handling, and resubmission workflow

Why it matters:

Without this, Tina can help prepare a file but cannot honestly claim she can submit it.

### 3. Multi-Lane Completion

Must exist:

- real `1120-S` support
- real `1065` support
- lane-specific readiness and package rules
- lane-specific return outputs and review packet behavior

Why it matters:

A deliverable tax product cannot claim broad business-return capability while major return families remain future-only.

### 4. Transaction-Level Numeric Proof

Must exist:

- deterministic transaction or ledger tie-out for material numbers
- duplicate detection, coverage detection, contamination control, and unsupported-balance handling
- clear downgrade or block behavior when money stories disagree

Why it matters:

Clients and reviewers need proof of where the numbers came from, not just plausible summaries.

### 5. Position-Level Legal And Reviewer Governance

Must exist:

- durable tax-position memory
- authority hierarchy and disclosure posture on material positions
- reviewer acceptance, revision, and rejection memory tied to those positions
- downstream behavior changes when reviewer trust is weak

Why it matters:

A filing-grade system must remember what was decided, why it was decided, and when a reviewer disagreed.

### 6. Live Acceptance Benchmarking

Must exist:

- real reviewer outcome tracking on live files
- cohort scoring for clean files, messy files, authority-heavy files, and commingled files
- hard rules for when Tina benchmark scores can move up

Why it matters:

Internal tests can prove guardrails. They do not prove repeated real-world reviewer trust.

## Submission-Ready Gate

Tina should not be sold as direct-submission-ready until all of the following are true:

1. Tina can build a complete governed filing package, not only a CPA packet.
2. Tina can transmit or cleanly export to a real filing channel with validation and rejection handling.
3. Tina supports the promised filing lane end to end.
4. Tina can prove material return numbers from source evidence.
5. Tina carries durable position and reviewer memory into final outputs.
6. Tina has live reviewer acceptance evidence strong enough to justify the claim.

## Bottom Line

Tina is deliverable today as a guarded prep-and-handoff tool for supported Schedule C style work.

Tina is not yet deliverable as a direct IRS submission engine.

That line matters because crossing it early would create exactly the kind of trust failure Tina is supposed to prevent.
