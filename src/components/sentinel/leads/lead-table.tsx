"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Phone,
  AlertTriangle,
  Trash2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { deleteLeadCustomerFile } from "@/lib/lead-write-helpers";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AIScoreBadge } from "@/components/sentinel/ai-score-badge";
import { type LeadRow } from "@/lib/leads-data";
import { deriveLeadActionSummary, type UrgencyLevel, type ActionSummary } from "@/lib/action-derivation";
import type { SortField, SortDir } from "@/hooks/use-leads";
import { cn } from "@/lib/utils";
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

// Grid definition
const GRID = "grid-cols-[28px_1.8fr_70px_minmax(140px,1fr)_90px_80px]";

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
        "flex items-center gap-1 text-sm font-semibold uppercase tracking-wider hover:text-foreground transition-colors",
        active ? "text-primary" : "text-muted-foreground",
        className
      )}
    >
      {label}
      <Icon className="h-3 w-3" />
    </button>
  );
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}


/** Age-based color escalation for untouched leads */
function ageEscalationClass(promotedAt: string | null): string {
  if (!promotedAt) return "text-muted-foreground/70";
  const hoursOld = (Date.now() - new Date(promotedAt).getTime()) / (1000 * 60 * 60);
  if (hoursOld >= 72) return "text-foreground font-semibold";
  if (hoursOld >= 48) return "text-foreground font-medium";
  if (hoursOld >= 24) return "text-foreground";
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


function urgencyTextClass(urgency: UrgencyLevel): string {
  switch (urgency) {
    case "critical": return "text-red-400 font-semibold";
    case "high": return "text-amber-400";
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const allSelected = leads.length > 0 && selectedIds.size === leads.length;
  const someSelected = selectedIds.size > 0;

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(leads.map((l) => l.id)));
    }
  }, [allSelected, leads]);

  const handleDelete = useCallback(async (lead: LeadRow) => {
    if (!window.confirm(`Delete "${lead.ownerName}" at ${lead.address}?\n\nThis will remove the lead and its customer file.`)) return;
    setDeletingId(lead.id);
    try {
      const result = await deleteLeadCustomerFile(lead.id);
      if (!result.ok) {
        toast.error(`Delete failed: ${result.error}`);
        return;
      }
      toast.success(`Deleted: ${lead.ownerName}`);
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(lead.id); return next; });
      onRefresh?.();
    } finally {
      setDeletingId(null);
    }
  }, [onRefresh]);

  const handleBulkDelete = useCallback(async () => {
    const count = selectedIds.size;
    if (count === 0) return;
    if (!window.confirm(`Delete ${count} selected lead${count > 1 ? "s" : ""}?\n\nThis cannot be undone.`)) return;
    setBulkDeleting(true);
    let succeeded = 0;
    let failed = 0;
    for (const id of selectedIds) {
      try {
        const result = await deleteLeadCustomerFile(id);
        if (result.ok) succeeded++;
        else failed++;
      } catch {
        failed++;
      }
    }
    setBulkDeleting(false);
    setSelectedIds(new Set());
    if (failed > 0) {
      toast.error(`Deleted ${succeeded}, failed ${failed}`);
    } else {
      toast.success(`Deleted ${succeeded} lead${succeeded > 1 ? "s" : ""}`);
    }
    onRefresh?.();
  }, [selectedIds, onRefresh]);

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
          No leads match current filters.
        </p>
        <p className="text-sm text-muted-foreground/65 mt-1">
          Clear a filter to expand the queue.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[14px] border border-glass-border bg-glass/30 overflow-hidden">
      {/* Bulk delete bar */}
      {someSelected && (
        <div className="flex items-center gap-3 px-4 py-2 border-b border-glass-border bg-muted/[0.06]">
          <span className="text-xs text-foreground font-medium">{selectedIds.size} selected</span>
          <button
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-muted/15 text-foreground border border-border/25 hover:bg-muted/25 transition-colors disabled:opacity-50"
          >
            {bulkDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            Delete Selected ({selectedIds.size})
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Header */}
      <div className={cn("grid gap-3 px-4 py-2.5 border-b border-glass-border bg-glass/50", GRID)}>
        <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleSelectAll}
            className="h-3.5 w-3.5 rounded border-overlay-20 bg-overlay-5 accent-cyan cursor-pointer"
          />
        </div>
        <SortHeader label="Property / Owner" field="address" currentField={sortField} currentDir={sortDir} onSort={onSort} />
        <SortHeader label="Score" field="score" currentField={sortField} currentDir={sortDir} onSort={onSort} />
        <SortHeader label="Next Action" field="followUp" currentField={sortField} currentDir={sortDir} onSort={onSort} />
        <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Last Contact</span>
        <span />
      </div>

      {/* Rows */}
      {leads.map((lead, i) => {
        const isMine = lead.assignedTo === currentUserId;
        const followUpDueIso = lead.nextCallScheduledAt ?? lead.followUpDate;
        const actionSummary = deriveActionForLead(lead);

        // Overdue tinting
        let overdueDays = 0;
        let isOverdue = false;
        if (followUpDueIso) {
          const dueMs = new Date(followUpDueIso).getTime();
          if (!Number.isNaN(dueMs) && dueMs < Date.now()) {
            isOverdue = true;
            overdueDays = Math.floor((Date.now() - dueMs) / 86400000);
          }
        }

        // Next action label
        let nextActionText = "No action set";
        let nextActionClass = "text-muted-foreground/50";
        if (followUpDueIso) {
          const dueMs = new Date(followUpDueIso).getTime();
          if (!Number.isNaN(dueMs)) {
            const diffMs = dueMs - Date.now();
            const diffDays = Math.floor(Math.abs(diffMs) / 86400000);
            const actionType = actionSummary.actionType === "call" ? "Callback" : actionSummary.actionType === "review" ? "Review" : "Follow up";
            if (diffMs < 0) {
              nextActionText = diffDays === 0 ? `${actionType} due today` : `${actionType} ${diffDays}d overdue`;
              nextActionClass = diffDays >= 3 ? "text-foreground font-semibold" : diffDays >= 1 ? "text-foreground" : "text-foreground";
            } else {
              nextActionText = diffDays === 0 ? `${actionType} today` : diffDays === 1 ? `${actionType} tomorrow` : `${actionType} in ${diffDays}d`;
              nextActionClass = diffDays <= 1 ? "text-foreground" : "text-muted-foreground/70";
            }
          }
        } else if (lead.totalCalls === 0) {
          nextActionText = "First contact needed";
          nextActionClass = ageEscalationClass(lead.promotedAt);
        }

        // Last contact
        const lastContactText = lead.lastContactAt ? timeAgo(lead.lastContactAt) : "Never";
        const lastContactClass = lead.lastContactAt ? "text-muted-foreground" : "text-muted-foreground/40";

        return (
          <motion.div
            key={lead.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, delay: i * 0.02 }}
            onClick={() => onSelect(lead.id)}
            className={cn(
              "grid gap-3 px-4 py-3 border-b border-overlay-3 cursor-pointer transition-all hover:bg-overlay-3",
              GRID,
              isOverdue && overdueDays >= 3 && "bg-muted/5 border-l-2 border-l-red-500/40",
              isOverdue && overdueDays < 3 && "bg-muted/5 border-l-2 border-l-amber-500/40",
              !isOverdue && lead.score.label === "platinum" && "bg-primary-500/[0.03] hover:bg-primary-500/[0.06]",
            )}
          >
            {/* Checkbox */}
            <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={selectedIds.has(lead.id)}
                onChange={() => toggleSelect(lead.id)}
                className="h-3.5 w-3.5 rounded border-overlay-20 bg-overlay-5 accent-cyan cursor-pointer"
              />
            </div>

            {/* Property + Owner (consolidated) */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex flex-col justify-center min-w-0 gap-0.5">
                  <span
                    className="text-sm font-semibold truncate text-foreground"
                    style={{ WebkitFontSmoothing: "antialiased" }}
                  >
                    {lead.address}{lead.city ? `, ${lead.city}` : ""}
                  </span>
                  <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                    <span
                      className="text-xs font-medium text-muted-foreground/90 truncate shrink"
                      style={{ WebkitFontSmoothing: "antialiased" }}
                    >
                      {lead.ownerName}
                    </span>
                    {lead.ownerPhone ? (
                      <span className="text-sm text-foreground/80 tabular-nums shrink-0">
                        {formatPhone(lead.ownerPhone)}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/30 shrink-0">No phone</span>
                    )}
                  </div>
                </div>
              </TooltipTrigger>
              {(lead.sellerSituationSummaryShort || lead.recommendedCallAngle || lead.topFact1 || lead.notes) && (
                <TooltipContent side="right" className="max-w-xs space-y-1.5 text-left">
                  {lead.sellerSituationSummaryShort && (
                    <p className="text-sm font-medium">{lead.sellerSituationSummaryShort}</p>
                  )}
                  {lead.recommendedCallAngle && (
                    <p className="text-xs text-muted-foreground"><span className="text-primary font-medium">Call angle:</span> {lead.recommendedCallAngle}</p>
                  )}
                  {(lead.topFact1 || lead.topFact2 || lead.topFact3) && (
                    <ul className="text-xs text-muted-foreground space-y-0.5">
                      {lead.topFact1 && <li>• {lead.topFact1}</li>}
                      {lead.topFact2 && <li>• {lead.topFact2}</li>}
                      {lead.topFact3 && <li>• {lead.topFact3}</li>}
                    </ul>
                  )}
                  {!lead.sellerSituationSummaryShort && lead.notes && (
                    <p className="text-xs text-muted-foreground line-clamp-3">{lead.notes}</p>
                  )}
                </TooltipContent>
              )}
            </Tooltip>

            {/* Score (badge only) */}
            <div className="flex items-center">
              <AIScoreBadge score={lead.score} size="sm" />
            </div>

            {/* Next Action */}
            <div className="flex flex-col justify-center min-w-0">
              <span className={cn("text-sm truncate", nextActionClass)}>
                {nextActionText}
              </span>
            </div>

            {/* Last Contact */}
            <div className="flex items-center">
              <span className={cn("text-sm tabular-nums", lastContactClass)}>
                {lastContactText}
              </span>
            </div>

            {/* Actions (call + delete only) */}
            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              {lead.ownerPhone && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a
                      href={`tel:${lead.ownerPhone}`}
                      className="h-6 w-6 flex items-center justify-center rounded-md text-foreground hover:bg-muted/10 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Phone className="h-3.5 w-3.5" />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent className="text-sm">{formatPhone(lead.ownerPhone)}</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => handleDelete(lead)}
                    disabled={deletingId === lead.id}
                    className="h-6 w-6 flex items-center justify-center rounded-md text-foreground/60 hover:text-foreground hover:bg-muted/10 transition-colors disabled:opacity-40"
                  >
                    {deletingId === lead.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent className="text-sm">Delete lead</TooltipContent>
              </Tooltip>
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
