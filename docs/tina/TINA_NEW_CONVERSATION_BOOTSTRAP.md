# Tina New Conversation Bootstrap

Last updated: 2026-03-30

Use this document to start a fresh GPT-5.4 conversation without depending on old chat history.

## Source Of Truth

Read these first in the new conversation:

- `docs/tina/TINA_V1_BUILD_GUIDE.md`
- `docs/tina/TINA_OWNER_FLOW_TESTING.md`
- `docs/tina/TINA_RESEARCH_POLICY.md`
- `docs/tina/TINA_NEW_CONVERSATION_BOOTSTRAP.md`

Treat the repo docs, code, and test artifacts as truth.
Do not treat old chat messages as truth.

## Exact Bootstrap Prompt

Paste this into the new GPT-5.4 conversation:

```text
You are continuing work on Tina inside the Sentinel repo at C:\Users\adamd\Desktop\Sentinel.

Tina is a private business-tax workspace inside Sentinel, designed to be separable enough to extract later into a standalone product.

Before doing anything else, read these repo docs as the source of truth:
- C:\Users\adamd\Desktop\Sentinel\docs\tina\TINA_V1_BUILD_GUIDE.md
- C:\Users\adamd\Desktop\Sentinel\docs\tina\TINA_OWNER_FLOW_TESTING.md
- C:\Users\adamd\Desktop\Sentinel\docs\tina\TINA_RESEARCH_POLICY.md
- C:\Users\adamd\Desktop\Sentinel\docs\tina\TINA_NEW_CONVERSATION_BOOTSTRAP.md

Important product rules:
- Tina must be simple enough that a smart 8-year-old could follow the owner flow with an adult holding the documents.
- The main flow must stay calm, plain-language, and show very few asks at once.
- Deeper CPA/reviewer machinery should stay out of the owner's way until intentionally opened.
- GPT-5.4 is Tina's primary AI brain for extraction, research, reconciliation, and explanations.
- Deterministic code must own tax math, readiness gates, traceability, and anything that should not be improvised.
- Tina may search broadly for ideas, including fringe leads, but only primary authority can support positions that affect the return.
- Tina should automatically surface useful tax opportunities without the owner needing to ask.
- Tina should also stress-test those ideas and kill weak ones before they reach the return.

Current implementation status:
- Tina has a strong end-to-end foundation: intake, document vault, source facts, issue queue, workpapers, cleanup, tax adjustments, reviewer-final, Schedule C draft, package readiness, CPA packet, official-form packet, saved packet history, packet-bound final signoff, books intake, and IRS support gating for the supported federal lane.
- The Tina unit/integration test suite currently passes.
- Owner-flow browser testing for clean, messy, and LLC paper-first synthetic businesses passed earlier.
- Tina now has a shared IRS authority manifest, a live watcher script, a visible IRS freshness-watch status in the official-form workspace card, and server-side blockers when a changed or failed watch needs review, but annual recertification is not fully automated yet.
- The newest research-flow work now includes source-fact-driven fringe surfacing from uploaded books, a server-owned queue-drain route, a short-heartbeat background-dispatch loop for deeper GPT-5.4 runs, per-dossier request timeouts, stale-tab save rejection, and orphaned-background-job write guards. The deepest research/challenge passes are still operationally heavy, but the browser no longer has to hold a single `/process-queue` request open for 12 to 14 minutes at a time.

Latest verified results:
- `npx vitest run src/tina/__tests__` passed `233/233` on 2026-03-30.
- `npm run typecheck` passed on 2026-03-30.
- `npm run tina:irs-watch` completed on 2026-03-28 with `18/18` IRS sources reachable and `0` failed checks.
- Clean owner flow summary:
  C:\Users\adamd\Desktop\Sentinel\output\playwright\tina-owner-flow\summary.md
- Messy owner flow summary:
  C:\Users\adamd\Desktop\Sentinel\output\playwright\tina-owner-flow\messy-books\summary.md
- Fringe research-flow summary:
  C:\Users\adamd\Desktop\Sentinel\output\playwright\tina-research-flow\fringe-opportunities\summary.md
- IRS watch summary:
  C:\Users\adamd\Desktop\Sentinel\output\tina-irs-authority-watch\summary.md
- Research-flow screenshots/artifacts now include a completed shared-queue fringe run under:
  C:\Users\adamd\Desktop\Sentinel\output\playwright\tina-research-flow

Important recent findings:
- Tina does automatically surface research opportunities from the facts and uploads.
- In live messy-business runs, Tina surfaced Washington and multistate research cards on her own.
- Deep research memos needed larger parser limits, which were already increased.
- Research and challenge routes now surface rate limits as `429` instead of generic `500`.
- Saved packet exports and final signoff are now pinned to packet content on the server instead of trusting stale browser state.
- Tina now has a curated IRS registry, an owner-facing IRS support check, a visible IRS freshness-watch status, and actual readiness/export blockers when the latest watch needs review.
- Tina now has a server-owned deeper research queue-drain route, a single workspace queue heartbeat, and a research harness that polls that shared queue instead of driving idea-specific `process` calls directly.
- Authority research and challenge routes now reload the latest saved workspace before persisting finished results, so long GPT runs are less likely to overwrite newer owner edits.
- Challenge output now trims overlong warning/question bullets before saving, so GPT-5.4 challenge passes are less likely to die on oversized reviewer text.
- A later 2026-03-29 live fringe rerun proved the surfacing fix: Tina now auto-surfaces fixed-asset, repair-safe-harbor, and de minimis cards from uploaded books without the owner needing to check the organizer box first.
- That same later rerun also proved the queue-behavior fix: after the background-dispatch refactor, `/api/tina/research/process-queue` returned on a short heartbeat in roughly `0.4s` to `3.3s` instead of pinning a browser request for `12` to `14` minutes.
- Tina now also narrows the heaviest fringe asset prompts at runtime and passes linked saved-paper clue lines into GPT-5.4, so the deepest fixed-assets lane starts from a smaller, more concrete fact pattern instead of a generic depreciation survey.
- A later 2026-03-29 bounded-runtime rerun on the fresh production build proved the next operational step: all five surfaced fringe cards now completed their challenge lanes, with fixed-assets, repair-safe-harbor, de minimis, and Washington ending `needs_care`, multistate ending `likely_fails`, and no CPA packet being built.
- The remaining weakness is now more about polish and durability than raw completion: deeper passes are bounded and resumable, but the reviewer-facing memo text can still carry source-side encoding noise and some research memos remain longer than ideal.
- A 2026-03-30 blind owner-first cleanup pass made Tina's shell calmer, removed the internal build-guide leak from the workspace frame, changed signed-out `/tina` redirects to preserve Tina context, and gave the Tina login flow its own private business-tax copy instead of the generic Sentinel wording.
- The owner-flow harness now seeds the Tina tester session directly before falling back to the visual login path, so it works against built production-style servers too.

New fringe fixture pack:
- C:\Users\adamd\Desktop\Sentinel\e2e\fixtures\tina\fringe-opportunities

That pack is intended to test obscure but legal opportunities such as:
- repair vs capitalization safe-harbor treatment
- de minimis/smaller-equipment write-offs
- fixed-asset strategy
- Washington-specific business-tax treatment
- noisy multistate hints that should not all survive review

Current likely next best objectives:
- Decide whether Tina should normalize or strip source-side encoding noise before saving reviewer-facing research memos and citations.
- Decide whether Washington should be auto-killed earlier as a reviewer-note-only state item instead of surviving to `pending` with a narrow federal conclusion.
- Decide whether Tina needs a more durable worker/workflow layer than the current in-process background dispatcher before this ships beyond local/dev usage.
- Decide whether Tina needs a manual "IRS recertified" acknowledgment lane on top of the current automatic watch blockers.

Please inspect the current codebase and continue from the repo state, not from assumptions.
Prefer durable docs, tests, and real harnesses over speculative planning.
```

## Current Reality

Tina is in a good state for a fresh thread.

### Strong current state

- Tina unit/integration suite passes:
  - `npx vitest run src/tina/__tests__`
- Result on 2026-03-30: `233/233`
- Repo typecheck passes:
  - `npm run typecheck`
  - Result on 2026-03-30: pass
- IRS watch run passes:
  - `npm run tina:irs-watch`
  - Result on 2026-03-28: `18/18` sources reachable, `0` failed checks
- Clean owner flow passed
- Clean owner flow passed again on 2026-03-30 after the owner-first shell/login refresh
- Messy owner flow passed
- LLC paper-first owner flows passed for S-corp, partnership, community-property, and C-corp inference cases
- Tina can already auto-surface deeper research ideas from facts and uploaded documents
- Tina now has a shared IRS manifest, live watcher output, owner-facing IRS support messaging, a visible IRS freshness-watch status, and automatic blockers when the latest watch needs review
- Tina now has source-fact-driven fringe surfacing from uploaded books, a server-owned deeper research queue-drain route, a single workspace queue heartbeat, an in-process background dispatcher, and latest-workspace-safe authority result saves
- Tina now also has narrower runtime profiles for the heaviest fringe asset lanes, bounded per-pass request timeouts, and saved-paper grounding lines in the GPT research/challenge prompts
- Tina now rejects stale workspace saves, and the queue route refuses orphaned older background jobs that try to write into a newer workspace run
- Tina now has a completed live shared-queue fringe run plus bounded resume reruns on disk under `output/playwright/tina-research-flow/fringe-opportunities`

### Still-open risk area

The deepest GPT-5.4 research and challenge passes are still operationally heavy.

Observed behavior in live runs and code-backed verification:

- `POST /api/tina/research/run` now completes inside a bounded request window, but can still take several minutes
- `POST /api/tina/research/challenge` now also runs inside a bounded request window, but can still take several minutes
- rate limits can still interrupt long mixed-opportunity runs
- Tina now routes deeper processing through a shared server queue instead of idea-specific browser loops
- a live 2026-03-29 fringe rerun plus later resume reruns finished through that shared queue route
- this still makes the current research lane feel like a background-job candidate rather than a simple foreground button, but it no longer hangs indefinitely on one idea

### What the fresh thread should probably do next

1. Inspect the current IRS registry, watch output, and packet-year gating so the fresh thread starts from the current federal authority truth
2. Read the latest fringe research artifacts and confirm which ideas were surfaced, kept narrow, rejected, or missed entirely
3. Inspect the shared authority queue route, workspace queue poller, and research harness
4. Read the latest fringe research artifacts and confirm the final keep/kill outcomes across all five surfaced cards
5. Decide whether Tina should normalize source-side encoding noise before reviewer-facing memos and exports
6. Decide whether Washington should be auto-demoted to a reviewer note sooner in the federal lane
7. Decide how Tina should turn changed IRS sources into a real recertification workflow instead of only a script artifact

## Key Files And Paths

### Tina docs

- `docs/tina/TINA_V1_BUILD_GUIDE.md`
- `docs/tina/TINA_OWNER_FLOW_TESTING.md`
- `docs/tina/TINA_RESEARCH_POLICY.md`
- `docs/tina/TINA_NEW_CONVERSATION_BOOTSTRAP.md`

### IRS freshness files

- `src/tina/data/irs-authority-registry.json`
- `src/tina/lib/irs-authority-registry.ts`
- `scripts/tina-irs-authority-watch.mjs`
- `output/tina-irs-authority-watch/summary.md`

### Tina harnesses and fixtures

- `scripts/ensure-tina-test-user.mjs`
- `scripts/build-tina-fixture-pack.py`
- `scripts/tina-owner-flow-check.mjs`
- `scripts/tina-research-flow-check.mjs`
- `e2e/fixtures/tina/clean-sole-prop`
- `e2e/fixtures/tina/messy-books`
- `e2e/fixtures/tina/fringe-opportunities`

### Main research logic

- `src/tina/lib/research-ideas.ts`
- `src/tina/lib/research-policy.ts`
- `src/tina/lib/research-runner.ts`
- `src/tina/lib/research-challenger.ts`
- `src/tina/lib/authority-queue.ts`
- `src/tina/lib/authority-work.ts`
- `src/app/api/tina/research/run/route.ts`
- `src/app/api/tina/research/challenge/route.ts`
- `src/app/api/tina/research/process-queue/route.ts`

### Main IRS authority logic

- `src/tina/lib/official-form-coverage.ts`
- `src/tina/lib/official-form-packet.ts`
- `src/app/api/tina/official-forms/export/route.ts`
- `src/app/api/tina/official-forms/pdf/route.ts`

### Main Tina UI path

- `src/tina/components/tina-workspace.tsx`
- `src/tina/components/tina-shell.tsx`
- `src/tina/hooks/use-tina-draft.ts`

## Most Recent Test Notes

### Clean owner flow

Source:

- `output/playwright/tina-owner-flow/summary.md`

Result:

- normal login passed
- prior-year upload passed
- easy intake questions passed
- books upload passed
- bank-support upload passed
- reading papers passed
- books sorting passed
- setup review passed
- conflict review passed
- visible next-action buttons after core uploads: `0`

### Messy owner flow

Source:

- `output/playwright/tina-owner-flow/messy-books/summary.md`

Result:

- same base flow passed
- Tina still kept the owner asks short
- Tina turned messy clues into a simple next ask
- Tina surfaced contractor-related follow-up instead of dumping everything at once

### IRS watch

Source:

- `output/tina-irs-authority-watch/summary.md`

Result:

- all 18 watched IRS sources were reachable
- 0 failed checks
- 0 changed sources relative to the immediately previous stored run
- Tina now has a real watch artifact to support annual recertification

### Research flow

Current state:

- a 2026-03-29 live fringe rerun now proves that Tina auto-surfaces fixed-asset, repair, and de minimis cards from uploaded books
- a 2026-03-29 live resume proof now shows `/api/tina/research/process-queue` returning in roughly `0.4s` to `3.3s` on a short heartbeat instead of hanging the browser for `12` to `14` minutes
- the heaviest fringe lanes now run with narrower runtime search profiles, linked saved-paper grounding lines, and bounded request timeouts
- later 2026-03-29 fresh-build and resume reruns completed all five fringe challenge lanes successfully instead of leaving the asset cards stuck in `did_not_finish`
- later 2026-03-29 cleanup passes now normalize saved authority text on both write and workspace load, so fresh fringe artifacts no longer carry the earlier stray `服务` fragment or smart-quote noise
- later 2026-03-29 state-gate cleanup now marks saved `do_not_use` authority items as `rejected` instead of leaving them looking half-alive in `ready_for_reviewer`
- still not fast enough to feel like a lightweight foreground action, and older saved memos may still need a targeted rerun if prompt/runtime behavior changed after they were first written

Latest live fringe result:

- earlier completed shared-queue run: Tina surfaced Washington and multistate, kept Washington narrow, rejected multistate adjustments, and built no CPA packet
- later surfacing rerun: Tina auto-surfaced all five expected fringe cards, including fixed-asset, repair-safe-harbor, and de minimis
- later fresh-build and resume reruns: all five challenge lanes completed; fixed-assets, repair-safe-harbor, and de minimis ended `needs_care` with reviewer `pending`; Washington ended reviewer `do_not_use` plus work status `rejected` plus challenge `needs_care`; multistate ended reviewer `do_not_use` plus work status `rejected` plus challenge `likely_fails`; no CPA packet was built
- the saved small-equipment challenge lane was explicitly rerun on 2026-03-29 after the text-cleanup work, and the earlier broken memo stub was replaced with a cleaner item-by-item federal analysis

Known lessons from those runs:

- parser limits for research memos needed to grow
- rate-limit handling needed to become explicit
- source-fact-driven spreadsheet clues were the missing piece for fringe-opportunity surfacing
- shared queue orchestration, workspace-safe saves, preference retries, and short-heartbeat background dispatch materially improved reliability
- narrower runtime profiles, bounded request windows, and saved-paper grounding materially improved challenge completion
- saved authority text should be normalized both when Tina writes it and when she reloads older workspace drafts, because resume-mode artifacts otherwise keep stale rough edges forever
- the main remaining weaknesses are long-run durability and deciding when stale saved memos should be intentionally rerun, not missed surfacing

## Repo Hygiene Notes

- The worktree is still dirty and has a lot of Tina work plus support files.
- Before committing later, pay attention to temp and cache artifacts such as:
  - `tmp/`
  - `scripts/__pycache__/`

## Recommended First Step In The New Conversation

Tell the new GPT-5.4 thread to:

1. Read the Tina docs
2. Inspect the current IRS registry and `output/tina-irs-authority-watch/summary.md`
3. Read `output/playwright/tina-research-flow/fringe-opportunities/summary.md`
4. Inspect the current research routes and `scripts/tina-research-flow-check.mjs`
5. Decide how Tina should improve obscure-opportunity surfacing and whether Washington should be auto-demoted earlier
6. Decide whether Tina should automatically rerun stale saved research memos after prompt/runtime upgrades
7. Decide how Tina should recertify when watched IRS sources change
