"use client";

import { motion } from "framer-motion";
import type { ComponentType } from "react";
import {
  AlertCircle,
  Clock,
  CheckCircle2,
  Phone,
  DollarSign,
  ClipboardCheck,
  Calculator,
  ShieldAlert,
  Leaf,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useMorningQueue, type QueueBucket, type QueueItem } from "@/hooks/use-morning-queue";
import { formatDueDateLabel } from "@/lib/due-date-label";
import type { UrgencyLevel } from "@/lib/action-derivation";

const BUCKET_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  "new-inbound": Phone,
  "offer-prep-needs-update": DollarSign,
  "due-today": Clock,
  overdue: AlertCircle,
  "needs-qualification": ClipboardCheck,
  "comps-to-run": Calculator,
  escalations: ShieldAlert,
  "stale-nurture": Leaf,
};

function openLead(leadId: string) {
  window.location.href = `/leads?open=${leadId}`;
}

function actionUrgencyClass(urgency?: UrgencyLevel): string {
  switch (urgency) {
    case "critical": return "text-foreground";
    case "high": return "text-foreground";
    case "normal": return "text-muted-foreground/70";
    default: return "text-muted-foreground/50";
  }
}

function QueueRow({
  item,
  idx,
}: {
  item: QueueItem;
  idx: number;
}) {
  const due = formatDueDateLabel(item.dueAt);
  const dueLabel = due.text === "n/a" ? "No due date" : due.text;
  const hasAction = item.actionLabel && item.actionLabel !== "On track";

  return (
    <motion.button
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.05 + idx * 0.03 }}
      onClick={() => openLead(item.leadId)}
      className="w-full flex items-center justify-between text-[11px] py-0.5 px-1 rounded hover:bg-white/5 transition-colors text-left gap-1"
    >
      <span className="truncate flex-1 mr-1">{item.address || item.ownerName}</span>
      {hasAction ? (
        <span className={`truncate max-w-[45%] text-right shrink-0 ${actionUrgencyClass(item.actionUrgency)}`}>
          {item.actionLabel}
        </span>
      ) : (
        <span
          className={
            due.overdue
              ? "text-foreground font-semibold shrink-0"
              : due.urgent
                ? "text-foreground shrink-0"
                : "text-muted-foreground shrink-0"
          }
        >
          {dueLabel}
        </span>
      )}
    </motion.button>
  );
}

function BucketChip({ bucket, idx }: { bucket: QueueBucket; idx: number }) {
  const Icon = BUCKET_ICONS[bucket.key] ?? CheckCircle2;
  const dimmed = bucket.count === 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: dimmed ? 0.4 : 1, scale: 1 }}
      transition={{ delay: idx * 0.04 }}
      className="flex flex-col items-center text-center py-1.5 px-1 rounded-[10px] bg-secondary/20 min-w-[60px]"
    >
      <Icon className="h-3 w-3 mb-0.5 text-muted-foreground" />
      <p className="text-lg font-black leading-none">{bucket.count}</p>
      <Badge variant={dimmed ? "outline" : bucket.variant} className="text-[7px] mt-0.5 px-1">
        {bucket.label}
      </Badge>
    </motion.div>
  );
}

export function TasksDue() {
  const { buckets, loading, isAdmin } = useMorningQueue();

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full rounded-[10px]" />
        ))}
      </div>
    );
  }

  const visibleBuckets = buckets.filter((b) => !b.adminOnly || isAdmin);
  const totalDue = visibleBuckets.reduce((s, b) => s + b.count, 0);
  const topBucket = visibleBuckets.find((b) => b.count > 0 && b.items.length > 0);

  return (
    <div className="space-y-2.5">
      <p className="text-[10px] text-muted-foreground/65">
        Daily order: Overdue, Due Today, Needs Qualification, then New Inbound.
      </p>

      <div className="grid grid-cols-4 gap-1.5">
        {visibleBuckets.map((bucket, i) => (
          <BucketChip key={bucket.key} bucket={bucket} idx={i} />
        ))}
      </div>

      {topBucket && topBucket.items.length > 0 && (
        <div className="space-y-0.5">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {topBucket.label} - Top {Math.min(topBucket.items.length, 4)}
          </p>
          {topBucket.items.slice(0, 4).map((item, i) => (
            <QueueRow key={item.leadId || i} item={item} idx={i} />
          ))}
        </div>
      )}

      {totalDue === 0 && (
        <div className="text-center py-3 text-xs text-muted-foreground">
          Queue clear - no due follow-up work right now.
        </div>
      )}
    </div>
  );
}
