"use client";

import { Shield, Zap, Radio } from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { Badge } from "@/components/ui/badge";
import { LeadSegmentControl } from "@/components/sentinel/leads/lead-segment-control";
import { LeadFilters } from "@/components/sentinel/leads/lead-filters";
import { LeadTable } from "@/components/sentinel/leads/lead-table";
import { LeadDetailModal } from "@/components/sentinel/leads/lead-detail-modal";
import { useLeads } from "@/hooks/use-leads";
import { SCORING_MODEL_VERSION } from "@/lib/scoring";

export default function LeadsPage() {
  const {
    leads,
    segment,
    setSegment,
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
    totalFiltered,
    currentUser,
  } = useLeads();

  return (
    <PageShell
      title="Leads Hub"
      description="All promoted prospects — My Leads, Team, Nathan's, and Logan's pipeline"
      actions={
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] gap-1">
            <Radio className="h-2.5 w-2.5 text-green-400 animate-pulse" />
            Live
          </Badge>
          <Badge variant="outline" className="text-[10px] gap-1">
            <Shield className="h-2.5 w-2.5" />
            {currentUser.role}
          </Badge>
          <Badge variant="neon" className="text-[10px] gap-1">
            <Zap className="h-2.5 w-2.5" />
            AI {SCORING_MODEL_VERSION}
          </Badge>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Segmented control */}
        <LeadSegmentControl
          value={segment}
          onChange={setSegment}
          counts={segmentCounts}
          currentUserId={currentUser.id}
          currentUserRole={currentUser.role}
        />

        {/* Filters + search */}
        <LeadFilters
          filters={filters}
          onUpdate={updateFilter}
          onReset={resetFilters}
          totalFiltered={totalFiltered}
          totalAll={segmentCounts.all}
        />

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
      <LeadDetailModal
        lead={selectedLead}
        open={selectedId !== null}
        onOpenChange={(open) => { if (!open) setSelectedId(null); }}
        isOwner={selectedLead?.assignedTo === currentUser.id}
      />

      {/* TODO: Real-time Supabase subscription for lead updates (channel: leads_changes) */}
      {/* TODO: Optimistic locking on claim/update (lock_version check) */}
      {/* TODO: Compliance gating before dial eligibility */}
      {/* TODO: Audit log on every lead action */}
      {/* TODO: TanStack Query integration for server state */}
    </PageShell>
  );
}
