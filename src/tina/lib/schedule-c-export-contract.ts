import { buildTinaMefReadinessReport } from "@/tina/lib/mef-readiness";
import { buildTinaNumericProofRows } from "@/tina/lib/numeric-proof";
import { buildTinaReviewTraceRows } from "@/tina/lib/review-trace";
import type { TinaWorkspaceDraft } from "@/tina/types";

export type TinaScheduleCExportContractStatus =
  | "blocked"
  | "needs_review"
  | "ready_for_mapping";

export interface TinaScheduleCExportContractField {
  fieldId: string;
  lineNumber: string;
  label: string;
  amount: number | null;
  status: "ready" | "needs_attention" | "waiting";
  summary: string;
  supportLevel: "strong" | "developing" | "thin" | "none";
  reviewerFinalLineIds: string[];
  taxAdjustmentIds: string[];
  sourceDocumentIds: string[];
}

export interface TinaScheduleCExportContractIssue {
  id: string;
  title: string;
  severity: "blocking" | "needs_attention";
  summary: string;
  relatedFieldIds: string[];
  sourceDocumentIds: string[];
}

export interface TinaScheduleCExportContract {
  contractVersion: "tina.schedule_c_export.v1";
  status: TinaScheduleCExportContractStatus;
  summary: string;
  nextStep: string;
  returnType: "1040";
  schedules: ["Schedule C"];
  taxYear: string;
  businessName: string;
  filingLane: string;
  mefStatus: string;
  fields: TinaScheduleCExportContractField[];
  unresolvedIssues: TinaScheduleCExportContractIssue[];
  attachmentManifest: ReturnType<typeof buildTinaMefReadinessReport>["attachments"];
}

function mapSupportLevel(value: string | undefined): "strong" | "developing" | "thin" | "none" {
  if (value === "strong" || value === "developing" || value === "thin") return value;
  return "none";
}

export function buildTinaScheduleCExportContract(
  draft: TinaWorkspaceDraft
): TinaScheduleCExportContract {
  const mefReadiness = buildTinaMefReadinessReport(draft);
  const numericProofRows = buildTinaNumericProofRows(draft);
  const reviewTraceRows = buildTinaReviewTraceRows(draft);

  const fields = draft.scheduleCDraft.fields.map((field) => {
    const proofRow = numericProofRows.find((row) => row.fieldId === field.id);
    const traceRow = reviewTraceRows.find((row) => row.fieldId === field.id);

    return {
      fieldId: field.id,
      lineNumber: field.lineNumber,
      label: field.label,
      amount: field.amount,
      status: field.status,
      summary:
        traceRow?.summary ??
        proofRow?.summary ??
        field.summary,
      supportLevel: mapSupportLevel(proofRow?.supportLevel),
      reviewerFinalLineIds: field.reviewerFinalLineIds,
      taxAdjustmentIds: field.taxAdjustmentIds,
      sourceDocumentIds: field.sourceDocumentIds,
    };
  });

  const unresolvedIssues = draft.packageReadiness.items.map((item) => ({
    id: item.id,
    title: item.title,
    severity: item.severity,
    summary: item.summary,
    relatedFieldIds: item.relatedFieldIds,
    sourceDocumentIds: item.sourceDocumentIds,
  }));

  const blockedCount = unresolvedIssues.filter((item) => item.severity === "blocking").length;
  const reviewCount = unresolvedIssues.filter((item) => item.severity === "needs_attention").length;

  let status: TinaScheduleCExportContractStatus = "ready_for_mapping";
  if (mefReadiness.status === "blocked" || blockedCount > 0) {
    status = "blocked";
  } else if (
    mefReadiness.status === "needs_review" ||
    reviewCount > 0 ||
    fields.some((field) => field.status !== "ready")
  ) {
    status = "needs_review";
  }

  let summary =
    "Tina built a structured 1040/Schedule C export contract for CPA or software mapping.";
  let nextStep =
    "Use this contract to map the Schedule C draft into CPA software or a governed return-prep workflow.";

  if (status === "blocked") {
    summary =
      "Tina built the export contract shape, but blocked issues still prevent honest 1040/Schedule C mapping.";
    nextStep =
      "Clear the blocked package or MeF issues first, then rebuild the export contract before mapping.";
  } else if (status === "needs_review") {
    summary =
      "Tina built a usable 1040/Schedule C export contract, but a reviewer should clear the remaining attention items before software mapping.";
    nextStep =
      "Review the attention items and field-level support gaps, then hand the contract to the CPA or mapper.";
  }

  return {
    contractVersion: "tina.schedule_c_export.v1",
    status,
    summary,
    nextStep,
    returnType: "1040",
    schedules: ["Schedule C"],
    taxYear: draft.profile.taxYear,
    businessName: draft.profile.businessName,
    filingLane: "schedule_c_single_member_llc",
    mefStatus: mefReadiness.status,
    fields,
    unresolvedIssues,
    attachmentManifest: mefReadiness.attachments,
  };
}

export function buildTinaScheduleCExportContractFile(
  draft: TinaWorkspaceDraft
): { fileName: string; mimeType: string; contents: string } {
  const contract = buildTinaScheduleCExportContract(draft);
  const slug = (draft.profile.businessName || "business")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return {
    fileName: `tina-schedule-c-export-${slug || "business"}-${draft.profile.taxYear}.json`,
    mimeType: "application/json; charset=utf-8",
    contents: JSON.stringify(contract, null, 2),
  };
}
