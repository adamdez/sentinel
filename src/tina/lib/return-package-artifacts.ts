import type {
  TinaAttachmentArtifact,
  TinaDisclosureArtifact,
  TinaEntityReturnScheduleFamilyFinalizationArtifact,
  TinaEntityReturnScheduleFamilyArtifact,
  TinaEntityReturnScheduleFamilyPayloadArtifact,
  TinaEntityReturnSupportArtifact,
  TinaRenderedFormFieldValue,
  TinaRenderedFormArtifact,
  TinaReturnPackageArtifactSnapshot,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaAttachmentSchedules } from "@/tina/lib/attachment-schedules";
import { buildTinaAttachmentStatements } from "@/tina/lib/attachment-statements";
import { buildTinaCompanionFormRenderPlan } from "@/tina/lib/companion-form-render-plan";
import { buildTinaDisclosureReadiness } from "@/tina/lib/disclosure-readiness";
import { buildTinaEntityReturnPackagePlan } from "@/tina/lib/entity-return-package-plan";
import { buildTinaEntityReturnScheduleFamilyFinalizations } from "@/tina/lib/entity-return-schedule-family-finalizations";
import { buildTinaEntityReturnScheduleFamilyPayloads } from "@/tina/lib/entity-return-schedule-family-payloads";
import { buildTinaEntityReturnScheduleFamilyArtifacts } from "@/tina/lib/entity-return-schedule-family-artifacts";
import { buildTinaEntityReturnSupportArtifacts } from "@/tina/lib/entity-return-support-artifacts";
import { buildTinaOfficialFederalFormTemplateSnapshot } from "@/tina/lib/official-form-templates";
import { buildTinaOfficialFormFill } from "@/tina/lib/official-form-fill";
import { buildTinaOfficialFormExecution } from "@/tina/lib/official-form-execution";
import { buildTinaOfficialFormRenderPlan } from "@/tina/lib/official-form-render-plan";
import { buildTinaScheduleCPdfExport } from "@/tina/lib/schedule-c-pdf";
import type { TinaWorkspaceDraft } from "@/tina/types";

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "business"
  );
}

export function buildTinaReturnPackageArtifacts(
  draft: TinaWorkspaceDraft
): TinaReturnPackageArtifactSnapshot {
  const templateSnapshot = buildTinaOfficialFederalFormTemplateSnapshot(draft);
  const officialFormFill = buildTinaOfficialFormFill(draft);
  const officialFormExecution = buildTinaOfficialFormExecution(draft);
  const officialFormRenderPlan = buildTinaOfficialFormRenderPlan(draft);
  const companionFormRenderPlan = buildTinaCompanionFormRenderPlan(draft);
  const attachmentSchedules = buildTinaAttachmentSchedules(draft);
  const attachmentStatements = buildTinaAttachmentStatements(draft);
  const disclosureReadiness = buildTinaDisclosureReadiness(draft);
  const entityReturnPackagePlan = buildTinaEntityReturnPackagePlan(draft);
  const entityReturnScheduleSnapshot = buildTinaEntityReturnScheduleFamilyArtifacts(draft);
  const entityReturnScheduleFinalizationSnapshot =
    buildTinaEntityReturnScheduleFamilyFinalizations(draft);
  const entityReturnSchedulePayloadSnapshot = buildTinaEntityReturnScheduleFamilyPayloads(draft);
  const entityReturnSupportSnapshot = buildTinaEntityReturnSupportArtifacts(draft);
  const scheduleCPdf = buildTinaScheduleCPdfExport(draft);
  const taxYear = draft.profile.taxYear || "tax-year";
  const slug = slugify(draft.profile.businessName || "business");

  const renderedForms: TinaRenderedFormArtifact[] = officialFormExecution.items.map((item) => {
    const template =
      templateSnapshot.templates.find((candidate) => candidate.id === item.formId) ?? null;
    const renderPlanItem =
      companionFormRenderPlan.items.find((candidate) => candidate.formId === item.formId) ?? null;
    const isScheduleC = item.formId === officialFormFill.formId;
    const renderPlanArtifact =
      officialFormRenderPlan.find((candidate) => candidate.formId === item.formId) ?? null;
    const fallbackFieldValues: TinaRenderedFormFieldValue[] = isScheduleC
      ? officialFormFill.placements.map((placement) => ({
          id: placement.id,
          fieldKey: placement.fieldKey,
          label: placement.label,
          value: placement.value,
          amount: null,
          supportLevel:
            placement.evidenceSupportLevel === "strong"
              ? "supported"
              : placement.evidenceSupportLevel === "moderate" ||
                  placement.evidenceSupportLevel === "weak"
                ? "derived"
                : "missing",
          relatedLineNumbers: placement.relatedLineNumbers,
          relatedDocumentIds: placement.relatedDocumentIds,
        }))
      : renderPlanItem?.fieldValues ?? [];

    return {
      id: renderPlanArtifact?.id ?? `rendered-${item.id}`,
      formId: item.formId,
      title: item.title,
      status:
        item.status === "ready_to_fill"
          ? "ready"
          : item.status === "review_required"
            ? "provisional"
            : "blocked",
      renderMode:
        renderPlanArtifact?.renderMode ??
        (item.status === "blocked"
          ? "blocked"
          : isScheduleC
            ? "official_overlay_preview"
            : "companion_preview"),
      fileName:
        renderPlanArtifact?.fileName ??
        (isScheduleC
          ? scheduleCPdf.fileName.replace("tina-schedule-c", "official-overlay-schedule-c")
          : `official-preview-${item.formId ?? "unknown"}-${slug}-${taxYear}.pdf`),
      mimeType: "application/pdf",
      templateReady: Boolean(template),
      placementCount:
        renderPlanArtifact?.placementCount ??
        (isScheduleC ? officialFormFill.placements.length : fallbackFieldValues.length),
      renderedAt: renderPlanArtifact?.renderedAt ?? null,
      renderedByteLength: renderPlanArtifact?.renderedByteLength ?? null,
      renderedSha256: renderPlanArtifact?.renderedSha256 ?? null,
      directPdfFieldCount: renderPlanArtifact?.directPdfFieldCount ?? 0,
      appendixFieldCount: renderPlanArtifact?.appendixFieldCount ?? 0,
      appendixPageCount: renderPlanArtifact?.appendixPageCount ?? 0,
      downloadPath: renderPlanArtifact?.downloadPath ?? null,
      summary:
        item.status === "ready_to_fill"
          ? renderPlanArtifact?.summary ??
            `${item.title} has a renderable preview artifact anchored to the stored official blank.`
          : item.status === "review_required"
            ? renderPlanArtifact?.summary ??
              `${item.title} has a provisional preview artifact, but reviewer cleanup is still required before trust.`
            : `${item.title} does not have a safe rendered artifact yet because the lane or support is still blocked.`,
      fieldValues: renderPlanArtifact?.fieldValues ?? fallbackFieldValues,
      relatedLineNumbers: item.relatedLineNumbers,
      relatedDocumentIds: item.relatedDocumentIds,
    };
  });

  const attachments: TinaAttachmentArtifact[] = [
    ...attachmentSchedules.items.map((item) => ({
      id: `attachment-schedule-${item.id}`,
      sourceId: item.id,
      title: item.title,
      category: item.category,
      status: item.status,
      fileName: `${item.id}-${slug}-${taxYear}.md`,
      mimeType: "text/markdown; charset=utf-8",
      summary: item.summary,
      relatedLineNumbers: item.relatedLineNumbers,
      relatedDocumentIds: item.relatedDocumentIds,
    })),
    ...attachmentStatements.items.map((item) => ({
      id: `attachment-statement-${item.id}`,
      sourceId: item.id,
      title: item.title,
      category: item.category,
      status: item.status,
      fileName: `${item.id}-${slug}-${taxYear}.txt`,
      mimeType: "text/plain; charset=utf-8",
      summary: item.summary,
      relatedLineNumbers: item.relatedLineNumbers,
      relatedDocumentIds: item.relatedDocumentIds,
    })),
  ];

  const disclosures: TinaDisclosureArtifact[] = disclosureReadiness.items.map((item) => ({
    id: `disclosure-${item.id}`,
    title: item.title,
    status: item.status === "not_applicable" ? "clear" : item.status,
    fileName:
      item.status === "required" || item.status === "needs_review"
        ? `${item.id}-${slug}-${taxYear}.md`
        : null,
    summary: item.summary,
    relatedPositionIds: item.relatedPositionIds,
    relatedDocumentIds: item.relatedDocumentIds,
  }));

  const entitySupportArtifacts: TinaEntityReturnSupportArtifact[] =
    entityReturnSupportSnapshot.items;
  const entityScheduleFamilyArtifacts: TinaEntityReturnScheduleFamilyArtifact[] =
    entityReturnScheduleSnapshot.items;
  const entityScheduleFamilyFinalizationArtifacts: TinaEntityReturnScheduleFamilyFinalizationArtifact[] =
    entityReturnScheduleFinalizationSnapshot.items;
  const entityScheduleFamilyPayloadArtifacts: TinaEntityReturnScheduleFamilyPayloadArtifact[] =
    entityReturnSchedulePayloadSnapshot.items;

  const blockedFormCount = renderedForms.filter((item) => item.status === "blocked").length;
  const blockedEntityPackageCount = entityReturnPackagePlan.items.filter(
    (item) => item.status === "blocked"
  ).length;
  const blockedEntitySupportCount = entitySupportArtifacts.filter(
    (item) => item.status === "blocked"
  ).length;
  const blockedEntityScheduleFinalizationCount = entityScheduleFamilyFinalizationArtifacts.filter(
    (item) => item.status === "blocked"
  ).length;
  const blockedEntitySchedulePayloadCount = entityScheduleFamilyPayloadArtifacts.filter(
    (item) => item.status === "blocked"
  ).length;
  const provisionalCount =
    renderedForms.filter((item) => item.status === "provisional").length +
    entityReturnPackagePlan.items.filter((item) => item.status === "review_required").length +
    entityScheduleFamilyFinalizationArtifacts.filter((item) => item.status === "needs_review")
      .length +
    entityScheduleFamilyPayloadArtifacts.filter((item) => item.status === "needs_review").length +
    entitySupportArtifacts.filter((item) => item.status === "needs_review").length +
    attachments.filter((item) => item.status === "needs_review").length +
    disclosures.filter((item) => item.status === "needs_review" || item.status === "required").length;
  const overallStatus =
    blockedFormCount > 0 ||
    blockedEntityPackageCount > 0 ||
    blockedEntityScheduleFinalizationCount > 0 ||
    blockedEntitySchedulePayloadCount > 0 ||
    blockedEntitySupportCount > 0 ||
    attachments.some((item) => item.status === "blocked")
      ? "blocked"
      : provisionalCount > 0
        ? "provisional"
        : "ready";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    overallStatus,
    summary:
      overallStatus === "ready"
        ? "Tina has a coherent rendered return package artifact set for the current lane."
        : overallStatus === "provisional"
          ? "Tina has rendered and package-family artifacts, but some of them are still reviewer-controlled."
          : "Tina does not yet have a safe rendered package artifact set for this lane.",
    nextStep:
      overallStatus === "ready"
        ? "Use the rendered artifacts as the package-level execution surface for review."
        : "Clear the blocked or provisional artifacts before calling the package filing-grade.",
    renderedForms,
    attachments,
    disclosures,
    entityPackageItems: entityReturnPackagePlan.items,
    entityScheduleFamilyArtifacts,
    entityScheduleFamilyFinalizationArtifacts,
    entityScheduleFamilyPayloadArtifacts,
    entitySupportArtifacts,
  };
}
