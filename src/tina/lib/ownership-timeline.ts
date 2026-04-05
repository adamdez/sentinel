import {
  buildTinaDocumentIntelligence,
  listTinaDocumentIntelligenceFactsByKind,
} from "@/tina/lib/document-intelligence";
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
  const documentIntelligence = buildTinaDocumentIntelligence(draft);
  const ownershipTimelineSignals = listTinaDocumentIntelligenceFactsByKind({
    snapshot: documentIntelligence,
    kind: "ownership_timeline_signal",
  });
  const structuredOwnershipArtifacts = documentIntelligence.items.filter(
    (item) =>
      item.status !== "signal_only" &&
      item.roles.some((role) =>
        ["operating_agreement", "cap_table", "ownership_schedule", "buyout_agreement"].includes(
          role
        )
      )
  );
  const ownershipSplitSignals = ownershipTimelineSignals.filter(
    (signal) => signal.label === "Ownership split timing signal"
  );
  const ownershipAgreementNeeded = startPath.proofRequirements.some(
    (requirement) =>
      requirement.id === "ownership-agreement" && requirement.status === "needed"
  );
  const ownershipTransitionNeeded = startPath.proofRequirements.some(
    (requirement) =>
      requirement.id === "ownership-transition" && requirement.status === "needed"
  );
  const communityPropertyProofNeeded = startPath.proofRequirements.some(
    (requirement) =>
      requirement.id === "community-property-proof" && requirement.status === "needed"
  );
  const events: TinaOwnershipTimelineEvent[] = [];
  const likelyOwnerCount =
    draft.profile.ownerCount !== null
      ? draft.profile.ownerCount
      : ownershipSplitSignals.length > 0
        ? 2
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
            : ownershipSplitSignals[0]?.valueText
              ? `Tina currently sees a likely ${likelyOwnerCount}-owner opening picture with a structured split signal (${ownershipSplitSignals[0].valueText}).`
              : `Tina currently sees a likely ${likelyOwnerCount}-owner opening picture.`,
      status:
        likelyOwnerCount === null
          ? "needs_proof"
          : ownershipAgreementNeeded ||
              (likelyOwnerCount > 1 &&
                structuredOwnershipArtifacts.length === 0)
            ? "needs_proof"
            : "known",
      relatedFactIds: startPath.relatedFactIds,
      relatedDocumentIds: unique([
        ...startPath.relatedDocumentIds,
        ...structuredOwnershipArtifacts.map((item) => item.documentId),
      ]),
    })
  );

  if (
    draft.profile.ownershipChangedDuringYear ||
    startPath.ownershipChangeClue ||
    ownershipTimelineSignals.some((signal) => signal.valueText === "ownership_change")
  ) {
    events.push(
      buildEvent({
        id: "mid-year-change",
        title: "Mid-year ownership change",
        summary:
          "Tina sees a mid-year ownership change or transfer signal that can affect return classification and treatment.",
        status: ownershipTransitionNeeded ||
            structuredOwnershipArtifacts.length === 0
          ? "needs_proof"
          : "known",
        relatedFactIds: [
          ...(startPath.ownershipChangeClue ? [startPath.ownershipChangeClue.id] : []),
        ],
        relatedDocumentIds: unique([
          ...(startPath.ownershipChangeClue ? [startPath.ownershipChangeClue.sourceDocumentId] : []),
          ...structuredOwnershipArtifacts.map((item) => item.documentId),
        ]),
      })
    );
  }

  if (
    draft.profile.hasOwnerBuyoutOrRedemption ||
    ownershipTimelineSignals.some((signal) => signal.valueText === "buyout_or_redemption")
  ) {
    events.push(
      buildEvent({
        id: "buyout-or-redemption",
        title: "Owner buyout or redemption",
        summary:
          "Tina sees a buyout or redemption signal, so ownership and payment treatment should stay under reviewer control.",
        status: structuredOwnershipArtifacts.some((item) => item.roles.includes("buyout_agreement"))
          ? "known"
          : "needs_proof",
        relatedFactIds: startPath.relatedFactIds,
        relatedDocumentIds: unique([
          ...startPath.relatedDocumentIds,
          ...structuredOwnershipArtifacts.map((item) => item.documentId),
        ]),
      })
    );
  }

  if (
    draft.profile.hasFormerOwnerPayments ||
    startPath.formerOwnerPaymentClue ||
    ownershipTimelineSignals.some((signal) => signal.valueText === "former_owner_payments")
  ) {
    events.push(
      buildEvent({
        id: "former-owner-payments",
        title: "Former-owner payments continue after ownership change",
        summary:
          "Tina sees former-owner payment activity that may affect the return path and treatment choice.",
        status: structuredOwnershipArtifacts.some((item) => item.roles.includes("buyout_agreement"))
          ? "known"
          : "needs_proof",
        relatedFactIds: [
          ...(startPath.formerOwnerPaymentClue ? [startPath.formerOwnerPaymentClue.id] : []),
        ],
        relatedDocumentIds: unique([
          ...(startPath.formerOwnerPaymentClue
            ? [startPath.formerOwnerPaymentClue.sourceDocumentId]
            : []),
          ...structuredOwnershipArtifacts.map((item) => item.documentId),
        ]),
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
          !communityPropertyProofNeeded
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
