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
  AlertCircle,
  Clock,
  PhoneOff,
  Voicemail,
  CheckCircle2,
} from "lucide-react";
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
  water_shutoff: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  condemned: "bg-rose-600/15 text-rose-400 border-rose-600/30",
  tired_landlord: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  underwater: "bg-red-500/15 text-red-400 border-red-500/30",
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
  water_shutoff: "Water Shutoff",
  condemned: "Condemned",
  tired_landlord: "Tired Landlord",
  underwater: "Underwater",
};

const OWNER_BADGE_MAP: Record<string, { label: string; color: string }> = {
  corporate: { label: "Corp", color: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
  elderly: { label: "Elderly", color: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  "out-of-state": { label: "Out-of-State", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
};

// ── Grid definition ──
const GRID = "grid-cols-[1.5fr_90px_minmax(120px,1fr)_100px_200px_50px]";

// ── Helpers ──

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
        active ? "text-cyan" : "text-muted-foreground",
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

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

function dispositionLabel(code: string | null): string {
  switch (code) {
    case "interested": case "callback": return "Interested";
    case "appointment": case "appointment_set": return "Appt set";
    case "contract": return "Contract";
    case "voicemail": return "VM";
    case "no_answer": return "No answer";
    case "wrong_number": return "Wrong #";
    case "disconnected": return "Disconnected";
    case "do_not_call": return "DNC";
    case "dead": return "Dead";
    case "ghost": return "Ghost";
    default: return code ? code.replace(/_/g, " ") : "";
  }
}

const POSITIVE_DISPOSITIONS = new Set(["interested", "callback", "appointment", "appointment_set", "contract"]);
const NEGATIVE_DISPOSITIONS = new Set(["wrong_number", "disconnected", "do_not_call", "dead"]);

function formatCompactValue(v: number | null): string {
  if (v == null) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${v}`;
}

// ── Main Component ──

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
      <div className="flex flex-col items-center justify-center py-16 text-center rounded-[14px] border border-glass-border bg-glass/30">
        <AlertTriangle className="h-8 w-8 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">
          No leads match your current filters.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[14px] border border-glass-border bg-glass/30 overflow-hidden">
      {/* Header */}
      <div className={cn("grid gap-3 px-4 py-2.5 border-b border-glass-border bg-glass/50", GRID)}>
        <SortHeader label="Property" field="address" currentField={sortField} currentDir={sortDir} onSort={onSort} />
        <SortHeader label="Score" field="score" currentField={sortField} currentDir={sortDir} onSort={onSort} />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Distress</span>
        <SortHeader label="Equity" field="equity" currentField={sortField} currentDir={sortDir} onSort={onSort} />
        <SortHeader label="Activity" field="followUp" currentField={sortField} currentDir={sortDir} onSort={onSort} />
        <span />
      </div>

      {/* Rows */}
      {leads.map((lead, i) => {
        const isMine = lead.assignedTo === currentUserId;
        const followUp = formatFollowUp(lead.nextCallScheduledAt);
        const lastAction = timeAgo(lead.lastContactAt);
        const dispLabel = dispositionLabel(lead.dispositionCode);
        const isPositive = POSITIVE_DISPOSITIONS.has(lead.dispositionCode ?? "");
        const isNegative = NEGATIVE_DISPOSITIONS.has(lead.dispositionCode ?? "");

        // Merge owner badge into distress pills (avoid duplication)
        const ownerBadgeExtra = lead.ownerBadge && !["absentee", "inherited"].includes(lead.ownerBadge)
          ? lead.ownerBadge
          : null;

        return (
          <motion.div
            key={lead.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, delay: i * 0.02 }}
            onClick={() => onSelect(lead.id)}
            className={cn(
              "grid gap-3 px-4 py-3 border-b border-white/[0.03] cursor-pointer transition-all hover:bg-white/[0.03]",
              GRID,
              lead.score.label === "platinum" && "bg-cyan-500/[0.03] hover:bg-cyan-500/[0.06]",
              !lead.complianceClean && "opacity-60"
            )}
          >
            {/* ── Property ── */}
            <div className="flex flex-col justify-center min-w-0">
              <span
                className="text-sm font-semibold truncate text-foreground"
                style={{ WebkitFontSmoothing: "antialiased" }}
              >
                {lead.address}{lead.city ? `, ${lead.city}` : ""}{lead.state ? `, ${lead.state}` : ""} {lead.zip}
              </span>
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="text-xs font-medium text-muted-foreground/90 truncate"
                  style={{ WebkitFontSmoothing: "antialiased" }}
                >
                  {lead.ownerName}
                </span>
                <span className="text-[9px] text-muted-foreground/50 shrink-0">{lead.county}</span>
                {isMine && (
                  <span className="text-[9px] px-1.5 py-0 rounded bg-cyan/8 text-cyan border border-cyan/15 shrink-0">
                    You
                  </span>
                )}
                {lead.assignedName && !isMine && (
                  <span className="text-[9px] text-muted-foreground shrink-0">
                    {lead.assignedName}
                  </span>
                )}
                {!lead.assignedTo && (
                  <span className="text-[9px] px-1.5 py-0 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 shrink-0">
                    Unassigned
                  </span>
                )}
              </div>
            </div>

            {/* ── Score ── */}
            <div className="flex items-center">
              <AIScoreBadge score={lead.score} size="sm" />
            </div>

            {/* ── Distress (+ owner badge merged) ── */}
            <div className="flex items-center gap-1 flex-wrap">
              {ownerBadgeExtra && (
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded border",
                    OWNER_BADGE_MAP[ownerBadgeExtra]?.color ?? "border-white/[0.06] text-muted-foreground"
                  )}
                >
                  {OWNER_BADGE_MAP[ownerBadgeExtra]?.label ?? ownerBadgeExtra}
                </span>
              )}
              {lead.distressSignals.map((d) => (
                <span
                  key={d}
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded border",
                    DISTRESS_COLORS[d] ?? "border-white/[0.06] text-muted-foreground"
                  )}
                >
                  {DISTRESS_LABELS[d]}
                </span>
              ))}
            </div>

            {/* ── Equity ── */}
            <div className="flex flex-col justify-center">
              <span className="text-xs font-semibold tabular-nums">
                {formatCompactValue(lead.estimatedValue)}
              </span>
              {lead.equityPercent != null ? (
                <span
                  className={cn(
                    "text-[10px] font-medium tabular-nums",
                    lead.equityPercent >= 70
                      ? "text-emerald-400"
                      : lead.equityPercent >= 40
                        ? "text-yellow-400"
                        : "text-red-400/70"
                  )}
                >
                  {Math.round(lead.equityPercent)}% equity
                </span>
              ) : (
                <span className="text-[10px] text-muted-foreground/40">—</span>
              )}
            </div>

            {/* ── Activity ── */}
            <div className="flex flex-col justify-center min-w-0">
              {/* Line 1: Last action */}
              {lead.totalCalls === 0 ? (
                <span className="text-[11px] text-yellow-400 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  Not contacted
                </span>
              ) : (
                <span
                  className={cn(
                    "text-[11px] flex items-center gap-1 truncate",
                    isPositive && "text-emerald-400",
                    isNegative && "text-red-400/80",
                    !isPositive && !isNegative && "text-muted-foreground"
                  )}
                >
                  {lead.dispositionCode === "voicemail" && <Voicemail className="h-3 w-3 shrink-0" />}
                  {lead.dispositionCode === "no_answer" && <PhoneOff className="h-3 w-3 shrink-0" />}
                  {isPositive && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                  {dispLabel}{lastAction ? ` ${lastAction}` : ""}
                  {lead.totalCalls > 1 && (
                    <span className="text-[9px] text-muted-foreground/50 ml-0.5">({lead.totalCalls}x)</span>
                  )}
                </span>
              )}

              {/* Line 2: Next step / sequence */}
              {lead.totalCalls === 0 && !lead.nextCallScheduledAt ? (
                <span className="text-[10px] text-yellow-400/60">Schedule first call</span>
              ) : lead.callSequenceStep >= 7 && !lead.nextCallScheduledAt ? (
                <span className="text-[10px] text-muted-foreground/50">Sequence done</span>
              ) : lead.nextCallScheduledAt ? (
                <span
                  className={cn(
                    "text-[10px] flex items-center gap-1",
                    followUp.overdue && "text-red-400 font-semibold",
                    followUp.urgent && !followUp.overdue && "text-yellow-400",
                    !followUp.urgent && "text-muted-foreground/60"
                  )}
                >
                  {followUp.overdue && <AlertTriangle className="h-2.5 w-2.5 shrink-0" />}
                  {followUp.urgent && !followUp.overdue && <Clock className="h-2.5 w-2.5 shrink-0" />}
                  T{lead.callSequenceStep}/7 · {followUp.text}
                </span>
              ) : (
                <span className="text-[10px] text-muted-foreground/40">—</span>
              )}
            </div>

            {/* ── Actions (phone + compliance) ── */}
            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              {lead.ownerPhone && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="h-6 w-6 flex items-center justify-center rounded-md text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors"
                      title={lead.ownerPhone}
                    >
                      <Phone className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="text-[11px]">{lead.ownerPhone}</TooltipContent>
                </Tooltip>
              )}
              {lead.complianceClean ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <ShieldCheck className="h-3 w-3 text-green-500/70 shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent className="text-[11px]">Compliance clear</TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <ShieldAlert className="h-3 w-3 text-red-400 shrink-0" />
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
