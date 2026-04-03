import { buildTinaStartPathAssessment } from "@/tina/lib/start-path";
import type {
  TinaOwnershipTimelineEvent,
  TinaOwnershipTimelineSnapshot,
  TinaWorkspaceDraft,
} from "@/tina/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildEvent(args: TinaOwnershipTimelineEvent): TinaOwnershipTimelineEvent {
  return {
    ...args,
    relatedFactIds: unique(args.relatedFactIds),
    relatedDocumentIds: unique(args.relatedDocumentIds),
  };
}

export function buildTinaOwnershipTimeline(
  draft: TinaWorkspaceDraft
): TinaOwnershipTimelineSnapshot {
  const startPath = buildTinaStartPathAssessment(draft);
  const events: TinaOwnershipTimelineEvent[] = [];
  const likelyOwnerCount =
    draft.profile.ownerCount !== null
      ? draft.profile.ownerCount
      : startPath.recommendation.laneId === "1065"
        ? 2
        : startPath.recommendation.laneId === "schedule_c_single_member_llc"
          ? 1
          : null;

  events.push(
    buildEvent({
      id: "opening-owners",
      title: "Opening ownership picture",
      summary:
        likelyOwnerCount === null
          ? "Tina does not yet have a clean opening ownership count for the tax year."
          : likelyOwnerCount === 1
            ? "Tina currently sees a likely single-owner opening picture."
            : `Tina currently sees a likely ${likelyOwnerCount}-owner opening picture.`,
      status:
        likelyOwnerCount === null
          ? "needs_proof"
          : startPath.proofRequirements.some((requirement) => requirement.id === "ownership-agreement")
            ? "needs_proof"
            : "known",
      relatedFactIds: startPath.relatedFactIds,
      relatedDocumentIds: startPath.relatedDocumentIds,
    })
  );

  if (draft.profile.ownershipChangedDuringYear || startPath.ownershipChangeClue) {
    events.push(
      buildEvent({
        id: "mid-year-change",
        title: "Mid-year ownership change",
        summary:
          "Tina sees a mid-year ownership change or transfer signal that can affect return classification and treatment.",
        status: startPath.proofRequirements.some((requirement) => requirement.id === "ownership-transition")
          ? "needs_proof"
          : "known",
        relatedFactIds: [
          ...(startPath.ownershipChangeClue ? [startPath.ownershipChangeClue.id] : []),
        ],
        relatedDocumentIds: [
          ...(startPath.ownershipChangeClue ? [startPath.ownershipChangeClue.sourceDocumentId] : []),
        ],
      })
    );
  }

  if (draft.profile.hasOwnerBuyoutOrRedemption) {
    events.push(
      buildEvent({
        id: "buyout-or-redemption",
        title: "Owner buyout or redemption",
        summary:
          "Tina sees a buyout or redemption signal, so ownership and payment treatment should stay under reviewer control.",
        status: "needs_proof",
        relatedFactIds: startPath.relatedFactIds,
        relatedDocumentIds: startPath.relatedDocumentIds,
      })
    );
  }

  if (draft.profile.hasFormerOwnerPayments || startPath.formerOwnerPaymentClue) {
    events.push(
      buildEvent({
        id: "former-owner-payments",
        title: "Former-owner payments continue after ownership change",
        summary:
          "Tina sees former-owner payment activity that may affect the return path and treatment choice.",
        status: "needs_proof",
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
    draft.profile.spouseCommunityPropertyTreatment === "confirmed" ||
    draft.profile.spouseCommunityPropertyTreatment === "possible"
  ) {
    events.push(
      buildEvent({
        id: "community-property-exception",
        title: "Possible spouse community-property exception",
        summary:
          draft.profile.spouseCommunityPropertyTreatment === "confirmed"
            ? "Tina sees a spouse community-property exception that may preserve disregarded federal treatment."
            : "Tina sees a possible spouse community-property exception, but it still needs proof before treatment can rely on it.",
        status:
          draft.profile.spouseCommunityPropertyTreatment === "confirmed" &&
          !startPath.proofRequirements.some((requirement) => requirement.id === "community-property-proof")
            ? "known"
            : "needs_proof",
        relatedFactIds: startPath.relatedFactIds,
        relatedDocumentIds: startPath.relatedDocumentIds,
      })
    );
  }

  const needsProofCount = events.filter((event) => event.status === "needs_proof").length;
  const summary =
    needsProofCount > 0
      ? `Tina sees ${needsProofCount} ownership timeline point${
          needsProofCount === 1 ? "" : "s"
        } that still need proof before she should trust the entity posture.`
      : "Tina has a reasonably coherent ownership timeline from the current facts.";
  const nextStep =
    needsProofCount > 0
      ? "Get ownership and transition proof before trusting treatment choices built on this timeline."
      : "Keep this ownership timeline attached to the reviewer packet so the entity posture stays explainable.";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    summary,
    nextStep,
    likelyOwnerCount,
    hasMidYearChange: Boolean(draft.profile.ownershipChangedDuringYear || startPath.ownershipChangeClue),
    hasFormerOwnerPayments: Boolean(
      draft.profile.hasFormerOwnerPayments || startPath.formerOwnerPaymentClue
    ),
    events,
  };
}
