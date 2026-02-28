"use client";

import { useRef, useCallback } from "react";
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
}

export function WidgetWrapper({
  widgetId,
  size,
  onRemove,
  onResize,
  dragHandleProps,
  children,
}: WidgetWrapperProps) {
  const def = WIDGET_REGISTRY[widgetId];
  const colSpan = getColSpan(size);
  const rowSpan = getRowSpan(size);
  const isWide = colSpan === 2;
  const tileRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = tileRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.transform = `perspective(1000px) rotateY(${x * 3}deg) rotateX(${y * -3}deg) translateY(-3px)`;
  }, []);

  const handleMouseLeave = useCallback(() => {
    const el = tileRef.current;
    if (!el) return;
    el.style.transform = "perspective(1000px) rotateY(0deg) rotateX(0deg) translateY(0px)";
  }, []);

  const toggleSize = () => {
    if (size === "1x1") onResize(widgetId, "2x1");
    else if (size === "2x1") onResize(widgetId, "1x1");
    else if (size === "1x2") onResize(widgetId, "2x2");
    else onResize(widgetId, "1x2");
  };

  return (
    <motion.div
      ref={tileRef}
      layout
      initial={{ opacity: 0, scale: 0.95, filter: "blur(4px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.25 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={cn(
        "rounded-[14px] border border-glass-border bg-glass backdrop-blur-2xl overflow-hidden group transition-all duration-300 hover:border-cyan/10 holo-border scanline-overlay inner-glow-card",
        colSpan === 2 && "col-span-2",
        rowSpan === 2 && "row-span-2"
      )}
      style={{ transformStyle: "preserve-3d", willChange: "transform", transition: "transform 0.25s ease, box-shadow 0.3s ease" }}
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <div className="flex items-center gap-2">
          <button
            {...dragHandleProps}
            className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-30 hover:!opacity-60 transition-opacity"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <def.icon className="h-3.5 w-3.5 text-cyan" />
          <span className="text-xs font-semibold tracking-tight">{def.label}</span>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
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
      <div className="px-4 pb-4 relative z-[2]">{children}</div>
    </motion.div>
  );
}
