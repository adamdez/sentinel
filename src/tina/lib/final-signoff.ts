import type {
  TinaFinalSignoffCheck,
  TinaFinalSignoffLevel,
  TinaFinalSignoffSnapshot,
  TinaWorkspaceDraft,
} from "@/tina/types";
import { buildTinaPacketIdentity } from "@/tina/lib/packet-identity";

function createDefaultChecks(): TinaFinalSignoffCheck[] {
  return [
    {
      id: "looked-at-open-items",
      label: "I looked at Tina's open items and notes.",
      helpText: "This means you saw the blockers, review notes, or clean-ready message Tina shows.",
      checked: false,
    },
    {
      id: "understand-human-review",
      label: "I understand a human still has to approve filing.",
      helpText: "Tina can do a lot, but this packet still needs a real human review before filing.",
      checked: false,
    },
    {
      id: "ready-for-reviewer",
      label: "This packet is ready to hand to a reviewer.",
      helpText: "Check this only when you are comfortable sharing the packet with your CPA or reviewer.",
      checked: false,
    },
  ];
}

function createEmptySnapshot(): TinaFinalSignoffSnapshot {
  return {
    lastRunAt: null,
    status: "idle",
    level: "blocked",
    summary: "Tina has not checked the final signoff step yet.",
    nextStep:
      "Build the CPA packet first, then let Tina check whether a human can do the final signoff step.",
    checks: createDefaultChecks(),
    reviewerName: "",
    reviewerNote: "",
    reviewPacketId: null,
    reviewPacketVersion: null,
    reviewPacketFingerprint: null,
    confirmedAt: null,
    confirmedPacketId: null,
    confirmedPacketVersion: null,
    confirmedPacketFingerprint: null,
  };
}

export function createDefaultTinaFinalSignoff(): TinaFinalSignoffSnapshot {
  return createEmptySnapshot();
}

export function markTinaFinalSignoffStale(
  snapshot: TinaFinalSignoffSnapshot
): TinaFinalSignoffSnapshot {
  const clearedChecks = snapshot.checks.map((check) => ({
    ...check,
    checked: false,
  }));

  if (snapshot.status === "idle" || snapshot.status === "stale") {
    return {
      ...snapshot,
      checks: clearedChecks,
      reviewPacketId: null,
      reviewPacketVersion: null,
      reviewPacketFingerprint: null,
      confirmedAt: null,
      confirmedPacketId: null,
      confirmedPacketVersion: null,
      confirmedPacketFingerprint: null,
    };
  }

  return {
    ...snapshot,
    status: "stale",
    summary:
      "Your packet changed, so Tina needs to check the final signoff step again before anyone relies on it.",
    nextStep: "Run the final signoff check again.",
    checks: clearedChecks,
    reviewPacketId: null,
    reviewPacketVersion: null,
    reviewPacketFingerprint: null,
    confirmedAt: null,
    confirmedPacketId: null,
    confirmedPacketVersion: null,
    confirmedPacketFingerprint: null,
  };
}

export function canConfirmTinaFinalSignoff(snapshot: TinaFinalSignoffSnapshot): boolean {
  return (
    snapshot.status === "complete" &&
    snapshot.level === "ready" &&
    snapshot.checks.every((check) => check.checked) &&
    snapshot.reviewerName.trim().length > 0
  );
}

function mergeChecks(previous: TinaFinalSignoffSnapshot | null): TinaFinalSignoffCheck[] {
  const checkedById = new Map((previous?.checks ?? []).map((check) => [check.id, check.checked]));
  return createDefaultChecks().map((check) => ({
    ...check,
    checked: checkedById.get(check.id) ?? false,
  }));
}

function createClearedChecks(): TinaFinalSignoffCheck[] {
  return createDefaultChecks();
}

function getReviewTargetFingerprint(previous: TinaFinalSignoffSnapshot | null): string | null {
  if (!previous) return null;
  return previous.reviewPacketFingerprint ?? previous.confirmedPacketFingerprint;
}

function mergeChecksForPacket(
  previous: TinaFinalSignoffSnapshot | null,
  packetFingerprint: string | null
): TinaFinalSignoffCheck[] {
  if (!packetFingerprint || getReviewTargetFingerprint(previous) !== packetFingerprint) {
    return createClearedChecks();
  }

  return mergeChecks(previous);
}

export function buildTinaFinalSignoff(draft: TinaWorkspaceDraft): TinaFinalSignoffSnapshot {
  const now = new Date().toISOString();
  const previous = draft.finalSignoff ?? createDefaultTinaFinalSignoff();

  if (draft.packageReadiness.status !== "complete") {
    return {
      ...previous,
      lastRunAt: now,
      status: draft.packageReadiness.status === "stale" ? "stale" : "idle",
      level: "blocked",
      summary:
        "Tina needs the filing-package check before she can decide whether a human can sign off on this packet.",
      nextStep: "Run the filing-package check first.",
      checks: createClearedChecks(),
      reviewPacketId: null,
      reviewPacketVersion: null,
      reviewPacketFingerprint: null,
      confirmedAt: null,
      confirmedPacketId: null,
      confirmedPacketVersion: null,
      confirmedPacketFingerprint: null,
    };
  }

  if (draft.cpaHandoff.status !== "complete") {
    return {
      ...previous,
      lastRunAt: now,
      status: draft.cpaHandoff.status === "stale" ? "stale" : "idle",
      level: "blocked",
      summary:
        "Tina needs the CPA packet view before she can guide the final signoff step.",
      nextStep: "Build the CPA handoff packet first.",
      checks: createClearedChecks(),
      reviewPacketId: null,
      reviewPacketVersion: null,
      reviewPacketFingerprint: null,
      confirmedAt: null,
      confirmedPacketId: null,
      confirmedPacketVersion: null,
      confirmedPacketFingerprint: null,
    };
  }

  const blockedArtifacts = draft.cpaHandoff.artifacts.filter((artifact) => artifact.status === "blocked");
  const waitingArtifacts = draft.cpaHandoff.artifacts.filter((artifact) => artifact.status === "waiting");

  let level: TinaFinalSignoffLevel = "ready";
  if (draft.packageReadiness.level === "blocked" || blockedArtifacts.length > 0) {
    level = "blocked";
  } else if (draft.packageReadiness.level === "needs_review" || waitingArtifacts.length > 0) {
    level = "waiting";
  }

  let summary = "Tina sees a clean first packet. A human can do the final signoff step now.";
  let nextStep =
    "Check the signoff boxes, add the reviewer's name, and then mark the packet confirmed.";

  if (level === "blocked") {
    summary =
      "Tina still sees blockers before a human should sign off on this packet.";
    nextStep = "Clear the blocked packet pieces first.";
  } else if (level === "waiting") {
    summary =
      "Tina does not see a hard stop, but some packet pieces still need review before signoff.";
    nextStep = "Clear the waiting packet pieces next, then come back to signoff.";
  }

  const packetIdentity = buildTinaPacketIdentity(draft);
  const mergedChecks = mergeChecksForPacket(previous, packetIdentity.fingerprint);
  const nextSnapshotBase: TinaFinalSignoffSnapshot = {
    ...previous,
    lastRunAt: now,
    status: "complete",
    level,
    summary,
    nextStep,
    checks: mergedChecks,
    confirmedAt: previous.confirmedAt,
    reviewPacketId: packetIdentity.packetId,
    reviewPacketVersion: packetIdentity.packetVersion,
    reviewPacketFingerprint: packetIdentity.fingerprint,
    confirmedPacketId: previous.confirmedPacketId,
    confirmedPacketVersion: previous.confirmedPacketVersion,
    confirmedPacketFingerprint: previous.confirmedPacketFingerprint,
  };
  const reviewTargetMatches = getReviewTargetFingerprint(previous) === packetIdentity.fingerprint;
  const canPreserveConfirmation =
    level === "ready" &&
    previous.confirmedAt !== null &&
    reviewTargetMatches &&
    previous.confirmedPacketFingerprint === packetIdentity.fingerprint &&
    mergedChecks.every((check) => check.checked) &&
    previous.reviewerName.trim().length > 0;

  return {
    ...nextSnapshotBase,
    confirmedAt: canPreserveConfirmation ? previous.confirmedAt : null,
    confirmedPacketId: canPreserveConfirmation ? packetIdentity.packetId : null,
    confirmedPacketVersion: canPreserveConfirmation ? packetIdentity.packetVersion : null,
    confirmedPacketFingerprint: canPreserveConfirmation ? packetIdentity.fingerprint : null,
  };
}
