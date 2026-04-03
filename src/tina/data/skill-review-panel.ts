import type { TinaPanelistReview } from "@/tina/lib/skill-report-card-contracts";

export const TINA_SKILL_REVIEW_PANEL: TinaPanelistReview[] = [
  {
    id: "archimedes",
    name: "Archimedes",
    specialty: "Tax strategist",
    overallScore: 6.8,
    overallVerdict:
      "Strong reviewer-assist engine with real authority gating, but not yet an elite tax savings strategist.",
    scores: {
      technical_tax_law: 6.5,
      accounting_fluency: 5.5,
      fact_pattern_judgment: 7,
      entity_and_filing_path_classification: 7,
      tax_treatment_selection: 6.5,
      record_and_evidence_analysis: 7.5,
      risk_and_materiality_judgment: 6.5,
      tax_planning_and_savings_identification: 6,
      form_and_compliance_execution: 6,
      review_and_error_detection: 7.5,
      documentation_and_defensibility: 8,
      client_communication: 6,
      workflow_and_case_management: 8,
      industry_and_scenario_familiarity: 5.5,
      ethics_and_professional_responsibility: 8,
      practice_judgment: 6.5,
    },
    notes: {
      technical_tax_law:
        "Authority posture is disciplined, but Tina still treats legal support more like workflow metadata than a full doctrine engine.",
      accounting_fluency:
        "Books cleanup is improving, yet Tina still reads more like a triage system than a veteran who can fully rebuild ugly ledgers.",
      fact_pattern_judgment:
        "She is good at spotting contradictions and weird ownership clues before deeper prep runs.",
      entity_and_filing_path_classification:
        "Routing is respectable, but other entity lanes are still recognized more often than truly handled.",
      tax_treatment_selection:
        "Buckets are sensible, though Tina still lacks richer comparative treatment analysis when multiple lawful options exist.",
      record_and_evidence_analysis:
        "Evidence sufficiency is one of her strongest reviewer-grade muscles right now.",
      risk_and_materiality_judgment:
        "She can escalate danger, but still leans more toward review than calibrated strategic risk-taking.",
      tax_planning_and_savings_identification:
        "The opportunity engine is directionally strong, but still too curated to feel like elite planning.",
      form_and_compliance_execution:
        "Execution readiness is ahead of true final-form depth, especially outside Schedule C.",
      review_and_error_detection:
        "Reviewer challenge modeling is strong and already catches many of the right objections.",
      documentation_and_defensibility:
        "Documentation is excellent structurally, even when upstream judgment is thinner.",
      client_communication:
        "Owner and reviewer language is clear, but not yet as nuanced as a veteran advisor.",
      workflow_and_case_management:
        "Workflow control is one of Tina’s strongest categories and keeps weak ideas contained.",
      industry_and_scenario_familiarity:
        "Industry playbooks help, but they are still broad buckets rather than deep sector instincts.",
      ethics_and_professional_responsibility:
        "Fail-closed discipline is already real and unusual for this stage.",
      practice_judgment:
        "Tina is learning skeptical senior-preparer behavior, but still depends on explicit thresholds too much.",
    },
  },
  {
    id: "meitner",
    name: "Meitner",
    specialty: "Federal forms and compliance",
    overallScore: 5.8,
    overallVerdict:
      "Reviewer-grade backend package, but still not a filing-grade federal forms execution engine.",
    scores: {
      technical_tax_law: 6,
      accounting_fluency: 6,
      fact_pattern_judgment: 7,
      entity_and_filing_path_classification: 8,
      tax_treatment_selection: 6,
      record_and_evidence_analysis: 8,
      risk_and_materiality_judgment: 7,
      tax_planning_and_savings_identification: 6,
      form_and_compliance_execution: 3,
      review_and_error_detection: 8,
      documentation_and_defensibility: 8,
      client_communication: 7,
      workflow_and_case_management: 8,
      industry_and_scenario_familiarity: 5,
      ethics_and_professional_responsibility: 8,
      practice_judgment: 6,
    },
    notes: {
      technical_tax_law:
        "The legal scaffolding is credible, but it still does not fully close into completed companion forms and disclosures.",
      accounting_fluency:
        "Books control is decent, yet unresolved contamination still limits filing trust.",
      fact_pattern_judgment:
        "Tina is better at identifying review-only complexity than pretending it is simple.",
      entity_and_filing_path_classification:
        "Classification is close to veteran-grade inside the modeled return families.",
      tax_treatment_selection:
        "Treatment calls are cautious, but too many important items remain review-state rather than settled positions.",
      record_and_evidence_analysis:
        "Support grading is one of the clearest strengths in the compliance stack.",
      risk_and_materiality_judgment:
        "She knows what should stop the file, even if she cannot always turn that into a finished alternative.",
      tax_planning_and_savings_identification:
        "Savings logic exists, but planning ideas still outrun filing execution and disclosure closure.",
      form_and_compliance_execution:
        "This is the biggest weakness: Tina still does not build finished official federal form sets.",
      review_and_error_detection:
        "Cross-form checks and readiness gates are strong reviewer controls.",
      documentation_and_defensibility:
        "The packet is defensible as a review artifact, not yet as a submission-grade filing set.",
      client_communication:
        "Owner-facing asks are clear, though final filing instructions remain thin.",
      workflow_and_case_management:
        "Signoff, snapshot, and drift logic are mature for this phase.",
      industry_and_scenario_familiarity:
        "Industry depth is still too shallow to protect compliance quality across messy verticals.",
      ethics_and_professional_responsibility:
        "Tina is honest about not being a filed-return engine yet, which is exactly right.",
      practice_judgment:
        "She can prioritize issues, but not yet ship a truly complete filing package from that priority stack.",
    },
  },
  {
    id: "heisenberg",
    name: "Heisenberg",
    specialty: "Veteran small-business CPA",
    overallScore: 6.2,
    overallVerdict:
      "Promising reviewer-grade backend judgment for supported Schedule C files, but still far from a veteran across messy small-business returns.",
    scores: {
      technical_tax_law: 6,
      accounting_fluency: 5,
      fact_pattern_judgment: 6.5,
      entity_and_filing_path_classification: 7,
      tax_treatment_selection: 5.5,
      record_and_evidence_analysis: 7,
      risk_and_materiality_judgment: 5.5,
      tax_planning_and_savings_identification: 5,
      form_and_compliance_execution: 4.5,
      review_and_error_detection: 7,
      documentation_and_defensibility: 8,
      client_communication: 6,
      workflow_and_case_management: 7.5,
      industry_and_scenario_familiarity: 5.5,
      ethics_and_professional_responsibility: 8.5,
      practice_judgment: 5.5,
    },
    notes: {
      technical_tax_law:
        "The rule spine is respectable, but still concentrated around one narrow lane and routing away from the harder ones.",
      accounting_fluency:
        "Tina is better than book-label trust, but nowhere near the ledger intuition of a cleanup-heavy CPA.",
      fact_pattern_judgment:
        "She sees many weird facts early, but still relies too much on explicit clue extraction.",
      entity_and_filing_path_classification:
        "Routing is disciplined, yet classification is stronger than completion.",
      tax_treatment_selection:
        "She can say review/reject/use, but not yet with enough nuance for hard gray areas.",
      record_and_evidence_analysis:
        "Line-level proof handling is strong, though credibility judgment is still limited.",
      risk_and_materiality_judgment:
        "Materiality feels more rules-based than practice-based right now.",
      tax_planning_and_savings_identification:
        "Planning exists, but it does not yet feel like an aggressive veteran shaping the year.",
      form_and_compliance_execution:
        "The form layer is still a planning engine, not a real last-mile filing engine.",
      review_and_error_detection:
        "Tina is very good at catching contradictions before they become polished nonsense.",
      documentation_and_defensibility:
        "Documentation is already one of the best parts of the system.",
      client_communication:
        "The owner/reviewer split is good, but it still is not battle-tested client management.",
      workflow_and_case_management:
        "Workflow discipline is unusually mature for a prep backend.",
      industry_and_scenario_familiarity:
        "Industry playbooks help, but still feel broad rather than lived-in.",
      ethics_and_professional_responsibility:
        "Fail-closed behavior is strong and gives Tina real professional restraint.",
      practice_judgment:
        "She is still more comprehensive than street-smart about what matters most first.",
    },
  },
  {
    id: "newton",
    name: "Newton",
    specialty: "Accounting forensics",
    overallScore: 6.2,
    overallVerdict:
      "Closer to a reviewer-control and tax-routing engine than to a true books-reconstruction engine.",
    scores: {
      technical_tax_law: 6.5,
      accounting_fluency: 4,
      fact_pattern_judgment: 6.5,
      entity_and_filing_path_classification: 7,
      tax_treatment_selection: 5.5,
      record_and_evidence_analysis: 6.5,
      risk_and_materiality_judgment: 6,
      tax_planning_and_savings_identification: 5.5,
      form_and_compliance_execution: 5,
      review_and_error_detection: 6.5,
      documentation_and_defensibility: 7.5,
      client_communication: 6.5,
      workflow_and_case_management: 7,
      industry_and_scenario_familiarity: 5.5,
      ethics_and_professional_responsibility: 8,
      practice_judgment: 6,
    },
    notes: {
      technical_tax_law:
        "Legal posture is stronger than the accounting substrate feeding it.",
      accounting_fluency:
        "This is the biggest weakness: Tina still reasons from clues and mapped lines rather than true ledger proof.",
      fact_pattern_judgment:
        "She notices ownership and contamination problems, but still lacks deeper chronology reconstruction.",
      entity_and_filing_path_classification:
        "Lane control is strong enough to stop many wrong-path mistakes.",
      tax_treatment_selection:
        "Treatment quality is capped by the shallow books picture underneath it.",
      record_and_evidence_analysis:
        "Evidence is line-aware, but still not population-aware or completeness-aware enough.",
      risk_and_materiality_judgment:
        "Materiality is decent, but not yet tied tightly to actual distortion magnitude.",
      tax_planning_and_savings_identification:
        "Planning is only as reliable as the reconstructed facts, and those facts are still thin.",
      form_and_compliance_execution:
        "A return can be mathematically coherent while still economically wrong if the books story is off.",
      review_and_error_detection:
        "Internal consistency checks help, but they are not the same as proving truth against books.",
      documentation_and_defensibility:
        "The packet is strong, though it can still document clue-derived assumptions too confidently.",
      client_communication:
        "Tina explains missing support well, but not always the accounting difference between queued and truly resolved.",
      workflow_and_case_management:
        "Workflow is ahead of the accounting engine itself.",
      industry_and_scenario_familiarity:
        "Industry handling still requests records more often than it reconstructs the underlying economics.",
      ethics_and_professional_responsibility:
        "The ethical posture is strong, especially around not bluffing through thin books.",
      practice_judgment:
        "A veteran would know sooner when to stop mapping lines and fully rebuild the books instead.",
    },
  },
  {
    id: "planck",
    name: "Planck",
    specialty: "Backend architecture",
    overallScore: 6.6,
    overallVerdict:
      "A sophisticated pure-function compiler over a draft object, not yet a durable tax-prep operating system.",
    scores: {
      technical_tax_law: 6.5,
      accounting_fluency: 6,
      fact_pattern_judgment: 7,
      entity_and_filing_path_classification: 7,
      tax_treatment_selection: 6.5,
      record_and_evidence_analysis: 7.5,
      risk_and_materiality_judgment: 6.25,
      tax_planning_and_savings_identification: 6,
      form_and_compliance_execution: 5.5,
      review_and_error_detection: 7.5,
      documentation_and_defensibility: 8,
      client_communication: 5.5,
      workflow_and_case_management: 7,
      industry_and_scenario_familiarity: 5.5,
      ethics_and_professional_responsibility: 6.5,
      practice_judgment: 6.5,
    },
    notes: {
      technical_tax_law:
        "The law layer is respectable, but not yet a versioned authority knowledge system with replayable provenance.",
      accounting_fluency:
        "The books engines are well-factored conceptually, but still operate on interpreted snapshots rather than durable accounting state.",
      fact_pattern_judgment:
        "Judgment is strong within the rule graph, yet still recomposed from one workspace object instead of persistent adjudication history.",
      entity_and_filing_path_classification:
        "Classification breadth now outruns execution breadth, which is a structural cap.",
      tax_treatment_selection:
        "Treatment logic is expressive, but not yet governed by a first-class policy registry.",
      record_and_evidence_analysis:
        "Evidence sufficiency is architected well, though it still lacks a durable evidence graph.",
      risk_and_materiality_judgment:
        "Risk and materiality are mostly emergent from many engines rather than a unified calibrated model.",
      tax_planning_and_savings_identification:
        "Planning exists in the engine spine, but still as generated outputs rather than scenario simulation.",
      form_and_compliance_execution:
        "Execution is planning-heavy and renderer-light; there is no final submission-grade boundary yet.",
      review_and_error_detection:
        "Review intelligence is strong, but the review workflow is not yet a persisted state machine.",
      documentation_and_defensibility:
        "Artifact synthesis is excellent even if workpaper persistence is still limited.",
      client_communication:
        "Communication is output generation, not a managed communication subsystem.",
      workflow_and_case_management:
        "Workflow control is good for a library system, but still draft-centric rather than transactional.",
      industry_and_scenario_familiarity:
        "Industry support is modeled as pluggable overlays, not domain-deep modules.",
      ethics_and_professional_responsibility:
        "Guardrails are good, but governance and override analytics are still weak.",
      practice_judgment:
        "Practice judgment is encoded across safeguards, not formalized as a durable decision-governance layer.",
    },
  },
  {
    id: "galileo",
    name: "Galileo",
    specialty: "Adversarial tax reviewer",
    overallScore: 5.4,
    overallVerdict:
      "Ahead of toy-tax-assistant territory, but still too heuristic, self-referential, and draft-centric to earn hard reviewer trust.",
    scores: {
      technical_tax_law: 5,
      accounting_fluency: 6,
      fact_pattern_judgment: 5.5,
      entity_and_filing_path_classification: 5,
      tax_treatment_selection: 6,
      record_and_evidence_analysis: 5.5,
      risk_and_materiality_judgment: 6,
      tax_planning_and_savings_identification: 5,
      form_and_compliance_execution: 4.5,
      review_and_error_detection: 7,
      documentation_and_defensibility: 6,
      client_communication: 5,
      workflow_and_case_management: 6,
      industry_and_scenario_familiarity: 5,
      ethics_and_professional_responsibility: 6.5,
      practice_judgment: 5.5,
    },
    notes: {
      technical_tax_law:
        "The tax-law layer is still too thin and too dependent on trail labels rather than deep authority reasoning.",
      accounting_fluency:
        "Normalization is good, but Tina still does not prove books-to-return truth against a real ledger.",
      fact_pattern_judgment:
        "A lot of the confidence still comes from organizer answers and clue strings rather than legal-history proof.",
      entity_and_filing_path_classification:
        "Classification is cautious, but it still can be overconfident inside a narrow modeled universe.",
      tax_treatment_selection:
        "Treatment buckets are better than nothing, but still shallow in close cases.",
      record_and_evidence_analysis:
        "Evidence scores are too count-driven and can turn repeated weak premises into fake confidence.",
      risk_and_materiality_judgment:
        "Known labels block well, but truly novel material problems can still slip through the graph.",
      tax_planning_and_savings_identification:
        "Planning currently feels more like a curated idea queue than a truly credible planning engine.",
      form_and_compliance_execution:
        "The operator could mistake polished overlays and wording for finished official-form execution.",
      review_and_error_detection:
        "This is one of the stronger skeptical layers, though it still inherits upstream blind spots.",
      documentation_and_defensibility:
        "The packet is structured, but too much of it is still self-referential to Tina’s own artifacts.",
      client_communication:
        "Calm language can mask just how uncertain the reviewer posture still is underneath.",
      workflow_and_case_management:
        "Statuses and snapshots help, but provenance remains too soft for adversarial review.",
      industry_and_scenario_familiarity:
        "Industry handling still looks like playbooks and cue libraries rather than real vertical depth.",
      ethics_and_professional_responsibility:
        "Fail-closed posture is good, but ethical confidence still relies on AI summaries being right first.",
      practice_judgment:
        "Tina often ranks the right class of problem without always catching the exact one a skeptic would stop on.",
    },
  },
  {
    id: "raman",
    name: "Raman",
    specialty: "QA, debugging, and regression pressure",
    overallScore: 8.7,
    overallVerdict:
      "Very strong under the scenarios already encoded, but still vulnerable to overfitting the curated fixture corpus and known rule families.",
    scores: {
      technical_tax_law: 8.3,
      accounting_fluency: 8.8,
      fact_pattern_judgment: 9,
      entity_and_filing_path_classification: 9.1,
      tax_treatment_selection: 8.7,
      record_and_evidence_analysis: 8.9,
      risk_and_materiality_judgment: 8.8,
      tax_planning_and_savings_identification: 8.2,
      form_and_compliance_execution: 8.4,
      review_and_error_detection: 9.1,
      documentation_and_defensibility: 9,
      client_communication: 8.4,
      workflow_and_case_management: 9.2,
      industry_and_scenario_familiarity: 8.6,
      ethics_and_professional_responsibility: 9,
      practice_judgment: 8.7,
    },
    notes: {
      technical_tax_law:
        "The rule spine is already strong, but it is still narrow enough that unsupported edge cases can sound too authoritative.",
      accounting_fluency:
        "Accounting logic is excellent for the modeled fixtures, yet still more pattern-aware than transaction-aware.",
      fact_pattern_judgment:
        "Judgment is strong on anticipated patterns, though a novel pattern could still outrun the clue set.",
      entity_and_filing_path_classification:
        "Classification is sharp, but only across the return families and documents the code explicitly anticipates.",
      tax_treatment_selection:
        "The treatment buckets are strong, but can still miss issues outside the named heuristic families.",
      record_and_evidence_analysis:
        "Traceability is excellent, though strong support can still mean well-linked rather than independently persuasive.",
      risk_and_materiality_judgment:
        "Priority ranking is impressive, but still anchored to known categories and fixed statuses.",
      tax_planning_and_savings_identification:
        "Planning is useful, but the engine still leans on curated opportunity catalogs instead of open-ended discovery.",
      form_and_compliance_execution:
        "Execution looks polished, but the system still leans heavily on planning and placement rather than full filed-form production.",
      review_and_error_detection:
        "Validators are strong, though a novel inconsistency outside the rule graph can still survive.",
      documentation_and_defensibility:
        "The package is highly explainable, but templated summaries can make thin reasoning look stronger than it is.",
      client_communication:
        "Backend communication is good, but it still speaks from state machines rather than true conversation.",
      workflow_and_case_management:
        "Workflow control is excellent as long as fingerprinting and draft freshness stay accurate.",
      industry_and_scenario_familiarity:
        "Industry coverage is strong for the curated smoke cases, but still not broad proof of deep generalization.",
      ethics_and_professional_responsibility:
        "The guardrails are real, but they still depend on upstream summarization and classification staying trustworthy.",
      practice_judgment:
        "Tina often prioritizes the right issue class, though a hard human reviewer might still stop on a different first issue.",
    },
  },
];
