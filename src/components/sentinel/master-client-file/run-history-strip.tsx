"use client";

/**
 * RunHistoryStrip
 *
 * Compact research-run status indicator + expandable history for EvidenceCapturePanel.
 *
 * Default (collapsed): single line showing active run status or "No active run".
 * Expanded: list of recent runs (max 5) with status, counts, and compile outcome.
 *
 * Adam-only surface — not shown to Logan.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity, ChevronDown, ChevronUp, CircleDot, CheckCircle2,
  XCircle, AlertCircle, Loader2, Plus, BookOpen, Clock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ResearchRunRow, ResearchRunStatus } from "@/hooks/use-research-runs";

// ── Status display config ─────────────────────────────────────────────────────

const STATUS_META: Record<ResearchRunStatus, {
  label: string;
  icon:  React.ElementType;
  color: string;
  bg:    string;
}> = {
  open:      { label: "Active",    icon: CircleDot,    color: "text-cyan",           bg: "border-cyan/20 bg-cyan/[0.05]" },
  compiled:  { label: "Compiled",  icon: CheckCircle2, color: "text-emerald-400",    bg: "border-emerald-500/20 bg-emerald-500/[0.04]" },
  closed:    { label: "Closed",    icon: XCircle,      color: "text-muted-foreground/50", bg: "border-white/[0.06] bg-white/[0.02]" },
  abandoned: { label: "Abandoned", icon: AlertCircle,  color: "text-amber-400/60",   bg: "border-amber-500/15 bg-amber-500/[0.03]" },
};

// ── Source mix display ────────────────────────────────────────────────────────

const SOURCE_ABBR: Record<string, string> = {
  probate_filing: "Probate",
  assessor:       "Assessor",
  court_record:   "Court",
  obituary:       "Obit",
  news:           "News",
  other:          "Other",
};

// ── Single run row ────────────────────────────────────────────────────────────

function RunRow({
  run,
  isActive,
  onClose,
}: {
  run:      ResearchRunRow;
  isActive: boolean;
  onClose?: (runId: string) => void;
}) {
  const meta = STATUS_META[run.status];
  const Icon = meta.icon;

  const startedDate = new Date(run.started_at).toLocaleDateString("en-US", {
    month: "short", day: "numeric",
  });

  const sourceMix: string[] = Array.isArray(run.source_mix) ? run.source_mix : [];

  return (
    <div className={`rounded-[8px] border px-2.5 py-2 space-y-1.5 ${meta.bg} ${isActive ? "ring-1 ring-cyan/20" : ""}`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-3 w-3 shrink-0 ${meta.color} ${run.status === "open" ? "animate-pulse" : ""}`} />
        <span className={`text-[11px] font-medium ${meta.color}`}>{meta.label}</span>
        <span className="text-[10px] text-muted-foreground/40 ml-auto">{startedDate}</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground/50">
        {run.artifact_count > 0 && (
          <span>{run.artifact_count} source{run.artifact_count !== 1 ? "s" : ""}</span>
        )}
        {run.fact_count > 0 && (
          <span>{run.fact_count} fact{run.fact_count !== 1 ? "s" : ""}</span>
        )}
        {run.dossier_id && (
          <span className="text-emerald-400/60 flex items-center gap-0.5">
            <BookOpen className="h-2.5 w-2.5" />
            Dossier compiled
          </span>
        )}
        {sourceMix.length > 0 && (
          <span className="text-muted-foreground/35">
            {sourceMix.map(s => SOURCE_ABBR[s] ?? s).join(" · ")}
          </span>
        )}
      </div>

      {run.notes && (
        <p className="text-[10px] text-muted-foreground/40 italic leading-snug">
          {run.notes.length > 80 ? run.notes.slice(0, 77) + "…" : run.notes}
        </p>
      )}

      {run.status === "open" && onClose && (
        <div className="flex gap-1.5 pt-0.5">
          <button
            onClick={() => onClose(run.id)}
            className="text-[9px] text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
          >
            Close run without compiling
          </button>
        </div>
      )}
    </div>
  );
}

// ── RunHistoryStrip ───────────────────────────────────────────────────────────

interface RunHistoryStripProps {
  runs:       ResearchRunRow[];
  activeRun:  ResearchRunRow | null;
  loading:    boolean;
  onStartRun: () => Promise<void>;
  onCloseRun: (runId: string) => Promise<void>;
}

export function RunHistoryStrip({
  runs,
  activeRun,
  loading,
  onStartRun,
  onCloseRun,
}: RunHistoryStripProps) {
  const [expanded, setExpanded] = useState(false);
  const [starting, setStarting] = useState(false);

  const recentRuns = runs.slice(0, 5);

  async function handleStartRun() {
    setStarting(true);
    try { await onStartRun(); }
    finally { setStarting(false); }
  }

  return (
    <div className="px-3 py-2 border-b border-border/50 bg-muted/10">
      {/* ── Summary line ── */}
      <div className="flex items-center gap-2">
        <Activity className="h-3 w-3 text-muted-foreground/40 shrink-0" />

        {loading ? (
          <span className="text-[10px] text-muted-foreground/30 flex items-center gap-1">
            <Loader2 className="h-2.5 w-2.5 animate-spin" /> Loading…
          </span>
        ) : activeRun ? (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <CircleDot className="h-2.5 w-2.5 text-cyan animate-pulse shrink-0" />
            <span className="text-[10px] text-cyan/80 font-medium">Active run</span>
            <span className="text-[10px] text-muted-foreground/40">
              {activeRun.artifact_count} source{activeRun.artifact_count !== 1 ? "s" : ""}
              {activeRun.fact_count > 0 ? `, ${activeRun.fact_count} fact${activeRun.fact_count !== 1 ? "s" : ""}` : ""}
            </span>
            <Badge className="ml-auto bg-cyan/10 text-cyan/70 border-cyan/20 text-[9px] h-3.5 px-1 shrink-0">
              Run active
            </Badge>
          </div>
        ) : runs.length > 0 ? (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <Clock className="h-2.5 w-2.5 text-muted-foreground/30 shrink-0" />
            <span className="text-[10px] text-muted-foreground/40">
              Last run: {STATUS_META[runs[0].status].label.toLowerCase()}
              {runs[0].artifact_count > 0 ? ` · ${runs[0].artifact_count} source${runs[0].artifact_count !== 1 ? "s" : ""}` : ""}
            </span>
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground/30 flex-1">No research runs yet</span>
        )}

        {/* Start run / history toggle */}
        <div className="flex items-center gap-1 shrink-0">
          {!activeRun && (
            <Button
              size="sm"
              variant="outline"
              className="h-5 text-[9px] px-1.5 gap-0.5"
              onClick={handleStartRun}
              disabled={starting}
            >
              {starting
                ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                : <Plus className="h-2.5 w-2.5" />
              }
              Start run
            </Button>
          )}
          {runs.length > 0 && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-[9px] text-muted-foreground/30 hover:text-muted-foreground/60 flex items-center gap-0.5 transition-colors"
            >
              {expanded
                ? <><ChevronUp className="h-2.5 w-2.5" /> Hide</>
                : <><ChevronDown className="h-2.5 w-2.5" /> History ({runs.length})</>
              }
            </button>
          )}
        </div>
      </div>

      {/* ── Expanded history ── */}
      <AnimatePresence>
        {expanded && recentRuns.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-2 space-y-1.5">
              {recentRuns.map(run => (
                <RunRow
                  key={run.id}
                  run={run}
                  isActive={run.status === "open"}
                  onClose={onCloseRun}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
