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
    score: 6.0,
    description: "How well Tina identifies the right federal tax law posture, lane rules, and return-family consequences for the facts in front of her.",
    currentConstraint: "Strong within the Schedule C lane, but still not broad or deep enough across the harder doctrine families to claim elite expert range.",
  },
  {
    id: "accounting_fluency",
    title: "Accounting Fluency",
    category: "hard_skill",
    score: 8.1,
    description: "How well Tina reconstructs books, separates owner flows from business flows, and turns ugly records into a trustworthy accounting story.",
    currentConstraint: "Transaction lineage is now strong, but still not fully transaction-by-transaction adjudication on the nastiest contaminated books.",
  },
  {
    id: "fact_pattern_judgment",
    title: "Fact-Pattern Judgment",
    category: "hard_skill",
    score: 7.6,
    description: "How well Tina understands what actually happened in messy real-world files instead of flattening them into generic buckets.",
    currentConstraint: "Current-lane scenario reading is much better, but novel chronology and ownership edge cases still cap the score.",
  },
  {
    id: "entity_and_filing_path_classification",
    title: "Entity and Filing-Path Classification",
    category: "hard_skill",
    score: 6.2,
    description: "How well Tina chooses the correct return family and keeps competing entity paths alive when facts are still ambiguous.",
    currentConstraint: "Still limited by narrow lane support and not yet broad enough to justify an elite filing-path score.",
  },
  {
    id: "tax_treatment_selection",
    title: "Tax Treatment Selection",
    category: "hard_skill",
    score: 8.0,
    description: "How well Tina separates use-now, review, and reject positions and ties treatment to actual proof and authority posture.",
    currentConstraint: "Governed scenario families are real now, but reviewer-backed treatment breadth is still not deep enough to go beyond a cautious 8.",
  },
  {
    id: "record_and_evidence_analysis",
    title: "Record and Evidence Analysis",
    category: "hard_skill",
    score: 8.2,
    description: "How well Tina measures whether documents, books, and extracted facts are sufficient, credible, and usable for filing work.",
    currentConstraint: "Very strong in the supported lane, but still not exhaustive across broader paper families and harder authenticity problems.",
  },
  {
    id: "risk_and_materiality_judgment",
    title: "Risk and Materiality Judgment",
    category: "hard_skill",
    score: 7.3,
    description: "How well Tina identifies what is dangerous, what is blocking, and what matters most right now for the file.",
    currentConstraint: "Good blocker instinct is in place, but the softer veteran materiality intuition still needs more real reviewer proof.",
  },
  {
    id: "tax_planning_and_savings_identification",
    title: "Tax Planning and Savings Identification",
    category: "hard_skill",
    score: 4.9,
    description: "How well Tina spots legal savings opportunities and sequences them into actionable next steps.",
    currentConstraint: "Still the weakest hard-skill area because planning architecture and alternative-path tradeoff depth are not built deeply enough.",
  },
  {
    id: "form_and_compliance_execution",
    title: "Form and Compliance Execution",
    category: "hard_skill",
    score: 8.2,
    description: "How well Tina converts reviewed facts and treatments into real return-family outputs, support schedules, and filing artifacts.",
    currentConstraint: "MeF-aligned handoff and export mapping are real, but broader rendered completion still stops this from being comfortably above 8.",
  },
  {
    id: "review_and_error_detection",
    title: "Review and Error Detection",
    category: "hard_skill",
    score: 8.2,
    description: "How well Tina catches contradictions, stale signoff, cross-form drift, and other reviewer-critical problems before they slip through.",
    currentConstraint: "Excellent in the known scenario families, but still not fully open-ended on every exotic edge case.",
  },
  {
    id: "documentation_and_defensibility",
    title: "Documentation and Defensibility",
    category: "hard_skill",
    score: 8.5,
    description: "How well Tina packages the file, traces the numbers, and explains what happened so a reviewer can trust the path.",
    currentConstraint: "One of Tina's strongest categories, but still capped by reviewer-scale proof and deeper universal numeric adjudication.",
  },
  {
    id: "client_communication",
    title: "Client Communication",
    category: "hard_skill",
    score: 7.0,
    description: "How well Tina explains open questions, blockers, and next actions in plain language to the business owner.",
    currentConstraint: "Clearer than before, especially with the guided shell, but still not advisor-grade across nuanced planning conversations.",
  },
  {
    id: "workflow_and_case_management",
    title: "Workflow and Case Management",
    category: "hard_skill",
    score: 7.9,
    description: "How well Tina controls readiness, stale state, review layers, and progression so files do not drift into false completion.",
    currentConstraint: "Very strong on guarded workflow, but still not a fully matured operating system with scaled reviewer traffic and lane breadth.",
  },
  {
    id: "industry_and_scenario_familiarity",
    title: "Industry and Scenario Familiarity",
    category: "hard_skill",
    score: 6.4,
    description: "How well Tina recognizes different small-business patterns and changes her questions, proof pressure, and treatment expectations accordingly.",
    currentConstraint: "Current-lane scenario families are much deeper, but this is still not broad niche-specialist coverage.",
  },
  {
    id: "ethics_and_professional_responsibility",
    title: "Ethics and Professional Responsibility",
    category: "hard_skill",
    score: 6.9,
    description: "How well Tina fails closed, refuses unsupported positions, and stays honest about uncertainty and reviewer dependence.",
    currentConstraint: "Still strong and conservative, but not yet a full professional-standards governance brain.",
  },
  {
    id: "practice_judgment",
    title: "Practice Judgment",
    category: "hard_skill",
    score: 8.1,
    description: "How well Tina sequences what to do first, what can wait, and what a reviewer will care about most in a live file.",
    currentConstraint: "Strong in the supported lane, but still not broad enough or battle-tested enough to claim veteran-superhuman range.",
  },
];

const softSkills: TinaSkillBenchmarkEntry[] = [
  {
    id: "unknown_pattern_resolution",
    title: "Unknown-Pattern Resolution",
    category: "soft_skill",
    score: 6.5,
    description: "How well Tina handles files that do not fit a canned lane, keeps competing explanations alive, and asks the right proof questions.",
    currentConstraint: "Much stronger in current Schedule C scenario families, but still not truly elite on unfamiliar outliers.",
  },
  {
    id: "confidence_calibration",
    title: "Confidence Calibration",
    category: "soft_skill",
    score: 8.1,
    description: "How well Tina knows when she is sure, when she is stretching, and when a file should stay blocked or reviewer-controlled.",
    currentConstraint: "One of the strongest soft skills now, but still capped by limited real reviewer-volume evidence.",
  },
  {
    id: "reviewer_learning_loop",
    title: "Reviewer Learning Loop",
    category: "soft_skill",
    score: 6.8,
    description: "How well Tina turns reviewer outcomes into reusable lessons instead of forgetting them after the file closes.",
    currentConstraint: "The importer and memory loop are real, but the branch still lacks a real high-volume CPA review batch.",
  },
  {
    id: "true_final_form_execution",
    title: "True Final-Form Execution",
    category: "soft_skill",
    score: 8.3,
    description: "How close Tina is to producing real finished return-family outputs instead of only plans, previews, or reviewer notes.",
    currentConstraint: "Schedule C handoff is getting close to elite, but universal finished-return execution is still not there.",
  },
  {
    id: "durable_case_memory",
    title: "Durable Case Memory",
    category: "soft_skill",
    score: 7.5,
    description: "How well Tina remembers what changed, what was decided, and what was rejected as the file evolves.",
    currentConstraint: "Durable and governed now, but not yet a long-horizon memory system at real reviewer traffic scale.",
  },
  {
    id: "messy_evidence_generalization",
    title: "Messy-Evidence Generalization",
    category: "soft_skill",
    score: 8.0,
    description: "How well Tina stays useful when evidence is partial, contradictory, contaminated, or just plain ugly.",
    currentConstraint: "This is now honestly at the threshold of 8 in the supported lane, but still not far beyond it.",
  },
  {
    id: "reviewer_override_governance",
    title: "Reviewer-Override Governance",
    category: "soft_skill",
    score: 7.1,
    description: "How well Tina records, governs, and surfaces overrides so reviewer authority stays explicit and traceable.",
    currentConstraint: "Governance is real now, but broader live override traffic is still the missing proof layer.",
  },
  {
    id: "live_acceptance_testing_against_reality",
    title: "Live Acceptance Testing Against Reality",
    category: "soft_skill",
    score: 6.2,
    description: "How well Tina is tested against what real reviewers actually accept, reject, and change in production-like files.",
    currentConstraint: "Still capped hardest by the missing real imported CPA review batch in this workspace.",
  },
  {
    id: "document_intelligence_depth",
    title: "Document-Intelligence Depth",
    category: "soft_skill",
    score: 7.8,
    description: "How well Tina reads and classifies the deeper paper stack such as prior returns, elections, ownership records, payroll, and asset support.",
    currentConstraint: "Much deeper than before, but still not exhaustive across every hard paper family or weird legal record.",
  },
  {
    id: "commercial_judgment",
    title: "Commercial Judgment",
    category: "soft_skill",
    score: 7.4,
    description: "How well Tina focuses on what matters now, what is worth chasing, and what will actually save reviewer or founder time.",
    currentConstraint: "Improved meaningfully, but still not elite planner-level across the full range of tax tradeoffs.",
  },
];

export const TINA_SKILL_BENCHMARKS_CURRENT: TinaSkillBenchmarkSnapshot = {
  asOf: "2026-04-08",
  scale: {
    eight: "8 = extraordinary 100-year CPA veteran ceiling",
    ten: "10 = that ceiling plus AI leverage",
  },
  summary:
    "Current honest Tina benchmark snapshot after the Schedule C domination push. These scores reflect the actual branch state and stay capped where real reviewer-volume evidence is still missing.",
  hardSkills,
  softSkills,
};

export const TINA_HARD_SKILL_BENCHMARKS_CURRENT = hardSkills;
export const TINA_SOFT_SKILL_BENCHMARKS_CURRENT = softSkills;
