import { buildTinaOfficialFederalFormTemplateSnapshot } from "@/tina/lib/official-form-templates";
import { buildTinaScheduleCFormTrace } from "@/tina/lib/schedule-c-form-trace";
import { buildTinaScheduleCReturn } from "@/tina/lib/schedule-c-return";
import { buildTinaStartPathAssessment } from "@/tina/lib/start-path";
import type {
  TinaOfficialFormFillPlacement,
  TinaOfficialFormFillSnapshot,
  TinaWorkspaceDraft,
} from "@/tina/types";

interface TinaPlacementSeed {
  fieldKey: string;
  label: string;
  pdfFieldName: string | null;
  x: number;
  y: number;
  fontSize: number;
  pageNumber?: number;
}

const SCHEDULE_C_PLACEMENT_MAP: Record<string, TinaPlacementSeed> = {
  businessName: {
    fieldKey: "businessName",
    label: "Business name",
    pdfFieldName: "topmostSubform[0].Page1[0].f1_1[0]",
    x: 38,
    y: 686,
    fontSize: 9,
  },
  principalBusinessActivity: {
    fieldKey: "principalBusinessActivity",
    label: "Principal business activity",
    pdfFieldName: "topmostSubform[0].Page1[0].f1_3[0]",
    x: 38,
    y: 662,
    fontSize: 8,
  },
  naicsCode: {
    fieldKey: "naicsCode",
    label: "Business code",
    pdfFieldName: "topmostSubform[0].Page1[0].BComb[0].f1_4[0]",
    x: 462,
    y: 663,
    fontSize: 8,
  },
  grossReceipts: {
    fieldKey: "grossReceipts",
    label: "Line 1",
    pdfFieldName: "topmostSubform[0].Page1[0].f1_10[0]",
    x: 477,
    y: 518,
    fontSize: 8,
  },
  costOfGoodsSold: {
    fieldKey: "costOfGoodsSold",
    label: "Line 4",
    pdfFieldName: "topmostSubform[0].Page1[0].f1_13[0]",
    x: 477,
    y: 482,
    fontSize: 8,
  },
  grossIncome: {
    fieldKey: "grossIncome",
    label: "Line 7",
    pdfFieldName: "topmostSubform[0].Page1[0].f1_16[0]",
    x: 477,
    y: 446,
    fontSize: 8,
  },
  advertising: {
    fieldKey: "advertising",
    label: "Line 8",
    pdfFieldName: "topmostSubform[0].Page1[0].Lines8-17[0].f1_17[0]",
    x: 196,
    y: 422,
    fontSize: 8,
  },
  contractLabor: {
    fieldKey: "contractLabor",
    label: "Line 11",
    pdfFieldName: "topmostSubform[0].Page1[0].Lines8-17[0].f1_20[0]",
    x: 196,
    y: 374,
    fontSize: 8,
  },
  depreciation: {
    fieldKey: "depreciation",
    label: "Line 13",
    pdfFieldName: "topmostSubform[0].Page1[0].Lines8-17[0].f1_22[0]",
    x: 196,
    y: 326,
    fontSize: 8,
  },
  officeExpense: {
    fieldKey: "officeExpense",
    label: "Line 18",
    pdfFieldName: "topmostSubform[0].Page1[0].Lines18-27[0].f1_28[0]",
    x: 477,
    y: 422,
    fontSize: 8,
  },
  rentOrLease: {
    fieldKey: "rentOrLease",
    label: "Line 20",
    pdfFieldName: "topmostSubform[0].Page1[0].Lines18-27[0].f1_31[0]",
    x: 477,
    y: 374,
    fontSize: 8,
  },
  supplies: {
    fieldKey: "supplies",
    label: "Line 22",
    pdfFieldName: "topmostSubform[0].Page1[0].Lines18-27[0].f1_33[0]",
    x: 477,
    y: 350,
    fontSize: 8,
  },
  taxesAndLicenses: {
    fieldKey: "taxesAndLicenses",
    label: "Line 23",
    pdfFieldName: "topmostSubform[0].Page1[0].Lines18-27[0].f1_34[0]",
    x: 477,
    y: 338,
    fontSize: 8,
  },
  travel: {
    fieldKey: "travel",
    label: "Line 24a",
    pdfFieldName: "topmostSubform[0].Page1[0].Lines18-27[0].f1_35[0]",
    x: 477,
    y: 314,
    fontSize: 8,
  },
  deductibleMeals: {
    fieldKey: "deductibleMeals",
    label: "Line 24b",
    pdfFieldName: "topmostSubform[0].Page1[0].Lines18-27[0].f1_36[0]",
    x: 477,
    y: 302,
    fontSize: 8,
  },
  wages: {
    fieldKey: "wages",
    label: "Line 26",
    pdfFieldName: "topmostSubform[0].Page1[0].Lines18-27[0].f1_38[0]",
    x: 477,
    y: 278,
    fontSize: 8,
  },
  otherExpenses: {
    fieldKey: "otherExpenses",
    label: "Line 27a",
    pdfFieldName: "topmostSubform[0].Page1[0].Lines18-27[0].f1_40[0]",
    x: 477,
    y: 254,
    fontSize: 8,
  },
  totalExpenses: {
    fieldKey: "totalExpenses",
    label: "Line 28",
    pdfFieldName: "topmostSubform[0].Page1[0].f1_41[0]",
    x: 477,
    y: 230,
    fontSize: 8,
  },
  tentativeProfit: {
    fieldKey: "tentativeProfit",
    label: "Line 29",
    pdfFieldName: "topmostSubform[0].Page1[0].f1_42[0]",
    x: 477,
    y: 218,
    fontSize: 8,
  },
  netProfitOrLoss: {
    fieldKey: "netProfitOrLoss",
    label: "Line 31",
    pdfFieldName: "topmostSubform[0].Page1[0].f1_45[0]",
    x: 477,
    y: 158,
    fontSize: 8,
  },
};

function formatMoney(value: number | null): string {
  if (value === null) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildPlacement(args: {
  id: string;
  formId: "f1040sc";
  seed: TinaPlacementSeed;
  value: string;
  status: TinaOfficialFormFillPlacement["status"];
  evidenceSupportLevel: TinaOfficialFormFillPlacement["evidenceSupportLevel"];
  relatedLineNumbers?: string[];
  relatedDocumentIds?: string[];
}): TinaOfficialFormFillPlacement {
  return {
    id: args.id,
    formId: args.formId,
    pageNumber: args.seed.pageNumber ?? 1,
    fieldKey: args.seed.fieldKey,
    label: args.seed.label,
    value: args.value,
    pdfFieldName: args.seed.pdfFieldName,
    x: args.seed.x,
    y: args.seed.y,
    fontSize: args.seed.fontSize,
    status: args.status,
    evidenceSupportLevel: args.evidenceSupportLevel,
    relatedLineNumbers: args.relatedLineNumbers ?? [],
    relatedDocumentIds: args.relatedDocumentIds ?? [],
  };
}

export function buildTinaOfficialFormFill(
  draft: TinaWorkspaceDraft
): TinaOfficialFormFillSnapshot {
  const startPath = buildTinaStartPathAssessment(draft);
  const scheduleCReturn = buildTinaScheduleCReturn(draft);
  const formTrace = buildTinaScheduleCFormTrace(draft);
  const templateSnapshot = buildTinaOfficialFederalFormTemplateSnapshot(draft);
  const template =
    templateSnapshot.primaryTemplateId === "f1040sc"
      ? templateSnapshot.templates.find((item) => item.id === "f1040sc") ?? null
      : null;
  const blockedReasons = [
    ...startPath.blockingReasons,
    ...scheduleCReturn.validationIssues
      .filter((issue) => issue.severity === "blocking")
      .slice(0, 6)
      .map((issue) => issue.title),
  ];

  if (
    startPath.recommendation.laneId !== "schedule_c_single_member_llc" ||
    startPath.route !== "supported" ||
    !template
  ) {
    return {
      lastBuiltAt: new Date().toISOString(),
      status: "complete",
      formId: template?.id ?? null,
      templateTitle: template?.title ?? null,
      overallStatus: "blocked",
      mode: "blocked_route",
      summary:
        !template
          ? "Tina cannot build an official-form fill plan because the Schedule C blank template is missing."
          : "Tina cannot build an official-form fill plan while the supported Schedule C lane is blocked or routed elsewhere.",
      nextStep:
        !template
          ? "Store the correct Schedule C blank and then rebuild the fill plan."
          : "Resolve the lane decision first, then rebuild the official-form fill plan.",
      placements: [],
      blockedReasons,
    };
  }

  const traceByFormKey = new Map(formTrace.lines.map((line) => [line.formKey, line]));
  const placements: TinaOfficialFormFillPlacement[] = [];

  const headerValues = [
    {
      id: "header-business-name",
      seed: SCHEDULE_C_PLACEMENT_MAP.businessName,
      value: scheduleCReturn.header.businessName,
    },
    {
      id: "header-principal-activity",
      seed: SCHEDULE_C_PLACEMENT_MAP.principalBusinessActivity,
      value: scheduleCReturn.header.principalBusinessActivity,
    },
    {
      id: "header-naics-code",
      seed: SCHEDULE_C_PLACEMENT_MAP.naicsCode,
      value: scheduleCReturn.header.naicsCode,
    },
  ];

  headerValues.forEach((headerValue) => {
    placements.push(
      buildPlacement({
        id: headerValue.id,
        formId: "f1040sc",
        seed: headerValue.seed,
        value: headerValue.value,
        status: headerValue.value.trim() ? "ready" : "blocked",
        evidenceSupportLevel: headerValue.value.trim() ? "strong" : "missing",
      })
    );
  });

  scheduleCReturn.fields.forEach((field) => {
    const seed = SCHEDULE_C_PLACEMENT_MAP[field.formKey];
    if (!seed) return;
    const trace = traceByFormKey.get(field.formKey);
    const value = typeof field.amount === "number" ? formatMoney(field.amount) : "";
    const evidenceSupportLevel =
      trace?.evidenceSupportLevel ??
      (field.sourceFieldIds.length > 0 ? "strong" : value ? "moderate" : "strong");
    let status: TinaOfficialFormFillPlacement["status"] = "ready";

    if (field.status === "waiting" || (!value && field.lineNumber !== "Line 4")) {
      status = "blocked";
    } else if (
      field.status === "needs_attention" ||
      (typeof field.amount === "number" &&
        field.amount !== 0 &&
        (evidenceSupportLevel === "moderate" ||
          evidenceSupportLevel === "weak" ||
          evidenceSupportLevel === "missing"))
    ) {
      status = "needs_review";
    }

    placements.push(
      buildPlacement({
        id: `placement-${field.formKey}`,
        formId: "f1040sc",
        seed,
        value,
        status,
        evidenceSupportLevel,
        relatedLineNumbers: [field.lineNumber],
        relatedDocumentIds: unique(trace?.sourceDocumentIds ?? []),
      })
    );
  });

  const blockedCount = placements.filter((placement) => placement.status === "blocked").length;
  const reviewCount = placements.filter((placement) => placement.status === "needs_review").length;
  const overallStatus =
    blockedCount > 0 ? "blocked" : reviewCount > 0 ? "needs_review" : "ready";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    formId: "f1040sc",
    templateTitle: template.title,
    overallStatus,
    mode: "direct_field_plan",
    summary:
      overallStatus === "ready"
        ? `Tina mapped ${placements.length} Schedule C placements onto exact stored IRS field targets with no current fill blockers.`
        : overallStatus === "needs_review"
          ? `Tina mapped ${placements.length} Schedule C placements onto exact stored IRS field targets, but ${reviewCount} placement${reviewCount === 1 ? "" : "s"} still need reviewer attention.`
          : `Tina mapped ${placements.length} Schedule C placements onto exact stored IRS field targets, but ${blockedCount} placement${blockedCount === 1 ? "" : "s"} still block an official-form fill pass.`,
    nextStep:
      overallStatus === "ready"
        ? "Use the direct field plan to render onto the stored Schedule C blank and keep the trace attached."
        : "Clear the blocked or review-only placements before calling this official-form-ready.",
    placements,
    blockedReasons,
  };
}
