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
import { deriveLeadActionSummary } from "@/lib/action-derivation";
import { isLeadUnclaimed } from "@/lib/lead-ownership";
import type { LeadQueueResponse } from "@/lib/lead-queue-contract";
import { sortLeadRows } from "./use-leads-sort";

export type SortField = "score" | "priority" | "followUp" | "due" | "lastTouch" | "address" | "owner" | "source" | "status" | "equity";
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

const KNOWN_DISTRESS_TAGS = ["probate", "inherited", "tax_lien", "pre_foreclosure", "vacant", "divorce", "bankruptcy"] as const;

const DISTRESS_TAG_LABELS: Record<string, string> = {
  probate: "Probate",
  inherited: "Inherited",
  tax_lien: "Tax Lien",
  pre_foreclosure: "Pre-foreclosure",
  vacant: "Vacant",
  divorce: "Divorce",
  bankruptcy: "Bankruptcy",
};

function leadMatchesDistressTag(
  lead: { isVacant: boolean; foreclosureStage: string | null; distressSignals: string[] },
  tag: string,
): boolean {
  if (tag === "vacant" && lead.isVacant) return true;
  if (tag === "pre_foreclosure" && lead.foreclosureStage) return true;
  const variants = [tag, tag.replace(/_/g, " "), tag.replace(/_/g, "-")];
  return lead.distressSignals.some((s) => {
    const lower = s.toLowerCase();
    return variants.some((v) => lower.includes(v));
  });
}

const DEFAULT_SORT_DIR_BY_FIELD: Record<SortField, SortDir> = {
  score: "desc",
  priority: "desc",
  followUp: "asc",
  due: "asc",
  lastTouch: "desc",
  address: "asc",
  owner: "asc",
  source: "asc",
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
  hasPhone: "any" | "yes" | "no";
  neverCalled: boolean;
  notCalledToday: boolean;
  distressTags: string[];
  inDialQueue: "any" | "yes" | "no";
}

const DEFAULT_FILTERS: LeadFilters = {
  search: "",
  statuses: ["lead", "negotiation", "disposition"],
  markets: [],
  sources: [],
  nicheTags: [],
  importBatches: [],
  callStatuses: [],
  followUp: "all",
  unassignedOnly: false,
  includeClosed: false,
  excludeSuppressed: false,
  hasPhone: "any",
  neverCalled: false,
  notCalledToday: false,
  distressTags: [],
  inDialQueue: "any",
};

const LEAD_LIST_SELECT = [
  "id",
  "property_id",
  "priority",
  "status",
  "assigned_to",
  "next_follow_up_at",
  "next_call_scheduled_at",
  "follow_up_date",
  "last_contact_at",
  "created_at",
  "promoted_at",
  "motivation_level",
  "seller_timeline",
  "condition_level",
  "decision_maker_confirmed",
  "price_expectation",
  "qualification_route",
  "occupancy_score",
  "equity_flexibility_score",
  "qualification_score_total",
  "source",
  "tags",
  "notes",
  "total_calls",
  "live_answers",
  "voicemails_left",
  "call_sequence_step",
  "disposition_code",
  "appointment_at",
  "offer_amount",
  "contract_at",
  "assignment_fee_projected",
  "conversion_gclid",
  "seller_situation_summary_short",
  "recommended_call_angle",
  "top_fact_1",
  "top_fact_2",
  "top_fact_3",
  "opportunity_score",
  "contactability_score",
  "confidence_score",
  "dossier_url",
  "next_action",
  "next_action_due_at",
  "pinned",
  "pinned_at",
  "pinned_by",
  "dial_queue_active",
  "dial_queue_added_at",
  "intro_sop_active",
  "intro_day_count",
  "intro_last_call_date",
  "intro_completed_at",
  "intro_exit_category",
].join(", ");

const PROPERTY_LIST_SELECT = [
  "id",
  "apn",
  "county",
  "address",
  "city",
  "state",
  "zip",
  "owner_name",
  "owner_phone",
  "owner_email",
  "owner_flags",
  "estimated_value",
  "equity_percent",
  "bedrooms",
  "bathrooms",
  "sqft",
  "property_type",
  "year_built",
  "lot_size",
  "loan_balance",
  "last_sale_price",
  "last_sale_date",
  "foreclosure_stage",
  "default_amount",
  "delinquent_amount",
  "is_vacant",
].join(", ");

const missingSelectColumnsCache: Record<"leads" | "properties", Set<string>> = {
  leads: new Set<string>(),
  properties: new Set<string>(),
};

function splitSelectColumns(select: string): string[] {
  return select
    .split(",")
    .map((column) => column.trim())
    .filter(Boolean);
}

function isMissingColumnError(error: unknown): error is { code?: string; message?: string } {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; message?: string };
  return candidate.code === "42703" || candidate.code === "PGRST204";
}

function extractMissingColumnName(error: { message?: string }, table: string): string | null {
  const message = error.message ?? "";
  const qualifiedMatch = message.match(new RegExp(`column\\s+${table}\\.([a-zA-Z0-9_]+)\\s+does not exist`, "i"));
  if (qualifiedMatch?.[1]) return qualifiedMatch[1];
  const unqualifiedMatch = message.match(/Could not find the '([a-zA-Z0-9_]+)' column/i);
  if (unqualifiedMatch?.[1]) return unqualifiedMatch[1];
  return null;
}

async function selectWithMissingColumnFallback<T>(
  table: "leads" | "properties",
  baseColumns: string[],
  buildQuery: (columns: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<{ data: T[] | null; missingColumns: string[]; error: unknown }> {
  const columns = baseColumns.filter((column) => !missingSelectColumnsCache[table].has(column));
  const missingColumns: string[] = [];

  while (columns.length > 0) {
    const { data, error } = await buildQuery(columns);
    if (!error) {
      return { data, missingColumns, error: null };
    }
    if (!isMissingColumnError(error)) {
      return { data: null, missingColumns, error };
    }

    const missingColumn = extractMissingColumnName(error, table);
    if (!missingColumn) {
      return { data: null, missingColumns, error };
    }

    const nextColumns = columns.filter((column) => column !== missingColumn);
    if (nextColumns.length === columns.length) {
      return { data: null, missingColumns, error };
    }

    columns.splice(0, columns.length, ...nextColumns);
    missingColumns.push(missingColumn);
    missingSelectColumnsCache[table].add(missingColumn);
    console.warn(`[useLeads] Missing ${table} column "${missingColumn}" detected; retrying without it.`);
  }

  return { data: [], missingColumns, error: null };
}

function scoreLabel(n: number | null): AIScore["label"] {
  if (n == null) return "unscored";
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
    lead.state.toLowerCase().includes(lower) ||
    lead.zip.toLowerCase().includes(lower) ||
    lead.source.toLowerCase().includes(lower) ||
    (lead.sourceChannel?.toLowerCase().includes(lower) ?? false) ||
    (lead.ownerPhone?.toLowerCase().includes(lower) ?? false) ||
    (lead.ownerEmail?.toLowerCase().includes(lower) ?? false) ||
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

function isDriveByLead(lead: LeadRow): boolean {
  if (!lead.nextAction) return false;
  return lead.nextAction.toLowerCase().startsWith("drive by");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapToLeadRow(raw: any, prop: any, firstAttemptAt: string | null = null, attribution: any = null): LeadRow {
  const composite = raw.priority ?? null;
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
      composite: composite ?? 0,
      motivation: composite != null ? Math.round(composite * 0.85) : 0,
      equityVelocity: Math.round((prop.equity_percent ?? 50) * 0.8),
      urgency: composite != null ? Math.min(composite + 5, 100) : 0,
      historicalConversion: composite != null ? Math.round(composite * 0.7) : 0,
      aiBoost: 0,
      label: scoreLabel(composite),
    },
    predictivePriority: composite,
    estimatedValue: prop.estimated_value ?? null,
    equityPercent: prop.equity_percent != null ? Number(prop.equity_percent) : null,
    bedrooms: prop.bedrooms != null ? Number(prop.bedrooms) : null,
    bathrooms: prop.bathrooms != null ? Number(prop.bathrooms) : null,
    sqft: prop.sqft != null ? Number(prop.sqft) : null,
    propertyType: prop.property_type ?? null,
    yearBuilt: prop.year_built != null ? Number(prop.year_built) : null,
    lotSize: prop.lot_size != null ? Number(prop.lot_size) : null,
    loanBalance: prop.loan_balance != null ? Number(prop.loan_balance) : null,
    lastSalePrice: prop.last_sale_price != null ? Number(prop.last_sale_price) : null,
    lastSaleDate: prop.last_sale_date ?? null,
    foreclosureStage: prop.foreclosure_stage ?? null,
    defaultAmount: prop.default_amount != null ? Number(prop.default_amount) : null,
    delinquentAmount: prop.delinquent_amount != null ? Number(prop.delinquent_amount) : null,
    isVacant: prop.is_vacant === true,
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
    // Milestone fields
    appointmentAt: raw.appointment_at ?? null,
    offerAmount: raw.offer_amount != null ? Number(raw.offer_amount) : null,
    contractAt: raw.contract_at ?? null,
    assignmentFeeProjected: raw.assignment_fee_projected != null ? Number(raw.assignment_fee_projected) : null,
    conversionGclid: raw.conversion_gclid ?? attribution?.gclid ?? null,
    // Attribution data
    attribution: attribution ? {
      campaignName: attribution.ads_campaigns?.name ?? null,
      adGroupName: attribution.ads_ad_groups?.name ?? null,
      keywordText: attribution.ads_keywords?.text ?? null,
      market: attribution.market ?? null,
      gclid: attribution.gclid ?? null
    } : null,
    // Intelligence CRM projection fields
    sellerSituationSummaryShort: raw.seller_situation_summary_short ?? null,
    recommendedCallAngle: raw.recommended_call_angle ?? null,
    topFact1: raw.top_fact_1 ?? null,
    topFact2: raw.top_fact_2 ?? null,
    topFact3: raw.top_fact_3 ?? null,
    opportunityScore: raw.opportunity_score != null ? Number(raw.opportunity_score) : null,
    contactabilityScore: raw.contactability_score != null ? Number(raw.contactability_score) : null,
    confidenceScore: raw.confidence_score != null ? Number(raw.confidence_score) : null,
    dossierUrl: raw.dossier_url ?? null,
    nextAction: raw.next_action ?? null,
    nextActionDueAt: raw.next_action_due_at ?? null,
    pinned: raw.pinned === true,
    pinnedAt: raw.pinned_at ?? null,
    pinnedBy: raw.pinned_by ?? null,
    dialQueueActive: raw.dial_queue_active === true,
    dialQueueAddedAt: raw.dial_queue_added_at ?? null,
    introSopActive: raw.intro_sop_active !== false,
    introDayCount: typeof raw.intro_day_count === "number" ? Math.min(3, Math.max(0, Math.floor(raw.intro_day_count))) : 0,
    introLastCallDate: typeof raw.intro_last_call_date === "string" ? raw.intro_last_call_date : null,
    introCompletedAt: typeof raw.intro_completed_at === "string" ? raw.intro_completed_at : null,
    introExitCategory: typeof raw.intro_exit_category === "string" ? raw.intro_exit_category : null,
    requiresIntroExitCategory:
      typeof raw.intro_completed_at === "string"
      && !(typeof raw.intro_exit_category === "string" && raw.intro_exit_category.trim().length > 0),
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
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestVersionRef = useRef(0);

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

  const fetchLeads = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    const requestVersion = ++requestVersionRef.current;
    if (!silent) setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/leads/queue", {
        method: "GET",
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {},
        cache: "no-store",
      });

      const payload = await res.json().catch(() => ({})) as Partial<LeadQueueResponse> & { error?: string };
      if (!res.ok) {
        throw new Error(payload.error ?? `HTTP ${res.status}`);
      }

      if (requestVersion !== requestVersionRef.current) return;
      setLeads(Array.isArray(payload.leads) ? payload.leads : []);
    } catch (err) {
      console.error("[useLeads] Error:", err);
    } finally {
      if (!silent && requestVersion === requestVersionRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const scheduleRefetch = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      void fetchLeads({ silent: true });
    }, 300);
  }, [fetchLeads]);

  useEffect(() => {
    void fetchLeads();

    const channel = supabase
      .channel("leads_hub_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, scheduleRefetch)
      .subscribe();

    channelRef.current = channel;
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [fetchLeads, scheduleRefetch]);

  const removeLeadsByIds = useCallback((leadIds: string[]) => {
    if (leadIds.length === 0) return;
    const removed = new Set(leadIds);
    setLeads((current) => current.filter((lead) => !removed.has(lead.id)));
    setSelectedId((current) => (current && removed.has(current) ? null : current));
  }, []);

  // Segment filter

  const segmentedLeads = useMemo(() => {
    // Active (pinned) and Drive By leads belong in their own buckets, not Lead Queue
    const base = leadsWithAssigneeNames.filter((l) => !l.pinned && !isDriveByLead(l));
    if (segment === "all") return base.filter((l) => isLeadUnclaimed(l.assignedTo));
    if (segment === "mine") return base.filter((l) => l.assignedTo === currentUser.id);
    return base.filter((l) => l.assignedTo === segment);
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

  const distressTagOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tag of KNOWN_DISTRESS_TAGS) counts[tag] = 0;
    for (const l of discoverableSegmentedLeads) {
      for (const tag of KNOWN_DISTRESS_TAGS) {
        if (leadMatchesDistressTag(l, tag)) counts[tag]++;
      }
    }
    return (Object.entries(counts) as [string, number][])
      .filter(([, count]) => count > 0)
      .map(([value, count]) => ({ value, label: DISTRESS_TAG_LABELS[value] ?? value, count }));
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
    if (filters.hasPhone === "yes") {
      result = result.filter((l) => !!l.ownerPhone);
    } else if (filters.hasPhone === "no") {
      result = result.filter((l) => !l.ownerPhone);
    }
    if (filters.neverCalled) {
      result = result.filter((l) => (l.totalCalls ?? 0) === 0);
    }
    if (filters.notCalledToday) {
      const dayStart = startOfDay(new Date()).getTime();
      result = result.filter((l) => {
        if (!l.lastContactAt) return true;
        const ms = new Date(l.lastContactAt).getTime();
        return !Number.isNaN(ms) && ms < dayStart;
      });
    }
    if (filters.distressTags.length > 0) {
      result = result.filter((l) =>
        filters.distressTags.some((dt) => leadMatchesDistressTag(l, dt)),
      );
    }
    if (filters.inDialQueue === "yes") {
      result = result.filter((l) => l.dialQueueActive);
    } else if (filters.inDialQueue === "no") {
      result = result.filter((l) => !l.dialQueueActive);
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
    return sortLeadRows(filteredLeads, sortField, sortDir);
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
    const base = (filters.includeClosed
      ? leadsWithAssigneeNames
      : leadsWithAssigneeNames.filter((l) => l.status !== "closed")
    ).filter((l) => !l.pinned && !isDriveByLead(l));
    const all = base.filter((l) => isLeadUnclaimed(l.assignedTo)).length;
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

      if (isNewInbound) newInbound++;
      if (isOverdue) overdue++;
      if (isUnassignedHot) unassignedHot++;
      if (isSlowOrMissing) slowOrMissing++;
      if (needsQualificationFlag) needsQualification++;
      if (isEscalatedReviewAttention(l)) escalatedReview++;
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
    distressTagOptions,
    inboxMetrics,
    outboundSourceMetrics,
    nicheMetrics,
    totalFiltered: filteredLeads.length,
    currentUser,
    teamMembers: otherTeamMembers,
    removeLeadsByIds,
    refetch: fetchLeads,
  };
}
