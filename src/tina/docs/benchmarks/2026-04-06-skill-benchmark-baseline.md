# Tina Skill Benchmark Baseline — 2026-04-06

This file is the review baseline for Tina's **16 hard skills** and **10 soft / elite operating skills** in the current checkout at `src/tina`.

## Calibration

- Scale: `0-10`
- `8` = extraordinary 100-year CPA veteran ceiling
- `10` = that ceiling plus AI leverage
- This baseline is intentionally conservative.
- This baseline reflects the **live Tina checkout in this workspace**, not the more advanced Tina feature branch that was pushed separately.

## Why this baseline exists

Other agents should use this file as the current review anchor when asking:

- what Tina is actually good at right now
- what Tina is only partially doing
- what Tina still does not genuinely solve

The current checkout is strongest in:

- supported first-lane routing
- issue surfacing and stop rules
- package readiness structure
- CPA handoff framing
- conservative authority policy

The current checkout is still weak in:

- multi-lane completion
- reviewer learning loops
- override governance
- true final-form execution
- broad messy-evidence reconstruction
- real-world acceptance benchmarking

## 16 Hard Skills

| Skill | Score | Description | Honest read |
|---|---:|---|---|
| Technical Tax Law | 4.5 | Applies tax law, authority thresholds, disclosure needs, and lane-specific rules. | Real authority gating exists, but broad law execution is still limited. |
| Accounting Fluency | 4.2 | Reconstructs books and turns messy accounting inputs into tax-ready numbers. | Some cleanup structure exists, but not ledger-grade accounting truth. |
| Fact-Pattern Judgment | 5.2 | Decides what facts matter, what is missing, and where Tina should stop. | Better at intake triage than deep fact adjudication. |
| Entity and Filing-Path Classification | 5.7 | Chooses the likely return path and knows when support is blocked or future-only. | One of the stronger current skills. |
| Tax Treatment Selection | 4.5 | Proposes and escalates treatments before they reach the return. | Cautious and structured, but still narrow. |
| Record and Evidence Analysis | 5.0 | Reads documents, extracts facts, and ties work back to source evidence. | Solid early strength, not yet deep document intelligence. |
| Risk and Materiality Judgment | 5.1 | Separates dangerous issues from review items and noise. | Conservative, but not yet production-grade across many patterns. |
| Tax Planning and Savings Identification | 3.8 | Finds legitimate tax planning opportunities, not just cleanup work. | Still much more compliance-oriented than planning-oriented. |
| Form and Compliance Execution | 4.7 | Moves from facts to forms, readiness, and filing package logic. | Real first-lane form structure exists, but not broad final execution. |
| Review and Error Detection | 5.3 | Finds missing, stale, or conflicting items before handoff. | One of the better current backend muscles. |
| Documentation and Defensibility | 5.0 | Builds an audit trail a reviewer can follow and defend. | Useful packet/handoff structure exists, but not reviewer-grade across the board. |
| Client Communication | 5.6 | Explains status, blockers, and asks in plain language. | Current Tina communicates clearly and consistently. |
| Workflow and Case Management | 5.8 | Tracks the file through intake, cleanup, review, and handoff. | Arguably the strongest current area. |
| Industry and Scenario Familiarity | 4.0 | Handles varied business models and specialized case patterns. | Still limited outside the early supported lane. |
| Ethics and Professional Responsibility | 6.0 | Refuses weak authority and keeps risky positions under human control. | Current Tina is meaningfully conservative here. |
| Practice Judgment | 4.8 | Behaves like a real practitioner deciding what is ready next. | Good stop rules, still limited scope. |

## 10 Soft / Elite Operating Skills

| Skill | Score | Description | Honest read |
|---|---:|---|---|
| Unknown-Pattern Resolution | 3.8 | Handles unfamiliar patterns without bluffing certainty. | Safer at stopping than resolving. |
| Confidence Calibration | 4.4 | Keeps confidence aligned with evidence and freshness. | Some real gating exists, but not a rich confidence backbone. |
| Reviewer Learning Loop | 2.5 | Learns from reviewer feedback over time. | Barely present in this checkout. |
| True Final-Form Execution | 3.7 | Produces genuinely final, reviewer-trustworthy outputs. | Still closer to structured draft output. |
| Durable Case Memory | 4.6 | Preserves file state and previous work coherently over time. | Workspace draft continuity is real, but still early. |
| Generalization Under Messy Evidence | 4.2 | Keeps functioning under noisy, partial, or conflicting papers. | Better at surfacing issues than resolving the mess. |
| Reviewer-Override Governance | 2.7 | Tracks overrides explicitly and prevents silent drift. | Not yet meaningfully built out. |
| Live Acceptance Testing Against Reality | 2.5 | Measures success against real reviewer outcomes. | No strong live acceptance loop yet. |
| Document-Intelligence Depth | 4.3 | Understands uploaded papers deeply enough to drive downstream work. | Useful extraction exists, but not deep paper truth. |
| Commercial Judgment | 4.4 | Balances correctness, usefulness, and practicality for operators. | Good first-lane discipline, still early overall. |

## Review Guidance For Other Agents

If you update Tina after this benchmark:

1. Do not move scores because a gate passes.
2. Only move a skill if real backend capability changed.
3. Prefer broad engine-level movement over cosmetic improvements.
4. Keep hard-skill and soft-skill scoring separate.
5. Note clearly whether you are scoring this checkout or a different Tina branch.

## Source of truth

Machine-readable companion benchmark:

- `src/tina/data/skill-benchmarks.ts`
