# Tina Weird Small-Business Benchmark

This artifact turns a practical list of 25 weird small-business tax situations into a local Tina benchmark that can be run offline first.

## Why it exists

- Tina should be testable against ugly, realistic scenarios without broad web crawling.
- The benchmark is diagnostic first: classification, filings, risk, missing facts, cleanup order, and federal-vs-state separation.
- It is meant to expose reasoning gaps, not to replace primary authority review.

## What is in the benchmark

- 25 weird small-business scenarios
- 5 problem groups:
  - entity and election problems
  - ownership and basis problems
  - worker classification and payroll problems
  - recordkeeping and cleanup problems
  - assets, depreciation, and property problems
- a top-10 priority subset for faster iterative testing
- a standard benchmark prompt template

## How to use it

1. Run Tina offline first against the fact pattern only.
2. Score:
   - likely classification
   - likely filings and forms
   - biggest risk areas
   - missing facts to confirm
   - cleanup steps first
   - federal versus state split
3. Only after the offline pass, use authority review on misses or low-confidence answers.

## Runner

- Catalog route:
  - `/api/tina/weird-small-business-benchmark`
- Offline runner route:
  - `/api/tina/weird-small-business-benchmark-run`

The runner is designed to:

- answer each scenario without web browsing
- score Tina's response against the local expected classification, filing, risk, missing-fact, cleanup, and federal-vs-state signals
- support a top-10 pilot mode before running the full 25-case set
- fall back to Tina's local diagnostic preflight engine when no model key is present, so the benchmark remains runnable offline instead of failing closed
- feed an explicit diagnostic posture into model-backed runs too, so Tina starts from route-sensitive, records-first, compliance-risk, or cleanup-heavy framing instead of blank-prompt improvisation
- keep ranked competing hypotheses alive for classification, filing family, cleanup strategy, and state-boundary pressure instead of collapsing ugly cases into one flat answer too early
- carry a first-class diagnostic lane, filing ladder, and fact-bucket backbone so offline answers can say "worker/payroll compliance", "books reconstruction", "asset support", or "multi-year backlog" without overclaiming a settled entity answer
- reuse the same analogical treatment-and-proof resolver Tina uses in the live treatment layer, so benchmark diagnostics and real packet/policy/unknown-pattern logic share cleanup-first pressure, proof asks, likely form-family hints, and federal-vs-state treatment sensitivity
- carry a first-class entity-ambiguity snapshot so late-election, spouse-owned, transition-year, and ownership-change files keep ranked entity paths and priority proof questions alive instead of flattening too early

## Current offline snapshot

- As of April 5, 2026, after the shared single-member entity-history and transition-year ownership-proof pass, the full offline fallback run is now `91.1 / 100` (`A-`).
- Strongest groups are:
  - recordkeeping and cleanup problems: `95.2`
  - assets, depreciation, and property problems: `94.8`
- Weakest groups are:
  - ownership and basis problems: `84.4`
  - entity and election problems: `89.6`
- The new single-member history backbone materially improved the exact entity-history files it was supposed to fix:
  - `single-member-llc-unclear-tax`: `85` (up from `73`)
  - `entity-changed-books-never-caught-up`: `85` (up from `80`)
- The weakest live scenarios have now shifted:
  - `unequal-owner-contributions`: `72`
  - `midyear-ownership-change`: `75`
  - `s-corp-no-payroll`: `80`
  - `single-member-llc-unclear-tax`: `85`
  - `entity-changed-books-never-caught-up`: `85`
- The new pass materially improved live backend truth, route proof, confidence discipline, document requests, handoff artifacts, and weird-case diagnostics. The remaining real weakness is now ownership-transition and basis rollforward depth rather than single-member route history.
- The practical next benchmark-moving backbone pass is now a shared ownership-transition and basis rollforward engine, so Tina stops fencing uneven owner economics and midyear owner changes without actually resolving them like a veteran reviewer.

## Key rule

This benchmark is designed to measure Tina's raw diagnostic reasoning without making her depend on open-ended web search.

## Diagnostic hypothesis route

- Hypothesis route:
  - `/api/tina/weird-small-business-diagnostic-hypotheses`

This route exposes Tina's ranked weird-case hypotheses directly so benchmark tooling can inspect:

- leading versus alternate classification paths
- cleanup-first versus route-first posture
- the most important proof questions
- when state-law or registration issues can materially change the federal answer
