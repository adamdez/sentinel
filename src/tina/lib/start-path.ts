import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import type {
  TinaBusinessTaxProfile,
  TinaDocumentFactConfidence,
  TinaFilingLaneId,
  TinaSourceFact,
  TinaStartPathAssessment,
  TinaTaxElection,
  TinaWorkspaceDraft,
} from "@/tina/types";

export function normalizeTinaComparisonValue(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function includesTinaNeedle(haystack: string, needle: string): boolean {
  return normalizeTinaComparisonValue(haystack).includes(
    normalizeTinaComparisonValue(needle)
  );
}

export function findTinaFactsByLabel(
  sourceFacts: TinaSourceFact[],
  label: string
): TinaSourceFact[] {
  const normalizedLabel = normalizeTinaComparisonValue(label);
  return sourceFacts.filter(
    (fact) => normalizeTinaComparisonValue(fact.label) === normalizedLabel
  );
}

export function inferTinaReturnTypeHintLane(value: string): TinaFilingLaneId | null {
  if (
    includesTinaNeedle(value, "1120 s") ||
    includesTinaNeedle(value, "1120-s") ||
    includesTinaNeedle(value, "s corp") ||
    includesTinaNeedle(value, "s-corp")
  ) {
    return "1120_s";
  }

  if (
    includesTinaNeedle(value, "1120") ||
    includesTinaNeedle(value, "c corp") ||
    includesTinaNeedle(value, "c-corp")
  ) {
    return "1120";
  }

  if (
    includesTinaNeedle(value, "1065") ||
    includesTinaNeedle(value, "partnership") ||
    includesTinaNeedle(value, "multi member")
  ) {
    return "1065";
  }

  if (
    includesTinaNeedle(value, "schedule c") ||
    includesTinaNeedle(value, "1040") ||
    includesTinaNeedle(value, "sole prop") ||
    includesTinaNeedle(value, "single member") ||
    includesTinaNeedle(value, "disregarded")
  ) {
    return "schedule_c_single_member_llc";
  }

  return null;
}

export function describeTinaFilingLane(laneId: TinaFilingLaneId): string {
  switch (laneId) {
    case "schedule_c_single_member_llc":
      return "Schedule C / single-member LLC";
    case "1120_s":
      return "1120-S / S-corp";
    case "1120":
      return "1120 / C-corp";
    case "1065":
      return "1065 / partnership";
    default:
      return "unknown lane";
  }
}

export function formatTinaFilingLaneList(lanes: TinaFilingLaneId[]): string {
  return lanes.map((lane) => describeTinaFilingLane(lane)).join(", ");
}

export function describeTinaOwnerCount(ownerCount: number | null): string {
  if (ownerCount === null) return "Owner count not confirmed yet";
  return `${ownerCount} owner${ownerCount === 1 ? "" : "s"}`;
}

export function describeTinaTaxElection(election: TinaTaxElection): string {
  switch (election) {
    case "default":
      return "Default federal tax classification";
    case "s_corp":
      return "S-corp election indicated";
    case "c_corp":
      return "C-corp election indicated";
    default:
      return "Election status not confirmed yet";
  }
}

export function buildTinaOwnershipRiskLines(
  profile: TinaBusinessTaxProfile
): string[] {
  const lines = [
    describeTinaOwnerCount(profile.ownerCount),
    describeTinaTaxElection(profile.taxElection),
  ];

  if (profile.ownershipChangedDuringYear) {
    lines.push("Ownership changed during the tax year");
  }

  if (profile.hasOwnerBuyoutOrRedemption) {
    lines.push("Owner buyout or redemption indicated");
  }

  if (profile.hasFormerOwnerPayments) {
    lines.push("Payments to a former owner indicated");
  }

  if (profile.spouseCommunityPropertyTreatment === "confirmed") {
    lines.push("Possible spouse/community-property exception flagged");
  }

  return lines;
}

export function tinaNeedsOwnershipSupport(profile: TinaBusinessTaxProfile): boolean {
  return (
    profile.ownerCount !== null ||
    profile.ownershipChangedDuringYear ||
    profile.hasOwnerBuyoutOrRedemption ||
    profile.hasFormerOwnerPayments ||
    profile.entityType === "single_member_llc" ||
    profile.entityType === "multi_member_llc" ||
    profile.entityType === "partnership"
  );
}

export function tinaOwnershipSupportIsRequired(
  profile: TinaBusinessTaxProfile
): boolean {
  return (
    profile.ownershipChangedDuringYear ||
    profile.hasOwnerBuyoutOrRedemption ||
    profile.hasFormerOwnerPayments ||
    (profile.ownerCount !== null && profile.ownerCount > 1)
  );
}

export function buildTinaOwnershipSupportReason(
  profile: TinaBusinessTaxProfile
): string {
  if (
    profile.ownershipChangedDuringYear ||
    profile.hasOwnerBuyoutOrRedemption ||
    profile.hasFormerOwnerPayments
  ) {
    return "Tina needs the ownership timeline, operating agreement changes, and any buyout or former-owner payment support before she can trust the return path.";
  }

  if (profile.ownerCount !== null && profile.ownerCount > 1) {
    return "Tina needs owner names, ownership split, and entity papers before she can trust a multi-owner starting path.";
  }

  return "Tina needs entity and ownership proof so she can trust who the tax owner is and whether this stays in the Schedule C lane.";
}

export function tinaNeedsEntityElectionSupport(
  profile: TinaBusinessTaxProfile
): boolean {
  return profile.taxElection === "s_corp" || profile.taxElection === "c_corp";
}

function confidenceRank(confidence: TinaDocumentFactConfidence): number {
  switch (confidence) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

function pickStrongestTinaFact(facts: TinaSourceFact[]): TinaSourceFact | null {
  if (facts.length === 0) return null;
  return facts.reduce((best, candidate) =>
    confidenceRank(candidate.confidence) > confidenceRank(best.confidence)
      ? candidate
      : best
  );
}

export function buildTinaStartPathAssessment(
  draft: TinaWorkspaceDraft
): TinaStartPathAssessment {
  const recommendation = recommendTinaFilingLane(draft.profile);
  const returnTypeHintFacts = findTinaFactsByLabel(draft.sourceFacts, "Return type hint");
  const hintedLanes = Array.from(
    new Set(
      returnTypeHintFacts
        .map((fact) => inferTinaReturnTypeHintLane(fact.value))
        .filter((lane): lane is TinaFilingLaneId => lane !== null)
    )
  );
  const hasMixedHintedLanes = hintedLanes.length > 1;
  const singleHintedLane = hintedLanes.length === 1 ? hintedLanes[0] : null;
  const hasHintVsOrganizerConflict =
    singleHintedLane !== null &&
    recommendation.laneId !== "unknown" &&
    singleHintedLane !== recommendation.laneId;
  const ownershipChangeClue = pickStrongestTinaFact(
    findTinaFactsByLabel(draft.sourceFacts, "Ownership change clue")
  );
  const formerOwnerPaymentClue = pickStrongestTinaFact(
    findTinaFactsByLabel(draft.sourceFacts, "Former owner payment clue")
  );
  const ownerCount = draft.profile.ownerCount;
  const ownershipMismatchWithSingleOwnerLane =
    ownerCount !== null &&
    ownerCount > 1 &&
    (draft.profile.entityType === "sole_prop" ||
      draft.profile.entityType === "single_member_llc") &&
    draft.profile.spouseCommunityPropertyTreatment !== "confirmed";

  return {
    recommendation,
    returnTypeHintFacts,
    hintedLanes,
    hasMixedHintedLanes,
    singleHintedLane,
    hasHintVsOrganizerConflict,
    ownershipChangeClue,
    formerOwnerPaymentClue,
    ownershipMismatchWithSingleOwnerLane,
  };
}
