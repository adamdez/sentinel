"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Phone,
  PhoneOutgoing,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  Clock,
  PhoneOff,
  Voicemail,
  CheckCircle2,
  Briefcase,
  ListPlus,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AIScoreBadge } from "@/components/sentinel/ai-score-badge";
import { deriveNextActionVisibility, offerVisibilityLabel, type LeadRow } from "@/lib/leads-data";
import { deriveLeadActionSummary, type ActionSummary, type UrgencyLevel } from "@/lib/action-derivation";
import type { SortField, SortDir } from "@/hooks/use-leads";
import { cn } from "@/lib/utils";
import { formatDueDateLabel } from "@/lib/due-date-label";
import { sourceChannelLabel, tagLabel } from "@/lib/prospecting";
import { normalizeSource, sourceLabel as normalizedSourceLabel } from "@/lib/source-normalization";
import { LogCallModal } from "./log-call-modal";

interface LeadTableProps {
  leads: LeadRow[];
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
  onSelect: (id: string) => void;
  onRefresh?: () => void;
  currentUserId: string;
}

const DISTRESS_COLORS: Partial<Record<string, string>> = {
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
  tax_delinquent: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  absentee_owner: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  code_issue: "bg-pink-500/15 text-pink-300 border-pink-500/30",
  rural: "bg-lime-500/15 text-lime-300 border-lime-500/30",
  mobile_home: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  possible_developer: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  out_of_area: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  do_not_call: "bg-red-600/15 text-red-300 border-red-600/30",
  bad_data: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
};

const DISTRESS_LABELS: Record<string, string> = {
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
  tax_delinquent: "Tax Delinquent",
  absentee_owner: "Absentee Owner",
  code_issue: "Code Issue",
  rural: "Rural",
  mobile_home: "Mobile Home",
  possible_developer: "Developer",
  out_of_area: "Out of Area",
  do_not_call: "DNC",
  bad_data: "Bad Data",
};

// Grid definition
const GRID = "grid-cols-[1.5fr_90px_minmax(120px,1fr)_100px_200px_70px]";

// Helpers

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
  return formatDueDateLabel(date);
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
  if (v == null) return "n/a";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${v}`;
}

function propertyTypeBrief(pt: string | null): string | null {
  if (!pt) return null;
  const lower = pt.toLowerCase();
  if (lower.includes("single") || lower === "sfr") return "SFR";
  if (lower.includes("multi") || lower.includes("duplex") || lower.includes("triplex") || lower.includes("fourplex")) return "MF";
  if (lower.includes("condo") || lower.includes("townhome") || lower.includes("townhouse")) return "Condo";
  if (lower.includes("mobile") || lower.includes("manufactured")) return "MH";
  if (lower.includes("land") || lower.includes("lot") || lower.includes("vacant land")) return "Land";
  if (lower.includes("commercial")) return "Comm";
  return pt.length > 6 ? pt.slice(0, 6) : pt;
}

function compactPropertyLine(lead: LeadRow): string {
  const parts: string[] = [];
  const pt = propertyTypeBrief(lead.propertyType);
  if (pt) parts.push(pt);
  if (lead.bedrooms != null && lead.bathrooms != null) {
    parts.push(`${lead.bedrooms}/${lead.bathrooms}`);
  }
  if (lead.sqft != null) {
    parts.push(`${lead.sqft.toLocaleString()}sf`);
  }
  if (lead.estimatedValue != null) {
    parts.push(`AVM ${formatCompactValue(lead.estimatedValue)}`);
  }
  return parts.join(" | ");
}

/** Age-based color escalation for untouched leads */
function ageEscalationClass(promotedAt: string | null): string {
  if (!promotedAt) return "text-muted-foreground/70";
  const hoursOld = (Date.now() - new Date(promotedAt).getTime()) / (1000 * 60 * 60);
  if (hoursOld >= 72) return "text-red-400 font-semibold";
  if (hoursOld >= 48) return "text-orange-400 font-medium";
  if (hoursOld >= 24) return "text-amber-400";
  return "text-muted-foreground/70";
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const d = digits.startsWith("1") && digits.length === 11 ? digits.slice(1) : digits;
  if (d.length === 10) {
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return phone;
}

function marketMeta(county: string | null | undefined): { label: string; className: string } {
  const c = (county ?? "").toLowerCase();
  if (c.includes("spokane")) {
    return { label: "Spokane", className: "bg-blue-500/10 text-blue-300 border-blue-500/20" };
  }
  if (c.includes("kootenai")) {
    return { label: "Kootenai", className: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" };
  }
  return { label: county || "Other", className: "bg-zinc-500/10 text-zinc-300 border-zinc-500/20" };
}

function sourceMeta(source: string | null | undefined): { label: string; className: string } {
  const normalized = normalizeSource(source);
  if (normalized === "propertyradar") return { label: "PropertyRadar", className: "bg-cyan/10 text-cyan border-cyan/20" };
  return {
    label: normalizedSourceLabel(normalized),
    className: "bg-zinc-500/10 text-zinc-300 border-zinc-500/20",
  };
}

function formatElapsed(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  return `${days}d`;
}

function speedToLeadMeta(lead: LeadRow): { text: string; className: string } {
  const promotedMs = lead.promotedAt ? new Date(lead.promotedAt).getTime() : NaN;
  if (Number.isNaN(promotedMs)) {
    return { text: "First response: n/a", className: "text-muted-foreground/40" };
  }

  const firstAttemptMs = lead.firstAttemptAt ? new Date(lead.firstAttemptAt).getTime() : NaN;
  const fallbackAttemptMs = lead.lastContactAt ? new Date(lead.lastContactAt).getTime() : NaN;
  const hasLoggedFirstAttempt = !Number.isNaN(firstAttemptMs);
  const attemptMs = hasLoggedFirstAttempt ? firstAttemptMs : fallbackAttemptMs;

  if (!Number.isNaN(attemptMs)) {
    const responseMs = Math.max(0, attemptMs - promotedMs);
    const label = hasLoggedFirstAttempt ? "First response" : "First response est";
    if (responseMs <= 5 * 60 * 1000) {
      return { text: `${label} ${formatElapsed(responseMs)} (Fast)`, className: "text-emerald-400" };
    }
    if (responseMs <= 15 * 60 * 1000) {
      return { text: `${label} ${formatElapsed(responseMs)} (OK)`, className: "text-yellow-300" };
    }
    return { text: `${label} ${formatElapsed(responseMs)} (Slow)`, className: "text-red-300" };
  }

  const ageMs = Date.now() - promotedMs;
  if (ageMs > 15 * 60 * 1000) {
    return { text: `First response pending ${formatElapsed(ageMs)}`, className: "text-red-400 font-medium" };
  }
  if (ageMs > 5 * 60 * 1000) {
    return { text: `First response pending ${formatElapsed(ageMs)}`, className: "text-yellow-400" };
  }
  return { text: `First response pending ${formatElapsed(ageMs)}`, className: "text-emerald-300" };
}

function urgencyTextClass(urgency: UrgencyLevel): string {
  switch (urgency) {
    case "critical": return "text-red-400 font-semibold";
    case "high": return "text-amber-300";
    case "normal": return "text-muted-foreground/70";
    case "low": return "text-muted-foreground/50";
    case "none": return "text-muted-foreground/40";
  }
}

function deriveActionForLead(lead: LeadRow): ActionSummary {
  return deriveLeadActionSummary({
    status: lead.status,
    qualificationRoute: lead.qualificationRoute,
    assignedTo: lead.assignedTo,
    nextCallScheduledAt: lead.nextCallScheduledAt,
    nextFollowUpAt: lead.followUpDate,
    lastContactAt: lead.lastContactAt,
    totalCalls: lead.totalCalls,
    createdAt: lead.promotedAt, // promotedAt is always set for leads
    promotedAt: lead.promotedAt,
  });
}

function needsFollowUp(lead: LeadRow): boolean {
  if (lead.status === "dead" || lead.status === "closed") return false;
  const dueIso = lead.nextCallScheduledAt ?? lead.followUpDate;
  if (!dueIso) return false;
  const dueMs = new Date(dueIso).getTime();
  if (Number.isNaN(dueMs)) return false;
  return dueMs < Date.now();
}

function offerStatusClass(status: LeadRow["offerStatus"]): string {
  if (status === "preparing_offer") return "bg-cyan/10 text-cyan border-cyan/20";
  if (status === "offer_made") return "bg-blue-500/12 text-blue-300 border-blue-500/30";
  if (status === "seller_reviewing") return "bg-purple-500/12 text-purple-300 border-purple-500/30";
  if (status === "declined") return "bg-zinc-500/15 text-zinc-300 border-zinc-500/30";
  return "bg-white/[0.04] text-muted-foreground border-white/[0.1]";
}

function needsQualification(lead: LeadRow): boolean {
  if (lead.status !== "lead") return false;
  if (lead.qualificationRoute != null) return false;
  if (!lead.promotedAt) return false;
  const promotedMs = new Date(lead.promotedAt).getTime();
  if (Number.isNaN(promotedMs)) return false;
  return Date.now() - promotedMs > 48 * 60 * 60 * 1000;
}

// Main component

export function LeadTable({
  leads,
  sortField,
  sortDir,
  onSort,
  onSelect,
  onRefresh,
  currentUserId,
}: LeadTableProps) {
  const [logCallLead, setLogCallLead] = useState<LeadRow | null>(null);
  const [queuingId, setQueuingId] = useState<string | null>(null);

  const addToQueue = useCallback(async (leadId: string) => {
    setQueuingId(leadId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/leads/${leadId}/queue`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Added to call queue");
      onRefresh?.();
    } catch {
      toast.error("Could not add to queue");
    } finally {
      setQueuingId(null);
    }
  }, [onRefresh]);

  if (leads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center rounded-[14px] border border-glass-border bg-glass/30">
        <AlertTriangle className="h-8 w-8 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">
          No inbox leads match your current filters.
        </p>
        <p className="text-[11px] text-muted-foreground/65 mt-1">
          Clear a focus chip or filter to expand the queue.
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
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Signals</span>
        <SortHeader label="Equity" field="equity" currentField={sortField} currentDir={sortDir} onSort={onSort} />
        <SortHeader label="Next Action" field="followUp" currentField={sortField} currentDir={sortDir} onSort={onSort} />
        <span />
      </div>

      {/* Rows */}
      {leads.map((lead, i) => {
        const isMine = lead.assignedTo === currentUserId;
        const followUpDueIso = lead.nextCallScheduledAt ?? lead.followUpDate;
        const followUp = formatFollowUp(followUpDueIso);
        const lastAction = timeAgo(lead.lastContactAt);
        const dispLabel = dispositionLabel(lead.dispositionCode);
        const isPositive = POSITIVE_DISPOSITIONS.has(lead.dispositionCode ?? "");
        const isNegative = NEGATIVE_DISPOSITIONS.has(lead.dispositionCode ?? "");
        const market = marketMeta(lead.county);
        const source = sourceMeta(lead.sourceChannel ?? lead.source);
        const speed = speedToLeadMeta(lead);
        const needsFollowUpFlag = needsFollowUp(lead);
        const needsQualificationFlag = needsQualification(lead);
        const offerLabel = offerVisibilityLabel(lead.offerStatus);
        const offerPrepPathActive = lead.qualificationRoute === "offer_ready" || lead.offerStatus === "preparing_offer";
        const offerPrepMissing = offerPrepPathActive && lead.offerPrepHealth === "missing";
        const offerPrepStale = offerPrepPathActive && lead.offerPrepHealth === "stale";
        const offerPrepNeedsAttention = offerPrepMissing || offerPrepStale;
        const nextActionView = deriveNextActionVisibility({
          status: lead.status,
          qualificationRoute: lead.qualificationRoute,
          nextCallScheduledAt: lead.nextCallScheduledAt,
          nextFollowUpAt: lead.followUpDate,
        });
        const actionSummary = deriveActionForLead(lead);
        const actionableNow = actionSummary.isActionable || offerPrepNeedsAttention;
        const ownerActionLabel = actionableNow
          ? !lead.assignedTo
            ? "Assign owner now"
            : isMine
              ? "Your action now"
              : lead.assignedName
                ? `${lead.assignedName.split(" ")[0]} owns next action`
                : "Owned action"
          : null;
        const visibleDistress = lead.distressSignals.slice(0, 2);
        const hiddenDistressCount = Math.max(0, lead.distressSignals.length - visibleDistress.length);

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
              actionableNow && isMine && "bg-cyan-500/[0.04] hover:bg-cyan-500/[0.08]",
              actionableNow && !lead.assignedTo && "bg-amber-500/[0.05] hover:bg-amber-500/[0.09]",
              !lead.complianceClean && "opacity-60"
            )}
          >
            {/* Property */}
            <div className="flex flex-col justify-center min-w-0 gap-0.5">
              <span
                className="text-sm font-semibold truncate text-foreground"
                style={{ WebkitFontSmoothing: "antialiased" }}
              >
                {lead.address}{lead.city ? `, ${lead.city}` : ""}{lead.state ? `, ${lead.state}` : ""} {lead.zip}
              </span>
              {/* Compact property line */}
              {compactPropertyLine(lead) && (
                <span className="text-[10px] text-muted-foreground/60 truncate tabular-nums">
                  {compactPropertyLine(lead)}
                </span>
              )}
              <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                <span
                  className="text-xs font-medium text-muted-foreground/90 truncate shrink"
                  style={{ WebkitFontSmoothing: "antialiased" }}
                >
                  {lead.ownerName}
                </span>
                {lead.ownerPhone && (
                  <span className="text-[10px] text-emerald-400/80 tabular-nums shrink-0">
                    {formatPhone(lead.ownerPhone)}
                  </span>
                )}
                {!lead.ownerPhone && (
                  <span className="text-[9px] text-muted-foreground/30 shrink-0">No phone</span>
                )}
                <span className={cn("text-[9px] px-1.5 py-0 rounded border shrink-0", market.className)}>
                  {market.label}
                </span>
                <span className={cn("text-[9px] px-1.5 py-0 rounded border shrink-0", source.className)}>
                  {source.label}
                </span>
                {lead.nicheTag && (
                  <span className="text-[9px] px-1.5 py-0 rounded border shrink-0 bg-cyan/10 text-cyan border-cyan/20">
                    Niche: {tagLabel(lead.nicheTag)}
                  </span>
                )}
                {lead.importBatchId && (
                  <span className="text-[9px] px-1.5 py-0 rounded border shrink-0 bg-white/[0.05] text-muted-foreground border-white/[0.12]">
                    Batch: {lead.importBatchId}
                  </span>
                )}
                {lead.doNotCall && (
                  <span className="text-[9px] px-1.5 py-0 rounded border shrink-0 bg-red-500/12 text-red-300 border-red-500/30">
                    DNC
                  </span>
                )}
                {lead.badRecord && (
                  <span className="text-[9px] px-1.5 py-0 rounded border shrink-0 bg-zinc-500/15 text-zinc-300 border-zinc-500/30">
                    Bad Record
                  </span>
                )}
                {ownerActionLabel && (
                  <span
                    className={cn(
                      "text-[9px] px-1.5 py-0 rounded border shrink-0 font-medium",
                      !lead.assignedTo
                        ? "bg-amber-500/12 text-amber-300 border-amber-500/30"
                        : isMine
                          ? "bg-cyan/12 text-cyan border-cyan/25"
                          : "bg-white/[0.05] text-muted-foreground border-white/[0.14]"
                    )}
                  >
                    {ownerActionLabel}
                  </span>
                )}
                {isMine && (
                  <span className="text-[9px] px-1.5 py-0 rounded bg-cyan/8 text-cyan border border-cyan/15 shrink-0">
                    Assigned: You
                  </span>
                )}
                {lead.assignedName && !isMine && (
                  <span className="text-[9px] px-1.5 py-0 rounded bg-white/[0.04] border border-white/[0.1] text-muted-foreground shrink-0">
                    Assigned: {lead.assignedName.split(" ")[0]}
                  </span>
                )}
                {!lead.assignedTo && (
                  <span className="text-[9px] px-1.5 py-0 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 shrink-0">
                    Unassigned
                  </span>
                )}
                {actionSummary.isActionable && actionSummary.urgency === "critical" && (
                  <span className="text-[9px] px-1.5 py-0 rounded bg-red-500/12 text-red-300 border border-red-500/30 shrink-0">
                    Urgent
                  </span>
                )}
                {actionSummary.isActionable && actionSummary.urgency === "high" && (
                  <span className="text-[9px] px-1.5 py-0 rounded bg-amber-500/12 text-amber-300 border border-amber-500/30 shrink-0">
                    Attention
                  </span>
                )}
                {lead.qualificationRoute === "escalate" && (
                  <span className="text-[9px] px-1.5 py-0 rounded bg-amber-500/12 text-amber-300 border border-amber-500/30 shrink-0">
                    Escalated Review
                  </span>
                )}
                {lead.offerStatus !== "none" && (
                  <span
                    className={cn("text-[9px] px-1.5 py-0 rounded border shrink-0", offerStatusClass(lead.offerStatus))}
                    title="Derived from lead stage and qualification route"
                  >
                    Offer Progress: {offerLabel}
                  </span>
                )}
                {offerPrepMissing && (
                  <span
                    className="text-[9px] px-1.5 py-0 rounded border shrink-0 bg-amber-500/12 text-amber-300 border-amber-500/30"
                    title="Offer-ready path is active, but offer prep snapshot is missing core fields"
                  >
                    Offer Prep Missing
                  </span>
                )}
                {offerPrepStale && (
                  <span
                    className="text-[9px] px-1.5 py-0 rounded border shrink-0 bg-amber-500/12 text-amber-300 border-amber-500/30"
                    title="Offer-ready path is active, but prep snapshot is stale"
                  >
                    Offer Prep Stale
                  </span>
                )}
              </div>
            </div>

            {/* Score */}
            <div className="flex items-center">
              <AIScoreBadge score={lead.score} size="sm" />
            </div>

            {/* Context badges */}
            <div className="flex items-center gap-1 flex-wrap">
              {visibleDistress.map((d) => (
                <span
                  key={d}
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded border",
                    DISTRESS_COLORS[d] ?? "border-white/[0.06] text-muted-foreground"
                  )}
                >
                  {DISTRESS_LABELS[d] ?? tagLabel(d)}
                </span>
              ))}
              {hiddenDistressCount > 0 && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded border border-white/[0.08] text-muted-foreground/80"
                >
                  +{hiddenDistressCount} more
                </span>
              )}
            </div>

            {/* Equity */}
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
                <span className="text-[10px] text-muted-foreground/40">n/a</span>
              )}
            </div>

            {/* Next action */}
            <div className="flex flex-col justify-center min-w-0">
              {/* Line 1: Last action */}
              {lead.totalCalls === 0 ? (
                <span className={cn("text-[11px] flex items-center gap-1", ageEscalationClass(lead.promotedAt))}>
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

              {/* Line 2: Action summary (deterministic next action) */}
              {offerPrepNeedsAttention ? (
                <span className="text-[10px] text-amber-300 flex items-center gap-1">
                  <Briefcase className="h-2.5 w-2.5 shrink-0" />
                  {offerPrepMissing ? "Offer-prep: missing data" : "Offer-prep: stale data"}
                </span>
              ) : (
                <span
                  className={cn(
                    "text-[10px] flex items-center gap-1 truncate",
                    urgencyTextClass(actionSummary.urgency)
                  )}
                  title={actionSummary.reason}
                >
                  {actionSummary.urgency === "critical" && <AlertTriangle className="h-2.5 w-2.5 shrink-0" />}
                  {actionSummary.urgency === "high" && <AlertCircle className="h-2.5 w-2.5 shrink-0" />}
                  {actionSummary.urgency === "normal" && actionSummary.actionType === "call" && <Clock className="h-2.5 w-2.5 shrink-0" />}
                  {actionSummary.action}
                </span>
              )}
              <span className={cn("text-[10px] truncate", speed.className)}>
                {speed.text}
              </span>
            </div>

            {/* Actions (queue + log call + compliance) */}
            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => addToQueue(lead.id)}
                    disabled={queuingId === lead.id}
                    className="h-6 w-6 flex items-center justify-center rounded-md text-cyan hover:bg-cyan/10 transition-colors disabled:opacity-40"
                  >
                    <ListPlus className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="text-[11px]">Add to my call queue</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setLogCallLead(lead)}
                    className="h-6 w-6 flex items-center justify-center rounded-md text-amber-400 hover:bg-amber-500/10 transition-colors"
                  >
                    <PhoneOutgoing className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="text-[11px]">Log external call</TooltipContent>
              </Tooltip>
              {lead.ownerPhone && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="h-6 w-6 flex items-center justify-center rounded-md text-emerald-400"
                      title={lead.ownerPhone}
                    >
                      <Phone className="h-3.5 w-3.5" />
                    </span>
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

      {logCallLead && (
        <LogCallModal
          leadId={logCallLead.id}
          leadAddress={`${logCallLead.address}${logCallLead.city ? `, ${logCallLead.city}` : ""}`}
          ownerName={logCallLead.ownerName}
          onClose={() => setLogCallLead(null)}
          onSuccess={() => onRefresh?.()}
        />
      )}
    </div>
  );
}
