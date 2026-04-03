import type {
  TinaOfficialFormExecutionItem,
  TinaOfficialFormExecutionSnapshot,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaAttachmentSchedules } from "@/tina/lib/attachment-schedules";
import { buildTinaCompanionFormCalculations } from "@/tina/lib/companion-form-calculations";
import { buildTinaCompanionFormPlan } from "@/tina/lib/companion-form-plan";
import { buildTinaFormReadiness } from "@/tina/lib/form-readiness";
import { buildTinaOfficialFormFill } from "@/tina/lib/official-form-fill";
import { buildTinaOfficialFederalFormTemplateSnapshot } from "@/tina/lib/official-form-templates";
import { buildTinaStartPathAssessment } from "@/tina/lib/start-path";
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
  const officialFormFill = buildTinaOfficialFormFill(draft);
  const attachmentSchedules = buildTinaAttachmentSchedules(draft);
  const templateSnapshot = buildTinaOfficialFederalFormTemplateSnapshot(draft);

  const items: TinaOfficialFormExecutionItem[] = companionFormPlan.items.map((planItem) => {
    const template =
      templateSnapshot.templates.find((candidate) => candidate.id === planItem.formId) ?? null;
    const calculations =
      companionFormCalculations.items.find((candidate) => candidate.formId === planItem.formId) ??
      null;
    const schedules = attachmentSchedules.items.filter(
      (candidate) => candidate.formId === planItem.formId
    );
    const placementCount =
      planItem.formId === officialFormFill.formId ? officialFormFill.placements.length : 0;
    const readyPlacementCount =
      planItem.formId === officialFormFill.formId
        ? officialFormFill.placements.filter((placement) => placement.status === "ready").length
        : 0;
    const reviewPlacementCount =
      planItem.formId === officialFormFill.formId
        ? officialFormFill.placements.filter((placement) => placement.status === "needs_review")
            .length
        : 0;
    const blockedPlacementCount =
      planItem.formId === officialFormFill.formId
        ? officialFormFill.placements.filter((placement) => placement.status === "blocked").length
        : 0;

    let status: TinaOfficialFormExecutionItem["status"] = "review_required";
    if (
      planItem.status === "required_blocked" ||
      (planItem.formId === officialFormFill.formId &&
        officialFormFill.overallStatus === "blocked") ||
      schedules.some((schedule) => schedule.status === "blocked") ||
      calculations?.status === "blocked"
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
      (calculations?.status === "ready" ||
        calculations?.status === "not_applicable" ||
        !calculations) &&
      schedules.every((schedule) => schedule.status === "ready")
    ) {
      status = "ready_to_fill";
    }

    return buildItem({
      id: planItem.id,
      formId: planItem.formId,
      title: planItem.title,
      role: planItem.role,
      status,
      fillMode:
        planItem.formId === officialFormFill.formId && officialFormFill.mode === "overlay_plan"
          ? "overlay_ready"
          : planItem.fillMode === "future_lane"
            ? "future_lane"
            : "blank_only",
      summary:
        status === "ready_to_fill"
          ? `${planItem.title} is close enough to a real fill pass for Tina's current backend lane.`
          : status === "review_required"
            ? `${planItem.title} is mapped, but Tina still needs reviewer cleanup before acting like it is execution-ready.`
            : `${planItem.title} is still blocked by support, route, or attachment gaps.`,
      templateReady: Boolean(template),
      placementCount,
      readyPlacementCount,
      reviewPlacementCount,
      blockedPlacementCount,
      scheduleCount: schedules.length,
      calculationStatus: calculations?.status ?? null,
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
