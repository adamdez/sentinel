"use client";

import { motion } from "framer-motion";
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
import { useMorningQueue, type QueueBucket } from "@/hooks/use-morning-queue";

// ── Icon map for each queue bucket ──────────────────────────────────────

const BUCKET_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "new-inbound": Phone,
  "offers-pending": DollarSign,
  "due-today": Clock,
  "overdue": AlertCircle,
  "needs-qualification": ClipboardCheck,
  "comps-to-run": Calculator,
  "escalations": ShieldAlert,
  "stale-nurture": Leaf,
};

// ── Navigation helper — go to leads page with the lead selected ───

function openLead(leadId: string) {
  // Navigate to leads page — the lead list will show it.
  // If we're already on leads, this is a no-op; otherwise it routes there.
  window.location.href = `/leads?open=${leadId}`;
}

// ── Compact row for a single lead in a bucket ─────────────────────────

function QueueRow({ item, idx }: { item: { leadId: string; address: string; ownerName: string; dueAt: string | null }; idx: number }) {
  const overdue = item.dueAt ? new Date(item.dueAt) < new Date() : false;
  const timeLabel = item.dueAt
    ? overdue
      ? "OVERDUE"
      : new Date(item.dueAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "—";

  return (
    <motion.button
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.05 + idx * 0.03 }}
      onClick={() => openLead(item.leadId)}
      className="w-full flex items-center justify-between text-[11px] py-0.5 px-1 rounded hover:bg-white/5 transition-colors text-left"
    >
      <span className="truncate flex-1 mr-2">{item.address || item.ownerName}</span>
      <span className={overdue ? "text-red-400 font-bold shrink-0" : "text-muted-foreground shrink-0"}>
        {timeLabel}
      </span>
    </motion.button>
  );
}

// ── Single bucket summary chip ────────────────────────────────────────

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
      <Badge
        variant={dimmed ? "outline" : bucket.variant}
        className="text-[7px] mt-0.5 px-1"
      >
        {bucket.label}
      </Badge>
    </motion.div>
  );
}

// ── Main widget component ─────────────────────────────────────────────

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

  // Filter admin-only buckets for non-admins
  const visibleBuckets = buckets.filter((b) => !b.adminOnly || isAdmin);
  const totalDue = visibleBuckets.reduce((s, b) => s + b.count, 0);

  // Top priority bucket with items to show expanded
  const topBucket = visibleBuckets.find((b) => b.count > 0 && b.items.length > 0);

  return (
    <div className="space-y-2.5">
      {/* Priority grid — 4 per row */}
      <div className="grid grid-cols-4 gap-1.5">
        {visibleBuckets.map((bucket, i) => (
          <BucketChip key={bucket.key} bucket={bucket} idx={i} />
        ))}
      </div>

      {/* Expanded preview of the top-priority non-empty bucket */}
      {topBucket && topBucket.items.length > 0 && (
        <div className="space-y-0.5">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {topBucket.label} — Top {Math.min(topBucket.items.length, 4)}
          </p>
          {topBucket.items.slice(0, 4).map((item, i) => (
            <QueueRow key={item.leadId || i} item={item} idx={i} />
          ))}
        </div>
      )}

      {totalDue === 0 && (
        <div className="text-center py-3 text-xs text-muted-foreground">
          Queue clear — no action items right now.
        </div>
      )}
    </div>
  );
}
