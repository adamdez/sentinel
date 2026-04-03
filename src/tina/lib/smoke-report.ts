import { buildTinaAttachmentStatements } from "@/tina/lib/attachment-statements";
import { buildTinaAttachmentSchedules } from "@/tina/lib/attachment-schedules";
import { buildTinaAccountingArtifactCoverage } from "@/tina/lib/accounting-artifact-coverage";
import { buildTinaAuthorityPositionMatrix } from "@/tina/lib/authority-position-matrix";
import { buildTinaBooksNormalization } from "@/tina/lib/books-normalization";
import { buildTinaBooksReconciliation } from "@/tina/lib/books-reconciliation";
import { buildTinaBooksReconstruction } from "@/tina/lib/books-reconstruction";
import { buildTinaCompanionFormPlan } from "@/tina/lib/companion-form-plan";
import { buildTinaCompanionFormCalculations } from "@/tina/lib/companion-form-calculations";
import { buildTinaCrossFormConsistency } from "@/tina/lib/cross-form-consistency";
import { buildTinaDecisionBriefings } from "@/tina/lib/decision-briefings";
import { buildTinaDocumentRequestPlan } from "@/tina/lib/document-request-plan";
import { buildTinaDisclosureReadiness } from "@/tina/lib/disclosure-readiness";
import { buildTinaEntityEconomicsReadiness } from "@/tina/lib/entity-economics-readiness";
import { buildTinaEntityJudgment } from "@/tina/lib/entity-judgment";
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
import { buildTinaReviewBundle } from "@/tina/lib/review-bundle";
import { buildTinaReviewerChallenges } from "@/tina/lib/reviewer-challenges";
import { buildTinaReviewerAcceptanceForecast } from "@/tina/lib/reviewer-acceptance-forecast";
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
import type { TinaWorkspaceDraft } from "@/tina/types";

export interface TinaSmokeCaseReport {
  businessName: string;
  startPath: ReturnType<typeof buildTinaStartPathAssessment>;
  federalReturnClassification: ReturnType<typeof buildTinaFederalReturnClassification>;
  entityJudgment: ReturnType<typeof buildTinaEntityJudgment>;
  entityRecordMatrix: ReturnType<typeof buildTinaEntityRecordMatrix>;
  entityEconomicsReadiness: ReturnType<typeof buildTinaEntityEconomicsReadiness>;
  entityReturnRunbook: ReturnType<typeof buildTinaEntityReturnRunbook>;
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
  booksReconstruction: ReturnType<typeof buildTinaBooksReconstruction>;
  booksReconciliation: ReturnType<typeof buildTinaBooksReconciliation>;
  booksNormalization: ReturnType<typeof buildTinaBooksNormalization>;
  accountingArtifactCoverage: ReturnType<typeof buildTinaAccountingArtifactCoverage>;
  attachmentStatements: ReturnType<typeof buildTinaAttachmentStatements>;
  attachmentSchedules: ReturnType<typeof buildTinaAttachmentSchedules>;
  decisionBriefings: ReturnType<typeof buildTinaDecisionBriefings>;
  industryPlaybooks: ReturnType<typeof buildTinaIndustryPlaybooks>;
  industryEvidenceMatrix: ReturnType<typeof buildTinaIndustryEvidenceMatrix>;
  taxOpportunityEngine: ReturnType<typeof buildTinaTaxOpportunityEngine>;
  planningActionBoard: ReturnType<typeof buildTinaPlanningActionBoard>;
  taxPlanningMemo: ReturnType<typeof buildTinaTaxPlanningMemo>;
  authorityPositionMatrix: ReturnType<typeof buildTinaAuthorityPositionMatrix>;
  disclosureReadiness: ReturnType<typeof buildTinaDisclosureReadiness>;
  reviewerAcceptanceForecast: ReturnType<typeof buildTinaReviewerAcceptanceForecast>;
  documentRequestPlan: ReturnType<typeof buildTinaDocumentRequestPlan>;
  companionFormCalculations: ReturnType<typeof buildTinaCompanionFormCalculations>;
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
  const startPath = buildTinaStartPathAssessment(draft);
  const federalReturnClassification = buildTinaFederalReturnClassification(draft);
  const entityJudgment = buildTinaEntityJudgment(draft);
  const entityRecordMatrix = buildTinaEntityRecordMatrix(draft);
  const entityEconomicsReadiness = buildTinaEntityEconomicsReadiness(draft);
  const entityReturnRunbook = buildTinaEntityReturnRunbook(draft);
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
  const booksReconstruction = buildTinaBooksReconstruction(draft);
  const booksReconciliation = buildTinaBooksReconciliation(draft);
  const booksNormalization = buildTinaBooksNormalization(draft);
  const accountingArtifactCoverage = buildTinaAccountingArtifactCoverage(draft);
  const attachmentStatements = buildTinaAttachmentStatements(draft);
  const attachmentSchedules = buildTinaAttachmentSchedules(draft);
  const decisionBriefings = buildTinaDecisionBriefings(draft);
  const industryPlaybooks = buildTinaIndustryPlaybooks(draft);
  const industryEvidenceMatrix = buildTinaIndustryEvidenceMatrix(draft);
  const taxOpportunityEngine = buildTinaTaxOpportunityEngine(draft);
  const planningActionBoard = buildTinaPlanningActionBoard(draft);
  const taxPlanningMemo = buildTinaTaxPlanningMemo(draft);
  const authorityPositionMatrix = buildTinaAuthorityPositionMatrix(draft);
  const disclosureReadiness = buildTinaDisclosureReadiness(draft);
  const reviewerAcceptanceForecast = buildTinaReviewerAcceptanceForecast(draft);
  const documentRequestPlan = buildTinaDocumentRequestPlan(draft);
  const companionFormCalculations = buildTinaCompanionFormCalculations(draft);
  const companionFormPlan = buildTinaCompanionFormPlan(draft);
  const crossFormConsistency = buildTinaCrossFormConsistency(draft);
  const materialityPriority = buildTinaMaterialityPriority(draft);
  const reviewerChallenges = buildTinaReviewerChallenges(draft);
  const reviewBundle = buildTinaReviewBundle(draft);
  const pdfExport = buildTinaScheduleCPdfExport(draft);

  return {
    businessName: draft.profile.businessName,
    startPath,
    federalReturnClassification,
    entityJudgment,
    entityRecordMatrix,
    entityEconomicsReadiness,
    entityReturnRunbook,
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
    booksReconstruction,
    booksReconciliation,
    booksNormalization,
    accountingArtifactCoverage,
    attachmentStatements,
    attachmentSchedules,
    decisionBriefings,
    industryPlaybooks,
    industryEvidenceMatrix,
    taxOpportunityEngine,
    planningActionBoard,
    taxPlanningMemo,
    authorityPositionMatrix,
    disclosureReadiness,
    reviewerAcceptanceForecast,
    documentRequestPlan,
    companionFormCalculations,
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
}
