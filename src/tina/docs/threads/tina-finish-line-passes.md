# TINA_FINISH_LINE_PASSES

## Critical Path
1. Tax judgment engine pass
2. Start-path certainty pass
3. Return data model pass
4. Official form mapping pass
5. Government-form PDF and packet bundle pass
6. Form validation and cross-check pass
7. Reviewer signoff plus immutable snapshot pass
8. Evidence-to-number trace pass
9. Messy books normalization pass
10. Schedule C edge-case treatment pass
11. Authority plus appendix closed-loop pass
12. QuickBooks live-source pass
13. Adversarial production-bar test pass
14. Final reviewer package pass
15. Truthful readiness and status pass

## 16-Pass Acceleration Plan
These are the engine-level passes meant to move Tina by whole points, not tenths.

1. Federal Return Classification Engine
Done means Tina determines `1040/Schedule C`, `1065`, `1120-S`, or `1120` from entity facts, elections, prior returns, ownership history, and paper-trail signals every time.

2. Ownership and Capital Event Engine
Done means Tina understands owners, percentages, spouse exceptions, buyouts, redemptions, former-owner payments, and year-of-change files well enough to change route and treatment correctly.

3. Books-to-Tax Reconstruction Engine
Done means Tina reconstructs a tax-safe books picture from messy ledgers, owner flows, mixed-use contamination, payroll versus contractor overlap, fixed assets, and inventory signals.

4. Evidence Sufficiency Engine
Done means every material line gets an evidence-strength score, contradiction awareness, and package-level fail-closed behavior before Tina calls anything reviewer-grade.

5. Tax Treatment Policy Engine
Done means Tina has explicit policy logic for mixed-use, owner draws, payroll versus contractor, depreciation, inventory, sales tax, related-party treatment, and other edge-case handling.

6. Official Federal Form Fill Engine
Done means Tina can map structured return output onto stored official federal blank forms instead of only producing Tina-native draft PDFs.

7. Cross-Form Consistency Engine
Done means Tina reconciles totals, schedules, supporting statements, and reviewer artifacts so final output stays internally consistent.

8. Attachment and Statement Engine
Done means Tina produces the attachment-heavy support real returns need, such as line `27a` detail, depreciation support, inventory statements, and explanatory attachments.

9. Authority and Position Engine
Done means Tina classifies tax positions by support strength, authority quality, disclosure need, and bucket: `use`, `review`, `appendix`, or `reject`.

10. Tax Opportunity Discovery Engine
Done means Tina actively hunts for supportable savings opportunities and preserves the upside, assumptions, and reviewer questions for each one.

11. Industry Playbook Engine
Done means Tina carries reusable scenario judgment for the small-business patterns she will see most: contractors, e-commerce, real estate, restaurants, creators, and service businesses.

12. Skeptical Reviewer Simulation Engine
Done means Tina predicts what a hard CPA reviewer will challenge before the human ever sees the file.

13. Materiality and Priority Engine
Done means Tina knows what blocks filing, what deserves immediate attention, what can stay provisional, and what belongs in appendix.

14. Owner and Reviewer Communication Engine
Done means Tina keeps owner mode simple while making reviewer mode deep, explicit, and decision-ready.

15. Durable Audit Package Engine
Done means Tina preserves immutable snapshots, signoff state, source indexes, workpapers, authority trails, and final packet integrity cleanly.

16. Adversarial Smoke and Gold-Dataset Engine
Done means Tina has brutal saved datasets for weird LLCs, contradictory evidence, ugly books, unusual deductions, and hostile reviewer scenarios, and she keeps surviving them.

## Exact 10-Pass Push
1. Official federal blank-form foundation pass
Done means Tina stores current IRS blank PDFs locally for the supported Schedule C stack and the common wild-LLC routing families (`1065`, `1120-S`, `1120`) so review output can anchor to real federal forms.

2. Official form-template registry pass
Done means Tina publishes one backend registry with tax year, IRS source URL, local asset path, hash, byte length, role, and current fill support for every stored blank form. Cursor can build against this.

3. Official-form delivery pass
Done means Tina can expose blank-template availability and download the stored blank forms through backend routes instead of treating them like hidden repo files.

4. PDF truth and template-foundation pass
Done means Tina's PDF export declares whether it is a Tina draft, a blocked-route notice, or eventually a real form fill, and it names the official blank form foundation it is anchored to.

5. Reviewer bundle official-form pass
Done means Tina's review bundle includes official-form metadata and the primary blank federal form when one is stored for the routed lane.

6. Evidence-threshold hardening pass
Done means a thin-proof file cannot produce a clean-looking package just because a few lines map. Non-zero lines must clear stronger support thresholds.

7. Wild LLC route-proof pass
Done means complex LLC files publish decisive proof needs and contradictions consistently across start path, checklist, packet, bundle, readiness, and smoke artifacts.

8. Unsupported-lane truth pass
Done means blocked or review-only lanes never publish misleading supported-form coverage or validation language that sounds like Tina finished the wrong return.

9. Expanded entity-form foundation pass
Done means Tina holds the right official blank foundations for partnership, S-corp, and C-corp routes even before those lanes are fully auto-filled.

10. Adversarial reviewer smoke pass
Done means Tina can export hard reviewer artifacts and official-form metadata across saved smoke datasets for supported, review-only, and blocked files without maturity bluffing.

## Judgment Engine Pass
This pass is permanent and should never fall out of scope.

Done means Tina can:
- identify the real fact pattern instead of over-trusting organizer labels or bookkeeping labels
- choose the correct starting lane or block safely
- choose the best defensible treatment for material items
- distinguish strong authority from weak authority
- surface worthwhile legal savings opportunities
- predict what a skeptical CPA is likely to challenge
- keep weak positions out of final output automatically

This pass should be measured against the veteran CPA skill categories:
- technical tax law
- accounting fluency
- fact-pattern judgment
- entity and filing-path classification
- tax treatment selection
- record and evidence analysis
- risk and materiality judgment
- tax planning and savings identification
- form and compliance execution
- review and error detection
- documentation and defensibility
- client communication
- workflow and case management
- industry and scenario familiarity
- ethics and professional responsibility
- practice judgment

## Recently Landed
- Tina now has first-wave acceleration engines for federal return classification, ownership and capital events, books-to-tax reconstruction, evidence sufficiency, tax treatment policy, and materiality-priority ranking.
- Tina now exposes those engines through reviewer packet content, review-bundle artifacts, smoke reports, and dedicated Tina backend routes.
- Tina now has second-wave acceleration engines for industry playbooks, tax opportunity scoring, companion-form planning, and cross-form consistency.
- Tina now exposes those second-wave engines through the packet, handoff, review bundle, smoke-report layer, operational-status truth, and dedicated Tina backend routes.
- Tina now has third-wave acceleration engines for official-form fill planning, attachment statements, decision briefings, and tax planning memos.
- Tina now exposes those third-wave engines through the packet, handoff, review bundle, smoke-report layer, operational-status truth, and dedicated Tina backend routes.
- Tina now has fourth-wave acceleration engines for books reconciliation, companion-form calculations, industry evidence matrix, and document request planning.
- Tina now exposes those fourth-wave engines through the packet, handoff, review bundle, smoke-report layer, operational-status truth, form-readiness layer, and dedicated Tina backend routes.
- Tina now has fifth-wave acceleration engines for entity record matrix, entity economics readiness, and entity return runbook.
- Tina now exposes those fifth-wave engines through the packet, handoff, review bundle, smoke-report layer, operational-status truth, document-request planning, and dedicated Tina backend routes.
- Tina now has sixth-wave acceleration engines for authority position matrix, disclosure readiness, and reviewer acceptance forecast.
- Tina now exposes those sixth-wave engines through the packet, handoff, review bundle, smoke-report layer, operational-status truth, form-readiness, document-request planning, and dedicated Tina backend routes.
- Tina now has seventh-wave acceleration engines for accounting artifact coverage, structured attachment schedules, official-form execution, and planning action board.
- Tina now exposes those seventh-wave engines through the packet, handoff, review bundle, smoke-report layer, operational-status truth, decision briefings, and dedicated Tina backend routes.
- Tina's tax opportunity engine now upgrades ideas when explicit authority-work review has already approved them, so planning is no longer stuck behind the generic research-policy starting point.
- Tina now maps the likely companion federal form set for the current lane and tells the reviewer which items are truly supported, which are blank-form-only, and which are still blocked.
- Tina now runs a cross-form consistency pass that catches route/form/evidence/package mismatches before reviewer artifacts look coherent.
- Tina now produces a field-by-field official-form placement plan against the stored Schedule C blank instead of only saying the blank exists.
- Tina now produces attachment-grade statements for other expenses, depreciation, home office, inventory, and owner-flow explanations when facts call for them.
- Tina now produces paired reviewer and owner briefings so file explanation quality is part of the backend product, not just an eventual UI concern.
- Tina now produces a prioritized tax planning memo that turns opportunity scoring into reviewer-usable action ordering.
- Tina now reconciles the books picture against the actual return snapshot instead of trusting line mapping alone.
- Tina now produces companion-form calculations for Form 1040 carry, Schedule SE, Form 4562, and Form 8829 planning.
- Tina now separates industry-record coverage from top-level readiness so industry gaps can drive follow-up without falsely degrading clean supported files.
- Tina now produces one prioritized document-request plan that combines route proof, books gaps, evidence weakness, industry record asks, and companion-form support asks.
- Tina no longer drops ownership-change and buyout blockers just because a strong prior-return hint points to the same lane; paper hints can now sharpen route judgment without laundering away real blockers.
- Blocked-lane coverage truth now forces Schedule C coverage to read as unsupported context when Tina is routed away from the supported lane.
- Thin-evidence hardening now changes form readiness, reviewer challenge prediction, packet truth, and handoff artifact status instead of staying hidden in trace metadata.
- Blocked and review-only Schedule C return snapshots now carry explicit validation issues, so downstream reports stop treating them as blank-but-clean.
- Tina now has saved extreme-smoke datasets for five critical setups: supported sole prop, spouse community-property LLC, uneven multi-owner LLC, S-corp-elected LLC, and buyout-year LLC.
- Tina now has a reusable smoke-report layer that can build stable reviewer artifacts and truth snapshots for those saved datasets.
- Tina now lets coherent prior-return and election-document signals override weaker organizer assumptions into reviewer-controlled lanes instead of flattening them into contradiction blockers every time.
- Tina now treats operating-agreement and cap-table style uploads as real ownership-proof coverage even when the upload request id was not perfect.

## Current Queue
- Industry playbook depth pass
Done means Tina carries stronger scenario judgment across contractors, e-commerce, real estate, food service, creators, and professional services, with more fact-pattern-specific risks and opportunity logic.

- Authority-backed planning pass
Done means Tina's planning memo does not just rank ideas; it ties them to stronger authority classes, reviewer burden, disclosure handling, and fact sufficiency in a way that consistently survives reviewer scrutiny.

- Cross-form execution pass
Done means Tina's companion form plan and cross-form consistency pass can move from truth-telling and planning into actual return-production gating for the full supported form set.

- Evidence-threshold hardening pass
Done means Tina does not let thin-proof files look reviewer-ready just because a few lines can be mapped. Non-zero lines need stronger source coverage before Tina treats them as trustworthy.

- Blocked-lane coverage truth pass
Done means Tina stops publishing misleading Schedule C coverage language when the file is routed away from the supported Schedule C lane. Coverage must say "not applicable while blocked" instead of "covered."

- Reviewer-confidence scoring pass
Done means Tina distinguishes strong evidence, moderate evidence, weak evidence, and missing evidence in a way that changes readiness, reviewer challenge prediction, packet output, and operational truth.

- Thin-proof smoke hardening pass
Done means a single thin bank statement or organizer-only story cannot quietly produce a clean-looking Schedule C packet without Tina surfacing that the evidence is still too weak.

- PDF first-page truth pass
Done means Tina's PDF drafts show the most important trust blockers up front: blocked route state, unsupported section truth, and thin-evidence warnings, not only line amounts.

- Expanded Schedule C supported-line pass
Done means Tina carries a meaningfully larger official-form subset through draft, return, PDF, packet, bundle, and readiness outputs instead of only a tiny Part II slice.

- Expanded Schedule C expense-line pass
Done means Tina supports a larger core subset of Part II categories instead of collapsing most expenses into `line 27a`.

- Expense categorization pass
Done means Tina can recognize and map at least these categories when facts support them: advertising, depreciation, office expense, rent or lease, supplies, taxes and licenses, travel, meals, wages, contractor labor, and other expenses.

- Total-expense math hardening pass
Done means line 28 reconciles across the expanded supported expense categories instead of only a tiny subset.

- Official-form truth update pass
Done means coverage, readiness, packet, and bundle outputs reflect the larger supported subset and still mark unsupported sections honestly.

- Official-form coverage pass
Done means Tina publishes a section-by-section Schedule C coverage map that says what she fully covers, what she partially covers, and what she still blocks or routes to reviewer attention.

- Unsupported-section truthfulness pass
Done means Tina never implies that unsupported or only-partially-supported Schedule C sections are final. Vehicle, home-office, depreciation attachment, inventory support, and other statement-heavy sections must be explicit.

- Official-form readiness hardening pass
Done means Tina's readiness answer is based not only on math and traceability, but also on section coverage and unsupported-section truthfulness.

- Reviewer-visible finality pass
Done means the packet, review bundle, status, and API surfaces all expose the same official-form coverage truth instead of leaving it buried in backend logic.

- Official-form completeness pass
Done means Tina maps and validates the non-math Schedule C header and filing metadata she already knows or should know before calling output form-ready.

- Form-readiness pass
Done means Tina produces one explicit readiness answer for official-form output: not_ready, provisional, or reviewer_ready, with reasons tied to start path, validations, traceability, and books-normalization risk.

- Reviewer bundle finality pass
Done means Tina's exported reviewer bundle includes packet, PDF, return snapshot, form trace, route decision, books-normalization report, form-readiness status, and snapshot provenance in one coherent package.

- Schedule C category-by-category trace pass
Done means the larger supported Part II subset remains line-traceable and reviewer-visible after categorization expands.

- Expense-line packet fidelity pass
Done means the CPA packet and review bundle show the deeper supported Part II lines clearly enough that a reviewer can see where Tina is strong versus where she still routes to review.

- Official-form section-depth pass
Done means coverage and readiness truths react to the actual supported expense lines in use, not just total-expense presence.

- Supported-line adversarial test pass
Done means Tina has targeted tests for categorized expenses, expanded line-28 reconciliation, and honest partial-coverage behavior when uncategorized other expenses remain.

- Extreme LLC start-path smoke pass
Done means Tina can identify the likely federal starting lane, then block or route correctly, for wild LLC setups such as uneven multi-owner splits, spouse community-property exceptions, S-corp elections, buyouts, former-owner payments, and mixed return-type paper clues.

- Wild LLC proof-request pass
Done means Tina does not just say "review needed" for complex LLC files. She explicitly asks for the operating agreement, ownership split, election proof, community-property support, and buyout or payout papers that determine the right path.

- Evidence-aware surface pass
Done means bootstrap review, checklist, packet, and handoff all show the same evidence-aware likely lane instead of falling back to organizer-only lane messaging.

- Harden the judgment engine so route choice, treatment choice, and reviewer challenge prediction are explicit backend artifacts
- Build canonical review bundle export with packet, PDF, trace, start-path, and books-normalization artifacts
- Tighten start-path blockers and review routing into downstream readiness and packet surfaces
- Expand Schedule C final-form completeness checks beyond the current core line set
- Keep pushing reviewer-grade edge-case handling for depreciation, inventory, mixed-use, owner-flow, and ownership-transition facts

## Exact Backend Pass Queue

### Wild LLC route and proof passes
- Start-path proof contract pass
Done means Tina publishes one backend proof-requirement contract for route-critical items instead of scattering ownership and election proof logic across checklist, packet, readiness, and status code.

- Route-critical proof coverage pass
Done means Tina can explicitly say which decisive proof items are covered versus still missing for ownership split, entity election, ownership transition, and community-property exceptions.

- Entity record matrix pass
Done means Tina publishes the lane-critical entity-return records for `Schedule C`, `1065`, `1120-S`, and `1120`, with explicit `covered`, `partial`, and `missing` truth that reviewers and owner-request plans can reuse.

- Entity economics readiness pass
Done means Tina can say whether owner, partner, or shareholder economics are actually coherent enough to trust for the routed return family, and which capital, distribution, redemption, or balance-sheet questions still block judgment.

- Entity return runbook pass
Done means Tina turns the routed lane into an execution plan with real step statuses, so reviewer-controlled and future-lane files stop looking like shapeless blockers.

- Operating-agreement extraction pass
Done means Tina can pull member names, ownership percentages, and transfer language from uploaded operating-agreement style documents into source facts or review items.

- Ownership timeline pass
Done means Tina can build a year-specific ownership timeline that captures opening owners, closing owners, transfers, buyouts, and former-owner payments.

- Election-history pass
Done means Tina can distinguish organizer claims from actual election proof across Form 2553, Form 8832, prior returns, and contradictory paper hints.

- Prior-return lane inference pass
Done means Tina can infer likely filing path from prior federal returns, K-1 references, corporate headers, and return-package naming clues even when organizer answers are weak.

- Wild LLC contradiction pass
Done means Tina records and surfaces contradictions across organizer facts, papers, books, and prior returns instead of flattening them into a single guessed lane.

- Multi-owner blocker hardening pass
Done means Tina never silently continues Schedule C prep once multi-owner evidence is strong enough to point to partnership or entity-review treatment.

### Official-form and return-production passes
- Schedule C section-depth pass
Done means Tina supports a materially wider official Schedule C surface beyond the current header plus core Part II subset and states section-level support honestly.

- Statement-attachment pass
Done means Tina can model and export reviewer-facing support for statement-heavy items like line 27a detail, depreciation support, and inventory explanations.

- Official PDF fidelity pass
Done means Tina's PDF output is visually and structurally close enough to the actual government form that a reviewer can use it as a serious form-review artifact instead of a styled approximation.

- Form-set completeness pass
Done means Tina knows which companion forms, schedules, or statements still sit outside the current supported lane and marks them explicitly in readiness and packet output.

- Cross-form consistency pass
Done means Tina validates that the final Schedule C snapshot agrees with package readiness, reviewer-final lines, and exported packet statements before rendering output.

### Reviewer-grade package passes
- Immutable reviewer packet provenance pass
Done means packet, bundle, and exported artifacts all say whether they came from the live draft or a frozen snapshot and preserve the snapshot id cleanly.

- Reviewer proof-visibility pass
Done means the CPA packet, handoff, bundle manifest, and status surfaces all show the same missing-proof list and the same likely filing lane.

- Reviewer challenge prediction pass
Done means Tina records likely CPA challenge points as backend artifacts tied to facts, authority gaps, or unsupported sections.

- Reviewer decision carry-forward pass
Done means reviewer decisions on lane choice, appendix items, and proof sufficiency are preserved and reused instead of being rediscovered every run.

### Books, evidence, and authority passes
- Books contamination classifier pass
Done means Tina can separate personal contamination, owner-flow distortion, related-party activity, and intercompany leakage into distinct reviewer-grade issue classes.

- Evidence coverage scoring pass
Done means Tina can score whether each material form line has enough evidence support, weak support, or no support before output is called reviewer-ready.

- Authority-backed recommendation pass
Done means Tina can tie a savings idea to authority work, assumptions, and reviewer question text before it reaches the use or appendix lanes.

- Appendix quality filter pass
Done means Tina drops speculative or immaterial ideas before they reach reviewer surfaces and keeps only plausible, fact-tied, material appendix items.

### Integration and smoke-test passes
- QuickBooks provenance pass
Done means imported ledger facts carry clear provenance into books-normalization, workpapers, and proof-aware route decisions.

- Extreme smoke dataset pass
Done means Tina has saved smoke datasets for sole prop, spouse community-property LLC, uneven multi-owner LLC, S-corp-elected LLC, and buyout-year LLC files.

- Reviewer acceptance smoke pass
Done means Tina can export reviewer artifacts for those smoke datasets without wrong-lane prep leaking through.

- Delivery honesty pass
Done means every customer-visible backend surface tells the truth about support level, blockers, reviewer control, and unsupported lanes with no maturity bluffing.
