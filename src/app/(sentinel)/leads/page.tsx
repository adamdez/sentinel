"use client";

import { useState } from "react";
import { Plus, ChevronRight } from "lucide-react";
import { useCoachSurface } from "@/providers/coach-provider";
import { CoachPanel, CoachToggle } from "@/components/sentinel/coach-panel";
import { PageShell } from "@/components/sentinel/page-shell";
import { Button } from "@/components/ui/button";
import { useModal } from "@/providers/modal-provider";
import { MapPin } from "lucide-react";
import { LeadSegmentControl } from "@/components/sentinel/leads/lead-segment-control";
import { LeadFilters } from "@/components/sentinel/leads/lead-filters";
import { LeadTable } from "@/components/sentinel/leads/lead-table";
import type { MarketFilter } from "@/hooks/use-leads";
import { MasterClientFileModal, clientFileFromLead } from "@/components/sentinel/master-client-file-modal";
import { useLeads } from "@/hooks/use-leads";
import { cn } from "@/lib/utils";

function InboxStat({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string | number;
  tone?: "neutral" | "warn" | "danger";
  hint?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[10px] border px-3 py-2 min-w-[120px]",
        tone === "danger" && "border-border/25 bg-muted/[0.04]",
        tone === "warn" && "border-border/25 bg-muted/[0.04]",
        tone === "neutral" && "border-glass-border bg-glass/30",
      )}
    >
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-[10px] text-muted-foreground/70">{hint}</p> : null}
    </div>
  );
}

export default function LeadsPage() {
  const {
    leads,
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
    inboxMetrics,
    outboundSourceMetrics,
    nicheMetrics,
    totalFiltered,
    currentUser,
    teamMembers,
    refetch,
  } = useLeads();
  const { openModal } = useModal();
  const segmentTotal =
    segment === "all"
      ? segmentCounts.all
      : segment === "mine"
        ? segmentCounts.mine
        : (segmentCounts.byMember[segment] ?? 0);
  const attentionItems: Array<{
    id:
      | "new_inbound"
      | "overdue"
      | "unassigned_hot"
      | "slow_or_missing"
      | "needs_qualification"
      | "escalated_review";
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
  const [showSourceInsights, setShowSourceInsights] = useState(false);

  useCoachSurface("leads_inbox", {
    inbox: {
      overdue_count: needsAttention.overdue,
      new_inbound_count: needsAttention.newInbound,
      unqualified_count: needsAttention.needsQualification,
      escalated_count: needsAttention.escalatedReview,
    },
  });

  return (
    <PageShell
      title="Lead Inbox"
      description="Promoted seller leads prioritized for first contact and follow-up."
      actions={
        <div className="flex items-center gap-2">
          <Button size="sm" className="gap-2 text-xs" onClick={() => openModal("new-prospect")}>
            <Plus className="h-3 w-3" />
            Add Lead
          </Button>
          <CoachToggle />
        </div>
      }
    >
      <div className="space-y-4">
        {/* Inbox health strip */}
        <div className="flex flex-wrap items-center gap-2">
          <InboxStat label="Overdue" value={inboxMetrics.overdue} tone={inboxMetrics.overdue > 0 ? "danger" : "neutral"} />
          <InboxStat label="Due Today" value={inboxMetrics.dueToday} tone={inboxMetrics.dueToday > 0 ? "warn" : "neutral"} />
          <div className={cn(inboxMetrics.uncontacted === 0 && "opacity-40")}>
            <InboxStat label="Awaiting Contact" value={inboxMetrics.uncontacted} tone={inboxMetrics.uncontacted > 0 ? "warn" : "neutral"} />
          </div>
          {inboxMetrics.newToday > 0 && (
            <InboxStat label="New Today" value={inboxMetrics.newToday} />
          )}
        </div>

        {/* Quick market filter */}
        <div className="flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] font-medium text-muted-foreground">Market:</span>
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
          {filters.markets.length > 0 && (
            <button
              onClick={() => updateFilter("markets", [])}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>

        {/* Needs attention quick focus */}
        <div className="rounded-[12px] border border-glass-border bg-glass/40 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs font-semibold text-foreground">
              Needs Attention
            </div>

            {attentionItems.filter((item) => item.count > 0).map((item) => {
              const active = attentionFocus === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setAttentionFocus(active ? "none" : item.id)}
                  className={cn(
                    "text-[11px] px-2.5 py-1 rounded-md border transition-all",
                    active
                      ? "border-primary/25 bg-primary/10 text-primary"
                      : item.count > 0
                        ? "border-border/20 text-foreground hover:border-border/35"
                        : "border-glass-border text-muted-foreground hover:border-white/15 hover:text-foreground"
                  )}
                >
                  {item.label} ({item.count})
                </button>
              );
            })}

            {attentionFocus !== "none" && (
              <button
                onClick={() => setAttentionFocus("none")}
                className="text-[11px] px-2.5 py-1 rounded-md border border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20"
              >
                Clear Focus
              </button>
            )}
          </div>
        </div>

        {/* Segmented control */}
        <LeadSegmentControl
          value={segment}
          onChange={setSegment}
          counts={segmentCounts}
          currentUserId={currentUser.id}
          currentUserRole={currentUser.role}
          teamMembers={teamMembers}
        />
        <p className="text-[11px] text-muted-foreground/70">
          My Leads is your ownership queue. Stage remains workflow position.
        </p>
        <p className="text-[11px] text-muted-foreground/60">
          Closed records stay hidden by default, but can be surfaced with the `Include closed` filter for recovery and lookup.
        </p>

        {/* Filters + search */}
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

        {/* Collapsible Source Performance */}
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
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-foreground">Source Snapshot</p>
                    <p className="text-[10px] text-muted-foreground/70">
                      Contact, offer-path, and closed rates are directionally useful. Closed rate reflects `closed` only; contract is not yet modeled separately.
                    </p>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {outboundSourceMetrics.length > 0 ? outboundSourceMetrics.map((item) => (
                    <div key={item.label} className="grid grid-cols-[1.4fr_repeat(4,80px)] gap-2 rounded-[10px] border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px]">
                      <div>
                        <p className="font-semibold text-foreground">{item.label}</p>
                        <p className="text-[10px] text-muted-foreground/65">{item.leads} leads</p>
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
                    <p className="text-[11px] text-muted-foreground/60">Source metrics will appear once prospecting intake metadata is used.</p>
                  )}
                </div>
              </div>

              <div className="rounded-[12px] border border-glass-border bg-glass/40 p-3">
                <p className="text-xs font-semibold text-foreground">Top Niches</p>
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                  Quick read on what kinds of outbound lists are turning into live CRM work.
                </p>
                <div className="mt-3 space-y-2">
                  {nicheMetrics.length > 0 ? nicheMetrics.map((item) => (
                    <div key={item.tag} className="flex items-center justify-between rounded-[10px] border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px]">
                      <span className="font-medium text-foreground">{item.label}</span>
                      <span className="text-muted-foreground/75">{item.count}</span>
                    </div>
                  )) : (
                    <p className="text-[11px] text-muted-foreground/60">No niche tags tracked yet.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Lead table */}
        <LeadTable
          leads={leads}
          sortField={sortField}
          sortDir={sortDir}
          onSort={toggleSort}
          onSelect={setSelectedId}
          onRefresh={refetch}
          currentUserId={currentUser.id}
        />
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

