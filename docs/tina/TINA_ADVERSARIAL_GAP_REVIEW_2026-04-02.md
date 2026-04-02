# Tina Adversarial Gap Review (2026-04-02)

## Bottom-line verdict

Tina is stronger than a generic intake assistant, but she is **not** "better than a CPA with 100 years of experience" yet.
She is currently a guarded prep system with useful risk detection, not a full autonomous tax authority engine.

## What was still missing (before this pass)

1. No first-class handling for commingled books and entity-boundary chaos.
2. No explicit owner-flow/intercompany/related-party clue extraction from spreadsheet text.
3. No deterministic escalation for multiple EIN references in one package.
4. No dedicated research lanes for intercompany separation and owner-flow characterization.
5. Adversarial gauntlet did not include combined cross-year + cross-entity contamination.

## What this pass added

1. New durable clue extraction from spreadsheet text:
- `Owner draw clue`
- `Intercompany transfer clue`
- `Related-party clue`
- `EIN clue`

2. AI document-reading schema now allows the same clues for non-spreadsheet intake.

3. New issue-queue integrity gates:
- `books-intercompany-transfer-clue` (blocking)
- `books-related-party-clue` (needs_attention)
- `books-owner-flow-clue` (blocking for S-corp/partnership lanes; needs_attention for sole-prop lanes)
- `books-multi-ein-conflict` (blocking)

4. New research "skill lanes":
- `intercompany-separation-review`
- `owner-flow-characterization-review`
- `related-party-transaction-review`
- `multi-entity-boundary-review`

5. Expanded adversarial gauntlet:
- commingled intercompany + owner-flow + multi-EIN hard-block scenario
- combined cross-year + cross-entity conflict retention scenario

6. Profile-drift freshness lock:
- Tina now fingerprints organizer profile state for bootstrap + issue-queue runs.
- Package readiness blocks if those runs were done under an older/different profile state.

7. Overstrictness calibration on weak clues:
- Tina now distinguishes weak-signal contradictions from strong corroborated contradictions.
- Low-confidence return-type/owner-flow/multi-EIN patterns can remain visible as `needs_attention` instead of always forcing hard block.

## Hard truth: what still needs built

### P0 (must-have for "elite CPA" claim)

1. Full filing-lane coverage:
- 1120-S and 1065 draft/readiness paths are not production-complete.

2. Transaction-level tie-out engine:
- Current logic is clue-driven, not full ledger reconciliation with deterministic tie-outs.

3. Basis/capital and owner-account modeling:
- No complete shareholder basis, partner capital, or debt-basis rollforward system.

4. State footprint expansion:
- Current state handling is limited and clue-oriented; no broad multi-state rules engine.

5. Authority-grade position memory:
- No durable matrix that ties each claimed tax position to authority hierarchy, confidence, and disclosure consequence at filing output level.

### P1 (high-value multipliers)

1. Organizer/profile revision tracking:
- Readiness freshness is evidence-driven; profile-change revision hashing should also invalidate stale "complete" states.

2. Cross-entity normalization workflow:
- Needs explicit mechanical flow for entity mapping, intercompany elimination, and return-scope inclusion/exclusion logs.

3. Robust anomaly simulation harness:
- Add fuzzing/generative scenarios for contradictory books, unit-scale errors, and partial-period contamination.

## Current confidence after this pass

1. Tina reliably catches more "wild books" failure modes than before.
2. Tina now blocks readiness in scenarios that previously could appear cleaner than they were.
3. Tina still should be positioned as a high-discipline prep copilot, not an autonomous final tax signer.
