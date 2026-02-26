"use client";

import { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import { GripVertical, Phone, MoreHorizontal } from "lucide-react";
import { GlassCard } from "./glass-card";
import { AIScoreBadge } from "./ai-score-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AIScore, LeadStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

interface PipelineItem {
  id: string;
  name: string;
  address: string;
  phone?: string;
  status: LeadStatus;
  score: AIScore;
  distressType: string;
}

const DEMO_ITEMS: PipelineItem[] = [
  {
    id: "1",
    name: "Margaret Henderson",
    address: "1423 Oak Valley Dr, Phoenix AZ",
    phone: "(602) 555-0142",
    status: "prospect",
    distressType: "Probate",
    score: { composite: 94, motivation: 88, equityVelocity: 92, urgency: 96, historicalConversion: 85, aiBoost: 12, label: "fire" },
  },
  {
    id: "2",
    name: "Robert Chen",
    address: "890 Maple St, Mesa AZ",
    phone: "(480) 555-0198",
    status: "prospect",
    distressType: "Pre-Foreclosure",
    score: { composite: 82, motivation: 78, equityVelocity: 85, urgency: 80, historicalConversion: 72, aiBoost: 8, label: "hot" },
  },
  {
    id: "3",
    name: "Lisa Morales",
    address: "2100 Desert Ridge, Scottsdale AZ",
    status: "lead",
    distressType: "Tax Lien",
    score: { composite: 67, motivation: 62, equityVelocity: 70, urgency: 55, historicalConversion: 68, aiBoost: 5, label: "warm" },
  },
  {
    id: "4",
    name: "James Walker",
    address: "445 Central Ave, Tempe AZ",
    status: "lead",
    distressType: "Vacant",
    score: { composite: 43, motivation: 40, equityVelocity: 50, urgency: 35, historicalConversion: 45, aiBoost: 0, label: "cold" },
  },
];

function SortableCard({ item }: { item: PipelineItem }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group rounded-xl border border-glass-border bg-glass backdrop-blur-xl p-4 transition-all duration-200",
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
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1">
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
}

function PipelineColumn({ title, items, count, color }: PipelineColumnProps) {
  return (
    <div className="flex-1 min-w-[280px] max-w-[350px]">
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className={cn("h-2 w-2 rounded-full", color)} />
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded-full">
          {count}
        </span>
      </div>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {items.map((item) => (
            <SortableCard key={item.id} item={item} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

export function PipelineBoard() {
  const [items, setItems] = useState(DEMO_ITEMS);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setItems((prev) => {
      const oldIndex = prev.findIndex((i) => i.id === active.id);
      const newIndex = prev.findIndex((i) => i.id === over.id);
      const updated = [...prev];
      const [moved] = updated.splice(oldIndex, 1);
      updated.splice(newIndex, 0, moved);
      return updated;
    });
  };

  const prospects = items.filter((i) => i.status === "prospect");
  const leads = items.filter((i) => i.status === "lead");

  return (
    <GlassCard hover={false} className="p-4">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-2">
          <PipelineColumn title="Prospects" items={prospects} count={prospects.length} color="bg-blue-400" />
          <PipelineColumn title="Leads" items={leads} count={leads.length} color="bg-neon" />
          <PipelineColumn title="Negotiation" items={[]} count={0} color="bg-yellow-400" />
          <PipelineColumn title="Disposition" items={[]} count={0} color="bg-orange-400" />
          <PipelineColumn title="Closed" items={[]} count={0} color="bg-purple-400" />
        </div>
      </DndContext>
    </GlassCard>
  );
}
