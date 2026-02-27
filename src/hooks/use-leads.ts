"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  TEAM_MEMBERS,
  type LeadRow,
  type LeadSegment,
} from "@/lib/leads-data";
import type { DistressType, LeadStatus, AIScore } from "@/lib/types";
import { useSentinelStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";

export type SortField = "score" | "priority" | "followUp" | "address" | "owner" | "status";
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

function scoreLabel(n: number): AIScore["label"] {
  if (n >= 85) return "fire";
  if (n >= 65) return "hot";
  if (n >= 40) return "warm";
  return "cold";
}

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapToLeadRow(raw: any, prop: any): LeadRow {
  const composite = raw.priority ?? 0;
  return {
    id: raw.id,
    propertyId: raw.property_id ?? "",
    apn: prop.apn ?? "",
    county: prop.county ?? "",
    address: prop.address ?? "Unknown",
    city: prop.city ?? "",
    state: prop.state ?? "",
    zip: prop.zip ?? "",
    ownerName: prop.owner_name ?? "Unknown",
    ownerPhone: prop.owner_phone ?? null,
    ownerEmail: prop.owner_email ?? null,
    ownerBadge: prop.owner_flags?.absentee ? "absentee" : null,
    distressSignals: (raw.tags ?? []) as DistressType[],
    status: raw.status ?? "prospect",
    assignedTo: raw.assigned_to ?? null,
    assignedName: null,
    score: {
      composite,
      motivation: Math.round(composite * 0.85),
      equityVelocity: Math.round((prop.equity_percent ?? 50) * 0.8),
      urgency: Math.min(composite + 5, 100),
      historicalConversion: Math.round(composite * 0.7),
      aiBoost: 0,
      label: scoreLabel(composite),
    },
    predictivePriority: composite,
    estimatedValue: prop.estimated_value ?? null,
    equityPercent: prop.equity_percent != null ? Number(prop.equity_percent) : null,
    followUpDate: raw.follow_up_date ?? null,
    lastContactAt: raw.last_contact_at ?? null,
    promotedAt: raw.promoted_at ?? raw.created_at ?? new Date().toISOString(),
    source: raw.source ?? "unknown",
    tags: raw.tags ?? [],
    complianceClean: true,
    notes: raw.notes ?? null,
  };
}

export function useLeads() {
  const { currentUser } = useSentinelStore();

  const [segment, setSegment] = useState<LeadSegment>("mine");
  const [filters, setFilters] = useState<LeadFilters>(DEFAULT_FILTERS);
  const [sortField, setSortField] = useState<SortField>("priority");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch leads that are NOT prospects (prospects live on the Prospects page)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: leadsRaw, error: leadsErr } = await (supabase.from("leads") as any)
        .select("*")
        .neq("status", "prospect")
        .order("priority", { ascending: false });

      if (leadsErr) {
        console.error("[useLeads] Fetch failed:", leadsErr);
        setLoading(false);
        return;
      }

      if (!leadsRaw || leadsRaw.length === 0) {
        setLeads([]);
        setLoading(false);
        return;
      }

      // Fetch properties
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const propIds: string[] = [...new Set((leadsRaw as any[]).map((l: any) => l.property_id).filter(Boolean))];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const propsMap: Record<string, any> = {};

      if (propIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: propsData } = await (supabase.from("properties") as any)
          .select("*")
          .in("id", propIds);

        if (propsData) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const p of propsData as any[]) propsMap[p.id] = p;
        }
      }

      // Map to LeadRow
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (leadsRaw as any[]).map((raw) => {
        const prop = propsMap[raw.property_id] ?? {};
        return mapToLeadRow(raw, prop);
      });

      setLeads(rows);
    } catch (err) {
      console.error("[useLeads] Error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads();

    const channel = supabase
      .channel("leads_hub_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => fetchLeads())
      .subscribe();

    channelRef.current = channel;
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [fetchLeads]);

  // ── Segment filter ───────────────────────────────────────────────────

  const segmentedLeads = useMemo(() => {
    if (segment === "all") return leads;
    if (segment === "mine") return leads.filter((l) => l.assignedTo === currentUser.id);
    return leads.filter((l) => l.assignedTo === segment);
  }, [leads, segment, currentUser.id]);

  // ── Filters ──────────────────────────────────────────────────────────

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

  // ── Sort ─────────────────────────────────────────────────────────────

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
    loading,
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
    refetch: fetchLeads,
  };
}
