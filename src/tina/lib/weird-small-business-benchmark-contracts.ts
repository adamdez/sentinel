import type { TinaSkillId } from "@/tina/lib/skill-report-card-contracts";

export type TinaEliteOutcomeId =
  | "unknown_pattern_resolution"
  | "confidence_calibration"
  | "reviewer_learning_loop"
  | "true_final_form_execution"
  | "durable_case_memory"
  | "messy_evidence_generalization"
  | "reviewer_override_governance"
  | "live_acceptance_testing_against_reality"
  | "document_intelligence_depth"
  | "commercial_judgment";

export type TinaWeirdSmallBusinessScenarioGroup =
  | "entity_and_election_problems"
  | "ownership_and_basis_problems"
  | "worker_classification_and_payroll_problems"
  | "recordkeeping_and_cleanup_problems"
  | "assets_depreciation_and_property_problems";

export type TinaWeirdSmallBusinessScenarioPriority =
  | "top_10_priority"
  | "broad_core"
  | "advanced_cleanup";

export interface TinaWeirdSmallBusinessScenario {
  id: string;
  title: string;
  group: TinaWeirdSmallBusinessScenarioGroup;
  priority: TinaWeirdSmallBusinessScenarioPriority;
  summary: string;
  factPattern: string;
  diagnosticProblems: string[];
  likelyTaxClassifications: string[];
  likelyReturnsAndForms: string[];
  missingFactsToConfirm: string[];
  federalIssues: string[];
  stateIssues: string[];
  cleanupStepsFirst: string[];
  forwardPlanningAngles: string[];
  targetedSkills: TinaSkillId[];
  targetedOutcomes: TinaEliteOutcomeId[];
}

export interface TinaWeirdSmallBusinessBenchmarkSnapshot {
  generatedAt: string;
  runMode: "offline_first";
  offlineReady: boolean;
  scenarioCount: number;
  topPriorityScenarioIds: string[];
  benchmarkQuestions: string[];
  benchmarkPromptTemplate: string;
  groupCounts: Record<TinaWeirdSmallBusinessScenarioGroup, number>;
  scenarios: TinaWeirdSmallBusinessScenario[];
}

export type TinaWeirdSmallBusinessBenchmarkConfidence = "low" | "medium" | "high";
export type TinaWeirdSmallBusinessBenchmarkAnswerSource =
  | "openai_model"
  | "diagnostic_preflight_fallback";
export type TinaWeirdSmallBusinessDiagnosticLaneId =
  | "entity_route_resolution"
  | "ownership_and_basis_reconstruction"
  | "worker_and_payroll_compliance"
  | "books_and_reconstruction"
  | "asset_support_and_property_treatment"
  | "multi_year_filing_backlog";
export type TinaWeirdSmallBusinessDiagnosticLaneEntityRole =
  | "entity_primary"
  | "entity_secondary"
  | "entity_deferred_until_cleanup";
export type TinaWeirdSmallBusinessFilingLadderItemStatus =
  | "likely_missing"
  | "conditional"
  | "support_schedule"
  | "state_follow_through";
export type TinaWeirdSmallBusinessDiagnosticHypothesisCategory =
  | "diagnostic_lane"
  | "tax_classification"
  | "return_family"
  | "cleanup_strategy"
  | "state_boundary";
export type TinaWeirdSmallBusinessDiagnosticHypothesisStatus =
  | "leading"
  | "plausible"
  | "fallback";
export type TinaWeirdSmallBusinessDiagnosticHypothesisOverallStatus =
  | "stable_path"
  | "competing_paths"
  | "cleanup_before_conclusion";
export type TinaWeirdSmallBusinessDiagnosticAnswerStyle =
  | "single_path_with_caveat"
  | "conditional_multi_path"
  | "cleanup_first";

export type TinaWeirdSmallBusinessDiagnosticPreflightPosture =
  | "route_sensitive"
  | "cleanup_heavy"
  | "compliance_risk"
  | "records_first";
export type TinaWeirdSmallBusinessEntityAmbiguityStatus =
  | "stable_route"
  | "competing_routes"
  | "blocked";
export type TinaWeirdSmallBusinessEntityAmbiguityPathStatus =
  | "leading"
  | "plausible"
  | "fallback";

export interface TinaWeirdSmallBusinessEntityAmbiguityPath {
  id: string;
  conclusion: string;
  title: string;
  status: TinaWeirdSmallBusinessEntityAmbiguityPathStatus;
  confidence: TinaWeirdSmallBusinessBenchmarkConfidence;
  stabilityScore: number;
  summary: string;
  whyPlausible: string[];
  whatCouldChange: string[];
  requiredProof: string[];
  recommendedFirstQuestion: string | null;
  relatedSignalIds: string[];
}

export interface TinaWeirdSmallBusinessEntityAmbiguitySnapshot {
  scenarioId: string;
  overallStatus: TinaWeirdSmallBusinessEntityAmbiguityStatus;
  summary: string;
  nextStep: string;
  leadingPathId: string | null;
  priorityQuestions: string[];
  paths: TinaWeirdSmallBusinessEntityAmbiguityPath[];
}

export interface TinaWeirdSmallBusinessDiagnosticPreflight {
  scenarioId: string;
  posture: TinaWeirdSmallBusinessDiagnosticPreflightPosture;
  confidenceCeiling: TinaWeirdSmallBusinessBenchmarkConfidence;
  needsMoreFactsBeforePreparation: boolean;
  signalIds: string[];
  likelyTaxClassifications: string[];
  likelyReturnsAndForms: string[];
  biggestRiskAreas: string[];
  factsToConfirmFirst: string[];
  cleanupStepsFirst: string[];
  federalIssues: string[];
  stateIssues: string[];
  entityAmbiguity: TinaWeirdSmallBusinessEntityAmbiguitySnapshot;
  diagnosticLane: TinaWeirdSmallBusinessDiagnosticLaneSnapshot;
}

export interface TinaWeirdSmallBusinessDiagnosticFactBucket {
  id: string;
  label: string;
  facts: string[];
  whyItMatters: string;
}

export interface TinaWeirdSmallBusinessFilingLadderItem {
  label: string;
  status: TinaWeirdSmallBusinessFilingLadderItemStatus;
  whyItMatters: string;
}

export interface TinaWeirdSmallBusinessDiagnosticLaneSnapshot {
  scenarioId: string;
  laneId: TinaWeirdSmallBusinessDiagnosticLaneId;
  label: string;
  summary: string;
  entityRole: TinaWeirdSmallBusinessDiagnosticLaneEntityRole;
  classificationAnchor: string;
  confidenceCeiling: TinaWeirdSmallBusinessBenchmarkConfidence;
  filingLadder: TinaWeirdSmallBusinessFilingLadderItem[];
  factBuckets: TinaWeirdSmallBusinessDiagnosticFactBucket[];
  cleanupPriority: string[];
}

export interface TinaWeirdSmallBusinessDiagnosticHypothesis {
  id: string;
  category: TinaWeirdSmallBusinessDiagnosticHypothesisCategory;
  conclusion: string;
  title: string;
  status: TinaWeirdSmallBusinessDiagnosticHypothesisStatus;
  confidence: TinaWeirdSmallBusinessBenchmarkConfidence;
  stabilityScore: number;
  summary: string;
  whyPlausible: string[];
  whatCouldChange: string[];
  requiredProof: string[];
  supportingSignalCount: number;
  contradictingSignalCount: number;
  recommendedFirstQuestion: string | null;
  relatedSignalIds: string[];
}

export interface TinaWeirdSmallBusinessDiagnosticHypothesisSnapshot {
  scenarioId: string;
  overallStatus: TinaWeirdSmallBusinessDiagnosticHypothesisOverallStatus;
  answerStyle: TinaWeirdSmallBusinessDiagnosticAnswerStyle;
  summary: string;
  nextStep: string;
  leadingHypothesisId: string | null;
  signalIds: string[];
  priorityQuestions: string[];
  hypotheses: TinaWeirdSmallBusinessDiagnosticHypothesis[];
}

export interface TinaWeirdSmallBusinessBenchmarkAnswer {
  summary: string;
  likelyCurrentTaxClassification: string;
  filingsThatMayBeMissing: string[];
  biggestRiskAreas: string[];
  factsToConfirmBeforePreparation: string[];
  cleanupStepsFirst: string[];
  federalIssues: string[];
  stateIssues: string[];
  needsMoreFactsBeforePreparation: boolean;
  confidence: TinaWeirdSmallBusinessBenchmarkConfidence;
}

export interface TinaWeirdSmallBusinessBenchmarkScoreSection {
  id:
    | "classification"
    | "filings"
    | "risks"
    | "facts"
    | "cleanup"
    | "federal_state"
    | "humility";
  label: string;
  score: number;
  maxScore: number;
  summary: string;
  missedExpectedItems: string[];
}

export interface TinaWeirdSmallBusinessBenchmarkScenarioResult {
  scenarioId: string;
  title: string;
  group: TinaWeirdSmallBusinessScenarioGroup;
  answerSource: TinaWeirdSmallBusinessBenchmarkAnswerSource;
  diagnosticPreflight: TinaWeirdSmallBusinessDiagnosticPreflight;
  diagnosticHypotheses: TinaWeirdSmallBusinessDiagnosticHypothesisSnapshot;
  answer: TinaWeirdSmallBusinessBenchmarkAnswer;
  overallScore: number;
  letterGrade: string;
  sections: TinaWeirdSmallBusinessBenchmarkScoreSection[];
  strengths: string[];
  weaknesses: string[];
}

export interface TinaWeirdSmallBusinessBenchmarkRunReport {
  generatedAt: string;
  runMode: "offline_first_no_web_search";
  model: string;
  scenarioCount: number;
  answerSources: Record<TinaWeirdSmallBusinessBenchmarkAnswerSource, number>;
  averageScore: number;
  overallLetterGrade: string;
  groupAverages: Record<TinaWeirdSmallBusinessScenarioGroup, number>;
  results: TinaWeirdSmallBusinessBenchmarkScenarioResult[];
}
