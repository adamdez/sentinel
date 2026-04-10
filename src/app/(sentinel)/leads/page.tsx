"use client";

import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useCoachSurface } from "@/providers/coach-provider";
import { CoachPanel, CoachToggle } from "@/components/sentinel/coach-panel";
import { PageShell } from "@/components/sentinel/page-shell";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useModal } from "@/providers/modal-provider";
import { LeadSegmentControl } from "@/components/sentinel/leads/lead-segment-control";
import { LeadFilters } from "@/components/sentinel/leads/lead-filters";
import { LeadTable } from "@/components/sentinel/leads/lead-table";
import type { MarketFilter, AttentionFocus } from "@/hooks/use-leads";
import { MasterClientFileModal, clientFileFromLead } from "@/components/sentinel/master-client-file-modal";
import { useLeads } from "@/hooks/use-leads";
import type { LeadRow } from "@/lib/leads-data";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { filterChip } from "@/lib/sentinel-ui";
import { getAuthenticatedProspectPatchHeaders } from "@/lib/prospect-api-client";

type InboundFilter = "overdue" | "new_inbound" | "due_today" | "callbacks_today";

const FILTER_LABELS: Record<InboundFilter, string> = {
  overdue: "Overdue Follow-ups",
  new_inbound: "New Inbound",
  due_today: "Due Today",
  callbacks_today: "Today's Callbacks",
};

function mapFilterToAttention(f: InboundFilter): AttentionFocus {
  switch (f) {
    case "overdue": return "overdue";
    case "new_inbound": return "new_inbound";
    case "due_today": return "overdue";
    case "callbacks_today": return "overdue";
    default: return "none";
  }
}

function buildLeadExportRows(leads: LeadRow[]) {
  return leads.map((lead) => ({
    "Sentinel Lead ID": lead.id,
    "Sentinel Property ID": lead.propertyId,
    Status: lead.status,
    "Owner Name": lead.ownerName,
    "Property Address": lead.address,
    "Property City": lead.city,
    "Property State": lead.state,
    "Property Zip": lead.zip,
    County: lead.county,
    APN: lead.apn,
    Phone: lead.ownerPhone ?? "",
    "Owner Email": lead.ownerEmail ?? "",
    "Distress Tags": lead.distressSignals.join(", "),
    "Source Channel": lead.sourceChannel ?? lead.source,
    "Source Vendor": lead.sourceVendor ?? "",
    "Source List Name": lead.sourceListName ?? "",
    "Source Pull Date": lead.sourcePullDate ?? "",
    "Niche Tag": lead.nicheTag ?? "",
    "Import Batch ID": lead.importBatchId ?? "",
    "Scout Run ID": lead.scoutRunId ?? "",
    "Scout Source System": lead.scoutSourceSystem ?? "",
    "Skip Trace Status": lead.skipTraceStatus ?? "",
    "Current Notes": lead.notes ?? "",
    "Next Follow Up": lead.followUpDate ?? "",
  }));
}

function splitOwnerName(ownerName: string) {
  const trimmed = ownerName.trim();
  if (!trimmed) {
    return { firstName: "", middleName: "", lastName: "" };
  }

  if (trimmed.includes(",")) {
    const [lastNamePart, restPart] = trimmed.split(",", 2).map((part) => part.trim());
    const restTokens = restPart ? restPart.split(/\s+/).filter(Boolean) : [];
    return {
      firstName: restTokens[0] ?? "",
      middleName: restTokens.slice(1).join(" "),
      lastName: lastNamePart,
    };
  }

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 1) {
    return { firstName: tokens[0], middleName: "", lastName: "" };
  }

  return {
    firstName: tokens[0] ?? "",
    middleName: tokens.slice(1, -1).join(" "),
    lastName: tokens[tokens.length - 1] ?? "",
  };
}

function buildSkipGenieExportRows(leads: LeadRow[]) {
  return leads.map((lead) => {
    const { firstName, middleName, lastName } = splitOwnerName(lead.ownerName);
    return {
      LastName: lastName,
      FirstName: firstName,
      MiddleName: middleName,
      Address: lead.address,
      City: lead.city,
      State: lead.state,
      ZipCode: lead.zip,
      Campaign: lead.sourceListName ?? lead.nicheTag ?? "Sentinel Skip Trace",
      "Sentinel Lead ID": lead.id,
      "Sentinel Property ID": lead.propertyId,
      APN: lead.apn,
      County: lead.county,
      "Owner Name": lead.ownerName,
    };
  });
}

type LeadExportFormat = "xlsx" | "csv" | "skipgenie_csv";

type SkipGeniePreviewPayload = {
  effectiveMapping: Record<string, string>;
  defaults: {
    sourceChannel: string;
    sourceVendor: string;
    sourceListName: string;
    sourcePullDate: string;
    county: string;
    nicheTag: string;
    importBatchId: string;
    outreachType: string;
    skipTraceStatus: string;
    templateName: string;
    templateId: string;
  };
  lowConfidenceFields: string[];
  requiresReview: boolean;
  workbook: {
    chosenSheet: string;
  };
};

type SkipGenieCommitPayload = {
  imported: number;
  updated: number;
  skipped: number;
  errors: number;
  skippedRows: Array<{ rowNumber: number; status: string; reason: string }>;
  errorRows: Array<{ rowNumber: number; error: string }>;
};

type SkipGenieImportHandoff = {
  source: "skip_genie";
  fileName: string;
  fileType: string;
  dataUrl: string;
  defaults: SkipGeniePreviewPayload["defaults"];
  createdAt: number;
};

const SKIP_GENIE_IMPORT_HANDOFF_KEY = "sentinel.skipgenie.import-handoff";

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read Skip Genie file"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read Skip Genie file"));
    reader.readAsDataURL(file);
  });
}

function buildLeadExportFileName(leads: LeadRow[], distressTags: string[], format: LeadExportFormat) {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const tagSegment =
    distressTags.length === 1
      ? distressTags[0].replace(/[^a-z0-9]+/gi, "-").toLowerCase()
      : "filtered";
  if (format === "skipgenie_csv") {
    return `sentinel-skipgenie-${tagSegment}-leads-${leads.length}-${stamp}.csv`;
  }
  return `sentinel-${tagSegment}-leads-${leads.length}-${stamp}.${format}`;
}


export default function LeadsPage() {
  return (
    <Suspense>
      <LeadsPageInner />
    </Suspense>
  );
}

function LeadsPageInner() {
  const searchParams = useSearchParams();
  const inboundFilter = searchParams.get("filter") as InboundFilter | null;
  const openLeadId = searchParams.get("open");
  const requestedSegment = searchParams.get("segment");

  const {
    leads,
    loading,
    segment,
    setSegment,
    attentionFocus,
    setAttentionFocus,
    needsAttention,
    filters,
    updateFilter,
    resetFilters,
    sortField,
    sortDir,
    toggleSort,
    selectedLead,
    selectedId,
    setSelectedId,
    segmentCounts,
    sourceOptions,
    nicheOptions,
    batchOrRunOptions,
    callStatusOptions,
    outboundSourceMetrics,
    nicheMetrics,
    totalFiltered,
    currentUser,
    teamMembers,
    distressTagOptions,
    removeLeadsByIds,
    refetch,
  } = useLeads();
  const { openModal } = useModal();
  const [showSourceInsights, setShowSourceInsights] = useState(false);
  const [skipGenieImporting, setSkipGenieImporting] = useState(false);
  const skipGenieInputRef = useRef<HTMLInputElement | null>(null);

  // Apply URL filter param on mount and when it changes
  useEffect(() => {
    if (inboundFilter && FILTER_LABELS[inboundFilter]) {
      const mapped = mapFilterToAttention(inboundFilter);
      setAttentionFocus(mapped);
    }
  }, [inboundFilter, setAttentionFocus]);

  useEffect(() => {
    if (requestedSegment === "all" || requestedSegment === "mine") {
      setSegment(requestedSegment);
    }
  }, [requestedSegment, setSegment]);

  useEffect(() => {
    if (!openLeadId) return;
    const matchingLead = leads.find((lead) => lead.id === openLeadId);
    if (!matchingLead) return;
    if (selectedId !== openLeadId) {
      setSelectedId(openLeadId);
    }
  }, [leads, openLeadId, selectedId, setSelectedId]);

  const segmentTotal =
    segment === "all"
      ? segmentCounts.all
      : segment === "mine"
        ? segmentCounts.mine
        : (segmentCounts.byMember[segment] ?? 0);

  const attentionItems: Array<{
    id: AttentionFocus;
    label: string;
    count: number;
  }> = [
    { id: "overdue", label: "Overdue", count: needsAttention.overdue },
    { id: "new_inbound", label: "New", count: needsAttention.newInbound },
    { id: "needs_qualification", label: "Qualify", count: needsAttention.needsQualification },
    { id: "escalated_review", label: "Escalated", count: needsAttention.escalatedReview },
    { id: "unassigned_hot", label: "Unassigned", count: needsAttention.unassignedHot },
    { id: "slow_or_missing", label: "Slow Response", count: needsAttention.slowOrMissing },
  ];

  useCoachSurface("leads_inbox", {
    inbox: {
      overdue_count: needsAttention.overdue,
      new_inbound_count: needsAttention.newInbound,
      unqualified_count: needsAttention.needsQualification,
      escalated_count: needsAttention.escalatedReview,
    },
  });

  const handleMoveToActive = useCallback(async (leadId: string) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: current, error: fetchErr } = await (supabase.from("leads") as any)
        .select("status, lock_version, next_action, next_action_due_at, next_call_scheduled_at, next_follow_up_at, follow_up_date")
        .eq("id", leadId)
        .single();

      if (fetchErr || !current) {
        toast.error("Could not load lead. Refresh and try again.");
        return;
      }

      if (current.status === "active") {
        toast.message("Already in Active");
        return;
      }

      const headers = await getAuthenticatedProspectPatchHeaders(current.lock_version ?? 0);
      const nextAction =
        typeof current.next_action === "string" && current.next_action.trim()
          ? current.next_action.trim()
          : "Initial seller outreach";
      const nextActionDueAt =
        current.next_action_due_at
        ?? current.next_call_scheduled_at
        ?? current.next_follow_up_at
        ?? current.follow_up_date
        ?? null;

      const moveToActive = async (noteAppend?: string) => {
        const payload: Record<string, unknown> = {
          lead_id: leadId,
          status: "active",
          next_action: nextAction,
          next_action_due_at: nextActionDueAt,
        };
        if (noteAppend) {
          payload.note_append = noteAppend;
        }

        const res = await fetch("/api/prospects", {
          method: "PATCH",
          headers,
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({})) as { error?: string; detail?: string };
        return { res, data };
      };

      const missingActiveNoteMessage = "Add a short seller progress note before moving to Active when no prior note exists.";
      const isMissingActiveNoteError = (status: number, data: { error?: string; detail?: string }) =>
        status === 422 && `${data.detail ?? data.error ?? ""}`.toLowerCase().includes("progress note");

      let result = await moveToActive();

      if (!result.res.ok && isMissingActiveNoteError(result.res.status, result.data)) {
        const activeSummary = window.prompt("Add a short seller progress note for Active (required because no prior note exists):");
        if (activeSummary == null) {
          return;
        }

        const trimmed = activeSummary.trim();
        if (!trimmed) {
          toast.error(missingActiveNoteMessage);
          return;
        }

        result = await moveToActive(trimmed);
      }

      if (!result.res.ok) {
        toast.error(result.data.detail ?? result.data.error ?? "Could not move lead to Active");
        return;
      }

      toast.success("Moved to Active");
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not move lead to Active");
    }
  }, [refetch]);

  const handleExportLeads = useCallback(async (format: LeadExportFormat) => {
    if (leads.length === 0) {
      toast.error("No leads match the current filters.");
      return;
    }

    try {
      const XLSX = await import("xlsx");
      const rows = format === "skipgenie_csv" ? buildSkipGenieExportRows(leads) : buildLeadExportRows(leads);
      const worksheet = XLSX.utils.json_to_sheet(rows);

      if (format === "csv" || format === "skipgenie_csv") {
        const csv = XLSX.utils.sheet_to_csv(worksheet);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = buildLeadExportFileName(leads, filters.distressTags, format);
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      } else {
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Leads");
        XLSX.writeFile(workbook, buildLeadExportFileName(leads, filters.distressTags, format));
      }

      const formatLabel = format === "skipgenie_csv" ? "Skip Genie CSV" : format.toUpperCase();
      toast.success(`Exported ${leads.length} lead${leads.length === 1 ? "" : "s"} as ${formatLabel}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not export leads");
    }
  }, [filters.distressTags, leads]);

  const getImportAuthHeaders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error("Session expired. Please sign in again.");
    }
    return { Authorization: `Bearer ${session.access_token}` };
  }, []);

  const handleSkipGenieImport = useCallback(async (file: File) => {
    setSkipGenieImporting(true);
    try {
      const headers = await getImportAuthHeaders();
      const previewForm = new FormData();
      previewForm.append("file", file);
      previewForm.append("defaults", JSON.stringify({
        sourceChannel: "batch_skip_trace",
        sourceVendor: "Skip Genie",
        sourceListName: "Skip Genie Return",
        sourcePullDate: new Date().toISOString().slice(0, 10),
        county: "",
        nicheTag: filters.distressTags.length === 1 ? filters.distressTags[0] : "",
        importBatchId: file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase(),
        outreachType: "cold_call",
        skipTraceStatus: "completed",
        templateName: "",
        templateId: "",
      }));

      const previewRes = await fetch("/api/imports/preview", {
        method: "POST",
        headers,
        body: previewForm,
      });
      const previewData = await previewRes.json().catch(() => ({})) as Partial<SkipGeniePreviewPayload> & { error?: string };
      if (!previewRes.ok) {
        throw new Error(previewData.error ?? `Preview failed (${previewRes.status})`);
      }

      if (!previewData.workbook?.chosenSheet || !previewData.effectiveMapping || !previewData.defaults) {
        throw new Error("Skip Genie preview did not return a usable mapping.");
      }

      if ((previewData.requiresReview ?? false) || (previewData.lowConfidenceFields?.length ?? 0) > 0) {
        const handoffPayload: SkipGenieImportHandoff = {
          source: "skip_genie",
          fileName: file.name,
          fileType: file.type,
          dataUrl: await fileToDataUrl(file),
          defaults: previewData.defaults,
          createdAt: Date.now(),
        };
        const serializedHandoff = JSON.stringify(handoffPayload);
        sessionStorage.setItem(SKIP_GENIE_IMPORT_HANDOFF_KEY, serializedHandoff);
        localStorage.setItem(SKIP_GENIE_IMPORT_HANDOFF_KEY, serializedHandoff);
        toast.error("Skip Genie file needs manual review. Loading it into the import screen now.");
        window.location.assign("/admin/import?skipgenie_review=1");
        return;
      }

      const commitForm = new FormData();
      commitForm.append("file", file);
      commitForm.append("sheet_name", previewData.workbook.chosenSheet);
      commitForm.append("mapping", JSON.stringify(previewData.effectiveMapping));
      commitForm.append("defaults", JSON.stringify(previewData.defaults));
      commitForm.append("duplicate_strategy", "update_missing");
      commitForm.append("save_template", "false");
      commitForm.append("force_commit", "true");

      const commitRes = await fetch("/api/imports/commit", {
        method: "POST",
        headers,
        body: commitForm,
      });
      const commitData = await commitRes.json().catch(() => ({})) as Partial<SkipGenieCommitPayload> & { error?: string };
      if (!commitRes.ok) {
        throw new Error(commitData.error ?? `Import failed (${commitRes.status})`);
      }

      const updated = commitData.updated ?? 0;
      const imported = commitData.imported ?? 0;
      const skipped = commitData.skipped ?? 0;
      const errors = commitData.errors ?? 0;

      if (errors > 0) {
        const firstError = commitData.errorRows?.[0]?.error;
        toast.error(`Skip Genie import finished with ${errors} error${errors === 1 ? "" : "s"}.`, {
          description: firstError ?? `${updated} updated, ${imported} imported, ${skipped} skipped.`,
        });
      } else if (skipped > 0) {
        const firstSkipped = commitData.skippedRows?.[0];
        toast.success(`Skip Genie import complete: ${updated} updated, ${imported} imported, ${skipped} skipped.`, {
          description: firstSkipped ? `Row ${firstSkipped.rowNumber}: ${firstSkipped.reason}` : undefined,
        });
      } else {
        toast.success(`Skip Genie import complete: ${updated} updated, ${imported} imported.`);
      }

      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not import Skip Genie results");
    } finally {
      setSkipGenieImporting(false);
      if (skipGenieInputRef.current) {
        skipGenieInputRef.current.value = "";
      }
    }
  }, [filters.distressTags, getImportAuthHeaders, refetch]);

  return (
    <PageShell
      title="Lead Queue"
      description="Working inbox — overdue and high-priority leads first."
      actions={
        <div className="flex items-center gap-2">
          <input
            ref={skipGenieInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void handleSkipGenieImport(file);
            }}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="gap-2 text-xs"
                disabled={leads.length === 0}
              >
                Export
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={() => void handleExportLeads("xlsx")}>
                Export XLSX
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleExportLeads("csv")}>
                Export CSV
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleExportLeads("skipgenie_csv")}>
                Skip Genie CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="gap-2 text-xs"
                disabled={skipGenieImporting}
              >
                {skipGenieImporting ? "Importing..." : "Import"}
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={() => skipGenieInputRef.current?.click()}>
                Import Skip Genie Results
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => window.location.assign("/admin/import")}>
                Import Sheet
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" className="gap-2 text-xs" onClick={() => openModal("new-prospect")}>
            <Plus className="h-3 w-3" />
            New Seller Lead
          </Button>
          <CoachToggle />
        </div>
      }
    >
      <div className="space-y-2">
        {/* Active filter banner from Today deep-link */}
        {inboundFilter && FILTER_LABELS[inboundFilter] && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-primary/20 bg-primary/[0.04]">
            <span className="ops-text-accent text-xs font-medium text-primary">
              Filtered: {FILTER_LABELS[inboundFilter]}
            </span>
            <button
              onClick={() => {
                setAttentionFocus("none");
                window.history.replaceState(null, "", "/leads");
              }}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>
        )}

        {/* Row 1: Segment tabs + market selector + search/filters */}
        <div className="flex flex-wrap items-center gap-3">
          <LeadSegmentControl
            value={segment}
            onChange={setSegment}
            counts={segmentCounts}
            currentUserId={currentUser.id}
            currentUserRole={currentUser.role}
            teamMembers={teamMembers}
          />
          <select
            value={filters.markets.length === 1 ? filters.markets[0] : "all"}
            onChange={(e) => {
              const val = e.target.value as MarketFilter | "all";
              updateFilter("markets", val === "all" ? [] : [val]);
            }}
            className="h-7 rounded-md border border-glass-border bg-glass/40 px-2 text-xs text-foreground focus:border-primary/30 focus:outline-none focus:ring-1 focus:ring-ring/20"
          >
            <option value="all">All Markets</option>
            <option value="spokane">Spokane</option>
            <option value="kootenai">Kootenai</option>
            <option value="other">Other</option>
          </select>
          <div className="ml-auto">
            <LeadFilters
              filters={filters}
              onUpdate={updateFilter}
              onReset={resetFilters}
              totalFiltered={totalFiltered}
              totalAll={segmentTotal}
              sourceOptions={sourceOptions}
              nicheOptions={nicheOptions}
              batchOrRunOptions={batchOrRunOptions}
              callStatusOptions={callStatusOptions}
            />
          </div>
        </div>

        {/* Row 2: Focus chips — replaces stat tiles + old focus row */}
        <div className="flex flex-wrap items-center gap-1.5">
          {attentionItems.filter((item) => item.count > 0).map((item) => {
            const isActive = attentionFocus === item.id;
            const isDanger = item.id === "overdue";
            const isWarn = item.id === "needs_qualification" || item.id === "escalated_review";
            return (
              <button
                key={item.id}
                onClick={() => setAttentionFocus(isActive ? "none" : item.id)}
                className={cn(
                  "text-xs px-2 py-0.5 rounded border transition-all font-medium",
                  isActive
                    ? "border-primary/25 bg-primary/10 text-primary"
                    : isDanger && item.count > 0
                      ? "border-red-500/20 text-red-400 hover:bg-red-500/5"
                      : isWarn && item.count > 0
                        ? "border-amber-500/20 text-amber-400/80 hover:bg-amber-500/5"
                        : "border-border/20 text-foreground/70 hover:border-border/35"
                )}
              >
                {item.label} <span className="tabular-nums">{item.count}</span>
              </button>
            );
          })}
          {attentionFocus !== "none" && (
            <button
              onClick={() => {
                setAttentionFocus("none");
                if (inboundFilter) window.history.replaceState(null, "", "/leads");
              }}
              className="text-xs px-2 py-0.5 rounded border border-overlay-10 text-muted-foreground hover:text-foreground hover:border-overlay-20"
            >
              Clear
            </button>
          )}
        </div>

        {/* Row 3: Dialer-prep quick-filters — only non-redundant prep controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="ops-text-faint mr-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">Prep</span>
          <button
            onClick={() => updateFilter("hasPhone", filters.hasPhone === "yes" ? "any" : "yes")}
            className={cn(
              "text-xs px-2 py-0.5 rounded border transition-all",
              filters.hasPhone === "yes" ? filterChip.active : filterChip.idle,
            )}
          >
            Has phone
          </button>
          <button
            onClick={() => updateFilter("hasPhone", filters.hasPhone === "no" ? "any" : "no")}
            className={cn(
              "text-xs px-2 py-0.5 rounded border transition-all",
              filters.hasPhone === "no" ? "bg-red-500/10 text-red-400 border-red-500/20" : filterChip.idle,
            )}
          >
            No phone
          </button>
          <span className="text-muted-foreground/20">·</span>
          <button
            onClick={() => updateFilter("neverCalled", !filters.neverCalled)}
            className={cn(
              "text-xs px-2 py-0.5 rounded border transition-all",
              filters.neverCalled ? filterChip.active : filterChip.idle,
            )}
          >
            Never called
          </button>
          <button
            onClick={() => updateFilter("notCalledToday", !filters.notCalledToday)}
            className={cn(
              "text-xs px-2 py-0.5 rounded border transition-all",
              filters.notCalledToday ? filterChip.active : filterChip.idle,
            )}
          >
            Not called today
          </button>
          <span className="text-muted-foreground/20">·</span>
          <button
            onClick={() => updateFilter("inDialQueue", filters.inDialQueue === "yes" ? "any" : "yes")}
            className={cn(
              "text-xs px-2 py-0.5 rounded border transition-all",
              filters.inDialQueue === "yes" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : filterChip.idle,
            )}
          >
            In Queue
          </button>
          <button
            onClick={() => updateFilter("inDialQueue", filters.inDialQueue === "no" ? "any" : "no")}
            className={cn(
              "text-xs px-2 py-0.5 rounded border transition-all",
              filters.inDialQueue === "no" ? filterChip.active : filterChip.idle,
            )}
          >
            Not in Queue
          </button>
          {distressTagOptions.length > 0 && (
            <>
              <span className="text-muted-foreground/20">·</span>
              {distressTagOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    const next = filters.distressTags.includes(opt.value)
                      ? filters.distressTags.filter((v: string) => v !== opt.value)
                      : [...filters.distressTags, opt.value];
                    updateFilter("distressTags", next);
                  }}
                  className={cn(
                    "text-xs px-2 py-0.5 rounded border transition-all",
                    filters.distressTags.includes(opt.value)
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      : filterChip.idle,
                  )}
                >
                  {opt.label} <span className="opacity-50">({opt.count})</span>
                </button>
              ))}
            </>
          )}
        </div>

        {/* Lead table — dominates the page */}
        <LeadTable
          leads={leads}
          loading={loading}
          sortField={sortField}
          sortDir={sortDir}
          onSort={toggleSort}
          onSelect={setSelectedId}
          onMoveToActive={handleMoveToActive}
          onRemoveMany={removeLeadsByIds}
          onRefresh={refetch}
          currentUserId={currentUser.id}
        />

        {/* Collapsible Source Performance — demoted below table */}
        <div>
          <button
            onClick={() => setShowSourceInsights(!showSourceInsights)}
            className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", showSourceInsights && "rotate-90")} />
            Source Performance
          </button>
          {showSourceInsights && (
            <div className="mt-2 grid gap-4 lg:grid-cols-[1.7fr_1fr]">
              <div className="rounded-[12px] border border-glass-border bg-glass/40 p-3">
                <p className="text-xs font-semibold text-foreground">Source Snapshot</p>
                <div className="mt-3 space-y-2">
                  {outboundSourceMetrics.length > 0 ? outboundSourceMetrics.map((item) => (
                    <div key={item.label} className="grid grid-cols-[1.4fr_repeat(4,80px)] gap-2 rounded-[10px] border border-overlay-6 bg-overlay-2 px-3 py-2 text-sm">
                      <div>
                        <p className="font-semibold text-foreground">{item.label}</p>
                        <p className="ops-text-meta text-sm text-muted-foreground/65">{item.leads} leads</p>
                      </div>
                      <div className="text-right">
                        <p className="ops-text-meta text-muted-foreground/70">Contact</p>
                        <p className="font-medium text-foreground">{item.contactRate}%</p>
                      </div>
                      <div className="text-right">
                        <p className="ops-text-meta text-muted-foreground/70">Offer Path</p>
                        <p className="font-medium text-foreground">{item.offerPathRate}%</p>
                      </div>
                      <div className="text-right">
                        <p className="ops-text-meta text-muted-foreground/70">Closed</p>
                        <p className="font-medium text-foreground">{item.closedRate}%</p>
                      </div>
                      <div className="text-right">
                        <p className="ops-text-meta text-muted-foreground/70">Count</p>
                        <p className="font-medium text-foreground">{item.leads}</p>
                      </div>
                    </div>
                  )) : (
                    <p className="ops-text-meta text-sm text-muted-foreground/60">Source metrics will appear once leads are worked.</p>
                  )}
                </div>
              </div>

              <div className="rounded-[12px] border border-glass-border bg-glass/40 p-3">
                <p className="text-xs font-semibold text-foreground">Top Niches</p>
                <div className="mt-3 space-y-2">
                  {nicheMetrics.length > 0 ? nicheMetrics.map((item) => (
                    <div key={item.tag} className="flex items-center justify-between rounded-[10px] border border-overlay-6 bg-overlay-2 px-3 py-2 text-sm">
                      <span className="font-medium text-foreground">{item.label}</span>
                      <span className="ops-text-meta text-muted-foreground/75">{item.count}</span>
                    </div>
                  )) : (
                    <p className="ops-text-meta text-sm text-muted-foreground/60">No niche tags tracked yet.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detail modal */}
      <MasterClientFileModal
        clientFile={selectedLead ? clientFileFromLead(selectedLead) : null}
        open={selectedLead !== null && selectedId !== null}
        onClose={() => {
          setSelectedId(null);
          if (openLeadId) {
            const next = new URLSearchParams(searchParams.toString());
            next.delete("open");
            next.delete("segment");
            const query = next.toString();
            window.history.replaceState(null, "", query ? `/leads?${query}` : "/leads");
          }
        }}
        onRefresh={refetch}
      />

      <CoachPanel />
    </PageShell>
  );
}
