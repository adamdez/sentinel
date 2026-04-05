import { rankDiagnosticHypothesis } from "@/tina/lib/diagnostic-hypothesis-ranking";
import { buildTinaOwnershipCapitalEvents } from "@/tina/lib/ownership-capital-events";
import { buildTinaOwnershipTimeline } from "@/tina/lib/ownership-timeline";
import { buildTinaStartPathAssessment, describeTinaLane } from "@/tina/lib/start-path";
import type {
  TinaEntityAmbiguityHypothesis,
  TinaEntityAmbiguitySignal,
  TinaEntityAmbiguitySnapshot,
  TinaFilingLaneId,
  TinaWorkspaceDraft,
} from "@/tina/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function uniqueLanes(values: TinaFilingLaneId[]): TinaFilingLaneId[] {
  return Array.from(new Set(values.filter((value) => value !== "unknown")));
}

function buildSignal(args: TinaEntityAmbiguitySignal): TinaEntityAmbiguitySignal {
  return {
    ...args,
    relatedLaneIds: uniqueLanes(args.relatedLaneIds),
    relatedFactIds: unique(args.relatedFactIds),
    relatedDocumentIds: unique(args.relatedDocumentIds),
  };
}

function buildHypothesis(
  args: TinaEntityAmbiguityHypothesis
): TinaEntityAmbiguityHypothesis {
  return {
    ...args,
    whyPlausible: unique(args.whyPlausible),
    whatCouldChange: unique(args.whatCouldChange),
    requiredProof: unique(args.requiredProof),
    relatedSignalIds: unique(args.relatedSignalIds),
  };
}

function hasSignal(
  signals: TinaEntityAmbiguitySignal[],
  id: string
): TinaEntityAmbiguitySignal | undefined {
  return signals.find((signal) => signal.id === id);
}

function buildCandidateLanes(
  draft: TinaWorkspaceDraft,
  startPath: ReturnType<typeof buildTinaStartPathAssessment>
): TinaFilingLaneId[] {
  const lanes = uniqueLanes([
    startPath.recommendation.laneId,
    ...startPath.hintedLanes,
    draft.profile.taxElection === "s_corp" ? "1120_s" : "unknown",
    draft.profile.taxElection === "c_corp" ? "1120" : "unknown",
    draft.profile.entityType === "c_corp" ? "1120" : "unknown",
    draft.profile.entityType === "s_corp" ? "1120_s" : "unknown",
    draft.profile.entityType === "partnership" || draft.profile.entityType === "multi_member_llc"
      ? "1065"
      : "unknown",
    draft.profile.entityType === "sole_prop" || draft.profile.entityType === "single_member_llc"
      ? "schedule_c_single_member_llc"
      : "unknown",
    draft.profile.ownerCount !== null && draft.profile.ownerCount > 1 ? "1065" : "unknown",
    draft.profile.ownerCount === 1 ? "schedule_c_single_member_llc" : "unknown",
    startPath.ownershipMismatchWithSingleOwnerLane ? "1065" : "unknown",
  ]);

  if (lanes.length > 0) {
    return lanes;
  }

  if (draft.profile.ownerCount !== null && draft.profile.ownerCount > 1) {
    return ["1065"];
  }

  if (draft.profile.taxElection === "s_corp") {
    return ["1120_s", "schedule_c_single_member_llc"];
  }

  if (draft.profile.taxElection === "c_corp") {
    return ["1120", "schedule_c_single_member_llc"];
  }

  return ["schedule_c_single_member_llc"];
}

function buildLaneWhyPlausible(args: {
  laneId: TinaFilingLaneId;
  draft: TinaWorkspaceDraft;
  startPath: ReturnType<typeof buildTinaStartPathAssessment>;
  ownershipTimeline: ReturnType<typeof buildTinaOwnershipTimeline>;
}): string[] {
  const { laneId, draft, startPath, ownershipTimeline } = args;
  const reasons: string[] = [];

  if (laneId === startPath.recommendation.laneId) {
    reasons.push(`Current organizer posture points toward ${describeTinaLane(laneId)}.`);
  }

  if (startPath.hintedLanes.includes(laneId)) {
    reasons.push(`Source-paper hints support ${describeTinaLane(laneId)}.`);
  }

  switch (laneId) {
    case "schedule_c_single_member_llc":
      if (
        draft.profile.ownerCount === 1 ||
        draft.profile.entityType === "sole_prop" ||
        draft.profile.entityType === "single_member_llc"
      ) {
        reasons.push("Single-owner facts keep default Schedule C treatment alive.");
      }
      if (
        draft.profile.spouseCommunityPropertyTreatment === "confirmed" ||
        draft.profile.spouseCommunityPropertyTreatment === "possible"
      ) {
        reasons.push(
          "Spouse or community-property facts can preserve a Schedule C style path in narrow cases."
        );
      }
      break;
    case "1065":
      if (
        (draft.profile.ownerCount !== null && draft.profile.ownerCount > 1) ||
        draft.profile.entityType === "multi_member_llc" ||
        draft.profile.entityType === "partnership"
      ) {
        reasons.push("Multiple-owner facts make default partnership treatment plausible.");
      }
      if (ownershipTimeline.hasMidYearChange) {
        reasons.push("Ownership-change facts keep a partnership-style route alive.");
      }
      break;
    case "1120_s":
      if (draft.profile.taxElection === "s_corp" || draft.profile.entityType === "s_corp") {
        reasons.push("Election or organizer facts keep S-corporation treatment plausible.");
      }
      if (draft.profile.hasPayroll) {
        reasons.push("Payroll posture is consistent with an S-corporation operating story.");
      }
      break;
    case "1120":
      if (draft.profile.taxElection === "c_corp" || draft.profile.entityType === "c_corp") {
        reasons.push("Election or organizer facts keep C-corporation treatment plausible.");
      }
      break;
  }

  if (reasons.length === 0) {
    reasons.push(`Current facts still leave ${describeTinaLane(laneId)} alive as a plausible route.`);
  }

  return reasons;
}

function buildLaneRequiredProof(args: {
  laneId: TinaFilingLaneId;
  startPath: ReturnType<typeof buildTinaStartPathAssessment>;
  ownershipCapitalEvents: ReturnType<typeof buildTinaOwnershipCapitalEvents>;
}): string[] {
  const { laneId, startPath, ownershipCapitalEvents } = args;
  const proof = startPath.proofRequirements
    .filter(
      (requirement) =>
        requirement.relatedLaneIds.length === 0 || requirement.relatedLaneIds.includes(laneId)
    )
    .map((requirement) => requirement.label);

  if (laneId === "1065" || laneId === "schedule_c_single_member_llc") {
    proof.push(
      ...ownershipCapitalEvents.events
        .filter(
          (event) =>
            event.eventType === "ownership_change" ||
            event.eventType === "community_property_exception" ||
            event.eventType === "buyout_redemption" ||
            event.eventType === "former_owner_payment"
        )
        .filter((event) => event.status !== "known")
        .map((event) => event.title)
    );
  }

  return unique(proof);
}

function buildLaneWhatCouldChange(args: {
  laneId: TinaFilingLaneId;
  startPath: ReturnType<typeof buildTinaStartPathAssessment>;
  signals: TinaEntityAmbiguitySignal[];
}): string[] {
  const { laneId, startPath, signals } = args;
  const reasons: string[] = [];
  const routeConflict = hasSignal(signals, "route-conflict");
  const ownerCountConflict = hasSignal(signals, "owner-count-conflict");
  const electionGap = hasSignal(signals, "election-gap");
  const spouseException = hasSignal(signals, "spouse-exception");
  const transitionTimeline = hasSignal(signals, "transition-timeline");
  const buyoutEconomics = hasSignal(signals, "buyout-economics");

  if (routeConflict && routeConflict.relatedLaneIds.includes(laneId)) {
    reasons.push(routeConflict.summary);
  }

  if (ownerCountConflict && ownerCountConflict.relatedLaneIds.includes(laneId)) {
    reasons.push(ownerCountConflict.summary);
  }

  if (electionGap && electionGap.relatedLaneIds.includes(laneId)) {
    reasons.push(electionGap.summary);
  }

  if (spouseException && spouseException.relatedLaneIds.includes(laneId)) {
    reasons.push(spouseException.summary);
  }

  if (transitionTimeline) {
    reasons.push(transitionTimeline.summary);
  }

  if (buyoutEconomics) {
    reasons.push(buyoutEconomics.summary);
  }

  if (laneId !== startPath.recommendation.laneId && startPath.recommendation.laneId !== "unknown") {
    reasons.push(
      `Current organizer posture still points first toward ${describeTinaLane(
        startPath.recommendation.laneId
      )}.`
    );
  }

  return unique(reasons);
}

function laneBaseScore(
  laneId: TinaFilingLaneId,
  draft: TinaWorkspaceDraft,
  startPath: ReturnType<typeof buildTinaStartPathAssessment>
): number {
  let score = 48;

  if (laneId === startPath.recommendation.laneId) score += 10;
  if (startPath.hintedLanes.includes(laneId)) score += 9;
  if (draft.profile.taxElection === "s_corp" && laneId === "1120_s") score += 12;
  if (draft.profile.taxElection === "c_corp" && laneId === "1120") score += 12;
  if (
    draft.profile.ownerCount !== null &&
    draft.profile.ownerCount > 1 &&
    laneId === "1065"
  ) {
    score += 10;
  }
  if (
    draft.profile.ownerCount === 1 &&
    laneId === "schedule_c_single_member_llc"
  ) {
    score += 8;
  }
  if (
    startPath.ownershipMismatchWithSingleOwnerLane &&
    laneId === "schedule_c_single_member_llc"
  ) {
    score -= 14;
  }

  return score;
}

export function buildTinaEntityAmbiguityResolver(
  draft: TinaWorkspaceDraft
): TinaEntityAmbiguitySnapshot {
  const startPath = buildTinaStartPathAssessment(draft);
  const ownershipTimeline = buildTinaOwnershipTimeline(draft);
  const ownershipCapitalEvents = buildTinaOwnershipCapitalEvents(draft);
  const signals: TinaEntityAmbiguitySignal[] = [];

  if (startPath.hasMixedHintedLanes || startPath.hasHintVsOrganizerConflict) {
    signals.push(
      buildSignal({
        id: "route-conflict",
        title: "Route conflict across organizer facts and papers",
        category: "route_conflict",
        severity:
          startPath.hasMixedHintedLanes || startPath.route === "blocked" ? "blocking" : "review",
        summary: startPath.hasMixedHintedLanes
          ? `Source papers still point to multiple filing lanes: ${startPath.hintedLanes
              .map((laneId) => describeTinaLane(laneId))
              .join(", ")}.`
          : "Organizer facts and paper hints still disagree on the filing route.",
        relatedLaneIds: [startPath.recommendation.laneId, ...startPath.hintedLanes],
        relatedFactIds: [
          ...startPath.relatedFactIds,
          ...startPath.returnTypeHintFacts.map((fact) => fact.id),
        ],
        relatedDocumentIds: [
          ...startPath.relatedDocumentIds,
          ...startPath.returnTypeHintFacts.map((fact) => fact.sourceDocumentId),
        ],
      })
    );
  }

  if (
    startPath.ownershipMismatchWithSingleOwnerLane ||
    (draft.profile.ownerCount !== null &&
      draft.profile.ownerCount > 1 &&
      startPath.recommendation.laneId === "schedule_c_single_member_llc")
  ) {
    signals.push(
      buildSignal({
        id: "owner-count-conflict",
        title: "Owner-count facts still conflict with a single-owner path",
        category: "owner_count_conflict",
        severity:
          draft.profile.spouseCommunityPropertyTreatment === "confirmed" ? "review" : "blocking",
        summary:
          draft.profile.spouseCommunityPropertyTreatment === "confirmed"
            ? "Owner-count facts still need the spouse community-property exception to stay proved before Tina can trust a Schedule C style route."
            : "Owner-count and ownership clues still weaken a clean Schedule C style answer.",
        relatedLaneIds: ["schedule_c_single_member_llc", "1065"],
        relatedFactIds: startPath.relatedFactIds,
        relatedDocumentIds: startPath.relatedDocumentIds,
      })
    );
  }

  if (
    startPath.proofRequirements.some(
      (requirement) =>
        requirement.id === "entity-election" && requirement.status === "needed"
    ) ||
    draft.profile.taxElection === "s_corp" ||
    draft.profile.taxElection === "c_corp"
  ) {
    signals.push(
      buildSignal({
        id: "election-gap",
        title: "Corporate-election route still needs proof",
        category: "election_gap",
        severity:
          startPath.recommendation.laneId === "1120_s" || startPath.recommendation.laneId === "1120"
            ? "blocking"
            : "review",
        summary:
          "Corporate treatment is still conditional on election proof, so Tina should keep default routes alive until the election trail is clean.",
        relatedLaneIds: uniqueLanes([
          "1120_s",
          "1120",
          startPath.recommendation.laneId,
          ...startPath.hintedLanes,
        ]),
        relatedFactIds: startPath.proofRequirements.flatMap((item) => item.relatedFactIds),
        relatedDocumentIds: startPath.proofRequirements.flatMap(
          (item) => item.relatedDocumentIds
        ),
      })
    );
  }

  if (
    draft.profile.spouseCommunityPropertyTreatment === "possible" ||
    draft.profile.spouseCommunityPropertyTreatment === "confirmed" ||
    startPath.proofRequirements.some(
      (requirement) => requirement.id === "community-property-proof"
    )
  ) {
    signals.push(
      buildSignal({
        id: "spouse-exception",
        title: "Spouse-owned exception still changes the route math",
        category: "spouse_exception",
        severity:
          draft.profile.spouseCommunityPropertyTreatment === "possible" ||
          startPath.proofRequirements.some(
            (requirement) =>
              requirement.id === "community-property-proof" &&
              requirement.status === "needed"
          )
            ? "review"
            : "signal",
        summary:
          draft.profile.spouseCommunityPropertyTreatment === "confirmed"
            ? "A spouse community-property exception may preserve a Schedule C style path, but Tina should keep the proof visible."
            : "A spouse-owned exception may materially change whether the file stays near Schedule C or defaults to partnership treatment.",
        relatedLaneIds: ["schedule_c_single_member_llc", "1065"],
        relatedFactIds: startPath.relatedFactIds,
        relatedDocumentIds: startPath.relatedDocumentIds,
      })
    );
  }

  if (
    ownershipTimeline.hasMidYearChange ||
    startPath.proofRequirements.some(
      (requirement) =>
        requirement.id === "ownership-transition" && requirement.status === "needed"
    )
  ) {
    signals.push(
      buildSignal({
        id: "transition-timeline",
        title: "Transition-year timeline still changes the route",
        category: "transition_timeline",
        severity:
          startPath.proofRequirements.some(
            (requirement) =>
              requirement.id === "ownership-transition" &&
              requirement.status === "needed"
          ) || startPath.route === "blocked"
            ? "blocking"
            : "review",
        summary:
          "Mid-year ownership or transition facts still need proof before Tina should collapse the file to one route story.",
        relatedLaneIds: uniqueLanes([
          startPath.recommendation.laneId,
          ...startPath.hintedLanes,
          "1065",
          "1120_s",
          "1120",
        ]),
        relatedFactIds: unique(
          ownershipTimeline.events.flatMap((event) => event.relatedFactIds)
        ),
        relatedDocumentIds: unique(
          ownershipTimeline.events.flatMap((event) => event.relatedDocumentIds)
        ),
      })
    );
  }

  if (draft.profile.hasOwnerBuyoutOrRedemption || draft.profile.hasFormerOwnerPayments) {
    signals.push(
      buildSignal({
        id: "buyout-economics",
        title: "Buyout or former-owner economics still distort the route",
        category: "buyout_economics",
        severity: "blocking",
        summary:
          "Buyout, redemption, or former-owner payment facts still need ownership economics proof before Tina trusts a single entity route.",
        relatedLaneIds: uniqueLanes([
          startPath.recommendation.laneId,
          ...startPath.hintedLanes,
          "1065",
          "1120_s",
          "1120",
        ]),
        relatedFactIds: unique(
          ownershipCapitalEvents.events.flatMap((event) => event.relatedFactIds)
        ),
        relatedDocumentIds: unique(
          ownershipCapitalEvents.events.flatMap((event) => event.relatedDocumentIds)
        ),
      })
    );
  }

  const hypotheses = buildCandidateLanes(draft, startPath)
    .map((laneId) => {
      const whyPlausible = buildLaneWhyPlausible({
        laneId,
        draft,
        startPath,
        ownershipTimeline,
      });
      const whatCouldChange = buildLaneWhatCouldChange({
        laneId,
        startPath,
        signals,
      });
      const requiredProof = buildLaneRequiredProof({
        laneId,
        startPath,
        ownershipCapitalEvents,
      });
      const ranking = rankDiagnosticHypothesis({
        whyPlausible,
        whatCouldChange,
        requiredProof,
        baseScore: laneBaseScore(laneId, draft, startPath),
      });
      const relatedSignalIds = signals
        .filter((signal) => signal.relatedLaneIds.includes(laneId))
        .map((signal) => signal.id);

      return buildHypothesis({
        id: `entity-ambiguity-${laneId}`,
        title: `${describeTinaLane(laneId)} route`,
        laneId,
        status: "fallback",
        confidence: ranking.confidence,
        stabilityScore: ranking.stabilityScore,
        summary:
          laneId === startPath.recommendation.laneId
            ? `Tina currently leans toward ${describeTinaLane(
                laneId
              )}, but the route still needs ambiguity-aware proof handling.`
            : `Tina should keep ${describeTinaLane(
                laneId
              )} alive as a competing route until the ownership and election proofs settle.`,
        whyPlausible,
        whatCouldChange,
        requiredProof,
        supportingSignalCount: ranking.supportingSignalCount,
        contradictingSignalCount: ranking.contradictingSignalCount,
        recommendedFirstQuestion: ranking.recommendedFirstQuestion,
        relatedSignalIds,
      });
    })
    .sort((left, right) => right.stabilityScore - left.stabilityScore)
    .map((hypothesis, index) =>
      buildHypothesis({
        ...hypothesis,
        status:
          index === 0
            ? "leading"
            : index === 1
              ? "plausible"
              : "fallback",
      })
    );

  const blockingSignals = signals.filter((signal) => signal.severity === "blocking").length;
  const reviewSignals = signals.filter((signal) => signal.severity === "review").length;
  const [leadingHypothesis, alternateHypothesis] = hypotheses;
  const competingSpread =
    leadingHypothesis &&
    alternateHypothesis &&
    Math.abs(leadingHypothesis.stabilityScore - alternateHypothesis.stabilityScore) <= 14;
  const overallStatus: TinaEntityAmbiguitySnapshot["overallStatus"] =
    blockingSignals > 0 || startPath.route === "blocked"
      ? "blocked"
      : competingSpread || reviewSignals > 0 || hypotheses.length > 1
        ? "competing_routes"
        : "stable_route";
  const recommendedHandling: TinaEntityAmbiguitySnapshot["recommendedHandling"] =
    overallStatus === "stable_route"
      ? "continue"
      : overallStatus === "competing_routes"
        ? "carry_competing_paths"
        : "blocked_until_proved";
  const priorityQuestions =
    overallStatus === "stable_route"
      ? unique(
          startPath.proofRequirements
            .filter((requirement) => requirement.status === "needed")
            .map((requirement) => requirement.label)
        ).slice(0, 6)
      : unique(
          [
            leadingHypothesis?.recommendedFirstQuestion ?? "",
            alternateHypothesis?.recommendedFirstQuestion ?? "",
            ...startPath.proofRequirements
              .filter((requirement) => requirement.status === "needed")
              .map((requirement) => requirement.label),
            ...signals
              .filter((signal) => signal.severity !== "signal")
              .map((signal) => signal.summary),
          ].filter(Boolean)
        ).slice(0, 6);

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    overallStatus,
    recommendedHandling,
    leadingHypothesisId: leadingHypothesis?.id ?? null,
    summary:
      overallStatus === "stable_route"
        ? `Tina sees a stable entity route on ${describeTinaLane(
            leadingHypothesis?.laneId ?? startPath.recommendation.laneId
          )}.`
        : overallStatus === "competing_routes"
          ? "Tina sees multiple live entity-route paths and should keep them conditional instead of collapsing early."
          : "Tina sees blocked entity-route ambiguity and should not trust one filing posture yet.",
    nextStep:
      overallStatus === "stable_route"
        ? "Carry the leading entity route forward, but preserve the proof trail that kept alternate paths alive."
        : overallStatus === "competing_routes"
          ? "Keep the leading and alternate routes visible until the highest-priority ownership or election proofs settle."
          : "Resolve the blocking route, election, and ownership proofs before Tina builds downstream work on one posture.",
    signals,
    hypotheses,
    priorityQuestions,
  };
}
