import { TINA_SKILL_REVIEW_PANEL } from "@/tina/data/skill-review-panel";
import { TINA_SKILL_REVIEW_DRAFTS } from "@/tina/data/skill-review-fixtures";
import { buildTinaEightFloorGate } from "@/tina/lib/eight-floor-gate";
import { buildTinaSmokeCaseReport, type TinaSmokeCaseReport } from "@/tina/lib/smoke-report";
import type {
  TinaPanelistReview,
  TinaSkillChallenge,
  TinaSkillDescriptor,
  TinaSkillId,
  TinaSkillReportCard,
  TinaSkillReportCardEntry,
  TinaTraitGateResult,
} from "@/tina/lib/skill-report-card-contracts";

let cachedSkillReportCard: TinaSkillReportCard | null = null;

export const TINA_SKILL_DESCRIPTORS: TinaSkillDescriptor[] = [
  { id: "technical_tax_law", title: "Technical Tax Law", shortTitle: "Tax Law" },
  { id: "accounting_fluency", title: "Accounting Fluency", shortTitle: "Accounting" },
  { id: "fact_pattern_judgment", title: "Fact-Pattern Judgment", shortTitle: "Fact Pattern" },
  {
    id: "entity_and_filing_path_classification",
    title: "Entity and Filing-Path Classification",
    shortTitle: "Entity Path",
  },
  { id: "tax_treatment_selection", title: "Tax Treatment Selection", shortTitle: "Treatment" },
  {
    id: "record_and_evidence_analysis",
    title: "Record and Evidence Analysis",
    shortTitle: "Evidence",
  },
  {
    id: "risk_and_materiality_judgment",
    title: "Risk and Materiality Judgment",
    shortTitle: "Risk",
  },
  {
    id: "tax_planning_and_savings_identification",
    title: "Tax Planning and Savings Identification",
    shortTitle: "Planning",
  },
  {
    id: "form_and_compliance_execution",
    title: "Form and Compliance Execution",
    shortTitle: "Forms",
  },
  {
    id: "review_and_error_detection",
    title: "Review and Error Detection",
    shortTitle: "Review",
  },
  {
    id: "documentation_and_defensibility",
    title: "Documentation and Defensibility",
    shortTitle: "Documentation",
  },
  { id: "client_communication", title: "Client Communication", shortTitle: "Communication" },
  {
    id: "workflow_and_case_management",
    title: "Workflow and Case Management",
    shortTitle: "Workflow",
  },
  {
    id: "industry_and_scenario_familiarity",
    title: "Industry and Scenario Familiarity",
    shortTitle: "Industry",
  },
  {
    id: "ethics_and_professional_responsibility",
    title: "Ethics and Professional Responsibility",
    shortTitle: "Ethics",
  },
  { id: "practice_judgment", title: "Practice Judgment", shortTitle: "Practice" },
];

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toSchoolGrade(score: number): string {
  if (score >= 9.7) return "A+";
  if (score >= 9.0) return "A";
  if (score >= 8.0) return "A-";
  if (score >= 7.0) return "B";
  if (score >= 6.0) return "C";
  if (score >= 5.0) return "D";
  return "F";
}

function getReport(id: string): TinaSmokeCaseReport {
  if (!(globalThis as Record<string, unknown>).__tinaSkillSmokeReportCache) {
    (globalThis as Record<string, unknown>).__tinaSkillSmokeReportCache = new Map<
      string,
      TinaSmokeCaseReport
    >();
  }
  const cache = (globalThis as Record<string, unknown>).__tinaSkillSmokeReportCache as Map<
    string,
    TinaSmokeCaseReport
  >;
  const cached = cache.get(id);
  if (cached) return cached;

  const draft = TINA_SKILL_REVIEW_DRAFTS[id];
  if (!draft) {
    throw new Error(`Missing Tina skill review fixture: ${id}`);
  }
  const report = buildTinaSmokeCaseReport(draft);
  cache.set(id, report);
  return report;
}

function getEightFloorGate() {
  if (!(globalThis as Record<string, unknown>).__tinaEightFloorReportCardCache) {
    (globalThis as Record<string, unknown>).__tinaEightFloorReportCardCache =
      buildTinaEightFloorGate();
  }

  return (globalThis as Record<string, unknown>)
    .__tinaEightFloorReportCardCache as ReturnType<typeof buildTinaEightFloorGate>;
}

function countByBucket(report: TinaSmokeCaseReport, bucket: "use" | "review" | "reject"): number {
  return report.treatmentJudgment.items.filter((item) => item.taxPositionBucket === bucket).length;
}

function scorePanel(
  skillId: TinaSkillId,
  panel: TinaPanelistReview[]
): Pick<
  TinaSkillReportCardEntry,
  "score" | "averageScore" | "minimumScore" | "maximumScore" | "letterGrade" | "panelNotes"
> {
  const scores = panel.map((panelist) => panelist.scores[skillId]);
  const score = roundScore(median(scores));
  const averageScore = roundScore(average(scores));
  const minimumScore = roundScore(Math.min(...scores));
  const maximumScore = roundScore(Math.max(...scores));

  return {
    score,
    averageScore,
    minimumScore,
    maximumScore,
    letterGrade: toSchoolGrade(score),
    panelNotes: panel.map((panelist) => ({
      panelistId: panelist.id,
      panelistName: panelist.name,
      specialty: panelist.specialty,
      score: panelist.scores[skillId],
      note: panelist.notes[skillId],
    })),
  };
}

function buildTeacherComment(
  shortTitle: string,
  whyNotAPlus: string,
  gateResult: TinaTraitGateResult,
  score: number,
  letterGrade: string,
  minimumScore: number,
  maximumScore: number,
  panelNotes: TinaSkillReportCardEntry["panelNotes"]
): string {
  const harshestPanel = panelNotes
    .slice()
    .sort((left, right) => left.score - right.score)
    .slice(0, 2)
    .map((note) => `${note.panelistName} (${note.score}/10)`)
    .join(", ");

  const failureLead =
    gateResult.failures.length > 0
      ? `Objective gate status is ${gateResult.status} with ${gateResult.failures.length} failing fixture check${
          gateResult.failures.length === 1 ? "" : "s"
        }, led by ${gateResult.failures
          .slice(0, 2)
          .map((failure) => `${failure.fixtureId} (${failure.ownerEngine})`)
          .join(", ")}.`
      : "Objective gate status is pass with no failing fixture checks.";

  return `${shortTitle}: ${whyNotAPlus} ${failureLead} Current panel spread is ${minimumScore} to ${maximumScore}, and the harshest panelists were ${harshestPanel}. Tina's scored mark for this trait is ${score}/10 (${letterGrade}).`;
}

function buildTechnicalTaxLawChallenge(): TinaSkillChallenge {
  const supported = getReport("supported-core");
  const sCorp = getReport("s-corp-election");
  const buyout = getReport("buyout-year");
  const salesTax = getReport("sales-tax-authority");
  const salesTaxUse =
    salesTax.treatmentJudgment.items.find((item) => item.id === "sales-tax-treatment")
      ?.taxPositionBucket ?? "review";

  return {
    skillId: "technical_tax_law",
    title: "Lane law, election law, and authority-backed treatment collision",
    objective:
      "Attack Tina with an S-election file, a buyout-year partnership file, and a sales-tax authority file to see whether she knows real law from lane-shaped guesswork.",
    fixtureIds: ["supported-core", "s-corp-election", "buyout-year", "sales-tax-authority"],
    observedStrengths: [
      `Tina names ${supported.federalReturnRequirements.returnFamily}, ${sCorp.federalReturnRequirements.returnFamily}, and ${buyout.federalReturnRequirements.returnFamily} instead of flattening everything into Schedule C.`,
      `The sales-tax authority challenge reaches a "${salesTaxUse}" treatment bucket instead of leaving the issue invisible.`,
      `Unsupported entity lanes stay review-only or blocked rather than silently inheriting the supported Schedule C core.`,
    ],
    observedWeaknesses: [
      `The S-corp and buyout-year files both report "canTinaFinishLane = ${sCorp.federalReturnRequirements.canTinaFinishLane}/${buyout.federalReturnRequirements.canTinaFinishLane}", which means the legal posture is ahead of actual execution depth.`,
      `Official-form execution on the S-corp file is still "${sCorp.officialFormExecution.overallStatus}", proving Tina knows the family but cannot finish it like a veteran yet.`,
      `The buyout-year route is "${buyout.startPath.route}" with ${buyout.startPath.blockingReasons.length} blocker(s), which is honest but still a stop signal rather than deep law application.`,
    ],
    whyNotAPlus:
      "Tina knows the names, proof requirements, and some authority-aware treatments for the modeled lanes, but she still cannot carry that legal posture all the way through non-Schedule-C execution or nuanced multi-owner doctrine.",
  };
}

function buildAccountingFluencyChallenge(): TinaSkillChallenge {
  const dirty = getReport("dirty-books");
  const thin = getReport("thin-proof");
  const supported = getReport("supported-core");

  return {
    skillId: "accounting_fluency",
    title: "Dirty-books, thin-proof, and clean-books accounting gauntlet",
    objective:
      "Pressure Tina with one clean file, one thin-proof file, and one contaminated-books file to see whether she really understands books or only reacts to labels.",
    fixtureIds: ["supported-core", "thin-proof", "dirty-books"],
    observedStrengths: [
      `Dirty-books coverage flags ${dirty.booksNormalization.issues.length} normalization issues and leaves accounting artifact coverage at "${dirty.accountingArtifactCoverage.overallStatus}".`,
      `Thin proof is downgraded to evidence sufficiency "${thin.evidenceSufficiency.overallStatus}" instead of being called reviewer-grade just because math exists.`,
      `The clean supported file still keeps books reconciliation at "${supported.booksReconciliation.overallStatus}" and does not invent noise where the books picture is simple.`,
    ],
    observedWeaknesses: [
      `Dirty-books reconciliation is still "${dirty.booksReconciliation.overallStatus}", which means Tina is better at flagging contamination than fully reconstructing a ledger-grade truth set.`,
      `The dirty-books file leaves ${countByBucket(dirty, "review")} review bucket(s) and ${countByBucket(dirty, "reject")} reject bucket(s), showing that cleanup still outruns final accounting resolution.`,
      `Thin-proof still builds a Schedule C skeleton with ${thin.pdfFieldCount} PDF field(s), which is useful for review but not the same as true books confidence.`,
    ],
    whyNotAPlus:
      "Tina can identify ugly books and lower confidence fast, but she still behaves more like a disciplined forensic triage engine than a veteran accountant who can rebuild bad books all the way into trusted tax numbers.",
  };
}

function buildFactPatternChallenge(): TinaSkillChallenge {
  const spouse = getReport("spouse-community-property");
  const buyout = getReport("buyout-year");
  const thin = getReport("thin-proof");

  return {
    skillId: "fact_pattern_judgment",
    title: "Community-property, buyout-year, and thin-proof fact-pattern trap",
    objective:
      "Give Tina a spouse exception, a chaotic ownership transition, and a deceptively simple thin-proof file to see whether she understands what actually happened.",
    fixtureIds: ["spouse-community-property", "buyout-year", "thin-proof"],
    observedStrengths: [
      `The spouse file stays "${spouse.startPath.route}" with ${spouse.startPath.proofRequirements.length} proof requirement(s) instead of pretending the exception is automatic.`,
      `The buyout-year file carries ${buyout.ownershipCapitalEvents.eventCount} ownership/capital event(s) and blocks the lane rather than smoothing over the transition year.`,
      `Thin proof does not get reviewer-grade evidence status; Tina keeps evidence sufficiency at "${thin.evidenceSufficiency.overallStatus}".`,
    ],
    observedWeaknesses: [
      `Thin proof still routes as "${thin.startPath.route}", which shows Tina can understand route facts and evidence facts on different confidence clocks.`,
      `The spouse file still depends on reviewer proof gathering rather than a richer factual adjudication history.`,
      `The buyout-year file is strong at noticing danger, but still stops at blocker language instead of reconstructing the full story like a veteran would.`,
    ],
    whyNotAPlus:
      "Tina is excellent at noticing that the fact pattern is dangerous, but she still depends heavily on extracted clues, proof requests, and blocker states rather than rich chronology reconstruction and tacit human inference.",
  };
}

function buildEntityClassificationChallenge(): TinaSkillChallenge {
  const uneven = getReport("uneven-multi-owner");
  const sCorp = getReport("s-corp-election");
  const buyout = getReport("buyout-year");

  return {
    skillId: "entity_and_filing_path_classification",
    title: "Three-entity family routing shootout",
    objective:
      "Put Tina in front of a 1065-style multi-owner file, an S-election file, and a transition-year file to see if she chooses the correct family before prep.",
    fixtureIds: ["uneven-multi-owner", "s-corp-election", "buyout-year"],
    observedStrengths: [
      `The uneven multi-owner file lands on "${uneven.startPath.recommendation.laneId}" and the S-election file lands on "${sCorp.startPath.recommendation.laneId}".`,
      `The buyout-year file preserves a "${buyout.startPath.recommendation.laneId}" recommendation while still blocking the route entirely.`,
      `All three non-supported files keep official form execution away from a false ready state.`,
    ],
    observedWeaknesses: [
      `Every non-Schedule-C challenge still reports execution mode "${uneven.entityReturnRunbook.executionMode}/${sCorp.entityReturnRunbook.executionMode}/${buyout.entityReturnRunbook.executionMode}", which proves classification is ahead of completion.`,
      `None of the three files can finish automatically today, so Tina still knows where to start better than she knows how to finish.`,
      `Classification still depends on modeled hints and proofs, not deep entity-history parsing from durable records.`,
    ],
    whyNotAPlus:
      "Tina is already very good at not starting in the wrong lane, but she still earns that grade by blocking safely rather than by showing veteran depth across every entity family she names.",
  };
}

function buildTreatmentSelectionChallenge(): TinaSkillChallenge {
  const dirty = getReport("dirty-books");
  const salesTax = getReport("sales-tax-authority");
  const creator = getReport("creator-media");

  return {
    skillId: "tax_treatment_selection",
    title: "Mixed-use, sales-tax, and creator-expense treatment exam",
    objective:
      "Force Tina to separate reject/review/use judgments across contaminated books, authority-backed sales-tax treatment, and mixed-use creator expenses.",
    fixtureIds: ["dirty-books", "sales-tax-authority", "creator-media"],
    observedStrengths: [
      `Dirty-books treatment judgment produces ${countByBucket(dirty, "review")} review item(s) and ${countByBucket(dirty, "reject")} reject item(s), which shows Tina is willing to fail closed.`,
      `The sales-tax authority fixture pushes the sales-tax item to "${salesTax.treatmentJudgment.items.find((item) => item.id === "sales-tax-treatment")?.taxPositionBucket ?? "review"}" when reviewer-backed authority is present.`,
      `Creator/media still carries mixed-use treatment friction instead of silently allowing equipment and travel to pass through.`,
    ],
    observedWeaknesses: [
      `Creator/media treatment remains "${creator.treatmentJudgment.summary}" rather than resolving into a fully confident final treatment stack.`,
      `Dirty-books still leaves a large review queue instead of settling complex labor, inventory, and owner-flow characterization end to end.`,
      `Most treatment logic still operates inside named heuristic families rather than a more open-ended veteran treatment framework.`,
    ],
    whyNotAPlus:
      "Tina is already good at refusing bad treatment, but she still resolves too few hard items all the way into strong, reviewer-trusted final positions when the facts get messy.",
  };
}

function buildEvidenceChallenge(): TinaSkillChallenge {
  const supported = getReport("supported-core");
  const thin = getReport("thin-proof");
  const dirty = getReport("dirty-books");

  return {
    skillId: "record_and_evidence_analysis",
    title: "Support-quality stress test across clean, thin, and contaminated files",
    objective:
      "Compare how Tina scores evidence on a clean supported file, a thin-proof file, and a contaminated-books file to see if she distinguishes real support from weak support.",
    fixtureIds: ["supported-core", "thin-proof", "dirty-books"],
    observedStrengths: [
      `The supported file reaches evidence sufficiency "${supported.evidenceSufficiency.overallStatus}" with ${supported.evidenceSufficiency.counts.strong} strong non-zero line(s).`,
      `Thin proof is held below reviewer-grade at "${thin.evidenceSufficiency.overallStatus}" and carries ${thin.evidenceSufficiency.issues.length} evidence issue(s).`,
      `Dirty-books evidence sufficiency is "${dirty.evidenceSufficiency.overallStatus}" and pushes bookkeeping contamination directly into the evidence story.`,
    ],
    observedWeaknesses: [
      `Even thin proof can still generate ${thin.formTrace.lines.length} traced line(s), which shows traceability is stronger than source quality scoring.`,
      `Dirty-books still depends on linked facts and documents, not source independence or authenticity analysis.`,
      `The evidence engine remains mostly count- and linkage-driven rather than credibility-driven.`,
    ],
    whyNotAPlus:
      "Tina already traces numbers better than most systems, but she still tends to score support by linked artifact presence rather than by the deeper credibility, completeness, and contradiction analysis a veteran reviewer would apply.",
  };
}

function buildRiskChallenge(): TinaSkillChallenge {
  const buyout = getReport("buyout-year");
  const dirty = getReport("dirty-books");
  const drifted = getReport("drifted-package");

  return {
    skillId: "risk_and_materiality_judgment",
    title: "Blocked lane, dirty books, and stale signoff materiality drill",
    objective:
      "See whether Tina can tell the difference between path-critical blockers, ugly-but-local cleanup, and post-signoff drift that should invalidate confidence.",
    fixtureIds: ["buyout-year", "dirty-books", "drifted-package"],
    observedStrengths: [
      `The buyout-year file carries ${buyout.operationalStatus.blockers.length} blocker(s), proving path-critical risk is surfaced loudly.`,
      `Dirty-books materiality stays at "${dirty.materialityPriority.overallStatus}" and does not bury cleanup work under cosmetic polish.`,
      `The drifted package flips package state to "${drifted.operationalStatus.packageState}" after a post-approval change.`,
    ],
    observedWeaknesses: [
      `Dirty-books still needs a lot of immediate and next-priority items, which shows Tina can rank risk better than she can close it.`,
      `The drifted package depends on fingerprint and snapshot logic rather than a deeper transactional audit model.`,
      `Risk remains strongest on known blocker classes rather than truly open-ended materiality judgment.`,
    ],
    whyNotAPlus:
      "Tina can already rank and surface serious danger, but she still behaves more like a strong issue-priority engine than a veteran who instinctively knows the exact few issues that matter most in context.",
  };
}

function buildPlanningChallenge(): TinaSkillChallenge {
  const supported = getReport("supported-core");
  const salesTax = getReport("sales-tax-authority");
  const creator = getReport("creator-media");

  return {
    skillId: "tax_planning_and_savings_identification",
    title: "Opportunity board, authority board, and industry-planning pressure test",
    objective:
      "Measure whether Tina can surface worthwhile savings ideas, prioritize them, and keep them evidence- and authority-aware instead of turning them into empty wish lists.",
    fixtureIds: ["supported-core", "sales-tax-authority", "creator-media"],
    observedStrengths: [
      `The supported file exposes ${supported.taxOpportunityEngine.items.length} opportunity item(s) and a planning board status of "${supported.planningActionBoard.overallStatus}".`,
      `The sales-tax fixture ties at least one planning idea to stronger authority posture and a more usable treatment bucket.`,
      `Creator/media still triggers industry-aware planning pressure instead of generic small-business advice only.`,
    ],
    observedWeaknesses: [
      `The creator/media planning board still stops short of turning the mixed-use file into a high-confidence planning memo.`,
      `Planning output remains narrower than the total fact pattern because many opportunities still wait on evidence or authority work.`,
      `Tina’s planning engine is still more curated and playbook-driven than generative.`,
    ],
    whyNotAPlus:
      "Tina already looks for savings instead of waiting for a CPA to notice them, but the engine is still much better at surfacing candidate moves than at building elite, fact-specific planning architecture with strong follow-through.",
  };
}

function buildFormsChallenge(): TinaSkillChallenge {
  const supported = getReport("supported-core");
  const thin = getReport("thin-proof");
  const sCorp = getReport("s-corp-election");

  return {
    skillId: "form_and_compliance_execution",
    title: "Official-form readiness across supported, thin, and unsupported lanes",
    objective:
      "Attack form execution with a clean Schedule C, a thin-proof Schedule C, and a non-Schedule-C lane to see if Tina is a real forms engine or a strong planner.",
    fixtureIds: ["supported-core", "thin-proof", "s-corp-election"],
    observedStrengths: [
      `The supported file reaches official-form execution "${supported.officialFormExecution.overallStatus}" with ${supported.officialFormExecution.items.length} execution item(s).`,
      `Thin proof remains "${thin.officialFormExecution.overallStatus}" and the placement plan still refuses a false ready state when header/support gaps remain.`,
      `The S-corp file blocks official-form fill entirely instead of pretending Schedule C still applies.`,
    ],
    observedWeaknesses: [
      `The supported file still relies on official-form mode "${supported.officialFormFill.mode}", which is a placement plan rather than a finished filed-form renderer.`,
      `Thin proof still produces ${thin.pdfFieldCount} PDF field(s), which can look more complete than the evidence really is.`,
      `Non-Schedule-C execution stays in planning or blocked mode rather than true finished-form production.`,
    ],
    whyNotAPlus:
      "Tina has a serious form-execution backbone now, but it is still fundamentally a readiness-and-placement system rather than a fully finished official federal forms engine across the entity families she can recognize.",
  };
}

function buildReviewChallenge(): TinaSkillChallenge {
  const dirty = getReport("dirty-books");
  const drifted = getReport("drifted-package");
  const supported = getReport("supported-core");

  return {
    skillId: "review_and_error_detection",
    title: "Cross-form, stale-signoff, and contaminated-books reviewer gauntlet",
    objective:
      "Test whether Tina catches drift, contradiction, and support gaps early enough that a reviewer is confirming rather than rescuing.",
    fixtureIds: ["dirty-books", "drifted-package", "supported-core"],
    observedStrengths: [
      `The drifted package surfaces package state "${drifted.operationalStatus.packageState}", which is exactly the kind of post-signoff drift a reviewer would want to catch.`,
      `Dirty-books cross-form consistency is "${dirty.crossFormConsistency.overallStatus}" and reviewer challenge count is ${dirty.reviewerChallenges.items.length}.`,
      `The supported file keeps validation issues low while still preserving traceability and review bundle coverage.`,
    ],
    observedWeaknesses: [
      `Dirty-books shows how Tina still catches many known issue classes more easily than she fully repairs them.`,
      `The review stack is only as good as the rule graph and can still miss truly novel inconsistencies.`,
      `The drifted package detection depends on fingerprint logic rather than a more durable event-sourced review system.`,
    ],
    whyNotAPlus:
      "Tina already behaves like a skeptical reviewer in many modeled situations, but she still relies on known issue families and fingerprint-driven controls more than the broad pattern memory a veteran reviewer brings.",
  };
}

function buildDocumentationChallenge(): TinaSkillChallenge {
  const supported = getReport("supported-core");
  const dirty = getReport("dirty-books");
  const buyout = getReport("buyout-year");

  return {
    skillId: "documentation_and_defensibility",
    title: "Reviewer packet, trace bundle, and blocker memo packaging exam",
    objective:
      "See whether Tina can package both clean and ugly files so a reviewer understands the file without rebuilding it from scratch.",
    fixtureIds: ["supported-core", "dirty-books", "buyout-year"],
    observedStrengths: [
      `The supported file ships a review bundle with ${supported.reviewBundleFileCount} file artifact(s).`,
      `Dirty-books still produces decision briefings with ${dirty.decisionBriefings.reviewer.openQuestions.length} reviewer open question(s) instead of hiding the mess.`,
      `The buyout-year blocked file still leaves a coherent packet story with ${buyout.operationalStatus.blockers.length} explicit blocker(s).`,
    ],
    observedWeaknesses: [
      `Dirty-books documentation is strong, but still documents a large unresolved review surface.`,
      `The buyout-year packet is explainable mainly because Tina stops safely, not because she can defend a finished return.`,
      `Packet polish can outpace the underlying depth of reasoning if the draft facts are too thin or heuristic.`,
    ],
    whyNotAPlus:
      "Tina is already unusually good at packaging, tracing, and explaining her work, but a veteran-level A+ package also requires deeper underlying reasoning so the documentation is not just well organized, but deeply persuasive.",
  };
}

function buildCommunicationChallenge(): TinaSkillChallenge {
  const thin = getReport("thin-proof");
  const creator = getReport("creator-media");
  const spouse = getReport("spouse-community-property");

  return {
    skillId: "client_communication",
    title: "Owner brief, reviewer brief, and missing-proof communication check",
    objective:
      "Pressure Tina’s owner/reviewer communication on a thin-proof file, an industry-specific file, and a spouse exception that still needs legal proof.",
    fixtureIds: ["thin-proof", "creator-media", "spouse-community-property"],
    observedStrengths: [
      `Thin proof produces ${thin.decisionBriefings.owner.openQuestions.length} owner open question(s), which keeps the missing-proof ask explicit.`,
      `The spouse file keeps route-critical proof visible in plain-language owner and reviewer briefings.`,
      `Creator/media brings industry context into the owner/reviewer brief instead of only dumping raw statuses.`,
    ],
    observedWeaknesses: [
      `The briefings still derive from backend state and request queues more than from a richer conversational advisory model.`,
      `Thin proof shows how calm language can make the package feel more complete than it really is unless the reviewer reads the blockers carefully.`,
      `Communication is strongest at explaining what Tina needs next, not yet at explaining nuanced strategic tradeoffs like a senior CPA.`,
    ],
    whyNotAPlus:
      "Tina already speaks more clearly than most backend tax tools, but she still communicates from state machines and request plans rather than from the deeper trust-building, expectation-setting judgment of a seasoned advisor.",
  };
}

function buildWorkflowChallenge(): TinaSkillChallenge {
  const drifted = getReport("drifted-package");
  const buyout = getReport("buyout-year");
  const supported = getReport("supported-core");

  return {
    skillId: "workflow_and_case_management",
    title: "Snapshot drift, blocked lane, and supported-lane workflow control test",
    objective:
      "Test whether Tina controls state, approval drift, and case progression with real discipline instead of optimistic status language.",
    fixtureIds: ["drifted-package", "buyout-year", "supported-core"],
    observedStrengths: [
      `The drifted package flips to "${drifted.operationalStatus.packageState}" after a post-signoff change, which is exactly the right control behavior.`,
      `The buyout-year file stays blocked with ${buyout.operationalStatus.blockers.length} operational blocker(s) rather than wandering into a false ready state.`,
      `The supported core can still move through the reviewer artifact pipeline without polluting blocked files.`,
    ],
    observedWeaknesses: [
      `Workflow integrity still depends on draft-object fingerprints and snapshots rather than a more durable transactional workflow layer.`,
      `The supported core’s execution path is still stronger as a compiler over draft state than as a persistence-rich operating system.`,
      `Blocked files are controlled well, but Tina still cannot always turn that control into a finished alternative path.`,
    ],
    whyNotAPlus:
      "Tina’s workflow discipline is one of the strongest parts of the backend, but it still runs on a draft-centric substrate and lacks the durable, transactional control plane a veteran-grade tax operating system would have.",
  };
}

function buildIndustryChallenge(): TinaSkillChallenge {
  const creator = getReport("creator-media");
  const dirty = getReport("dirty-books");
  const retail = getReport("sales-tax-authority");

  return {
    skillId: "industry_and_scenario_familiarity",
    title: "Creator, trades, and ecommerce playbook shootout",
    objective:
      "See whether Tina recognizes distinct industry fingerprints and turns them into different evidence and planning expectations.",
    fixtureIds: ["creator-media", "dirty-books", "sales-tax-authority"],
    observedStrengths: [
      `Creator/media identifies primary industry "${creator.industryPlaybooks.primaryIndustryId}".`,
      `Dirty-books for the contractor file identifies primary industry "${dirty.industryPlaybooks.primaryIndustryId}".`,
      `The sales-tax retail file identifies primary industry "${retail.industryPlaybooks.primaryIndustryId}" and adjusts evidence/planning pressure accordingly.`,
    ],
    observedWeaknesses: [
      `Industry evidence matrices still remain "${creator.industryEvidenceMatrix.overallStatus}/${dirty.industryEvidenceMatrix.overallStatus}/${retail.industryEvidenceMatrix.overallStatus}" instead of fully covered across the board.`,
      `Playbooks are still more curated overlays than deep, vertical-specific tax engines.`,
      `Tina’s industry strength is clearer on the cases she already models than on truly novel business types.`,
    ],
    whyNotAPlus:
      "Tina now recognizes several important small-business patterns and changes her asks accordingly, but the playbooks are still broad and curated rather than the kind of deep niche memory a long-tenured specialist would bring.",
  };
}

function buildEthicsChallenge(): TinaSkillChallenge {
  const thin = getReport("thin-proof");
  const dirty = getReport("dirty-books");
  const buyout = getReport("buyout-year");

  return {
    skillId: "ethics_and_professional_responsibility",
    title: "Fail-closed ethics and unsupported-position discipline test",
    objective:
      "Attack Tina with thin proof, dirty books, and an unsupported entity transition to see whether she refuses to overstate certainty.",
    fixtureIds: ["thin-proof", "dirty-books", "buyout-year"],
    observedStrengths: [
      `The buyout-year file stays "${buyout.startPath.route}" with official-form execution "${buyout.officialFormExecution.overallStatus}" instead of quietly flowing into the return.`,
      `Dirty-books throws ${countByBucket(dirty, "reject")} reject bucket(s), which is the right ethical move when support is weak.`,
      `Thin proof remains evidence sufficiency "${thin.evidenceSufficiency.overallStatus}" and form readiness "${thin.formReadiness.level}" rather than pretending to be reviewer-ready.`,
    ],
    observedWeaknesses: [
      `Thin proof still routes into a Schedule C-shaped path, which shows how ethical caution still relies on downstream evidence and readiness layers catching what route confidence does not.`,
      `The ethics posture is strong, but still depends heavily on the code correctly classifying clues and summaries first.`,
      `Unsupported lanes are blocked responsibly, but Tina still lacks deeper standards-of-conduct logic beyond those blockers.`,
    ],
    whyNotAPlus:
      "Tina already has genuine fail-closed instincts and does not silently apply weak positions, but veteran-level ethics also require deeper standards reasoning, better proof quality judgment, and more durable governance around overrides and disclosures.",
  };
}

function buildPracticeChallenge(): TinaSkillChallenge {
  const dirty = getReport("dirty-books");
  const drifted = getReport("drifted-package");
  const salesTax = getReport("sales-tax-authority");

  return {
    skillId: "practice_judgment",
    title: "What-matters-now sequencing and reviewer-priority exam",
    objective:
      "Force Tina to choose what matters first across a dirty-books file, a stale signoff file, and an authority-backed opportunity file.",
    fixtureIds: ["dirty-books", "drifted-package", "sales-tax-authority"],
    observedStrengths: [
      `Dirty-books materiality is "${dirty.materialityPriority.overallStatus}" and the planning board is "${dirty.planningActionBoard.overallStatus}", which means Tina is not ignoring sequencing.`,
      `The drifted package immediately elevates post-signoff change risk instead of treating it as ordinary cleanup.`,
      `The sales-tax authority file shows Tina can distinguish a stronger, more ready position from the larger review queue.`,
    ],
    observedWeaknesses: [
      `Dirty-books still generates a broad pile of immediate and next items rather than the razor-sharp “fix these two things first” sequencing of a veteran practice leader.`,
      `Tina is best at ranking known issue families, not yet at improvising priorities on novel combinations of facts.`,
      `Opportunity sequencing is still more rules-based than truly commercial or reviewer-temperament-aware.`,
    ],
    whyNotAPlus:
      "Tina is getting much better at ordering work and surfacing the reviewer’s likely first concerns, but she still sequences from policy and status layers more than from the tacit commercial judgment of a veteran who knows exactly what to fix first and what can wait.",
  };
}

function buildSkillChallenge(skillId: TinaSkillId): TinaSkillChallenge {
  switch (skillId) {
    case "technical_tax_law":
      return buildTechnicalTaxLawChallenge();
    case "accounting_fluency":
      return buildAccountingFluencyChallenge();
    case "fact_pattern_judgment":
      return buildFactPatternChallenge();
    case "entity_and_filing_path_classification":
      return buildEntityClassificationChallenge();
    case "tax_treatment_selection":
      return buildTreatmentSelectionChallenge();
    case "record_and_evidence_analysis":
      return buildEvidenceChallenge();
    case "risk_and_materiality_judgment":
      return buildRiskChallenge();
    case "tax_planning_and_savings_identification":
      return buildPlanningChallenge();
    case "form_and_compliance_execution":
      return buildFormsChallenge();
    case "review_and_error_detection":
      return buildReviewChallenge();
    case "documentation_and_defensibility":
      return buildDocumentationChallenge();
    case "client_communication":
      return buildCommunicationChallenge();
    case "workflow_and_case_management":
      return buildWorkflowChallenge();
    case "industry_and_scenario_familiarity":
      return buildIndustryChallenge();
    case "ethics_and_professional_responsibility":
      return buildEthicsChallenge();
    case "practice_judgment":
      return buildPracticeChallenge();
  }
}

export function buildTinaSkillReportCard(): TinaSkillReportCard {
  if (!cachedSkillReportCard) {
    const gate = getEightFloorGate();
    const skills: TinaSkillReportCardEntry[] = TINA_SKILL_DESCRIPTORS.map((descriptor) => {
      const challenge = buildSkillChallenge(descriptor.id);
      const panelCounts = scorePanel(descriptor.id, TINA_SKILL_REVIEW_PANEL);
      const gateResult = gate.results.find((result) => result.skillId === descriptor.id);

      if (!gateResult) {
        throw new Error(`Missing Tina eight-floor gate result for ${descriptor.id}`);
      }

      return {
        ...challenge,
        ...panelCounts,
        score: gateResult.score,
        letterGrade: toSchoolGrade(gateResult.score),
        teacherComment: buildTeacherComment(
          descriptor.shortTitle,
          challenge.whyNotAPlus,
          gateResult,
          gateResult.score,
          toSchoolGrade(gateResult.score),
          panelCounts.minimumScore,
          panelCounts.maximumScore,
          panelCounts.panelNotes
        ),
      };
    });

    const overallScore = roundScore(Math.min(...skills.map((skill) => skill.score)));
    const averagePanelScore = roundScore(
      average(TINA_SKILL_REVIEW_PANEL.map((panelist) => panelist.overallScore))
    );

    cachedSkillReportCard = {
      generatedAt: new Date().toISOString(),
      overallScore,
      averagePanelScore,
      overallLetterGrade: toSchoolGrade(overallScore),
      panelCount: TINA_SKILL_REVIEW_PANEL.length,
      skills,
    };
  }

  const card = structuredClone(cachedSkillReportCard);
  card.generatedAt = new Date().toISOString();
  return card;
}

export function renderTinaSkillReportCardMarkdown(card: TinaSkillReportCard): string {
  const lines: string[] = [];

  lines.push("# Tina School Report Card");
  lines.push("");
  lines.push(`Generated: ${card.generatedAt}`);
  lines.push("");
  lines.push("## Homeroom Summary");
  lines.push("");
  lines.push(`- Skill-floor score: **${card.overallScore}/10**`);
  lines.push(`- School grade: **${card.overallLetterGrade}**`);
  lines.push(`- Average panel score: **${card.averagePanelScore}/10**`);
  lines.push(`- Panel size: **${card.panelCount} specialist agents**`);
  lines.push("");
  lines.push("## Grade Table");
  lines.push("");
  lines.push("| Skill | Score | Grade | Panel Spread |");
  lines.push("|---|---:|---:|---:|");
  card.skills.forEach((skill) => {
    const descriptor = TINA_SKILL_DESCRIPTORS.find((item) => item.id === skill.skillId);
    lines.push(
      `| ${descriptor?.title ?? skill.skillId} | ${skill.score} | ${skill.letterGrade} | ${skill.minimumScore}-${skill.maximumScore} |`
    );
  });
  lines.push("");

  card.skills.forEach((skill, index) => {
    const descriptor = TINA_SKILL_DESCRIPTORS[index];
    lines.push(`## ${index + 1}. ${descriptor.title} — ${skill.letterGrade} (${skill.score}/10)`);
    lines.push("");
    lines.push(`**Complex test:** ${skill.title}`);
    lines.push("");
    lines.push(skill.objective);
    lines.push("");
    lines.push("**Observed strengths**");
    skill.observedStrengths.forEach((item) => lines.push(`- ${item}`));
    lines.push("");
    lines.push("**Why Tina did not earn A+**");
    lines.push(skill.whyNotAPlus);
    lines.push("");
    lines.push("**Observed weaknesses**");
    skill.observedWeaknesses.forEach((item) => lines.push(`- ${item}`));
    lines.push("");
    lines.push("**Teacher comment**");
    lines.push(skill.teacherComment);
    lines.push("");
    lines.push("**Seven-agent panel notes**");
    skill.panelNotes.forEach((note) =>
      lines.push(`- **${note.panelistName}** (${note.specialty}, ${note.score}/10): ${note.note}`)
    );
    lines.push("");
  });

  return lines.join("\n");
}
