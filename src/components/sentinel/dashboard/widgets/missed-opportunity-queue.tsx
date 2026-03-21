"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, ClipboardCheck, CalendarX, BrainCircuit, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import type { OpportunityItem, OpportunityQueueResponse, OpportunitySignal } from "@/app/api/leads/opportunity-queue/route";

const SIGNAL_META: Record<
  OpportunitySignal,
  { label: string; Icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  flagged_ai_output: {
    label: "AI Review",
    Icon: BrainCircuit,
    color: "text-foreground",
  },
  overdue_task: {
    label: "Overdue Task",
    Icon: ClipboardCheck,
    color: "text-foreground",
  },
  overdue_follow_up_lead: {
    label: "Follow-up Missed",
    Icon: CalendarX,
    color: "text-foreground",
  },
  defaulted_callback: {
    label: "No Date Set",
    Icon: AlertTriangle,
    color: "text-muted-foreground/60",
  },
};

function overdueBadge(days: number | null): string {
  if (days === null) return "";
  if (days <= 0) return "today";
  if (days === 1) return "1d late";
  return `${days}d late`;
}

function openLead(leadId: string) {
  window.location.href = `/leads?open=${leadId}`;
}

function QueueRow({ item, idx }: { item: OpportunityItem; idx: number }) {
  const { label, Icon, color } = SIGNAL_META[item.signal];
  const badge = overdueBadge(item.daysOverdue);

  return (
    <motion.button
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.04 + idx * 0.03 }}
      onClick={() => openLead(item.leadId)}
      className="w-full flex items-center gap-1.5 text-sm py-0.5 px-1 rounded hover:bg-white/5 transition-colors text-left"
    >
      <Icon className={`h-2.5 w-2.5 shrink-0 ${color}`} />
      <span className="truncate flex-1">{item.label}</span>
      {item.taskTitle && (
        <span className="truncate max-w-[35%] text-muted-foreground/60 text-sm shrink-0">
          {item.taskTitle}
        </span>
      )}
      <span className={`shrink-0 font-medium ${item.daysOverdue && item.daysOverdue > 0 ? "text-foreground" : "text-muted-foreground/50"}`}>
        {badge}
      </span>
      <Badge variant="outline" className={`text-xs px-1 py-0 h-3.5 shrink-0 ${color}`}>
        {label}
      </Badge>
    </motion.button>
  );
}

export function MissedOpportunityQueue() {
  const [data, setData] = useState<OpportunityQueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch("/api/leads/opportunity-queue", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        setError("Failed to load");
        return;
      }
      setData(await res.json());
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-full rounded" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-4 text-xs text-muted-foreground">
        {error}
      </div>
    );
  }

  const items = data?.items ?? [];
  const counts = data?.counts;
  const total = items.length;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground/65">
          Leads and tasks where follow-up slipped through.
        </p>
        <button
          onClick={load}
          className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          title="Refresh"
        >
          <RefreshCw className="h-2.5 w-2.5" />
        </button>
      </div>

      {counts && (
        <div className="grid grid-cols-4 gap-1">
          {(
            [
              ["flagged_ai_output", "AI Flag", "text-foreground"],
              ["overdue_task", "Tasks", "text-foreground"],
              ["overdue_follow_up_lead", "Leads", "text-foreground"],
              ["defaulted_callback", "No Date", "text-muted-foreground/50"],
            ] as const
          ).map(([key, chipLabel, chipColor]) => {
            const count = counts[key];
            return (
              <div
                key={key}
                className="flex flex-col items-center py-1 rounded-[8px] bg-secondary/20"
              >
                <p className={`text-lg font-black leading-none ${count > 0 ? chipColor : "text-muted-foreground/30"}`}>
                  {count}
                </p>
                <p className="text-xs text-muted-foreground/50 mt-0.5">{chipLabel}</p>
              </div>
            );
          })}
        </div>
      )}

      {items.length > 0 ? (
        <div className="space-y-0.5">
          <p className="text-sm uppercase tracking-widest text-muted-foreground">
            Top {Math.min(items.length, 6)} items
          </p>
          {items.slice(0, 6).map((item, i) => (
            <QueueRow key={`${item.signal}-${item.leadId}`} item={item} idx={i} />
          ))}
          {total > 6 && (
            <p className="text-sm text-muted-foreground/40 pl-1">
              +{total - 6} more — open Leads to review
            </p>
          )}
        </div>
      ) : (
        <div className="text-center py-3 text-xs text-muted-foreground">
          No missed follow-up detected.
        </div>
      )}
    </div>
  );
}
