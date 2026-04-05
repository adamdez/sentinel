import type {
  TinaOfficialFormExecutionItem,
  TinaOfficialFormExecutionSnapshot,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaAttachmentSchedules } from "@/tina/lib/attachment-schedules";
import { buildTinaCompanionFormCalculations } from "@/tina/lib/companion-form-calculations";
import { buildTinaCompanionFormRenderPlan } from "@/tina/lib/companion-form-render-plan";
import { buildTinaCompanionFormPlan } from "@/tina/lib/companion-form-plan";
import { buildTinaEntityReturnCalculations } from "@/tina/lib/entity-return-calculations";
import { buildTinaEntityReturnScheduleFamilyFinalizations } from "@/tina/lib/entity-return-schedule-family-finalizations";
import { buildTinaEntityReturnScheduleFamilyPayloads } from "@/tina/lib/entity-return-schedule-family-payloads";
import { buildTinaEntityReturnSupportArtifacts } from "@/tina/lib/entity-return-support-artifacts";
import { buildTinaFormReadiness } from "@/tina/lib/form-readiness";
import { buildTinaOfficialFormFill } from "@/tina/lib/official-form-fill";
import { buildTinaOfficialFederalFormTemplateSnapshot } from "@/tina/lib/official-form-templates";
import { buildTinaStartPathAssessment } from "@/tina/lib/start-path";
import { buildTinaOfficialFormRenderPlan } from "@/tina/lib/official-form-render-plan";
import type { TinaWorkspaceDraft } from "@/tina/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildItem(item: TinaOfficialFormExecutionItem): TinaOfficialFormExecutionItem {
  return {
    ...item,
    relatedLineNumbers: unique(item.relatedLineNumbers),
    relatedDocumentIds: unique(item.relatedDocumentIds),
  };
}

export function buildTinaOfficialFormExecution(
  draft: TinaWorkspaceDraft
): TinaOfficialFormExecutionSnapshot {
  const startPath = buildTinaStartPathAssessment(draft);
  const formReadiness = buildTinaFormReadiness(draft);
  const companionFormPlan = buildTinaCompanionFormPlan(draft);
  const companionFormCalculations = buildTinaCompanionFormCalculations(draft);
  const companionFormRenderPlan = buildTinaCompanionFormRenderPlan(draft);
  const entityReturnCalculations = buildTinaEntityReturnCalculations(draft);
  const entityReturnScheduleFamilyFinalizations =
    buildTinaEntityReturnScheduleFamilyFinalizations(draft);
  const entityReturnScheduleFamilyPayloads = buildTinaEntityReturnScheduleFamilyPayloads(draft);
  const entityReturnSupportArtifacts = buildTinaEntityReturnSupportArtifacts(draft);
  const officialFormFill = buildTinaOfficialFormFill(draft);
  const attachmentSchedules = buildTinaAttachmentSchedules(draft);
  const templateSnapshot = buildTinaOfficialFederalFormTemplateSnapshot(draft);
  const renderedFormArtifacts = buildTinaOfficialFormRenderPlan(draft);

  const items: TinaOfficialFormExecutionItem[] = companionFormPlan.items.map((planItem) => {
    const template =
      templateSnapshot.templates.find((candidate) => candidate.id === planItem.formId) ?? null;
    const calculations =
      companionFormCalculations.items.find((candidate) => candidate.formId === planItem.formId) ??
      null;
    const entityCalculation =
      entityReturnCalculations.items.find((candidate) => candidate.formId === planItem.formId) ??
      null;
    const entitySupportBlocked =
      entityCalculation !== null &&
      entityReturnSupportArtifacts.items.some((artifact) => artifact.status === "blocked");
    const entitySupportNeedsReview =
      entityCalculation !== null &&
      entityReturnSupportArtifacts.items.some((artifact) => artifact.status === "needs_review");
    const entitySchedulePayloadBlocked =
      entityCalculation !== null &&
      entityReturnScheduleFamilyPayloads.items.some((artifact) => artifact.status === "blocked");
    const entitySchedulePayloadNeedsReview =
      entityCalculation !== null &&
      entityReturnScheduleFamilyPayloads.items.some((artifact) => artifact.status === "needs_review");
    const entityScheduleFinalizationBlocked =
      entityCalculation !== null &&
      entityReturnScheduleFamilyFinalizations.items.some((artifact) => artifact.status === "blocked");
    const entityScheduleFinalizationNeedsReview =
      entityCalculation !== null &&
      entityReturnScheduleFamilyFinalizations.items.some(
        (artifact) => artifact.status === "needs_review"
      );
    const renderPlanItem =
      companionFormRenderPlan.items.find((candidate) => candidate.formId === planItem.formId) ??
      null;
    const renderedArtifact =
      renderedFormArtifacts.find((candidate) => candidate.formId === planItem.formId) ?? null;
    const schedules = attachmentSchedules.items.filter(
      (candidate) => candidate.formId === planItem.formId
    );
    const placementCount =
      planItem.formId === officialFormFill.formId
        ? officialFormFill.placements.length
        : renderPlanItem?.fieldValues.length ?? 0;
    const readyPlacementCount =
      planItem.formId === officialFormFill.formId
        ? officialFormFill.placements.filter((placement) => placement.status === "ready").length
        : renderPlanItem?.fieldValues.filter((field) => field.supportLevel !== "missing").length ?? 0;
    const reviewPlacementCount =
      planItem.formId === officialFormFill.formId
        ? officialFormFill.placements.filter((placement) => placement.status === "needs_review")
            .length
        : renderPlanItem?.status === "review_required"
          ? renderPlanItem.fieldValues.length
          : 0;
    const blockedPlacementCount =
      planItem.formId === officialFormFill.formId
        ? officialFormFill.placements.filter((placement) => placement.status === "blocked").length
        : renderPlanItem?.status === "blocked"
          ? Math.max(renderPlanItem.fieldValues.length, 1)
          : 0;

    let status: TinaOfficialFormExecutionItem["status"] = "review_required";
    if (
      planItem.status === "required_blocked" ||
      entityCalculation?.status === "blocked" ||
      entityScheduleFinalizationBlocked ||
      entitySchedulePayloadBlocked ||
      (planItem.formId === officialFormFill.formId &&
        officialFormFill.overallStatus === "blocked") ||
      schedules.some((schedule) => schedule.status === "blocked") ||
      calculations?.status === "blocked" ||
      renderPlanItem?.status === "blocked"
    ) {
      status = "blocked";
    } else if (
      planItem.formId === officialFormFill.formId &&
      officialFormFill.overallStatus === "ready" &&
      formReadiness.level === "reviewer_ready" &&
      schedules.every((schedule) => schedule.status === "ready")
    ) {
      status = "ready_to_fill";
    } else if (
      planItem.status === "required_ready" &&
      (entityCalculation?.status === "ready" ||
        calculations?.status === "ready" ||
        calculations?.status === "not_applicable" ||
        (!calculations && !entityCalculation)) &&
      !entitySupportNeedsReview &&
      !entityScheduleFinalizationNeedsReview &&
      !entityScheduleFinalizationBlocked &&
      !entitySchedulePayloadNeedsReview &&
      !entitySchedulePayloadBlocked &&
      schedules.every((schedule) => schedule.status === "ready")
    ) {
      status = "ready_to_fill";
    } else if (
      planItem.formId !== officialFormFill.formId &&
      renderPlanItem?.status === "ready_to_fill" &&
      !entitySupportNeedsReview &&
      !entityScheduleFinalizationNeedsReview &&
      !entityScheduleFinalizationBlocked &&
      !entitySchedulePayloadNeedsReview &&
      !entitySchedulePayloadBlocked
    ) {
      status = "ready_to_fill";
    }

    const renderedArtifactCount =
      status === "blocked" || !renderedArtifact || !renderedArtifact.downloadPath ? 0 : 1;
    const summary =
      renderedArtifact?.renderMode === "official_blank_fill_ready" && status === "ready_to_fill"
        ? `${planItem.title} can now render onto the stored official blank as a real Tina draft PDF.`
        : entitySupportBlocked
          ? `${planItem.title} still cannot stand alone because related K-1, balance-sheet, capital, or compensation support artifacts remain blocked.`
          : entityScheduleFinalizationBlocked
            ? `${planItem.title} still cannot stand alone because related K-1, Schedule L, M-family, capital, or shareholder-flow finalization outputs remain blocked.`
          : entitySchedulePayloadBlocked
            ? `${planItem.title} still cannot stand alone because related K-1, Schedule L, M-family, capital, or shareholder-flow payload families remain blocked.`
          : entitySupportNeedsReview
            ? `${planItem.title} can render provisionally, but Tina still has reviewer-controlled entity support artifacts behind this return family.`
            : entityScheduleFinalizationNeedsReview
              ? `${planItem.title} can render provisionally, but Tina still has reviewer-controlled schedule-family finalization outputs behind this return family.`
            : entitySchedulePayloadNeedsReview
              ? `${planItem.title} can render provisionally, but Tina still has reviewer-controlled schedule-family payloads behind this return family.`
            : renderedArtifact?.renderMode === "official_blank_annotated_ready" &&
                status !== "blocked"
              ? `${planItem.title} can now render as an official blank plus a structured Tina appendix for reviewer use.`
              : status === "ready_to_fill"
                ? `${planItem.title} now has a concrete render plan that is close enough to a real fill pass for Tina's current backend lane.`
                : status === "review_required"
                  ? `${planItem.title} is mapped with real field payloads, but Tina still needs reviewer cleanup before acting like it is execution-ready.`
                  : `${planItem.title} is still blocked by support, route, or attachment gaps.`;

    return buildItem({
      id: planItem.id,
      formId: planItem.formId,
      title: planItem.title,
      role: planItem.role,
      status,
      fillMode:
        renderedArtifact?.renderMode === "official_blank_fill_ready"
          ? "rendered_pdf_ready"
          : renderedArtifact?.renderMode === "official_blank_annotated_ready"
            ? "annotated_pdf_ready"
            : renderedArtifactCount > 0
              ? "rendered_preview"
              : planItem.formId === officialFormFill.formId &&
                  (officialFormFill.mode === "overlay_plan" ||
                    officialFormFill.mode === "direct_field_plan")
                ? "overlay_ready"
                : planItem.fillMode === "future_lane"
                  ? "future_lane"
                  : "blank_only",
      summary,
      templateReady: Boolean(template),
      placementCount,
      readyPlacementCount,
      reviewPlacementCount,
      blockedPlacementCount,
      scheduleCount: schedules.length,
      calculationStatus: calculations?.status ?? entityCalculation?.status ?? null,
      renderedArtifactCount,
      directPdfFieldCount: renderedArtifact?.directPdfFieldCount ?? 0,
      relatedLineNumbers: unique([
        ...planItem.relatedLineNumbers,
        ...schedules.flatMap((schedule) => schedule.relatedLineNumbers),
        ...(planItem.formId === officialFormFill.formId
          ? officialFormFill.placements.flatMap((placement) => placement.relatedLineNumbers)
          : []),
      ]),
      relatedDocumentIds: unique([
        ...planItem.relatedDocumentIds,
        ...schedules.flatMap((schedule) => schedule.relatedDocumentIds),
        ...(calculations?.relatedDocumentIds ?? []),
        ...(entityCalculation?.relatedDocumentIds ?? []),
        ...(planItem.formId === officialFormFill.formId
          ? officialFormFill.placements.flatMap((placement) => placement.relatedDocumentIds)
          : []),
      ]),
    });
  });

  const blockedCount = items.filter((item) => item.status === "blocked").length;
  const reviewCount = items.filter((item) => item.status === "review_required").length;
  const overallStatus =
    blockedCount > 0 ? "blocked" : reviewCount > 0 ? "review_required" : "ready_to_fill";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    laneId: startPath.recommendation.laneId,
    overallStatus,
    summary:
      overallStatus === "ready_to_fill"
        ? "Tina has a coherent official-form execution stack for the current lane."
        : overallStatus === "review_required"
          ? "Tina has an official-form execution stack, but some forms still need reviewer-controlled cleanup."
          : "Tina still has blocked form-execution work before she should behave like a finished return engine.",
    nextStep:
      overallStatus === "ready_to_fill"
        ? "Use this execution layer to drive real form rendering against the stored blanks."
        : "Clear the blocked or review-required forms before Tina calls the execution path close to finished.",
    items,
  };
}
