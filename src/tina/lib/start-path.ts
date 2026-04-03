import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import type {
  TinaFilingLaneRecommendation,
  TinaFilingLaneId,
  TinaSourceFact,
  TinaStartPathProofRequirement,
  TinaStartPathAssessment,
  TinaWorkspaceDraft,
} from "@/tina/types";

function normalizeForComparison(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function includesNeedle(haystack: string, needle: string): boolean {
  return normalizeForComparison(haystack).includes(normalizeForComparison(needle));
}

function findFactsByLabel(sourceFacts: TinaSourceFact[], label: string): TinaSourceFact[] {
  return sourceFacts.filter(
    (fact) => normalizeForComparison(fact.label) === normalizeForComparison(label)
  );
}

function confidenceRank(confidence: TinaSourceFact["confidence"]): number {
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

function pickStrongestFact(facts: TinaSourceFact[]): TinaSourceFact | null {
  if (facts.length === 0) return null;
  return facts.reduce((best, candidate) =>
    confidenceRank(candidate.confidence) > confidenceRank(best.confidence) ? candidate : best
  );
}

function allFactsPointToLane(
  facts: TinaSourceFact[],
  laneId: TinaFilingLaneId
): boolean {
  return facts.length > 0 && facts.every((fact) => inferTinaReturnTypeHintLane(fact.value) === laneId);
}

function pushUnique(target: string[], values: string[]) {
  values.forEach((value) => {
    if (!target.includes(value)) {
      target.push(value);
    }
  });
}

function mergeUniqueStrings(...lists: string[][]): string[] {
  const merged: string[] = [];
  lists.forEach((list) => pushUnique(merged, list));
  return merged;
}

function buildSyntheticFact(args: {
  id: string;
  sourceDocumentId: string;
  label: string;
  value: string;
  confidence: TinaSourceFact["confidence"];
  capturedAt: string | null;
}): TinaSourceFact {
  return {
    id: args.id,
    sourceDocumentId: args.sourceDocumentId,
    label: args.label,
    value: args.value,
    confidence: args.confidence,
    capturedAt: args.capturedAt,
  };
}

function getDocumentEvidenceTexts(draft: TinaWorkspaceDraft): Array<{
  sourceDocumentId: string;
  text: string;
  capturedAt: string | null;
}> {
  const readingByDocumentId = new Map(
    draft.documentReadings.map((reading) => [reading.documentId, reading])
  );

  return draft.documents.map((document) => {
    const reading = readingByDocumentId.get(document.id);
    const textParts = [
      document.name,
      document.requestLabel ?? "",
      reading?.summary ?? "",
      reading?.nextStep ?? "",
      ...(reading?.detailLines ?? []),
      ...((reading?.facts ?? []).flatMap((fact) => [fact.label, fact.value])),
    ].filter((value) => value.trim().length > 0);

    return {
      sourceDocumentId: document.id,
      text: textParts.join(" "),
      capturedAt: reading?.lastReadAt ?? document.uploadedAt,
    };
  });
}

function findDocumentEvidenceTexts(
  draft: TinaWorkspaceDraft,
  matcher: (normalizedText: string) => boolean
): Array<{ sourceDocumentId: string; capturedAt: string | null; text: string }> {
  return getDocumentEvidenceTexts(draft).filter((entry) =>
    matcher(normalizeForComparison(entry.text))
  );
}

function buildDerivedReturnTypeHintFacts(draft: TinaWorkspaceDraft): TinaSourceFact[] {
  const facts = getDocumentEvidenceTexts(draft)
    .map((entry) => {
      const laneId = inferTinaReturnTypeHintLane(entry.text);
      if (!laneId) return null;

      return buildSyntheticFact({
        id: `derived-return-hint-${entry.sourceDocumentId}-${laneId}`,
        sourceDocumentId: entry.sourceDocumentId,
        label: "Return type hint",
        value: entry.text,
        confidence:
          includesNeedle(entry.text, "1120-s") ||
          includesNeedle(entry.text, "1120s") ||
          includesNeedle(entry.text, "1065") ||
          includesNeedle(entry.text, "form 2553") ||
          includesNeedle(entry.text, "form 8832") ||
          includesNeedle(entry.text, "schedule c")
            ? "high"
            : "medium",
        capturedAt: entry.capturedAt,
      });
    })
    .filter((fact): fact is TinaSourceFact => fact !== null);

  return facts.filter(
    (fact, index, values) =>
      values.findIndex(
        (candidate) =>
          candidate.sourceDocumentId === fact.sourceDocumentId && candidate.label === fact.label
      ) === index
  );
}

function buildDerivedClueFacts(
  draft: TinaWorkspaceDraft,
  config: {
    idPrefix: string;
    label: string;
    matcher: (normalizedText: string) => boolean;
    value: string;
    confidence?: TinaSourceFact["confidence"];
  }
): TinaSourceFact[] {
  return findDocumentEvidenceTexts(draft, config.matcher).map((entry) =>
    buildSyntheticFact({
      id: `${config.idPrefix}-${entry.sourceDocumentId}`,
      sourceDocumentId: entry.sourceDocumentId,
      label: config.label,
      value: config.value,
      confidence: config.confidence ?? "medium",
      capturedAt: entry.capturedAt,
    })
  );
}

function hasDocumentForRequest(draft: TinaWorkspaceDraft, requestId: string): boolean {
  return draft.documents.some((document) => document.requestId === requestId);
}

function hasOwnershipProof(draft: TinaWorkspaceDraft): boolean {
  if (
    draft.documents.some(
      (document) =>
        document.requestId === "ownership-agreement" ||
        document.requestId === "ownership-cap-table" ||
        document.requestId === "ownership-transition"
    )
  ) {
    return true;
  }

  return findDocumentEvidenceTexts(
    draft,
    (text) =>
      text.includes("operating agreement") ||
      text.includes("ownership breakdown") ||
      text.includes("cap table") ||
      text.includes("ownership schedule") ||
      text.includes("member ledger") ||
      text.includes("buyout agreement") ||
      text.includes("redemption agreement") ||
      text.includes("purchase agreement")
  ).length > 0;
}

function hasElectionProof(draft: TinaWorkspaceDraft): boolean {
  if (
    draft.documents.some(
      (document) =>
        document.requestId === "entity-election" || document.requestId === "formation-papers"
    )
  ) {
    return true;
  }

  return findDocumentEvidenceTexts(
    draft,
    (text) =>
      text.includes("form 2553") ||
      text.includes("2553 election") ||
      text.includes("form 8832") ||
      text.includes("entity classification election") ||
      text.includes("taxed as a corporation") ||
      text.includes("s corporation election")
  ).length > 0;
}

function buildStartPathProofRequirement(args: {
  id: TinaStartPathProofRequirement["id"];
  label: string;
  reason: string;
  status: TinaStartPathProofRequirement["status"];
  priority?: TinaStartPathProofRequirement["priority"];
  relatedLaneIds?: TinaFilingLaneId[];
  relatedFactIds?: string[];
  relatedDocumentIds?: string[];
}): TinaStartPathProofRequirement {
  return {
    id: args.id,
    label: args.label,
    reason: args.reason,
    priority: args.priority ?? "required",
    status: args.status,
    relatedLaneIds: args.relatedLaneIds ?? [],
    relatedFactIds: args.relatedFactIds ?? [],
    relatedDocumentIds: args.relatedDocumentIds ?? [],
  };
}

export function inferTinaReturnTypeHintLane(value: string): TinaFilingLaneId | null {
  if (includesNeedle(value, "1120 c") || includesNeedle(value, "c corp") || includesNeedle(value, "c-corp")) {
    return "1120";
  }

  if (
    includesNeedle(value, "1120-s") ||
    includesNeedle(value, "1120s") ||
    includesNeedle(value, "s corp") ||
    includesNeedle(value, "s-corp")
  ) {
    return "1120_s";
  }

  if (
    includesNeedle(value, "1065") ||
    includesNeedle(value, "partnership") ||
    includesNeedle(value, "multi member")
  ) {
    return "1065";
  }

  if (
    includesNeedle(value, "schedule c") ||
    includesNeedle(value, "1040") ||
    includesNeedle(value, "sole prop") ||
    includesNeedle(value, "single member") ||
    includesNeedle(value, "disregarded")
  ) {
    return "schedule_c_single_member_llc";
  }

  return null;
}

export function describeTinaLane(laneId: TinaFilingLaneId): string {
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

export function formatTinaLaneList(lanes: TinaFilingLaneId[]): string {
  return lanes.map((lane) => describeTinaLane(lane)).join(", ");
}

function buildHintLaneRecommendation(
  laneId: TinaFilingLaneId,
  baseRecommendation: TinaFilingLaneRecommendation
): TinaFilingLaneRecommendation {
  if (laneId === "unknown") {
    return baseRecommendation;
  }

  switch (laneId) {
    case "schedule_c_single_member_llc":
      return {
        laneId,
        title: "Schedule C / Single-Member LLC",
        support: "supported",
        summary:
          "Source papers point toward a Schedule C or disregarded single-owner path, but Tina still keeps the route under evidence-aware review.",
        reasons: mergeUniqueStrings(baseRecommendation.reasons, [
          "One clean source-paper hint points to a Schedule C or disregarded single-owner return path.",
        ]),
        blockers: [...baseRecommendation.blockers],
      };
    case "1120_s":
      return {
        laneId,
        title: "1120-S / S-Corp",
        support: "future",
        summary:
          "Source papers point toward an 1120-S or S-corp path, but Tina does not finish that return type yet.",
        reasons: mergeUniqueStrings(baseRecommendation.reasons, [
          "One clean source-paper hint points to an S-corp return path.",
        ]),
        blockers: [...baseRecommendation.blockers],
      };
    case "1120":
      return {
        laneId,
        title: "1120 / C-Corp",
        support: "future",
        summary:
          "Source papers point toward an 1120 or C-corp path, but Tina does not finish that return type yet.",
        reasons: mergeUniqueStrings(baseRecommendation.reasons, [
          "One clean source-paper hint points to a C-corp return path.",
        ]),
        blockers: [...baseRecommendation.blockers],
      };
    case "1065":
      return {
        laneId,
        title: "1065 / Partnership",
        support: "future",
        summary:
          "Source papers point toward a 1065 or partnership path, but Tina does not finish that return type yet.",
        reasons: mergeUniqueStrings(baseRecommendation.reasons, [
          "One clean source-paper hint points to a partnership-style return path.",
        ]),
        blockers: [...baseRecommendation.blockers],
      };
    default:
      return baseRecommendation;
  }
}

function buildTinaStartPathProofRequirements(args: {
  draft: TinaWorkspaceDraft;
  recommendation: TinaFilingLaneRecommendation;
  multiOwnerClue: TinaSourceFact | null;
  communityPropertyClue: TinaSourceFact | null;
  ownershipChangeClue: TinaSourceFact | null;
  formerOwnerPaymentClue: TinaSourceFact | null;
}): TinaStartPathProofRequirement[] {
  const {
    draft,
    recommendation,
    multiOwnerClue,
    communityPropertyClue,
    ownershipChangeClue,
    formerOwnerPaymentClue,
  } = args;
  const requirements: TinaStartPathProofRequirement[] = [];
  const ownershipFactIds = [
    ...(multiOwnerClue ? [multiOwnerClue.id] : []),
    ...(ownershipChangeClue ? [ownershipChangeClue.id] : []),
    ...(formerOwnerPaymentClue ? [formerOwnerPaymentClue.id] : []),
  ];
  const ownershipDocumentIds = [
    ...(multiOwnerClue ? [multiOwnerClue.sourceDocumentId] : []),
    ...(ownershipChangeClue ? [ownershipChangeClue.sourceDocumentId] : []),
    ...(formerOwnerPaymentClue ? [formerOwnerPaymentClue.sourceDocumentId] : []),
  ];

  if (
    recommendation.laneId === "1065" ||
    (draft.profile.ownerCount !== null && draft.profile.ownerCount > 1) ||
    draft.profile.entityType === "multi_member_llc" ||
    draft.profile.entityType === "partnership" ||
    multiOwnerClue !== null
  ) {
    requirements.push(
      buildStartPathProofRequirement({
        id: "ownership-agreement",
        label: "Operating agreement or ownership breakdown",
        reason:
          "Tina needs the real ownership split, members, and economic arrangement before she can safely route or review a multi-owner LLC file.",
        status: hasOwnershipProof(draft) ? "covered" : "needed",
        relatedLaneIds: ["1065", recommendation.laneId].filter(
          (laneId, index, values): laneId is TinaFilingLaneId =>
            laneId !== "unknown" && values.indexOf(laneId) === index
        ),
        relatedFactIds: ownershipFactIds,
        relatedDocumentIds: ownershipDocumentIds,
      })
    );
  }

  if (
    recommendation.laneId === "1120_s" ||
    recommendation.laneId === "1120" ||
    draft.profile.taxElection === "s_corp" ||
    draft.profile.taxElection === "c_corp"
  ) {
    requirements.push(
      buildStartPathProofRequirement({
        id: "entity-election",
        label: "Entity election proof",
        reason:
          "Tina needs election proof like Form 2553, Form 8832, or prior-return evidence before trusting a corporate tax path.",
        status: hasElectionProof(draft) ? "covered" : "needed",
        relatedLaneIds: ["1120_s", "1120", recommendation.laneId].filter(
          (laneId, index, values): laneId is TinaFilingLaneId =>
            laneId !== "unknown" && values.indexOf(laneId) === index
        ),
      })
    );
  }

  if (
    draft.profile.ownershipChangedDuringYear ||
    draft.profile.hasOwnerBuyoutOrRedemption ||
    draft.profile.hasFormerOwnerPayments ||
    ownershipChangeClue !== null ||
    formerOwnerPaymentClue !== null
  ) {
    requirements.push(
      buildStartPathProofRequirement({
        id: "ownership-transition",
        label: "Ownership change or buyout papers",
        reason:
          "Tina needs transfer, buyout, redemption, or payout papers before she can safely classify ownership changes and former-owner payments.",
        status: hasOwnershipProof(draft) ? "covered" : "needed",
        relatedLaneIds:
          recommendation.laneId === "unknown" ? [] : [recommendation.laneId],
        relatedFactIds: ownershipFactIds,
        relatedDocumentIds: ownershipDocumentIds,
      })
    );
  }

  if (
    recommendation.laneId === "schedule_c_single_member_llc" &&
    (((draft.profile.ownerCount !== null && draft.profile.ownerCount > 1) || multiOwnerClue !== null) &&
      draft.profile.spouseCommunityPropertyTreatment !== "no")
  ) {
    requirements.push(
      buildStartPathProofRequirement({
        id: "community-property-proof",
        label: "Community-property support",
        reason:
          "Tina needs proof that the spouses-only community-property exception really applies before she can keep a multi-owner LLC near the Schedule C path.",
        status: hasDocumentForRequest(draft, "community-property-proof") ? "covered" : "needed",
        relatedLaneIds: ["schedule_c_single_member_llc"],
        relatedFactIds: [
          ...(multiOwnerClue ? [multiOwnerClue.id] : []),
          ...(communityPropertyClue ? [communityPropertyClue.id] : []),
        ],
        relatedDocumentIds: [
          ...(multiOwnerClue ? [multiOwnerClue.sourceDocumentId] : []),
          ...(communityPropertyClue ? [communityPropertyClue.sourceDocumentId] : []),
        ],
      })
    );
  }

  return requirements;
}

export function buildTinaStartPathAssessment(
  draft: TinaWorkspaceDraft
): TinaStartPathAssessment {
  const baseRecommendation = recommendTinaFilingLane(draft.profile);
  const derivedReturnTypeHintFacts = buildDerivedReturnTypeHintFacts(draft);
  const returnTypeHintFacts = [
    ...findFactsByLabel(draft.sourceFacts, "Return type hint"),
    ...derivedReturnTypeHintFacts,
  ].filter((fact): fact is TinaSourceFact => inferTinaReturnTypeHintLane(fact.value) !== null);
  const hintedLaneSet = new Set(
    returnTypeHintFacts
      .map((fact) => inferTinaReturnTypeHintLane(fact.value))
      .filter((lane): lane is TinaFilingLaneId => lane !== null)
  );
  const hintedLanes = Array.from(hintedLaneSet);
  const hasMixedHintedLanes = hintedLanes.length > 1;
  const singleHintedLane = hintedLanes.length === 1 ? hintedLanes[0] : null;
  const hasHintVsOrganizerConflict =
    singleHintedLane !== null &&
    baseRecommendation.laneId !== "unknown" &&
    singleHintedLane !== baseRecommendation.laneId;
  const strongestReturnHintFact = pickStrongestFact(returnTypeHintFacts);
  const canUseSingleHintAsReviewerOverride =
    singleHintedLane !== null &&
    allFactsPointToLane(returnTypeHintFacts, singleHintedLane) &&
    strongestReturnHintFact?.confidence === "high" &&
    returnTypeHintFacts.some((fact) =>
      draft.documents.some(
        (document) =>
          document.id === fact.sourceDocumentId &&
          (document.category === "prior_return" ||
            document.requestId === "entity-election" ||
            document.requestId === "prior-return")
      )
    );
  const ownershipChangeClue = pickStrongestFact([
    ...findFactsByLabel(draft.sourceFacts, "Ownership change clue"),
    ...buildDerivedClueFacts(draft, {
      idPrefix: "derived-ownership-change",
      label: "Ownership change clue",
      matcher: (text) =>
        text.includes("ownership change") ||
        text.includes("member transfer") ||
        text.includes("ownership transfer") ||
        text.includes("buyout") ||
        text.includes("redemption"),
      value: "This paper may show an ownership change, transfer, buyout, or redemption event.",
    }),
  ]);
  const formerOwnerPaymentClue = pickStrongestFact([
    ...findFactsByLabel(draft.sourceFacts, "Former owner payment clue"),
    ...buildDerivedClueFacts(draft, {
      idPrefix: "derived-former-owner-payment",
      label: "Former owner payment clue",
      matcher: (text) =>
        text.includes("former owner") ||
        text.includes("retiring partner") ||
        text.includes("retired partner") ||
        text.includes("buyout payment") ||
        text.includes("redemption payment") ||
        text.includes("payout to former owner"),
      value: "This paper may show payments to a former owner or retiring owner.",
    }),
  ]);
  const multiOwnerClue = pickStrongestFact([
    ...findFactsByLabel(draft.sourceFacts, "Multi-owner clue"),
    ...buildDerivedClueFacts(draft, {
      idPrefix: "derived-multi-owner",
      label: "Multi-owner clue",
      matcher: (text) =>
        text.includes("k 1") ||
        text.includes("schedule k 1") ||
        text.includes("partner capital") ||
        text.includes("capital account") ||
        text.includes("member percentage") ||
        text.includes("ownership percentage") ||
        text.includes("partners") ||
        text.includes("members") ||
        /\b\d{1,3}\s?\/\s?\d{1,3}\b/.test(text) ||
        /\b\d{1,3}\s?%\b/.test(text),
      value: "This paper may show more than one owner, partner, member, K-1, or ownership split.",
    }),
  ]);
  const communityPropertyClue = pickStrongestFact([
    ...findFactsByLabel(draft.sourceFacts, "Community property clue"),
    ...buildDerivedClueFacts(draft, {
      idPrefix: "derived-community-property",
      label: "Community property clue",
      matcher: (text) =>
        text.includes("community property") ||
        text.includes("spouse community property") ||
        text.includes("husband and wife") ||
        text.includes("wife and husband") ||
        text.includes("married couple") ||
        text.includes("spouses"),
      value: "This paper may show spouse community-property treatment or a husband-and-wife ownership setup.",
    }),
  ]);
  const recommendation =
    !hasMixedHintedLanes && singleHintedLane !== null
      ? buildHintLaneRecommendation(singleHintedLane, baseRecommendation)
      : multiOwnerClue !== null &&
          communityPropertyClue === null &&
          baseRecommendation.laneId === "schedule_c_single_member_llc" &&
          (draft.profile.ownerCount === null || draft.profile.ownerCount <= 1)
        ? buildHintLaneRecommendation("1065", baseRecommendation)
        : baseRecommendation;
  const hasCommunityPropertyException =
    draft.profile.spouseCommunityPropertyTreatment === "confirmed" ||
    communityPropertyClue !== null;
  const ownershipMismatchWithSingleOwnerLane =
    recommendation.laneId === "schedule_c_single_member_llc" &&
    (((draft.profile.ownerCount !== null && draft.profile.ownerCount > 1) || multiOwnerClue !== null) &&
      !hasCommunityPropertyException ||
      draft.profile.ownershipChangedDuringYear ||
      draft.profile.hasOwnerBuyoutOrRedemption ||
      draft.profile.hasFormerOwnerPayments ||
      ownershipChangeClue !== null ||
      formerOwnerPaymentClue !== null);
  const blockingReasons: string[] = [];
  const reviewReasons: string[] = [];

  if (recommendation.laneId === "unknown") {
    blockingReasons.push("Tina does not have enough clean facts to choose a starting lane yet.");
  }

  if (recommendation.support === "blocked" && recommendation.blockers.length === 0) {
    blockingReasons.push(
      "Tina's current filing-lane recommendation is blocked and should not move forward automatically."
    );
  } else if (recommendation.support === "future") {
    reviewReasons.push(
      "Tina recognizes the likely filing lane, but that lane is not first-class supported yet."
    );
  }

  pushUnique(blockingReasons, recommendation.blockers);

  if (hasMixedHintedLanes) {
    blockingReasons.push(
      `Source papers point to multiple filing lanes: ${formatTinaLaneList(hintedLanes)}.`
    );
  } else if (hasHintVsOrganizerConflict && singleHintedLane !== null) {
    const conflictMessage = `Organizer facts point to ${describeTinaLane(
      recommendation.laneId
    )}, but source papers point to ${describeTinaLane(singleHintedLane)}.`;

    if (canUseSingleHintAsReviewerOverride) {
      reviewReasons.push(
        `${conflictMessage} Tina should treat the paper trail as the stronger signal and keep the file in reviewer control on that lane.`
      );
    } else {
      blockingReasons.push(conflictMessage);
    }
  }

  if (ownershipMismatchWithSingleOwnerLane) {
    blockingReasons.push(
      "Single-owner Schedule C treatment conflicts with owner-count or ownership-change signals."
    );
  }

  if (
    recommendation.laneId === "schedule_c_single_member_llc" &&
    !ownershipMismatchWithSingleOwnerLane &&
    ((draft.profile.ownerCount !== null && draft.profile.ownerCount > 1) || multiOwnerClue !== null) &&
    hasCommunityPropertyException
  ) {
    reviewReasons.push(
      "Multiple-owner spouse community-property facts may still fit a single-owner federal path, but Tina should keep that lane under reviewer control."
    );
  }

  if (
    !ownershipMismatchWithSingleOwnerLane &&
    (draft.profile.ownershipChangedDuringYear || ownershipChangeClue !== null)
  ) {
    reviewReasons.push(
      "Ownership changed during the year, so Tina should keep the starting path under reviewer control."
    );
  }

  if (
    !ownershipMismatchWithSingleOwnerLane &&
    (draft.profile.hasOwnerBuyoutOrRedemption ||
      draft.profile.hasFormerOwnerPayments ||
      formerOwnerPaymentClue !== null)
  ) {
    reviewReasons.push(
      "Owner buyout or former-owner payment signals need reviewer classification before downstream prep."
    );
  }

  const route: TinaStartPathAssessment["route"] =
    blockingReasons.length > 0
      ? "blocked"
      : recommendation.support === "supported" && reviewReasons.length === 0
        ? "supported"
        : "review_only";
  const confidence: TinaStartPathAssessment["confidence"] =
    route === "blocked" ? "blocked" : route === "supported" ? "high" : "needs_review";
  const relatedFacts = [
    ...returnTypeHintFacts,
    ...(ownershipChangeClue ? [ownershipChangeClue] : []),
    ...(formerOwnerPaymentClue ? [formerOwnerPaymentClue] : []),
    ...(multiOwnerClue ? [multiOwnerClue] : []),
    ...(communityPropertyClue ? [communityPropertyClue] : []),
  ];
  const proofRequirements = buildTinaStartPathProofRequirements({
    draft,
    recommendation,
    multiOwnerClue,
    communityPropertyClue,
    ownershipChangeClue,
    formerOwnerPaymentClue,
  });

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
    route,
    confidence,
    blockingReasons,
    reviewReasons,
    proofRequirements,
    relatedFactIds: Array.from(new Set(relatedFacts.map((fact) => fact.id))),
    relatedDocumentIds: Array.from(new Set(relatedFacts.map((fact) => fact.sourceDocumentId))),
  };
}
