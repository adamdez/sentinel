"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  deriveOfferPrepHealth,
  type DynamicTeamMember,
  deriveOfferVisibilityStatus,
  extractOfferPrepSnapshot,
  type LeadRow,
  type LeadSegment,
} from "@/lib/leads-data";
import type { LeadStatus, AIScore } from "@/lib/types";
import { useSentinelStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { extractProspectingSnapshot, sourceChannelLabel } from "@/lib/prospecting";

export type SortField = "score" | "priority" | "followUp" | "address" | "owner" | "status" | "equity";
export type SortDir = "asc" | "desc";
export type FollowUpFilter = "all" | "overdue" | "today" | "uncontacted" | "urgent_uncontacted";
export type MarketFilter = "spokane" | "kootenai" | "other";
export type OutboundCallStatusFilter = "not_called" | "contacted" | "wrong_number" | "do_not_call" | "bad_record";
type FollowUpState = "overdue" | "today" | "urgent_uncontacted" | "uncontacted" | "other";
export type AttentionFocus =
  | "none"
  | "new_inbound"
  | "overdue"
  | "unassigned_hot"
  | "slow_or_missing"
  | "needs_qualification"
  | "escalated_review";

const SPEED_TO_LEAD_SLA_MS = 15 * 60 * 1000;
const IMPORTANT_SCORE_THRESHOLD = 65;
const NEEDS_QUALIFICATION_AGE_MS = 48 * 60 * 60 * 1000;

const DEFAULT_SORT_DIR_BY_FIELD: Record<SortField, SortDir> = {
  score: "desc",
  priority: "desc",
  followUp: "asc",
  address: "asc",
  owner: "asc",
  status: "asc",
  equity: "desc",
};

export interface LeadFilters {
  search: string;
  statuses: LeadStatus[];
  markets: MarketFilter[];
  sources: string[];
  nicheTags: string[];
  importBatches: string[];
  callStatuses: OutboundCallStatusFilter[];
  followUp: FollowUpFilter;
  unassignedOnly: boolean;
  includeClosed: boolean;
  excludeSuppressed: boolean;
}

const DEFAULT_FILTERS: LeadFilters = {
  search: "",
  statuses: [],
  markets: [],
  sources: [],
  nicheTags: [],
  importBatches: [],
  callStatuses: [],
  followUp: "all",
  unassignedOnly: false,
  includeClosed: false,
  excludeSuppressed: false,
};

function scoreLabel(n: number): AIScore["label"] {
  if (n >= 85) return "platinum";
  if (n >= 65) return "gold";
  if (n >= 40) return "silver";
  return "bronze";
}

function matchesSearch(lead: LeadRow, q: string): boolean {
  const lower = q.toLowerCase();
  return (
    lead.address.toLowerCase().includes(lower) ||
    lead.ownerName.toLowerCase().includes(lower) ||
    lead.apn.toLowerCase().includes(lower) ||
    lead.city.toLowerCase().includes(lower) ||
    lead.county.toLowerCase().includes(lower) ||
    (lead.sourceVendor?.toLowerCase().includes(lower) ?? false) ||
    (lead.sourceListName?.toLowerCase().includes(lower) ?? false) ||
    (lead.importBatchId?.toLowerCase().includes(lower) ?? false) ||
    (lead.nicheTag?.toLowerCase().includes(lower) ?? false) ||
    (lead.notes?.toLowerCase().includes(lower) ?? false)
  );
}

function marketKeyFromCounty(county: string | null | undefined): MarketFilter {
  const c = (county ?? "").toLowerCase();
  if (c.includes("spokane")) return "spokane";
  if (c.includes("kootenai")) return "kootenai";
  return "other";
}

function sourceKey(source: string | null | undefined): string {
  return (source ?? "unknown").trim().toLowerCase();
}

function sourceLabel(source: string): string {
  return sourceChannelLabel(source);
}

function outboundCallStatus(lead: LeadRow): OutboundCallStatusFilter {
  if (lead.badRecord) return "bad_record";
  if (lead.doNotCall) return "do_not_call";
  if (lead.wrongNumber || lead.dispositionCode === "wrong_number") return "wrong_number";
  if ((lead.totalCalls ?? 0) > 0 || lead.lastContactAt || lead.outboundLastCallAt) return "contacted";
  return "not_called";
}

function followUpState(lead: LeadRow): FollowUpState {
  if ((lead.totalCalls ?? 0) === 0) {
    const promotedMs = lead.promotedAt ? new Date(lead.promotedAt).getTime() : NaN;
    if (!Number.isNaN(promotedMs) && Date.now() - promotedMs > 15 * 60 * 1000) {
      return "urgent_uncontacted";
    }
    return "uncontacted";
  }
  if (!lead.nextCallScheduledAt) return "other";
  const next = new Date(lead.nextCallScheduledAt).getTime();
  if (Number.isNaN(next)) return "other";
  const now = Date.now();
  if (next < now) return "overdue";
  const n = new Date(next);
  const t = new Date();
  const sameDay =
    n.getFullYear() === t.getFullYear() &&
    n.getMonth() === t.getMonth() &&
    n.getDate() === t.getDate();
  return sameDay ? "today" : "other";
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function firstAttemptMs(lead: LeadRow): number | null {
  return toMs(lead.firstAttemptAt) ?? toMs(lead.lastContactAt);
}

function isNewInboundNeedsAttention(lead: LeadRow, dayStartMs: number, dayEndMs: number): boolean {
  const intakeMs = toMs(lead.promotedAt);
  const attemptMs = firstAttemptMs(lead);
  if (intakeMs == null) return false;
  return intakeMs >= dayStartMs && intakeMs < dayEndMs && attemptMs == null;
}

function isOverdueFollowUpNeedsAttention(lead: LeadRow, nowMs: number): boolean {
  if (lead.status === "dead" || lead.status === "closed") return false;
  const dueMs = toMs(lead.nextCallScheduledAt) ?? toMs(lead.followUpDate);
  return dueMs != null && dueMs < nowMs;
}

function isUnassignedImportantNeedsAttention(lead: LeadRow): boolean {
  return !lead.assignedTo && lead.score.composite >= IMPORTANT_SCORE_THRESHOLD && lead.status !== "dead";
}

function isSlowOrMissingFirstResponseNeedsAttention(lead: LeadRow, nowMs: number): boolean {
  const intakeMs = toMs(lead.promotedAt);
  if (intakeMs == null) return false;
  const attemptMs = firstAttemptMs(lead);
  if (attemptMs == null) {
    return nowMs - intakeMs > SPEED_TO_LEAD_SLA_MS;
  }
  return attemptMs >= intakeMs && attemptMs - intakeMs > SPEED_TO_LEAD_SLA_MS;
}

function isNeedsQualificationAttention(lead: LeadRow, nowMs: number): boolean {
  if (lead.status !== "lead") return false;
  if (lead.qualificationRoute != null) return false;
  const intakeMs = toMs(lead.promotedAt);
  if (intakeMs == null) return false;
  return nowMs - intakeMs > NEEDS_QUALIFICATION_AGE_MS;
}

function isEscalatedReviewAttention(lead: LeadRow): boolean {
  if (lead.qualificationRoute !== "escalate") return false;
  return lead.status !== "dead" && lead.status !== "closed";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapToLeadRow(raw: any, prop: any, firstAttemptAt: string | null = null): LeadRow {
  const composite = raw.priority ?? 0;
  const offerPrepSnapshot = extractOfferPrepSnapshot(prop.owner_flags ?? null);
  const prospecting = extractProspectingSnapshot(prop.owner_flags ?? null);
  const offerPrepHealth = deriveOfferPrepHealth({
    status: raw.status ?? "prospect",
    qualificationRoute: raw.qualification_route ?? null,
    snapshot: offerPrepSnapshot,
    nextCallScheduledAt: raw.next_call_scheduled_at ?? null,
    nextFollowUpAt: raw.next_follow_up_at ?? raw.follow_up_date ?? null,
  }).state;

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
    distressSignals: Array.isArray(raw.tags) ? raw.tags : [],
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
    followUpDate: raw.next_follow_up_at ?? raw.next_call_scheduled_at ?? raw.follow_up_date ?? null,
    lastContactAt: raw.last_contact_at ?? null,
    firstAttemptAt,
    motivationLevel: raw.motivation_level != null ? Number(raw.motivation_level) : null,
    sellerTimeline: raw.seller_timeline ?? null,
    conditionLevel: raw.condition_level != null ? Number(raw.condition_level) : null,
    decisionMakerConfirmed: raw.decision_maker_confirmed === true,
    priceExpectation: raw.price_expectation != null ? Number(raw.price_expectation) : null,
    qualificationRoute: raw.qualification_route ?? null,
    occupancyScore: raw.occupancy_score != null ? Number(raw.occupancy_score) : null,
    equityFlexibilityScore: raw.equity_flexibility_score != null ? Number(raw.equity_flexibility_score) : null,
    qualificationScoreTotal: raw.qualification_score_total != null ? Number(raw.qualification_score_total) : null,
    offerStatus: deriveOfferVisibilityStatus({
      status: raw.status ?? "prospect",
      qualificationRoute: (raw.qualification_route ?? null),
    }),
    offerPrepSnapshot,
    offerPrepHealth,
    promotedAt: raw.promoted_at ?? raw.created_at ?? new Date().toISOString(),
    source: raw.source ?? "unknown",
    sourceChannel: prospecting.sourceChannel ?? raw.source ?? "unknown",
    sourceVendor: prospecting.sourceVendor,
    sourceListName: prospecting.sourceListName,
    sourcePullDate: prospecting.sourcePullDate,
    sourceCampaign: prospecting.sourceCampaign,
    intakeMethod: prospecting.intakeMethod,
    rawSourceRef: prospecting.rawSourceRef,
    duplicateStatus: prospecting.duplicateStatus,
    receivedAt: prospecting.receivedAt,
    nicheTag: prospecting.nicheTag,
    importBatchId: prospecting.importBatchId,
    outreachType: prospecting.outreachType,
    assignedAt: prospecting.assignedAt,
    skipTraceStatus: prospecting.skipTraceStatus,
    outboundStatus: prospecting.outboundStatus,
    outboundAttemptCount: prospecting.attemptCount,
    outboundFirstCallAt: prospecting.firstCallAt,
    outboundLastCallAt: prospecting.lastCallAt,
    firstContactAt: prospecting.firstContactAt ?? raw.last_contact_at ?? null,
    wrongNumber: prospecting.wrongNumber,
    doNotCall: prospecting.doNotCall,
    badRecord: prospecting.badRecord,
    tags: raw.tags ?? [],
    complianceClean: true,
    notes: raw.notes ?? null,
    totalCalls: raw.total_calls ?? 0,
    liveAnswers: raw.live_answers ?? 0,
    voicemailsLeft: raw.voicemails_left ?? 0,
    callSequenceStep: raw.call_sequence_step ?? 1,
    nextCallScheduledAt: raw.next_call_scheduled_at ?? null,
    dispositionCode: raw.disposition_code ?? null,
    ownerFlags: prop.owner_flags ?? {},
  };
}

export function useLeads() {
  const { currentUser } = useSentinelStore();

  const [segment, setSegment] = useState<LeadSegment>("mine");
  const [filters, setFilters] = useState<LeadFilters>(DEFAULT_FILTERS);
  const [sortField, setSortField] = useState<SortField>("followUp");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [attentionFocus, setAttentionFocus] = useState<AttentionFocus>("none");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Dynamic team members loaded from user_profiles (real Supabase UUIDs)
  const [teamMembers, setTeamMembers] = useState<DynamicTeamMember[]>([]);

  useEffect(() => {
    async function loadTeam() {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase.from("user_profiles") as any)
          .select("id, full_name, role")
          .in("role", ["admin", "agent"])
          .order("full_name");

        if (data && data.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setTeamMembers(data.map((p: any) => ({
            id: p.id,
            name: p.full_name ?? "Unknown",
            role: p.role ?? "agent",
          })));
        }
      } catch (err) {
        console.error("[useLeads] Failed to load team members:", err);
      }
    }
    loadTeam();
  }, []);

  const memberNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of teamMembers) map[m.id] = m.name;
    if (currentUser?.id && currentUser?.name) map[currentUser.id] = currentUser.name;
    return map;
  }, [teamMembers, currentUser?.id, currentUser?.name]);

  const leadsWithAssigneeNames = useMemo(
    () =>
      leads.map((l) => ({
        ...l,
        assignedName: l.assignedTo ? (memberNameById[l.assignedTo] ?? l.assignedName) : null,
      })),
    [leads, memberNameById],
  );

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch inbox-stage leads plus closed records for compact recovery/discovery.
      // Closed stays hidden by default in client filters so daily queue behavior remains intact.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: leadsRaw, error: leadsErr } = await (supabase.from("leads") as any)
        .select("*")
        .neq("status", "prospect")
        .neq("status", "staging")
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

      // Collect lead + property IDs for downstream joins.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const leadIds: string[] = [...new Set((leadsRaw as any[]).map((l: any) => l.id).filter(Boolean))];

      // Fetch properties
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const propIds: string[] = [...new Set((leadsRaw as any[]).map((l: any) => l.property_id).filter(Boolean))];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const propsMap: Record<string, any> = {};
      const firstAttemptByLeadId: Record<string, string> = {};

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

      // Fetch earliest logged contact attempt per lead from calls_log.
      // started_at is the best current proxy for first call/contact attempt.
      if (leadIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: callRows, error: callsErr } = await (supabase.from("calls_log") as any)
          .select("lead_id, started_at")
          .in("lead_id", leadIds)
          .order("started_at", { ascending: true });

        if (callsErr) {
          console.warn("[useLeads] calls_log fetch failed; falling back to lead timestamps:", callsErr);
        } else if (callRows) {
          for (const row of callRows as Array<{ lead_id: string | null; started_at: string | null }>) {
            if (!row.lead_id || !row.started_at) continue;
            if (!firstAttemptByLeadId[row.lead_id]) {
              firstAttemptByLeadId[row.lead_id] = row.started_at;
            }
          }
        }
      }

      // Batch-fetch predictive scores for blended priority
      const predMap: Record<string, number> = {};
      if (propIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: predData } = await (supabase.from("scoring_predictions") as any)
          .select("property_id, predictive_score")
          .in("property_id", propIds)
          .order("created_at", { ascending: false });

        if (predData) {
          const seen = new Set<string>();
          for (const p of predData as { property_id: string; predictive_score: number }[]) {
            if (!seen.has(p.property_id)) {
              predMap[p.property_id] = p.predictive_score;
              seen.add(p.property_id);
            }
          }
        }
      }

      // Map to LeadRow with predictive blend
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (leadsRaw as any[]).map((raw) => {
        const prop = propsMap[raw.property_id] ?? {};
        const firstAttemptAt = firstAttemptByLeadId[raw.id] ?? null;
        const lead = mapToLeadRow(raw, prop, firstAttemptAt);
        const pred = predMap[raw.property_id] ?? null;
        if (pred !== null) {
          lead.predictivePriority = Math.round(lead.score.composite * 0.6 + pred * 0.4);
        }
        return lead;
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

  // Segment filter

  const segmentedLeads = useMemo(() => {
    if (segment === "all") return leadsWithAssigneeNames;
    if (segment === "mine") return leadsWithAssigneeNames.filter((l) => l.assignedTo === currentUser.id);
    return leadsWithAssigneeNames.filter((l) => l.assignedTo === segment);
  }, [leadsWithAssigneeNames, segment, currentUser.id]);

  const closedVisible = filters.includeClosed || filters.statuses.includes("closed");

  const discoverableSegmentedLeads = useMemo(() => (
    closedVisible ? segmentedLeads : segmentedLeads.filter((l) => l.status !== "closed")
  ), [closedVisible, segmentedLeads]);

  const sourceOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of discoverableSegmentedLeads) {
      const k = sourceKey(l.sourceChannel ?? l.source);
      counts[k] = (counts[k] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([value, count]) => ({ value, label: sourceLabel(value), count }));
  }, [discoverableSegmentedLeads]);

  const nicheOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of discoverableSegmentedLeads) {
      if (!l.nicheTag) continue;
      counts[l.nicheTag] = (counts[l.nicheTag] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([value, count]) => ({ value, label: sourceLabel(value), count }));
  }, [discoverableSegmentedLeads]);

  const importBatchOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of discoverableSegmentedLeads) {
      if (!l.importBatchId) continue;
      counts[l.importBatchId] = (counts[l.importBatchId] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([value, count]) => ({ value, label: value, count }));
  }, [discoverableSegmentedLeads]);

  const callStatusOptions = useMemo(() => {
    const counts: Record<OutboundCallStatusFilter, number> = {
      not_called: 0,
      contacted: 0,
      wrong_number: 0,
      do_not_call: 0,
      bad_record: 0,
    };
    for (const l of discoverableSegmentedLeads) {
      counts[outboundCallStatus(l)] += 1;
    }
    return (Object.entries(counts) as Array<[OutboundCallStatusFilter, number]>)
      .filter(([, count]) => count > 0)
      .map(([value, count]) => ({ value, label: sourceLabel(value), count }));
  }, [discoverableSegmentedLeads]);

  // Filters

  const filteredLeads = useMemo(() => {
    let result = discoverableSegmentedLeads;

    if (filters.search) {
      result = result.filter((l) => matchesSearch(l, filters.search));
    }
    if (filters.statuses.length > 0) {
      result = result.filter((l) => filters.statuses.includes(l.status));
    }
    if (filters.markets.length > 0) {
      result = result.filter((l) => filters.markets.includes(marketKeyFromCounty(l.county)));
    }
    if (filters.sources.length > 0) {
      result = result.filter((l) => filters.sources.includes(sourceKey(l.sourceChannel ?? l.source)));
    }
    if (filters.nicheTags.length > 0) {
      result = result.filter((l) => l.nicheTag != null && filters.nicheTags.includes(l.nicheTag));
    }
    if (filters.importBatches.length > 0) {
      result = result.filter((l) => l.importBatchId != null && filters.importBatches.includes(l.importBatchId));
    }
    if (filters.callStatuses.length > 0) {
      result = result.filter((l) => filters.callStatuses.includes(outboundCallStatus(l)));
    }
    if (filters.followUp !== "all") {
      result = result.filter((l) => followUpState(l) === filters.followUp);
    }
    if (filters.unassignedOnly) {
      result = result.filter((l) => !l.assignedTo);
    }
    if (filters.excludeSuppressed) {
      result = result.filter((l) => !l.doNotCall && !l.badRecord);
    }

    if (attentionFocus !== "none") {
      const now = new Date();
      const nowMs = now.getTime();
      const dayStartMs = startOfDay(now).getTime();
      const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;

      result = result.filter((l) => {
        if (attentionFocus === "new_inbound") {
          return isNewInboundNeedsAttention(l, dayStartMs, dayEndMs);
        }
        if (attentionFocus === "overdue") {
          return isOverdueFollowUpNeedsAttention(l, nowMs);
        }
        if (attentionFocus === "unassigned_hot") {
          return isUnassignedImportantNeedsAttention(l);
        }
        if (attentionFocus === "slow_or_missing") {
          return isSlowOrMissingFirstResponseNeedsAttention(l, nowMs);
        }
        if (attentionFocus === "needs_qualification") {
          return isNeedsQualificationAttention(l, nowMs);
        }
        if (attentionFocus === "escalated_review") {
          return isEscalatedReviewAttention(l);
        }
        return true;
      });
    }

    return result;
  }, [discoverableSegmentedLeads, filters, attentionFocus]);

  // Sort

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
          const rank = (l: LeadRow): number => {
            const state = followUpState(l);
            if (state === "overdue") return 0;
            if (state === "urgent_uncontacted") return 1;
            if (state === "today") return 2;
            if (state === "uncontacted") return 3;
            if (l.nextCallScheduledAt) return 4;
            return 5;
          };
          const ar = rank(a);
          const br = rank(b);
          if (ar !== br) return (ar - br) * dir;

          if (ar === 0 || ar === 2 || ar === 4) {
            const aDate = a.nextCallScheduledAt ? new Date(a.nextCallScheduledAt).getTime() : Infinity;
            const bDate = b.nextCallScheduledAt ? new Date(b.nextCallScheduledAt).getTime() : Infinity;
            return (aDate - bDate) * dir;
          }
          if (ar === 1) {
            const aPromoted = a.promotedAt ? new Date(a.promotedAt).getTime() : Infinity;
            const bPromoted = b.promotedAt ? new Date(b.promotedAt).getTime() : Infinity;
            return (aPromoted - bPromoted) * dir;
          }
          if (ar === 3) {
            const aPromoted = a.promotedAt ? new Date(a.promotedAt).getTime() : -Infinity;
            const bPromoted = b.promotedAt ? new Date(b.promotedAt).getTime() : -Infinity;
            return (bPromoted - aPromoted) * dir;
          }
          return (b.predictivePriority - a.predictivePriority) * dir;
        }
        case "address":
          return a.address.localeCompare(b.address) * dir;
        case "owner":
          return a.ownerName.localeCompare(b.ownerName) * dir;
        case "equity":
          return ((a.equityPercent ?? 0) - (b.equityPercent ?? 0)) * dir;
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
        setSortDir(DEFAULT_SORT_DIR_BY_FIELD[field]);
      }
    },
    [sortField]
  );

  const selectedLead = useMemo(
    () => leads.find((l) => l.id === selectedId) ?? null,
    [leads, selectedId]
  );

  // Exclude current user from team tabs (admin sees "My Leads" instead)
  const otherTeamMembers = useMemo(
    () => teamMembers.filter((m) => m.id !== currentUser.id),
    [teamMembers, currentUser.id],
  );

  const segmentCounts = useMemo(() => {
    const base = filters.includeClosed
      ? leadsWithAssigneeNames
      : leadsWithAssigneeNames.filter((l) => l.status !== "closed");
    const all = base.length;
    const mine = base.filter((l) => l.assignedTo === currentUser.id).length;
    const byMember: Record<string, number> = {};
    for (const m of teamMembers) {
      byMember[m.id] = base.filter((l) => l.assignedTo === m.id).length;
    }
    return { all, mine, byMember };
  }, [leadsWithAssigneeNames, currentUser.id, filters.includeClosed, teamMembers]);

  const needsAttention = useMemo(() => {
    const now = new Date();
    const nowMs = now.getTime();
    const dayStartMs = startOfDay(now).getTime();
    const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;

    let newInbound = 0;
    let overdue = 0;
    let unassignedHot = 0;
    let slowOrMissing = 0;
    let needsQualification = 0;
    let escalatedReview = 0;

    for (const l of segmentedLeads) {
      const isNewInbound = isNewInboundNeedsAttention(l, dayStartMs, dayEndMs);
      const isOverdue = isOverdueFollowUpNeedsAttention(l, nowMs);
      const isUnassignedHot = isUnassignedImportantNeedsAttention(l);
      const isSlowOrMissing = isSlowOrMissingFirstResponseNeedsAttention(l, nowMs);
      const needsQualificationFlag = isNeedsQualificationAttention(l, nowMs);

      if (isNewInbound) {
        newInbound++;
      }
      if (isOverdue) {
        overdue++;
      }
      if (isUnassignedHot) {
        unassignedHot++;
      }
      if (isSlowOrMissing) {
        slowOrMissing++;
      }
      if (needsQualificationFlag) {
        needsQualification++;
      }
      if (isEscalatedReviewAttention(l)) {
        escalatedReview++;
      }
    }

    return {
      newInbound,
      overdue,
      unassignedHot,
      slowOrMissing,
      needsQualification,
      escalatedReview,
    };
  }, [segmentedLeads]);

  const inboxMetrics = useMemo(() => {
    const now = new Date();
    const nowMs = now.getTime();
    const dayStart = startOfDay(now).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;

    let newToday = 0;
    let uncontacted = 0;
    let dueToday = 0;
    let overdue = 0;
    const speedSamplesMs: number[] = [];
    let estimatedSpeedSampleCount = 0;

    for (const l of segmentedLeads) {
      const promoted = l.promotedAt ? new Date(l.promotedAt).getTime() : null;
      const next = l.nextCallScheduledAt ? new Date(l.nextCallScheduledAt).getTime() : null;
      const neverContacted = (l.totalCalls ?? 0) === 0;

      if (promoted && !Number.isNaN(promoted) && promoted >= dayStart && promoted < dayEnd) {
        newToday++;
      }
      if (neverContacted) {
        uncontacted++;
      }
      if (next && !Number.isNaN(next)) {
        if (next < nowMs) overdue++;
        else if (next >= dayStart && next < dayEnd) dueToday++;
      }

      const firstAttempt = l.firstAttemptAt
        ? new Date(l.firstAttemptAt).getTime()
        : l.lastContactAt
          ? new Date(l.lastContactAt).getTime()
          : null;
      if (
        promoted &&
        firstAttempt &&
        !Number.isNaN(promoted) &&
        !Number.isNaN(firstAttempt) &&
        firstAttempt >= promoted
      ) {
        speedSamplesMs.push(firstAttempt - promoted);
        if (!l.firstAttemptAt && l.lastContactAt) estimatedSpeedSampleCount++;
      }
    }

    speedSamplesMs.sort((a, b) => a - b);
    const speedSampleCount = speedSamplesMs.length;
    const medianSpeedToLeadMs =
      speedSampleCount > 0 ? speedSamplesMs[Math.floor(speedSampleCount / 2)] : null;
    const medianSpeedToLeadMinutes =
      medianSpeedToLeadMs != null ? Math.round(medianSpeedToLeadMs / 60000) : null;
    const within15mCount = speedSamplesMs.filter((ms) => ms <= 15 * 60 * 1000).length;

    return {
      newToday,
      uncontacted,
      dueToday,
      overdue,
      speedSampleCount,
      estimatedSpeedSampleCount,
      medianSpeedToLeadMinutes,
      within15mCount,
    };
  }, [segmentedLeads]);

  const outboundSourceMetrics = useMemo(() => {
    const grouped = new Map<string, { label: string; leads: number; contacted: number; offerPath: number; closed: number }>();
    for (const lead of segmentedLeads) {
      const key = sourceKey(lead.sourceChannel ?? lead.source);
      const existing = grouped.get(key) ?? {
        label: sourceLabel(key),
        leads: 0,
        contacted: 0,
        offerPath: 0,
        closed: 0,
      };
      existing.leads += 1;
      if ((lead.totalCalls ?? 0) > 0 || lead.firstAttemptAt || lead.lastContactAt) {
        existing.contacted += 1;
      }
      if (
        lead.status === "negotiation"
        || lead.status === "disposition"
        || lead.status === "closed"
        || lead.qualificationRoute === "offer_ready"
      ) {
        existing.offerPath += 1;
      }
      if (lead.status === "closed") {
        existing.closed += 1;
      }
      grouped.set(key, existing);
    }
    return Array.from(grouped.values())
      .sort((a, b) => b.leads - a.leads)
      .slice(0, 6)
      .map((item) => ({
        ...item,
        contactRate: item.leads > 0 ? Math.round((item.contacted / item.leads) * 100) : 0,
        offerPathRate: item.leads > 0 ? Math.round((item.offerPath / item.leads) * 100) : 0,
        closedRate: item.leads > 0 ? Math.round((item.closed / item.leads) * 100) : 0,
      }));
  }, [segmentedLeads]);

  const nicheMetrics = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const lead of segmentedLeads) {
      if (!lead.nicheTag) continue;
      counts[lead.nicheTag] = (counts[lead.nicheTag] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([tag, count]) => ({ tag, label: sourceLabel(tag), count }));
  }, [segmentedLeads]);

  return {
    leads: sortedLeads,
    loading,
    segment,
    setSegment,
    attentionFocus,
    setAttentionFocus,
    needsAttention,
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
    sourceOptions,
    nicheOptions,
    importBatchOptions,
    callStatusOptions,
    inboxMetrics,
    outboundSourceMetrics,
    nicheMetrics,
    totalFiltered: filteredLeads.length,
    currentUser,
    teamMembers: otherTeamMembers,
    refetch: fetchLeads,
  };
}
