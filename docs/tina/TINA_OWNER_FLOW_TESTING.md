# Tina Owner Flow Testing

This is the persistent guide for testing Tina the way a business owner would actually use her.

## Goal

The Tina owner flow should feel simple enough that a young child could follow the instructions with an adult holding the papers.

That means:

- one clear next step at a time
- very few asks shown at once
- plain words before tax jargon
- uploads and buttons that match the real task, not generic placeholder copy
- deeper CPA and reviewer tools hidden until the owner needs them

## Reusable Test Assets

### Dev login

- local-only login profile: `Tina Tester`
- email: `tina.tester@example.com`
- setup script: [scripts/ensure-tina-test-user.mjs](C:\Users\adamd\Desktop\Sentinel\scripts\ensure-tina-test-user.mjs)
- the owner-flow harness now prefers programmatic tester-session seeding, so it can run against a built production-style server even when the dev-only `Tina Tester` button is not visible
- signed-out Tina routes now preserve Tina intent and land on `/login?product=tina&next=/tina` with Tina-branded sign-in copy instead of the generic Sentinel login wording

Run:

```powershell
node scripts/ensure-tina-test-user.mjs
```

### Fixture pack

- fixture builder: [scripts/build-tina-fixture-pack.py](C:\Users\adamd\Desktop\Sentinel\scripts\build-tina-fixture-pack.py)
- output folders:
  - [e2e/fixtures/tina/clean-sole-prop](C:\Users\adamd\Desktop\Sentinel\e2e\fixtures\tina\clean-sole-prop)
  - [e2e/fixtures/tina/messy-books](C:\Users\adamd\Desktop\Sentinel\e2e\fixtures\tina\messy-books)
  - [e2e/fixtures/tina/fringe-opportunities](C:\Users\adamd\Desktop\Sentinel\e2e\fixtures\tina\fringe-opportunities)
  - [e2e/fixtures/tina/llc-s-corp-paper-first](C:\Users\adamd\Desktop\Sentinel\e2e\fixtures\tina\llc-s-corp-paper-first)
  - [e2e/fixtures/tina/llc-partnership-paper-first](C:\Users\adamd\Desktop\Sentinel\e2e\fixtures\tina\llc-partnership-paper-first)
  - [e2e/fixtures/tina/llc-community-property-paper-first](C:\Users\adamd\Desktop\Sentinel\e2e\fixtures\tina\llc-community-property-paper-first)
  - [e2e/fixtures/tina/llc-c-corp-paper-first](C:\Users\adamd\Desktop\Sentinel\e2e\fixtures\tina\llc-c-corp-paper-first)
  - [e2e/fixtures/tina/llc-s-corp-conflict](C:\Users\adamd\Desktop\Sentinel\e2e\fixtures\tina\llc-s-corp-conflict)

Run:

```powershell
python scripts/build-tina-fixture-pack.py
```

Included files:

- `prior-return-2024.pdf`
- `2025-profit-loss.csv`
- `2025-general-ledger.xlsx`
- `2025-bank-summary.csv`
- `truck-fuel-receipt.png`

Messy-books pack:

- `prior-return-2024.pdf`
- `2025-quickbooks-january-june.csv`
- `2025-bank-summary-messy.csv`
- `2025-general-ledger-messy.xlsx`
- `warehouse-box-receipt.png`

Fringe-opportunities pack:

- `prior-return-2024.pdf`
- `2025-fringe-books.csv`
- `2025-fringe-bank-summary.csv`
- `2025-fringe-ledger.xlsx`
- `equipment-invoice.png`

LLC paper-first pack:

- `prior-return-2024.pdf`
- `2025-profit-loss.csv`
- `2025-bank-summary.csv`
- `2025-general-ledger.xlsx`
- saved-paper clues that point to `1120-S / LLC Taxed as S-Corp`

LLC partnership paper-first pack:

- `prior-return-2024.pdf`
- `2025-profit-loss.csv`
- `2025-bank-summary.csv`
- `2025-general-ledger.xlsx`
- saved-paper clues that point to `1065 / Multi-Member LLC`

LLC community-property paper-first pack:

- `prior-return-2024.pdf`
- `2025-profit-loss.csv`
- `2025-bank-summary.csv`
- `2025-general-ledger.xlsx`
- saved-paper clues that point to `Schedule C / Community-Property Spouse LLC`

LLC C-corp paper-first pack:

- `prior-return-2024.pdf`
- `2025-profit-loss.csv`
- `2025-bank-summary.csv`
- `2025-general-ledger.xlsx`
- saved-paper clues that point to `1120 / LLC Taxed as Corporation`

LLC S-corp conflict pack:

- `prior-return-2024.pdf`
- `2025-profit-loss.csv`
- `2025-bank-summary.csv`
- `2025-general-ledger.xlsx`
- owner answer says `Schedule C / Owner Return LLC`
- saved-paper clues point to `1120-S / LLC Taxed as S-Corp`

### Owner-flow harness

- owner-flow script: [scripts/tina-owner-flow-check.mjs](C:\Users\adamd\Desktop\Sentinel\scripts\tina-owner-flow-check.mjs)
- output folder: [output/playwright/tina-owner-flow](C:\Users\adamd\Desktop\Sentinel\output\playwright\tina-owner-flow)

Run:

```powershell
$env:BASE_URL='http://127.0.0.1:3000'
$env:TINA_TEST_PASSWORD='Tina-Test-Only-2026!'
node scripts/tina-owner-flow-check.mjs
```

To run the messy-books owner flow:

```powershell
$env:BASE_URL='http://127.0.0.1:3001'
$env:TINA_TEST_PASSWORD='Tina-Test-Only-2026!'
$env:TINA_FIXTURE_SET='messy-books'
node scripts/tina-owner-flow-check.mjs
```

To run the LLC S-corp paper-first owner flow:

```powershell
$env:BASE_URL='http://127.0.0.1:3103'
$env:TINA_TEST_PASSWORD='Tina-Test-Only-2026!'
$env:TINA_FIXTURE_SET='llc-s-corp-paper-first'
node scripts/tina-owner-flow-check.mjs
```

To run the LLC partnership paper-first owner flow:

```powershell
$env:BASE_URL='http://127.0.0.1:3103'
$env:TINA_TEST_PASSWORD='Tina-Test-Only-2026!'
$env:TINA_FIXTURE_SET='llc-partnership-paper-first'
node scripts/tina-owner-flow-check.mjs
```

To run the LLC community-property paper-first owner flow:

```powershell
$env:BASE_URL='http://127.0.0.1:3103'
$env:TINA_TEST_PASSWORD='Tina-Test-Only-2026!'
$env:TINA_FIXTURE_SET='llc-community-property-paper-first'
node scripts/tina-owner-flow-check.mjs
```

To run the LLC C-corp paper-first owner flow:

```powershell
$env:BASE_URL='http://127.0.0.1:3103'
$env:TINA_TEST_PASSWORD='Tina-Test-Only-2026!'
$env:TINA_FIXTURE_SET='llc-c-corp-paper-first'
node scripts/tina-owner-flow-check.mjs
```

To run the LLC S-corp conflict owner flow:

```powershell
$env:BASE_URL='http://127.0.0.1:3103'
$env:TINA_TEST_PASSWORD='Tina-Test-Only-2026!'
$env:TINA_FIXTURE_SET='llc-s-corp-conflict'
node scripts/tina-owner-flow-check.mjs
```

Artifacts produced:

- `01-initial.png`
- `02-after-basic-answers.png`
- `03-after-reading-papers.png`
- `04-after-review-passes.png`
- `summary.md`

## Latest Findings

### March 28, 2026

The LLC S-corp paper-first synthetic owner journey completed through:

- normal Sentinel login
- Tina landing screen
- prior-year return upload
- easy business questions with the LLC tax-path left unanswered
- QuickBooks/P&L upload
- bank-support upload
- document reading
- books sorting
- deeper setup + conflict review

What this run proved:

- Tina inferred `1120-S / LLC Taxed as S-Corp` from the saved papers instead of making the owner answer the LLC tax-path question again.
- Tina kept the owner-facing list to `1` visible ask after reading the core papers.
- The duplicate ask `Answer the LLC tax question` stayed hidden, which is the correct calm-owner behavior for this fixture.
- Tina now leaves only one honest reviewer step visible: `Review this with Tina`.
- Tina still finished the deeper setup and conflict review passes without breaking the main owner flow.

Artifacts for that run live in:

- [output/playwright/tina-owner-flow/llc-s-corp-paper-first](C:\Users\adamd\Desktop\Sentinel\output\playwright\tina-owner-flow\llc-s-corp-paper-first)

The LLC partnership paper-first synthetic owner journey also completed through:

- normal Sentinel login
- Tina landing screen
- prior-year return upload
- easy business questions with the LLC tax-path left on unsure
- QuickBooks/P&L upload
- bank-support upload
- document reading
- books sorting
- deeper setup + conflict review

What this run proved:

- Tina inferred `1065 / Multi-Member LLC` from the saved papers instead of making the owner answer the LLC tax-path question again.
- Tina kept the owner-facing list to `1` visible ask after reading the core papers.
- The duplicate ask `Answer the LLC tax question` stayed hidden here too.
- Tina now leaves only one honest reviewer step visible: `Review this with Tina`.

Artifacts for that run live in:

- [output/playwright/tina-owner-flow/llc-partnership-paper-first](C:\Users\adamd\Desktop\Sentinel\output\playwright\tina-owner-flow\llc-partnership-paper-first)

The LLC community-property paper-first synthetic owner journey also completed through:

- normal Sentinel login
- Tina landing screen
- prior-year return upload
- easy business questions with the LLC tax-path left on unsure
- QuickBooks/P&L upload
- bank-support upload
- document reading
- books sorting
- deeper setup + conflict review

What this run proved:

- Tina inferred `Schedule C / Community-Property Spouse LLC` from the saved papers instead of making the owner answer either LLC follow-up question.
- Tina kept the owner-facing list to `0` visible asks after reading the core papers.
- Both duplicate asks stayed hidden: `How this LLC files with the IRS` and `Whether only spouses own this LLC in a community-property state`.
- Tina kept the deeper setup and conflict review work out of the owner path unless intentionally opened.

Artifacts for that run live in:

- [output/playwright/tina-owner-flow/llc-community-property-paper-first](C:\Users\adamd\Desktop\Sentinel\output\playwright\tina-owner-flow\llc-community-property-paper-first)

The LLC C-corp paper-first synthetic owner journey also completed through:

- normal Sentinel login
- Tina landing screen
- prior-year return upload
- easy business questions with the LLC tax-path left on the normal default
- QuickBooks/P&L upload
- bank-support upload
- document reading
- books sorting
- deeper setup + conflict review

What this run proved:

- Tina inferred `1120 / LLC Taxed as Corporation` from the saved papers instead of making the owner answer the LLC tax-path question again.
- Tina kept the owner-facing list to `1` visible ask after reading the core papers.
- The duplicate ask `How this LLC files with the IRS` stayed hidden here too.
- Tina left only one honest reviewer step visible: `Review this with Tina`.
- Tina stayed calm and fail-closed when the saved papers pointed outside the supported owner-return lane.

Artifacts for that run live in:

- [output/playwright/tina-owner-flow/llc-c-corp-paper-first](C:\Users\adamd\Desktop\Sentinel\output\playwright\tina-owner-flow\llc-c-corp-paper-first)

The LLC S-corp conflict synthetic owner journey also completed through:

- normal Sentinel login
- Tina landing screen
- prior-year return upload
- easy business questions with the owner explicitly leaving the LLC on the owner-return path
- QuickBooks/P&L upload
- bank-support upload
- document reading
- books sorting
- deeper setup + conflict review

What this run proved:

- Tina did not silently override the owner’s explicit LLC answer just because the saved papers pointed to an S-corp election.
- Tina kept the visible owner ask list to `1` calm review step after reading the core papers and still `1` after the deeper review passes.
- That single visible step was `Review this with Tina`, which is the right level of owner-facing escalation for this mismatch.
- Tina kept the current recommendation on `Schedule C / Owner Return LLC` until a human resolves the mismatch.
- The deeper conflict lane still caught the problem and showed `2` blocking conflicts with the filing-lane record marked as needing review.
- Tina kept that disagreement to one plain-language review ask instead of dumping extra tax-path questions into the main flow.

Artifacts for that run live in:

- [output/playwright/tina-owner-flow/llc-s-corp-conflict](C:\Users\adamd\Desktop\Sentinel\output\playwright\tina-owner-flow\llc-s-corp-conflict)

### March 27, 2026

The first full synthetic owner journey completed through:

- normal Sentinel login
- Tina landing screen
- prior-year return upload
- easy business questions
- QuickBooks/P&L upload
- bank-support upload
- document reading
- books sorting
- setup review
- conflict review

What improved from this pass:

- Tina now shows a `Today with Tina` focus card with one main next action.
- Tina now caps the visible ask list to the next 3 items and explicitly says the rest can wait.
- Tina now uses task-matching button copy like `Add last year's return`, `Add QuickBooks or P&L`, and `Add bank statements`.
- Tina now hides deeper review machinery behind `Show deeper Tina tools` by default.
- After the core papers were uploaded, Tina showed `0` visible next-action buttons, which is the right calm behavior for this clean fixture.

The messy-books synthetic owner journey also completed through the same path using:

- prior return
- partial-year books
- messy bank support
- Tina document reads
- Tina books sorting
- deeper setup + conflict review

What held up well in the messy run:

- Tina still kept the owner-facing ask list short.
- Tina turned the messy clues into a simple next ask instead of dumping every problem on the owner at once.
- Tina now uses the same calm first-screen flow to ask for the next likely missing paper, such as contractor papers when the books hint at contractor payments.
- Tina now explains why she is asking: normal starter step, paper clue, or fuller-year books fix.
- Tina still keeps the deeper CPA and review machinery behind the optional tools area.

Artifacts for that run live in:

- [output/playwright/tina-owner-flow/messy-books](C:\Users\adamd\Desktop\Sentinel\output\playwright\tina-owner-flow\messy-books)

The new fringe-opportunities pack is for a different question:

- can Tina surface more obscure legal-saving leads without the owner asking
- can Tina separate likely-usable ideas from noisy or weak ones
- can Tina keep the owner-facing flow simple while the deeper tax-strategy work happens behind the scenes

## What To Watch In Future Runs

- Does Tina ever show more than 3 owner asks at once on the main screen?
- Do any non-upload tasks still use upload-style button copy?
- Does the focus card ever disagree with the short ask list?
- Does Tina ask for the same paper in two confusing ways?
- Does Tina explain why the next ask matters in plain language?
- Do the deeper review tools stay hidden until the owner intentionally opens them?
- Does the first screen still feel calm on mobile after more cards are added?
