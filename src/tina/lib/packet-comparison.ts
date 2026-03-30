import { buildTinaArtifactManifest } from "@/tina/lib/artifact-manifest";
import { buildTinaPacketIdentity } from "@/tina/lib/packet-identity";
import type { TinaPackageReadinessLevel, TinaWorkspaceDraft } from "@/tina/types";

export type TinaPacketComparisonTone = "same" | "calmer" | "riskier" | "different";

export interface TinaPacketComparisonItem {
  id: string;
  title: string;
  summary: string;
}

export interface TinaPacketComparison {
  tone: TinaPacketComparisonTone;
  summary: string;
  nextStep: string;
  items: TinaPacketComparisonItem[];
}

function rankPackageLevel(level: TinaPackageReadinessLevel): number {
  switch (level) {
    case "ready_for_cpa":
      return 2;
    case "needs_review":
      return 1;
    default:
      return 0;
  }
}

export function buildTinaPacketComparison(
  savedDraft: TinaWorkspaceDraft,
  liveDraft: TinaWorkspaceDraft
): TinaPacketComparison {
  const savedIdentity = buildTinaPacketIdentity(savedDraft);
  const liveIdentity = buildTinaPacketIdentity(liveDraft);

  if (savedIdentity.fingerprint === liveIdentity.fingerprint) {
    return {
      tone: "same",
      summary: "You are looking at the same packet revision Tina is showing in the live workspace.",
      nextStep: "Use the live packet or redownload this saved packet. They match right now.",
      items: [],
    };
  }

  const savedManifest = buildTinaArtifactManifest(savedDraft);
  const liveManifest = buildTinaArtifactManifest(liveDraft);
  const items: TinaPacketComparisonItem[] = [];

  if (savedDraft.packageReadiness.level !== liveDraft.packageReadiness.level) {
    items.push({
      id: "package-level",
      title: "Overall packet level changed",
      summary: `Tina moved from ${savedDraft.packageReadiness.level.replace(/_/g, " ")} to ${liveDraft.packageReadiness.level.replace(/_/g, " ")}.`,
    });
  }

  if (
    savedManifest.readyCount !== liveManifest.readyCount ||
    savedManifest.waitingCount !== liveManifest.waitingCount ||
    savedManifest.blockedCount !== liveManifest.blockedCount
  ) {
    items.push({
      id: "artifact-counts",
      title: "Packet file counts changed",
      summary: `Saved packet: ${savedManifest.readyCount} ready, ${savedManifest.waitingCount} waiting, ${savedManifest.blockedCount} blocked. Live packet: ${liveManifest.readyCount} ready, ${liveManifest.waitingCount} waiting, ${liveManifest.blockedCount} blocked.`,
    });
  }

  if (
    savedDraft.officialFormPacket.status !== liveDraft.officialFormPacket.status ||
    savedDraft.officialFormPacket.forms.length !== liveDraft.officialFormPacket.forms.length
  ) {
    items.push({
      id: "official-forms",
      title: "Official paperwork changed",
      summary: `The form packet moved from ${savedDraft.officialFormPacket.status} to ${liveDraft.officialFormPacket.status}, and Tina now shows ${liveDraft.officialFormPacket.forms.length} form section${liveDraft.officialFormPacket.forms.length === 1 ? "" : "s"}.`,
    });
  }

  if (savedDraft.cpaHandoff.status !== liveDraft.cpaHandoff.status) {
    items.push({
      id: "cpa-handoff",
      title: "Reviewer handoff changed",
      summary: `The reviewer packet moved from ${savedDraft.cpaHandoff.status} to ${liveDraft.cpaHandoff.status}.`,
    });
  }

  if (savedDraft.finalSignoff.confirmedAt !== liveDraft.finalSignoff.confirmedAt) {
    items.push({
      id: "signoff",
      title: "Signoff changed",
      summary: liveDraft.finalSignoff.confirmedAt
        ? "Today’s live packet has a different saved signoff state than this older packet."
        : "Today’s live packet no longer carries the same saved signoff state as this older packet.",
    });
  }

  const savedLevelRank = rankPackageLevel(savedDraft.packageReadiness.level);
  const liveLevelRank = rankPackageLevel(liveDraft.packageReadiness.level);
  const savedBlocked = savedManifest.blockedCount;
  const liveBlocked = liveManifest.blockedCount;

  let tone: TinaPacketComparisonTone = "different";
  if (liveLevelRank > savedLevelRank || (liveLevelRank === savedLevelRank && liveBlocked < savedBlocked)) {
    tone = "calmer";
  } else if (
    liveLevelRank < savedLevelRank ||
    (liveLevelRank === savedLevelRank && liveBlocked > savedBlocked)
  ) {
    tone = "riskier";
  }

  const summary =
    tone === "calmer"
      ? "Today’s live packet looks steadier than this saved snapshot."
      : tone === "riskier"
        ? "Today’s live packet looks rougher than this saved snapshot."
        : "Today’s live packet changed from this saved snapshot, but the overall shape is mixed."

  const nextStep =
    tone === "calmer"
      ? "If you need the older snapshot for an audit trail, keep it. Otherwise the live packet is the stronger review point."
      : tone === "riskier"
        ? "This older packet may be the calmer reference point until the live blockers are cleared."
        : "Read the changes below so you can decide whether to trust the newer packet or keep working from the older one."

  return {
    tone,
    summary,
    nextStep,
    items,
  };
}
