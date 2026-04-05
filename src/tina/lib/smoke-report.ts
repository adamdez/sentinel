import { buildTinaAttachmentStatements } from "@/tina/lib/attachment-statements";
import { buildTinaAttachmentSchedules } from "@/tina/lib/attachment-schedules";
import { buildTinaAccountingArtifactCoverage } from "@/tina/lib/accounting-artifact-coverage";
import { buildTinaAuthorityPositionMatrix } from "@/tina/lib/authority-position-matrix";
import { buildTinaBooksNormalization } from "@/tina/lib/books-normalization";
import { buildTinaBooksReconciliation } from "@/tina/lib/books-reconciliation";
import { buildTinaBooksReconstruction } from "@/tina/lib/books-reconstruction";
import { buildTinaCaseMemoryLedger } from "@/tina/lib/case-memory-ledger";
import { buildTinaCompanionFormPlan } from "@/tina/lib/companion-form-plan";
import { buildTinaCompanionFormCalculations } from "@/tina/lib/companion-form-calculations";
import { buildTinaCompanionFormRenderPlan } from "@/tina/lib/companion-form-render-plan";
import { buildTinaConfidenceCalibration } from "@/tina/lib/confidence-calibration";
import { buildTinaCrossFormConsistency } from "@/tina/lib/cross-form-consistency";
import { buildTinaDecisionBriefings } from "@/tina/lib/decision-briefings";
import { buildTinaDocumentIntelligence } from "@/tina/lib/document-intelligence";
import { buildTinaDocumentRequestPlan } from "@/tina/lib/document-request-plan";
import { buildTinaDisclosureReadiness } from "@/tina/lib/disclosure-readiness";
import { buildTinaEvidenceCredibility } from "@/tina/lib/evidence-credibility";
import { buildTinaEntityEconomicsReadiness } from "@/tina/lib/entity-economics-readiness";
import { buildTinaEntityFilingRemediation } from "@/tina/lib/entity-filing-remediation";
import { buildTinaEntityJudgment } from "@/tina/lib/entity-judgment";
import { buildTinaEntityReturnCalculations } from "@/tina/lib/entity-return-calculations";
import { buildTinaEntityLaneExecution } from "@/tina/lib/entity-lane-execution";
import { buildTinaEntityRecordMatrix } from "@/tina/lib/entity-record-matrix";
import { buildTinaEntityReturnRunbook } from "@/tina/lib/entity-return-runbook";
import { buildTinaEvidenceSufficiency } from "@/tina/lib/evidence-sufficiency";
import { buildTinaFederalReturnClassification } from "@/tina/lib/federal-return-classification";
import { buildTinaFederalReturnRequirements } from "@/tina/lib/federal-return-requirements";
import { buildTinaFormReadiness } from "@/tina/lib/form-readiness";
import { buildTinaIndustryPlaybooks } from "@/tina/lib/industry-playbooks";
import { buildTinaIndustryEvidenceMatrix } from "@/tina/lib/industry-evidence-matrix";
import { buildTinaOfficialFederalFormTemplateSnapshot } from "@/tina/lib/official-form-templates";
import { buildTinaOfficialFormFill } from "@/tina/lib/official-form-fill";
import { buildTinaOfficialFormExecution } from "@/tina/lib/official-form-execution";
import { buildTinaOperationalStatus } from "@/tina/lib/operational-status";
import { buildTinaOwnershipCapitalEvents } from "@/tina/lib/ownership-capital-events";
import { buildTinaPackageReadiness } from "@/tina/lib/package-readiness";
import { buildTinaMaterialityPriority } from "@/tina/lib/materiality-priority";
import { buildTinaLedgerReconstruction } from "@/tina/lib/ledger-reconstruction";
import { buildTinaReviewBundle } from "@/tina/lib/review-bundle";
import { buildTinaReviewerChallenges } from "@/tina/lib/reviewer-challenges";
import { buildTinaReviewerAcceptanceForecast } from "@/tina/lib/reviewer-acceptance-forecast";
import { buildTinaReviewerAcceptanceReality } from "@/tina/lib/reviewer-acceptance-reality";
import { buildTinaReviewerLearningLoop } from "@/tina/lib/reviewer-learning-loop";
import { buildTinaReviewerObservedDeltas } from "@/tina/lib/reviewer-observed-deltas";
import { buildTinaReviewerOverrideGovernance } from "@/tina/lib/reviewer-override-governance";
import { buildTinaReviewerPolicyVersioning } from "@/tina/lib/reviewer-policy-versioning";
import { buildTinaReturnPackageArtifacts } from "@/tina/lib/return-package-artifacts";
import { buildTinaScheduleCPdfExport } from "@/tina/lib/schedule-c-pdf";
import { buildTinaScheduleCFormCoverage } from "@/tina/lib/schedule-c-form-coverage";
import { buildTinaScheduleCFormTrace } from "@/tina/lib/schedule-c-form-trace";
import { buildTinaScheduleCReturn } from "@/tina/lib/schedule-c-return";
import { buildTinaStartPathAssessment } from "@/tina/lib/start-path";
import { buildTinaTaxOpportunityEngine } from "@/tina/lib/tax-opportunity-engine";
import { buildTinaPlanningActionBoard } from "@/tina/lib/planning-action-board";
import { buildTinaTaxPlanningMemo } from "@/tina/lib/tax-planning-memo";
import { buildTinaTaxTreatmentPolicy } from "@/tina/lib/tax-treatment-policy";
import { buildTinaTreatmentJudgment } from "@/tina/lib/treatment-judgment";
import { buildTinaUnknownPatternEngine } from "@/tina/lib/unknown-pattern-engine";
import type { TinaWorkspaceDraft } from "@/tina/types";

const smokeCaseReportCache = new WeakMap<TinaWorkspaceDraft, TinaSmokeCaseReport>();

export interface TinaSmokeCaseReport {
  businessName: string;
  startPath: ReturnType<typeof buildTinaStartPathAssessment>;
  federalReturnClassification: ReturnType<typeof buildTinaFederalReturnClassification>;
  entityFilingRemediation: ReturnType<typeof buildTinaEntityFilingRemediation>;
  unknownPatternEngine: ReturnType<typeof buildTinaUnknownPatternEngine>;
  confidenceCalibration: ReturnType<typeof buildTinaConfidenceCalibration>;
  caseMemoryLedger: ReturnType<typeof buildTinaCaseMemoryLedger>;
  reviewerLearningLoop: ReturnType<typeof buildTinaReviewerLearningLoop>;
  reviewerObservedDeltas: ReturnType<typeof buildTinaReviewerObservedDeltas>;
  reviewerOverrideGovernance: ReturnType<typeof buildTinaReviewerOverrideGovernance>;
  reviewerPolicyVersioning: ReturnType<typeof buildTinaReviewerPolicyVersioning>;
  reviewerAcceptanceReality: ReturnType<typeof buildTinaReviewerAcceptanceReality>;
  entityJudgment: ReturnType<typeof buildTinaEntityJudgment>;
  entityRecordMatrix: ReturnType<typeof buildTinaEntityRecordMatrix>;
  entityEconomicsReadiness: ReturnType<typeof buildTinaEntityEconomicsReadiness>;
  entityReturnCalculations: ReturnType<typeof buildTinaEntityReturnCalculations>;
  entityReturnRunbook: ReturnType<typeof buildTinaEntityReturnRunbook>;
  entityLaneExecution: ReturnType<typeof buildTinaEntityLaneExecution>;
  federalReturnRequirements: ReturnType<typeof buildTinaFederalReturnRequirements>;
  ownershipCapitalEvents: ReturnType<typeof buildTinaOwnershipCapitalEvents>;
  taxTreatmentPolicy: ReturnType<typeof buildTinaTaxTreatmentPolicy>;
  treatmentJudgment: ReturnType<typeof buildTinaTreatmentJudgment>;
  packageReadiness: ReturnType<typeof buildTinaPackageReadiness>;
  formReadiness: ReturnType<typeof buildTinaFormReadiness>;
  officialFormTemplates: ReturnType<typeof buildTinaOfficialFederalFormTemplateSnapshot>;
  officialFormFill: ReturnType<typeof buildTinaOfficialFormFill>;
  officialFormExecution: ReturnType<typeof buildTinaOfficialFormExecution>;
  operationalStatus: ReturnType<typeof buildTinaOperationalStatus>;
  scheduleCReturn: ReturnType<typeof buildTinaScheduleCReturn>;
  formCoverage: ReturnType<typeof buildTinaScheduleCFormCoverage>;
  formTrace: ReturnType<typeof buildTinaScheduleCFormTrace>;
  evidenceSufficiency: ReturnType<typeof buildTinaEvidenceSufficiency>;
  evidenceCredibility: ReturnType<typeof buildTinaEvidenceCredibility>;
  booksReconstruction: ReturnType<typeof buildTinaBooksReconstruction>;
  ledgerReconstruction: ReturnType<typeof buildTinaLedgerReconstruction>;
  booksReconciliation: ReturnType<typeof buildTinaBooksReconciliation>;
  booksNormalization: ReturnType<typeof buildTinaBooksNormalization>;
  accountingArtifactCoverage: ReturnType<typeof buildTinaAccountingArtifactCoverage>;
  attachmentStatements: ReturnType<typeof buildTinaAttachmentStatements>;
  attachmentSchedules: ReturnType<typeof buildTinaAttachmentSchedules>;
  decisionBriefings: ReturnType<typeof buildTinaDecisionBriefings>;
  documentIntelligence: ReturnType<typeof buildTinaDocumentIntelligence>;
  industryPlaybooks: ReturnType<typeof buildTinaIndustryPlaybooks>;
  industryEvidenceMatrix: ReturnType<typeof buildTinaIndustryEvidenceMatrix>;
  taxOpportunityEngine: ReturnType<typeof buildTinaTaxOpportunityEngine>;
  planningActionBoard: ReturnType<typeof buildTinaPlanningActionBoard>;
  taxPlanningMemo: ReturnType<typeof buildTinaTaxPlanningMemo>;
  authorityPositionMatrix: ReturnType<typeof buildTinaAuthorityPositionMatrix>;
  disclosureReadiness: ReturnType<typeof buildTinaDisclosureReadiness>;
  reviewerAcceptanceForecast: ReturnType<typeof buildTinaReviewerAcceptanceForecast>;
  returnPackageArtifacts: ReturnType<typeof buildTinaReturnPackageArtifacts>;
  documentRequestPlan: ReturnType<typeof buildTinaDocumentRequestPlan>;
  companionFormCalculations: ReturnType<typeof buildTinaCompanionFormCalculations>;
  companionFormRenderPlan: ReturnType<typeof buildTinaCompanionFormRenderPlan>;
  companionFormPlan: ReturnType<typeof buildTinaCompanionFormPlan>;
  crossFormConsistency: ReturnType<typeof buildTinaCrossFormConsistency>;
  materialityPriority: ReturnType<typeof buildTinaMaterialityPriority>;
  reviewerChallenges: ReturnType<typeof buildTinaReviewerChallenges>;
  reviewBundleFileCount: number;
  pdfFileName: string;
  pdfSummary: string;
  pdfFieldCount: number;
  pdfValidationIssueCount: number;
}

export function buildTinaSmokeCaseReport(draft: TinaWorkspaceDraft): TinaSmokeCaseReport {
  const cached = smokeCaseReportCache.get(draft);
  if (cached) {
    return cached;
  }

  const startPath = buildTinaStartPathAssessment(draft);
  const federalReturnClassification = buildTinaFederalReturnClassification(draft);
  const entityFilingRemediation = buildTinaEntityFilingRemediation(draft);
  const unknownPatternEngine = buildTinaUnknownPatternEngine(draft);
  const confidenceCalibration = buildTinaConfidenceCalibration(draft);
  const caseMemoryLedger = buildTinaCaseMemoryLedger(draft);
  const reviewerLearningLoop = buildTinaReviewerLearningLoop(draft);
  const reviewerObservedDeltas = buildTinaReviewerObservedDeltas(draft);
  const reviewerOverrideGovernance = buildTinaReviewerOverrideGovernance(draft);
  const reviewerPolicyVersioning = buildTinaReviewerPolicyVersioning(draft);
  const reviewerAcceptanceReality = buildTinaReviewerAcceptanceReality(draft);
  const entityJudgment = buildTinaEntityJudgment(draft);
  const entityRecordMatrix = buildTinaEntityRecordMatrix(draft);
  const entityEconomicsReadiness = buildTinaEntityEconomicsReadiness(draft);
  const entityReturnCalculations = buildTinaEntityReturnCalculations(draft);
  const entityReturnRunbook = buildTinaEntityReturnRunbook(draft);
  const entityLaneExecution = buildTinaEntityLaneExecution(draft);
  const federalReturnRequirements = buildTinaFederalReturnRequirements(draft);
  const ownershipCapitalEvents = buildTinaOwnershipCapitalEvents(draft);
  const taxTreatmentPolicy = buildTinaTaxTreatmentPolicy(draft);
  const treatmentJudgment = buildTinaTreatmentJudgment(draft);
  const packageReadiness = buildTinaPackageReadiness(draft);
  const formReadiness = buildTinaFormReadiness(draft);
  const officialFormTemplates = buildTinaOfficialFederalFormTemplateSnapshot(draft);
  const officialFormFill = buildTinaOfficialFormFill(draft);
  const officialFormExecution = buildTinaOfficialFormExecution(draft);
  const operationalStatus = buildTinaOperationalStatus(draft);
  const scheduleCReturn = buildTinaScheduleCReturn(draft);
  const formCoverage = buildTinaScheduleCFormCoverage(draft);
  const formTrace = buildTinaScheduleCFormTrace(draft);
  const evidenceSufficiency = buildTinaEvidenceSufficiency(draft);
  const evidenceCredibility = buildTinaEvidenceCredibility(draft);
  const booksReconstruction = buildTinaBooksReconstruction(draft);
  const ledgerReconstruction = buildTinaLedgerReconstruction(draft);
  const booksReconciliation = buildTinaBooksReconciliation(draft);
  const booksNormalization = buildTinaBooksNormalization(draft);
  const accountingArtifactCoverage = buildTinaAccountingArtifactCoverage(draft);
  const attachmentStatements = buildTinaAttachmentStatements(draft);
  const attachmentSchedules = buildTinaAttachmentSchedules(draft);
  const decisionBriefings = buildTinaDecisionBriefings(draft);
  const documentIntelligence = buildTinaDocumentIntelligence(draft);
  const industryPlaybooks = buildTinaIndustryPlaybooks(draft);
  const industryEvidenceMatrix = buildTinaIndustryEvidenceMatrix(draft);
  const taxOpportunityEngine = buildTinaTaxOpportunityEngine(draft);
  const planningActionBoard = buildTinaPlanningActionBoard(draft);
  const taxPlanningMemo = buildTinaTaxPlanningMemo(draft);
  const authorityPositionMatrix = buildTinaAuthorityPositionMatrix(draft);
  const disclosureReadiness = buildTinaDisclosureReadiness(draft);
  const reviewerAcceptanceForecast = buildTinaReviewerAcceptanceForecast(draft);
  const returnPackageArtifacts = buildTinaReturnPackageArtifacts(draft);
  const documentRequestPlan = buildTinaDocumentRequestPlan(draft);
  const companionFormCalculations = buildTinaCompanionFormCalculations(draft);
  const companionFormRenderPlan = buildTinaCompanionFormRenderPlan(draft);
  const companionFormPlan = buildTinaCompanionFormPlan(draft);
  const crossFormConsistency = buildTinaCrossFormConsistency(draft);
  const materialityPriority = buildTinaMaterialityPriority(draft);
  const reviewerChallenges = buildTinaReviewerChallenges(draft);
  const reviewBundle = buildTinaReviewBundle(draft);
  const pdfExport = buildTinaScheduleCPdfExport(draft);

  const report: TinaSmokeCaseReport = {
    businessName: draft.profile.businessName,
    startPath,
    federalReturnClassification,
    entityFilingRemediation,
    unknownPatternEngine,
    confidenceCalibration,
    caseMemoryLedger,
    reviewerLearningLoop,
    reviewerObservedDeltas,
    reviewerOverrideGovernance,
    reviewerPolicyVersioning,
    reviewerAcceptanceReality,
    entityJudgment,
    entityRecordMatrix,
    entityEconomicsReadiness,
    entityReturnCalculations,
    entityReturnRunbook,
    entityLaneExecution,
    federalReturnRequirements,
    ownershipCapitalEvents,
    taxTreatmentPolicy,
    treatmentJudgment,
    packageReadiness,
    formReadiness,
    officialFormTemplates,
    officialFormFill,
    officialFormExecution,
    operationalStatus,
    scheduleCReturn,
    formCoverage,
    formTrace,
    evidenceSufficiency,
    evidenceCredibility,
    booksReconstruction,
    ledgerReconstruction,
    booksReconciliation,
    booksNormalization,
    accountingArtifactCoverage,
    attachmentStatements,
    attachmentSchedules,
    decisionBriefings,
    documentIntelligence,
    industryPlaybooks,
    industryEvidenceMatrix,
    taxOpportunityEngine,
    planningActionBoard,
    taxPlanningMemo,
    authorityPositionMatrix,
    disclosureReadiness,
    reviewerAcceptanceForecast,
    returnPackageArtifacts,
    documentRequestPlan,
    companionFormCalculations,
    companionFormRenderPlan,
    companionFormPlan,
    crossFormConsistency,
    materialityPriority,
    reviewerChallenges,
    reviewBundleFileCount: reviewBundle.files.length,
    pdfFileName: pdfExport.fileName,
    pdfSummary: pdfExport.snapshot.summary,
    pdfFieldCount: pdfExport.snapshot.fields.length,
    pdfValidationIssueCount: pdfExport.snapshot.validationIssues.length,
  };

  smokeCaseReportCache.set(draft, report);
  return report;
}
