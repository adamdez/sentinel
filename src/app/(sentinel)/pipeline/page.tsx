"use client";

import { useEffect, useState, useCallback, useRef, useTransition } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { motion, AnimatePresence } from "framer-motion";
import {
  Award,
  Zap,
  Search,
  RefreshCw,
  GripVertical,
  Sparkles,
  Plus,
  Phone,
  Trash2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { deleteLeadCustomerFile } from "@/lib/lead-write-helpers";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { getAuthenticatedProspectPatchHeaders } from "@/lib/prospect-api-client";
import { precheckWorkflowStageChange } from "@/lib/workflow-stage-precheck";
import type { LeadStatus, QualificationRoute } from "@/lib/types";
import { deriveLeadActionSummary, type UrgencyLevel } from "@/lib/action-derivation";

/** Numeric rank for urgency-based lane sorting — lower = more urgent */
const URGENCY_LANE_RANK: Record<UrgencyLevel, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
  none: 4,
};
import { MasterClientFileModal, clientFileFromRaw, type ClientFile } from "@/components/sentinel/master-client-file-modal";
import { useCoachSurface } from "@/providers/coach-provider";
import { CoachPanel, CoachToggle } from "@/components/sentinel/coach-panel";

// ── Pipeline lane definitions (5 display lanes) ──────────────────────────────────────────────────

const PIPELINE_LANES = [
  { id: "working", title: "Working", accent: "#3b82f6", bg: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.3)", text: "text-foreground" },
  { id: "negotiation", title: "Negotiation", accent: "#f59e0b", bg: "rgba(0,0,0,0.08)", border: "rgba(0,0,0,0.3)", text: "text-foreground" },
  { id: "disposition", title: "Disposition", accent: "#f43f5e", bg: "rgba(244,63,94,0.08)", border: "rgba(244,63,94,0.3)", text: "text-foreground" },
  { id: "nurture", title: "Nurture", accent: "#0ea5e9", bg: "rgba(14,165,233,0.08)", border: "rgba(14,165,233,0.3)", text: "text-foreground" },
  { id: "closed", title: "Closed", accent: "#a855f7", bg: "rgba(168,85,247,0.08)", border: "rgba(168,85,247,0.3)", text: "text-foreground" },
] as const;

type LaneId = (typeof PIPELINE_LANES)[number]["id"];

const LANE_HINTS: Record<LaneId, string> = {
  working: "Leads you're qualifying or contacting",
  negotiation: "Offer made or terms under discussion",
  disposition: "Finding buyers and closing the deal",
  nurture: "Long-cycle follow-up, not ready yet",
  closed: "Completed deals",
};

/** Map database statuses to display lanes. Returns null for statuses excluded from the board. */
function getDisplayLane(status: string): LaneId | null {
  switch (status) {
    case "prospect": case "lead": return "working";
    case "negotiation": return "negotiation";
    case "disposition": return "disposition";
    case "nurture": return "nurture";
    case "closed": return "closed";
    case "dead": case "staging": return null;
    default: return null;
  }
}

/** When dropping on "working", send "lead" to the API. Other lanes map directly. */
function laneToApiStatus(laneId: LaneId): string {
  if (laneId === "working") return "lead";
  return laneId;
}

interface Lead {
  id: string;
  apn: string;
  address: string;
  owner_name: string;
  heat_score: number;
  status: string;
  owner_id: string | null;
  claimed_at: string | null;
  claim_expires_at: string | null;
  tags: string[];
  source: string | null;
  daysUntilDistress: number | null;
  predictiveLabel: string | null;
  follow_up_at: string | null;
  promoted_at: string | null;
  qualification_route: string | null;
  assignee_name: string | null;
  last_contact_at: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 85) return { label: "FIRE", class: "text-foreground bg-muted/15 border-border/30" };
  if (score >= 65) return { label: "HOT", class: "text-foreground bg-muted/15 border-border/30" };
  if (score >= 40) return { label: "WARM", class: "text-foreground bg-muted/15 border-border/30" };
  return { label: "COLD", class: "text-foreground bg-muted/15 border-border/30" };
}

function daysAgoLabel(dateStr: string | null): string {
  if (!dateStr) return "No contact";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  if (diff <= 0) return "Today";
  if (diff === 1) return "1d ago";
  return `${diff}d ago`;
}

function normalizeStatus(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().replace(/\s+/g, "_");
  // Map legacy values
  if (lower === "prospects") return "prospect";
  if (lower === "leads" || lower === "my_lead" || lower === "my_leads" || lower === "my leads") return "lead";
  return lower;
}

// ── Main component ─────────────────────────────────────────────────────

export default function PipelinePage() {
  const [leadsByLane, setLeadsByLane] = useState<Record<LaneId, Lead[]>>(
    () => Object.fromEntries(PIPELINE_LANES.map((s) => [s.id, []])) as unknown as Record<LaneId, Lead[]>
  );
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showMineOnly, setShowMineOnly] = useState(false);
  const [adding, setAdding] = useState(false);
  const showQuickAddTestProspect = process.env.NODE_ENV === "development";
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawDataRef = useRef<Record<string, { lead: any; prop: any }>>({});
  const [selectedClientFile, setSelectedClientFile] = useState<ClientFile | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useCoachSurface("pipeline", {});

  // ── Fetch all leads + properties, group by lane ─────────────────────

  const fetchLeads = useCallback(async () => {
    console.log("[Pipeline] fetchLeads triggered");
    setLoading(true);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: leadsRaw, error: leadsErr } = await (supabase.from("leads") as any)
        .select("*")
        .neq("status", "staging")
        .order("priority", { ascending: false });

      if (leadsErr) {
        console.error("[Pipeline] Leads fetch failed:", leadsErr);
        setLoading(false);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const propertyIds: string[] = [...new Set((leadsRaw as any[]).map((l: any) => l.property_id).filter(Boolean))];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const assignedUserIds: string[] = [...new Set((leadsRaw as any[]).map((l: any) => l.assigned_to).filter(Boolean))];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const propsMap: Record<string, any> = {};
      const assigneeNames: Record<string, string> = {};

      if (propertyIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: propsData } = await (supabase.from("properties") as any)
          .select("*")
          .in("id", propertyIds);

        if (propsData) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const p of propsData as any[]) propsMap[p.id] = p;
        }
      }

      if (assignedUserIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: assignees } = await (supabase.from("user_profiles") as any)
          .select("id, full_name")
          .in("id", assignedUserIds);

        if (assignees) {
          for (const profile of assignees as Array<{ id: string; full_name: string | null }>) {
            assigneeNames[profile.id] = profile.full_name ?? "";
          }
        }
      }

      // Fetch latest predictions
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const predsMap: Record<string, { days: number; label: string; score: number; confidence: number }> = {};
      if (propertyIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: predsData } = await (supabase.from("scoring_predictions") as any)
          .select("property_id, days_until_distress, predictive_score, confidence")
          .in("property_id", propertyIds)
          .order("created_at", { ascending: false });
        if (predsData) {
          for (const p of predsData as { property_id: string; days_until_distress: number; predictive_score: number; confidence: number }[]) {
            if (!(p.property_id in predsMap)) {
              const ps = p.predictive_score;
              predsMap[p.property_id] = {
                days: p.days_until_distress,
                score: ps,
                confidence: Number(p.confidence) || 0,
                label: ps >= 80 ? "imminent" : ps >= 55 ? "likely" : ps >= 30 ? "possible" : "unlikely",
              };
            }
          }
        }
      }

      const grouped = Object.fromEntries(PIPELINE_LANES.map((s) => [s.id, []])) as unknown as Record<LaneId, Lead[]>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawMap: Record<string, { lead: any; prop: any }> = {};

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const raw of leadsRaw as any[]) {
        const prop = propsMap[raw.property_id] ?? {};
        const canonicalStatus = normalizeStatus(raw.status);
        if (!canonicalStatus) continue;

        const lane = getDisplayLane(canonicalStatus);
        if (!lane) continue; // dead, staging, or unknown — excluded from board

        const pred = predsMap[raw.property_id];
        if (pred) {
          raw._prediction = {
            predictiveScore: pred.score,
            daysUntilDistress: pred.days,
            confidence: pred.confidence,
            label: pred.label,
            ownerAgeInference: null,
            equityBurnRate: null,
            lifeEventProbability: null,
          };
        }
        rawMap[raw.id] = { lead: raw, prop };

        grouped[lane].push({
          id: raw.id,
          apn: prop.apn ?? raw.property_id?.slice(0, 12) ?? "—",
          address: prop.address ?? "Unknown address",
          owner_name: prop.owner_name ?? "Unknown",
          heat_score: raw.priority ?? 0,
          status: canonicalStatus,
          owner_id: raw.assigned_to ?? null,
          claimed_at: raw.claimed_at ?? null,
          claim_expires_at: raw.claim_expires_at ?? null,
          tags: raw.tags ?? [],
          source: raw.source ?? null,
          daysUntilDistress: pred?.days ?? null,
          predictiveLabel: pred?.label ?? null,
          follow_up_at: raw.next_call_scheduled_at ?? raw.next_follow_up_at ?? raw.follow_up_date ?? null,
          promoted_at: raw.promoted_at ?? raw.created_at ?? null,
          qualification_route: raw.qualification_route ?? null,
          assignee_name: raw.assigned_to ? (assigneeNames[raw.assigned_to] ?? null) : null,
          last_contact_at: raw.last_contact_at ?? null,
        });
      }
      rawDataRef.current = rawMap;

      // Sort each lane: urgency first (critical → none), then server priority
      for (const laneId of Object.keys(grouped) as LaneId[]) {
        grouped[laneId].sort((a, b) => {
          const aUrgency = deriveLeadActionSummary({
            status: a.status as LeadStatus,
            qualificationRoute: a.qualification_route,
            assignedTo: a.owner_id,
            nextFollowUpAt: a.follow_up_at,
            lastContactAt: null,
            totalCalls: null,
            createdAt: a.promoted_at,
            promotedAt: a.promoted_at,
          }).urgency;
          const bUrgency = deriveLeadActionSummary({
            status: b.status as LeadStatus,
            qualificationRoute: b.qualification_route,
            assignedTo: b.owner_id,
            nextFollowUpAt: b.follow_up_at,
            lastContactAt: null,
            totalCalls: null,
            createdAt: b.promoted_at,
            promotedAt: b.promoted_at,
          }).urgency;
          const urgencyDiff = URGENCY_LANE_RANK[aUrgency] - URGENCY_LANE_RANK[bUrgency];
          if (urgencyDiff !== 0) return urgencyDiff;
          // Tie-break: higher server priority first
          return (b.heat_score ?? 0) - (a.heat_score ?? 0);
        });
      }

      console.log("[Pipeline] Grouped:", Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, v.length])));
      setLeadsByLane(grouped);
    } catch (err) {
      console.error("[Pipeline] fetchLeads error:", err);
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  // ── Init + realtime ──────────────────────────────────────────────────

  useEffect(() => {
    getCurrentUser().then((u) => setCurrentUserId(u?.id ?? null));
  }, []);

  useEffect(() => {
    fetchLeads();

    const channel = supabase
      .channel("pipeline-kanban")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => {
        console.log("[Pipeline] Realtime event on leads table");
        fetchLeads();
      })
      .subscribe();

    channelRef.current = channel;
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [fetchLeads]);

  // ── Patch lead (stage change / assignment) ──────────────────────────

  const patchLead = useCallback(async (
    leadId: string,
    {
      desiredStatus,
      assignedTo,
      promoteProspectOnClaim,
    }: {
      desiredStatus?: string;
      assignedTo?: string;
      promoteProspectOnClaim?: boolean;
    }
  ): Promise<boolean> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: current, error: currentErr } = await (supabase.from("leads") as any)
      .select("status, lock_version, assigned_to, last_contact_at, total_calls, disposition_code, next_call_scheduled_at, next_follow_up_at, qualification_route, notes")
      .eq("id", leadId)
      .single();

    if (currentErr || !current) {
      toast.error("Unable to load current lead state. Refresh and retry.");
      return false;
    }

    const currentStatus = normalizeStatus(current.status);
    if (!currentStatus) {
      toast.error("Lead is not in an active pipeline stage.");
      return false;
    }
    let nextStatus = desiredStatus;

    if (promoteProspectOnClaim && currentStatus === "prospect") {
      nextStatus = "lead";
    }
    if (nextStatus === currentStatus) {
      nextStatus = undefined;
    }

    if (nextStatus) {
      const precheck = precheckWorkflowStageChange({
        currentStatus: currentStatus as LeadStatus,
        targetStatus: nextStatus as LeadStatus,
        assignedTo: assignedTo ?? (current.assigned_to ?? null),
        lastContactAt: current.last_contact_at ?? null,
        totalCalls: Number(current.total_calls ?? 0),
        dispositionCode: current.disposition_code ?? null,
        nextCallScheduledAt: current.next_call_scheduled_at ?? null,
        nextFollowUpAt: current.next_follow_up_at ?? null,
        qualificationRoute: (current.qualification_route as QualificationRoute | null) ?? null,
        notes: current.notes ?? null,
      });

      if (!precheck.ok) {
        toast.error(precheck.blockingReason ?? "Stage move is missing required context.");
        return false;
      }
    }

    const body: Record<string, unknown> = { lead_id: leadId };
    if (nextStatus) body.status = nextStatus;
    if (assignedTo) body.assigned_to = assignedTo;

    let headers: Record<string, string>;
    try {
      headers = await getAuthenticatedProspectPatchHeaders(current.lock_version ?? 0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Session expired. Please sign in again.");
      return false;
    }

    const res = await fetch("/api/prospects", {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = data?.detail ?? data?.error ?? `HTTP ${res.status}`;
      if (res.status === 409) {
        toast.error("Update conflict. Refresh and retry.");
      } else if (res.status === 422) {
        toast.error(`Invalid stage transition: ${detail}`);
      } else {
        toast.error(`Lead update failed: ${detail}`);
      }
      return false;
    }

    return true;
  }, []);

  const claimLead = useCallback(async (leadId: string) => {
    if (!currentUserId) {
      toast.error("Not authenticated - cannot claim");
      return;
    }

    const ok = await patchLead(leadId, {
      assignedTo: currentUserId,
      promoteProspectOnClaim: true,
    });
    if (!ok) {
      await fetchLeads();
      return;
    }

    toast.success("Lead assigned to you");
    await fetchLeads();
  }, [currentUserId, patchLead, fetchLeads]);

  // ── Drag end ─────────────────────────────────────────────────────────

  const onDragEnd = useCallback(async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination || destination.droppableId === source.droppableId) return;

    const destinationLane = destination.droppableId as LaneId;
    const leadId = draggableId;

    // Map lane to API status
    const apiStatus = laneToApiStatus(destinationLane);

    const ok = await patchLead(leadId, { desiredStatus: apiStatus });
    if (!ok) {
      await fetchLeads();
      return;
    }

    toast.success(`Moved to ${PIPELINE_LANES.find((s) => s.id === destinationLane)?.title ?? destinationLane}`);
    await fetchLeads();
  }, [patchLead, fetchLeads]);

  // ── Delete lead ────────────────────────────────────────────────────────

  const handleDelete = useCallback(async (lead: Lead) => {
    if (!window.confirm(`Delete "${lead.owner_name}" at ${lead.address}?\n\nThis will permanently remove this lead.`)) return;
    setDeleting(lead.id);
    try {
      const result = await deleteLeadCustomerFile(lead.id);
      if (!result.ok) {
        toast.error(`Delete failed: ${result.error}`);
        return;
      }
      toast.success(`Deleted: ${lead.owner_name}`);
      await fetchLeads();
    } finally {
      setDeleting(null);
    }
  }, [fetchLeads]);

  // ── Quick Add Test Prospect ──────────────────────────────────────────

  const addTestProspect = useCallback(async () => {
    if (!showQuickAddTestProspect) {
      toast.error("Quick add is only available in development.");
      return;
    }
    setAdding(true);
    try {
      const ts = Date.now();
      const res = await fetch("/api/prospects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          apn: `TEST-${ts}`,
          county: "spokane",
          address: "1234 Test Prospect Lane",
          city: "Spokane",
          state: "WA",
          zip: "99201",
          owner_name: "Test Owner",
          estimated_value: 285000,
          equity_percent: 70,
          property_type: "SFR",
          distress_tags: ["manual-test", "high-priority", "vacant", "absentee"],
          notes: "Quick add test prospect from Pipeline",
          source: "manual-test",
          actor_id: currentUserId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        const detail = data?.detail ?? data?.error ?? `HTTP ${res.status}`;
        console.error("[Pipeline] Test prospect API failed:", detail);
        toast.error("Failed to create test prospect: " + detail);
        return;
      }

      const scoreNote = typeof data?.score === "number" ? ` (score ${data.score})` : "";
      toast.success(`Test prospect created${scoreNote} — check Working column`);
      await fetchLeads();
    } catch (err) {
      console.error("[Pipeline] addTestProspect error:", err);
      toast.error("Unexpected error creating test prospect");
    } finally {
      setAdding(false);
    }
  }, [currentUserId, fetchLeads, showQuickAddTestProspect]);

  // ── Filter by search + "Mine" toggle ────────────────────────────────

  const filteredByLane = Object.fromEntries(
    PIPELINE_LANES.map((s) => {
      let leads = leadsByLane[s.id] ?? [];
      if (showMineOnly && currentUserId) {
        leads = leads.filter((l) => l.owner_id === currentUserId);
      }
      if (!search) return [s.id, leads];
      const q = search.toLowerCase();
      return [
        s.id,
        leads.filter(
          (l) =>
            l.address.toLowerCase().includes(q) ||
            l.owner_name.toLowerCase().includes(q) ||
            l.apn.toLowerCase().includes(q) ||
            l.tags.some((t) => t.toLowerCase().includes(q))
        ),
      ];
    })
  ) as Record<LaneId, Lead[]>;

  const totalLeads = Object.values(leadsByLane).reduce((sum, arr) => sum + arr.length, 0);

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06] flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2.5">
            <Zap className="h-6 w-6 text-primary" />
            Pipeline
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Drag leads between stages - {totalLeads} total across {PIPELINE_LANES.length} lanes
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* All / Mine toggle */}
          <div className="flex rounded-[12px] border border-glass-border bg-glass/50 backdrop-blur-xl overflow-hidden">
            <button
              onClick={() => setShowMineOnly(false)}
              className={cn(
                "px-3 py-1.5 text-sm font-medium transition-all",
                !showMineOnly
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              All
            </button>
            <button
              onClick={() => setShowMineOnly(true)}
              className={cn(
                "px-3 py-1.5 text-sm font-medium transition-all border-l border-glass-border",
                showMineOnly
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Mine
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Filter pipeline..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 w-56 rounded-[12px] border border-glass-border bg-glass/50 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring/40 focus:border-primary/40 backdrop-blur-xl"
            />
          </div>

          {showQuickAddTestProspect && (
            <button
              onClick={addTestProspect}
              disabled={adding}
              className="flex items-center gap-2 px-4 py-2 bg-muted/90 hover:bg-muted text-foreground text-sm font-semibold rounded-[12px] transition-all active:scale-95 disabled:opacity-50 shadow-[0_0_12px_rgba(0,0,0,0.1)]"
            >
              <Plus className={cn("h-4 w-4", adding && "animate-spin")} />
              {adding ? "Adding..." : "Quick Add Test Prospect"}
            </button>
          )}

          <button
            onClick={fetchLeads}
            className="flex items-center gap-2 px-3 py-2 rounded-[12px] border border-glass-border bg-glass/50 text-sm text-muted-foreground hover:text-foreground hover:border-primary/20 transition-all backdrop-blur-xl"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </button>
          <CoachToggle />
        </div>
      </div>

      {/* Kanban Board + Coach */}
      <div className="flex-1 flex min-h-0">
      <div className="flex-1 overflow-x-auto p-4">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-3 h-full min-h-0" style={{ minWidth: PIPELINE_LANES.length * 280 }}>
            {PIPELINE_LANES.map((stage) => {
              const leads = filteredByLane[stage.id] ?? [];

              return (
                <div key={stage.id} className="flex flex-col w-[280px] shrink-0">
                  {/* Column header */}
                  <div
                    className="flex items-start justify-between px-3 py-2.5 rounded-t-[14px] border border-b-0"
                    style={{
                      background: stage.bg,
                      borderColor: stage.border,
                    }}
                  >
                    <div className="min-w-0">
                      <span className={cn("text-sm font-semibold", stage.text)}>
                        {stage.title}
                      </span>
                      <p className="text-xs text-muted-foreground/70 mt-0.5">
                        {LANE_HINTS[stage.id]}
                      </p>
                    </div>
                    <span
                      className="text-sm font-mono px-2 py-0.5 rounded-full"
                      style={{
                        background: stage.bg,
                        color: stage.accent,
                        border: `1px solid ${stage.border}`,
                      }}
                    >
                      {leads.length}
                    </span>
                  </div>

                  {/* Droppable zone */}
                  <Droppable droppableId={stage.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={cn(
                          "flex-1 min-h-[500px] p-2 rounded-b-[14px] border border-glass-border bg-glass/30 backdrop-blur-xl overflow-y-auto transition-all duration-200 space-y-2",
                          snapshot.isDraggingOver && "ring-2 ring-offset-2 ring-white/60 bg-white/5"
                        )}
                      >
                        <AnimatePresence mode="popLayout">
                          {leads.map((lead, index) => (
                            <LeadCard
                              key={lead.id}
                              lead={lead}
                              index={index}
                              onDelete={handleDelete}
                              isDeleting={deleting === lead.id}
                              onOpenDetail={(id) => {
                                const raw = rawDataRef.current[id];
                                if (raw) {
                                  setSelectedClientFile(clientFileFromRaw(raw.lead, raw.prop));
                                  setModalOpen(true);
                                }
                              }}
                            />
                          ))}
                        </AnimatePresence>

                        {leads.length === 0 && !loading && (
                          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/40">
                            <Award className="h-8 w-8 mb-2" />
                            <span className="text-xs">
                              {"\u2713"} Nothing here right now
                            </span>
                          </div>
                        )}

                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      </div>
      <CoachPanel />
      </div>

      <MasterClientFileModal
        clientFile={selectedClientFile}
        open={modalOpen}
        onClose={() => { setModalOpen(false); setSelectedClientFile(null); }}
        onClaim={claimLead}
        onRefresh={fetchLeads}
      />
    </div>
  );
}

// ── Simplified Lead Card ──────────────────────────────────────────────

function LeadCard({
  lead,
  index,
  onDelete,
  isDeleting,
  onOpenDetail,
}: {
  lead: Lead;
  index: number;
  onDelete: (lead: Lead) => Promise<void>;
  isDeleting: boolean;
  onOpenDetail: (id: string) => void;
}) {
  const sc = scoreColor(lead.heat_score);

  return (
    <Draggable draggableId={lead.id} index={index}>
      {(provided, snapshot) => (
        <motion.div
          ref={provided.innerRef}
          {...provided.draggableProps}
          layout
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          onClick={() => onOpenDetail(lead.id)}
          className={cn(
            "rounded-[14px] border border-glass-border bg-glass/60 backdrop-blur-2xl p-3 transition-all duration-150 group cursor-pointer",
            snapshot.isDragging && "scale-[1.03] shadow-[0_0_24px_rgba(0,0,0,0.15)] border-primary/20 z-50"
          )}
        >
          {/* Line 1: Address (bold) + Score badge */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 flex-1 min-w-0">
              <div
                {...provided.dragHandleProps}
                className="mt-0.5 text-muted-foreground/30 hover:text-muted-foreground/60 cursor-grab active:cursor-grabbing transition-colors"
              >
                <GripVertical className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className="font-semibold text-sm text-foreground leading-tight truncate"
                  style={{ textShadow: "0 0 8px rgba(0,0,0,0.15)" }}
                >
                  {lead.address}
                </div>
                {/* Line 2: Owner name */}
                <div className="text-xs text-muted-foreground mt-0.5 truncate">
                  {lead.owner_name}
                </div>
              </div>
            </div>

            {/* Score badge (top-right) */}
            <div
              className={cn(
                "shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-[8px] text-sm font-bold border",
                sc.class
              )}
            >
              <Sparkles className="h-2.5 w-2.5" />
              {lead.heat_score}
            </div>
          </div>

          {/* Bottom row: days since last contact + actions */}
          <div className="mt-2.5 flex items-center justify-between">
            <span className="text-sm text-muted-foreground/70">
              {daysAgoLabel(lead.last_contact_at)}
            </span>

            <div className="flex items-center gap-1.5">
              <a
                href={`/dialer?lead=${lead.id}`}
                onClick={(e) => e.stopPropagation()}
                title="Open in Dialer"
                className="h-6 w-6 flex items-center justify-center rounded-md text-foreground hover:bg-muted/10 transition-colors"
              >
                <Phone className="h-3.5 w-3.5" />
              </a>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(lead);
                }}
                disabled={isDeleting}
                title="Delete lead"
                className="h-6 w-6 flex items-center justify-center rounded-md text-foreground/60 hover:text-foreground hover:bg-muted/10 transition-colors disabled:opacity-40"
              >
                {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </Draggable>
  );
}
