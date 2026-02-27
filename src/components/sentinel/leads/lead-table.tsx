"use client";

import { motion } from "framer-motion";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Phone,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AIScoreBadge } from "@/components/sentinel/ai-score-badge";
import type { LeadRow } from "@/lib/leads-data";
import type { SortField, SortDir } from "@/hooks/use-leads";
import type { DistressType } from "@/lib/types";
import { cn, formatCurrency } from "@/lib/utils";

interface LeadTableProps {
  leads: LeadRow[];
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
  onSelect: (id: string) => void;
  currentUserId: string;
}

const DISTRESS_COLORS: Partial<Record<DistressType, string>> = {
  probate: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  pre_foreclosure: "bg-red-500/15 text-red-400 border-red-500/30",
  tax_lien: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  code_violation: "bg-pink-500/15 text-pink-400 border-pink-500/30",
  vacant: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  divorce: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  bankruptcy: "bg-red-600/15 text-red-500 border-red-600/30",
  fsbo: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  absentee: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  inherited: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

const DISTRESS_LABELS: Record<DistressType, string> = {
  probate: "Probate",
  pre_foreclosure: "Pre-Foreclosure",
  tax_lien: "Tax Lien",
  code_violation: "Code Viol.",
  vacant: "Vacant",
  divorce: "Divorce",
  bankruptcy: "Bankruptcy",
  fsbo: "FSBO",
  absentee: "Absentee",
  inherited: "Inherited",
};

const OWNER_BADGE_MAP: Record<string, { label: string; color: string }> = {
  absentee: { label: "Absentee", color: "text-cyan-400 border-cyan-500/30" },
  corporate: { label: "Corp", color: "text-zinc-400 border-zinc-500/30" },
  inherited: { label: "Inherited", color: "text-amber-400 border-amber-500/30" },
  elderly: { label: "Elderly", color: "text-purple-400 border-purple-500/30" },
  "out-of-state": { label: "Out-of-State", color: "text-blue-400 border-blue-500/30" },
};

function SortHeader({
  label,
  field,
  currentField,
  currentDir,
  onSort,
  className,
}: {
  label: string;
  field: SortField;
  currentField: SortField;
  currentDir: SortDir;
  onSort: (f: SortField) => void;
  className?: string;
}) {
  const active = currentField === field;
  const Icon = active ? (currentDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <button
      onClick={() => onSort(field)}
      className={cn(
        "flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider hover:text-foreground transition-colors",
        active ? "text-neon" : "text-muted-foreground",
        className
      )}
    >
      {label}
      <Icon className="h-3 w-3" />
    </button>
  );
}

function formatFollowUp(date: string | null): {
  text: string;
  overdue: boolean;
  urgent: boolean;
} {
  if (!date) return { text: "—", overdue: false, urgent: false };
  const d = new Date(date);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const days = Math.round(diff / 86400000);

  if (days < -1) return { text: `${Math.abs(days)}d overdue`, overdue: true, urgent: true };
  if (days < 0) return { text: "Overdue today", overdue: true, urgent: true };
  if (days === 0) return { text: "Today", overdue: false, urgent: true };
  if (days === 1) return { text: "Tomorrow", overdue: false, urgent: true };
  return { text: `In ${days}d`, overdue: false, urgent: false };
}

function PriorityBar({ value }: { value: number }) {
  const pct = Math.min(value, 100);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-2 cursor-default">
          <div className="w-16 h-1.5 rounded-full bg-secondary overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.5 }}
              className={cn(
                "h-full rounded-full",
                pct >= 85
                  ? "bg-orange-400"
                  : pct >= 65
                    ? "bg-neon"
                    : pct >= 40
                      ? "bg-yellow-400"
                      : "bg-muted-foreground"
              )}
            />
          </div>
          <span className="text-xs font-semibold tabular-nums w-6 text-right">{value}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent className="text-[11px]">
        <Sparkles className="inline h-3 w-3 mr-1 text-neon" />
        Predictive Priority: {value}/100
      </TooltipContent>
    </Tooltip>
  );
}

export function LeadTable({
  leads,
  sortField,
  sortDir,
  onSort,
  onSelect,
  currentUserId,
}: LeadTableProps) {
  if (leads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-glass-border bg-glass/30">
        <AlertTriangle className="h-8 w-8 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">
          No leads match your current filters.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-glass-border bg-glass/30 overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[90px_1fr_100px_80px_minmax(120px,1fr)_100px_100px_40px] gap-3 px-4 py-2.5 border-b border-glass-border bg-glass/50">
        <SortHeader label="APN" field="address" currentField={sortField} currentDir={sortDir} onSort={onSort} />
        <SortHeader label="Address / Owner" field="owner" currentField={sortField} currentDir={sortDir} onSort={onSort} />
        <SortHeader label="Heat" field="score" currentField={sortField} currentDir={sortDir} onSort={onSort} />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Owner</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Distress</span>
        <SortHeader label="Follow Up" field="followUp" currentField={sortField} currentDir={sortDir} onSort={onSort} />
        <SortHeader label="Priority" field="priority" currentField={sortField} currentDir={sortDir} onSort={onSort} />
        <span />
      </div>

      {/* Rows */}
      {leads.map((lead, i) => {
        const followUp = formatFollowUp(lead.followUpDate);
        const isMine = lead.assignedTo === currentUserId;

        return (
          <motion.div
            key={lead.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, delay: i * 0.02 }}
            onClick={() => onSelect(lead.id)}
            className={cn(
              "grid grid-cols-[90px_1fr_100px_80px_minmax(120px,1fr)_100px_100px_40px] gap-3 px-4 py-3 border-b border-glass-border/50 cursor-pointer transition-all hover:bg-white/[0.03]",
              lead.score.label === "fire" && "bg-orange-500/[0.03] hover:bg-orange-500/[0.06]",
              !lead.complianceClean && "opacity-60"
            )}
          >
            {/* APN */}
            <div className="flex flex-col justify-center">
              <span className="text-xs font-mono font-medium">{lead.apn}</span>
              <span className="text-[10px] text-muted-foreground">{lead.county}</span>
            </div>

            {/* Address + Owner */}
            <div className="flex flex-col justify-center min-w-0">
              <span className="text-sm font-medium truncate">{lead.address}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground truncate">{lead.ownerName}</span>
                {isMine && (
                  <span className="text-[9px] px-1.5 py-0 rounded bg-neon/10 text-neon border border-neon/20">
                    You
                  </span>
                )}
                {lead.assignedName && !isMine && (
                  <span className="text-[9px] text-muted-foreground">
                    → {lead.assignedName}
                  </span>
                )}
                {!lead.assignedTo && (
                  <span className="text-[9px] px-1.5 py-0 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                    Unassigned
                  </span>
                )}
              </div>
            </div>

            {/* Heat Score */}
            <div className="flex items-center">
              <AIScoreBadge score={lead.score} size="sm" />
            </div>

            {/* Owner Badge */}
            <div className="flex items-center">
              {lead.ownerBadge ? (
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded border",
                    OWNER_BADGE_MAP[lead.ownerBadge]?.color ?? "text-muted-foreground border-glass-border"
                  )}
                >
                  {OWNER_BADGE_MAP[lead.ownerBadge]?.label ?? lead.ownerBadge}
                </span>
              ) : (
                <span className="text-[10px] text-muted-foreground">—</span>
              )}
            </div>

            {/* Distress Signals */}
            <div className="flex items-center gap-1 flex-wrap">
              {lead.distressSignals.map((d) => (
                <span
                  key={d}
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded border",
                    DISTRESS_COLORS[d] ?? "border-glass-border text-muted-foreground"
                  )}
                >
                  {DISTRESS_LABELS[d]}
                </span>
              ))}
            </div>

            {/* Follow Up */}
            <div className="flex items-center">
              <span
                className={cn(
                  "text-xs flex items-center gap-1",
                  followUp.overdue && "text-red-400 font-semibold",
                  followUp.urgent && !followUp.overdue && "text-yellow-400"
                )}
              >
                {followUp.overdue && <AlertTriangle className="h-3 w-3" />}
                {followUp.urgent && !followUp.overdue && <Clock className="h-3 w-3" />}
                {followUp.text}
              </span>
            </div>

            {/* Predictive Priority */}
            <div className="flex items-center">
              <PriorityBar value={lead.predictivePriority} />
            </div>

            {/* Compliance + Quick Call */}
            <div className="flex items-center justify-end gap-1">
              {lead.complianceClean ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <ShieldCheck className="h-3.5 w-3.5 text-green-500" />
                  </TooltipTrigger>
                  <TooltipContent className="text-[11px]">Compliance clear</TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
                  </TooltipTrigger>
                  <TooltipContent className="text-[11px]">DNC / compliance block</TooltipContent>
                </Tooltip>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
