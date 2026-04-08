import { deriveLeadActionSummary, type UrgencyLevel } from "@/lib/action-derivation";
import { leadSourceSortKey } from "@/lib/lead-source";
import type { LeadStatus, QualificationRoute } from "@/lib/types";

type SortField = "score" | "priority" | "followUp" | "due" | "lastTouch" | "address" | "owner" | "source" | "status" | "equity";
type SortDir = "asc" | "desc";

export interface SortableLeadRow {
  id: string;
  /** Maps to DB `pinned` — represents "Active" work-bucket membership */
  pinned: boolean;
  score: {
    composite: number;
  };
  predictivePriority: number;
  address: string;
  ownerName: string;
  source: string;
  sourceChannel: string | null;
  sourceVendor: string | null;
  sourceListName: string | null;
  equityPercent: number | null;
  status: LeadStatus;
  qualificationRoute: QualificationRoute | null;
  assignedTo: string | null;
  nextCallScheduledAt: string | null;
  followUpDate: string | null;
  lastContactAt: string | null;
  totalCalls: number;
  promotedAt: string;
}

const URGENCY_SORT_RANK: Record<UrgencyLevel, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
  none: 4,
};

export function sortLeadRows<T extends SortableLeadRow>(
  leads: T[],
  sortField: SortField,
  sortDir: SortDir,
): T[] {
  const copy = [...leads];
  const dir = sortDir === "asc" ? 1 : -1;

  let urgencyCache: Map<string, number> | null = null;
  if (sortField === "followUp") {
    urgencyCache = new Map();
    for (const lead of copy) {
      const summary = deriveLeadActionSummary({
        status: lead.status,
        qualificationRoute: lead.qualificationRoute,
        assignedTo: lead.assignedTo,
        nextCallScheduledAt: lead.nextCallScheduledAt,
        nextFollowUpAt: lead.followUpDate,
        lastContactAt: lead.lastContactAt,
        totalCalls: lead.totalCalls,
        createdAt: lead.promotedAt,
        promotedAt: lead.promotedAt,
      });
      urgencyCache.set(lead.id, URGENCY_SORT_RANK[summary.urgency]);
    }
  }

  copy.sort((a, b) => {
    // Active leads always float to the top regardless of sort field
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;

    switch (sortField) {
      case "score":
        return (a.score.composite - b.score.composite) * dir;
      case "priority":
        return (a.predictivePriority - b.predictivePriority) * dir;
      case "followUp": {
        const ar = urgencyCache?.get(a.id) ?? 4;
        const br = urgencyCache?.get(b.id) ?? 4;
        if (ar !== br) return (ar - br) * dir;

        const aDate = a.nextCallScheduledAt
          ? new Date(a.nextCallScheduledAt).getTime()
          : a.followUpDate
            ? new Date(a.followUpDate).getTime()
            : Infinity;
        const bDate = b.nextCallScheduledAt
          ? new Date(b.nextCallScheduledAt).getTime()
          : b.followUpDate
            ? new Date(b.followUpDate).getTime()
            : Infinity;
        if (aDate !== bDate) return (aDate - bDate) * dir;

        const aPromotedAt = a.promotedAt ? new Date(a.promotedAt).getTime() : Infinity;
        const bPromotedAt = b.promotedAt ? new Date(b.promotedAt).getTime() : Infinity;
        return (aPromotedAt - bPromotedAt) * dir;
      }
      case "due": {
        const aD = a.nextCallScheduledAt ?? a.followUpDate;
        const bD = b.nextCallScheduledAt ?? b.followUpDate;
        const aMs = aD ? new Date(aD).getTime() : Infinity;
        const bMs = bD ? new Date(bD).getTime() : Infinity;
        return (aMs - bMs) * dir;
      }
      case "lastTouch": {
        const aL = a.lastContactAt ? new Date(a.lastContactAt).getTime() : -Infinity;
        const bL = b.lastContactAt ? new Date(b.lastContactAt).getTime() : -Infinity;
        return (aL - bL) * dir;
      }
      case "address":
        return a.address.localeCompare(b.address) * dir;
      case "owner":
        return a.ownerName.localeCompare(b.ownerName) * dir;
      case "source":
        return leadSourceSortKey(a).localeCompare(leadSourceSortKey(b)) * dir;
      case "equity":
        return ((a.equityPercent ?? 0) - (b.equityPercent ?? 0)) * dir;
      case "status":
        return a.status.localeCompare(b.status) * dir;
      default:
        return 0;
    }
  });

  return copy;
}
