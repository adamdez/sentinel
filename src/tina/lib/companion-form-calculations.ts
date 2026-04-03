import type {
  TinaCompanionFormCalculationItem,
  TinaCompanionFormCalculationsSnapshot,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaAttachmentStatements } from "@/tina/lib/attachment-statements";
import { buildTinaScheduleCReturn } from "@/tina/lib/schedule-c-return";
import { buildTinaStartPathAssessment } from "@/tina/lib/start-path";
import type { TinaWorkspaceDraft } from "@/tina/types";

const SOCIAL_SECURITY_RATE = 0.124;
const MEDICARE_RATE = 0.029;
const SOCIAL_SECURITY_WAGE_BASE_2025 = 176100;
const SELF_EMPLOYMENT_EARNINGS_FACTOR = 0.9235;

function roundCurrency(value: number | null): number | null {
  if (value === null) return null;
  return Math.round(value * 100) / 100;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function hasHomeOfficeSignal(draft: TinaWorkspaceDraft): boolean {
  const haystack = [
    draft.profile.notes,
    draft.profile.principalBusinessActivity,
    ...draft.documents.map((document) => `${document.name} ${document.requestLabel ?? ""}`),
    ...draft.sourceFacts.map((fact) => `${fact.label} ${fact.value}`),
  ]
    .join(" ")
    .toLowerCase();

  return /\b(home office|office in home|home workspace|exclusive use|square footage)\b/.test(
    haystack
  );
}

function hasHomeOfficeSupport(draft: TinaWorkspaceDraft): boolean {
  const haystack = [
    draft.profile.notes,
    ...draft.documents.map((document) => `${document.name} ${document.requestLabel ?? ""}`),
    ...draft.sourceFacts.map((fact) => `${fact.label} ${fact.value}`),
  ]
    .join(" ")
    .toLowerCase();

  return /\b(square footage|sq ft|rent|utilities|mortgage interest|real estate taxes)\b/.test(
    haystack
  );
}

function findAmount(
  scheduleCReturn: ReturnType<typeof buildTinaScheduleCReturn>,
  formKey: string
): number | null {
  return scheduleCReturn.fields.find((field) => field.formKey === formKey)?.amount ?? null;
}

function buildItem(item: TinaCompanionFormCalculationItem): TinaCompanionFormCalculationItem {
  return {
    ...item,
    requiredRecords: unique(item.requiredRecords),
    relatedLineNumbers: unique(item.relatedLineNumbers),
    relatedDocumentIds: unique(item.relatedDocumentIds),
  };
}

export function buildTinaCompanionFormCalculations(
  draft: TinaWorkspaceDraft
): TinaCompanionFormCalculationsSnapshot {
  const startPath = buildTinaStartPathAssessment(draft);
  const scheduleCReturn = buildTinaScheduleCReturn(draft);
  const attachmentStatements = buildTinaAttachmentStatements(draft);
  const line31 = findAmount(scheduleCReturn, "netProfitOrLoss");
  const line13 = findAmount(scheduleCReturn, "depreciation");
  const homeOfficeSignal = hasHomeOfficeSignal(draft);
  const homeOfficeSupport = hasHomeOfficeSupport(draft);
  const depreciationAttachment = attachmentStatements.items.find(
    (item) => item.category === "depreciation_support"
  );
  const homeOfficeAttachment = attachmentStatements.items.find(
    (item) => item.category === "home_office_support"
  );

  const items: TinaCompanionFormCalculationItem[] = [
    buildItem({
      id: "form-1040-line-carry",
      formId: "f1040",
      title: "Form 1040 business-income carryover",
      status:
        startPath.route !== "supported" || line31 === null
          ? "blocked"
          : "ready",
      summary:
        startPath.route !== "supported"
          ? "Tina should not treat Form 1040 carryover as stable while the underlying lane is not supported."
          : line31 === null
            ? "Tina still needs a stable Schedule C line 31 amount before the Form 1040 carryover is trustworthy."
            : "Tina can carry the current Schedule C line 31 amount into the broader Form 1040 set.",
      estimatedValues: [
        {
          label: "Schedule C line 31 carryover amount",
          amount: line31,
        },
      ],
      requiredRecords: ["Final Schedule C line 31 amount"],
      relatedLineNumbers: ["Line 31"],
      relatedDocumentIds: draft.reviewerFinal.lines.flatMap((line) => line.sourceDocumentIds),
    }),
    buildItem({
      id: "schedule-se-estimate",
      formId: "f1040sse",
      title: "Schedule SE estimate",
      status:
        startPath.route !== "supported"
          ? "blocked"
          : typeof line31 === "number" && line31 > 0
            ? "ready"
            : "not_applicable",
      summary:
        startPath.route !== "supported"
          ? "Tina should not estimate Schedule SE while the Schedule C lane itself is not supported."
          : typeof line31 === "number" && line31 > 0
            ? "Tina can estimate self-employment tax from the current Schedule C profit, with reviewer adjustment still needed for W-2 wage interaction and additional Medicare tax."
            : "Schedule SE does not look currently required because the Schedule C profit is not positive.",
      estimatedValues:
        typeof line31 === "number" && line31 > 0
          ? [
              {
                label: "Net earnings from self-employment",
                amount: roundCurrency(line31 * SELF_EMPLOYMENT_EARNINGS_FACTOR),
              },
              {
                label: "Estimated Schedule SE tax before wage interaction adjustments",
                amount: roundCurrency(
                  Math.min(line31 * SELF_EMPLOYMENT_EARNINGS_FACTOR, SOCIAL_SECURITY_WAGE_BASE_2025) *
                    SOCIAL_SECURITY_RATE +
                    line31 * SELF_EMPLOYMENT_EARNINGS_FACTOR * MEDICARE_RATE
                ),
              },
              {
                label: "Estimated deductible half of self-employment tax",
                amount: roundCurrency(
                  (Math.min(line31 * SELF_EMPLOYMENT_EARNINGS_FACTOR, SOCIAL_SECURITY_WAGE_BASE_2025) *
                    SOCIAL_SECURITY_RATE +
                    line31 * SELF_EMPLOYMENT_EARNINGS_FACTOR * MEDICARE_RATE) / 2
                ),
              },
            ]
          : [],
      requiredRecords:
        typeof line31 === "number" && line31 > 0
          ? [
              "Final Schedule C line 31 amount",
              "Any W-2 wages already subject to Social Security tax",
              "Reviewer check for additional Medicare tax thresholds",
            ]
          : [],
      relatedLineNumbers: ["Line 31"],
      relatedDocumentIds: draft.reviewerFinal.lines.flatMap((line) => line.sourceDocumentIds),
    }),
  ];

  if (draft.profile.hasFixedAssets || (typeof line13 === "number" && line13 > 0)) {
    items.push(
      buildItem({
        id: "form-4562-estimate",
        formId: "f4562",
        title: "Form 4562 depreciation carry plan",
        status:
          startPath.route !== "supported" || depreciationAttachment?.status === "blocked"
            ? "blocked"
            : typeof line13 === "number"
              ? "ready"
              : "needs_review",
        summary:
          startPath.route !== "supported" || depreciationAttachment?.status === "blocked"
            ? "Depreciation support is still too weak for Tina to carry Form 4562 confidently."
            : typeof line13 === "number"
              ? "Tina can carry the current depreciation amount into the Form 4562 planning layer, with reviewer asset-detail confirmation still required."
              : "Fixed assets are present, but Tina still needs stronger depreciation detail before she can carry Form 4562 confidently.",
        estimatedValues: [
          {
            label: "Current-year depreciation from Schedule C line 13",
            amount: line13,
          },
        ],
        requiredRecords: [
          "Asset list with placed-in-service dates",
          "Depreciation method or section 179 support",
          "Reviewer check for asset class and recovery period",
        ],
        relatedLineNumbers: ["Line 13"],
        relatedDocumentIds: unique([
          ...draft.reviewerFinal.lines.flatMap((line) => line.sourceDocumentIds),
          ...(depreciationAttachment?.relatedDocumentIds ?? []),
        ]),
      })
    );
  }

  if (homeOfficeSignal) {
    items.push(
      buildItem({
        id: "form-8829-home-office",
        formId: "f8829",
        title: "Form 8829 home-office calculation plan",
        status:
          startPath.route !== "supported"
            ? "blocked"
            : homeOfficeSupport
              ? "needs_review"
              : "blocked",
        summary:
          startPath.route !== "supported"
            ? "Home-office treatment is in the likely form set, but Tina still lacks the support to calculate it safely."
            : homeOfficeSupport
              ? "Tina sees enough home-office support to keep Form 8829 in reviewer-controlled calculation planning."
              : "Tina sees home-office signals, but she still lacks square footage and cost-allocation support for a safe calculation.",
        estimatedValues: [
          {
            label: "Home-office deduction estimate",
            amount: null,
          },
        ],
        requiredRecords: [
          "Square footage for home and office space",
          "Direct and indirect home-office expenses",
          "Exclusive-use facts or reviewer memo",
        ],
        relatedLineNumbers: [],
        relatedDocumentIds: unique([
          ...draft.documents.map((document) => document.id),
          ...(homeOfficeAttachment?.relatedDocumentIds ?? []),
        ]),
      })
    );
  }

  const blockedCount = items.filter((item) => item.status === "blocked").length;
  const reviewCount = items.filter((item) => item.status === "needs_review").length;
  const overallStatus =
    blockedCount > 0 ? "blocked" : reviewCount > 0 ? "needs_review" : "ready";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    overallStatus,
    summary:
      overallStatus === "ready"
        ? "Tina has concrete companion-form calculations or carry plans for the currently relevant Schedule C companion forms."
        : overallStatus === "needs_review"
          ? `Tina has companion-form calculations in view, but ${reviewCount} item${
              reviewCount === 1 ? "" : "s"
            } still need reviewer-controlled completion.`
          : `Tina still sees ${blockedCount} blocked companion-form calculation item${
              blockedCount === 1 ? "" : "s"
            }.`,
    nextStep:
      overallStatus === "ready"
        ? "Use these calculations to drive true companion-form fill work next."
        : overallStatus === "needs_review"
          ? "Clear the reviewer-controlled companion-form inputs before calling the form set more complete."
          : "Gather the blocked companion-form inputs before treating the federal form set as close to finished.",
    items,
  };
}
