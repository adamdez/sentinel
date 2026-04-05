import type {
  TinaEntityReturnCalculationField,
  TinaEntityReturnCalculationStatus,
  TinaEntityReturnScheduleFamilyArtifactKind,
  TinaEntityReturnScheduleFamilyFinalizationArtifact,
  TinaEntityReturnScheduleFamilyFinalizationLine,
  TinaEntityReturnScheduleFamilyFinalizationReadiness,
  TinaEntityReturnScheduleFamilyFinalizationSnapshot,
  TinaEntityReturnScheduleFamilyPayloadArtifact,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaEntityReturnScheduleFamilyPayloads } from "@/tina/lib/entity-return-schedule-family-payloads";
import type { TinaWorkspaceDraft } from "@/tina/types";

interface TinaEntityReturnScheduleFamilyFinalizationLineBlueprint {
  id: string;
  target: string;
  label: string;
  summary: string;
  fieldKeys: string[];
}

const finalizationCache = new WeakMap<
  TinaWorkspaceDraft,
  TinaEntityReturnScheduleFamilyFinalizationSnapshot
>();

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "entity-schedule-family-finalization"
  );
}

function mergeStatus(
  left: TinaEntityReturnCalculationStatus,
  right: TinaEntityReturnCalculationStatus
): TinaEntityReturnCalculationStatus {
  if (left === "blocked" || right === "blocked") return "blocked";
  if (left === "needs_review" || right === "needs_review") return "needs_review";
  return "ready";
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

function countBySupportLevel(fields: TinaEntityReturnCalculationField[]) {
  return {
    supportedFieldCount: fields.filter((field) => field.supportLevel === "supported").length,
    derivedFieldCount: fields.filter((field) => field.supportLevel === "derived").length,
    missingFieldCount: fields.filter((field) => field.supportLevel === "missing").length,
  };
}

function deriveLineStatus(
  fields: TinaEntityReturnCalculationField[]
): TinaEntityReturnCalculationStatus {
  const { supportedFieldCount, derivedFieldCount, missingFieldCount } = countBySupportLevel(fields);

  if (fields.length === 0) {
    return "blocked";
  }

  if (supportedFieldCount + derivedFieldCount === 0 && missingFieldCount > 0) {
    return "blocked";
  }

  if (missingFieldCount > 0 || derivedFieldCount > 0) {
    return "needs_review";
  }

  return "ready";
}

function deriveArtifactStatus(
  sourceStatus: TinaEntityReturnCalculationStatus,
  lineStatus: TinaEntityReturnCalculationStatus
): TinaEntityReturnCalculationStatus {
  if (sourceStatus === "ready") {
    return lineStatus;
  }

  if (sourceStatus === "needs_review") {
    return lineStatus === "blocked" ? "blocked" : "needs_review";
  }

  return lineStatus === "blocked" ? "blocked" : "needs_review";
}

function deriveFinalizationReadiness(
  status: TinaEntityReturnCalculationStatus
): TinaEntityReturnScheduleFamilyFinalizationReadiness {
  if (status === "blocked") return "blocked";
  if (status === "needs_review") return "reviewer_finalization";
  return "finalized_payload_ready";
}

function deriveCompletionPercent(
  lineItems: TinaEntityReturnScheduleFamilyFinalizationLine[]
): number {
  const counts = lineItems.reduce(
    (sum, item) => {
      if (item.supportLevel === "supported") sum.supported += 1;
      if (item.supportLevel === "derived") sum.derived += 1;
      sum.total += 1;
      return sum;
    },
    { supported: 0, derived: 0, total: 0 }
  );

  if (counts.total === 0) return 0;

  return Math.round(((counts.supported + counts.derived * 0.5) / counts.total) * 100);
}

function buildBlueprint(
  kind: TinaEntityReturnScheduleFamilyArtifactKind
): TinaEntityReturnScheduleFamilyFinalizationLineBlueprint[] {
  switch (kind) {
    case "schedule_k_family":
      return [
        {
          id: "entity-identity",
          target: "Schedule K entity identity",
          label: "Entity identity line payload",
          summary: "Carries the entity identity and owner-count truth Tina needs before Schedule K output behaves filing-grade.",
          fieldKeys: ["partnership_name", "s_corp_name", "c_corp_name", "likely_partner_count", "likely_shareholder_count"],
        },
        {
          id: "books-support",
          target: "Schedule K books and support",
          label: "Books and support line payload",
          summary: "Carries the books, prior-return, and election/classification support behind Schedule K output.",
          fieldKeys: [
            "prior_return_support",
            "books_and_balance_sheet_support",
            "structured_entity_documents",
            "corporate_classification_proof",
            "s_election_proof",
          ],
        },
      ];
    case "schedule_k1_family":
      return [
        {
          id: "recipient-roster",
          target: "Schedule K-1 recipient roster",
          label: "Recipient roster line payload",
          summary: "Carries the owner/shareholder roster truth behind the K-1 family.",
          fieldKeys: [
            "likely_partner_count",
            "likely_shareholder_count",
            "likely_k1_recipient_count",
            "partner_roster_support",
            "shareholder_roster_support",
          ],
        },
        {
          id: "allocation-context",
          target: "Schedule K-1 ownership and allocation context",
          label: "Ownership and allocation line payload",
          summary: "Carries ownership splits, mid-year changes, and allocation support behind the K-1 family.",
          fieldKeys: [
            "ownership_split_signal",
            "mid_year_ownership_change",
            "partner_transfer_support",
            "partner_transfer_records",
            "shareholder_flow_support",
          ],
        },
        {
          id: "capital-basis-support",
          target: "Schedule K-1 capital and basis support",
          label: "Capital and basis line payload",
          summary: "Carries capital, payment, and basis-adjacent support behind the K-1 family.",
          fieldKeys: [
            "capital_rollforward_support",
            "partner_payment_support",
            "shareholder_flow_support",
            "officer_compensation_support",
          ],
        },
      ];
    case "schedule_l_family":
      return [
        {
          id: "balance-sheet-identity",
          target: "Schedule L entity identity",
          label: "Balance-sheet identity line payload",
          summary: "Carries the entity identity and owner-count truth behind Schedule L.",
          fieldKeys: [
            "partnership_name",
            "s_corp_name",
            "c_corp_name",
            "likely_partner_count",
            "likely_shareholder_count",
          ],
        },
        {
          id: "balance-sheet-support",
          target: "Schedule L balance-sheet support",
          label: "Balance-sheet support line payload",
          summary: "Carries the books, balance-sheet, and entity-paper support behind Schedule L.",
          fieldKeys: [
            "prior_return_support",
            "books_and_balance_sheet_support",
            "structured_entity_documents",
            "corporate_classification_proof",
            "s_election_proof",
          ],
        },
      ];
    case "schedule_m_family":
      return [
        {
          id: "book-tax-reconciliation",
          target: "Schedule M-1 reconciliation support",
          label: "Book-to-tax reconciliation line payload",
          summary: "Carries the reconciliation support Tina needs before the M-family behaves filing-grade.",
          fieldKeys: ["books_and_balance_sheet_support"],
        },
        {
          id: "equity-rollforward",
          target: "Schedule M-2 equity rollforward support",
          label: "Equity rollforward line payload",
          summary: "Carries retained earnings and equity support behind the M-family.",
          fieldKeys: ["equity_rollforward_support", "shareholder_flow_support"],
        },
      ];
    case "capital_family":
      return [
        {
          id: "capital-rollforward",
          target: "Capital account rollforward",
          label: "Capital rollforward line payload",
          summary: "Carries capital-account and transfer truth behind the partner capital family.",
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
          target: "Capital account owner support",
          label: "Owner support line payload",
          summary: "Carries owner-count and payment context behind the capital family.",
          fieldKeys: ["likely_partner_count", "likely_k1_recipient_count", "partner_payment_support"],
        },
      ];
    case "equity_family":
      return [
        {
          id: "equity-rollforward",
          target: "Equity rollforward",
          label: "Equity rollforward line payload",
          summary: "Carries retained earnings, equity, and compensation truth behind the equity family.",
          fieldKeys: [
            "equity_rollforward_support",
            "shareholder_flow_support",
            "officer_compensation_support",
          ],
        },
        {
          id: "shareholder-context",
          target: "Equity owner context",
          label: "Owner context line payload",
          summary: "Carries owner-count and mid-year change truth behind the equity family.",
          fieldKeys: ["likely_shareholder_count", "mid_year_ownership_change"],
        },
      ];
    case "partner_flow_family":
      return [
        {
          id: "partner-payments",
          target: "Guaranteed payments and distributions",
          label: "Partner payment line payload",
          summary: "Carries guaranteed payment and distribution support behind the partner-flow family.",
          fieldKeys: ["partner_payment_support", "capital_rollforward_support"],
        },
        {
          id: "partner-context",
          target: "Partner-flow owner context",
          label: "Partner-flow context line payload",
          summary: "Carries owner-count and ownership-change truth behind the partner-flow family.",
          fieldKeys: ["likely_partner_count", "ownership_split_signal", "mid_year_ownership_change"],
        },
      ];
    case "shareholder_flow_family":
      return [
        {
          id: "officer-compensation",
          target: "Officer compensation",
          label: "Officer compensation line payload",
          summary: "Carries officer compensation truth behind the shareholder-flow family.",
          fieldKeys: ["officer_compensation_support"],
        },
        {
          id: "shareholder-flow",
          target: "Shareholder distributions and loans",
          label: "Shareholder-flow line payload",
          summary: "Carries shareholder flow and ownership-change truth behind the shareholder-flow family.",
          fieldKeys: ["shareholder_flow_support", "likely_shareholder_count", "mid_year_ownership_change"],
        },
      ];
    default:
      return [
        {
          id: "general-finalization",
          target: "Supporting schedule output",
          label: "General schedule-family line payload",
          summary: "Carries the remaining line-oriented output Tina needs for this schedule-family artifact.",
          fieldKeys: [],
        },
      ];
  }
}

function buildLineValue(fields: TinaEntityReturnCalculationField[]): {
  value: string;
  amount: number | null;
  supportLevel: TinaEntityReturnCalculationField["supportLevel"];
} {
  if (fields.length === 0) {
    return {
      value: "Pending reviewer completion",
      amount: null,
      supportLevel: "missing",
    };
  }

  const presentFields = fields.filter((field) => field.value.trim().length > 0);
  const amountField = fields.find((field) => typeof field.amount === "number") ?? null;
  const supportLevel = fields.reduce<TinaEntityReturnCalculationField["supportLevel"]>(
    (level, field) => mergeSupportLevel(level, field.supportLevel),
    "supported"
  );

  if (presentFields.length === 1) {
    return {
      value: presentFields[0].value,
      amount: amountField?.amount ?? null,
      supportLevel,
    };
  }

  const lineParts = (presentFields.length > 0 ? presentFields : fields)
    .slice(0, 3)
    .map((field) => `${field.label}: ${field.value}`);

  return {
    value:
      lineParts.length > 0
        ? lineParts.join("; ")
        : "Pending reviewer completion",
    amount: amountField?.amount ?? null,
    supportLevel,
  };
}

function buildLineItem(
  artifact: TinaEntityReturnScheduleFamilyPayloadArtifact,
  blueprint: TinaEntityReturnScheduleFamilyFinalizationLineBlueprint
): TinaEntityReturnScheduleFamilyFinalizationLine {
  const fields = artifact.sections
    .flatMap((section) => section.fields)
    .filter((field) => blueprint.fieldKeys.includes(field.fieldKey));
  const status = deriveLineStatus(fields);
  const renderedValue = buildLineValue(fields);

  return {
    id: `${artifact.id}-${blueprint.id}`,
    target: blueprint.target,
    label: blueprint.label,
    status,
    summary:
      status === "ready"
        ? `${blueprint.label} is explicit enough to behave like filing-oriented schedule-family output.`
        : status === "needs_review"
          ? `${blueprint.label} exists, but reviewer-controlled completion still matters before Tina should treat it like filing-oriented output.`
          : `${blueprint.label} is still too thin to trust as filing-oriented schedule-family output.`,
    value: renderedValue.value,
    amount: renderedValue.amount,
    supportLevel: renderedValue.supportLevel,
    sourceFieldKeys: blueprint.fieldKeys,
    relatedDocumentIds: unique(fields.flatMap((field) => field.relatedDocumentIds)),
  };
}

function buildArtifact(
  artifact: TinaEntityReturnScheduleFamilyPayloadArtifact,
  businessSlug: string,
  taxYear: string
): TinaEntityReturnScheduleFamilyFinalizationArtifact {
  const lineItems = buildBlueprint(artifact.kind).map((blueprint) =>
    buildLineItem(artifact, blueprint)
  );
  const lineStatus = lineItems.reduce<TinaEntityReturnCalculationStatus>(
    (status, item) => mergeStatus(status, item.status),
    "ready"
  );
  const status = deriveArtifactStatus(artifact.status, lineStatus);
  const readyLineCount = lineItems.filter((item) => item.status === "ready").length;
  const reviewLineCount = lineItems.filter((item) => item.status === "needs_review").length;
  const blockedLineCount = lineItems.filter((item) => item.status === "blocked").length;

  return {
    id: `entity-schedule-family-finalization-${artifact.id}`,
    laneId: artifact.laneId,
    returnFamily: artifact.returnFamily,
    sourceScheduleFamilyPayloadArtifactId: artifact.id,
    title: artifact.title,
    kind: artifact.kind,
    status,
    fileName: `${slugify(artifact.id)}-finalization-${businessSlug}-${taxYear}.json`,
    mimeType: "application/json; charset=utf-8",
    deliverable: `${artifact.deliverable} finalization`,
    summary:
      status === "ready"
        ? `${artifact.title} now has line-oriented schedule-family outputs Tina can carry as near-filing-grade package truth.`
        : status === "needs_review"
          ? `${artifact.title} now has line-oriented schedule-family outputs, but reviewer-controlled completion still matters before it behaves filing-grade.`
          : `${artifact.title} still lacks enough support to behave like finalized schedule-family output.`,
    finalizationReadiness: deriveFinalizationReadiness(status),
    completionPercent: deriveCompletionPercent(lineItems),
    officialScheduleTargets: artifact.officialScheduleTargets,
    lineCount: lineItems.length,
    readyLineCount,
    reviewLineCount,
    blockedLineCount,
    sourceCalculationItemIds: artifact.sourceCalculationItemIds,
    sourceSupportArtifactIds: artifact.sourceSupportArtifactIds,
    lineItems,
    reviewerQuestions: artifact.reviewerQuestions,
    relatedPackageItemIds: artifact.relatedPackageItemIds,
    relatedDocumentIds: unique([
      ...artifact.relatedDocumentIds,
      ...lineItems.flatMap((item) => item.relatedDocumentIds),
    ]),
  };
}

export function buildTinaEntityReturnScheduleFamilyFinalizations(
  draft: TinaWorkspaceDraft
): TinaEntityReturnScheduleFamilyFinalizationSnapshot {
  const cached = finalizationCache.get(draft);
  if (cached) {
    return cached;
  }

  const payloadSnapshot = buildTinaEntityReturnScheduleFamilyPayloads(draft);
  const taxYear = draft.profile.taxYear || "tax-year";
  const businessSlug = slugify(draft.profile.businessName || payloadSnapshot.returnFamily);
  const items = payloadSnapshot.items.map((artifact) =>
    buildArtifact(artifact, businessSlug, taxYear)
  );

  const overallStatus = items.reduce<TinaEntityReturnCalculationStatus>(
    (status, item) => mergeStatus(status, item.status),
    "ready"
  );
  const blockedCount = items.filter((item) => item.status === "blocked").length;
  const reviewCount = items.filter((item) => item.status === "needs_review").length;

  const snapshot: TinaEntityReturnScheduleFamilyFinalizationSnapshot = {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    laneId: payloadSnapshot.laneId,
    returnFamily: payloadSnapshot.returnFamily,
    overallStatus,
    summary:
      items.length === 0
        ? "This lane does not currently need non-Schedule-C schedule-family finalization artifacts."
        : overallStatus === "ready"
          ? "Tina now has line-oriented schedule-family finalization artifacts behind the non-Schedule-C return family."
          : overallStatus === "needs_review"
            ? `Tina has line-oriented schedule-family finalizations, but ${reviewCount} still need reviewer-controlled completion.`
            : `Tina still has ${blockedCount} blocked schedule-family finalization artifact${blockedCount === 1 ? "" : "s"} behind the non-Schedule-C return family.`,
    nextStep:
      items.length === 0
        ? "Keep using the regular rendered and companion-form package artifacts for the current lane."
        : overallStatus === "ready"
          ? "Carry these line-oriented schedule-family finalizations with the return package so K-1, Schedule L, M-family, capital, and flow truth stays explicit."
          : overallStatus === "needs_review"
            ? "Use these finalization artifacts to drive reviewer completion instead of treating the schedule families like vague workpapers."
            : "Clear the blocked schedule-family finalization artifacts before Tina behaves like the non-Schedule-C family is close to filing-grade.",
    items,
  };

  finalizationCache.set(draft, snapshot);
  return snapshot;
}
