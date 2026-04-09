"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { IntakeLeadsTable } from "@/components/sentinel/intake-leads-table";
import { IntakeClaimModal } from "@/components/sentinel/intake-claim-modal";
import { IntakeEditModal } from "@/components/sentinel/intake-edit-modal";
import { IntakeFiltersBar } from "@/components/sentinel/intake-filters-bar";
import { IntakeMetricsStrip } from "@/components/sentinel/intake-metrics-strip";

interface IntakeLead {
  id: string;
  owner_name: string | null;
  owner_phone: string | null;
  owner_email: string | null;
  property_address: string | null;
  property_city: string | null;
  property_state: string | null;
  property_zip: string | null;
  county: string | null;
  apn: string | null;
  source_channel: string;
  source_vendor: string | null;
  source_category: string | null;
  status: "pending_review" | "claimed" | "rejected" | "duplicate";
  received_at: string;
  duplicate_of_lead_id: string | null;
  duplicate_confidence: number | null;
  review_notes: string | null;
}

interface QueueMetrics {
  total_pending: number;
  claimed_today: number;
  rejected_count: number;
  duplicate_count: number;
}

export default function IntakePage() {
  const [leads, setLeads] = useState<IntakeLead[]>([]);
  const [metrics, setMetrics] = useState<QueueMetrics>({
    total_pending: 0,
    claimed_today: 0,
    rejected_count: 0,
    duplicate_count: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<string>("pending_review");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({
    from: "",
    to: "",
  });

  // Modal state
  const [selectedLead, setSelectedLead] = useState<IntakeLead | null>(null);
  const [editingLead, setEditingLead] = useState<IntakeLead | null>(null);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [deletingLeadId, setDeletingLeadId] = useState<string | null>(null);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);

  // Fetch leads
  const fetchLeads = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();

      if (statusFilter) params.append("status", statusFilter);
      if (sourceFilter) params.append("source_category", sourceFilter);
      if (dateRange.from) params.append("from", dateRange.from);
      if (dateRange.to) params.append("to", dateRange.to);

      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(`/api/intake/queue?${params.toString()}`, { headers });
      if (!response.ok) throw new Error("Failed to fetch intake leads");

      const data = await response.json();
      setLeads(data.leads || []);
      setMetrics(data.metrics || {
        total_pending: 0,
        claimed_today: 0,
        rejected_count: 0,
        duplicate_count: 0,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      console.error("[IntakePage] Fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Initial load + refetch on filter changes
  useEffect(() => {
    fetchLeads();
  }, [statusFilter, sourceFilter, dateRange]);

  useEffect(() => {
    const channel = supabase
      .channel("intake_queue_live")
      .on("postgres_changes", { event: "*", schema: "public", table: "intake_leads" }, () => {
        void fetchLeads();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [statusFilter, sourceFilter, dateRange]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setOpenLeadId(params.get("open"));
  }, []);

  useEffect(() => {
    if (!openLeadId || editingLead || showClaimModal || leads.length === 0) return;
    const matchedLead = leads.find((lead) => lead.id === openLeadId);
    if (matchedLead) {
      setEditingLead(matchedLead);
    }
  }, [editingLead, leads, openLeadId, showClaimModal]);

  // Refetch after claim modal closes
  const handleClaimSuccess = () => {
    setShowClaimModal(false);
    setSelectedLead(null);
    fetchLeads(); // Refresh the list
  };

  const openClaimModal = (lead: IntakeLead) => {
    setSelectedLead(lead);
    setShowClaimModal(true);
  };

  const openEditModal = (lead: IntakeLead) => {
    setEditingLead(lead);
  };

  const closeClaimModal = () => {
    setShowClaimModal(false);
    setSelectedLead(null);
  };

  const closeEditModal = () => {
    setEditingLead(null);
  };

  const handleEditSuccess = () => {
    setEditingLead(null);
    fetchLeads();
  };

  const handleDelete = async (lead: IntakeLead) => {
    const label = lead.owner_name || lead.property_address || "this intake lead";
    if (!window.confirm(`Delete ${label} from the PPL intake queue?`)) {
      return;
    }

    try {
      setDeletingLeadId(lead.id);
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }

      const response = await fetch("/api/intake/queue", {
        method: "DELETE",
        headers,
        body: JSON.stringify({ intake_lead_id: lead.id }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to delete intake lead");
      }

      await fetchLeads();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      console.error("[IntakePage] Delete error:", err);
    } finally {
      setDeletingLeadId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-bold text-foreground">Lead Intake Queue</h1>
          <p className="text-muted-foreground mt-2">
            Website and lead house arrivals land here immediately, ready to claim into Sentinel
          </p>
        </div>

        {/* Metrics Strip */}
        <IntakeMetricsStrip metrics={metrics} />

        {/* Filters Bar */}
        <IntakeFiltersBar
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          sourceFilter={sourceFilter}
          onSourceChange={setSourceFilter}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
        />

        {/* Error State */}
        {error && (
          <div className="bg-destructive/10 text-destructive p-4 rounded-lg border border-destructive/20">
            <p className="font-medium">Error loading intake queue</p>
            <p className="text-sm mt-1">{error}</p>
            <button
              onClick={fetchLeads}
              className="text-sm mt-3 px-3 py-1 bg-destructive text-white rounded hover:bg-destructive/90"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground">Loading intake queue...</div>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && leads.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 bg-muted/50 rounded-lg border border-border">
            <p className="text-muted-foreground font-medium">No pending leads</p>
            <p className="text-sm text-muted-foreground mt-2">
              {statusFilter === "pending_review"
                ? "Your intake queue is empty. New PPL leads will appear here ready to claim."
                : "No leads match your filters."}
            </p>
          </div>
        )}

        {/* Leads Table */}
        {!loading && leads.length > 0 && (
          <IntakeLeadsTable
            leads={leads}
            onClaim={openClaimModal}
            onEdit={openEditModal}
            onDelete={handleDelete}
            isLoading={loading || deletingLeadId !== null}
          />
        )}
      </div>

      {/* Claim Modal */}
      {showClaimModal && selectedLead && (
        <IntakeClaimModal
          lead={selectedLead}
          onClose={closeClaimModal}
          onSuccess={handleClaimSuccess}
        />
      )}

      {editingLead && (
        <IntakeEditModal
          lead={editingLead}
          onClose={closeEditModal}
          onSuccess={handleEditSuccess}
        />
      )}
    </div>
  );
}
