"use client";

import { useState, useEffect, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import { GripVertical, Phone, MoreHorizontal, Loader2, Clock } from "lucide-react";
import { GlassCard } from "./glass-card";
import { AIScoreBadge } from "./ai-score-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AIScore, LeadStatus } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { getAuthenticatedProspectPatchHeaders } from "@/lib/prospect-api-client";
import { requiresNextAction } from "@/lib/lead-guardrails";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface PipelineItem {
  id: string;
  name: string;
  address: string;
  phone?: string;
  status: string;
  score: AIScore;
  distressType: string;
  propertyId?: string;
  equityPercent?: number | null;
  lastContactAt?: string | null;
}

// Pipeline shows only leads with real activity — not staging/prospect (those live in Lead Queue)
// "Active" = made contact, seller didn't refuse. Could move to negotiation.
const COLUMNS: { id: string; title: string; color: string }[] = [
  { id: "lead", title: "Active", color: "bg-primary" },
  { id: "negotiation", title: "Negotiation", color: "bg-muted" },
  { id: "disposition", title: "Disposition", color: "bg-muted" },
  { id: "nurture", title: "Nurture", color: "bg-muted" },
  { id: "closed", title: "Closed", color: "bg-muted" },
  { id: "dead", title: "Dead", color: "bg-muted" },
];

function formatFreshness(dateStr: string | null | undefined): string {
  if (!dateStr) return "never contacted";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo ago`;
}

function SortableCard({ item, onCall }: { item: PipelineItem; onCall?: (phone: string) => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, data: { status: item.status } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group rounded-[14px] border border-glass-border glass-card p-4 transition-all duration-100",
        isDragging && "drag-active",
        item.score.label === "platinum" && "ring-1 ring-primary/25 border-primary/20"
      )}
    >
      <div className="flex items-start gap-3">
        <button
          {...attributes}
          {...listeners}
          className="mt-1 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-50 transition-opacity"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{item.name}</p>
              <p className="text-xs text-muted-foreground truncate">{item.address}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {item.equityPercent != null && (
                  <span className={cn(
                    "text-sm font-medium",
                    item.equityPercent >= 50 ? "text-foreground" : item.equityPercent >= 25 ? "text-foreground" : "text-foreground"
                  )}>
                    {Math.round(item.equityPercent)}% equity
                  </span>
                )}
                {item.phone && (
                  <Phone className="h-2.5 w-2.5 text-primary shrink-0" />
                )}
              </div>
            </div>
            <AIScoreBadge score={item.score} size="sm" />
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-sm">
              {item.distressType}
            </Badge>
            <span className={cn(
              "flex items-center gap-0.5 text-sm",
              !item.lastContactAt ? "text-muted-foreground/50" : "text-muted-foreground"
            )}>
              <Clock className="h-2.5 w-2.5" />
              {formatFreshness(item.lastContactAt)}
            </span>
            {item.phone && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-sm gap-1 ml-auto"
                onClick={() => { window.location.href = `/leads?open=${item.id}`; }}
              >
                <Phone className="h-3 w-3" />
                Call
              </Button>
            )}
            <Button variant="ghost" size="icon" className={cn("h-6 w-6", !item.phone && "ml-auto")}>
              <MoreHorizontal className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface PipelineColumnProps {
  title: string;
  items: PipelineItem[];
  count: number;
  color: string;
  columnId: string;
  onCall?: (phone: string) => void;
}

function PipelineColumn({ title, items, count, color, onCall }: PipelineColumnProps) {
  return (
    <div className="flex-1 min-w-[280px] max-w-[350px]">
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className={cn("h-2 w-2 rounded-full", color)} />
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground bg-overlay-5 px-1.5 py-0.5 rounded-full">
          {count}
        </span>
      </div>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2 min-h-[80px]">
          {items.map((item) => (
            <SortableCard key={item.id} item={item} onCall={onCall} />
          ))}
          {items.length === 0 && (
            <div className="text-xs text-muted-foreground/60 text-center py-6 border border-dashed border-glass-border rounded-[14px]">
              No items
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

function mapToScore(priority: number): AIScore {
  const label = priority >= 85 ? "platinum" : priority >= 65 ? "gold" : priority >= 40 ? "silver" : "bronze";
  return {
    composite: priority,
    motivation: Math.round(priority * 0.85),
    equityVelocity: Math.round(priority * 0.9),
    urgency: Math.round(priority * 0.8),
    historicalConversion: Math.round(priority * 0.7),
    aiBoost: priority >= 85 ? Math.round(priority * 0.1) : 0,
    label: label as AIScore["label"],
  };
}

function normalizeLegacyPipelineStatus(raw: string | null | undefined): string {
  const normalized = (raw ?? "").toLowerCase().replace(/\s+/g, "_");
  // Legacy compatibility only: "my_lead*" was an old assignment pseudo-status.
  if (normalized === "my_lead" || normalized === "my_leads" || normalized === "my_lead_status") {
    return "lead";
  }
  return normalized || "prospect";
}

export function PipelineBoard() {
  const [items, setItems] = useState<PipelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Pending drag requiring next_action before commit
  const [pendingDrag, setPendingDrag] = useState<{
    item: PipelineItem;
    newStatus: string;
  } | null>(null);
  const [nextActionInput, setNextActionInput] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("leads") as any)
        .select("id, status, priority, source, tags, last_contact_at, properties(id, address, city, state, owner_name, owner_phone, equity_percent)")
        .in("status", ["lead", "negotiation", "disposition", "nurture", "dead", "closed"])
        .order("priority", { ascending: false })
        .limit(100);

      if (error) {
        console.error("[PipelineBoard] Fetch error:", error);
        return;
      }

      if (data && data.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mapped: PipelineItem[] = (data as any[]).map((row) => {
          const prop = row.properties;
          const addr = prop
            ? [prop.address, prop.city, prop.state].filter(Boolean).join(", ")
            : "Unknown";
          return {
            id: row.id,
            name: prop?.owner_name ?? "Unknown Owner",
            address: addr,
            phone: prop?.owner_phone ?? undefined,
            status: normalizeLegacyPipelineStatus(row.status),
            score: mapToScore(row.priority ?? 0),
            distressType: row.tags?.[0] ?? row.source ?? "Unknown",
            propertyId: prop?.id,
            equityPercent: prop?.equity_percent != null ? Number(prop.equity_percent) : null,
            lastContactAt: row.last_contact_at ?? null,
          };
        });
        setItems(mapped);
      }
    } catch (err) {
      console.error("[PipelineBoard] Error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const commitDrag = async (item: PipelineItem, newStatus: string, nextAction?: string) => {
    // Optimistic update
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id ? { ...i, status: newStatus } : i
      )
    );

    try {
      const headers = await getAuthenticatedProspectPatchHeaders();
      const payload: Record<string, unknown> = { lead_id: item.id, status: newStatus };
      if (nextAction) payload.next_action = nextAction;
      const res = await fetch("/api/prospects", {
        method: "PATCH",
        headers,
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        toast.error(`Failed to move lead: ${res.status}${body ? ` — ${body.slice(0, 120)}` : ""}`);
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, status: item.status } : i
          )
        );
      } else {
        toast.success(`Moved to ${newStatus}`);
      }
    } catch (err) {
      toast.error(`Network error updating status: ${err instanceof Error ? err.message : "unknown"}`);
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, status: item.status } : i
        )
      );
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const draggedItem = items.find((i) => i.id === active.id);
    const overItem = items.find((i) => i.id === over.id);
    if (!draggedItem || !overItem) return;

    const newStatus = overItem.status;
    if (draggedItem.status === newStatus) {
      setItems((prev) => {
        const oldIndex = prev.findIndex((i) => i.id === active.id);
        const newIndex = prev.findIndex((i) => i.id === over.id);
        const updated = [...prev];
        const [moved] = updated.splice(oldIndex, 1);
        updated.splice(newIndex, 0, moved);
        return updated;
      });
      return;
    }

    // Check if target status requires next_action
    if (requiresNextAction(newStatus as LeadStatus)) {
      setPendingDrag({ item: draggedItem, newStatus });
      setNextActionInput("");
      return;
    }

    await commitDrag(draggedItem, newStatus);
  };

  const handleConfirmNextAction = async () => {
    if (!pendingDrag || !nextActionInput.trim()) return;
    await commitDrag(pendingDrag.item, pendingDrag.newStatus, nextActionInput.trim());
    setPendingDrag(null);
    setNextActionInput("");
  };

  const handleCancelDrag = () => {
    setPendingDrag(null);
    setNextActionInput("");
  };

  const handleCall = (phone: string) => {
    if (phone) window.open(`tel:${phone.replace(/\D/g, "")}`);
  };

  const activeItem = activeId ? items.find((i) => i.id === activeId) : null;

  if (loading) {
    return (
      <GlassCard hover={false} className="p-4 flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </GlassCard>
    );
  }

  return (
    <GlassCard hover={false} className="p-4">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-2">
          {COLUMNS.map((col) => {
            const colItems = items.filter((i) => i.status === col.id);
            return (
              <PipelineColumn
                key={col.id}
                columnId={col.id}
                title={col.title}
                items={colItems}
                count={colItems.length}
                color={col.color}
                onCall={handleCall}
              />
            );
          })}
        </div>
        <DragOverlay>
          {activeItem ? (
            <div className="rounded-[14px] border border-overlay-12 bg-glass backdrop-blur-xl p-4 shadow-[0_12px_40px_var(--shadow-medium)] ring-1 ring-primary/15 opacity-95">
              <p className="font-medium text-sm">{activeItem.name}</p>
              <p className="text-xs text-muted-foreground">{activeItem.address}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Next-action prompt modal */}
      {pendingDrag && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-overlay-10 bg-background p-5 shadow-2xl space-y-3">
            <h3 className="text-sm font-semibold text-foreground">
              Moving <span className="text-primary">{pendingDrag.item.name}</span> to{" "}
              <span className="capitalize">{pendingDrag.newStatus}</span>
            </h3>
            <p className="text-xs text-muted-foreground">
              What&apos;s the next action for this lead? This is required before advancing.
            </p>
            <input
              type="text"
              autoFocus
              placeholder="e.g. Follow up call Thursday, send offer by EOD..."
              className="w-full rounded-lg border border-overlay-10 bg-overlay-4 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40"
              value={nextActionInput}
              onChange={(e) => setNextActionInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && nextActionInput.trim()) void handleConfirmNextAction();
                if (e.key === "Escape") handleCancelDrag();
              }}
            />
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                onClick={handleCancelDrag}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!nextActionInput.trim()}
                onClick={() => void handleConfirmNextAction()}
              >
                Confirm Move
              </Button>
            </div>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
