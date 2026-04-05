import type {
  TinaEntityReturnCalculationField,
  TinaEntityReturnCalculationItem,
  TinaEntityReturnCalculationsSnapshot,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaDocumentIntelligence } from "@/tina/lib/document-intelligence";
import { buildTinaEntityEconomicsReadiness } from "@/tina/lib/entity-economics-readiness";
import { buildTinaEntityRecordMatrix } from "@/tina/lib/entity-record-matrix";
import { buildTinaEntityReturnPackagePlan } from "@/tina/lib/entity-return-package-plan";
import { buildTinaOwnerFlowBasisAdjudication } from "@/tina/lib/owner-flow-basis-adjudication";
import { buildTinaOwnershipTimeline } from "@/tina/lib/ownership-timeline";
import type { TinaWorkspaceDraft } from "@/tina/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildField(field: TinaEntityReturnCalculationField): TinaEntityReturnCalculationField {
  return {
    ...field,
    relatedRecordIds: unique(field.relatedRecordIds),
    relatedCheckIds: unique(field.relatedCheckIds),
    relatedDocumentIds: unique(field.relatedDocumentIds),
  };
}

function buildItem(item: TinaEntityReturnCalculationItem): TinaEntityReturnCalculationItem {
  return {
    ...item,
    reviewerQuestions: unique(item.reviewerQuestions),
    relatedPackageItemIds: unique(item.relatedPackageItemIds),
    relatedDocumentIds: unique(item.relatedDocumentIds),
    fields: item.fields.map(buildField),
  };
}

function isNonNull<T>(value: T | null): value is T {
  return value !== null;
}

function supportLevelFromStatuses(
  statuses: Array<"covered" | "partial" | "missing" | "clear" | "needs_review" | "blocked">
): TinaEntityReturnCalculationField["supportLevel"] {
  if (statuses.some((status) => status === "missing" || status === "blocked")) {
    return "missing";
  }

  if (statuses.some((status) => status === "partial" || status === "needs_review")) {
    return "derived";
  }

  return "supported";
}

function valueFromSupportLevel(level: TinaEntityReturnCalculationField["supportLevel"]): string {
  if (level === "supported") return "Supported";
  if (level === "derived") return "Reviewer controlled";
  return "Missing or blocked";
}

function yesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

function deriveOwnershipSplitSignal(draft: TinaWorkspaceDraft): string {
  const haystack = [
    draft.profile.notes,
    ...draft.sourceFacts.map((fact) => fact.value),
    ...draft.documentReadings.flatMap((reading) => reading.detailLines),
  ].join(" ");
  const percentageMatch = haystack.match(/\b(\d{1,3}%\s*\/\s*\d{1,3}%|\d{1,3}\s*\/\s*\d{1,3})\b/);

  if (percentageMatch) {
    return percentageMatch[1].replace(/\s+/g, "");
  }

  return "Not explicitly extracted";
}

function buildStaticField(args: {
  id: string;
  fieldKey: string;
  label: string;
  value: string;
  amount?: number | null;
  supportLevel?: TinaEntityReturnCalculationField["supportLevel"];
}): TinaEntityReturnCalculationField {
  return buildField({
    id: args.id,
    fieldKey: args.fieldKey,
    label: args.label,
    value: args.value,
    amount: args.amount ?? null,
    supportLevel: args.supportLevel ?? "supported",
    relatedRecordIds: [],
    relatedCheckIds: [],
    relatedDocumentIds: [],
  });
}

function buildRecordField(args: {
  itemId: string;
  fieldKey: string;
  label: string;
  recordId: string;
  recordStatus: "covered" | "partial" | "missing" | null;
  relatedDocumentIds: string[];
}): TinaEntityReturnCalculationField {
  const supportLevel = supportLevelFromStatuses([args.recordStatus ?? "missing"]);

  return buildField({
    id: `${args.itemId}-${args.recordId}`,
    fieldKey: args.fieldKey,
    label: args.label,
    value: valueFromSupportLevel(supportLevel),
    amount: null,
    supportLevel,
    relatedRecordIds: [args.recordId],
    relatedCheckIds: [],
    relatedDocumentIds: args.relatedDocumentIds,
  });
}

function buildCheckField(args: {
  itemId: string;
  fieldKey: string;
  label: string;
  checkId: string;
  checkStatus: "clear" | "needs_review" | "blocked" | null;
  relatedDocumentIds: string[];
}): TinaEntityReturnCalculationField {
  const supportLevel = supportLevelFromStatuses([args.checkStatus ?? "blocked"]);

  return buildField({
    id: `${args.itemId}-${args.checkId}`,
    fieldKey: args.fieldKey,
    label: args.label,
    value: valueFromSupportLevel(supportLevel),
    amount: null,
    supportLevel,
    relatedRecordIds: [],
    relatedCheckIds: [args.checkId],
    relatedDocumentIds: args.relatedDocumentIds,
  });
}

function buildAdjudicationField(args: {
  itemId: string;
  fieldKey: string;
  label: string;
  adjudicationId: string;
  adjudicationStatus: "clear" | "needs_review" | "blocked" | "not_applicable" | null;
  relatedDocumentIds: string[];
}): TinaEntityReturnCalculationField {
  const supportLevel = supportLevelFromStatuses([
    args.adjudicationStatus === "clear"
      ? "clear"
      : args.adjudicationStatus === "needs_review"
        ? "needs_review"
        : "blocked",
  ]);

  return buildField({
    id: `${args.itemId}-${args.adjudicationId}`,
    fieldKey: args.fieldKey,
    label: args.label,
    value:
      args.adjudicationStatus === "clear"
        ? "Supported"
        : args.adjudicationStatus === "needs_review"
          ? "Reviewer controlled"
          : args.adjudicationStatus === "not_applicable"
            ? "Not applicable"
            : "Missing or blocked",
    amount: null,
    supportLevel,
    relatedRecordIds: [],
    relatedCheckIds: [],
    relatedDocumentIds: args.relatedDocumentIds,
  });
}

export function buildTinaEntityReturnCalculations(
  draft: TinaWorkspaceDraft
): TinaEntityReturnCalculationsSnapshot {
  const packagePlan = buildTinaEntityReturnPackagePlan(draft);
  if (!["1065", "1120_s", "1120"].includes(packagePlan.laneId)) {
    return {
      lastBuiltAt: new Date().toISOString(),
      status: "complete",
      laneId: packagePlan.laneId,
      returnFamily: packagePlan.returnFamily,
      overallStatus: "ready",
      summary:
        "Entity-return calculations are only needed for the non-Schedule-C reviewer-controlled lanes.",
      nextStep:
        "Use the regular Schedule C and companion-form engines for supported Schedule C execution.",
      items: [],
    };
  }

  const recordMatrix = buildTinaEntityRecordMatrix(draft);
  const economicsReadiness = buildTinaEntityEconomicsReadiness(draft);
  const ownerFlowBasis = buildTinaOwnerFlowBasisAdjudication(draft);
  const ownershipTimeline = buildTinaOwnershipTimeline(draft);
  const documentIntelligence = buildTinaDocumentIntelligence(draft);
  const likelyOwnerCount = ownershipTimeline.likelyOwnerCount ?? draft.profile.ownerCount ?? null;
  const ownershipSplitSignal = deriveOwnershipSplitSignal(draft);
  const structuredDocumentCount = documentIntelligence.structuredDocumentCount;

  const recordMap = new Map(recordMatrix.items.map((item) => [item.id, item]));
  const checkMap = new Map(economicsReadiness.checks.map((check) => [check.id, check]));
  const ownerFlowBasisMap = new Map(ownerFlowBasis.items.map((item) => [item.id, item]));

  const items = packagePlan.items.map((packageItem) => {
    const relatedRecords = packageItem.requiredRecordIds
      .map((recordId) => recordMap.get(recordId) ?? null)
      .filter(isNonNull);
    const relatedChecks = packageItem.requiredCheckIds
      .map((checkId) => checkMap.get(checkId) ?? null)
      .filter(isNonNull);

    const laneFields: TinaEntityReturnCalculationField[] = [];

    if (packagePlan.laneId === "1065") {
      laneFields.push(
        buildStaticField({
          id: `${packageItem.id}-business-name`,
          fieldKey: "partnership_name",
          label: "Partnership name",
          value: draft.profile.businessName || "Pending entity name",
        }),
        buildStaticField({
          id: `${packageItem.id}-partner-count`,
          fieldKey: "likely_partner_count",
          label: "Likely partner count",
          value:
            typeof likelyOwnerCount === "number"
              ? String(likelyOwnerCount)
              : "Pending partner count",
          amount: likelyOwnerCount,
          supportLevel:
            typeof likelyOwnerCount === "number"
              ? supportLevelFromStatuses([
                  (recordMap.get("partnership-ownership")?.status ?? "missing") as
                    | "covered"
                    | "partial"
                    | "missing",
                  (checkMap.get("partner-roster")?.status ?? "blocked") as
                    | "clear"
                    | "needs_review"
                    | "blocked",
                ])
              : "missing",
        }),
        buildStaticField({
          id: `${packageItem.id}-ownership-split`,
          fieldKey: "ownership_split_signal",
          label: "Ownership split signal",
          value: ownershipSplitSignal,
          supportLevel:
            ownershipSplitSignal === "Not explicitly extracted"
              ? "derived"
              : supportLevelFromStatuses([
                  (recordMap.get("partnership-ownership")?.status ?? "missing") as
                    | "covered"
                    | "partial"
                    | "missing",
                ]),
        }),
        buildStaticField({
          id: `${packageItem.id}-mid-year-change`,
          fieldKey: "mid_year_ownership_change",
          label: "Mid-year ownership change",
          value: yesNo(ownershipTimeline.hasMidYearChange),
          amount: ownershipTimeline.hasMidYearChange ? 1 : 0,
          supportLevel:
            ownershipTimeline.hasMidYearChange && ownershipTimeline.events.length === 0
              ? "derived"
              : "supported",
        }),
        buildStaticField({
          id: `${packageItem.id}-k1-count`,
          fieldKey: "likely_k1_recipient_count",
          label: "Likely Schedule K-1 recipient count",
          value:
            typeof likelyOwnerCount === "number"
              ? String(likelyOwnerCount)
              : "Pending K-1 recipient count",
          amount: likelyOwnerCount,
          supportLevel:
            typeof likelyOwnerCount === "number"
              ? supportLevelFromStatuses([
                  (recordMap.get("partnership-ownership")?.status ?? "missing") as
                    | "covered"
                    | "partial"
                    | "missing",
                ])
              : "missing",
        }),
        buildRecordField({
          itemId: packageItem.id,
          fieldKey: "prior_return_support",
          label: "Prior-return support",
          recordId: "partnership-prior-return",
          recordStatus:
            (recordMap.get("partnership-prior-return")?.status as
              | "covered"
              | "partial"
              | "missing"
              | undefined) ?? null,
          relatedDocumentIds: recordMap.get("partnership-prior-return")?.matchedDocumentIds ?? [],
        }),
        buildCheckField({
          itemId: packageItem.id,
          fieldKey: "books_and_balance_sheet_support",
          label: "Books and balance-sheet support",
          checkId: "partnership-balance-sheet",
          checkStatus:
            (checkMap.get("partnership-balance-sheet")?.status as
              | "clear"
              | "needs_review"
              | "blocked"
              | undefined) ?? null,
          relatedDocumentIds: checkMap.get("partnership-balance-sheet")?.relatedDocumentIds ?? [],
        }),
        buildCheckField({
          itemId: packageItem.id,
          fieldKey: "capital_rollforward_support",
          label: "Capital rollforward support",
          checkId: "partner-capital",
          checkStatus:
            (checkMap.get("partner-capital")?.status as
              | "clear"
              | "needs_review"
              | "blocked"
              | undefined) ?? null,
          relatedDocumentIds: checkMap.get("partner-capital")?.relatedDocumentIds ?? [],
        }),
        buildCheckField({
          itemId: packageItem.id,
          fieldKey: "partner_payment_support",
          label: "Guaranteed payment and distribution support",
          checkId: "partner-payments",
          checkStatus:
            (checkMap.get("partner-payments")?.status as
              | "clear"
              | "needs_review"
              | "blocked"
              | undefined) ?? null,
          relatedDocumentIds: checkMap.get("partner-payments")?.relatedDocumentIds ?? [],
        }),
        buildAdjudicationField({
          itemId: packageItem.id,
          fieldKey: "owner_flow_characterization",
          label: "Owner-flow characterization",
          adjudicationId: "owner-flow-characterization",
          adjudicationStatus: ownerFlowBasisMap.get("owner-flow-characterization")?.status ?? null,
          relatedDocumentIds:
            ownerFlowBasisMap.get("owner-flow-characterization")?.relatedDocumentIds ?? [],
        }),
        buildAdjudicationField({
          itemId: packageItem.id,
          fieldKey: "distribution_taxability_support",
          label: "Distribution taxability and basis footing",
          adjudicationId: "distribution-taxability",
          adjudicationStatus: ownerFlowBasisMap.get("distribution-taxability")?.status ?? null,
          relatedDocumentIds:
            ownerFlowBasisMap.get("distribution-taxability")?.relatedDocumentIds ?? [],
        }),
        buildAdjudicationField({
          itemId: packageItem.id,
          fieldKey: "ownership_change_allocation_support",
          label: "Ownership-change allocation support",
          adjudicationId: "ownership-change-allocation",
          adjudicationStatus:
            ownerFlowBasisMap.get("ownership-change-allocation")?.status ?? "not_applicable",
          relatedDocumentIds:
            ownerFlowBasisMap.get("ownership-change-allocation")?.relatedDocumentIds ?? [],
        }),
        buildStaticField({
          id: `${packageItem.id}-structured-documents`,
          fieldKey: "structured_entity_documents",
          label: "Structured entity documents",
          value: String(structuredDocumentCount),
          amount: structuredDocumentCount,
          supportLevel: structuredDocumentCount > 0 ? "derived" : "missing",
        })
      );
    }

    if (packagePlan.laneId === "1120_s") {
      laneFields.push(
        buildStaticField({
          id: `${packageItem.id}-business-name`,
          fieldKey: "s_corp_name",
          label: "S-corporation name",
          value: draft.profile.businessName || "Pending entity name",
        }),
        buildStaticField({
          id: `${packageItem.id}-shareholder-count`,
          fieldKey: "likely_shareholder_count",
          label: "Likely shareholder count",
          value:
            typeof likelyOwnerCount === "number"
              ? String(likelyOwnerCount)
              : "Pending shareholder count",
          amount: likelyOwnerCount,
          supportLevel:
            typeof likelyOwnerCount === "number"
              ? supportLevelFromStatuses([
                  (recordMap.get("s-corp-shareholders")?.status ?? "missing") as
                    | "covered"
                    | "partial"
                    | "missing",
                ])
              : "missing",
        }),
        buildCheckField({
          itemId: packageItem.id,
          fieldKey: "s_election_proof",
          label: "S-election proof",
          checkId: "s-election",
          checkStatus:
            (checkMap.get("s-election")?.status as
              | "clear"
              | "needs_review"
              | "blocked"
              | undefined) ?? null,
          relatedDocumentIds: checkMap.get("s-election")?.relatedDocumentIds ?? [],
        }),
        buildCheckField({
          itemId: packageItem.id,
          fieldKey: "officer_compensation_support",
          label: "Officer compensation support",
          checkId: "officer-compensation",
          checkStatus:
            (checkMap.get("officer-compensation")?.status as
              | "clear"
              | "needs_review"
              | "blocked"
              | undefined) ?? null,
          relatedDocumentIds: checkMap.get("officer-compensation")?.relatedDocumentIds ?? [],
        }),
        buildCheckField({
          itemId: packageItem.id,
          fieldKey: "shareholder_flow_support",
          label: "Shareholder distribution and loan support",
          checkId: "shareholder-flows",
          checkStatus:
            (checkMap.get("shareholder-flows")?.status as
              | "clear"
              | "needs_review"
              | "blocked"
              | undefined) ?? null,
          relatedDocumentIds: checkMap.get("shareholder-flows")?.relatedDocumentIds ?? [],
        }),
        buildAdjudicationField({
          itemId: packageItem.id,
          fieldKey: "shareholder_basis_footing",
          label: "Shareholder basis footing",
          adjudicationId: "opening-basis-footing",
          adjudicationStatus: ownerFlowBasisMap.get("opening-basis-footing")?.status ?? null,
          relatedDocumentIds:
            ownerFlowBasisMap.get("opening-basis-footing")?.relatedDocumentIds ?? [],
        }),
        buildAdjudicationField({
          itemId: packageItem.id,
          fieldKey: "owner_flow_characterization",
          label: "Owner-flow characterization",
          adjudicationId: "owner-flow-characterization",
          adjudicationStatus: ownerFlowBasisMap.get("owner-flow-characterization")?.status ?? null,
          relatedDocumentIds:
            ownerFlowBasisMap.get("owner-flow-characterization")?.relatedDocumentIds ?? [],
        }),
        buildAdjudicationField({
          itemId: packageItem.id,
          fieldKey: "distribution_taxability_support",
          label: "Distribution taxability and debt-basis footing",
          adjudicationId: "distribution-taxability",
          adjudicationStatus: ownerFlowBasisMap.get("distribution-taxability")?.status ?? null,
          relatedDocumentIds:
            ownerFlowBasisMap.get("distribution-taxability")?.relatedDocumentIds ?? [],
        }),
        buildCheckField({
          itemId: packageItem.id,
          fieldKey: "books_and_balance_sheet_support",
          label: "Books and balance-sheet support",
          checkId: "s-corp-balance-sheet",
          checkStatus:
            (checkMap.get("s-corp-balance-sheet")?.status as
              | "clear"
              | "needs_review"
              | "blocked"
              | undefined) ?? null,
          relatedDocumentIds: checkMap.get("s-corp-balance-sheet")?.relatedDocumentIds ?? [],
        }),
        buildStaticField({
          id: `${packageItem.id}-k1-count`,
          fieldKey: "likely_k1_recipient_count",
          label: "Likely Schedule K-1 recipient count",
          value:
            typeof likelyOwnerCount === "number"
              ? String(likelyOwnerCount)
              : "Pending K-1 recipient count",
          amount: likelyOwnerCount,
          supportLevel:
            typeof likelyOwnerCount === "number"
              ? supportLevelFromStatuses([
                  (recordMap.get("s-corp-shareholders")?.status ?? "missing") as
                    | "covered"
                    | "partial"
                    | "missing",
                ])
              : "missing",
        }),
        buildStaticField({
          id: `${packageItem.id}-mid-year-change`,
          fieldKey: "mid_year_ownership_change",
          label: "Mid-year ownership change",
          value: yesNo(ownershipTimeline.hasMidYearChange),
          amount: ownershipTimeline.hasMidYearChange ? 1 : 0,
          supportLevel: ownershipTimeline.events.length > 0 ? "supported" : "derived",
        })
      );
    }

    if (packagePlan.laneId === "1120") {
      laneFields.push(
        buildStaticField({
          id: `${packageItem.id}-business-name`,
          fieldKey: "c_corp_name",
          label: "C-corporation name",
          value: draft.profile.businessName || "Pending entity name",
        }),
        buildCheckField({
          itemId: packageItem.id,
          fieldKey: "corporate_classification_proof",
          label: "Corporate classification proof",
          checkId: "corporate-classification",
          checkStatus:
            (checkMap.get("corporate-classification")?.status as
              | "clear"
              | "needs_review"
              | "blocked"
              | undefined) ?? null,
          relatedDocumentIds: checkMap.get("corporate-classification")?.relatedDocumentIds ?? [],
        }),
        buildCheckField({
          itemId: packageItem.id,
          fieldKey: "officer_compensation_support",
          label: "Officer compensation support",
          checkId: "corporate-compensation",
          checkStatus:
            (checkMap.get("corporate-compensation")?.status as
              | "clear"
              | "needs_review"
              | "blocked"
              | undefined) ?? null,
          relatedDocumentIds: checkMap.get("corporate-compensation")?.relatedDocumentIds ?? [],
        }),
        buildCheckField({
          itemId: packageItem.id,
          fieldKey: "shareholder_flow_support",
          label: "Dividend and shareholder-loan support",
          checkId: "shareholder-flows",
          checkStatus:
            (checkMap.get("shareholder-flows")?.status as
              | "clear"
              | "needs_review"
              | "blocked"
              | undefined) ?? null,
          relatedDocumentIds: checkMap.get("shareholder-flows")?.relatedDocumentIds ?? [],
        }),
        buildAdjudicationField({
          itemId: packageItem.id,
          fieldKey: "equity_footing",
          label: "Opening equity footing",
          adjudicationId: "opening-basis-footing",
          adjudicationStatus: ownerFlowBasisMap.get("opening-basis-footing")?.status ?? null,
          relatedDocumentIds:
            ownerFlowBasisMap.get("opening-basis-footing")?.relatedDocumentIds ?? [],
        }),
        buildAdjudicationField({
          itemId: packageItem.id,
          fieldKey: "shareholder_flow_characterization",
          label: "Shareholder flow characterization",
          adjudicationId: "owner-flow-characterization",
          adjudicationStatus: ownerFlowBasisMap.get("owner-flow-characterization")?.status ?? null,
          relatedDocumentIds:
            ownerFlowBasisMap.get("owner-flow-characterization")?.relatedDocumentIds ?? [],
        }),
        buildAdjudicationField({
          itemId: packageItem.id,
          fieldKey: "dividend_vs_loan_support",
          label: "Dividend-versus-loan posture",
          adjudicationId: "loan-vs-equity",
          adjudicationStatus: ownerFlowBasisMap.get("loan-vs-equity")?.status ?? null,
          relatedDocumentIds: ownerFlowBasisMap.get("loan-vs-equity")?.relatedDocumentIds ?? [],
        }),
        buildCheckField({
          itemId: packageItem.id,
          fieldKey: "equity_rollforward_support",
          label: "Retained earnings and equity support",
          checkId: "corporate-equity",
          checkStatus:
            (checkMap.get("corporate-equity")?.status as
              | "clear"
              | "needs_review"
              | "blocked"
              | undefined) ?? null,
          relatedDocumentIds: checkMap.get("corporate-equity")?.relatedDocumentIds ?? [],
        }),
        buildCheckField({
          itemId: packageItem.id,
          fieldKey: "books_and_balance_sheet_support",
          label: "Books and balance-sheet support",
          checkId: "c-corp-balance-sheet",
          checkStatus:
            (checkMap.get("c-corp-balance-sheet")?.status as
              | "clear"
              | "needs_review"
              | "blocked"
              | undefined) ?? null,
          relatedDocumentIds: checkMap.get("c-corp-balance-sheet")?.relatedDocumentIds ?? [],
        }),
        buildStaticField({
          id: `${packageItem.id}-mid-year-change`,
          fieldKey: "mid_year_ownership_change",
          label: "Mid-year ownership change",
          value: yesNo(ownershipTimeline.hasMidYearChange),
          amount: ownershipTimeline.hasMidYearChange ? 1 : 0,
          supportLevel: ownershipTimeline.events.length > 0 ? "supported" : "derived",
        })
      );
    }

    const relevantAdjudicationStatuses = laneFields
      .filter((field) =>
        [
          "owner_flow_characterization",
          "distribution_taxability_support",
          "ownership_change_allocation_support",
          "shareholder_basis_footing",
          "equity_footing",
          "shareholder_flow_characterization",
          "dividend_vs_loan_support",
        ].includes(field.fieldKey)
      )
      .map((field) => field.value);

    const status =
      packageItem.status === "blocked"
        ? "blocked"
        : relevantAdjudicationStatuses.includes("Missing or blocked")
          ? "blocked"
          : packageItem.status === "ready" &&
              !relevantAdjudicationStatuses.includes("Reviewer controlled")
          ? "ready"
          : "needs_review";

    return buildItem({
      id: packageItem.id,
      formId: packageItem.formId,
      title: packageItem.title,
      status,
      summary:
        status === "ready"
          ? `${packageItem.title} now carries structured return-family values Tina can reuse in execution artifacts.`
          : status === "needs_review"
            ? `${packageItem.title} now carries structured return-family values, but owner-flow, basis, or reviewer-controlled completion still matters.`
            : `${packageItem.title} still lacks enough route, record, owner-flow, or basis support for Tina to treat the package values as stable.`,
      fields: laneFields,
      reviewerQuestions: unique([
        ...packageItem.reviewerQuestions,
        ...ownerFlowBasis.items
          .filter((item) => item.status === "blocked" || item.status === "needs_review")
          .slice(0, 3)
          .map((item) => item.nextStep),
      ]),
      relatedPackageItemIds: [packageItem.id],
      relatedDocumentIds: unique([
        ...packageItem.relatedDocumentIds,
        ...relatedRecords.flatMap((record) => record.matchedDocumentIds),
        ...relatedChecks.flatMap((check) => check.relatedDocumentIds),
        ...ownerFlowBasis.items.flatMap((item) => item.relatedDocumentIds),
      ]),
    });
  });

  const blockedCount = items.filter((item) => item.status === "blocked").length;
  const reviewCount = items.filter((item) => item.status === "needs_review").length;
  const overallStatus =
    blockedCount > 0 ? "blocked" : reviewCount > 0 ? "needs_review" : "ready";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    laneId: packagePlan.laneId,
    returnFamily: packagePlan.returnFamily,
    overallStatus,
    summary:
      items.length === 0
        ? "Entity-return calculations are not needed beyond Tina's supported Schedule C companion stack for this lane."
        : overallStatus === "ready"
          ? "Tina has structured entity-return calculation values for the current return-family package."
          : overallStatus === "needs_review"
            ? `Tina has structured entity-return calculation values, but ${reviewCount} item${
                reviewCount === 1 ? "" : "s"
              } still sit under reviewer control.`
            : `Tina still has ${blockedCount} blocked entity-return calculation item${
                blockedCount === 1 ? "" : "s"
              } before the package looks execution-grade.`,
    nextStep:
      items.length === 0
        ? "Use the existing Schedule C companion-form calculations for the supported lane."
        : overallStatus === "ready"
          ? "Use these structured values to drive non-Schedule-C render plans, handoff artifacts, and package truth."
          : overallStatus === "needs_review"
            ? "Keep these values visible while the reviewer controls the remaining entity-return completion."
            : "Clear the blocked entity-return calculation items before Tina behaves like the entity-return package is execution-ready.",
    items,
  };
}
