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
import { GripVertical, Phone, MoreHorizontal, Loader2 } from "lucide-react";
import { GlassCard } from "./glass-card";
import { AIScoreBadge } from "./ai-score-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AIScore, LeadStatus } from "@/lib/types";
import { supabase } from "@/lib/supabase";
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
}

const COLUMNS: { id: string; title: string; color: string }[] = [
  { id: "prospect", title: "Prospects", color: "bg-blue-400" },
  { id: "lead", title: "Leads", color: "bg-cyan" },
  { id: "negotiation", title: "Negotiation", color: "bg-yellow-400" },
  { id: "disposition", title: "Disposition", color: "bg-orange-400" },
  { id: "closed", title: "Closed", color: "bg-purple-400" },
];

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
        "group rounded-[14px] border border-glass-border bg-glass backdrop-blur-xl p-4 transition-all duration-200",
        isDragging && "opacity-50 shadow-2xl neon-glow",
        item.score.label === "fire" && "neon-glow animate-neon-pulse"
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
            <div>
              <p className="font-medium text-sm truncate">{item.name}</p>
              <p className="text-xs text-muted-foreground truncate">{item.address}</p>
            </div>
            <AIScoreBadge score={item.score} size="sm" />
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              {item.distressType}
            </Badge>
            {item.phone && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px] gap-1"
                onClick={() => onCall?.(item.phone!)}
              >
                <Phone className="h-3 w-3" />
                Call
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto">
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
        <span className="text-xs text-muted-foreground bg-white/[0.05] px-1.5 py-0.5 rounded-full">
          {count}
        </span>
      </div>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2 min-h-[80px]">
          {items.map((item) => (
            <SortableCard key={item.id} item={item} onCall={onCall} />
          ))}
          {items.length === 0 && (
            <div className="text-xs text-muted-foreground/40 text-center py-6 border border-dashed border-glass-border rounded-[14px]">
              No items
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

function mapToScore(priority: number): AIScore {
  const label = priority >= 85 ? "fire" : priority >= 65 ? "hot" : priority >= 40 ? "warm" : "cold";
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

export function PipelineBoard() {
  const [items, setItems] = useState<PipelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("leads") as any)
        .select("id, status, priority, source, tags, properties(id, address, city, state, owner_name, owner_phone)")
        .in("status", ["prospect", "lead", "my_lead", "negotiation", "disposition", "nurture", "dead", "closed"])
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
            status: row.status === "my_lead" ? "lead" : row.status,
            score: mapToScore(row.priority ?? 0),
            distressType: row.tags?.[0] ?? row.source ?? "Unknown",
            propertyId: prop?.id,
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

    setItems((prev) =>
      prev.map((item) =>
        item.id === draggedItem.id ? { ...item, status: newStatus } : item
      )
    );

    try {
      const res = await fetch("/api/prospects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: draggedItem.id, status: newStatus }),
      });
      if (!res.ok) {
        toast.error("Failed to update status");
        setItems((prev) =>
          prev.map((item) =>
            item.id === draggedItem.id ? { ...item, status: draggedItem.status } : item
          )
        );
      } else {
        toast.success(`Moved to ${newStatus}`);
      }
    } catch {
      toast.error("Network error updating status");
      setItems((prev) =>
        prev.map((item) =>
          item.id === draggedItem.id ? { ...item, status: draggedItem.status } : item
        )
      );
    }
  };

  const handleCall = (phone: string) => {
    if (phone) window.open(`tel:${phone.replace(/\D/g, "")}`);
  };

  const activeItem = activeId ? items.find((i) => i.id === activeId) : null;

  if (loading) {
    return (
      <GlassCard hover={false} className="p-4 flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-6 w-6 animate-spin text-cyan" />
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
            <div className="rounded-[14px] border border-cyan/30 bg-glass backdrop-blur-xl p-4 shadow-2xl neon-glow opacity-90">
              <p className="font-medium text-sm">{activeItem.name}</p>
              <p className="text-xs text-muted-foreground">{activeItem.address}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </GlassCard>
  );
}
