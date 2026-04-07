export interface TinaScoreRaisingPass {
  id: string;
  title: string;
  order: number;
  purpose: string;
  whyItRaisesScores: string;
  skillsMoved: string[];
  honestMoveRule: string[];
  notEnoughByItself: string[];
}

export const TINA_SCORE_RAISING_PASSES: TinaScoreRaisingPass[] = [
  {
    id: "pass_1_reviewer_memory",
    title: "Reviewer Memory And Override Governance",
    order: 1,
    purpose:
      "Capture accepts, revisions, rejections, and explicit overrides as durable structured state.",
    whyItRaisesScores:
      "This pass raises Tina's floor by turning reviewer deltas into governed memory instead of forgetting them after the file closes.",
    skillsMoved: [
      "reviewer_learning_loop",
      "reviewer_override_governance",
      "durable_case_memory",
      "confidence_calibration",
      "practice_judgment",
    ],
    honestMoveRule: [
      "Only moves scores if reviewer changes are stored in structured records tied to real file objects.",
      "Only moves scores if later Tina logic can inspect those records instead of treating them like dead notes.",
    ],
    notEnoughByItself: [
      "Does not make Tina numerically right on harder files.",
      "Does not raise live acceptance testing without real reviewer traffic.",
    ],
  },
  {
    id: "pass_2_transaction_truth",
    title: "Transaction Truth And Tie-Out",
    order: 2,
    purpose:
      "Build deterministic numeric proof from source records to workpapers to return-facing amounts.",
    whyItRaisesScores:
      "This is the biggest honest unlock for accounting fluency, document trust, final-form execution, and messy-evidence handling.",
    skillsMoved: [
      "accounting_fluency",
      "record_and_evidence_analysis",
      "form_and_compliance_execution",
      "documentation_and_defensibility",
      "true_final_form_execution",
      "messy_evidence_generalization",
    ],
    honestMoveRule: [
      "Only moves scores if Tina can prove material numbers line by line.",
      "Only moves scores if numeric mismatches block or downgrade output instead of being papered over by clues.",
    ],
    notEnoughByItself: [
      "Does not solve cross-entity contamination on its own.",
      "Does not make Tina elite on tax-law treatment questions without basis and lane work.",
    ],
  },
  {
    id: "pass_3_cross_entity_control",
    title: "Cross-Entity Control And Scope Separation",
    order: 3,
    purpose:
      "Mechanically separate owner flows, intercompany flows, and mixed-entity records into governed return scope.",
    whyItRaisesScores:
      "This pass converts Tina from good at spotting contamination into good at resolving it safely.",
    skillsMoved: [
      "fact_pattern_judgment",
      "entity_and_filing_path_classification",
      "risk_and_materiality_judgment",
      "unknown_pattern_resolution",
      "accounting_fluency",
    ],
    honestMoveRule: [
      "Only moves scores if Tina can explain why each record belongs in this file, another file, or nowhere yet.",
      "Only moves scores if commingled books become mechanically resolvable instead of merely flagged.",
    ],
    notEnoughByItself: [
      "Does not complete non-Schedule-C execution.",
      "Does not make Tina elite on owner-basis math without dedicated modeling.",
    ],
  },
  {
    id: "pass_4_multi_lane_completion",
    title: "Multi-Lane Federal Completion",
    order: 4,
    purpose:
      "Expand Tina from one supported lane to broad federal-family execution.",
    whyItRaisesScores:
      "Tina cannot honestly clear the extraordinary-human bar while major return families remain future-only.",
    skillsMoved: [
      "technical_tax_law",
      "entity_and_filing_path_classification",
      "tax_treatment_selection",
      "form_and_compliance_execution",
      "industry_and_scenario_familiarity",
      "true_final_form_execution",
    ],
    honestMoveRule: [
      "Only moves scores if 1120-S and 1065 reach real draft/readiness/package behavior.",
      "Only moves scores if unsupported-lane honesty remains intact until those flows are actually complete.",
    ],
    notEnoughByItself: [
      "Does not solve basis and capital complexity by itself.",
      "Does not prove elite outcome quality without reviewer acceptance data.",
    ],
  },
  {
    id: "pass_5_basis_and_owner_math",
    title: "Basis, Capital, Debt Basis, And Owner Math",
    order: 5,
    purpose:
      "Model owner-account state numerically so Tina can resolve hard treatment files instead of escalating all of them.",
    whyItRaisesScores:
      "This is one of the clearest divides between a strong prep copilot and a veteran practitioner brain.",
    skillsMoved: [
      "technical_tax_law",
      "accounting_fluency",
      "tax_treatment_selection",
      "industry_and_scenario_familiarity",
      "unknown_pattern_resolution",
      "messy_evidence_generalization",
    ],
    honestMoveRule: [
      "Only moves scores if Tina can show rollforwards and treatment consequences, not just warnings.",
      "Only moves scores if owner flows stop being black-box escalations on major file types.",
    ],
    notEnoughByItself: [
      "Does not create durable legal memory on each position.",
      "Does not create advisor-grade planning on its own.",
    ],
  },
  {
    id: "pass_6_position_memory",
    title: "Authority-Grade Position Memory",
    order: 6,
    purpose:
      "Store tax positions with facts, authority hierarchy, confidence, disclosure posture, and versioned reviewer deltas.",
    whyItRaisesScores:
      "This raises Tina from citation-aware to position-aware, which is necessary for defensibility and responsible final-form behavior.",
    skillsMoved: [
      "technical_tax_law",
      "tax_treatment_selection",
      "documentation_and_defensibility",
      "ethics_and_professional_responsibility",
      "reviewer_override_governance",
      "durable_case_memory",
    ],
    honestMoveRule: [
      "Only moves scores if every material position has a durable factual and legal spine.",
      "Only moves scores if disclosure-sensitive positions cannot slip into output implicitly.",
    ],
    notEnoughByItself: [
      "Does not prove Tina wins against real reviewers.",
      "Does not create richer paper understanding by itself.",
    ],
  },
  {
    id: "pass_7_document_depth",
    title: "Deep Document Intelligence",
    order: 7,
    purpose:
      "Expand Tina's paper understanding across prior returns, elections, ownership records, payroll, fixed assets, and exotic support.",
    whyItRaisesScores:
      "This pass broadens the factual surface Tina can actually reason over, which raises both hard-skill and soft-skill ceilings.",
    skillsMoved: [
      "record_and_evidence_analysis",
      "document_intelligence_depth",
      "industry_and_scenario_familiarity",
      "fact_pattern_judgment",
      "messy_evidence_generalization",
    ],
    honestMoveRule: [
      "Only moves scores if deeper paper classes become structured and consequential in downstream logic.",
      "Only moves scores if completeness and contradiction handling improve with the wider document set.",
    ],
    notEnoughByItself: [
      "Does not create reviewer trust unless the numeric and position layers also use the richer paper stack.",
    ],
  },
  {
    id: "pass_8_live_acceptance",
    title: "Live Acceptance Benchmarking",
    order: 8,
    purpose:
      "Measure Tina against real reviewer outcomes and use that data to re-score skills honestly.",
    whyItRaisesScores:
      "This is the pass that turns internal confidence into external proof.",
    skillsMoved: [
      "live_acceptance_testing_against_reality",
      "confidence_calibration",
      "reviewer_learning_loop",
      "commercial_judgment",
      "practice_judgment",
    ],
    honestMoveRule: [
      "Only moves scores if accepted, revised, and rejected outputs are measured on real files.",
      "Only moves scores if benchmark movement is tied to reviewer outcome windows instead of feature claims.",
    ],
    notEnoughByItself: [
      "Does not fix weak engine layers; it only proves where they still fail.",
    ],
  },
  {
    id: "pass_9_advisor_depth",
    title: "Advisor-Grade Planning And Tradeoff Reasoning",
    order: 9,
    purpose:
      "Turn Tina from a strong guarded prep engine into a truly superior strategic tax advisor.",
    whyItRaisesScores:
      "Ten-plus claims require more than correctness. Tina also needs better-than-veteran planning depth and practical tradeoff judgment.",
    skillsMoved: [
      "tax_planning_and_savings_identification",
      "client_communication",
      "commercial_judgment",
      "practice_judgment",
    ],
    honestMoveRule: [
      "Only moves scores if planning becomes specific, supportable, and operationally useful.",
      "Only moves scores if Tina can compare legal paths and explain why one is better in context.",
    ],
    notEnoughByItself: [
      "Does not matter if core numeric truth and reviewer-trust layers are still weak.",
    ],
  },
];
