"use client";

import { useEffect, useState, useCallback } from "react";
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
} from "lucide-react";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { cn } from "@/lib/utils";

// ── Stage definitions ──────────────────────────────────────────────────

const STAGES = [
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
    id: "my_lead",
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

type StageId = (typeof STAGES)[number]["id"];

interface Lead {
  id: string;
  apn: string;
  address: string;
  owner_name: string;
  heat_score: number;
  status: StageId;
  owner_id: string | null;
  claimed_at: string | null;
  claim_expires_at: string | null;
  tags: string[];
  source: string | null;
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

// ── Main component ─────────────────────────────────────────────────────

export default function PipelinePage() {
  const [leadsByStage, setLeadsByStage] = useState<Record<StageId, Lead[]>>(
    () => Object.fromEntries(STAGES.map((s) => [s.id, []])) as unknown as Record<StageId, Lead[]>
  );
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchLeads = useCallback(async () => {
    setLoading(true);

    // Step 1: fetch leads
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: leadsRaw, error: leadsErr } = await (supabase.from("leads") as any)
      .select("*")
      .order("priority", { ascending: false });

    if (leadsErr) {
      console.error("[Pipeline] Leads fetch failed:", leadsErr);
      setLoading(false);
      return;
    }

    // Step 2: fetch properties for those leads
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const propertyIds: string[] = [...new Set((leadsRaw as any[]).map((l: any) => l.property_id).filter(Boolean))];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let propsMap: Record<string, any> = {};

    if (propertyIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: propsData } = await (supabase.from("properties") as any)
        .select("*")
        .in("id", propertyIds);

      if (propsData) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const p of propsData as any[]) {
          propsMap[p.id] = p;
        }
      }
    }

    // Step 3: merge and group by stage
    const grouped: Record<StageId, Lead[]> = STAGES.reduce((acc, stage) => {
      acc[stage.id] = [];
      return acc;
    }, {} as Record<StageId, Lead[]>);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const raw of leadsRaw as any[]) {
      const prop = propsMap[raw.property_id] ?? {};
      const status: StageId = raw.status || "prospect";
      if (!grouped[status]) continue;

      grouped[status].push({
        id: raw.id,
        apn: prop.apn ?? raw.property_id?.slice(0, 12) ?? "—",
        address: prop.address ?? "Unknown address",
        owner_name: prop.owner_name ?? "Unknown",
        heat_score: raw.priority ?? 0,
        status,
        owner_id: raw.assigned_to ?? null,
        claimed_at: raw.claimed_at ?? null,
        claim_expires_at: raw.claim_expires_at ?? null,
        tags: raw.tags ?? [],
        source: raw.source ?? null,
      });
    }

    setLeadsByStage(grouped);
    setLoading(false);
  }, []);

  useEffect(() => {
    getCurrentUser().then((u) => setCurrentUserId(u?.id ?? null));
    fetchLeads();

    const channel = supabase
      .channel("pipeline-kanban")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => fetchLeads())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchLeads]);

  // ── Claim ────────────────────────────────────────────────────────────

  const claimLead = async (leadId: string) => {
    if (!currentUserId) return;
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("leads") as any)
      .update({
        status: "my_lead",
        assigned_to: currentUserId,
        claimed_at: new Date().toISOString(),
        claim_expires_at: expires,
      })
      .eq("id", leadId);

    if (!error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("event_log") as any).insert({
        entity_type: "lead",
        entity_id: leadId,
        action: "CLAIMED",
        actor_id: currentUserId,
        details: { note: "24-hour soft lock applied via Pipeline" },
      });
    }
  };

  // ── Drag end ─────────────────────────────────────────────────────────

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination || destination.droppableId === source.droppableId) return;

    const newStatus = destination.droppableId as StageId;
    const leadId = draggableId;

    // Optimistic update
    setLeadsByStage((prev) => {
      const next = { ...prev };
      const srcStage = source.droppableId as StageId;
      const lead = next[srcStage].find((l) => l.id === leadId);
      if (!lead) return prev;

      next[srcStage] = next[srcStage].filter((l) => l.id !== leadId);
      const updated = { ...lead, status: newStatus };
      const destList = [...next[newStatus]];
      destList.splice(destination.index, 0, updated);
      next[newStatus] = destList;
      return next;
    });

    if (newStatus === "my_lead") {
      const allLeads = Object.values(leadsByStage).flat();
      const lead = allLeads.find((l) => l.id === leadId);
      if (lead && !lead.owner_id) {
        await claimLead(leadId);
        return;
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("leads") as any)
      .update({ status: newStatus })
      .eq("id", leadId);

    if (!error && currentUserId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("event_log") as any).insert({
        entity_type: "lead",
        entity_id: leadId,
        action: "STATUS_CHANGED",
        actor_id: currentUserId,
        details: { from: source.droppableId, to: newStatus },
      });
    }

    if (error) fetchLeads();
  };

  // ── Filter by search ─────────────────────────────────────────────────

  const filteredByStage = Object.fromEntries(
    STAGES.map((s) => {
      const leads = leadsByStage[s.id] ?? [];
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
  ) as Record<StageId, Lead[]>;

  const totalLeads = Object.values(leadsByStage).reduce((sum, arr) => sum + arr.length, 0);

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-glass-border">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2.5">
            <Zap className="h-6 w-6 text-neon" />
            Pipeline
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Drag leads between stages — {totalLeads} total across {STAGES.length} stages
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
              className="pl-9 pr-4 py-2 w-56 rounded-lg border border-glass-border bg-glass/50 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-neon/40 focus:border-neon/40 backdrop-blur-xl"
            />
          </div>
          <button
            onClick={fetchLeads}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-glass-border bg-glass/50 text-sm text-muted-foreground hover:text-foreground hover:border-neon/30 transition-all backdrop-blur-xl"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto p-4">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-3 h-full min-h-0" style={{ minWidth: STAGES.length * 280 }}>
            {STAGES.map((stage) => {
              const leads = filteredByStage[stage.id] ?? [];

              return (
                <div key={stage.id} className="flex flex-col w-[280px] shrink-0">
                  {/* Column header */}
                  <div
                    className="flex items-center justify-between px-3 py-2.5 rounded-t-xl border border-b-0"
                    style={{
                      background: stage.bg,
                      borderColor: stage.border,
                    }}
                  >
                    <span className={cn("text-sm font-semibold", stage.text)}>
                      {stage.title}
                    </span>
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
                          "flex-1 min-h-[500px] p-2 rounded-b-xl border border-glass-border bg-glass/30 backdrop-blur-xl overflow-y-auto transition-all duration-200 space-y-2",
                          snapshot.isDraggingOver && "ring-1 bg-glass/50"
                        )}
                        style={
                          snapshot.isDraggingOver
                            ? { ringColor: stage.accent, borderColor: stage.border }
                            : undefined
                        }
                      >
                        <AnimatePresence mode="popLayout">
                          {leads.map((lead, index) => (
                            <LeadCard
                              key={lead.id}
                              lead={lead}
                              index={index}
                              stageId={stage.id}
                              currentUserId={currentUserId}
                              onClaim={claimLead}
                            />
                          ))}
                        </AnimatePresence>

                        {leads.length === 0 && !loading && (
                          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/40">
                            <Award className="h-8 w-8 mb-2" />
                            <span className="text-xs">No leads</span>
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
    </div>
  );
}

// ── Lead Card ──────────────────────────────────────────────────────────

function LeadCard({
  lead,
  index,
  stageId,
  currentUserId,
  onClaim,
}: {
  lead: Lead;
  index: number;
  stageId: StageId;
  currentUserId: string | null;
  onClaim: (id: string) => Promise<void>;
}) {
  const sc = scoreColor(lead.heat_score);
  const expired = isClaimExpired(lead.claim_expires_at);
  const isMine = lead.owner_id === currentUserId;
  const canClaim = stageId !== "my_lead" && !lead.owner_id;

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
          className={cn(
            "rounded-xl border border-glass-border bg-glass/60 backdrop-blur-2xl p-3 transition-all duration-150 group holo-border",
            snapshot.isDragging && "scale-[1.03] shadow-[0_0_24px_rgba(0,255,136,0.15)] border-neon/30 z-50"
          )}
        >
          {/* Drag handle + score */}
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
                  style={{ textShadow: "0 0 8px rgba(0,255,136,0.15)" }}
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
                "shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold border",
                sc.class
              )}
            >
              <Sparkles className="h-3 w-3" />
              {lead.heat_score}
              <span className="text-[9px] opacity-70 font-medium">{sc.label}</span>
            </div>
          </div>

          {/* Tags */}
          {lead.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {lead.tags.slice(0, 3).map((tag, i) => (
                <span
                  key={i}
                  className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/5 text-muted-foreground border border-glass-border"
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

          {/* Source badge */}
          {lead.source && (
            <div className="mt-2">
              <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-neon/10 text-neon/70 border border-neon/20">
                {lead.source}
              </span>
            </div>
          )}

          {/* Footer: ownership + claim */}
          <div className="mt-3 flex items-center justify-between">
            {lead.owner_id && !expired ? (
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                <UserCheck className="h-3.5 w-3.5" />
                {isMine ? "Mine" : "Owned"}
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
                className="text-[11px] px-3 py-1 bg-neon/90 hover:bg-neon text-black font-semibold rounded-lg flex items-center gap-1.5 transition-all active:scale-95 shadow-[0_0_8px_rgba(0,255,136,0.3)]"
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
