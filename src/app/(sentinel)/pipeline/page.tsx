"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
  StarOff,
  Phone,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { getAuthenticatedProspectPatchHeaders } from "@/lib/prospect-api-client";
import { precheckWorkflowStageChange } from "@/lib/workflow-stage-precheck";
import type { LeadStatus, QualificationRoute } from "@/lib/types";
import { deriveLeadActionSummary, type UrgencyLevel } from "@/lib/action-derivation";
import { MasterClientFileModal, clientFileFromRaw, type ClientFile } from "@/components/sentinel/master-client-file-modal";

const URGENCY_LANE_RANK: Record<UrgencyLevel, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
  none: 4,
};

const PIPELINE_LANES = [
  { id: "active", title: "Active", accent: "#3b82f6", bg: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.3)", text: "text-foreground" },
  { id: "negotiation", title: "Negotiation", accent: "#f59e0b", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.3)", text: "text-foreground" },
  { id: "disposition", title: "Disposition", accent: "#f43f5e", bg: "rgba(244,63,94,0.08)", border: "rgba(244,63,94,0.3)", text: "text-foreground" },
  { id: "nurture", title: "Nurture", accent: "#0ea5e9", bg: "rgba(14,165,233,0.08)", border: "rgba(14,165,233,0.3)", text: "text-foreground" },
  { id: "closed", title: "Closed", accent: "#a855f7", bg: "rgba(168,85,247,0.08)", border: "rgba(168,85,247,0.3)", text: "text-foreground" },
] as const;

const PIPELINE_LEAD_SELECT = [
  "id",
  "property_id",
  "status",
  "pinned",
  "pinned_at",
  "pinned_by",
  "assigned_to",
  "source",
  "next_call_scheduled_at",
  "next_follow_up_at",
  "follow_up_date",
  "promoted_at",
  "created_at",
  "qualification_route",
  "last_contact_at",
  "next_action",
  "priority",
].join(", ");

const PIPELINE_PROPERTY_SELECT = [
  "id",
  "address",
  "owner_name",
].join(", ");

type LaneId = (typeof PIPELINE_LANES)[number]["id"];

function getDisplayLane(status: string): LaneId | null {
  switch (status) {
    case "prospect": case "lead": return "active";
    case "negotiation": return "negotiation";
    case "disposition": return "disposition";
    case "nurture": return "nurture";
    case "closed": return "closed";
    case "dead": case "staging": return null;
    default: return null;
  }
}

function laneToApiStatus(laneId: LaneId): string {
  if (laneId === "active") return "lead";
  return laneId;
}

interface Lead {
  id: string;
  address: string;
  owner_name: string;
  status: string;
  pinned: boolean;
  pinned_at: string | null;
  pinned_by: string | null;
  owner_id: string | null;
  source: string | null;
  follow_up_at: string | null;
  promoted_at: string | null;
  qualification_route: string | null;
  last_contact_at: string | null;
  next_action: string | null;
  heat_score: number;
}

function normalizeStatus(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().replace(/\s+/g, "_");
  if (lower === "prospects") return "prospect";
  if (lower === "leads" || lower === "my_lead" || lower === "my_leads" || lower === "my leads") return "lead";
  return lower;
}

function daysAgoLabel(dateStr: string | null): string {
  if (!dateStr) return "No contact";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  if (diff <= 0) return "Today";
  if (diff === 1) return "1d ago";
  return `${diff}d ago`;
}

function urgencyColor(lead: Lead): string {
  if (!lead.follow_up_at) return "text-muted-foreground";
  const diff = Math.floor((new Date(lead.follow_up_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return "text-red-400";
  if (diff === 0) return "text-amber-400";
  return "text-muted-foreground";
}

export default function PipelinePage() {
  const [leadsByLane, setLeadsByLane] = useState<Record<LaneId, Lead[]>>(
    () => Object.fromEntries(PIPELINE_LANES.map((s) => [s.id, []])) as unknown as Record<LaneId, Lead[]>
  );
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawDataRef = useRef<Record<string, { lead: any; prop: any }>>({});
  const [selectedClientFile, setSelectedClientFile] = useState<ClientFile | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: leadsRaw, error: leadsErr } = await (supabase.from("leads") as any)
        .select(PIPELINE_LEAD_SELECT)
        .eq("pinned", true)
        .neq("status", "dead")
        .order("priority", { ascending: false });

      if (leadsErr) {
        console.error("[Pipeline] Leads fetch failed:", leadsErr);
        setLoading(false);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const propertyIds: string[] = [...new Set((leadsRaw as any[]).map((l: any) => l.property_id).filter(Boolean))];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const propsMap: Record<string, any> = {};

      if (propertyIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: propsData } = await (supabase.from("properties") as any)
          .select(PIPELINE_PROPERTY_SELECT)
          .in("id", propertyIds);
        if (propsData) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const p of propsData as any[]) propsMap[p.id] = p;
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
        if (!lane) continue;

        rawMap[raw.id] = { lead: raw, prop };

        grouped[lane].push({
          id: raw.id,
          address: prop.address ?? "Unknown address",
          owner_name: prop.owner_name ?? "Unknown",
          status: canonicalStatus,
          pinned: raw.pinned === true,
          pinned_at: raw.pinned_at ?? null,
          pinned_by: raw.pinned_by ?? null,
          owner_id: raw.assigned_to ?? null,
          source: raw.source ?? null,
          follow_up_at: raw.next_call_scheduled_at ?? raw.next_follow_up_at ?? raw.follow_up_date ?? null,
          promoted_at: raw.promoted_at ?? raw.created_at ?? null,
          qualification_route: raw.qualification_route ?? null,
          last_contact_at: raw.last_contact_at ?? null,
          next_action: raw.next_action ?? null,
          heat_score: raw.priority ?? 0,
        });
      }
      rawDataRef.current = rawMap;

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
          return (b.heat_score ?? 0) - (a.heat_score ?? 0);
        });
      }

      setLeadsByLane(grouped);
    } catch (err) {
      console.error("[Pipeline] fetchLeads error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getCurrentUser().then((u) => setCurrentUserId(u?.id ?? null));
  }, []);

  useEffect(() => {
    fetchLeads();
    const channel = supabase
      .channel("pipeline-kanban")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => fetchLeads())
      .subscribe();
    channelRef.current = channel;
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [fetchLeads]);

  const patchLead = useCallback(async (
    leadId: string,
    { desiredStatus }: { desiredStatus?: string }
  ): Promise<boolean> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: current, error: currentErr } = await (supabase.from("leads") as any)
      .select("status, lock_version, assigned_to, last_contact_at, total_calls, disposition_code, next_call_scheduled_at, next_follow_up_at, qualification_route, notes")
      .eq("id", leadId)
      .single();

    if (currentErr || !current) {
      toast.error("Unable to load current lead state.");
      return false;
    }

    const currentStatus = normalizeStatus(current.status);
    if (!currentStatus) {
      toast.error("Lead is not in an active stage.");
      return false;
    }
    let nextStatus = desiredStatus;
    if (nextStatus === currentStatus) nextStatus = undefined;

    if (nextStatus) {
      const precheck = precheckWorkflowStageChange({
        currentStatus: currentStatus as LeadStatus,
        targetStatus: nextStatus as LeadStatus,
        assignedTo: current.assigned_to ?? null,
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

    let headers: Record<string, string>;
    try {
      headers = await getAuthenticatedProspectPatchHeaders(current.lock_version ?? 0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Session expired.");
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
      if (res.status === 409) toast.error("Update conflict. Refresh and retry.");
      else if (res.status === 422) toast.error(`Invalid stage transition: ${detail}`);
      else toast.error(`Lead update failed: ${detail}`);
      return false;
    }

    return true;
  }, []);

  const onDragEnd = useCallback(async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination || destination.droppableId === source.droppableId) return;

    const destinationLane = destination.droppableId as LaneId;
    const apiStatus = laneToApiStatus(destinationLane);

    const ok = await patchLead(draggableId, { desiredStatus: apiStatus });
    if (!ok) { await fetchLeads(); return; }

    toast.success(`Moved to ${PIPELINE_LANES.find((s) => s.id === destinationLane)?.title ?? destinationLane}`);
    await fetchLeads();
  }, [patchLead, fetchLeads]);

  const toggleActive = useCallback(async (leadId: string, active: boolean) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      toast.error("Session expired");
      return;
    }

    const res = await fetch(`/api/leads/${leadId}/pin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ pinned: active }),
    });

    if (!res.ok) {
      toast.error("Failed to update");
      return;
    }

    toast.success(active ? "Marked Active" : "Removed from Active");
    await fetchLeads();
  }, [fetchLeads]);

  const filteredByLane = Object.fromEntries(
    PIPELINE_LANES.map((s) => {
      let leads = leadsByLane[s.id] ?? [];
      if (!search) return [s.id, leads];
      const q = search.toLowerCase();
      return [
        s.id,
        leads.filter(
          (l) =>
            l.address.toLowerCase().includes(q) ||
            l.owner_name.toLowerCase().includes(q)
        ),
      ];
    })
  ) as Record<LaneId, Lead[]>;

  const totalLeads = Object.values(leadsByLane).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-overlay-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Active
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Deals being worked — drag between stages. {totalLeads} leads.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/leads"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            Go to Lead Queue <ArrowRight className="h-3 w-3" />
          </a>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Filter by name or address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 w-48 rounded-[12px] border border-glass-border bg-glass/50 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring/40 focus:border-primary/40 backdrop-blur-xl"
            />
          </div>

          <button
            onClick={fetchLeads}
            className="flex items-center gap-2 px-3 py-2 rounded-[12px] border border-glass-border bg-glass/50 text-sm text-muted-foreground hover:text-foreground hover:border-primary/20 transition-all backdrop-blur-xl"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto p-4">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-3 h-full min-h-0" style={{ minWidth: PIPELINE_LANES.length * 260 }}>
            {PIPELINE_LANES.map((stage) => {
              const leads = filteredByLane[stage.id] ?? [];
              return (
                <div key={stage.id} className="flex flex-col w-[260px] shrink-0">
                  <div
                    className="flex items-center justify-between px-3 py-2 rounded-t-[12px] border border-b-0"
                    style={{ background: stage.bg, borderColor: stage.border }}
                  >
                    <span className={cn("text-sm font-semibold", stage.text)}>{stage.title}</span>
                    <span
                      className="text-sm font-mono px-2 py-0.5 rounded-full"
                      style={{ background: stage.bg, color: stage.accent, border: `1px solid ${stage.border}` }}
                    >
                      {leads.length}
                    </span>
                  </div>

                  <Droppable droppableId={stage.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={cn(
                          "flex-1 min-h-[400px] p-2 rounded-b-[12px] border border-glass-border bg-glass/30 overflow-y-auto space-y-2",
                          snapshot.isDraggingOver && "ring-2 ring-offset-2 ring-overlay-60 bg-overlay-5"
                        )}
                      >
                        <AnimatePresence mode="popLayout">
                          {leads.map((lead, index) => (
                            <PipelineCard
                              key={lead.id}
                              lead={lead}
                              index={index}
                              onToggleActive={toggleActive}
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
                          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/40">
                            <Award className="h-6 w-6 mb-2" />
                            <span className="text-xs">Empty</span>
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

      <MasterClientFileModal
        clientFile={selectedClientFile}
        open={modalOpen}
        onClose={() => { setModalOpen(false); setSelectedClientFile(null); }}
        onRefresh={fetchLeads}
      />
    </div>
  );
}

function PipelineCard({
  lead,
  index,
  onToggleActive,
  onOpenDetail,
}: {
  lead: Lead;
  index: number;
  onToggleActive: (id: string, active: boolean) => void;
  onOpenDetail: (id: string) => void;
}) {
  const dueLine = (() => {
    if (lead.next_action) {
      if (!lead.follow_up_at) return lead.next_action;
      const diff = Math.floor((new Date(lead.follow_up_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      const timing = diff < 0 ? `${Math.abs(diff)}d overdue` : diff === 0 ? "today" : `in ${diff}d`;
      return `${lead.next_action} — ${timing}`;
    }
    if (lead.follow_up_at) {
      const diff = Math.floor((new Date(lead.follow_up_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (diff < 0) return `${Math.abs(diff)}d overdue`;
      if (diff === 0) return "Due today";
      return `Due in ${diff}d`;
    }
    return "No next action";
  })();

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
            "rounded-[12px] border border-glass-border bg-glass/60 p-3 transition-all duration-150 group cursor-pointer",
            snapshot.isDragging && "scale-[1.03] shadow-[0_0_24px_var(--shadow-soft)] border-primary/20 z-50"
          )}
        >
          <div className="flex items-start gap-2">
            <div
              {...provided.dragHandleProps}
              className="mt-0.5 text-muted-foreground/30 hover:text-muted-foreground/60 cursor-grab active:cursor-grabbing transition-colors"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm text-foreground leading-tight truncate">
                {lead.address}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {lead.owner_name}
              </p>
            </div>
            <button
              type="button"
              aria-label="Remove Active"
              onClick={(event) => {
                event.stopPropagation();
                onToggleActive(lead.id, false);
              }}
              className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted/10 transition-colors"
            >
              <StarOff className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-2 flex items-center justify-between text-xs">
            <span className={cn("truncate max-w-[65%]", urgencyColor(lead))}>
              {dueLine}
            </span>
            <span className="text-muted-foreground/60 shrink-0">
              {daysAgoLabel(lead.last_contact_at)}
            </span>
          </div>
        </motion.div>
      )}
    </Draggable>
  );
}
