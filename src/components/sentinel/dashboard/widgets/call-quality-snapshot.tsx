"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  BrainCircuit,
  CheckCircle2,
  Flag,
  PenLine,
  Clock,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import type { CallQualitySnapshot, QueueItem } from "@/app/api/dialer/call-quality/route";

// ─── Stat chip ───────────────────────────────────────────────────────────────

function StatChip({
  value,
  label,
  color,
  idx,
}: {
  value: number | string;
  label: string;
  color: string;
  idx: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: idx * 0.04 }}
      className="flex flex-col items-center py-1 px-0.5 rounded-[8px] bg-secondary/20 min-w-0"
    >
      <p className={`text-base font-black leading-none ${color}`}>{value}</p>
      <p className="text-xs text-muted-foreground/50 mt-0.5 text-center leading-tight">{label}</p>
    </motion.div>
  );
}

// ─── Queue row ───────────────────────────────────────────────────────────────

function QueueRow({ item, idx, flagged }: { item: QueueItem; idx: number; flagged?: boolean }) {
  const ago = (() => {
    const ms = Date.now() - new Date(item.createdAt).getTime();
    const h = Math.floor(ms / 3_600_000);
    if (h < 1) return "<1h ago";
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  })();

  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.04 + idx * 0.035 }}
      className={`flex flex-col gap-0.5 px-2 py-1.5 rounded-[6px] border ${
        flagged
          ? "bg-muted/5 border-border/15"
          : "bg-secondary/15 border-glass-border"
      }`}
    >
      <div className="flex items-center gap-1.5">
        {flagged ? (
          <Flag className="h-2.5 w-2.5 text-foreground shrink-0" />
        ) : (
          <Clock className="h-2.5 w-2.5 text-muted-foreground/40 shrink-0" />
        )}
        <span className="flex-1 truncate text-sm font-medium">
          {item.leadLabel ?? "Unknown lead"}
        </span>
        <Badge variant="outline" className="text-xs px-1 py-0 h-3 shrink-0">
          {item.workflow}
        </Badge>
        <span className="text-xs text-muted-foreground/40 shrink-0">{ago}</span>
        {item.leadHref && (
          <a
            href={item.leadHref}
            className="text-muted-foreground/30 hover:text-primary transition-colors shrink-0"
            title="Open lead"
          >
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </div>
      {item.outputPreview && (
        <p className="text-xs text-muted-foreground/50 leading-snug line-clamp-2 pl-4">
          {item.outputPreview}
        </p>
      )}
      <p className="text-xs text-muted-foreground/30 pl-4">
        {item.promptVersion} · {item.model}
      </p>
    </motion.div>
  );
}

// ─── Rate bar ─────────────────────────────────────────────────────────────────

function RateBar({
  label,
  pct,
  color,
}: {
  label: string;
  pct: number | null;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground/60 w-16 shrink-0">{label}</span>
      <div className="flex-1 h-1 bg-secondary/30 rounded-full overflow-hidden">
        {pct !== null && (
          <div
            className={`h-full rounded-full ${color} transition-all`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        )}
      </div>
      <span className={`text-sm font-bold shrink-0 ${color.replace("bg-", "text-")}`}>
        {pct !== null ? `${pct}%` : "–"}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CallQualitySnapshot() {
  const [data, setData] = useState<CallQualitySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch("/api/dialer/call-quality", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError("Failed to load snapshot");
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
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-full rounded" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center gap-2 py-4">
        <p className="text-xs text-muted-foreground">{error ?? "No data"}</p>
        <button
          onClick={load}
          className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary transition-colors"
        >
          <RefreshCw className="h-3 w-3" /> Retry
        </button>
      </div>
    );
  }

  const {
    windowDays,
    eventsReviewed,
    eventsFlagged,
    eventsMotivationCorrected,
    eventsTimelineCorrected,
    flagRatePct,
    correctionRatePct,
    tracesTotal,
    tracesUnreviewed,
    tracesFlagged,
    workflowBreakdown,
    unreviewedQueue,
    flaggedQueue,
  } = data;

  const hasUnreviewed = unreviewedQueue.length > 0;
  const hasFlagged = flaggedQueue.length > 0;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground/60">
          {tracesTotal} traces · {windowDays}d window · {eventsReviewed} reviewed
        </p>
        <button
          onClick={load}
          className="text-muted-foreground/30 hover:text-muted-foreground transition-colors"
          title="Refresh"
        >
          <RefreshCw className="h-2.5 w-2.5" />
        </button>
      </div>

      {/* Stat chips */}
      <div className="grid grid-cols-4 gap-1">
        <StatChip
          value={tracesUnreviewed}
          label="Unreviewed"
          color={tracesUnreviewed > 0 ? "text-foreground" : "text-muted-foreground/40"}
          idx={0}
        />
        <StatChip
          value={tracesFlagged}
          label="Flagged"
          color={tracesFlagged > 0 ? "text-foreground" : "text-muted-foreground/40"}
          idx={1}
        />
        <StatChip
          value={eventsMotivationCorrected + eventsTimelineCorrected}
          label="Corrected"
          color="text-foreground"
          idx={2}
        />
        <StatChip
          value={eventsReviewed}
          label="Reviewed"
          color="text-foreground"
          idx={3}
        />
      </div>

      {/* Rate bars */}
      <div className="space-y-1">
        <RateBar label="Flag rate" pct={flagRatePct} color="bg-muted" />
        <RateBar label="Correction" pct={correctionRatePct} color="bg-muted" />
      </div>

      {/* Workflow breakdown */}
      {workflowBreakdown.length > 0 && (
        <div className="flex gap-2">
          {workflowBreakdown.map((wf) => (
            <div
              key={wf.workflow}
              className="flex-1 flex flex-col items-center py-1 rounded-[6px] bg-secondary/15 border border-glass-border"
            >
              <BrainCircuit className="h-2.5 w-2.5 text-muted-foreground/40 mb-0.5" />
              <p className="text-xs font-bold text-foreground">{wf.total}</p>
              <p className="text-xs text-muted-foreground/50">{wf.workflow}</p>
              {wf.flagRate !== null && wf.flagRate > 0 && (
                <p className="text-xs text-foreground">{wf.flagRate}% flagged</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Flagged queue — highest urgency first */}
      {hasFlagged && (
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <Flag className="h-2.5 w-2.5 text-foreground" />
            <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
              Flagged — needs review
            </p>
          </div>
          <div className="space-y-1">
            {flaggedQueue.map((item, i) => (
              <QueueRow key={item.runId} item={item} idx={i} flagged />
            ))}
          </div>
        </div>
      )}

      {/* Unreviewed queue */}
      {hasUnreviewed && (
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <CheckCircle2 className="h-2.5 w-2.5 text-muted-foreground/40" />
            <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
              Recent — unreviewed ({tracesUnreviewed})
            </p>
          </div>
          <div className="space-y-1">
            {unreviewedQueue.slice(0, 5).map((item, i) => (
              <QueueRow key={item.runId} item={item} idx={i} />
            ))}
            {tracesUnreviewed > 5 && (
              <p className="text-xs text-muted-foreground/40 pl-1">
                +{tracesUnreviewed - 5} more unreviewed this window
              </p>
            )}
          </div>
        </div>
      )}

      {/* Correction detail */}
      {(eventsMotivationCorrected > 0 || eventsTimelineCorrected > 0) && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-[6px] bg-muted/5 border border-border/15">
          <PenLine className="h-2.5 w-2.5 text-foreground shrink-0" />
          <p className="text-xs text-muted-foreground/70">
            {eventsMotivationCorrected > 0 && (
              <span className="text-foreground">{eventsMotivationCorrected} motivation </span>
            )}
            {eventsMotivationCorrected > 0 && eventsTimelineCorrected > 0 && "+ "}
            {eventsTimelineCorrected > 0 && (
              <span className="text-foreground">{eventsTimelineCorrected} timeline </span>
            )}
            corrections by operators this window
          </p>
        </div>
      )}

      {/* Empty state */}
      {!hasUnreviewed && !hasFlagged && tracesTotal === 0 && (
        <div className="text-center py-3 text-xs text-muted-foreground">
          No AI traces in this window — run a call with extraction to populate.
        </div>
      )}

      {tracesTotal > 0 && !hasUnreviewed && !hasFlagged && (
        <div className="text-center py-2 text-xs text-muted-foreground">
          All traces reviewed — queue clear.
        </div>
      )}
    </div>
  );
}
