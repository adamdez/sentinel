"use client";

import { useState, useId } from "react";
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
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence } from "framer-motion";
import { WidgetWrapper } from "./widget-wrapper";
import { WidgetLibrary } from "./widget-library";
import { MyTopProspects } from "./widgets/my-top-prospects";
import { MyTopLeads } from "./widgets/my-top-leads";
import { LiveMap } from "./widgets/live-map";
import { BreakingLeadsTicker } from "./widgets/breaking-leads-ticker";
import { ActivityFeed } from "./widgets/activity-feed";
import { NextBestAction } from "./widgets/next-best-action";
import { FunnelValue } from "./widgets/funnel-value";
import { ActiveDrips } from "./widgets/active-drips";
import { RevenueImpact } from "./widgets/revenue-impact";
import { TeamChatPreview } from "./widgets/team-chat-preview";
import { QuickDial } from "./widgets/quick-dial";
import { useDashboardLayout } from "@/hooks/use-dashboard-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, RotateCcw, LayoutGrid } from "lucide-react";
import type { WidgetId, WidgetSize } from "@/lib/dashboard-config";

const WIDGET_COMPONENTS: Record<WidgetId, React.ComponentType> = {
  "my-top-prospects": MyTopProspects,
  "my-top-leads": MyTopLeads,
  "live-map": LiveMap,
  "breaking-leads-ticker": BreakingLeadsTicker,
  "activity-feed": ActivityFeed,
  "next-best-action": NextBestAction,
  "funnel-value": FunnelValue,
  "active-drips": ActiveDrips,
  "revenue-impact": RevenueImpact,
  "team-chat-preview": TeamChatPreview,
  "quick-dial": QuickDial,
};

function SortableTile({
  widgetId,
  size,
  onRemove,
  onResize,
}: {
  widgetId: WidgetId;
  size: WidgetSize;
  onRemove: (id: WidgetId) => void;
  onResize: (id: WidgetId, size: WidgetSize) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: widgetId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.85 : 1,
    filter: isDragging ? "brightness(1.1) drop-shadow(0 0 20px rgba(0, 255, 136, 0.2))" : undefined,
  };

  const Component = WIDGET_COMPONENTS[widgetId];

  return (
    <div ref={setNodeRef} style={style} className="tile-perspective">
      <WidgetWrapper
        widgetId={widgetId}
        size={size}
        onRemove={onRemove}
        onResize={onResize}
        dragHandleProps={{ ...attributes, ...listeners }}
      >
        <Component />
      </WidgetWrapper>
    </div>
  );
}

export function DashboardGridInner() {
  const {
    layout,
    reorderTiles,
    addWidget,
    removeWidget,
    resizeWidget,
    resetToDefault,
    canAddMore,
    activeWidgetIds,
  } = useDashboardLayout();

  const [libraryOpen, setLibraryOpen] = useState(false);

  const dndId = useId();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const fromIndex = layout.tiles.findIndex((t) => t.widgetId === active.id);
    const toIndex = layout.tiles.findIndex((t) => t.widgetId === over.id);
    if (fromIndex !== -1 && toIndex !== -1) {
      reorderTiles(fromIndex, toIndex);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-neon" />
          <span className="text-sm font-semibold">Your Dashboard</span>
          <Badge variant="outline" className="text-[10px]">
            {layout.tiles.length}/6 widgets
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1.5"
            onClick={resetToDefault}
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </Button>
          <Button
            variant="neon"
            size="sm"
            className="text-xs gap-1.5"
            onClick={() => setLibraryOpen(true)}
            disabled={!canAddMore}
          >
            <Plus className="h-3 w-3" />
            Add Widget
          </Button>
        </div>
      </div>

      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={layout.tiles.map((t) => t.widgetId)}
          strategy={rectSortingStrategy}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AnimatePresence mode="popLayout">
              {layout.tiles.map((tile) => (
                <SortableTile
                  key={tile.widgetId}
                  widgetId={tile.widgetId}
                  size={tile.size}
                  onRemove={removeWidget}
                  onResize={resizeWidget}
                />
              ))}
            </AnimatePresence>
          </div>
        </SortableContext>
      </DndContext>

      {layout.tiles.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <LayoutGrid className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground mb-3">
            Your dashboard is empty. Add widgets to get started.
          </p>
          <Button variant="neon" onClick={() => setLibraryOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Your First Widget
          </Button>
        </div>
      )}

      <WidgetLibrary
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        activeWidgetIds={activeWidgetIds}
        canAddMore={canAddMore}
        onAdd={addWidget}
      />
    </div>
  );
}
