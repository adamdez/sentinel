import type {
  TinaBusinessTaxProfile,
  TinaEntityType,
  TinaLlcCommunityPropertyStatus,
  TinaLlcFederalTaxTreatment,
  TinaSourceFact,
} from "@/tina/types";

const COMMUNITY_PROPERTY_STATES = new Set(["AZ", "CA", "ID", "LA", "NV", "NM", "TX", "WA", "WI"]);
const LLC_TREATMENT_FACT_LABELS = new Set([
  "LLC tax treatment clue",
  "LLC election clue",
  "Return type hint",
]);
const LLC_COMMUNITY_PROPERTY_FACT_LABELS = new Set(["Community property clue"]);
const FACT_CONFIDENCE_WEIGHT = {
  high: 0,
  medium: 1,
  low: 2,
} as const;

function normalizeForComparison(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function includesNeedle(haystack: string, needle: string): boolean {
  const normalizedHaystack = ` ${normalizeForComparison(haystack)} `;
  const normalizedNeedle = ` ${normalizeForComparison(needle)} `;
  return normalizedHaystack.includes(normalizedNeedle);
}

function compareSourceFactPriority(left: TinaSourceFact, right: TinaSourceFact): number {
  const labelDelta =
    (LLC_TREATMENT_FACT_LABELS.has(left.label) && left.label !== "Return type hint" ? 0 : 1) -
    (LLC_TREATMENT_FACT_LABELS.has(right.label) && right.label !== "Return type hint" ? 0 : 1);
  if (labelDelta !== 0) return labelDelta;

  const confidenceDelta =
    FACT_CONFIDENCE_WEIGHT[left.confidence] - FACT_CONFIDENCE_WEIGHT[right.confidence];
  if (confidenceDelta !== 0) return confidenceDelta;

  const leftCapturedAt = left.capturedAt ? Date.parse(left.capturedAt) : 0;
  const rightCapturedAt = right.capturedAt ? Date.parse(right.capturedAt) : 0;
  return rightCapturedAt - leftCapturedAt;
}

export function isTinaLlcEntityType(entityType: TinaEntityType): boolean {
  return entityType === "single_member_llc" || entityType === "multi_member_llc";
}

export function isTinaCommunityPropertyState(state: string): boolean {
  return COMMUNITY_PROPERTY_STATES.has(state.trim().toUpperCase());
}

export function resolveTinaLlcFederalTaxTreatmentFromFactValue(
  value: string
): Exclude<TinaLlcFederalTaxTreatment, "default" | "unsure"> | null {
  if (!value.trim()) return null;

  if (
    includesNeedle(value, "1120-s") ||
    includesNeedle(value, "s corp") ||
    includesNeedle(value, "s-corp") ||
    includesNeedle(value, "s corporation") ||
    includesNeedle(value, "form 2553")
  ) {
    return "s_corp_return";
  }

  if (
    includesNeedle(value, "form 1120") ||
    includesNeedle(value, "c corp") ||
    includesNeedle(value, "c-corp") ||
    includesNeedle(value, "c corporation") ||
    includesNeedle(value, "corporation return treatment") ||
    includesNeedle(value, "corporation treatment") ||
    includesNeedle(value, "corporate return treatment") ||
    includesNeedle(value, "corporate treatment") ||
    (includesNeedle(value, "form 8832") &&
      (includesNeedle(value, "corporation") || includesNeedle(value, "corporate")))
  ) {
    return "c_corp_return";
  }

  if (
    includesNeedle(value, "form 1065") ||
    includesNeedle(value, "partnership return") ||
    includesNeedle(value, "partnership treatment") ||
    includesNeedle(value, "k-1") ||
    includesNeedle(value, "schedule k-1") ||
    includesNeedle(value, "partnership")
  ) {
    return "partnership_return";
  }

  if (
    includesNeedle(value, "schedule c") ||
    includesNeedle(value, "owner return") ||
    includesNeedle(value, "reported on the owner's return") ||
    includesNeedle(value, "reported on the owners return") ||
    includesNeedle(value, "disregarded entity") ||
    includesNeedle(value, "sole proprietorship")
  ) {
    return "owner_return";
  }

  return null;
}

export function findTinaLlcTreatmentSourceFact(sourceFacts: TinaSourceFact[]): TinaSourceFact | null {
  const matches = sourceFacts
    .filter((fact) => LLC_TREATMENT_FACT_LABELS.has(fact.label))
    .filter((fact) => resolveTinaLlcFederalTaxTreatmentFromFactValue(fact.value) !== null)
    .sort(compareSourceFactPriority);

  return matches[0] ?? null;
}

export function resolveTinaLlcFederalTaxTreatmentFromSourceFacts(
  sourceFacts: TinaSourceFact[]
): Exclude<TinaLlcFederalTaxTreatment, "default" | "unsure"> | null {
  const fact = findTinaLlcTreatmentSourceFact(sourceFacts);
  return fact ? resolveTinaLlcFederalTaxTreatmentFromFactValue(fact.value) : null;
}

export function resolveTinaLlcCommunityPropertyStatusFromFactValue(
  value: string
): Exclude<TinaLlcCommunityPropertyStatus, "not_applicable" | "unsure"> | null {
  if (!value.trim()) return null;

  if (
    includesNeedle(value, "not community property") ||
    includesNeedle(value, "not a community property") ||
    includesNeedle(value, "not spouse owned") ||
    includesNeedle(value, "not spouse-owned") ||
    includesNeedle(value, "not only spouses")
  ) {
    return "no";
  }

  if (
    includesNeedle(value, "community property") &&
    (includesNeedle(value, "spouse") ||
      includesNeedle(value, "spouses") ||
      includesNeedle(value, "married couple") ||
      includesNeedle(value, "husband and wife"))
  ) {
    return "yes";
  }

  return null;
}

export function findTinaLlcCommunityPropertySourceFact(
  sourceFacts: TinaSourceFact[]
): TinaSourceFact | null {
  const matches = sourceFacts
    .filter((fact) => LLC_COMMUNITY_PROPERTY_FACT_LABELS.has(fact.label))
    .filter((fact) => resolveTinaLlcCommunityPropertyStatusFromFactValue(fact.value) !== null)
    .sort((left, right) => {
      const confidenceDelta =
        FACT_CONFIDENCE_WEIGHT[left.confidence] - FACT_CONFIDENCE_WEIGHT[right.confidence];
      if (confidenceDelta !== 0) return confidenceDelta;

      const leftCapturedAt = left.capturedAt ? Date.parse(left.capturedAt) : 0;
      const rightCapturedAt = right.capturedAt ? Date.parse(right.capturedAt) : 0;
      return rightCapturedAt - leftCapturedAt;
    });

  return matches[0] ?? null;
}

export function resolveTinaLlcCommunityPropertyStatusFromSourceFacts(
  sourceFacts: TinaSourceFact[]
): Exclude<TinaLlcCommunityPropertyStatus, "not_applicable" | "unsure"> | null {
  const fact = findTinaLlcCommunityPropertySourceFact(sourceFacts);
  return fact ? resolveTinaLlcCommunityPropertyStatusFromFactValue(fact.value) : null;
}

export function resolveTinaLlcFederalTaxTreatment(
  profile: TinaBusinessTaxProfile,
  sourceFacts: TinaSourceFact[] = []
): Exclude<TinaLlcFederalTaxTreatment, "default" | "unsure"> | "unsure" {
  if (profile.llcFederalTaxTreatment !== "default") {
    if (profile.llcFederalTaxTreatment !== "unsure") {
      return profile.llcFederalTaxTreatment;
    }
  }

  const sourceFactTreatment = resolveTinaLlcFederalTaxTreatmentFromSourceFacts(sourceFacts);
  if (sourceFactTreatment) {
    return sourceFactTreatment;
  }

  if (profile.llcFederalTaxTreatment === "unsure") {
    return "unsure";
  }

  return profile.entityType === "multi_member_llc"
    ? "partnership_return"
    : "owner_return";
}

export function resolveTinaLlcCommunityPropertyStatus(
  profile: TinaBusinessTaxProfile,
  sourceFacts: TinaSourceFact[] = []
): TinaLlcCommunityPropertyStatus {
  if (profile.llcCommunityPropertyStatus === "yes" || profile.llcCommunityPropertyStatus === "no") {
    return profile.llcCommunityPropertyStatus;
  }

  const sourceFactStatus = resolveTinaLlcCommunityPropertyStatusFromSourceFacts(sourceFacts);
  if (sourceFactStatus) {
    return sourceFactStatus;
  }

  return profile.llcCommunityPropertyStatus;
}

export function describeTinaLlcFederalTaxTreatment(
  profile: TinaBusinessTaxProfile,
  sourceFacts: TinaSourceFact[] = []
): string | null {
  if (!isTinaLlcEntityType(profile.entityType)) return null;

  const resolved = resolveTinaLlcFederalTaxTreatment(profile, sourceFacts);
  const state = profile.formationState.trim().toUpperCase() || "the formation state";
  const communityPropertyStatus = resolveTinaLlcCommunityPropertyStatus(profile, sourceFacts);

  switch (resolved) {
    case "owner_return":
      if (profile.entityType === "multi_member_llc") {
        return communityPropertyStatus === "yes"
          ? `Owner return treatment for a married couple in a community-property state (${state}).`
          : "Owner return treatment instead of a separate LLC return.";
      }
      return "Owner return treatment (default single-member LLC path).";
    case "partnership_return":
      return "Partnership return treatment.";
    case "s_corp_return":
      return "S corporation return treatment.";
    case "c_corp_return":
      return "Corporation return treatment.";
    default:
      return "LLC federal tax treatment still needs confirmation.";
  }
}
