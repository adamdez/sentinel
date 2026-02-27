"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  DUMMY_LEADS,
  TEAM_MEMBERS,
  type LeadRow,
  type LeadSegment,
} from "@/lib/leads-data";
import type { DistressType, LeadStatus } from "@/lib/types";
import { useSentinelStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";

export type SortField =
  | "score"
  | "priority"
  | "followUp"
  | "address"
  | "owner"
  | "status";
export type SortDir = "asc" | "desc";

export interface LeadFilters {
  search: string;
  statuses: LeadStatus[];
  distressTypes: DistressType[];
  minScore: number;
  complianceOnly: boolean;
}

const DEFAULT_FILTERS: LeadFilters = {
  search: "",
  statuses: [],
  distressTypes: [],
  minScore: 0,
  complianceOnly: false,
};

function matchesSearch(lead: LeadRow, q: string): boolean {
  const lower = q.toLowerCase();
  return (
    lead.address.toLowerCase().includes(lower) ||
    lead.ownerName.toLowerCase().includes(lower) ||
    lead.apn.toLowerCase().includes(lower) ||
    lead.city.toLowerCase().includes(lower) ||
    lead.county.toLowerCase().includes(lower) ||
    (lead.notes?.toLowerCase().includes(lower) ?? false)
  );
}

export function useLeads() {
  const { currentUser } = useSentinelStore();

  const [segment, setSegment] = useState<LeadSegment>("mine");
  const [filters, setFilters] = useState<LeadFilters>(DEFAULT_FILTERS);
  const [sortField, setSortField] = useState<SortField>("priority");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // TODO: Replace with TanStack Query + Supabase fetch
  const [leads] = useState<LeadRow[]>(DUMMY_LEADS);

  // Real-time subscription stub
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = supabase.channel("leads_changes").on(
      "postgres_changes" as any,
      { event: "*", schema: "public", table: "leads" },
      (payload: unknown) => {
        console.debug("[Leads] Realtime update:", payload);
        // TODO: Merge into local state or invalidate TanStack Query cache
      }
    ).subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const segmentedLeads = useMemo(() => {
    if (segment === "all") return leads;
    if (segment === "mine") return leads.filter((l) => l.assignedTo === currentUser.id);
    return leads.filter((l) => l.assignedTo === segment);
  }, [leads, segment, currentUser.id]);

  const filteredLeads = useMemo(() => {
    let result = segmentedLeads;

    if (filters.search) {
      result = result.filter((l) => matchesSearch(l, filters.search));
    }
    if (filters.statuses.length > 0) {
      result = result.filter((l) => filters.statuses.includes(l.status));
    }
    if (filters.distressTypes.length > 0) {
      result = result.filter((l) =>
        l.distressSignals.some((d) => filters.distressTypes.includes(d))
      );
    }
    if (filters.minScore > 0) {
      result = result.filter((l) => l.score.composite >= filters.minScore);
    }
    if (filters.complianceOnly) {
      result = result.filter((l) => l.complianceClean);
    }

    return result;
  }, [segmentedLeads, filters]);

  const sortedLeads = useMemo(() => {
    const copy = [...filteredLeads];
    const dir = sortDir === "asc" ? 1 : -1;

    copy.sort((a, b) => {
      switch (sortField) {
        case "score":
          return (a.score.composite - b.score.composite) * dir;
        case "priority":
          return (a.predictivePriority - b.predictivePriority) * dir;
        case "followUp": {
          const aDate = a.followUpDate ? new Date(a.followUpDate).getTime() : Infinity;
          const bDate = b.followUpDate ? new Date(b.followUpDate).getTime() : Infinity;
          return (aDate - bDate) * dir;
        }
        case "address":
          return a.address.localeCompare(b.address) * dir;
        case "owner":
          return a.ownerName.localeCompare(b.ownerName) * dir;
        case "status":
          return a.status.localeCompare(b.status) * dir;
        default:
          return 0;
      }
    });
    return copy;
  }, [filteredLeads, sortField, sortDir]);

  const toggleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDir("desc");
      }
    },
    [sortField]
  );

  const selectedLead = useMemo(
    () => leads.find((l) => l.id === selectedId) ?? null,
    [leads, selectedId]
  );

  const segmentCounts = useMemo(() => {
    const all = leads.length;
    const mine = leads.filter((l) => l.assignedTo === currentUser.id).length;
    const byMember: Record<string, number> = {};
    for (const m of TEAM_MEMBERS) {
      byMember[m.id] = leads.filter((l) => l.assignedTo === m.id).length;
    }
    return { all, mine, byMember };
  }, [leads, currentUser.id]);

  return {
    leads: sortedLeads,
    segment,
    setSegment,
    filters,
    setFilters,
    updateFilter: <K extends keyof LeadFilters>(key: K, value: LeadFilters[K]) =>
      setFilters((f) => ({ ...f, [key]: value })),
    resetFilters: () => setFilters(DEFAULT_FILTERS),
    sortField,
    sortDir,
    toggleSort,
    selectedLead,
    selectedId,
    setSelectedId,
    segmentCounts,
    totalFiltered: filteredLeads.length,
    currentUser,
    teamMembers: TEAM_MEMBERS,
  };
}
