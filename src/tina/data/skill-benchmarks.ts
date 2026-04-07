export type TinaBenchmarkCategory = "hard_skill" | "soft_skill";

export interface TinaSkillBenchmarkEntry {
  id: string;
  title: string;
  category: TinaBenchmarkCategory;
  score: number;
  description: string;
  currentConstraint: string;
}

export interface TinaSkillBenchmarkSnapshot {
  asOf: string;
  scale: {
    eight: string;
    ten: string;
  };
  summary: string;
  hardSkills: TinaSkillBenchmarkEntry[];
  softSkills: TinaSkillBenchmarkEntry[];
}

const hardSkills: TinaSkillBenchmarkEntry[] = [
  {
    id: "technical_tax_law",
    title: "Technical Tax Law",
    category: "hard_skill",
    score: 9.5,
    description: "How well Tina identifies the right federal tax law posture, lane rules, and return-family consequences for the facts in front of her.",
    currentConstraint: "Still stronger at route-and-treatment posture than fully numeric doctrine on the ugliest basis, COD, and recapture files.",
  },
  {
    id: "accounting_fluency",
    title: "Accounting Fluency",
    category: "hard_skill",
    score: 8.3,
    description: "How well Tina reconstructs books, separates owner flows from business flows, and turns ugly records into a trustworthy accounting story.",
    currentConstraint: "Still below elite because ledger-grade numeric adjudication is behind owner-flow, basis, and contamination detection.",
  },
  {
    id: "fact_pattern_judgment",
    title: "Fact-Pattern Judgment",
    category: "hard_skill",
    score: 9.3,
    description: "How well Tina understands what actually happened in messy real-world files instead of flattening them into generic buckets.",
    currentConstraint: "Transition-year and ownership-change stories are much better, but still not fully veteran-level on every weird chronology.",
  },
  {
    id: "entity_and_filing_path_classification",
    title: "Entity and Filing-Path Classification",
    category: "hard_skill",
    score: 9.5,
    description: "How well Tina chooses the correct return family and keeps competing entity paths alive when facts are still ambiguous.",
    currentConstraint: "Very strong, but still not perfect on every spouse-owned, transition-year, and evidence-conflict edge case.",
  },
  {
    id: "tax_treatment_selection",
    title: "Tax Treatment Selection",
    category: "hard_skill",
    score: 9.5,
    description: "How well Tina separates use-now, review, and reject positions and ties treatment to actual proof and authority posture.",
    currentConstraint: "Still needs deeper numeric treatment resolution for owner basis, debt basis, COD overlap, and recapture-heavy files.",
  },
  {
    id: "record_and_evidence_analysis",
    title: "Record and Evidence Analysis",
    category: "hard_skill",
    score: 9.4,
    description: "How well Tina measures whether documents, books, and extracted facts are sufficient, credible, and usable for filing work.",
    currentConstraint: "Still better at support-quality discipline than full source-authenticity and completeness judgment on every ugly package.",
  },
  {
    id: "risk_and_materiality_judgment",
    title: "Risk and Materiality Judgment",
    category: "hard_skill",
    score: 9.6,
    description: "How well Tina identifies what is dangerous, what is blocking, and what matters most right now for the file.",
    currentConstraint: "Excellent on known blocker families, but still short of elite tacit materiality instinct on novel combinations of issues.",
  },
  {
    id: "tax_planning_and_savings_identification",
    title: "Tax Planning and Savings Identification",
    category: "hard_skill",
    score: 8.3,
    description: "How well Tina spots legal savings opportunities and sequences them into actionable next steps.",
    currentConstraint: "Good and real, but not yet elite-strategist level on deeper planning architecture and follow-through.",
  },
  {
    id: "form_and_compliance_execution",
    title: "Form and Compliance Execution",
    category: "hard_skill",
    score: 9.4,
    description: "How well Tina converts reviewed facts and treatments into real return-family outputs, support schedules, and filing artifacts.",
    currentConstraint: "Strong on structured package truth, but broader rendered federal-family completion is still not fully end to end.",
  },
  {
    id: "review_and_error_detection",
    title: "Review and Error Detection",
    category: "hard_skill",
    score: 9.7,
    description: "How well Tina catches contradictions, stale signoff, cross-form drift, and other reviewer-critical problems before they slip through.",
    currentConstraint: "Still depends on the breadth of known issue families more than open-ended veteran intuition.",
  },
  {
    id: "documentation_and_defensibility",
    title: "Documentation and Defensibility",
    category: "hard_skill",
    score: 9.9,
    description: "How well Tina packages the file, traces the numbers, and explains what happened so a reviewer can trust the path.",
    currentConstraint: "Near ceiling, but the final point still depends on deeper underlying numeric adjudication in the hardest files.",
  },
  {
    id: "client_communication",
    title: "Client Communication",
    category: "hard_skill",
    score: 8.8,
    description: "How well Tina explains open questions, blockers, and next actions in plain language to the business owner.",
    currentConstraint: "Clear and calm, but still more workflow-driven than truly advisor-grade on nuanced tradeoff conversations.",
  },
  {
    id: "workflow_and_case_management",
    title: "Workflow and Case Management",
    category: "hard_skill",
    score: 9.9,
    description: "How well Tina controls readiness, stale state, review layers, and progression so files do not drift into false completion.",
    currentConstraint: "Very close to ceiling, but still not a fully durable transaction-grade operating system.",
  },
  {
    id: "industry_and_scenario_familiarity",
    title: "Industry and Scenario Familiarity",
    category: "hard_skill",
    score: 9.2,
    description: "How well Tina recognizes different small-business patterns and changes her questions, proof pressure, and treatment expectations accordingly.",
    currentConstraint: "Broad and strong, but still not deep niche-specialist memory across every vertical and scenario family.",
  },
  {
    id: "ethics_and_professional_responsibility",
    title: "Ethics and Professional Responsibility",
    category: "hard_skill",
    score: 9.6,
    description: "How well Tina fails closed, refuses unsupported positions, and stays honest about uncertainty and reviewer dependence.",
    currentConstraint: "Excellent discipline, but still short of a full standards-and-disclosure governance brain.",
  },
  {
    id: "practice_judgment",
    title: "Practice Judgment",
    category: "hard_skill",
    score: 9.9,
    description: "How well Tina sequences what to do first, what can wait, and what a reviewer will care about most in a live file.",
    currentConstraint: "Near ceiling, but the last gap is still elite commercial and human-reviewer intuition on the messiest files.",
  },
];

const softSkills: TinaSkillBenchmarkEntry[] = [
  {
    id: "unknown_pattern_resolution",
    title: "Unknown-Pattern Resolution",
    category: "soft_skill",
    score: 9.2,
    description: "How well Tina handles files that do not fit a canned lane, keeps competing explanations alive, and asks the right proof questions.",
    currentConstraint: "Still needs even richer analogical reasoning on the hardest ownership, basis, and transition-year outliers.",
  },
  {
    id: "confidence_calibration",
    title: "Confidence Calibration",
    category: "soft_skill",
    score: 9.8,
    description: "How well Tina knows when she is sure, when she is stretching, and when a file should stay blocked or reviewer-controlled.",
    currentConstraint: "Very strong, but the last gap is deeper coupling to real-world reviewer outcomes at broader scale.",
  },
  {
    id: "reviewer_learning_loop",
    title: "Reviewer Learning Loop",
    category: "soft_skill",
    score: 9.0,
    description: "How well Tina turns reviewer outcomes into reusable lessons instead of forgetting them after the file closes.",
    currentConstraint: "Good governed learning exists, but scaled real CPA edit ingestion is still not broad enough.",
  },
  {
    id: "true_final_form_execution",
    title: "True Final-Form Execution",
    category: "soft_skill",
    score: 9.2,
    description: "How close Tina is to producing real finished return-family outputs instead of only plans, previews, or reviewer notes.",
    currentConstraint: "Still short of complete rendered end-to-end production across the broader non-Schedule-C federal family.",
  },
  {
    id: "durable_case_memory",
    title: "Durable Case Memory",
    category: "soft_skill",
    score: 9.1,
    description: "How well Tina remembers what changed, what was decided, and what was rejected as the file evolves.",
    currentConstraint: "Strong, but still not a full long-horizon audit-memory system with every reviewer delta at scale.",
  },
  {
    id: "messy_evidence_generalization",
    title: "Messy-Evidence Generalization",
    category: "soft_skill",
    score: 9.2,
    description: "How well Tina stays useful when evidence is partial, contradictory, contaminated, or just plain ugly.",
    currentConstraint: "Improved sharply, but still below elite on the nastiest numeric contamination and owner-flow math cases.",
  },
  {
    id: "reviewer_override_governance",
    title: "Reviewer-Override Governance",
    category: "soft_skill",
    score: 9.3,
    description: "How well Tina records, governs, and surfaces overrides so reviewer authority stays explicit and traceable.",
    currentConstraint: "Strong governed spine exists, but more scaled real override traffic would harden it further.",
  },
  {
    id: "live_acceptance_testing_against_reality",
    title: "Live Acceptance Testing Against Reality",
    category: "soft_skill",
    score: 8.1,
    description: "How well Tina is tested against what real reviewers actually accept, reject, and change in production-like files.",
    currentConstraint: "Still the weakest extra benchmark because real CPA delta ingestion is not yet broad enough.",
  },
  {
    id: "document_intelligence_depth",
    title: "Document-Intelligence Depth",
    category: "soft_skill",
    score: 8.4,
    description: "How well Tina reads and classifies the deeper paper stack such as prior returns, elections, ownership records, payroll, and asset support.",
    currentConstraint: "Good depth is in place, but still not exhaustive across every exotic paper family and legal record type.",
  },
  {
    id: "commercial_judgment",
    title: "Commercial Judgment",
    category: "soft_skill",
    score: 9.3,
    description: "How well Tina focuses on what matters now, what is worth chasing, and what will actually save reviewer or founder time.",
    currentConstraint: "Strong and useful, but still not fully elite-strategist in every planning and prioritization situation.",
  },
];

export const TINA_SKILL_BENCHMARKS_CURRENT: TinaSkillBenchmarkSnapshot = {
  asOf: "2026-04-06",
  scale: {
    eight: "8 = extraordinary 100-year CPA veteran ceiling",
    ten: "10 = that ceiling plus AI leverage",
  },
  summary:
    "Current Tina benchmark snapshot for the 16 hard skills and 10 soft-skill-style elite outcomes. These are honest benchmark scores, not inflated gate scores.",
  hardSkills,
  softSkills,
};

export const TINA_HARD_SKILL_BENCHMARKS_CURRENT = hardSkills;
export const TINA_SOFT_SKILL_BENCHMARKS_CURRENT = softSkills;
