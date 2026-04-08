"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useCoachSurface } from "@/providers/coach-provider";
import { CoachPanel, CoachToggle } from "@/components/sentinel/coach-panel";
import { PageShell } from "@/components/sentinel/page-shell";
import { Button } from "@/components/ui/button";
import { useModal } from "@/providers/modal-provider";
import { LeadSegmentControl } from "@/components/sentinel/leads/lead-segment-control";
import { LeadFilters } from "@/components/sentinel/leads/lead-filters";
import { LeadTable } from "@/components/sentinel/leads/lead-table";
import type { MarketFilter, AttentionFocus } from "@/hooks/use-leads";
import { MasterClientFileModal, clientFileFromLead } from "@/components/sentinel/master-client-file-modal";
import { useLeads } from "@/hooks/use-leads";
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
    importBatchOptions,
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

  // Apply URL filter param on mount and when it changes
  useEffect(() => {
    if (inboundFilter && FILTER_LABELS[inboundFilter]) {
      const mapped = mapFilterToAttention(inboundFilter);
      setAttentionFocus(mapped);
    }
  }, [inboundFilter, setAttentionFocus]);

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

      if (current.status === "lead") {
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

      const res = await fetch("/api/prospects", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          lead_id: leadId,
          status: "lead",
          next_action: nextAction,
          next_action_due_at: nextActionDueAt,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.detail ?? data.error ?? "Could not move lead to Active");
        return;
      }

      toast.success("Moved to Active");
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not move lead to Active");
    }
  }, [refetch]);

  return (
    <PageShell
      title="Lead Queue"
      description="Working inbox — overdue and high-priority leads first."
      actions={
        <div className="flex items-center gap-2">
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
            <span className="text-xs font-medium text-primary">
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
              importBatchOptions={importBatchOptions}
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
          <span className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider mr-0.5">Prep</span>
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
                        <p className="text-sm text-muted-foreground/65">{item.leads} leads</p>
                      </div>
                      <div className="text-right">
                        <p className="text-muted-foreground/70">Contact</p>
                        <p className="font-medium text-foreground">{item.contactRate}%</p>
                      </div>
                      <div className="text-right">
                        <p className="text-muted-foreground/70">Offer Path</p>
                        <p className="font-medium text-foreground">{item.offerPathRate}%</p>
                      </div>
                      <div className="text-right">
                        <p className="text-muted-foreground/70">Closed</p>
                        <p className="font-medium text-foreground">{item.closedRate}%</p>
                      </div>
                      <div className="text-right">
                        <p className="text-muted-foreground/70">Count</p>
                        <p className="font-medium text-foreground">{item.leads}</p>
                      </div>
                    </div>
                  )) : (
                    <p className="text-sm text-muted-foreground/60">Source metrics will appear once leads are worked.</p>
                  )}
                </div>
              </div>

              <div className="rounded-[12px] border border-glass-border bg-glass/40 p-3">
                <p className="text-xs font-semibold text-foreground">Top Niches</p>
                <div className="mt-3 space-y-2">
                  {nicheMetrics.length > 0 ? nicheMetrics.map((item) => (
                    <div key={item.tag} className="flex items-center justify-between rounded-[10px] border border-overlay-6 bg-overlay-2 px-3 py-2 text-sm">
                      <span className="font-medium text-foreground">{item.label}</span>
                      <span className="text-muted-foreground/75">{item.count}</span>
                    </div>
                  )) : (
                    <p className="text-sm text-muted-foreground/60">No niche tags tracked yet.</p>
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
        open={selectedId !== null}
        onClose={() => setSelectedId(null)}
        onRefresh={refetch}
      />

      <CoachPanel />
    </PageShell>
  );
}
