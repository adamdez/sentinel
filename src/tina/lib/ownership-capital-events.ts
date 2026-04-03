import { buildTinaOwnershipTimeline } from "@/tina/lib/ownership-timeline";
import { buildTinaStartPathAssessment } from "@/tina/lib/start-path";
import type {
  TinaOwnershipCapitalEvent,
  TinaOwnershipCapitalEventsSnapshot,
  TinaWorkspaceDraft,
} from "@/tina/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildEvent(args: TinaOwnershipCapitalEvent): TinaOwnershipCapitalEvent {
  return {
    ...args,
    relatedFactIds: unique(args.relatedFactIds),
    relatedDocumentIds: unique(args.relatedDocumentIds),
  };
}

export function buildTinaOwnershipCapitalEvents(
  draft: TinaWorkspaceDraft
): TinaOwnershipCapitalEventsSnapshot {
  const timeline = buildTinaOwnershipTimeline(draft);
  const startPath = buildTinaStartPathAssessment(draft);
  const events: TinaOwnershipCapitalEvent[] = [
    buildEvent({
      id: "opening-ownership",
      title: "Opening ownership",
      summary:
        timeline.likelyOwnerCount === null
          ? "Tina still does not have a clean opening ownership count."
          : `Tina currently sees ${timeline.likelyOwnerCount} likely opening owner${timeline.likelyOwnerCount === 1 ? "" : "s"}.`,
      eventType: "opening_ownership",
      status:
        timeline.events.some((event) => event.id === "opening-owners" && event.status === "needs_proof")
          ? "blocked"
          : "known",
      relatedFactIds: startPath.relatedFactIds,
      relatedDocumentIds: startPath.relatedDocumentIds,
    }),
  ];

  if (draft.profile.ownershipChangedDuringYear || startPath.ownershipChangeClue) {
    events.push(
      buildEvent({
        id: "ownership-change",
        title: "Ownership changed during the year",
        summary:
          "Tina sees a year-of-change ownership event that can alter classification, treatment, and documentation requirements.",
        eventType: "ownership_change",
        status: startPath.proofRequirements.some((item) => item.id === "ownership-transition" && item.status === "needed")
          ? "blocked"
          : "needs_review",
        relatedFactIds: [
          ...(startPath.ownershipChangeClue ? [startPath.ownershipChangeClue.id] : []),
        ],
        relatedDocumentIds: [
          ...(startPath.ownershipChangeClue ? [startPath.ownershipChangeClue.sourceDocumentId] : []),
        ],
      })
    );
    events.push(
      buildEvent({
        id: "closing-ownership",
        title: "Closing ownership still needs confirmation",
        summary:
          "Tina should not assume the year-end ownership picture until the transfer or buyout papers are aligned.",
        eventType: "closing_ownership",
        status: "blocked",
        relatedFactIds: startPath.relatedFactIds,
        relatedDocumentIds: startPath.relatedDocumentIds,
      })
    );
  } else {
    events.push(
      buildEvent({
        id: "closing-ownership",
        title: "Closing ownership",
        summary:
          timeline.likelyOwnerCount === null
            ? "Tina does not yet have enough support to describe closing ownership."
            : "Tina currently sees no year-end ownership change signal beyond the opening owner picture.",
        eventType: "closing_ownership",
        status: timeline.likelyOwnerCount === null ? "needs_review" : "known",
        relatedFactIds: startPath.relatedFactIds,
        relatedDocumentIds: startPath.relatedDocumentIds,
      })
    );
  }

  if (draft.profile.hasOwnerBuyoutOrRedemption) {
    events.push(
      buildEvent({
        id: "buyout-redemption",
        title: "Buyout or redemption economics",
        summary:
          "Tina sees buyout or redemption activity and should hold the ownership economics under reviewer control.",
        eventType: "buyout_redemption",
        status: "blocked",
        relatedFactIds: startPath.relatedFactIds,
        relatedDocumentIds: startPath.relatedDocumentIds,
      })
    );
  }

  if (draft.profile.hasFormerOwnerPayments || startPath.formerOwnerPaymentClue) {
    events.push(
      buildEvent({
        id: "former-owner-payments",
        title: "Former-owner payments",
        summary:
          "Tina sees payments to a former owner or buyout target that can change both route choice and treatment.",
        eventType: "former_owner_payment",
        status: "blocked",
        relatedFactIds: [
          ...(startPath.formerOwnerPaymentClue ? [startPath.formerOwnerPaymentClue.id] : []),
        ],
        relatedDocumentIds: [
          ...(startPath.formerOwnerPaymentClue
            ? [startPath.formerOwnerPaymentClue.sourceDocumentId]
            : []),
        ],
      })
    );
  }

  if (
    draft.profile.spouseCommunityPropertyTreatment === "possible" ||
    draft.profile.spouseCommunityPropertyTreatment === "confirmed"
  ) {
    events.push(
      buildEvent({
        id: "community-property-exception",
        title: "Community-property exception",
        summary:
          draft.profile.spouseCommunityPropertyTreatment === "confirmed"
            ? "Tina sees a spouse community-property exception signal that may preserve Schedule C treatment under reviewer control."
            : "Tina sees a possible spouse community-property exception that still needs stronger proof.",
        eventType: "community_property_exception",
        status: startPath.proofRequirements.some((item) => item.id === "community-property-proof" && item.status === "needed")
          ? "needs_review"
          : "known",
        relatedFactIds: startPath.relatedFactIds,
        relatedDocumentIds: startPath.relatedDocumentIds,
      })
    );
  }

  if (
    draft.profile.ownerCount !== null && draft.profile.ownerCount > 1 ||
    draft.profile.hasOwnerBuyoutOrRedemption ||
    draft.profile.hasFormerOwnerPayments
  ) {
    events.push(
      buildEvent({
        id: "capital-economics",
        title: "Capital and allocation economics",
        summary:
          "Tina should assume capital-account, allocation, or redemption economics may matter until the ownership papers prove otherwise.",
        eventType: "capital_economics_question",
        status:
          startPath.recommendation.laneId === "schedule_c_single_member_llc" &&
          !startPath.ownershipMismatchWithSingleOwnerLane
            ? "needs_review"
            : "blocked",
        relatedFactIds: startPath.relatedFactIds,
        relatedDocumentIds: startPath.relatedDocumentIds,
      })
    );
  }

  const blockedEventCount = events.filter((event) => event.status === "blocked").length;
  const reviewCount = events.filter((event) => event.status === "needs_review").length;
  const overallStatus: TinaOwnershipCapitalEventsSnapshot["overallStatus"] =
    blockedEventCount > 0 ? "blocked" : reviewCount > 0 ? "review_required" : "clear";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    overallStatus,
    likelyOwnerCount: timeline.likelyOwnerCount,
    eventCount: events.length,
    blockedEventCount,
    summary:
      overallStatus === "clear"
        ? "Tina sees a coherent ownership and capital-event story from the current facts."
        : overallStatus === "review_required"
          ? `Tina sees ${reviewCount} ownership or capital-event question${reviewCount === 1 ? "" : "s"} still under reviewer control.`
          : `Tina sees ${blockedEventCount} blocked ownership or capital-event issue${blockedEventCount === 1 ? "" : "s"} that could change the whole return posture.`,
    nextStep:
      overallStatus === "clear"
        ? "Carry this ownership and capital-event story through treatment and form work."
        : overallStatus === "review_required"
          ? "Preserve these events for reviewer judgment before Tina treats them as settled."
          : "Resolve the blocked ownership and capital-event issues before Tina trusts downstream treatment or compliance output.",
    events,
  };
}
