import type {
  TinaRenderedFormArtifact,
  TinaRenderedFormArtifactStatus,
  TinaRenderedFormFieldValue,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaCompanionFormPlan } from "@/tina/lib/companion-form-plan";
import { buildTinaCompanionFormRenderPlan } from "@/tina/lib/companion-form-render-plan";
import { countTinaDirectPdfFieldMatches } from "@/tina/lib/official-form-pdf-fields";
import { buildTinaOfficialFederalFormTemplateSnapshot } from "@/tina/lib/official-form-templates";
import { buildTinaOfficialFormFill } from "@/tina/lib/official-form-fill";
import type { TinaOfficialFederalFormTemplate, TinaWorkspaceDraft } from "@/tina/types";

const renderPlanCache = new WeakMap<TinaWorkspaceDraft, TinaRenderedFormArtifact[]>();

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "business"
  );
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function statusFromFormState(
  value: "ready_to_fill" | "review_required" | "blocked"
): TinaRenderedFormArtifactStatus {
  return value === "ready_to_fill" ? "ready" : value === "review_required" ? "provisional" : "blocked";
}

function supportLevelFromEvidence(
  value: "strong" | "moderate" | "weak" | "missing"
): TinaRenderedFormFieldValue["supportLevel"] {
  if (value === "strong") return "supported";
  if (value === "missing") return "missing";
  return "derived";
}

function buildFileName(formId: string | null, slug: string, taxYear: string): string {
  return `tina-official-${formId ?? "unknown"}-${slug}-${taxYear}.pdf`;
}

function buildDownloadPath(formId: string | null): string | null {
  if (!formId) return null;
  return `/api/tina/rendered-form?formId=${encodeURIComponent(formId)}`;
}

function estimatedAppendixPages(fieldCount: number): number {
  if (fieldCount <= 0) return 0;
  const linesPerPage = 18;
  return Math.max(1, Math.ceil(fieldCount / linesPerPage));
}

function mapScheduleCFields(
  draft: TinaWorkspaceDraft
): {
  artifact: TinaRenderedFormArtifact;
  fieldValues: TinaRenderedFormFieldValue[];
} {
  const templateSnapshot = buildTinaOfficialFederalFormTemplateSnapshot(draft);
  const officialFormFill = buildTinaOfficialFormFill(draft);
  const template =
    officialFormFill.formId === "f1040sc"
      ? templateSnapshot.templates.find((item) => item.id === "f1040sc") ?? null
      : null;
  const slug = slugify(draft.profile.businessName || "business");
  const taxYear = draft.profile.taxYear || "tax-year";
  const fieldValues = officialFormFill.placements.map((placement) => ({
    id: placement.id,
    fieldKey: placement.fieldKey,
    label: placement.label,
    value: placement.value,
    amount: null,
    supportLevel: supportLevelFromEvidence(placement.evidenceSupportLevel),
    relatedLineNumbers: placement.relatedLineNumbers,
    relatedDocumentIds: placement.relatedDocumentIds,
  }));
  const status =
    officialFormFill.overallStatus === "ready"
      ? "ready"
      : officialFormFill.overallStatus === "needs_review"
        ? "provisional"
        : "blocked";
  const renderReady = Boolean(template) && officialFormFill.overallStatus !== "blocked";

  return {
    fieldValues,
    artifact: {
      id: "rendered-schedule-c-primary",
      formId: "f1040sc",
      title: template?.title ?? "Schedule C primary return form",
      status,
      renderMode: renderReady ? "official_blank_fill_ready" : "blocked",
      fileName: buildFileName("f1040sc", slug, taxYear),
      mimeType: "application/pdf",
      templateReady: Boolean(template),
      placementCount: officialFormFill.placements.length,
      renderedAt: null,
      renderedByteLength: null,
      renderedSha256: null,
      appendixPageCount: 0,
      downloadPath: renderReady ? buildDownloadPath("f1040sc") : null,
      summary:
      renderReady
          ? status === "ready"
            ? "Tina can now render the stored Schedule C blank directly from the current structured placement map."
            : "Tina can render the stored Schedule C blank, but the current values are still provisional and need reviewer trust."
          : "Tina cannot safely render the stored Schedule C blank until the route and placement blockers clear.",
      fieldValues,
      relatedLineNumbers: unique(officialFormFill.placements.flatMap((placement) => placement.relatedLineNumbers)),
      relatedDocumentIds: unique(
        officialFormFill.placements.flatMap((placement) => placement.relatedDocumentIds)
      ),
      directPdfFieldCount: officialFormFill.placements.filter((placement) => placement.pdfFieldName).length,
      appendixFieldCount: 0,
    },
  };
}

function mapCompanionArtifact(args: {
  draft: TinaWorkspaceDraft;
  template: TinaOfficialFederalFormTemplate | null;
  planItem: ReturnType<typeof buildTinaCompanionFormPlan>["items"][number];
  renderPlanItem: ReturnType<typeof buildTinaCompanionFormRenderPlan>["items"][number] | null;
}): TinaRenderedFormArtifact {
  const { draft, template, planItem, renderPlanItem } = args;
  const slug = slugify(draft.profile.businessName || "business");
  const taxYear = draft.profile.taxYear || "tax-year";
  const fieldValues = renderPlanItem?.fieldValues ?? [];
  const directPdfFieldCount = countTinaDirectPdfFieldMatches({
    formId: planItem.formId,
    fieldValues,
  });
  const appendixFieldCount = Math.max(fieldValues.length - directPdfFieldCount, 0);
  const renderReady =
    Boolean(template) &&
    fieldValues.length > 0 &&
    renderPlanItem?.status !== "blocked";
  const status = renderPlanItem
    ? statusFromFormState(renderPlanItem.status)
    : planItem.status === "required_blocked"
      ? "blocked"
      : "provisional";

  return {
    id: `rendered-${planItem.id}`,
    formId: planItem.formId,
    title: planItem.title,
    status,
    renderMode: renderReady
      ? appendixFieldCount === 0
        ? "official_blank_fill_ready"
        : "official_blank_annotated_ready"
      : planItem.fillMode === "blank_form_only" && template
        ? "companion_preview"
        : "blocked",
    fileName: buildFileName(planItem.formId, slug, taxYear),
    mimeType: "application/pdf",
    templateReady: Boolean(template),
    placementCount: fieldValues.length,
    renderedAt: null,
    renderedByteLength: null,
    renderedSha256: null,
    directPdfFieldCount,
    appendixFieldCount,
    appendixPageCount: renderReady && appendixFieldCount > 0 ? estimatedAppendixPages(appendixFieldCount) : 0,
    downloadPath: renderReady ? buildDownloadPath(planItem.formId) : null,
    summary: renderReady
      ? appendixFieldCount === 0
        ? status === "ready"
          ? `${planItem.title} can now fill the stored official blank directly from Tina's structured field payloads.`
          : `${planItem.title} can now fill the stored official blank directly, but the values are still provisional.`
        : status === "ready"
          ? `${planItem.title} can now render as an official blank plus a structured Tina appendix for reviewer use.`
          : `${planItem.title} can now render as an official blank plus a structured Tina appendix, but the values are still provisional.`
      : template
        ? `${planItem.title} still only has preview-level truth because Tina lacks enough structured field payloads to render it safely.`
        : `${planItem.title} cannot render because the official blank template or supporting field payloads are missing.`,
    fieldValues,
    relatedLineNumbers: unique([
      ...planItem.relatedLineNumbers,
      ...(renderPlanItem?.relatedLineNumbers ?? []),
    ]),
    relatedDocumentIds: unique([
      ...planItem.relatedDocumentIds,
      ...(renderPlanItem?.relatedDocumentIds ?? []),
    ]),
  };
}

export function buildTinaOfficialFormRenderPlan(
  draft: TinaWorkspaceDraft
): TinaRenderedFormArtifact[] {
  const cached = renderPlanCache.get(draft);
  if (cached) return cached;

  const templateSnapshot = buildTinaOfficialFederalFormTemplateSnapshot(draft);
  const companionFormPlan = buildTinaCompanionFormPlan(draft);
  const companionFormRenderPlan = buildTinaCompanionFormRenderPlan(draft);
  const templatesById = new Map(templateSnapshot.templates.map((template) => [template.id, template]));
  const scheduleC = mapScheduleCFields(draft);

  const artifacts: TinaRenderedFormArtifact[] = [
    scheduleC.artifact,
    ...companionFormPlan.items
      .filter((item) => item.formId !== "f1040sc")
      .map((planItem) =>
        mapCompanionArtifact({
          draft,
          template: planItem.formId ? templatesById.get(planItem.formId) ?? null : null,
          planItem,
          renderPlanItem:
            companionFormRenderPlan.items.find((item) => item.formId === planItem.formId) ?? null,
        })
      ),
  ];

  renderPlanCache.set(draft, artifacts);
  return artifacts;
}
