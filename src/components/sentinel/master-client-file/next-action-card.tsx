"use client";

import { AlertTriangle, Calendar, Clock, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ClientFile } from "../master-client-file-helpers";
import { getNextActionUrgency, formatDateTimeShort, formatRelativeFromNow } from "../master-client-file-helpers";

interface NextActionCardProps {
  cf: ClientFile;
  onEditNextAction: () => void;
}

export function NextActionCard({ cf, onEditNextAction }: NextActionCardProps) {
  const nextActionIso = cf.nextCallScheduledAt ?? cf.followUpDate;
  const urgency = getNextActionUrgency(cf);
  const missing = !nextActionIso;
  const dueMs = nextActionIso ? new Date(nextActionIso).getTime() : NaN;
  const overdue = !Number.isNaN(dueMs) && dueMs < Date.now();
  const dueToday = !Number.isNaN(dueMs) && !overdue && dueMs < Date.now() + 24 * 60 * 60 * 1000;

  const borderClass = missing
    ? "border-red-500/40"
    : overdue
      ? "border-red-500/30"
      : dueToday
        ? "border-amber-500/25"
        : "border-overlay-15";

  const bgClass = missing
    ? "bg-red-500/[0.06]"
    : overdue
      ? "bg-red-500/[0.04]"
      : dueToday
        ? "bg-amber-500/[0.04]"
        : "bg-overlay-3";

  return (
    <div className={cn("rounded-[12px] border-2 p-3.5", borderClass, bgClass)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            {missing ? (
              <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
            ) : overdue ? (
              <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
            ) : (
              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Next Action
            </span>
            {missing && (
              <Badge variant="outline" className="text-xs border-red-500/30 text-red-400 bg-red-500/[0.08]">
                MISSING
              </Badge>
            )}
            {overdue && !missing && (
              <Badge variant="outline" className="text-xs border-red-500/30 text-red-400 bg-red-500/[0.08]">
                OVERDUE
              </Badge>
            )}
            {dueToday && !overdue && !missing && (
              <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-400 bg-amber-500/[0.08]">
                DUE TODAY
              </Badge>
            )}
          </div>

          {missing ? (
            <p className="text-sm text-red-300/90 font-medium">
              No next action scheduled. Set one before moving on.
            </p>
          ) : (
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-foreground">{urgency.label}</p>
              <p className="text-xs text-muted-foreground">{urgency.detail}</p>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {nextActionIso && (
            <div className="text-right">
              <p className={cn(
                "text-sm font-bold tabular-nums",
                overdue ? "text-red-400" : dueToday ? "text-amber-400" : "text-foreground"
              )}>
                {formatRelativeFromNow(nextActionIso)}
              </p>
              <p className="text-xs text-muted-foreground/60">
                {formatDateTimeShort(nextActionIso)}
              </p>
            </div>
          )}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 h-7 text-xs border-overlay-15 hover:border-overlay-30"
            onClick={onEditNextAction}
          >
            <Pencil className="h-3 w-3" />
            {missing ? "Set Next Action" : "Edit"}
          </Button>
        </div>
      </div>
    </div>
  );
}
