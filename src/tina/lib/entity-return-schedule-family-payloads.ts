import type {
  TinaEntityReturnCalculationField,
  TinaEntityReturnCalculationStatus,
  TinaEntityReturnScheduleFamilyArtifact,
  TinaEntityReturnScheduleFamilyArtifactKind,
  TinaEntityReturnScheduleFamilyPayloadArtifact,
  TinaEntityReturnScheduleFamilyPayloadReadiness,
  TinaEntityReturnScheduleFamilyPayloadSection,
  TinaEntityReturnScheduleFamilyPayloadSnapshot,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaEntityReturnScheduleFamilyArtifacts } from "@/tina/lib/entity-return-schedule-family-artifacts";
import { buildTinaEntityReturnSupportArtifacts } from "@/tina/lib/entity-return-support-artifacts";
import type { TinaWorkspaceDraft } from "@/tina/types";

interface TinaEntityReturnScheduleFamilyPayloadSectionBlueprint {
  id: string;
  title: string;
  summary: string;
  fieldKeys: string[];
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "entity-schedule-family"
  );
}

function countBySupportLevel(fields: TinaEntityReturnCalculationField[]) {
  return {
    supportedFieldCount: fields.filter((field) => field.supportLevel === "supported").length,
    derivedFieldCount: fields.filter((field) => field.supportLevel === "derived").length,
    missingFieldCount: fields.filter((field) => field.supportLevel === "missing").length,
  };
}

function deriveSectionStatus(fields: TinaEntityReturnCalculationField[]): TinaEntityReturnCalculationStatus {
  const { supportedFieldCount, derivedFieldCount, missingFieldCount } = countBySupportLevel(fields);

  if (fields.length === 0) {
    return "needs_review";
  }

  if (supportedFieldCount + derivedFieldCount === 0 && missingFieldCount > 0) {
    return "blocked";
  }

  if (missingFieldCount > 0 || derivedFieldCount > 0) {
    return "needs_review";
  }

  return "ready";
}

function mergeStatus(
  left: TinaEntityReturnCalculationStatus,
  right: TinaEntityReturnCalculationStatus
): TinaEntityReturnCalculationStatus {
  if (left === "blocked" || right === "blocked") return "blocked";
  if (left === "needs_review" || right === "needs_review") return "needs_review";
  return "ready";
}

function buildBlueprint(
  kind: TinaEntityReturnScheduleFamilyArtifactKind
): {
  officialScheduleTargets: string[];
  sections: TinaEntityReturnScheduleFamilyPayloadSectionBlueprint[];
} {
  switch (kind) {
    case "schedule_k_family":
      return {
        officialScheduleTargets: ["Schedule K"],
        sections: [
          {
            id: "core-activity",
            title: "Core activity payload",
            summary: "Carries the core activity and entity identity payload Tina needs for the Schedule K family.",
            fieldKeys: [
              "partnership_name",
              "s_corp_name",
              "c_corp_name",
              "likely_partner_count",
              "likely_shareholder_count",
            ],
          },
          {
            id: "books-support",
            title: "Books and structural support",
            summary: "Tracks whether the Schedule K family is backed by books, prior-return support, and governing entity papers.",
            fieldKeys: [
              "prior_return_support",
              "books_and_balance_sheet_support",
              "structured_entity_documents",
              "corporate_classification_proof",
              "s_election_proof",
            ],
          },
        ],
      };
    case "schedule_k1_family":
      return {
        officialScheduleTargets: ["Schedule K-1"],
        sections: [
          {
            id: "recipient-roster",
            title: "Recipient roster payload",
            summary: "Tracks who should receive the K-1 family and whether Tina has roster-grade support behind that count.",
            fieldKeys: [
              "likely_partner_count",
              "likely_shareholder_count",
              "likely_k1_recipient_count",
              "partner_roster_support",
              "shareholder_roster_support",
            ],
          },
          {
            id: "allocation-and-ownership",
            title: "Allocation and ownership payload",
            summary: "Captures ownership splits, mid-year changes, and flow support that drive the K-1 family.",
            fieldKeys: [
              "ownership_split_signal",
              "mid_year_ownership_change",
              "shareholder_flow_support",
              "partner_transfer_support",
              "partner_transfer_records",
            ],
          },
          {
            id: "capital-and-basis-support",
            title: "Capital and basis support payload",
            summary: "Tracks whether the capital and partner/shareholder support is strong enough to trust the K-1 family.",
            fieldKeys: [
              "capital_rollforward_support",
              "partner_payment_support",
              "shareholder_flow_support",
            ],
          },
        ],
      };
    case "schedule_l_family":
      return {
        officialScheduleTargets: ["Schedule L"],
        sections: [
          {
            id: "balance-sheet-support",
            title: "Balance-sheet payload",
            summary: "Tracks the books, prior return, and entity proof Tina needs to carry the Schedule L family honestly.",
            fieldKeys: [
              "partnership_name",
              "s_corp_name",
              "c_corp_name",
              "prior_return_support",
              "books_and_balance_sheet_support",
              "structured_entity_documents",
              "corporate_classification_proof",
              "s_election_proof",
            ],
          },
          {
            id: "ownership-context",
            title: "Ownership context payload",
            summary: "Keeps the ownership and mid-year change truth visible behind the balance-sheet family.",
            fieldKeys: [
              "likely_partner_count",
              "likely_shareholder_count",
              "mid_year_ownership_change",
            ],
          },
        ],
      };
    case "schedule_m_family":
      return {
        officialScheduleTargets: ["Schedule M-1", "Schedule M-2"],
        sections: [
          {
            id: "book-tax-reconciliation",
            title: "Book-to-tax reconciliation payload",
            summary: "Tracks whether Tina has enough support to carry the M-family reconciliation payload.",
            fieldKeys: ["books_and_balance_sheet_support"],
          },
          {
            id: "equity-rollforward",
            title: "Equity rollforward payload",
            summary: "Tracks whether the retained earnings and equity story behind the M-family is trustworthy.",
            fieldKeys: ["equity_rollforward_support", "shareholder_flow_support"],
          },
        ],
      };
    case "capital_family":
      return {
        officialScheduleTargets: ["Capital accounts"],
        sections: [
          {
            id: "capital-rollforward",
            title: "Capital rollforward payload",
            summary: "Tracks capital-account support, transfer evidence, and owner-change effects behind the capital family.",
            fieldKeys: [
              "capital_rollforward_support",
              "ownership_split_signal",
              "mid_year_ownership_change",
              "partner_transfer_support",
              "partner_transfer_records",
            ],
          },
          {
            id: "owner-support",
            title: "Owner support payload",
            summary: "Keeps owner count and capital support visible so Tina does not overstate capital-family readiness.",
            fieldKeys: ["likely_partner_count", "likely_k1_recipient_count", "partner_payment_support"],
          },
        ],
      };
    case "equity_family":
      return {
        officialScheduleTargets: ["Equity workpapers", "Retained earnings"],
        sections: [
          {
            id: "equity-rollforward",
            title: "Equity rollforward payload",
            summary: "Tracks retained earnings, shareholder flow, and officer-comp support behind the equity family.",
            fieldKeys: [
              "equity_rollforward_support",
              "shareholder_flow_support",
              "officer_compensation_support",
              "mid_year_ownership_change",
            ],
          },
          {
            id: "owner-context",
            title: "Owner context payload",
            summary: "Keeps owner count and transfer context visible behind the equity family.",
            fieldKeys: ["likely_shareholder_count"],
          },
        ],
      };
    case "partner_flow_family":
      return {
        officialScheduleTargets: ["Guaranteed payments", "Partner distributions"],
        sections: [
          {
            id: "payment-support",
            title: "Payment and distribution payload",
            summary: "Tracks guaranteed payment and distribution support behind the partner-flow family.",
            fieldKeys: ["partner_payment_support", "capital_rollforward_support"],
          },
          {
            id: "partner-context",
            title: "Partner context payload",
            summary: "Keeps owner-count and ownership-split truth visible behind partner-flow work.",
            fieldKeys: ["likely_partner_count", "ownership_split_signal", "mid_year_ownership_change"],
          },
        ],
      };
    case "shareholder_flow_family":
      return {
        officialScheduleTargets: ["Officer compensation", "Shareholder flow"],
        sections: [
          {
            id: "compensation-support",
            title: "Compensation and shareholder-flow payload",
            summary: "Tracks officer compensation and shareholder-flow support behind the shareholder-flow family.",
            fieldKeys: ["officer_compensation_support", "shareholder_flow_support"],
          },
          {
            id: "shareholder-context",
            title: "Shareholder context payload",
            summary: "Keeps shareholder count and ownership-change truth visible behind the shareholder-flow family.",
            fieldKeys: ["likely_shareholder_count", "mid_year_ownership_change"],
          },
        ],
      };
    default:
      return {
        officialScheduleTargets: ["Supporting schedules"],
        sections: [
          {
            id: "general-support",
            title: "General schedule-family payload",
            summary: "Carries the remaining schedule-family payload truth for this return family.",
            fieldKeys: [],
          },
        ],
      };
  }
}

function buildSection(
  artifact: TinaEntityReturnScheduleFamilyArtifact,
  blueprint: TinaEntityReturnScheduleFamilyPayloadSectionBlueprint
): TinaEntityReturnScheduleFamilyPayloadSection {
  const fields = artifact.fields.filter((field) => blueprint.fieldKeys.includes(field.fieldKey));
  const counts = countBySupportLevel(fields);
  const status = deriveSectionStatus(fields);

  return {
    id: `${artifact.id}-${blueprint.id}`,
    title: blueprint.title,
    status,
    summary:
      status === "ready"
        ? `${blueprint.title} is now strong enough to behave like a filing-oriented payload section.`
        : status === "needs_review"
          ? `${blueprint.title} exists, but Tina still needs reviewer help before treating it like filing-grade payload truth.`
          : `${blueprint.title} is still too thin to trust as filing-grade payload truth.`,
    fieldCount: fields.length,
    supportedFieldCount: counts.supportedFieldCount,
    derivedFieldCount: counts.derivedFieldCount,
    missingFieldCount: counts.missingFieldCount,
    fieldKeys: blueprint.fieldKeys,
    fields,
    relatedDocumentIds: unique(fields.flatMap((field) => field.relatedDocumentIds)),
  };
}

function derivePayloadReadiness(
  status: TinaEntityReturnCalculationStatus
): TinaEntityReturnScheduleFamilyPayloadReadiness {
  if (status === "blocked") return "blocked";
  if (status === "needs_review") return "reviewer_payload";
  return "payload_ready";
}

function deriveArtifactStatus(
  sourceStatus: TinaEntityReturnCalculationStatus,
  sectionStatus: TinaEntityReturnCalculationStatus
): TinaEntityReturnCalculationStatus {
  if (sourceStatus === "ready") {
    return sectionStatus;
  }

  if (sourceStatus === "needs_review") {
    return sectionStatus === "blocked" ? "blocked" : "needs_review";
  }

  return sectionStatus === "blocked" ? "blocked" : "needs_review";
}

function deriveCompletionPercent(sections: TinaEntityReturnScheduleFamilyPayloadSection[]): number {
  const counts = sections.reduce(
    (sum, section) => {
      sum.supported += section.supportedFieldCount;
      sum.derived += section.derivedFieldCount;
      sum.total += section.fieldCount;
      return sum;
    },
    { supported: 0, derived: 0, total: 0 }
  );

  if (counts.total === 0) return 0;

  return Math.round(((counts.supported + counts.derived * 0.5) / counts.total) * 100);
}

function buildPayloadArtifact(
  artifact: TinaEntityReturnScheduleFamilyArtifact,
  businessSlug: string,
  taxYear: string,
  supportArtifactDocumentIds: string[]
): TinaEntityReturnScheduleFamilyPayloadArtifact {
  const blueprint = buildBlueprint(artifact.kind);
  const sections = blueprint.sections.map((sectionBlueprint) =>
    buildSection(artifact, sectionBlueprint)
  );
  const sectionStatus = sections.reduce<TinaEntityReturnCalculationStatus>(
    (status, section) => mergeStatus(status, section.status),
    "ready"
  );
  const status = deriveArtifactStatus(artifact.status, sectionStatus);
  const readySectionCount = sections.filter((section) => section.status === "ready").length;
  const reviewSectionCount = sections.filter((section) => section.status === "needs_review").length;
  const blockedSectionCount = sections.filter((section) => section.status === "blocked").length;

  return {
    id: `entity-schedule-family-payload-${artifact.id}`,
    laneId: artifact.laneId,
    returnFamily: artifact.returnFamily,
    sourceScheduleFamilyArtifactId: artifact.id,
    title: artifact.title,
    kind: artifact.kind,
    status,
    fileName: `${slugify(artifact.id)}-payload-${businessSlug}-${taxYear}.json`,
    mimeType: "application/json; charset=utf-8",
    deliverable: `${artifact.deliverable} payload`,
    summary:
      status === "ready"
        ? `${artifact.title} now exists as a sectioned payload family Tina can carry as near-filing-grade package truth.`
        : status === "needs_review"
          ? `${artifact.title} now exists as a sectioned payload family, but reviewer-controlled completion still matters before it acts filing-grade.`
          : `${artifact.title} still lacks enough support to behave like filing-grade schedule-family payload truth.`,
    payloadReadiness: derivePayloadReadiness(status),
    completionPercent: deriveCompletionPercent(sections),
    officialScheduleTargets: blueprint.officialScheduleTargets,
    sectionCount: sections.length,
    readySectionCount,
    reviewSectionCount,
    blockedSectionCount,
    supportArtifactCount: artifact.sourceSupportArtifactIds.length,
    sourceCalculationItemIds: artifact.sourceCalculationItemIds,
    sourceSupportArtifactIds: artifact.sourceSupportArtifactIds,
    sections,
    reviewerQuestions: artifact.reviewerQuestions,
    relatedPackageItemIds: artifact.relatedPackageItemIds,
    relatedDocumentIds: unique([
      ...artifact.relatedDocumentIds,
      ...supportArtifactDocumentIds,
      ...sections.flatMap((section) => section.relatedDocumentIds),
    ]),
  };
}

export function buildTinaEntityReturnScheduleFamilyPayloads(
  draft: TinaWorkspaceDraft
): TinaEntityReturnScheduleFamilyPayloadSnapshot {
  const scheduleFamilies = buildTinaEntityReturnScheduleFamilyArtifacts(draft);
  const supportArtifacts = buildTinaEntityReturnSupportArtifacts(draft);
  const taxYear = draft.profile.taxYear || "tax-year";
  const businessSlug = slugify(draft.profile.businessName || scheduleFamilies.returnFamily);
  const supportArtifactsById = new Map(supportArtifacts.items.map((item) => [item.id, item]));

  const items = scheduleFamilies.items.map((artifact) =>
    buildPayloadArtifact(
      artifact,
      businessSlug,
      taxYear,
      artifact.sourceSupportArtifactIds.flatMap(
        (sourceSupportArtifactId) => supportArtifactsById.get(sourceSupportArtifactId)?.relatedDocumentIds ?? []
      )
    )
  );

  const overallStatus = items.reduce<TinaEntityReturnCalculationStatus>(
    (status, item) => mergeStatus(status, item.status),
    "ready"
  );
  const blockedCount = items.filter((item) => item.status === "blocked").length;
  const reviewCount = items.filter((item) => item.status === "needs_review").length;

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    laneId: scheduleFamilies.laneId,
    returnFamily: scheduleFamilies.returnFamily,
    overallStatus,
    summary:
      items.length === 0
        ? "This lane does not currently need non-Schedule-C schedule-family payload artifacts."
        : overallStatus === "ready"
          ? "Tina now has sectioned schedule-family payload artifacts for the current non-Schedule-C return family."
          : overallStatus === "needs_review"
            ? `Tina now has sectioned schedule-family payload artifacts, but ${reviewCount} still need reviewer-controlled completion.`
            : `Tina still has ${blockedCount} blocked schedule-family payload artifact${blockedCount === 1 ? "" : "s"} in the entity return family.`,
    nextStep:
      items.length === 0
        ? "Keep using the regular rendered and companion-form package artifacts for the current lane."
        : overallStatus === "ready"
          ? "Carry these sectioned schedule-family payloads with the return package so K-1, Schedule L, M-family, capital, and flow truth stays explicit."
          : overallStatus === "needs_review"
            ? "Use the sectioned payloads to drive reviewer completion instead of treating the schedule families as vague workpapers."
            : "Clear the blocked schedule-family payload artifacts before calling the non-Schedule-C family close to filing-grade.",
    items,
  };
}
