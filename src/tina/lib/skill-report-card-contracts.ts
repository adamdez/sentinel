export type TinaSkillId =
  | "technical_tax_law"
  | "accounting_fluency"
  | "fact_pattern_judgment"
  | "entity_and_filing_path_classification"
  | "tax_treatment_selection"
  | "record_and_evidence_analysis"
  | "risk_and_materiality_judgment"
  | "tax_planning_and_savings_identification"
  | "form_and_compliance_execution"
  | "review_and_error_detection"
  | "documentation_and_defensibility"
  | "client_communication"
  | "workflow_and_case_management"
  | "industry_and_scenario_familiarity"
  | "ethics_and_professional_responsibility"
  | "practice_judgment";

export interface TinaSkillDescriptor {
  id: TinaSkillId;
  title: string;
  shortTitle: string;
}

export interface TinaSkillReviewFixture {
  id: string;
  title: string;
  summary: string;
}

export interface TinaPanelistReview {
  id: string;
  name: string;
  specialty: string;
  overallScore: number;
  overallVerdict: string;
  scores: Record<TinaSkillId, number>;
  notes: Record<TinaSkillId, string>;
}

export interface TinaSkillChallenge {
  skillId: TinaSkillId;
  title: string;
  objective: string;
  fixtureIds: string[];
  observedStrengths: string[];
  observedWeaknesses: string[];
  whyNotAPlus: string;
}

export interface TinaSkillReportCardEntry extends TinaSkillChallenge {
  score: number;
  averageScore: number;
  minimumScore: number;
  maximumScore: number;
  letterGrade: string;
  teacherComment: string;
  panelNotes: Array<{
    panelistId: string;
    panelistName: string;
    specialty: string;
    score: number;
    note: string;
  }>;
}

export interface TinaSkillReportCard {
  generatedAt: string;
  overallScore: number;
  averagePanelScore: number;
  overallLetterGrade: string;
  panelCount: number;
  skills: TinaSkillReportCardEntry[];
}

export type TinaTraitGateStatus = "pass" | "fail";
export type TinaTraitGateFailureSeverity = "blocking" | "major" | "minor";

export interface TinaTraitGateFailure {
  id: string;
  fixtureId: string;
  title: string;
  summary: string;
  severity: TinaTraitGateFailureSeverity;
  ownerEngine: string;
  currentValue: string;
  expectedValue: string;
}

export interface TinaTraitGateResult {
  skillId: TinaSkillId;
  title: string;
  status: TinaTraitGateStatus;
  score: number;
  targetScore: number;
  summary: string;
  ownerEngines: string[];
  requiredFixtureIds: string[];
  failures: TinaTraitGateFailure[];
}

export interface TinaEightFloorGateSnapshot {
  generatedAt: string;
  targetScore: number;
  overallStatus: TinaTraitGateStatus;
  summary: string;
  passingTraitCount: number;
  failingTraitCount: number;
  results: TinaTraitGateResult[];
}
