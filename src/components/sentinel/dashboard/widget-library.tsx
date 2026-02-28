"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Plus, Check, Lock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ALL_WIDGET_IDS,
  WIDGET_REGISTRY,
  MAX_DASHBOARD_TILES,
  type WidgetId,
  type WidgetSize,
} from "@/lib/dashboard-config";
import { cn } from "@/lib/utils";

interface WidgetLibraryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeWidgetIds: WidgetId[];
  canAddMore: boolean;
  onAdd: (id: WidgetId, size: WidgetSize) => boolean;
}

const categoryLabels: Record<string, string> = {
  intelligence: "Intelligence",
  workflow: "Workflow",
  communication: "Communication",
  analytics: "Analytics",
};

const categoryOrder = ["intelligence", "workflow", "analytics", "communication"];

export function WidgetLibrary({
  open,
  onOpenChange,
  activeWidgetIds,
  canAddMore,
  onAdd,
}: WidgetLibraryProps) {
  const grouped = categoryOrder.map((cat) => ({
    category: cat,
    label: categoryLabels[cat],
    widgets: ALL_WIDGET_IDS
      .map((id) => WIDGET_REGISTRY[id])
      .filter((w) => w.category === cat),
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-cyan" style={{ filter: "drop-shadow(0 0 6px rgba(0,229,255,0.4))" }} />
            Widget Library
          </DialogTitle>
          <DialogDescription>
            Add up to {MAX_DASHBOARD_TILES} widgets to your dashboard.
            {" "}
            <span className="text-foreground font-medium">
              {activeWidgetIds.length}/{MAX_DASHBOARD_TILES}
            </span>{" "}
            active.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
          {grouped.map((group) => (
            <div key={group.category}>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 font-medium">
                {group.label}
              </p>
              <div className="space-y-1.5">
                {group.widgets.map((widget) => {
                  const isActive = activeWidgetIds.includes(widget.id);
                  const isDisabled = !isActive && !canAddMore;
                  const Icon = widget.icon;

                  return (
                    <motion.div
                      key={widget.id}
                      whileHover={!isDisabled ? { x: 2 } : undefined}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-[12px] border transition-all",
                        isActive
                          ? "border-cyan/15 bg-cyan/[0.04]"
                          : isDisabled
                            ? "border-white/[0.04] bg-white/[0.02] opacity-50"
                            : "border-white/[0.06] bg-white/[0.02] hover:border-cyan/10 cursor-pointer"
                      )}
                    >
                      <div className={cn(
                        "p-1.5 rounded-[8px]",
                        isActive ? "bg-cyan/[0.08]" : "bg-white/[0.03]"
                      )}>
                        <Icon className={cn("h-4 w-4", isActive ? "text-cyan" : "text-muted-foreground")} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{widget.label}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{widget.description}</p>
                      </div>
                      {isActive ? (
                        <Badge variant="cyan" className="text-[9px] gap-1">
                          <Check className="h-2.5 w-2.5" /> Active
                        </Badge>
                      ) : isDisabled ? (
                        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px] gap-1"
                          onClick={() => {
                            onAdd(widget.id, widget.defaultSize);
                          }}
                        >
                          <Plus className="h-3 w-3" />
                          Add
                        </Button>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
