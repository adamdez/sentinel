import {
  collectTinaAnalyzedTransactionGroups,
  type TinaTransactionGroupClassification,
} from "@/tina/lib/transaction-group-analysis";
import type {
  TinaReviewerAcceptanceTrustLevel,
  TinaReviewerOutcomeCaseTag,
  TinaTaxAdjustmentKind,
  TinaWorkspaceDraft,
} from "@/tina/types";

export interface TinaScheduleCScenarioSignal {
  tag: TinaReviewerOutcomeCaseTag;
  title: string;
  summary: string;
  evidence: string[];
  sourceDocumentIds: string[];
  sourceFactIds: string[];
  adjustmentKinds: TinaTaxAdjustmentKind[];
}

export interface TinaScheduleCScenarioProfile {
  tags: TinaReviewerOutcomeCaseTag[];
  signals: TinaScheduleCScenarioSignal[];
  summary: string;
}

interface TinaScenarioDefinition {
  tag: TinaReviewerOutcomeCaseTag;
  title: string;
  labels: string[];
  transactionClassifications: TinaTransactionGroupClassification[];
  adjustmentKinds: TinaTaxAdjustmentKind[];
}

const SCENARIO_DEFINITIONS: TinaScenarioDefinition[] = [
  {
    tag: "payroll",
    title: "Payroll activity",
    labels: ["Payroll clue", "Payroll filing period clue", "Payroll tax form clue"],
    transactionClassifications: ["payroll"],
    adjustmentKinds: ["payroll_classification"],
  },
  {
    tag: "contractor",
    title: "Contractor activity",
    labels: ["Contractor clue"],
    transactionClassifications: ["contractor"],
    adjustmentKinds: ["contractor_classification"],
  },
  {
    tag: "sales_tax",
    title: "Sales-tax activity",
    labels: ["Sales tax clue"],
    transactionClassifications: ["sales_tax"],
    adjustmentKinds: ["sales_tax_exclusion"],
  },
  {
    tag: "inventory",
    title: "Inventory-sensitive activity",
    labels: ["Inventory clue"],
    transactionClassifications: ["inventory"],
    adjustmentKinds: ["inventory_treatment"],
  },
  {
    tag: "owner_flow",
    title: "Owner-flow contamination",
    labels: ["Owner draw clue"],
    transactionClassifications: ["owner_flow"],
    adjustmentKinds: ["owner_flow_separation"],
  },
  {
    tag: "transfer",
    title: "Transfer or intercompany activity",
    labels: ["Intercompany transfer clue"],
    transactionClassifications: ["transfer"],
    adjustmentKinds: ["transfer_classification"],
  },
  {
    tag: "related_party",
    title: "Related-party activity",
    labels: ["Related-party clue"],
    transactionClassifications: ["related_party"],
    adjustmentKinds: ["related_party_review"],
  },
  {
    tag: "continuity",
    title: "Carryover continuity",
    labels: ["Carryover amount clue", "Prior-year carryover clue"],
    transactionClassifications: [],
    adjustmentKinds: ["continuity_review"],
  },
  {
    tag: "depreciation",
    title: "Depreciation-sensitive activity",
    labels: ["Asset placed-in-service clue", "Fixed asset clue", "Depreciation clue"],
    transactionClassifications: [],
    adjustmentKinds: ["depreciation_review"],
  },
];

function summarizeEvidence(values: string[], fallback: string): string {
  if (values.length === 0) return fallback;
  return `${fallback} Evidence: ${values.slice(0, 2).join(" and ")}.`;
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export function buildTinaScheduleCScenarioProfile(
  draft: TinaWorkspaceDraft,
  sourceDocumentIds?: string[]
): TinaScheduleCScenarioProfile {
  const scopedFacts = draft.sourceFacts.filter(
    (fact) => !sourceDocumentIds || sourceDocumentIds.includes(fact.sourceDocumentId)
  );
  const scopedDocumentIds = sourceDocumentIds ?? unique(scopedFacts.map((fact) => fact.sourceDocumentId));
  const transactionGroups = collectTinaAnalyzedTransactionGroups(draft, scopedDocumentIds);

  const signals = SCENARIO_DEFINITIONS.flatMap((definition): TinaScheduleCScenarioSignal[] => {
    const factEvidence = scopedFacts.filter((fact) => definition.labels.includes(fact.label));
    const groupEvidence = transactionGroups.filter((group) =>
      definition.transactionClassifications.includes(group.classification)
    );
    const evidence = unique([
      ...factEvidence.map((fact) => fact.value),
      ...groupEvidence.map((group) => group.rawValue),
    ]);

    if (evidence.length === 0) return [];

    return [
      {
        tag: definition.tag,
        title: definition.title,
        summary: summarizeEvidence(
          evidence,
          `${definition.title} is present in the current Schedule C file.`
        ),
        evidence,
        sourceDocumentIds: unique([
          ...factEvidence.map((fact) => fact.sourceDocumentId),
          ...groupEvidence.map((group) => group.sourceDocumentId),
        ]),
        sourceFactIds: unique([
          ...factEvidence.map((fact) => fact.id),
          ...groupEvidence.map((group) => group.factId),
        ]),
        adjustmentKinds: definition.adjustmentKinds,
      },
    ];
  });

  const tags = unique(signals.map((signal) => signal.tag)).sort();
  const summary =
    signals.length === 0
      ? "Tina does not see any specialized Schedule C scenario families in this scope yet."
      : `Tina sees ${signals.length} active Schedule C scenario family${
          signals.length === 1 ? "" : "ies"
        }: ${signals.map((signal) => signal.title.toLowerCase()).join(", ")}.`;

  return {
    tags,
    signals,
    summary,
  };
}

export function findTinaScenarioSignalsForDocuments(
  draft: TinaWorkspaceDraft,
  sourceDocumentIds: string[]
): TinaScheduleCScenarioSignal[] {
  return buildTinaScheduleCScenarioProfile(draft, sourceDocumentIds).signals;
}

export function buildTinaScenarioCohortTrustMap(
  draft: TinaWorkspaceDraft
): Map<TinaReviewerOutcomeCaseTag, TinaReviewerAcceptanceTrustLevel> {
  const trustMap = new Map<TinaReviewerOutcomeCaseTag, TinaReviewerAcceptanceTrustLevel>();

  SCENARIO_DEFINITIONS.forEach((definition) => {
    const outcomes = draft.reviewerOutcomeMemory.outcomes.filter((outcome) =>
      outcome.caseTags.includes(definition.tag)
    );

    if (outcomes.length === 0) {
      trustMap.set(definition.tag, "insufficient_history");
      return;
    }

    const acceptedCount = outcomes.filter((outcome) => outcome.verdict === "accepted").length;
    const revisedCount = outcomes.filter((outcome) => outcome.verdict === "revised").length;
    const rejectedCount = outcomes.filter((outcome) => outcome.verdict === "rejected").length;

    let trustLevel: TinaReviewerAcceptanceTrustLevel = "mixed";
    if (
      rejectedCount > 0 ||
      (outcomes.length >= 3 && revisedCount + rejectedCount >= acceptedCount)
    ) {
      trustLevel = "fragile";
    } else if (outcomes.length >= 4 && rejectedCount === 0 && revisedCount <= 1) {
      trustLevel = "strong";
    }

    trustMap.set(definition.tag, trustLevel);
  });

  return trustMap;
}
