"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { formatOwnerName } from "@/lib/format-name";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Phone,
  AlertTriangle,
  Trash2,
  Loader2,
  UserCheck,
  UserMinus,
  Zap,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { deleteLeadCustomerFile, deleteLeadCustomerFiles } from "@/lib/lead-write-helpers";
import { canUserClaimLead } from "@/lib/lead-ownership";
import { runWithConcurrency } from "@/lib/async-batch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { type LeadRow } from "@/lib/leads-data";
import { buildLeadSourceLabel, isPplLeadSource } from "@/lib/lead-source";
import { deriveSkipGenieMarker } from "@/lib/skip-genie";
import type { UrgencyLevel } from "@/lib/action-derivation";
import { buildOperatorWorkflowSummary } from "@/components/sentinel/operator-workflow-summary";
import { SkipGenieBadge } from "@/components/sentinel/skip-genie-badge";
import type { SortField, SortDir } from "@/hooks/use-leads";
import { cn } from "@/lib/utils";
import { LogCallModal } from "./log-call-modal";

interface LeadTableProps {
  leads: LeadRow[];
  loading?: boolean;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
  onSelect: (id: string) => void;
  onMoveToActive: (id: string) => void | Promise<void>;
  onRemoveMany?: (leadIds: string[]) => void;
  onRefresh?: () => void;
  currentUserId: string;
}

// Grid: select · active · property · do now · due · last touch · actions
const GRID = "grid-cols-[28px_28px_minmax(220px,1.55fr)_minmax(148px,0.95fr)_minmax(120px,1.15fr)_minmax(80px,0.9fr)_minmax(88px,0.95fr)_80px]";
const BULK_ACTION_CONCURRENCY = 6;
const INITIAL_RENDER_COUNT = 150;
const RENDER_COUNT_STEP = 150;

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
        active ? "text-primary bg-primary/[0.06] px-1.5 -mx-0.5 rounded" : "text-muted-foreground",
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
    case "high": return "ops-text-warning text-amber-400";
    case "normal": return "ops-text-meta text-muted-foreground/70";
    case "low": return "ops-text-faint text-muted-foreground/50";
    case "none": return "ops-text-faint text-muted-foreground/40";
  }
}

// Main component

export function LeadTable({
  leads,
  loading = false,
  sortField,
  sortDir,
  onSort,
  onSelect,
  onMoveToActive,
  onRemoveMany,
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
  const [bulkUnclaiming, setBulkUnclaiming] = useState(false);
  const [bulkQueueing, setBulkQueueing] = useState(false);
  const [bulkJeffQueueing, setBulkJeffQueueing] = useState(false);
  const [introActionLeadId, setIntroActionLeadId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_RENDER_COUNT);

  useEffect(() => {
    setVisibleCount(leads.length > INITIAL_RENDER_COUNT ? INITIAL_RENDER_COUNT : leads.length);
  }, [leads.length]);

  useEffect(() => {
    const validIds = new Set(leads.map((lead) => lead.id));
    setSelectedIds((current) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of current) {
        if (validIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [leads]);

  const allSelected = leads.length > 0 && selectedIds.size === leads.length;
  const someSelected = selectedIds.size > 0;
  const renderedLeads = useMemo(
    () => leads.slice(0, Math.max(visibleCount, Math.min(leads.length, INITIAL_RENDER_COUNT))),
    [leads, visibleCount],
  );
  const hasHiddenRows = renderedLeads.length < leads.length;

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
      onRemoveMany?.([lead.id]);
    } finally {
      setDeletingId(null);
    }
  }, [onRemoveMany]);

  const handleBulkDelete = useCallback(async () => {
    const count = selectedIds.size;
    if (count === 0) return;
    if (!window.confirm(`Delete ${count} selected lead${count > 1 ? "s" : ""}?\n\nThis cannot be undone.`)) return;
    setBulkDeleting(true);
    const ids = Array.from(selectedIds);
    try {
      const result = await deleteLeadCustomerFiles(ids);
      if (!result.ok) {
        toast.error(`Delete failed: ${result.error}`);
        return;
      }

      const removedIds = [...result.deletedLeadIds, ...result.skippedLeadIds];
      const deletedCount = result.deletedLeadIds.length;
      const skippedCount = result.skippedLeadIds.length;
      const failedCount = result.failed.length;

      if (removedIds.length > 0) {
        onRemoveMany?.(removedIds);
      }
      setSelectedIds(new Set());

      if (failedCount > 0) {
        toast.error(`Deleted ${deletedCount}, already gone ${skippedCount}, failed ${failedCount}`);
        onRefresh?.();
        return;
      }

      if (skippedCount > 0) {
        toast.warning(`Deleted ${deletedCount}, already gone ${skippedCount}`);
        return;
      }

      toast.success(`Deleted ${deletedCount} lead${deletedCount === 1 ? "" : "s"}`);
    } finally {
      setBulkDeleting(false);
    }
  }, [selectedIds, onRemoveMany, onRefresh]);

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

  const handleBulkMoveToUnclaimed = useCallback(async () => {
    const selectedLeads = leads.filter((lead) => selectedIds.has(lead.id));
    const claimedLeadIds = selectedLeads
      .filter((lead) => typeof lead.assignedTo === "string" && lead.assignedTo.trim().length > 0)
      .map((lead) => lead.id);
    const skippedCount = selectedLeads.length - claimedLeadIds.length;
    const count = claimedLeadIds.length;
    if (selectedLeads.length === 0) return;
    if (count === 0) {
      toast.error("None of the selected leads are currently claimed.");
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      toast.error("Session expired. Please sign in again.");
      return;
    }
    setBulkUnclaiming(true);
    let succeeded = 0;
    let failed = 0;
    try {
      const results = await runWithConcurrency(claimedLeadIds, BULK_ACTION_CONCURRENCY, async (id) => {
        try {
          const res = await fetch("/api/prospects", {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              lead_id: id,
              assigned_to: null,
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
      setBulkUnclaiming(false);
      setSelectedIds(new Set());
      if (failed > 0 || skippedCount > 0) {
        const pieces = [`Moved ${succeeded} to Unclaimed Leads`];
        if (failed > 0) pieces.push(`failed ${failed}`);
        if (skippedCount > 0) pieces.push(`skipped ${skippedCount} already unclaimed`);
        toast.error(pieces.join(", "));
      } else {
        toast.success(`Moved ${succeeded} lead${succeeded > 1 ? "s" : ""} to Unclaimed Leads`);
      }
      onRefresh?.();
    }
  }, [selectedIds, onRefresh, leads]);

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
    if (selectedIds.size === 0) return;

    const selected = leads.filter((l) => selectedIds.has(l.id));
    const driveByCount = selected.filter((l) => l.nextAction?.toLowerCase().startsWith("drive by")).length;
    const dialable = selected.filter((l) => !l.nextAction?.toLowerCase().startsWith("drive by"));
    const noPhoneCount = dialable.filter((l) => !l.ownerPhone).length;
    const queueableIds = dialable.map((l) => l.id);

    if (queueableIds.length === 0) {
      toast.error("0 queued - selected leads are all in Drive By");
      setSelectedIds(new Set());
      return;
    }

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
        body: JSON.stringify({ leadIds: queueableIds }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to add leads to dial queue");
        return;
      }

      const queued = Array.isArray(data.queuedIds) ? data.queuedIds.length : 0;
      const blocked = Array.isArray(data.conflictedIds) ? data.conflictedIds.length : 0;
      const notFound = Array.isArray(data.missingIds) ? data.missingIds.length : 0;

      setSelectedIds(new Set());

      const pieces: string[] = [];
      if (queued > 0) pieces.push(`${queued} queued`);
      if (blocked > 0) pieces.push(`${blocked} already owned`);
      if (driveByCount > 0) pieces.push(`${driveByCount} in Drive By`);
      if (noPhoneCount > 0) pieces.push(`${noPhoneCount} no phone - skip trace from dialer`);
      if (notFound > 0) pieces.push(`${notFound} not found`);

      const hasIssues = blocked > 0 || driveByCount > 0 || noPhoneCount > 0 || notFound > 0;
      if (hasIssues && queued > 0) {
        toast.warning(pieces.join(" · "));
      } else if (hasIssues) {
        toast.error(pieces.join(" · "));
      } else {
        toast.success(pieces.join(" · "));
      }

      onRefresh?.();
    } finally {
      setBulkQueueing(false);
    }
  }, [selectedIds, leads, onRefresh]);

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

  const applyIntroExit = useCallback(async (leadId: string, category: "nurture" | "dead" | "disposition" | "drive_by") => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      toast.error("Session expired. Please sign in again.");
      return false;
    }

    setIntroActionLeadId(leadId);
    try {
      const res = await fetch(`/api/leads/${leadId}/intro-exit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ category }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to update intro category");
        return false;
      }

      const label =
        category === "drive_by" ? "Drive By"
        : category === "nurture" ? "Nurture"
        : category === "dead" ? "Dead"
        : "Disposition";
      toast.success(`Intro completed -> ${label}`);
      onRefresh?.();
      return true;
    } finally {
      setIntroActionLeadId(null);
    }
  }, [onRefresh]);

  const chooseIntroExitCategory = useCallback(async (leadId: string) => {
    const choice = window.prompt(
      "Day 3 complete. Choose category: nurture, disposition, dead, drive_by",
      "nurture",
    )?.trim().toLowerCase();

    if (!choice) return;
    if (!["nurture", "disposition", "dead", "drive_by"].includes(choice)) {
      toast.error("Invalid category. Use nurture, disposition, dead, or drive_by.");
      return;
    }

    await applyIntroExit(leadId, choice as "nurture" | "dead" | "disposition" | "drive_by");
  }, [applyIntroExit]);

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

  if (loading && leads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center rounded-[14px] border border-glass-border bg-glass/30">
        <Loader2 className="h-8 w-8 text-muted-foreground mb-3 animate-spin" />
        <p className="text-sm text-muted-foreground">
          Loading leads…
        </p>
        <p className="ops-text-meta mt-1 text-sm text-muted-foreground/65">
          Pulling the live queue now.
        </p>
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center rounded-[14px] border border-glass-border bg-glass/30">
        <AlertTriangle className="h-8 w-8 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">
          No leads match current filters.
        </p>
        <p className="ops-text-meta mt-1 text-sm text-muted-foreground/65">
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
          <button
            onClick={handleBulkClaim}
            disabled={bulkClaiming}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-primary/15 text-primary border border-primary/25 hover:bg-primary/25 transition-colors disabled:opacity-50"
          >
            {bulkClaiming ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserCheck className="h-3 w-3" />}
            Claim Leads ({selectedIds.size})
          </button>
          <button
            type="button"
            onClick={handleBulkMoveToUnclaimed}
            disabled={bulkUnclaiming}
            className="ops-text-warning flex items-center gap-1.5 rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-300 transition-colors disabled:opacity-50 hover:bg-amber-500/20"
          >
            {bulkUnclaiming ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserMinus className="h-3 w-3" />}
            Move to Unclaimed Leads ({selectedIds.size})
          </button>
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
        <SortHeader label="Source" field="source" currentField={sortField} currentDir={sortDir} onSort={onSort} />
        <SortHeader
          label="Do Now"
          field="followUp"
          currentField={sortField}
          currentDir={sortDir}
          onSort={onSort}
          className="text-left"
          title="Sort: active first, then urgency, then due date"
        />
        <SortHeader label="Due" field="due" currentField={sortField} currentDir={sortDir} onSort={onSort} />
        <SortHeader label="Last Touch" field="lastTouch" currentField={sortField} currentDir={sortDir} onSort={onSort} />
        <span />
      </div>

      {/* Rows */}
      {renderedLeads.map((lead) => {
        const sourceLabel = buildLeadSourceLabel(lead.sourceChannel ?? lead.source, lead.sourceVendor, lead.sourceListName);
        const isPplLead = isPplLeadSource({
          source: lead.source,
          sourceChannel: lead.sourceChannel,
          sourceVendor: lead.sourceVendor,
          intakeMethod: lead.intakeMethod,
          sourceListName: lead.sourceListName,
        });
        const skipGenieMarker = deriveSkipGenieMarker({
          ownerFlags: lead.ownerFlags,
          sourceVendor: lead.sourceVendor,
          sourceListName: lead.sourceListName,
        });
        const wf = buildOperatorWorkflowSummary({
          status: lead.status,
          qualificationRoute: lead.qualificationRoute,
          assignedTo: lead.assignedTo,
          nextCallScheduledAt: lead.nextCallScheduledAt,
          nextFollowUpAt: lead.followUpDate,
          lastContactAt: lead.lastContactAt,
          totalCalls: lead.totalCalls,
          nextAction: lead.nextAction,
          nextActionDueAt: lead.nextActionDueAt,
          createdAt: lead.promotedAt,
          promotedAt: lead.promotedAt,
          introSopActive: lead.introSopActive,
          introDayCount: lead.introDayCount,
          introLastCallDate: lead.introLastCallDate,
          requiresIntroExitCategory: lead.requiresIntroExitCategory,
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
          <div
            key={lead.id}
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
                    aria-label={lead.status === "active" ? "Already Active" : "Move to Active"}
                    aria-pressed={lead.status === "active"}
                    disabled={lead.status === "active"}
                    onClick={() => void onMoveToActive(lead.id)}
                    className={cn(
                      "h-6 w-6 flex items-center justify-center rounded-md transition-colors disabled:cursor-default",
                      lead.status === "active"
                        ? "text-primary bg-primary/10"
                        : "ops-text-faint text-muted-foreground/35 hover:text-primary hover:bg-primary/10",
                    )}
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="text-sm">
                  {lead.status === "active" ? "Already Active" : "Move to Active"}
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
                    {lead.status === "active" && (
                      <span className="shrink-0 text-xs px-2.5 py-1 rounded-md bg-blue-500/15 text-blue-400 font-bold border border-blue-500/25">
                        Active
                      </span>
                    )}
                    {lead.nextAction?.toLowerCase().startsWith("drive by") && (
                      <span className="ops-text-warning flex shrink-0 items-center gap-1 rounded-md border border-amber-500/25 bg-amber-500/15 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-400">
                        <MapPin className="h-3 w-3" />
                        Drive By
                      </span>
                    )}
                    {lead.dialQueueActive && (
                      <span className="shrink-0 text-[10px] px-1.5 py-0 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold uppercase tracking-wide">
                        Queued
                      </span>
                    )}
                    {skipGenieMarker && (
                      <SkipGenieBadge size="sm" title={skipGenieMarker.title} />
                    )}
                    {wf.introBadgeLabel && (
                      <span
                        className={cn(
                          "shrink-0 text-[10px] px-1.5 py-0 rounded border font-semibold uppercase tracking-wide",
                          lead.requiresIntroExitCategory
                            ? "ops-text-warning bg-amber-500/10 text-amber-300 border-amber-500/30"
                            : "bg-primary/10 text-primary border-primary/25",
                        )}
                      >
                        {wf.introBadgeLabel}
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
                      <span className="ops-text-body shrink-0 text-sm tabular-nums text-foreground/80">
                        {formatPhone(lead.ownerPhone)}
                      </span>
                    ) : (
                      <span className="ops-text-faint shrink-0 text-xs text-muted-foreground/30">No phone</span>
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
                        <span className="ops-text-faint text-[10px] text-muted-foreground/50">+{lead.distressSignals.length - 3}</span>
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
                    <p className="ops-text-meta text-xs text-muted-foreground"><span className="ops-text-accent font-medium text-primary">Call angle:</span> {lead.recommendedCallAngle}</p>
                  )}
                  {(lead.topFact1 || lead.topFact2 || lead.topFact3) && (
                    <ul className="ops-text-meta space-y-0.5 text-xs text-muted-foreground">
                      {lead.topFact1 && <li>• {lead.topFact1}</li>}
                      {lead.topFact2 && <li>• {lead.topFact2}</li>}
                      {lead.topFact3 && <li>• {lead.topFact3}</li>}
                    </ul>
                  )}
                  {!lead.sellerSituationSummaryShort && lead.notes && (
                    <p className="ops-text-meta line-clamp-3 text-xs text-muted-foreground">{lead.notes}</p>
                  )}
                </TooltipContent>
              )}
            </Tooltip>

            <div className="flex flex-col justify-center min-w-0 gap-1">
              {isPplLead ? (
                <span className="inline-flex w-fit items-center gap-1.5 rounded-md border border-red-500/35 bg-red-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-red-200 shadow-[0_0_18px_rgba(239,68,68,0.12)]">
                  <span className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.9)]" />
                  PPL
                </span>
              ) : null}
              <span
                className="ops-text-meta truncate text-xs font-medium text-muted-foreground/90"
                title={sourceLabel}
                style={{ WebkitFontSmoothing: "antialiased" }}
              >
                {sourceLabel}
              </span>
            </div>

            {/* Do now */}
            <div className="flex flex-col justify-center min-w-0">
              <span
                className={cn("text-sm truncate", urgencyTextClass(wf.urgency))}
                title={wf.doNow}
              >
                {wf.doNow}
              </span>
              {lead.requiresIntroExitCategory && (
                <button
                  type="button"
                  disabled={introActionLeadId === lead.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    void chooseIntroExitCategory(lead.id);
                  }}
                  className="ops-text-warning mt-1 text-left text-xs font-semibold text-amber-300 hover:text-amber-200 disabled:opacity-50"
                >
                  {introActionLeadId === lead.id ? "Updating..." : "Choose category"}
                </button>
              )}
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
                  wf.lastTouchLabel === "No touch"
                    ? "ops-text-faint text-muted-foreground/40"
                    : wf.lastTouchLabel === "Today"
                      ? "text-primary"
                      : "ops-text-meta text-muted-foreground",
                )}
                title={lead.lastContactAt ?? undefined}
              >
                {wf.lastTouchLabel}
              </span>
            </div>

            {/* Actions (call + delete only) */}
            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => void applyIntroExit(lead.id, "drive_by")}
                    disabled={introActionLeadId === lead.id}
                    className="ops-text-warning h-6 w-6 flex items-center justify-center rounded-md text-amber-300/80 transition-colors hover:bg-amber-500/10 hover:text-amber-200 disabled:opacity-40"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">Mark Drive By</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => addToJeffQueue(lead.id)}
                    disabled={queuingId === lead.id}
                    className="ops-text-accent h-6 w-6 flex items-center justify-center rounded-md text-violet-300/80 transition-colors hover:bg-violet-500/10 hover:text-violet-200 disabled:opacity-40"
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
          </div>
        );
      })}

      {hasHiddenRows && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-glass/40">
          <p className="text-xs text-muted-foreground">
            Showing {renderedLeads.length} of {leads.length} leads.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setVisibleCount((current) => Math.min(leads.length, current + RENDER_COUNT_STEP))}
              className="text-xs font-medium px-3 py-1.5 rounded-md border border-border/25 text-foreground hover:bg-muted/10 transition-colors"
            >
              Show {Math.min(RENDER_COUNT_STEP, leads.length - renderedLeads.length)} more
            </button>
            <button
              type="button"
              onClick={() => setVisibleCount(leads.length)}
              className="text-xs font-medium px-3 py-1.5 rounded-md border border-border/25 text-muted-foreground hover:text-foreground hover:bg-muted/10 transition-colors"
            >
              Show all
            </button>
          </div>
        </div>
      )}

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
