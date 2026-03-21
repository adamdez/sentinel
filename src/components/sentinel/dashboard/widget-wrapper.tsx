"use client";

import { motion } from "framer-motion";
import { GripVertical, X, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { WIDGET_REGISTRY, getColSpan, getRowSpan, type WidgetId, type WidgetSize } from "@/lib/dashboard-config";
import { cn } from "@/lib/utils";

interface WidgetWrapperProps {
  widgetId: WidgetId;
  size: WidgetSize;
  onRemove: (id: WidgetId) => void;
  onResize: (id: WidgetId, size: WidgetSize) => void;
  dragHandleProps?: Record<string, unknown>;
  children: React.ReactNode;
  isDragging?: boolean;
}

export function WidgetWrapper({
  widgetId,
  size,
  onRemove,
  onResize,
  dragHandleProps,
  children,
  isDragging,
}: WidgetWrapperProps) {
  const def = WIDGET_REGISTRY[widgetId];
  if (!def) return null;
  const colSpan = getColSpan(size);
  const rowSpan = getRowSpan(size);
  const isWide = colSpan === 2;

  const toggleSize = () => {
    if (size === "1x1") onResize(widgetId, "2x1");
    else if (size === "2x1") onResize(widgetId, "1x1");
    else if (size === "1x2") onResize(widgetId, "2x2");
    else onResize(widgetId, "1x2");
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.1 }}
      className={cn(
        "rounded-[14px] border border-glass-border glass-card overflow-hidden group",
        colSpan === 2 && "col-span-2",
        rowSpan === 2 && "row-span-2",
        isDragging && "drag-active"
      )}
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-1 relative z-[6]">
        <div className="flex items-center gap-2">
          <button
            {...dragHandleProps}
            className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-30 hover:!opacity-60 transition-opacity duration-100"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <def.icon className="h-3.5 w-3.5 text-primary" />
          <span className="text-sm font-semibold tracking-tight text-foreground">{def.label}</span>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-100">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={toggleSize}>
                {isWide ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isWide ? "Shrink" : "Expand"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 hover:text-destructive" onClick={() => onRemove(widgetId)}>
                <X className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remove widget</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div className="px-4 pb-4 relative z-[6]">{children}</div>
    </motion.div>
  );
}
