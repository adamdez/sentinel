"use client";

import { Shield, Radio } from "lucide-react";
import { useCoachSurface } from "@/providers/coach-provider";
import { CoachPanel, CoachToggle } from "@/components/sentinel/coach-panel";
import { PageShell } from "@/components/sentinel/page-shell";
import { Badge } from "@/components/ui/badge";
import { LeadSegmentControl } from "@/components/sentinel/leads/lead-segment-control";
import { LeadFilters } from "@/components/sentinel/leads/lead-filters";
import { LeadTable } from "@/components/sentinel/leads/lead-table";
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
        tone === "danger" && "border-red-500/25 bg-red-500/[0.04]",
        tone === "warn" && "border-yellow-500/25 bg-yellow-500/[0.04]",
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
    { id: "overdue", label: "Needs Follow-Up", count: needsAttention.overdue },
    { id: "new_inbound", label: "New Today (No Contact)", count: needsAttention.newInbound },
    { id: "needs_qualification", label: "Needs Qualification", count: needsAttention.needsQualification },
    { id: "escalated_review", label: "Escalated Review", count: needsAttention.escalatedReview },
    { id: "unassigned_hot", label: "Unassigned Priority", count: needsAttention.unassignedHot },
    { id: "slow_or_missing", label: "Slow/Missing Response", count: needsAttention.slowOrMissing },
  ];
  const speedLabel = inboxMetrics.estimatedSpeedSampleCount > 0 ? "First Response (est)" : "First Response";

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
          <Badge variant="outline" className="text-[10px] gap-1">
            <Radio className="h-2.5 w-2.5 text-green-400 animate-pulse" />
            Live
          </Badge>
          <Badge variant="outline" className="text-[10px] gap-1">
            <Shield className="h-2.5 w-2.5" />
            Role: {currentUser.role}
          </Badge>
          <CoachToggle />
        </div>
      }
    >
      <div className="space-y-4">
        {/* Inbox health strip */}
        <div className="flex flex-wrap items-center gap-2">
          <InboxStat label="New Today" value={inboxMetrics.newToday} />
          <InboxStat label="Awaiting First Contact" value={inboxMetrics.uncontacted} tone={inboxMetrics.uncontacted > 0 ? "warn" : "neutral"} />
          <InboxStat label="Due Today" value={inboxMetrics.dueToday} tone={inboxMetrics.dueToday > 0 ? "warn" : "neutral"} />
          <InboxStat label="Overdue" value={inboxMetrics.overdue} tone={inboxMetrics.overdue > 0 ? "danger" : "neutral"} />
          <InboxStat
            label={speedLabel}
            value={
              inboxMetrics.medianSpeedToLeadMinutes != null
                ? `${inboxMetrics.medianSpeedToLeadMinutes}m`
                : "n/a"
            }
            tone={
              inboxMetrics.medianSpeedToLeadMinutes == null
                ? "neutral"
                : inboxMetrics.medianSpeedToLeadMinutes <= 5
                  ? "neutral"
                  : inboxMetrics.medianSpeedToLeadMinutes <= 15
                    ? "warn"
                    : "danger"
            }
            hint={
              inboxMetrics.speedSampleCount > 0
                ? `${inboxMetrics.within15mCount}/${inboxMetrics.speedSampleCount} within 15m${inboxMetrics.estimatedSpeedSampleCount > 0 ? ` (${inboxMetrics.estimatedSpeedSampleCount} estimated)` : ""}`
                : "No contact attempts logged yet"
            }
          />
        </div>

        {/* Needs attention quick focus */}
        <div className="rounded-[12px] border border-glass-border bg-glass/40 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs font-semibold text-foreground">
              Needs Attention
            </div>

            {attentionItems.map((item) => {
              const active = attentionFocus === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setAttentionFocus(active ? "none" : item.id)}
                  className={cn(
                    "text-[11px] px-2.5 py-1 rounded-md border transition-all",
                    active
                      ? "border-cyan/25 bg-cyan/10 text-cyan"
                      : item.count > 0
                        ? "border-red-500/20 text-red-300 hover:border-red-400/35"
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
          <p className="mt-2 text-[10px] text-muted-foreground/70">
            Work order: Needs Follow-Up, New Today, Needs Qualification, Escalated Review, then Unassigned Priority.
          </p>
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

        <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
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

        {/* Lead table */}
        <LeadTable
          leads={leads}
          sortField={sortField}
          sortDir={sortDir}
          onSort={toggleSort}
          onSelect={setSelectedId}
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

