import { buildTinaFederalReturnRequirements } from "@/tina/lib/federal-return-requirements";
import { buildTinaOfficialFederalFormTemplateSnapshot } from "@/tina/lib/official-form-templates";
import { buildTinaScheduleCReturn } from "@/tina/lib/schedule-c-return";
import { buildTinaStartPathAssessment } from "@/tina/lib/start-path";
import type {
  TinaCompanionFormPlanItem,
  TinaCompanionFormPlanSnapshot,
  TinaOfficialFederalFormTemplate,
  TinaWorkspaceDraft,
} from "@/tina/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function createItem(args: TinaCompanionFormPlanItem): TinaCompanionFormPlanItem {
  return {
    ...args,
    relatedLineNumbers: unique(args.relatedLineNumbers),
    relatedDocumentIds: unique(args.relatedDocumentIds),
  };
}

function templateMap(
  templates: TinaOfficialFederalFormTemplate[]
): Map<TinaOfficialFederalFormTemplate["id"], TinaOfficialFederalFormTemplate> {
  return new Map(templates.map((template) => [template.id, template]));
}

function hasHomeOfficeSignal(draft: TinaWorkspaceDraft): boolean {
  const haystack = `${draft.profile.notes} ${draft.profile.principalBusinessActivity}`.toLowerCase();
  return /\b(home office|office in home|home workspace)\b/.test(haystack);
}

export function buildTinaCompanionFormPlan(
  draft: TinaWorkspaceDraft
): TinaCompanionFormPlanSnapshot {
  const startPath = buildTinaStartPathAssessment(draft);
  const officialTemplates = buildTinaOfficialFederalFormTemplateSnapshot(draft);
  const federalReturnRequirements = buildTinaFederalReturnRequirements(draft);
  const scheduleCReturn = buildTinaScheduleCReturn(draft);
  const templatesById = templateMap(officialTemplates.templates);
  const line31Amount =
    scheduleCReturn.fields.find((field) => field.formKey === "netProfitOrLoss")?.amount ?? null;
  const depreciationAmount =
    scheduleCReturn.fields.find((field) => field.formKey === "depreciation")?.amount ?? null;
  const hasBlockingValidation = scheduleCReturn.validationIssues.some(
    (issue) => issue.severity === "blocking"
  );
  const hasAttentionValidation = scheduleCReturn.validationIssues.some(
    (issue) => issue.severity === "needs_attention"
  );
  const items: TinaCompanionFormPlanItem[] = [];

  if (startPath.recommendation.laneId === "schedule_c_single_member_llc") {
    items.push(
      createItem({
        id: "schedule-c-primary",
        formId: "f1040sc",
        title: "Schedule C primary return form",
        role: "primary_return",
        status:
          !hasBlockingValidation && !hasAttentionValidation
            ? "required_ready"
            : hasAttentionValidation
              ? "required_needs_review"
              : "required_blocked",
        fillMode: "structured_supported",
        summary:
          !hasBlockingValidation && !hasAttentionValidation
            ? "Tina has a structured Schedule C output for the supported lane."
            : "Tina has Schedule C output, but it still needs readiness cleanup before it should be treated as final.",
        relatedLineNumbers: scheduleCReturn.fields.map((field) => field.lineNumber),
        relatedDocumentIds: draft.documents.map((document) => document.id),
      })
    );

    items.push(
      createItem({
        id: "form-1040-companion",
        formId: "f1040",
        title: "Form 1040 companion return",
        role: "companion_schedule",
        status: "required_needs_review",
        fillMode: "blank_form_only",
        summary:
          "Tina stores the blank Form 1040 and knows it belongs in the final form set, but she does not fill it directly yet.",
        relatedLineNumbers: ["Line 31"],
        relatedDocumentIds: [],
      })
    );

    items.push(
      createItem({
        id: "schedule-se-companion",
        formId: "f1040sse",
        title: "Schedule SE companion form",
        role: "companion_schedule",
        status:
          typeof line31Amount === "number" && line31Amount > 0
            ? "required_needs_review"
            : "optional_watch",
        fillMode: "blank_form_only",
        summary:
          typeof line31Amount === "number" && line31Amount > 0
            ? "Positive Schedule C profit likely requires self-employment tax handling, but Tina does not fill Schedule SE directly yet."
            : "Schedule SE may not be required if this file does not produce self-employment profit.",
        relatedLineNumbers: ["Line 31"],
        relatedDocumentIds: [],
      })
    );

    if (draft.profile.hasFixedAssets || (typeof depreciationAmount === "number" && depreciationAmount > 0)) {
      items.push(
        createItem({
          id: "form-4562-attachment",
          formId: "f4562",
          title: "Form 4562 attachment plan",
          role: "attachment",
          status: "required_needs_review",
          fillMode: "blank_form_only",
          summary:
            "Fixed-asset or depreciation facts put Form 4562 in the likely form set, but Tina still needs attachment-grade production here.",
          relatedLineNumbers: ["Line 13"],
          relatedDocumentIds: draft.documents.map((document) => document.id),
        })
      );
    }

    if (hasHomeOfficeSignal(draft)) {
      items.push(
        createItem({
          id: "form-8829-attachment",
          formId: "f8829",
          title: "Form 8829 attachment plan",
          role: "attachment",
          status: "required_needs_review",
          fillMode: "blank_form_only",
          summary:
            "Home-office signals suggest Form 8829 may belong in the final set, but Tina still needs attachment-grade production here.",
          relatedLineNumbers: [],
          relatedDocumentIds: draft.documents.map((document) => document.id),
        })
      );
    }
  } else {
    const primaryTemplate =
      officialTemplates.primaryTemplateId && templatesById.has(officialTemplates.primaryTemplateId)
        ? templatesById.get(officialTemplates.primaryTemplateId) ?? null
        : null;

    items.push(
      createItem({
        id: "primary-return-family",
        formId: primaryTemplate?.id ?? null,
        title: primaryTemplate?.title ?? `${federalReturnRequirements.returnFamily} primary return`,
        role: primaryTemplate?.role ?? "primary_return",
        status: federalReturnRequirements.canTinaFinishLane
          ? "required_needs_review"
          : "required_blocked",
        fillMode: primaryTemplate ? "blank_form_only" : "future_lane",
        summary:
          federalReturnRequirements.canTinaFinishLane
            ? "Tina has the correct return family in view, but reviewer-controlled form completion is still needed."
            : "Tina knows the correct federal return family, but this lane still exceeds her automated return-production depth.",
        relatedLineNumbers: [],
        relatedDocumentIds: draft.documents.map((document) => document.id),
      })
    );
  }

  const blockingCount = items.filter((item) => item.status === "required_blocked").length;
  const reviewCount = items.filter((item) => item.status === "required_needs_review").length;

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    laneId: startPath.recommendation.laneId,
    returnFamily: federalReturnRequirements.returnFamily,
    summary:
      blockingCount > 0
        ? `Tina mapped the likely companion form set, but ${blockingCount} required form item${blockingCount === 1 ? "" : "s"} remain blocked.`
        : reviewCount > 0
          ? `Tina mapped the likely companion form set, with ${reviewCount} required form item${reviewCount === 1 ? "" : "s"} still needing reviewer-controlled completion.`
          : "Tina mapped the likely companion form set for the current lane.",
    nextStep:
      blockingCount > 0
        ? "Clear the blocked return-family items before implying a finished form set."
        : "Use this plan to sequence true form fill and attachment work next.",
    items,
  };
}
