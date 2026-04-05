import type {
  TinaCompanionFormRenderPlanItem,
  TinaCompanionFormRenderPlanSnapshot,
  TinaRenderedFormFieldValue,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaAttachmentSchedules } from "@/tina/lib/attachment-schedules";
import { buildTinaCompanionFormCalculations } from "@/tina/lib/companion-form-calculations";
import { buildTinaCompanionFormPlan } from "@/tina/lib/companion-form-plan";
import { buildTinaEntityReturnCalculations } from "@/tina/lib/entity-return-calculations";
import { buildTinaOfficialFederalFormTemplateSnapshot } from "@/tina/lib/official-form-templates";
import { buildTinaOfficialFormFill } from "@/tina/lib/official-form-fill";
import type { TinaWorkspaceDraft } from "@/tina/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function formatMoney(value: number | null): string {
  if (value === null) return "Pending reviewer estimate";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number | null, decimals = 0): string {
  if (value === null) return "Pending reviewer estimate";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function formatCalculationValue(label: string, amount: number | null): string {
  const normalized = label.toLowerCase();
  if (/percentage/.test(normalized)) {
    return formatNumber(amount, 2);
  }

  if (/area used|total area/.test(normalized)) {
    return formatNumber(amount, 0);
  }

  return formatMoney(amount);
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "field"
  );
}

function buildFieldValue(
  value: TinaRenderedFormFieldValue
): TinaRenderedFormFieldValue {
  return {
    ...value,
    relatedLineNumbers: unique(value.relatedLineNumbers),
    relatedDocumentIds: unique(value.relatedDocumentIds),
  };
}

function supportForCalculationValue(amount: number | null): TinaRenderedFormFieldValue["supportLevel"] {
  return amount === null ? "missing" : "derived";
}

function buildProfileFieldValues(args: {
  draft: TinaWorkspaceDraft;
  formId: string | null;
  itemId: string;
}): TinaRenderedFormFieldValue[] {
  const { draft, formId, itemId } = args;

  if (formId === "f4562") {
    const activity = draft.profile.principalBusinessActivity.trim() || draft.profile.businessName.trim();
    if (!activity) return [];

    return [
      buildFieldValue({
        id: `${itemId}-activity`,
        fieldKey: "business_activity_to_which_this_form_relates",
        label: "Business or activity to which this form relates",
        value: activity,
        amount: null,
        supportLevel: "supported",
        relatedLineNumbers: [],
        relatedDocumentIds: [],
      }),
    ];
  }

  return [];
}

export function buildTinaCompanionFormRenderPlan(
  draft: TinaWorkspaceDraft
): TinaCompanionFormRenderPlanSnapshot {
  const officialFormFill = buildTinaOfficialFormFill(draft);
  const companionFormPlan = buildTinaCompanionFormPlan(draft);
  const companionFormCalculations = buildTinaCompanionFormCalculations(draft);
  const entityReturnCalculations = buildTinaEntityReturnCalculations(draft);
  const attachmentSchedules = buildTinaAttachmentSchedules(draft);
  const officialTemplates = buildTinaOfficialFederalFormTemplateSnapshot(draft);

  const items: TinaCompanionFormRenderPlanItem[] = companionFormPlan.items
    .filter((item) => item.formId !== officialFormFill.formId)
    .map((item) => {
      const calculation =
        companionFormCalculations.items.find((candidate) => candidate.formId === item.formId) ?? null;
      const entityCalculation =
        entityReturnCalculations.items.find((candidate) => candidate.formId === item.formId) ?? null;
      const schedules = attachmentSchedules.items.filter(
        (candidate) => candidate.formId === item.formId
      );
      const template =
        officialTemplates.templates.find((candidate) => candidate.id === item.formId) ?? null;

      const calculatedFields = (calculation?.estimatedValues ?? []).map((entry, index) =>
        buildFieldValue({
          id: `${item.id}-calc-${index + 1}`,
          fieldKey: slugify(entry.label),
          label: entry.label,
          value: formatCalculationValue(entry.label, entry.amount),
          amount: entry.amount,
          supportLevel: supportForCalculationValue(entry.amount),
          relatedLineNumbers: calculation?.relatedLineNumbers ?? [],
          relatedDocumentIds: calculation?.relatedDocumentIds ?? [],
        })
      );
      const entityFields = (entityCalculation?.fields ?? []).map((field) =>
        buildFieldValue({
          id: field.id,
          fieldKey: field.fieldKey,
          label: field.label,
          value: field.value,
          amount: field.amount,
          supportLevel: field.supportLevel,
          relatedLineNumbers: [],
          relatedDocumentIds: field.relatedDocumentIds,
        })
      );
      const profileFields = buildProfileFieldValues({
        draft,
        formId: item.formId,
        itemId: item.id,
      });

      const scheduleFields = schedules.flatMap((schedule) =>
        schedule.rows.map((row, index) =>
          buildFieldValue({
            id: `${schedule.id}-row-${index + 1}`,
            fieldKey: `${slugify(schedule.category)}_${slugify(row.label)}`,
            label: row.label,
            value: row.amount !== null ? formatMoney(row.amount) : row.value,
            amount: row.amount,
            supportLevel: row.supportLevel,
            relatedLineNumbers: schedule.relatedLineNumbers,
            relatedDocumentIds: row.relatedDocumentIds,
          })
        )
      );

      const fieldValues = [...profileFields, ...entityFields, ...calculatedFields, ...scheduleFields];
      const status: TinaCompanionFormRenderPlanItem["status"] =
        item.status === "required_blocked" ||
        calculation?.status === "blocked" ||
        entityCalculation?.status === "blocked" ||
        !template
          ? "blocked"
          : entityCalculation?.status === "ready" ||
              calculation?.status === "ready" ||
              item.status === "required_ready" ||
              schedules.some((schedule) => schedule.status === "ready")
            ? "ready_to_fill"
            : fieldValues.length > 0
              ? "review_required"
              : "blocked";

      return {
        id: item.id,
        formId: item.formId,
        title: item.title,
        status,
        templateReady: Boolean(template),
        summary:
          status === "ready_to_fill"
            ? `${item.title} now carries explicit field-ready preview values tied to calculations and attachment workpapers.`
          : status === "review_required"
              ? `${item.title} has a real render plan, but some values still need reviewer completion before Tina should trust the output.`
              : `${item.title} still lacks enough support to behave like a safe rendered companion form.`,
        fieldValues,
        requiredAttachmentCategories: unique(schedules.map((schedule) => schedule.category)),
        relatedLineNumbers: unique([
          ...item.relatedLineNumbers,
          ...(calculation?.relatedLineNumbers ?? []),
          ...schedules.flatMap((schedule) => schedule.relatedLineNumbers),
        ]),
        relatedDocumentIds: unique([
          ...item.relatedDocumentIds,
          ...(entityCalculation?.relatedDocumentIds ?? []),
          ...(calculation?.relatedDocumentIds ?? []),
          ...schedules.flatMap((schedule) => schedule.relatedDocumentIds),
        ]),
      };
    });

  const blockedCount = items.filter((item) => item.status === "blocked").length;
  const reviewCount = items.filter((item) => item.status === "review_required").length;
  const overallStatus =
    blockedCount > 0 ? "blocked" : reviewCount > 0 ? "review_required" : "ready_to_fill";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    overallStatus,
    summary:
      items.length === 0
        ? "Tina does not currently need companion-form render plans beyond the primary form."
        : overallStatus === "ready_to_fill"
          ? `Tina built ${items.length} companion-form render plan${items.length === 1 ? "" : "s"} with explicit field values.`
          : overallStatus === "review_required"
            ? `Tina built ${items.length} companion-form render plan${items.length === 1 ? "" : "s"}, but some still need reviewer completion.`
            : `Tina built companion-form render plans, but ${blockedCount} item${blockedCount === 1 ? "" : "s"} still block safe execution.`,
    nextStep:
      overallStatus === "ready_to_fill"
        ? "Use these field payloads to drive real blank-form filling or preview rendering."
        : "Clear the blocked or review-required companion-form inputs before calling the form stack elite.",
    items,
  };
}
