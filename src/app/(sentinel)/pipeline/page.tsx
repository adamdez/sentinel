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
  UserCheck,
  User,
  Clock,
  Zap,
  Search,
  RefreshCw,
  GripVertical,
  Sparkles,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { getAuthenticatedProspectPatchHeaders } from "@/lib/prospect-api-client";
import { precheckWorkflowStageChange } from "@/lib/workflow-stage-precheck";
import type { LeadStatus, QualificationRoute } from "@/lib/types";
import { MasterClientFileModal, clientFileFromRaw, type ClientFile } from "@/components/sentinel/master-client-file-modal";

// ── Pipeline lane definitions (workflow stages + assignment segment) ──────────────────────────────────────────────────

const PIPELINE_LANES = [
  {
    id: "prospect",
    title: "Prospects",
    accent: "#3b82f6",
    bg: "rgba(59,130,246,0.08)",
    border: "rgba(59,130,246,0.3)",
    text: "text-blue-400",
  },
  {
    id: "lead",
    title: "Leads",
    accent: "#10b981",
    bg: "rgba(16,185,129,0.08)",
    border: "rgba(16,185,129,0.3)",
    text: "text-emerald-400",
  },
  {
    id: "mine",
    title: "My Leads",
    accent: "#8b5cf6",
    bg: "rgba(139,92,246,0.08)",
    border: "rgba(139,92,246,0.3)",
    text: "text-violet-400",
  },
  {
    id: "negotiation",
    title: "Negotiation",
    accent: "#f59e0b",
    bg: "rgba(245,158,11,0.08)",
    border: "rgba(245,158,11,0.3)",
    text: "text-amber-400",
  },
  {
    id: "disposition",
    title: "Disposition",
    accent: "#f43f5e",
    bg: "rgba(244,63,94,0.08)",
    border: "rgba(244,63,94,0.3)",
    text: "text-rose-400",
  },
  {
    id: "nurture",
    title: "Nurture",
    accent: "#0ea5e9",
    bg: "rgba(14,165,233,0.08)",
    border: "rgba(14,165,233,0.3)",
    text: "text-sky-400",
  },
  {
    id: "dead",
    title: "Dead",
    accent: "#71717a",
    bg: "rgba(113,113,122,0.08)",
    border: "rgba(113,113,122,0.3)",
    text: "text-zinc-400",
  },
] as const;

type LaneId = (typeof PIPELINE_LANES)[number]["id"];
type CanonicalStageId = Exclude<LaneId, "mine">;
const LANE_HINTS: Record<LaneId, string> = {
  prospect: "Newly promoted records to triage",
  lead: "Active team workload queue",
  mine: "Assignment segment: owned by you",
  negotiation: "Active offer and terms conversations",
  disposition: "Buyer-side coordination signals",
  nurture: "Scheduled long-cycle follow-up",
  dead: "Closed-out or non-viable records",
};

const CANONICAL_STAGE_IDS = new Set<CanonicalStageId>([
  "prospect",
  "lead",
  "negotiation",
  "disposition",
  "nurture",
  "dead",
]);

interface Lead {
  id: string;
  apn: string;
  address: string;
  owner_name: string;
  heat_score: number;
  status: CanonicalStageId;
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
}

// ── Helpers ────────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 85) return { label: "FIRE", class: "text-orange-400 bg-orange-500/15 border-orange-500/30" };
  if (score >= 65) return { label: "HOT", class: "text-red-400 bg-red-500/15 border-red-500/30" };
  if (score >= 40) return { label: "WARM", class: "text-yellow-400 bg-yellow-500/15 border-yellow-500/30" };
  return { label: "COLD", class: "text-blue-400 bg-blue-500/15 border-blue-500/30" };
}

function isClaimExpired(expires?: string | null) {
  return expires ? new Date(expires) < new Date() : false;
}

function firstName(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  return trimmed.split(" ")[0] ?? null;
}

function normalizeStatus(raw: string | null | undefined): CanonicalStageId | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().replace(/\s+/g, "_");
  if (CANONICAL_STAGE_IDS.has(lower as CanonicalStageId)) return lower as CanonicalStageId;
  if (lower === "prospects") return "prospect";
  // Legacy compatibility: old rows may still hold "my_lead*" values. Canonicalize to "lead".
  if (lower === "leads" || lower === "my_lead" || lower === "my_leads" || lower === "my leads") return "lead";
  // Closed/staging are intentionally excluded from active pipeline lanes.
  if (lower === "closed" || lower === "staging") return null;
  console.warn(`[Pipeline] Ignoring unsupported lead status "${raw}"`);
  return null;
}

function resolveLane(
  status: CanonicalStageId,
  assignedTo: string | null,
  currentUserId: string | null
): LaneId {
  if (status === "lead" && assignedTo && currentUserId && assignedTo === currentUserId) {
    return "mine";
  }
  return status;
}

// ── Main component ─────────────────────────────────────────────────────

export default function PipelinePage() {
  const [leadsByLane, setLeadsByLane] = useState<Record<LaneId, Lead[]>>(
    () => Object.fromEntries(PIPELINE_LANES.map((s) => [s.id, []])) as unknown as Record<LaneId, Lead[]>
  );
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const showQuickAddTestProspect = process.env.NODE_ENV === "development";
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawDataRef = useRef<Record<string, { lead: any; prop: any }>>({});
  const [selectedClientFile, setSelectedClientFile] = useState<ClientFile | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // ── Fetch all leads + properties, group by lane ─────────────────────

  const fetchLeads = useCallback(async () => {
    console.log("[Pipeline] fetchLeads triggered");
    setLoading(true);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: leadsRaw, error: leadsErr } = await (supabase.from("leads") as any)
        .select("*")
        .neq("status", "staging")
        .neq("status", "closed")
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
        if (!canonicalStatus) {
          continue;
        }
        const lane = resolveLane(canonicalStatus, raw.assigned_to ?? null, currentUserId);
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
        });
      }
      rawDataRef.current = rawMap;

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

  // ── Claim lead ───────────────────────────────────────────────────────

  const patchLead = useCallback(async (
    leadId: string,
    {
      desiredStatus,
      assignedTo,
      promoteProspectOnClaim,
    }: {
      desiredStatus?: CanonicalStageId;
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
  }, [currentUserId]);

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

    toast.success("Lead assigned to you - visible in the My Leads segment");
    await fetchLeads();
  }, [currentUserId, patchLead, fetchLeads]);

  // ── Drag end ─────────────────────────────────────────────────────────

  const onDragEnd = useCallback(async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination || destination.droppableId === source.droppableId) return;

    const sourceLane = source.droppableId as LaneId;
    const destinationLane = destination.droppableId as LaneId;
    const leadId = draggableId;

    // "My Leads" is an assignment segment (assigned_to === current user), not a persisted status.
    if (destinationLane === "mine") {
      await claimLead(leadId);
      return;
    }

    // Dragging from My Leads back to Leads is a no-op because assignment still applies.
    if (sourceLane === "mine" && destinationLane === "lead") {
      toast("My Leads is assignment-based. Use a stage move to change status.");
      return;
    }

    const ok = await patchLead(leadId, { desiredStatus: destinationLane });
    if (!ok) {
      await fetchLeads();
      return;
    }

    toast.success(`Moved to ${PIPELINE_LANES.find((s) => s.id === destinationLane)?.title ?? destinationLane}`);
    await fetchLeads();
  }, [claimLead, patchLead, fetchLeads]);

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
      toast.success(`Test prospect created${scoreNote} — check Prospects column`);
      await fetchLeads();
    } catch (err) {
      console.error("[Pipeline] addTestProspect error:", err);
      toast.error("Unexpected error creating test prospect");
    } finally {
      setAdding(false);
    }
  }, [currentUserId, fetchLeads, showQuickAddTestProspect]);

  // ── Filter by search ─────────────────────────────────────────────────

  const filteredByLane = Object.fromEntries(
    PIPELINE_LANES.map((s) => {
      const leads = leadsByLane[s.id] ?? [];
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
            <Zap className="h-6 w-6 text-cyan" />
            Pipeline
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Drag leads between workflow stages - {totalLeads} total across {PIPELINE_LANES.length} lanes
          </p>
          <p className="text-[11px] text-muted-foreground/70 mt-1">
            My Leads is assignment-based. Move stages for lifecycle changes.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Filter pipeline..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 w-56 rounded-[12px] border border-glass-border bg-glass/50 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cyan/40 focus:border-cyan/40 backdrop-blur-xl"
            />
          </div>

          {showQuickAddTestProspect && (
            <button
              onClick={addTestProspect}
              disabled={adding}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500/90 hover:bg-emerald-500 text-black text-sm font-semibold rounded-[12px] transition-all active:scale-95 disabled:opacity-50 shadow-[0_0_12px_rgba(16,185,129,0.3)]"
            >
              <Plus className={cn("h-4 w-4", adding && "animate-spin")} />
              {adding ? "Adding..." : "Quick Add Test Prospect"}
            </button>
          )}

          <button
            onClick={fetchLeads}
            className="flex items-center gap-2 px-3 py-2 rounded-[12px] border border-glass-border bg-glass/50 text-sm text-muted-foreground hover:text-foreground hover:border-cyan/20 transition-all backdrop-blur-xl"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {/* Kanban Board */}
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
                      <p className="text-[9px] text-muted-foreground/70 mt-0.5">
                        {LANE_HINTS[stage.id]}
                      </p>
                    </div>
                    <span
                      className="text-[11px] font-mono px-2 py-0.5 rounded-full"
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
                              laneId={stage.id}
                              currentUserId={currentUserId}
                              onClaim={claimLead}
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
                              {stage.id === "mine" ? "No leads assigned to you" : "No leads in this lane"}
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

// ── Lead Card ──────────────────────────────────────────────────────────

function LeadCard({
  lead,
  index,
  laneId,
  currentUserId,
  onClaim,
  onOpenDetail,
}: {
  lead: Lead;
  index: number;
  laneId: LaneId;
  currentUserId: string | null;
  onClaim: (id: string) => Promise<void>;
  onOpenDetail: (id: string) => void;
}) {
  const sc = scoreColor(lead.heat_score);
  const expired = isClaimExpired(lead.claim_expires_at);
  const isMine = lead.owner_id === currentUserId;
  const canClaim = laneId !== "mine" && !lead.owner_id;
  const followUpDueMs = lead.follow_up_at ? new Date(lead.follow_up_at).getTime() : NaN;
  const followUpOverdue =
    lead.status !== "dead" &&
    !Number.isNaN(followUpDueMs) &&
    followUpDueMs < Date.now();
  const promotedMs = lead.promoted_at ? new Date(lead.promoted_at).getTime() : NaN;
  const needsQualification =
    lead.status === "lead" &&
    !lead.qualification_route &&
    !Number.isNaN(promotedMs) &&
    Date.now() - promotedMs > 48 * 60 * 60 * 1000;
  const assigneeFirstName = firstName(lead.assignee_name);

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
            "rounded-[14px] border border-glass-border bg-glass/60 backdrop-blur-2xl p-3 transition-all duration-150 group holo-border cursor-pointer",
            snapshot.isDragging && "scale-[1.03] shadow-[0_0_24px_rgba(0,212,255,0.15)] border-cyan/20 z-50"
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 flex-1 min-w-0">
              <div
                {...provided.dragHandleProps}
                className="mt-0.5 text-muted-foreground/30 hover:text-muted-foreground/60 cursor-grab active:cursor-grabbing transition-colors"
              >
                <GripVertical className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[10px] text-muted-foreground/60 tracking-wide">
                  {lead.apn}
                </div>
                <div
                  className="font-semibold text-sm text-foreground leading-tight mt-0.5 truncate"
                  style={{ textShadow: "0 0 8px rgba(0,212,255,0.15)" }}
                >
                  {lead.address}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">
                  {lead.owner_name}
                </div>
              </div>
            </div>

            <div
              className={cn(
                "shrink-0 flex items-center gap-1 px-2 py-1 rounded-[12px] text-[11px] font-bold border",
                sc.class
              )}
            >
              <Sparkles className="h-3 w-3" />
              {lead.heat_score}
              <span className="text-[9px] opacity-70 font-medium">{sc.label}</span>
            </div>
          </div>

          {lead.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {lead.tags.slice(0, 3).map((tag, i) => (
                <span
                  key={i}
                  className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/5 text-muted-foreground border border-white/[0.06]"
                >
                  {tag}
                </span>
              ))}
              {lead.tags.length > 3 && (
                <span className="text-[9px] px-1.5 py-0.5 text-muted-foreground/50">
                  +{lead.tags.length - 3}
                </span>
              )}
            </div>
          )}

          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {lead.daysUntilDistress != null && (
              <span className={cn(
                "text-[9px] font-bold px-1.5 py-0.5 rounded border inline-flex items-center gap-0.5",
                lead.predictiveLabel === "imminent" ? "text-red-400 bg-red-500/10 border-red-500/25" :
                lead.predictiveLabel === "likely" ? "text-orange-400 bg-orange-500/10 border-orange-500/25" :
                lead.predictiveLabel === "possible" ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/25" :
                "text-blue-400 bg-blue-500/10 border-blue-500/25"
              )}>
                ⚡ {lead.daysUntilDistress}d
              </span>
            )}
            {lead.source && (
              <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-cyan/8 text-cyan/70 border border-cyan/15">
                {lead.source}
              </span>
            )}
            {needsQualification && (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded border bg-amber-500/12 text-amber-300 border-amber-500/30">
                Needs Qualification
              </span>
            )}
            {followUpOverdue && lead.status !== "nurture" && (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded border bg-red-500/12 text-red-300 border-red-500/30">
                Needs Follow-Up
              </span>
            )}
            {lead.status === "nurture" && (() => {
              const fuMs = lead.follow_up_at ? new Date(lead.follow_up_at).getTime() : NaN;
              const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
              const isStale = !Number.isNaN(fuMs) ? fuMs < sevenDaysAgo : true; // no follow-up = stale
              return isStale ? (
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded border bg-red-500/12 text-red-300 border-red-500/30">
                  Stale Nurture
                </span>
              ) : null;
            })()}
            {lead.qualification_route === "escalate" && (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded border bg-amber-500/12 text-amber-300 border-amber-500/30">
                Escalated Review
              </span>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between">
            {lead.owner_id && !expired ? (
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                <UserCheck className="h-3.5 w-3.5" />
                {isMine ? "Assigned: You" : assigneeFirstName ? `Assigned: ${assigneeFirstName}` : "Assigned"}
              </div>
            ) : expired ? (
              <div className="flex items-center gap-1.5 text-[11px] text-rose-400">
                <Clock className="h-3.5 w-3.5" />
                Lock Expired
              </div>
            ) : (
              <div />
            )}

            {canClaim && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClaim(lead.id);
                }}
                className="text-[11px] px-3 py-1 bg-cyan/90 hover:bg-cyan text-black font-semibold rounded-[12px] flex items-center gap-1.5 transition-all active:scale-95 shadow-[0_0_8px_rgba(0,212,255,0.3)]"
              >
                <User className="h-3 w-3" />
                CLAIM
              </button>
            )}
          </div>
        </motion.div>
      )}
    </Draggable>
  );
}



