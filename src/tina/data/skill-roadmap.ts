export type TinaRoadmapTier = "p0_to_8_plus" | "p1_to_9" | "p2_to_10_plus";

export interface TinaRoadmapWorkstream {
  id: string;
  title: string;
  tier: TinaRoadmapTier;
  whyItMatters: string;
  requiredForSkills: string[];
  deliverables: string[];
  successCriteria: string[];
}

export interface TinaRoadmapSnapshot {
  asOf: string;
  planningAnchor: string;
  scale: {
    eight: string;
    ten: string;
  };
  benchmarkRule: string;
  workstreams: TinaRoadmapWorkstream[];
}

const workstreams: TinaRoadmapWorkstream[] = [
  {
    id: "reviewer_outcome_memory",
    title: "Reviewer Outcome Memory And Learning Loop",
    tier: "p0_to_8_plus",
    whyItMatters:
      "Tina cannot credibly reach the 8-plus threshold without learning from what real reviewers accepted, changed, or rejected.",
    requiredForSkills: [
      "reviewer_learning_loop",
      "reviewer_override_governance",
      "live_acceptance_testing_against_reality",
      "durable_case_memory",
      "practice_judgment",
    ],
    deliverables: [
      "Persistent reviewer decision records tied to file, issue, treatment, and form output",
      "Explicit override objects with before/after state and why the override happened",
      "Reusable outcome-pattern summaries that later files can consult",
    ],
    successCriteria: [
      "A reviewer change never disappears into free-text notes",
      "Tina can explain what a reviewer changed on a prior similar file",
      "Benchmark scores do not move upward unless real reviewer deltas are captured",
    ],
  },
  {
    id: "transaction_level_tie_out",
    title: "Transaction-Level Tie-Out Engine",
    tier: "p0_to_8_plus",
    whyItMatters:
      "Accounting fluency and final-form trust will stay capped until Tina proves every material amount instead of inferring from clues.",
    requiredForSkills: [
      "accounting_fluency",
      "record_and_evidence_analysis",
      "form_and_compliance_execution",
      "documentation_and_defensibility",
      "messy_evidence_generalization",
    ],
    deliverables: [
      "Ledger or transaction ingestion with normalized posting lines",
      "Deterministic tie-out from raw records to workpaper lines and final return-facing amounts",
      "Mismatch classes for scale errors, duplicates, contamination, and unsupported balances",
    ],
    successCriteria: [
      "Material amounts can be traced from source records through every workpaper layer",
      "Tina can prove why a final number differs from book totals",
      "Messy-book scenarios block on unresolved numeric truth instead of advancing on pattern clues alone",
    ],
  },
  {
    id: "cross_entity_normalization",
    title: "Cross-Entity Normalization And Scope Control",
    tier: "p0_to_8_plus",
    whyItMatters:
      "Commingled entities, owner flows, and multi-EIN contamination are the biggest current ceiling on Tina's real-world reliability.",
    requiredForSkills: [
      "accounting_fluency",
      "fact_pattern_judgment",
      "entity_and_filing_path_classification",
      "risk_and_materiality_judgment",
      "unknown_pattern_resolution",
    ],
    deliverables: [
      "Entity mapping layer for books, documents, EINs, and return scope",
      "Intercompany and owner-flow separation logs",
      "Return-scope inclusion and exclusion reasoning attached to each normalization decision",
    ],
    successCriteria: [
      "Tina can show why a record belongs in this return, another return, or nowhere yet",
      "Multi-entity files stay separated instead of collapsing into generic warnings",
      "Entity contamination is mechanically resolvable, not only detected",
    ],
  },
  {
    id: "multi_lane_federal_completion",
    title: "Multi-Lane Federal Return Completion",
    tier: "p1_to_9",
    whyItMatters:
      "Tina cannot be treated as elite while broad federal-family execution stops at the first supported lane.",
    requiredForSkills: [
      "technical_tax_law",
      "entity_and_filing_path_classification",
      "tax_treatment_selection",
      "form_and_compliance_execution",
      "true_final_form_execution",
    ],
    deliverables: [
      "Deterministic 1120-S draft and readiness path",
      "Deterministic 1065 draft and readiness path",
      "Lane-specific package rules, blockers, and reviewer packet outputs",
    ],
    successCriteria: [
      "Unsupported-lane failure stays honest until the lane is genuinely complete",
      "Non-Schedule-C files can move from books to return-family output without pretending",
      "Lane-specific edge cases have explicit blockers and supporting workpapers",
    ],
  },
  {
    id: "basis_capital_and_owner_accounts",
    title: "Basis, Capital, Debt Basis, And Owner-Account Modeling",
    tier: "p1_to_9",
    whyItMatters:
      "This is one of the clearest remaining gaps between guarded prep software and practitioner-grade tax judgment.",
    requiredForSkills: [
      "technical_tax_law",
      "accounting_fluency",
      "tax_treatment_selection",
      "industry_and_scenario_familiarity",
      "unknown_pattern_resolution",
    ],
    deliverables: [
      "Shareholder basis rollforward model",
      "Partner capital and debt-basis rollforward model",
      "Owner draw, distribution, contribution, and loan characterization engine",
    ],
    successCriteria: [
      "Owner-flow treatment is resolved numerically instead of only escalated categorically",
      "Tina can explain how distributions, losses, and debt basis interact on the file",
      "Return-facing limits and support schedules are tied to modeled owner-account state",
    ],
  },
  {
    id: "authority_position_memory",
    title: "Authority-Grade Position Memory",
    tier: "p1_to_9",
    whyItMatters:
      "A real elite system does not just store citations. It stores defended positions with confidence, disclosure consequences, and change history.",
    requiredForSkills: [
      "technical_tax_law",
      "tax_treatment_selection",
      "documentation_and_defensibility",
      "ethics_and_professional_responsibility",
      "reviewer_override_governance",
    ],
    deliverables: [
      "Position records tied to facts, authority hierarchy, confidence, and disclosure posture",
      "Versioned position changes with reviewer decisions and rationale deltas",
      "Return-impact rule that only activates positions in an approved usable state",
    ],
    successCriteria: [
      "Every claimed tax position has a durable legal and factual spine",
      "A reviewer can see what changed in a position and why",
      "Disclosure-sensitive positions never slip into final output implicitly",
    ],
  },
  {
    id: "document_intelligence_expansion",
    title: "Deep Document Intelligence Expansion",
    tier: "p1_to_9",
    whyItMatters:
      "Document depth is still below elite on exotic paper families, elections, ownership records, and asset support.",
    requiredForSkills: [
      "record_and_evidence_analysis",
      "document_intelligence_depth",
      "industry_and_scenario_familiarity",
      "messy_evidence_generalization",
    ],
    deliverables: [
      "Deeper parsers for prior returns, elections, ownership documents, payroll support, and fixed-asset support",
      "Completeness scoring for partial or low-trust document sets",
      "Cross-document contradiction graphs instead of isolated clue items",
    ],
    successCriteria: [
      "Tina can classify and use a broader paper stack without flattening important nuance",
      "Exotic document families produce structured facts and scope consequences",
      "Document support depth improves downstream tie-out and form completion quality",
    ],
  },
  {
    id: "live_acceptance_benchmarking",
    title: "Live Acceptance Benchmarking Against Real Reviewer Outcomes",
    tier: "p2_to_10_plus",
    whyItMatters:
      "Ten-plus claims are not believable unless Tina is being judged against real reviewer acceptance on real files.",
    requiredForSkills: [
      "confidence_calibration",
      "reviewer_learning_loop",
      "live_acceptance_testing_against_reality",
      "commercial_judgment",
      "practice_judgment",
    ],
    deliverables: [
      "Acceptance ledger for accepted, revised, and rejected outputs",
      "Skill-by-skill rescoring rules tied to real reviewer outcome windows",
      "Benchmark dashboards showing where Tina still diverges from human reviewer decisions",
    ],
    successCriteria: [
      "Score movement is backed by reviewer outcome data, not optimism",
      "Tina can quantify where reviewers still disagree with her",
      "Ten-plus claims are reserved for areas where Tina has repeated outcome dominance",
    ],
  },
  {
    id: "planning_depth_and_advisor_mode",
    title: "Planning Depth And Advisor-Grade Tradeoff Reasoning",
    tier: "p2_to_10_plus",
    whyItMatters:
      "Strong compliance and cleanup are not enough to beat an extraordinary CPA. Tina also needs high-end planning architecture and tradeoff advice.",
    requiredForSkills: [
      "tax_planning_and_savings_identification",
      "client_communication",
      "commercial_judgment",
      "practice_judgment",
    ],
    deliverables: [
      "Structured planning scenarios with required facts, authority posture, and payoff windows",
      "Tradeoff explanations that compare options instead of only gating them",
      "Sequenced next-step planning tied to reviewer and owner constraints",
    ],
    successCriteria: [
      "Tina can explain why one legal path is better than another for this operator",
      "Planning suggestions are specific, supportable, and operationally usable",
      "Client-facing advice shifts from workflow clarity to true advisor-grade judgment",
    ],
  },
];

export const TINA_TO_10_ROADMAP: TinaRoadmapSnapshot = {
  asOf: "2026-04-06",
  planningAnchor:
    "Conservative 2026-04-06 live-checkout baseline in src/tina/docs/benchmarks/2026-04-06-skill-benchmark-baseline.md",
  scale: {
    eight: "8 = extraordinary 100-year CPA veteran ceiling",
    ten: "10 = that ceiling plus AI leverage",
  },
  benchmarkRule:
    "Do not move a score because a gate passes or a feature exists. Only move a score when engine-level capability and real reviewer-trust outcomes improve.",
  workstreams,
};

