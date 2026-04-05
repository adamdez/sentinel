import type {
  TinaSourceFact,
  TinaTreatmentJudgmentItem,
  TinaTreatmentJudgmentSnapshot,
  TinaWorkspaceDraft,
} from "@/tina/types";
import {
  buildTinaTreatmentAnalogicalProfileFromDraft,
  buildTinaTreatmentAnalogicalResolutions,
  TINA_TREATMENT_PATTERN_LIBRARY,
} from "@/tina/lib/treatment-proof-resolver";

type TinaPattern = string | RegExp;

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function hasPattern(text: string, patterns: TinaPattern[]): boolean {
  return patterns.some((pattern) => {
    if (typeof pattern !== "string") {
      return pattern.test(text);
    }

    const normalizedPattern = normalizeText(pattern);
    return (
      text === normalizedPattern ||
      text.startsWith(`${normalizedPattern} `) ||
      text.endsWith(` ${normalizedPattern}`) ||
      text.includes(` ${normalizedPattern} `)
    );
  });
}

function buildItem(args: TinaTreatmentJudgmentItem): TinaTreatmentJudgmentItem {
  return {
    ...args,
    requiredProof: unique(args.requiredProof),
    alternativeTreatments: unique(args.alternativeTreatments),
    authorityWorkIdeaIds: unique(args.authorityWorkIdeaIds),
    relatedFactIds: unique(args.relatedFactIds),
    relatedDocumentIds: unique(args.relatedDocumentIds),
  };
}

function patternsForJudgmentItem(itemId: string): TinaPattern[] {
  switch (itemId) {
    case "mixed-use-treatment":
      return TINA_TREATMENT_PATTERN_LIBRARY.mixed_use;
    case "vehicle-use-treatment":
      return [
        ...TINA_TREATMENT_PATTERN_LIBRARY.vehicle_use,
        ...TINA_TREATMENT_PATTERN_LIBRARY.mixed_use,
      ];
    case "home-office-treatment":
      return TINA_TREATMENT_PATTERN_LIBRARY.home_office;
    case "depreciation-treatment":
      return TINA_TREATMENT_PATTERN_LIBRARY.fixed_assets;
    case "inventory-treatment":
      return TINA_TREATMENT_PATTERN_LIBRARY.inventory;
    case "worker-classification-treatment":
      return [
        ...TINA_TREATMENT_PATTERN_LIBRARY.worker_classification,
        ...TINA_TREATMENT_PATTERN_LIBRARY.payroll,
      ];
    case "payroll-treatment":
      return TINA_TREATMENT_PATTERN_LIBRARY.payroll;
    case "contractor-treatment":
    case "information-return-treatment":
      return [
        ...TINA_TREATMENT_PATTERN_LIBRARY.info_returns,
        ...TINA_TREATMENT_PATTERN_LIBRARY.worker_classification,
      ];
    case "reasonable-comp-treatment":
      return [
        ...TINA_TREATMENT_PATTERN_LIBRARY.reasonable_comp,
        ...TINA_TREATMENT_PATTERN_LIBRARY.owner_flow,
      ];
    case "owner-flow-treatment":
      return TINA_TREATMENT_PATTERN_LIBRARY.owner_flow;
    case "basis-capital-treatment":
      return TINA_TREATMENT_PATTERN_LIBRARY.basis_capital;
    case "entity-boundary-treatment":
      return TINA_TREATMENT_PATTERN_LIBRARY.entity_boundary;
    case "sales-tax-treatment":
      return TINA_TREATMENT_PATTERN_LIBRARY.sales_tax;
    case "debt-forgiveness-treatment":
      return TINA_TREATMENT_PATTERN_LIBRARY.debt_forgiveness;
    case "filing-continuity-treatment":
      return TINA_TREATMENT_PATTERN_LIBRARY.filing_continuity;
    default:
      return [];
  }
}

function collectRelatedFacts(draft: TinaWorkspaceDraft, itemId: string): TinaSourceFact[] {
  const patterns = patternsForJudgmentItem(itemId);
  if (patterns.length === 0) {
    return [];
  }

  return draft.sourceFacts.filter((fact) =>
    hasPattern(normalizeText(`${fact.label} ${fact.value}`), patterns)
  );
}

function collectRelatedDocuments(
  draft: TinaWorkspaceDraft,
  itemId: string,
  relatedFacts: TinaSourceFact[]
): string[] {
  const patterns = patternsForJudgmentItem(itemId);
  const factDocumentIds = relatedFacts.map((fact) => fact.sourceDocumentId);
  const documentMatches = draft.documents
    .filter((document) =>
      hasPattern(normalizeText(`${document.name} ${document.requestLabel ?? ""}`), patterns)
    )
    .map((document) => document.id);
  const readingMatches = draft.documentReadings
    .filter((reading) =>
      hasPattern(
        normalizeText(
          [reading.summary, reading.nextStep, ...reading.detailLines, ...reading.facts.map((fact) => `${fact.label} ${fact.value}`)].join(" ")
        ),
        patterns
      )
    )
    .map((reading) => reading.documentId);

  return unique([...factDocumentIds, ...documentMatches, ...readingMatches]);
}

export function buildTinaTreatmentJudgment(
  draft: TinaWorkspaceDraft
): TinaTreatmentJudgmentSnapshot {
  const items = buildTinaTreatmentAnalogicalResolutions(
    buildTinaTreatmentAnalogicalProfileFromDraft(draft)
  ).map((resolution) => {
    const relatedFacts = collectRelatedFacts(draft, resolution.id);
    return buildItem({
      ...resolution,
      relatedFactIds: relatedFacts.map((fact) => fact.id),
      relatedDocumentIds: collectRelatedDocuments(draft, resolution.id, relatedFacts),
    });
  });

  const uniqueItems = items.filter(
    (item, index) => items.findIndex((candidate) => candidate.id === item.id) === index
  );
  const useCount = uniqueItems.filter((item) => item.taxPositionBucket === "use").length;
  const reviewCount = uniqueItems.filter((item) => item.taxPositionBucket === "review").length;
  const rejectCount = uniqueItems.filter((item) => item.taxPositionBucket === "reject").length;
  const cleanupFirstCount = uniqueItems.filter(
    (item) => item.cleanupDependency === "cleanup_first"
  ).length;

  let summary = "Tina has not formed treatment judgments for messy tax items yet.";
  let nextStep =
    "Keep building evidence and authority so Tina can classify more treatment choices with confidence.";

  if (uniqueItems.length > 0) {
    summary = `Tina classified ${uniqueItems.length} treatment judgment item${
      uniqueItems.length === 1 ? "" : "s"
    }: ${useCount} use, ${reviewCount} review, ${rejectCount} reject, ${cleanupFirstCount} cleanup-first.`;
    nextStep =
      reviewCount > 0 || rejectCount > 0
        ? "Clear the cleanup-first, review, and reject treatment calls before letting messy items affect final output."
        : "The current treatment judgments are strong enough to carry into reviewer-final handling.";
  }

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    summary,
    nextStep,
    items: uniqueItems,
  };
}
