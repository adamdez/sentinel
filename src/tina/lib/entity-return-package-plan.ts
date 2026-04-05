import type {
  TinaEntityReturnPackageItem,
  TinaEntityReturnPackagePlanSnapshot,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaEntityEconomicsReadiness } from "@/tina/lib/entity-economics-readiness";
import { buildTinaEntityLaneExecution } from "@/tina/lib/entity-lane-execution";
import { buildTinaEntityRecordMatrix } from "@/tina/lib/entity-record-matrix";
import { buildTinaFederalReturnRequirements } from "@/tina/lib/federal-return-requirements";
import { buildTinaOfficialFederalFormTemplateSnapshot } from "@/tina/lib/official-form-templates";
import type { TinaFilingLaneId, TinaOfficialFederalFormId, TinaWorkspaceDraft } from "@/tina/types";

interface TinaEntityReturnPackageBlueprint {
  id: string;
  title: string;
  kind: TinaEntityReturnPackageItem["kind"];
  formId: TinaOfficialFederalFormId | null;
  deliverable: string;
  requirementIds: string[];
  recordIds: string[];
  checkIds: string[];
  enabled?: (draft: TinaWorkspaceDraft) => boolean;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function hasHomeOfficeSignal(draft: TinaWorkspaceDraft): boolean {
  return /\b(home office|office in home|home workspace)\b/i.test(
    `${draft.profile.notes} ${draft.profile.principalBusinessActivity}`
  );
}

function buildItem(item: TinaEntityReturnPackageItem): TinaEntityReturnPackageItem {
  return {
    ...item,
    requiredRecordIds: unique(item.requiredRecordIds),
    requiredCheckIds: unique(item.requiredCheckIds),
    requiredRecords: unique(item.requiredRecords),
    reviewerQuestions: unique(item.reviewerQuestions),
    relatedDocumentIds: unique(item.relatedDocumentIds),
  };
}

function buildBlueprints(
  draft: TinaWorkspaceDraft,
  laneId: TinaFilingLaneId
): TinaEntityReturnPackageBlueprint[] {
  if (laneId === "schedule_c_single_member_llc") {
    return [
      {
        id: "schedule-c-package-primary",
        title: "Schedule C primary return",
        kind: "primary_return",
        formId: "f1040sc",
        deliverable: "Schedule C primary return package",
        requirementIds: ["schedule-c-core"],
        recordIds: ["schedule-c-prior-return", "schedule-c-books", "schedule-c-bank-card"],
        checkIds: ["owner-boundary"],
      },
      {
        id: "schedule-c-package-1040",
        title: "Form 1040 business-income carry package",
        kind: "companion_schedule",
        formId: "f1040",
        deliverable: "Form 1040 business-income carry package",
        requirementIds: ["schedule-c-core"],
        recordIds: ["schedule-c-prior-return", "schedule-c-books", "schedule-c-bank-card"],
        checkIds: ["owner-boundary"],
      },
      {
        id: "schedule-c-package-se",
        title: "Schedule SE self-employment tax package",
        kind: "companion_schedule",
        formId: "f1040sse",
        deliverable: "Schedule SE self-employment tax package",
        requirementIds: ["schedule-c-core"],
        recordIds: ["schedule-c-books", "schedule-c-bank-card"],
        checkIds: ["owner-boundary"],
      },
      {
        id: "schedule-c-package-4562",
        title: "Form 4562 depreciation package",
        kind: "attachment",
        formId: "f4562",
        deliverable: "Depreciation and fixed-asset attachment package",
        requirementIds: ["schedule-c-core"],
        recordIds: ["schedule-c-fixed-assets"],
        checkIds: ["owner-boundary"],
        enabled: (currentDraft) => currentDraft.profile.hasFixedAssets,
      },
      {
        id: "schedule-c-package-8829",
        title: "Form 8829 home-office package",
        kind: "attachment",
        formId: "f8829",
        deliverable: "Home-office attachment package",
        requirementIds: ["schedule-c-core"],
        recordIds: ["schedule-c-books", "schedule-c-bank-card"],
        checkIds: ["owner-boundary"],
        enabled: (currentDraft) => hasHomeOfficeSignal(currentDraft),
      },
    ];
  }

  if (laneId === "1065") {
    return [
      {
        id: "partnership-package-primary",
        title: "Form 1065 primary return",
        kind: "primary_return",
        formId: "f1065",
        deliverable: "Form 1065 primary return package",
        requirementIds: ["partnership-core"],
        recordIds: ["partnership-ownership", "partnership-prior-return", "partnership-books"],
        checkIds: ["partner-roster", "partnership-balance-sheet"],
      },
      {
        id: "partnership-package-k",
        title: "Schedule K partnership activity package",
        kind: "companion_schedule",
        formId: null,
        deliverable: "Schedule K and entity-level activity package",
        requirementIds: ["partnership-core"],
        recordIds: ["partnership-books"],
        checkIds: ["partnership-balance-sheet"],
      },
      {
        id: "partnership-package-k1",
        title: "Partner Schedule K-1 set",
        kind: "companion_schedule",
        formId: null,
        deliverable: "Partner Schedule K-1 set",
        requirementIds: ["partnership-core", "partnership-capital"],
        recordIds: ["partnership-ownership", "partnership-books", "partnership-payments"],
        checkIds: ["partner-roster", "partner-payments"],
      },
      {
        id: "partnership-package-capital",
        title: "Partner capital and transfer workpaper",
        kind: "supporting_workpaper",
        formId: null,
        deliverable: "Partner capital rollforward and transfer memo",
        requirementIds: ["partnership-capital"],
        recordIds: ["partnership-capital", "partnership-transfer"],
        checkIds: ["partner-capital", "partner-transfers"],
      },
      {
        id: "partnership-package-payments",
        title: "Guaranteed payments and distribution workpaper",
        kind: "supporting_workpaper",
        formId: null,
        deliverable: "Guaranteed payment and partner distribution workpaper",
        requirementIds: ["partnership-capital"],
        recordIds: ["partnership-payments"],
        checkIds: ["partner-payments"],
      },
    ];
  }

  if (laneId === "1120_s") {
    return [
      {
        id: "s-corp-package-primary",
        title: "Form 1120-S primary return",
        kind: "primary_return",
        formId: "f1120s",
        deliverable: "Form 1120-S primary return package",
        requirementIds: ["s-corp-core"],
        recordIds: ["s-corp-election", "s-corp-shareholders", "s-corp-books"],
        checkIds: ["s-election", "shareholder-roster", "s-corp-balance-sheet"],
      },
      {
        id: "s-corp-package-k",
        title: "Schedule K S-corporation activity package",
        kind: "companion_schedule",
        formId: null,
        deliverable: "Schedule K and entity-level activity package",
        requirementIds: ["s-corp-core"],
        recordIds: ["s-corp-books"],
        checkIds: ["s-corp-balance-sheet"],
      },
      {
        id: "s-corp-package-k1",
        title: "Shareholder Schedule K-1 set",
        kind: "companion_schedule",
        formId: null,
        deliverable: "Shareholder Schedule K-1 set",
        requirementIds: ["s-corp-core", "s-corp-shareholder"],
        recordIds: ["s-corp-shareholders", "s-corp-distributions", "s-corp-books"],
        checkIds: ["shareholder-roster", "shareholder-flows"],
      },
      {
        id: "s-corp-package-compensation",
        title: "Officer compensation and distribution workpaper",
        kind: "supporting_workpaper",
        formId: null,
        deliverable: "Officer compensation and shareholder-flow memo",
        requirementIds: ["s-corp-shareholder"],
        recordIds: ["s-corp-payroll", "s-corp-distributions"],
        checkIds: ["officer-compensation", "shareholder-flows"],
      },
      {
        id: "s-corp-package-balance-sheet",
        title: "Schedule L balance-sheet support package",
        kind: "supporting_workpaper",
        formId: null,
        deliverable: "Schedule L balance-sheet support package",
        requirementIds: ["s-corp-core"],
        recordIds: ["s-corp-books"],
        checkIds: ["s-corp-balance-sheet"],
      },
    ];
  }

  if (laneId === "1120") {
    return [
      {
        id: "c-corp-package-primary",
        title: "Form 1120 primary return",
        kind: "primary_return",
        formId: "f1120",
        deliverable: "Form 1120 primary return package",
        requirementIds: ["c-corp-core"],
        recordIds: ["c-corp-classification", "c-corp-books"],
        checkIds: ["corporate-classification", "c-corp-balance-sheet"],
      },
      {
        id: "c-corp-package-schedule-l",
        title: "Schedule L balance-sheet package",
        kind: "companion_schedule",
        formId: null,
        deliverable: "Schedule L balance-sheet package",
        requirementIds: ["c-corp-core"],
        recordIds: ["c-corp-books"],
        checkIds: ["c-corp-balance-sheet"],
      },
      {
        id: "c-corp-package-m1-m2",
        title: "Schedule M-1 and M-2 reconciliation package",
        kind: "companion_schedule",
        formId: null,
        deliverable: "Schedule M-1 and M-2 reconciliation package",
        requirementIds: ["c-corp-core", "c-corp-equity"],
        recordIds: ["c-corp-books", "c-corp-equity"],
        checkIds: ["corporate-equity", "c-corp-balance-sheet"],
      },
      {
        id: "c-corp-package-equity",
        title: "Retained earnings and shareholder-flow workpaper",
        kind: "supporting_workpaper",
        formId: null,
        deliverable: "Retained earnings, dividends, and shareholder-flow memo",
        requirementIds: ["c-corp-equity"],
        recordIds: ["c-corp-equity", "c-corp-shareholder-flows", "c-corp-compensation"],
        checkIds: ["corporate-equity", "shareholder-flows", "corporate-compensation"],
      },
    ];
  }

  return [
    {
      id: "unresolved-return-family-package",
      title: "Federal return family confirmation package",
      kind: "supporting_workpaper",
      formId: null,
      deliverable: "Federal return family confirmation memo",
      requirementIds: ["federal-family-confirmation"],
      recordIds: ["unresolved-classification"],
      checkIds: ["classification-gap"],
    },
  ];
}

export function buildTinaEntityReturnPackagePlan(
  draft: TinaWorkspaceDraft
): TinaEntityReturnPackagePlanSnapshot {
  const entityLaneExecution = buildTinaEntityLaneExecution(draft);
  const federalReturnRequirements = buildTinaFederalReturnRequirements(draft);
  const entityRecordMatrix = buildTinaEntityRecordMatrix(draft);
  const entityEconomicsReadiness = buildTinaEntityEconomicsReadiness(draft);
  const templateSnapshot = buildTinaOfficialFederalFormTemplateSnapshot(draft);
  const templateIds = new Set(templateSnapshot.templates.map((template) => template.id));

  const items = buildBlueprints(draft, entityLaneExecution.laneId)
    .filter((blueprint) => !blueprint.enabled || blueprint.enabled(draft))
    .map((blueprint) => {
      const linkedRequirements = federalReturnRequirements.items.filter((item) =>
        blueprint.requirementIds.includes(item.id)
      );
      const linkedRecords = entityRecordMatrix.items.filter((item) =>
        blueprint.recordIds.includes(item.id)
      );
      const linkedChecks = entityEconomicsReadiness.checks.filter((check) =>
        blueprint.checkIds.includes(check.id)
      );
      const hasBlockedRequirement = linkedRequirements.some((item) => item.status === "blocked");
      const hasAttentionRequirement = linkedRequirements.some(
        (item) => item.status === "needs_attention"
      );
      const hasMissingCriticalRecord = linkedRecords.some(
        (item) => item.criticality === "critical" && item.status === "missing"
      );
      const hasMissingRecord = linkedRecords.some((item) => item.status === "missing");
      const hasPartialRecord = linkedRecords.some((item) => item.status === "partial");
      const hasBlockedCheck = linkedChecks.some((check) => check.status === "blocked");
      const hasReviewCheck = linkedChecks.some((check) => check.status === "needs_review");

      const status: TinaEntityReturnPackageItem["status"] =
        entityLaneExecution.executionMode === "blocked" ||
        hasBlockedRequirement ||
        hasBlockedCheck ||
        hasMissingCriticalRecord
          ? "blocked"
          : entityLaneExecution.executionMode !== "tina_supported" ||
              entityLaneExecution.overallStatus === "review_required" ||
              hasAttentionRequirement ||
              hasReviewCheck ||
              hasPartialRecord ||
              hasMissingRecord
            ? "review_required"
            : "ready";

      return buildItem({
        id: blueprint.id,
        title: blueprint.title,
        kind: blueprint.kind,
        formId: blueprint.formId,
        status,
        executionOwner:
          entityLaneExecution.executionMode === "tina_supported" ? "tina" : "reviewer",
        templateReady: blueprint.formId ? templateIds.has(blueprint.formId) : false,
        deliverable: blueprint.deliverable,
        summary:
          status === "ready"
            ? `${blueprint.title} is coherent enough to sit in the current return-family package.`
            : status === "review_required"
              ? `${blueprint.title} belongs in the current return-family package, but reviewer-controlled completion still matters.`
              : `${blueprint.title} still belongs in the return family, but it is blocked by route, record, or economics gaps.`,
        requiredRecordIds: linkedRecords.map((item) => item.id),
        requiredCheckIds: linkedChecks.map((check) => check.id),
        requiredRecords: unique(
          linkedRequirements.flatMap((item) => item.requiredRecords)
        ),
        reviewerQuestions: unique([
          ...linkedRequirements.flatMap((item) => item.reviewerQuestions),
          ...linkedChecks
            .filter((check) => check.status !== "clear")
            .map((check) => check.title),
        ]),
        relatedDocumentIds: unique([
          ...linkedRecords.flatMap((item) => item.matchedDocumentIds),
          ...linkedChecks.flatMap((check) => check.relatedDocumentIds),
        ]),
      });
    });

  const blockedCount = items.filter((item) => item.status === "blocked").length;
  const reviewCount = items.filter((item) => item.status === "review_required").length;
  const overallStatus =
    blockedCount > 0 ? "blocked" : reviewCount > 0 ? "review_required" : "ready";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    laneId: entityLaneExecution.laneId,
    returnFamily: federalReturnRequirements.returnFamily,
    executionMode: entityLaneExecution.executionMode,
    overallStatus,
    summary:
      overallStatus === "ready"
        ? "Tina has a coherent return-family package map for the current lane."
        : overallStatus === "review_required"
          ? `Tina has a coherent return-family package map, but ${reviewCount} package item${
              reviewCount === 1 ? "" : "s"
            } still need reviewer-controlled completion.`
          : `Tina can name the return family, but ${blockedCount} package item${
              blockedCount === 1 ? "" : "s"
            } are still blocked by route, record, or economics gaps.`,
    nextStep:
      overallStatus === "ready"
        ? "Carry this package map into return artifacts, reviewer handoff, and form execution."
        : overallStatus === "review_required"
          ? "Use this package map to keep the reviewer focused on the remaining non-Schedule-C deliverables."
          : "Clear the blocked package items before Tina behaves like the lane has a finished return-family package.",
    items,
  };
}
