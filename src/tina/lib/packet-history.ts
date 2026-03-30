import type {
  TinaPacketReviewDecision,
  TinaStoredPacketVersionSummary,
} from "@/tina/lib/packet-versions";

export type TinaPacketHistoryFilter = "all" | TinaPacketReviewDecision;

export interface TinaPacketHistorySummary {
  totalCount: number;
  reviewedCount: number;
  approvedCount: number;
  followUpCount: number;
  unreviewedCount: number;
}

function matchesQuery(packet: TinaStoredPacketVersionSummary, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  const haystack = [
    packet.packetId,
    packet.packetVersion,
    packet.businessName,
    packet.taxYear,
    packet.packageSummary,
    packet.packageLevel,
    packet.reviewerName,
    packet.reviewDecision,
    ...packet.origins,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}

export function summarizeTinaPacketHistory(
  packetVersions: TinaStoredPacketVersionSummary[]
): TinaPacketHistorySummary {
  return packetVersions.reduce<TinaPacketHistorySummary>(
    (summary, packet) => {
      summary.totalCount += 1;
      if (packet.reviewDecision !== "unreviewed") summary.reviewedCount += 1;
      if (packet.reviewDecision === "approved_for_handoff") summary.approvedCount += 1;
      if (packet.reviewDecision === "needs_follow_up") summary.followUpCount += 1;
      if (packet.reviewDecision === "unreviewed") summary.unreviewedCount += 1;
      return summary;
    },
    {
      totalCount: 0,
      reviewedCount: 0,
      approvedCount: 0,
      followUpCount: 0,
      unreviewedCount: 0,
    }
  );
}

export function filterTinaPacketHistory(
  packetVersions: TinaStoredPacketVersionSummary[],
  options: {
    query?: string;
    reviewFilter?: TinaPacketHistoryFilter;
  } = {}
): TinaStoredPacketVersionSummary[] {
  const query = options.query ?? "";
  const reviewFilter = options.reviewFilter ?? "all";

  return packetVersions.filter((packet) => {
    if (reviewFilter !== "all" && packet.reviewDecision !== reviewFilter) return false;
    return matchesQuery(packet, query);
  });
}
