"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { formatOwnerName } from "@/lib/format-name";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Phone,
  Pin,
  AlertTriangle,
  Trash2,
  Loader2,
  UserCheck,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { deleteLeadCustomerFile } from "@/lib/lead-write-helpers";
import { canUserClaimLead } from "@/lib/lead-ownership";
import { runWithConcurrency } from "@/lib/async-batch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { type LeadRow } from "@/lib/leads-data";
import type { UrgencyLevel } from "@/lib/action-derivation";
import { buildOperatorWorkflowSummary } from "@/components/sentinel/operator-workflow-summary";
import type { SortField, SortDir } from "@/hooks/use-leads";
import { cn } from "@/lib/utils";
import { LogCallModal } from "./log-call-modal";

interface LeadTableProps {
  leads: LeadRow[];
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
  onSelect: (id: string) => void;
  onTogglePin: (id: string, pinned: boolean) => void | Promise<void>;
  onRefresh?: () => void;
  currentUserId: string;
}

// Grid: select · pin · property · do now · due · last touch · actions
const GRID = "grid-cols-[28px_28px_1.65fr_minmax(120px,1.15fr)_minmax(80px,0.9fr)_minmax(88px,0.95fr)_80px]";
const BULK_ACTION_CONCURRENCY = 6;

// Helpers

function SortHeader({
  label,
  field,
  currentField,
  currentDir,
  onSort,
  className,
  title,
}: {
  label: string;
  field: SortField;
  currentField: SortField;
  currentDir: SortDir;
  onSort: (f: SortField) => void;
  className?: string;
  title?: string;
}) {
  const active = currentField === field;
  const Icon = active ? (currentDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <button
      type="button"
      title={title}
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

// Main component

export function LeadTable({
  leads,
  sortField,
  sortDir,
  onSort,
  onSelect,
  onTogglePin,
  onRefresh,
  currentUserId,
}: LeadTableProps) {
  const [logCallLead, setLogCallLead] = useState<LeadRow | null>(null);
  const [queuingId, setQueuingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkClaiming, setBulkClaiming] = useState(false);
  const [bulkAutoCycling, setBulkAutoCycling] = useState(false);
  const [bulkQueueing, setBulkQueueing] = useState(false);
  const [bulkJeffQueueing, setBulkJeffQueueing] = useState(false);

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
    const ids = Array.from(selectedIds);
    const results = await runWithConcurrency(ids, BULK_ACTION_CONCURRENCY, async (id) => {
      try {
        return await deleteLeadCustomerFile(id);
      } catch {
        return { ok: false as const, status: 500, error: "Unexpected delete failure" };
      }
    });
    for (const result of results) {
      if (result.ok) succeeded++;
      else failed++;
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

  const handleBulkClaim = useCallback(async () => {
    const selectedLeads = leads.filter((lead) => selectedIds.has(lead.id));
    const claimableLeadIds = selectedLeads
      .filter((lead) => canUserClaimLead({ assignedUserId: lead.assignedTo, claimantUserId: currentUserId }))
      .map((lead) => lead.id);
    const skippedCount = selectedLeads.length - claimableLeadIds.length;
    const count = claimableLeadIds.length;
    if (selectedLeads.length === 0) return;
    if (count === 0) {
      toast.error("None of the selected leads are unclaimed.");
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      toast.error("Session expired. Please sign in again.");
      return;
    }
    setBulkClaiming(true);
    let succeeded = 0;
    let failed = 0;
    try {
      const results = await runWithConcurrency(claimableLeadIds, BULK_ACTION_CONCURRENCY, async (id) => {
        try {
          const res = await fetch("/api/prospects", {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              lead_id: id,
              assigned_to: currentUserId,
            }),
          });
          return res.ok;
        } catch {
          return false;
        }
      });
      for (const ok of results) {
        if (ok) succeeded++;
        else failed++;
      }
    } finally {
      setBulkClaiming(false);
      setSelectedIds(new Set());
      if (failed > 0 || skippedCount > 0) {
        const pieces = [`Claimed ${succeeded}`];
        if (failed > 0) pieces.push(`failed ${failed}`);
        if (skippedCount > 0) pieces.push(`skipped ${skippedCount} already-owned`);
        toast.error(pieces.join(", "));
      } else {
        toast.success(`Claimed ${succeeded} lead${succeeded > 1 ? "s" : ""}`);
      }
      onRefresh?.();
    }
  }, [selectedIds, currentUserId, onRefresh, leads]);

  const handleBulkAddToAutoCycle = useCallback(async () => {
    const count = selectedIds.size;
    if (count === 0) return;
    setBulkAutoCycling(true);
    let succeeded = 0;
    let failed = 0;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error("Session expired. Please sign in again.");
        return;
      }
      const ids = Array.from(selectedIds);
      const results = await runWithConcurrency(ids, BULK_ACTION_CONCURRENCY, async (id) => {
        try {
          const res = await fetch("/api/dialer/v1/auto-cycle", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ leadId: id }),
          });
          return res.ok;
        } catch {
          return false;
        }
      });
      for (const ok of results) {
        if (ok) succeeded++;
        else failed++;
      }
      setSelectedIds(new Set());
      if (succeeded > 0 && failed === 0) {
        toast.success(
          `Added ${succeeded} lead${succeeded > 1 ? "s" : ""} to Auto Cycle — open Dialer → Jeff to call them.`,
        );
      } else if (succeeded > 0 && failed > 0) {
        toast.warning(
          `Added ${succeeded} to Auto Cycle; ${failed} skipped (need to be claimed by you, Lead stage, and have a phone).`,
        );
      } else if (failed > 0) {
        toast.error(
          "None added — leads must be claimed by you, in Lead stage, and have at least one phone.",
        );
      }
      onRefresh?.();
    } finally {
      setBulkAutoCycling(false);
    }
  }, [selectedIds, onRefresh]);

  const handleBulkAddToDialQueue = useCallback(async () => {
    const count = selectedIds.size;
    if (count === 0) return;
    setBulkQueueing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error("Session expired. Please sign in again.");
        return;
      }

      const res = await fetch("/api/dialer/v1/dial-queue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ leadIds: Array.from(selectedIds) }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to add leads to dial queue");
        return;
      }

      const queuedCount = Array.isArray(data.queuedIds) ? data.queuedIds.length : 0;
      const conflictedCount = Array.isArray(data.conflictedIds) ? data.conflictedIds.length : 0;
      const missingCount = Array.isArray(data.missingIds) ? data.missingIds.length : 0;

      setSelectedIds(new Set());

      if (conflictedCount > 0 || missingCount > 0) {
        const pieces = [`Queued ${queuedCount}`];
        if (conflictedCount > 0) pieces.push(`blocked ${conflictedCount} already-owned`);
        if (missingCount > 0) pieces.push(`missing ${missingCount}`);
        toast.warning(pieces.join(", "));
      } else {
        toast.success(`Added ${queuedCount} lead${queuedCount === 1 ? "" : "s"} to Dial Queue`);
      }

      onRefresh?.();
    } finally {
      setBulkQueueing(false);
    }
  }, [selectedIds, onRefresh]);

  const handleBulkAddToJeffQueue = useCallback(async () => {
    const count = selectedIds.size;
    if (count === 0) return;
    setBulkJeffQueueing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error("Session expired. Please sign in again.");
        return;
      }

      const res = await fetch("/api/voice/jeff/queue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          leadIds: Array.from(selectedIds),
          queueTier: "active",
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to add leads to Jeff queue");
        return;
      }

      setSelectedIds(new Set());
      toast.success(`Added ${count} lead${count === 1 ? "" : "s"} to Jeff Queue`);
      onRefresh?.();
    } finally {
      setBulkJeffQueueing(false);
    }
  }, [selectedIds, onRefresh]);

  const addToJeffQueue = useCallback(async (leadId: string) => {
    setQueuingId(leadId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/voice/jeff/queue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          leadIds: [leadId],
          queueTier: "active",
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Added to Jeff Queue");
      onRefresh?.();
    } catch {
      toast.error("Could not add to Jeff Queue");
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
            onClick={handleBulkClaim}
            disabled={bulkClaiming}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-primary/15 text-primary border border-primary/25 hover:bg-primary/25 transition-colors disabled:opacity-50"
          >
            {bulkClaiming ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserCheck className="h-3 w-3" />}
            Claim Leads ({selectedIds.size})
          </button>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleBulkAddToDialQueue}
                disabled={bulkQueueing}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-primary/10 text-primary border border-primary/25 hover:bg-primary/20 transition-colors disabled:opacity-50"
              >
                {bulkQueueing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Phone className="h-3 w-3" />}
                Add to Dial Queue ({selectedIds.size})
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              Claims unclaimed leads to you and adds them to your manual dial queue. Leads owned by someone else stay blocked.
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleBulkAddToAutoCycle}
                disabled={bulkAutoCycling}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
              >
                {bulkAutoCycling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                Auto Cycle / Jeff ({selectedIds.size})
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              Adds claimed leads to the dialer Auto Cycle queue (same list Jeff uses). Each lead must be yours, in Lead stage, and have a phone.
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleBulkAddToJeffQueue}
                disabled={bulkJeffQueueing}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-violet-500/10 text-violet-300 border border-violet-500/25 hover:bg-violet-500/20 transition-colors disabled:opacity-50"
              >
                {bulkJeffQueueing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                Add to Jeff Queue ({selectedIds.size})
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              Adds the selected leads to Jeff&apos;s supervised queue so Adam can control exactly who Jeff is allowed to call.
            </TooltipContent>
          </Tooltip>
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
        <span />
        <SortHeader label="Property / Owner" field="address" currentField={sortField} currentDir={sortDir} onSort={onSort} />
        <SortHeader
          label="Do Now"
          field="followUp"
          currentField={sortField}
          currentDir={sortDir}
          onSort={onSort}
          className="text-left"
          title="Sort: pinned first, then urgency, then due date"
        />
        <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Due</span>
        <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Last Touch</span>
        <span />
      </div>

      {/* Rows */}
      {leads.map((lead, i) => {
        const wf = buildOperatorWorkflowSummary({
          status: lead.status,
          qualificationRoute: lead.qualificationRoute,
          assignedTo: lead.assignedTo,
          nextCallScheduledAt: lead.nextCallScheduledAt,
          nextFollowUpAt: lead.followUpDate,
          lastContactAt: lead.lastContactAt,
          totalCalls: lead.totalCalls,
          createdAt: lead.promotedAt,
          promotedAt: lead.promotedAt,
        });

        const overdueDays =
          wf.effectiveDueIso && wf.dueOverdue
            ? Math.max(
                1,
                Math.floor(
                  (Date.now() - new Date(wf.effectiveDueIso).getTime()) / 86400000,
                ),
              )
            : 0;

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
              wf.dueOverdue && overdueDays >= 3 && "bg-muted/5 border-l-2 border-l-red-500/40",
              wf.dueOverdue && overdueDays > 0 && overdueDays < 3 && "bg-muted/5 border-l-2 border-l-amber-500/40",
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

            <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={lead.pinned ? "Remove from Pipeline" : "Pin to Pipeline"}
                    aria-pressed={lead.pinned}
                    onClick={() => onTogglePin(lead.id, !lead.pinned)}
                    className={cn(
                      "h-6 w-6 flex items-center justify-center rounded-md transition-colors",
                      lead.pinned
                        ? "text-primary hover:bg-primary/10"
                        : "text-muted-foreground/35 hover:text-muted-foreground hover:bg-muted/10",
                    )}
                  >
                    <Pin className={cn("h-3.5 w-3.5", lead.pinned && "fill-current")} />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="text-sm">
                  {lead.pinned ? "Remove from Pipeline" : "Pin to Pipeline"}
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Property + Owner (consolidated) */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex flex-col justify-center min-w-0 gap-0.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="text-sm font-semibold truncate text-foreground"
                      style={{ WebkitFontSmoothing: "antialiased" }}
                    >
                      {lead.address}{lead.city ? `, ${lead.city}` : ""}
                    </span>
                    {lead.pinned && (
                      <span className="shrink-0 text-xs px-2.5 py-1 rounded-md bg-blue-500/15 text-blue-400 font-bold border border-blue-500/25">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                    <span
                      className="text-xs font-medium text-muted-foreground/90 truncate shrink"
                      style={{ WebkitFontSmoothing: "antialiased" }}
                    >
                      {formatOwnerName(lead.ownerName)}
                    </span>
                    {lead.ownerPhone ? (
                      <span className="text-sm text-foreground/80 tabular-nums shrink-0">
                        {formatPhone(lead.ownerPhone)}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/30 shrink-0">No phone</span>
                    )}
                  </div>
                  {lead.distressSignals.length > 0 && (
                    <div className="flex items-center gap-1 overflow-hidden">
                      {lead.distressSignals.slice(0, 3).map((sig, i) => (
                        <span key={i} className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full text-[10px] font-medium border border-overlay-12 bg-overlay-4 text-muted-foreground truncate">
                          <AlertTriangle className="h-2.5 w-2.5 shrink-0" />{sig.replace(/_/g, " ")}
                        </span>
                      ))}
                      {lead.distressSignals.length > 3 && (
                        <span className="text-[10px] text-muted-foreground/50">+{lead.distressSignals.length - 3}</span>
                      )}
                    </div>
                  )}
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

            {/* Do now */}
            <div className="flex flex-col justify-center min-w-0">
              <span
                className={cn("text-sm truncate", urgencyTextClass(wf.urgency))}
                title={wf.doNow}
              >
                {wf.doNow}
              </span>
            </div>

            {/* Due */}
            <div className="flex items-center min-w-0">
              <span
                className={cn(
                  "text-sm tabular-nums truncate",
                  wf.dueOverdue ? "text-red-400/90 font-medium" : "text-muted-foreground/75",
                )}
                title={wf.effectiveDueIso ?? undefined}
              >
                {wf.dueLabel}
              </span>
            </div>

            {/* Last touch */}
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className={cn(
                  "text-sm tabular-nums truncate",
                  wf.lastTouchLabel === "No touch" ? "text-muted-foreground/40" : "text-muted-foreground",
                )}
                title={lead.lastContactAt ?? undefined}
              >
                {wf.lastTouchLabel}
              </span>
              {wf.workedToday && (
                <span className="shrink-0 rounded px-1 py-0 text-[10px] font-semibold uppercase tracking-wide text-primary bg-primary/10 border border-primary/20">
                  Today
                </span>
              )}
            </div>

            {/* Actions (call + delete only) */}
            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => addToJeffQueue(lead.id)}
                    disabled={queuingId === lead.id}
                    className="h-6 w-6 flex items-center justify-center rounded-md text-violet-300/80 hover:text-violet-200 hover:bg-violet-500/10 transition-colors disabled:opacity-40"
                  >
                    {queuingId === lead.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">Add to Jeff Queue</TooltipContent>
              </Tooltip>
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
