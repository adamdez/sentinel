# Tina Readiness Audit Log

Last updated: 2026-04-02

This file is the running anchor for adversarial Tina readiness work.
Use it to resume without relying on chat history.

## Goal

Ship Tina with deterministic, authority-backed behavior suitable for real business-tax prep,
without adding fake safety blocks when evidence is ambiguous.

## Completed in this pass

1. Research authority classification hardened:
- Added `ustaxcourt.gov`, `treasury.gov`, and `federalregister.gov` as primary-authority domains in
  [research-policy.ts](/C:/Users/adamd/Desktop/Sentinel/src/tina/lib/research-policy.ts).

2. Shelter-like guardrail fixed:
- Tina no longer auto-allows return impact for shelter-like ideas.
- Behavior now routes to elevated human review and keeps `allowReturnImpact=false`.

3. Issue queue clue handling improved:
- Replaced first-hit label reads with aggregated matching for key clues.
- Added mixed-year books detection (`books-multi-year-mix`) when target year is present but other years are also present.
- Mixed-year remains `needs_attention` (not hard block) to avoid over-strict false stops.

4. Regression coverage expanded:
- Added tests for:
  - U.S. Tax Court / Treasury / Federal Register authority classification
  - shelter-like no-auto-impact behavior
  - mixed-year positive detection
  - mixed-year false-positive prevention
  - Idaho state clue detection across multiple clue facts
  - Treasury/Federal Register domain classification
  - money-clue scale mismatch detection (extreme ratio)
  - no false-positive on normal money variance

5. False-ready prevention hardened:
- Package readiness now blocks if either bootstrap review or issue queue is not current (`status !== complete`),
  so stale/idle review layers cannot accidentally produce `ready_for_cpa`.

6. Added adversarial gauntlet tests:
- New suite in [adversarial-gauntlet.test.ts](/C:/Users/adamd/Desktop/Sentinel/src/tina/__tests__/adversarial-gauntlet.test.ts) covers:
  - stacked contradiction detection
  - no over-blocking on clean facts
  - false-ready prevention when issue queue contains open contradictions

7. Added repeatable test commands:
- `npm run test:tina`
- `npm run test:tina:adversarial`

8. Anti-overstrict refinement:
- Package readiness now ignores `watch`-severity issue-queue items so low-confidence clues do not downgrade a package by themselves.
- `watch` remains visible in issue triage but does not block `ready_for_cpa` unless stronger signals exist.

9. Unusual-opportunity discovery expanded:
- Tina now seeds additional legal opportunity lanes in research ideas:
  - self-employed retirement optimization
  - self-employed health insurance deduction review
  - startup/organizational costs (when formation year matches tax year)
  - de minimis capitalization safe harbor
  - explicit fringe-opportunities scan for lesser-known legal federal + WA opportunities
- All new lanes remain authority-gated and research-only until primary support is established.

10. Real-estate advanced lane expansion:
- Tina now adds real-estate-heavy advanced research lanes when business profile suggests real-estate/wholesale operations:
  - dealer vs investor characterization
  - installment/imputed-interest treatment
  - real-property repair vs improvement treatment (with fixed-asset activity)
- Non-real-estate profiles are explicitly tested to avoid false-positive lane injection.

11. Primary-authority conflict gate hardened:
- Tina now force-downgrades mixed primary-authority outcomes (both support and warning) to:
  - `status=researching`
  - `reviewerDecision=need_more_support`
- Conflict also injects explicit missing-authority language requiring human resolution before return impact.
- Added dedicated regression coverage in
  [research-runner.test.ts](/C:/Users/adamd/Desktop/Sentinel/src/tina/__tests__/research-runner.test.ts)
  for:
  - missing API key fail-fast behavior
  - primary authority conflict containment
  - secondary-support downgrading to background evidence

12. Zero-vs-positive money mismatch loophole closed:
- Tina now treats `0` vs large positive money clues as a potential scale/import anomaly instead of ignoring it.
- Added regression coverage in
  [issue-queue.test.ts](/C:/Users/adamd/Desktop/Sentinel/src/tina/__tests__/issue-queue.test.ts)
  for:
  - zero-vs-large mismatch detection
  - single-clue false-positive prevention

## Current verification status

- Targeted tests pass:
  - `src/tina/__tests__/issue-queue.test.ts`
  - `src/tina/__tests__/research-policy.test.ts`
- Full Tina test suite passes:
  - `npx vitest run src/tina/__tests__`
  - `npm run test:tina`
- Adversarial command passes:
  - `npm run test:tina:adversarial`
- Current full Tina count: `23` files, `99` tests passing.
- Typecheck passes:
  - `npm run typecheck`

## Remaining high-value adversarial work

1. Synthetic document gauntlet (multi-file, cross-contradictory):
- Prior return hints one entity, organizer states another, books show third pattern.
- Verify Tina consistently escalates without silently downgrading conflicts.

2. Amount plausibility tests:
- Very large outlier swings across docs (e.g., one import with accidental extra zeros).
- Ensure Tina flags for review rather than carrying bad numbers forward.

3. Authority evidence stress tests:
- Mixed source classes with conflicting conclusions.
- Ensure no path lets low-trust/community-only evidence affect return values.

4. End-to-end workspace simulation tests:
- Build from uploaded docs -> source facts -> issue queue -> tax adjustments -> package readiness.
- Confirm no false `ready_for_cpa` on contradictory/edge data.

## Guardrail principle (do not violate)

- Hard block only when:
  - filing lane is unsupported, or
  - deterministic data/authority prerequisites are missing for safe progression.
- Use `needs_attention` for ambiguous-but-plausible situations.
- Every block/review signal should be explainable from facts or authority, not generic caution.
