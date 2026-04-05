import type {
  TinaEntityReturnCalculationField,
  TinaEntityReturnCalculationStatus,
  TinaEntityReturnScheduleFamilyArtifact,
  TinaEntityReturnScheduleFamilyArtifactKind,
  TinaEntityReturnScheduleFamilySnapshot,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaEntityReturnCalculations } from "@/tina/lib/entity-return-calculations";
import { buildTinaEntityReturnPackagePlan } from "@/tina/lib/entity-return-package-plan";
import { buildTinaEntityReturnSupportArtifacts } from "@/tina/lib/entity-return-support-artifacts";
import type { TinaFilingLaneId, TinaWorkspaceDraft } from "@/tina/types";

interface TinaEntityReturnScheduleFamilyBlueprint {
  id: string;
  title: string;
  kind: TinaEntityReturnScheduleFamilyArtifactKind;
  deliverable: string;
  calculationItemIds: string[];
  fieldKeys: string[];
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function mergeSupportLevel(
  left: TinaEntityReturnCalculationField["supportLevel"],
  right: TinaEntityReturnCalculationField["supportLevel"]
): TinaEntityReturnCalculationField["supportLevel"] {
  const priority: Record<TinaEntityReturnCalculationField["supportLevel"], number> = {
    supported: 0,
    derived: 1,
    missing: 2,
  };

  return priority[right] > priority[left] ? right : left;
}

function mergeFields(
  fields: TinaEntityReturnCalculationField[]
): TinaEntityReturnCalculationField[] {
  const fieldMap = new Map<string, TinaEntityReturnCalculationField>();

  for (const field of fields) {
    const existing = fieldMap.get(field.fieldKey);
    if (!existing) {
      fieldMap.set(field.fieldKey, {
        ...field,
        relatedRecordIds: unique(field.relatedRecordIds),
        relatedCheckIds: unique(field.relatedCheckIds),
        relatedDocumentIds: unique(field.relatedDocumentIds),
      });
      continue;
    }

    fieldMap.set(field.fieldKey, {
      ...existing,
      value:
        existing.value === field.value || existing.value === "Supported"
          ? field.value
          : existing.value,
      amount: existing.amount ?? field.amount,
      supportLevel: mergeSupportLevel(existing.supportLevel, field.supportLevel),
      relatedRecordIds: unique([...existing.relatedRecordIds, ...field.relatedRecordIds]),
      relatedCheckIds: unique([...existing.relatedCheckIds, ...field.relatedCheckIds]),
      relatedDocumentIds: unique([...existing.relatedDocumentIds, ...field.relatedDocumentIds]),
    });
  }

  return [...fieldMap.values()];
}

function buildArtifact(
  artifact: TinaEntityReturnScheduleFamilyArtifact
): TinaEntityReturnScheduleFamilyArtifact {
  return {
    ...artifact,
    sourceCalculationItemIds: unique(artifact.sourceCalculationItemIds),
    sourceSupportArtifactIds: unique(artifact.sourceSupportArtifactIds),
    reviewerQuestions: unique(artifact.reviewerQuestions),
    relatedPackageItemIds: unique(artifact.relatedPackageItemIds),
    relatedDocumentIds: unique(artifact.relatedDocumentIds),
    fields: mergeFields(artifact.fields),
  };
}

function buildBlueprints(
  laneId: TinaFilingLaneId
): TinaEntityReturnScheduleFamilyBlueprint[] {
  if (laneId === "1065") {
    return [
      {
        id: "partnership-schedule-k-family",
        title: "Partnership Schedule K family",
        kind: "schedule_k_family",
        deliverable: "Schedule K partnership activity family",
        calculationItemIds: ["partnership-package-k"],
        fieldKeys: [
          "likely_partner_count",
          "prior_return_support",
          "books_and_balance_sheet_support",
          "structured_entity_documents",
        ],
      },
      {
        id: "partnership-schedule-k1-family",
        title: "Partnership Schedule K-1 family",
        kind: "schedule_k1_family",
        deliverable: "Partner Schedule K-1 family",
        calculationItemIds: [
          "partnership-package-k1",
          "partnership-package-capital",
          "partnership-package-payments",
        ],
        fieldKeys: [
          "likely_partner_count",
          "likely_k1_recipient_count",
          "ownership_split_signal",
          "mid_year_ownership_change",
          "capital_rollforward_support",
          "partner_payment_support",
          "partner_roster_support",
          "partner_transfer_support",
          "partner_transfer_records",
        ],
      },
      {
        id: "partnership-schedule-l-family",
        title: "Partnership Schedule L family",
        kind: "schedule_l_family",
        deliverable: "Partnership balance-sheet family",
        calculationItemIds: ["partnership-package-primary", "partnership-package-k"],
        fieldKeys: [
          "partnership_name",
          "prior_return_support",
          "books_and_balance_sheet_support",
          "structured_entity_documents",
        ],
      },
      {
        id: "partnership-capital-family",
        title: "Partner capital family",
        kind: "capital_family",
        deliverable: "Partner capital and transfer family",
        calculationItemIds: ["partnership-package-capital"],
        fieldKeys: [
          "likely_partner_count",
          "ownership_split_signal",
          "mid_year_ownership_change",
          "capital_rollforward_support",
          "partner_transfer_support",
          "partner_transfer_records",
        ],
      },
      {
        id: "partnership-partner-flow-family",
        title: "Partner payment and distribution family",
        kind: "partner_flow_family",
        deliverable: "Guaranteed payment and partner distribution family",
        calculationItemIds: ["partnership-package-payments"],
        fieldKeys: [
          "likely_partner_count",
          "ownership_split_signal",
          "partner_payment_support",
          "capital_rollforward_support",
        ],
      },
    ];
  }

  if (laneId === "1120_s") {
    return [
      {
        id: "s-corp-schedule-k-family",
        title: "S-corporation Schedule K family",
        kind: "schedule_k_family",
        deliverable: "S-corporation Schedule K family",
        calculationItemIds: ["s-corp-package-k"],
        fieldKeys: [
          "likely_shareholder_count",
          "books_and_balance_sheet_support",
          "structured_entity_documents",
        ],
      },
      {
        id: "s-corp-schedule-k1-family",
        title: "S-corporation Schedule K-1 family",
        kind: "schedule_k1_family",
        deliverable: "Shareholder Schedule K-1 family",
        calculationItemIds: ["s-corp-package-k1"],
        fieldKeys: [
          "likely_shareholder_count",
          "likely_k1_recipient_count",
          "shareholder_roster_support",
          "shareholder_flow_support",
          "mid_year_ownership_change",
        ],
      },
      {
        id: "s-corp-schedule-l-family",
        title: "S-corporation Schedule L family",
        kind: "schedule_l_family",
        deliverable: "S-corporation balance-sheet family",
        calculationItemIds: ["s-corp-package-primary", "s-corp-package-balance-sheet"],
        fieldKeys: [
          "s_corp_name",
          "s_election_proof",
          "books_and_balance_sheet_support",
          "structured_entity_documents",
        ],
      },
      {
        id: "s-corp-shareholder-flow-family",
        title: "S-corporation shareholder-flow family",
        kind: "shareholder_flow_family",
        deliverable: "Officer compensation and shareholder-flow family",
        calculationItemIds: ["s-corp-package-compensation", "s-corp-package-k1"],
        fieldKeys: [
          "likely_shareholder_count",
          "officer_compensation_support",
          "shareholder_flow_support",
          "mid_year_ownership_change",
        ],
      },
    ];
  }

  if (laneId === "1120") {
    return [
      {
        id: "c-corp-schedule-l-family",
        title: "C-corporation Schedule L family",
        kind: "schedule_l_family",
        deliverable: "C-corporation balance-sheet family",
        calculationItemIds: ["c-corp-package-primary", "c-corp-package-schedule-l"],
        fieldKeys: [
          "c_corp_name",
          "corporate_classification_proof",
          "books_and_balance_sheet_support",
          "structured_entity_documents",
        ],
      },
      {
        id: "c-corp-schedule-m-family",
        title: "C-corporation Schedule M-1 / M-2 family",
        kind: "schedule_m_family",
        deliverable: "Schedule M-1 and M-2 reconciliation family",
        calculationItemIds: ["c-corp-package-m1-m2"],
        fieldKeys: [
          "books_and_balance_sheet_support",
          "equity_rollforward_support",
          "shareholder_flow_support",
        ],
      },
      {
        id: "c-corp-equity-family",
        title: "C-corporation equity family",
        kind: "equity_family",
        deliverable: "Retained earnings and equity family",
        calculationItemIds: ["c-corp-package-equity", "c-corp-package-m1-m2"],
        fieldKeys: [
          "equity_rollforward_support",
          "shareholder_flow_support",
          "officer_compensation_support",
          "mid_year_ownership_change",
        ],
      },
      {
        id: "c-corp-shareholder-flow-family",
        title: "C-corporation shareholder-flow family",
        kind: "shareholder_flow_family",
        deliverable: "Dividend and shareholder-flow family",
        calculationItemIds: ["c-corp-package-equity"],
        fieldKeys: ["shareholder_flow_support", "officer_compensation_support", "mid_year_ownership_change"],
      },
    ];
  }

  return [];
}

function deriveStatus(
  statuses: TinaEntityReturnCalculationStatus[]
): TinaEntityReturnCalculationStatus {
  if (statuses.some((status) => status === "blocked")) {
    return "blocked";
  }

  if (statuses.some((status) => status === "needs_review")) {
    return "needs_review";
  }

  return "ready";
}

export function buildTinaEntityReturnScheduleFamilyArtifacts(
  draft: TinaWorkspaceDraft
): TinaEntityReturnScheduleFamilySnapshot {
  const calculations = buildTinaEntityReturnCalculations(draft);
  const supportArtifacts = buildTinaEntityReturnSupportArtifacts(draft);
  const packagePlan = buildTinaEntityReturnPackagePlan(draft);

  if (!["1065", "1120_s", "1120"].includes(calculations.laneId)) {
    return {
      lastBuiltAt: new Date().toISOString(),
      status: "complete",
      laneId: calculations.laneId,
      returnFamily: calculations.returnFamily,
      overallStatus: "ready",
      summary:
        "Entity return schedule-family artifacts are only needed for the non-Schedule-C reviewer-controlled lanes.",
      nextStep:
        "Use the regular Schedule C rendered and companion-form artifacts for the supported lane.",
      items: [],
    };
  }

  const calculationsById = new Map(calculations.items.map((item) => [item.id, item]));
  const supportArtifactsByCalculationId = new Map(
    supportArtifacts.items.map((item) => [item.sourceCalculationItemId, item])
  );

  const items = buildBlueprints(calculations.laneId)
    .map((blueprint) => {
      const sourceCalculations = blueprint.calculationItemIds
        .map((itemId) => calculationsById.get(itemId) ?? null)
        .filter((value): value is NonNullable<typeof value> => value !== null);
      const sourceSupportArtifacts = blueprint.calculationItemIds
        .map((itemId) => supportArtifactsByCalculationId.get(itemId) ?? null)
        .filter((value): value is NonNullable<typeof value> => value !== null);

      if (sourceCalculations.length === 0 && sourceSupportArtifacts.length === 0) {
        return null;
      }

      const mergedFields = mergeFields([
        ...sourceCalculations.flatMap((item) => item.fields),
        ...sourceSupportArtifacts.flatMap((item) => item.fields),
      ]).filter((field) => blueprint.fieldKeys.includes(field.fieldKey));
      const supportedFieldCount = mergedFields.filter(
        (field) => field.supportLevel === "supported"
      ).length;
      const derivedFieldCount = mergedFields.filter(
        (field) => field.supportLevel === "derived"
      ).length;
      const missingFieldCount = mergedFields.filter(
        (field) => field.supportLevel === "missing"
      ).length;
      const status = deriveStatus([
        ...sourceCalculations.map((item) => item.status),
        ...sourceSupportArtifacts.map((item) => item.status),
      ]);

      return buildArtifact({
        id: blueprint.id,
        laneId: calculations.laneId,
        returnFamily: calculations.returnFamily,
        title: blueprint.title,
        kind: blueprint.kind,
        status,
        deliverable: blueprint.deliverable,
        summary:
          status === "ready"
            ? `${blueprint.title} now exists as an explicit schedule-family artifact Tina can carry behind the entity return family.`
            : status === "needs_review"
              ? `${blueprint.title} is explicit now, but reviewer-controlled completion still matters before the non-Schedule-C family looks filing-grade.`
              : `${blueprint.title} is still blocked, so Tina should not behave like this non-Schedule-C return family is filing-grade yet.`,
        sourceCalculationItemIds: sourceCalculations.map((item) => item.id),
        sourceSupportArtifactIds: sourceSupportArtifacts.map((item) => item.id),
        fieldCount: mergedFields.length,
        supportedFieldCount,
        derivedFieldCount,
        missingFieldCount,
        fields: mergedFields,
        reviewerQuestions: unique([
          ...sourceCalculations.flatMap((item) => item.reviewerQuestions),
          ...sourceSupportArtifacts.flatMap((item) => item.reviewerQuestions),
        ]),
        relatedPackageItemIds: unique([
          ...sourceCalculations.flatMap((item) => item.relatedPackageItemIds),
          ...sourceSupportArtifacts.flatMap((item) => item.relatedPackageItemIds),
        ]),
        relatedDocumentIds: unique([
          ...sourceCalculations.flatMap((item) => item.relatedDocumentIds),
          ...sourceSupportArtifacts.flatMap((item) => item.relatedDocumentIds),
          ...packagePlan.items
            .filter((item) =>
              sourceCalculations.some((calculation) =>
                calculation.relatedPackageItemIds.includes(item.id)
              )
            )
            .flatMap((item) => item.relatedDocumentIds),
        ]),
      });
    })
    .filter((value): value is TinaEntityReturnScheduleFamilyArtifact => value !== null);

  const overallStatus = deriveStatus(items.map((item) => item.status));
  const blockedCount = items.filter((item) => item.status === "blocked").length;
  const reviewCount = items.filter((item) => item.status === "needs_review").length;

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    laneId: calculations.laneId,
    returnFamily: calculations.returnFamily,
    overallStatus,
    summary:
      items.length === 0
        ? "This lane does not currently need separate schedule-family artifacts."
        : overallStatus === "ready"
          ? "Tina now has explicit schedule-family artifacts behind the non-Schedule-C return family."
          : overallStatus === "needs_review"
            ? `Tina has explicit schedule-family artifacts, but ${reviewCount} still need reviewer-controlled completion.`
            : `Tina still has ${blockedCount} blocked schedule-family artifact${
                blockedCount === 1 ? "" : "s"
              } behind the non-Schedule-C return family.`,
    nextStep:
      items.length === 0
        ? "Keep using the primary rendered form artifacts for the current lane."
        : overallStatus === "ready"
          ? "Carry these schedule-family artifacts with the return package so K-1, Schedule L, and M-family truth stays explicit."
          : overallStatus === "needs_review"
            ? "Keep these schedule-family artifacts visible while the reviewer completes the remaining non-Schedule-C schedule work."
            : "Clear the blocked schedule-family artifacts before Tina behaves like the non-Schedule-C return family is filing-grade.",
    items,
  };
}
