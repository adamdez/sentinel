"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { MapPin, Check, ChevronRight, Clock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { PageShell } from "@/components/sentinel/page-shell";
import { formatSellerName } from "@/lib/display-helpers";
import { formatDueDateLabel } from "@/lib/due-date-label";
import { MasterClientFileModal, clientFileFromRaw } from "@/components/sentinel/master-client-file-modal";
import { cn } from "@/lib/utils";

const DRIVE_BY_SELECT = [
  "id",
  "property_id",
  "status",
  "property:properties!inner(full_address, city, state, zip, county, owner_name, owner_phone, owner_email, mailing_address)",
  "next_action",
  "next_action_due_at",
  "next_call_scheduled_at",
  "next_follow_up_at",
  "last_contact_at",
  "total_calls",
  "pinned",
  "assigned_to",
  "notes",
  "created_at",
].join(", ");

type DriveByLead = {
  id: string;
  status: string;
  address: string;
  city: string | null;
  ownerName: string | null;
  nextActionDueAt: string | null;
  lastContactAt: string | null;
  totalCalls: number;
  notes: string | null;
  pinned: boolean;
  raw: Record<string, unknown>;
};

type ViewFilter = "all" | "overdue" | "today" | "upcoming";

export default function DriveByPage() {
  const [leads, setLeads] = useState<DriveByLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");

  const fetchDriveByLeads = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from("leads") as any)
      .select(DRIVE_BY_SELECT)
      .ilike("next_action", "drive by%")
      .not("status", "in", '("dead","closed")')
      .order("next_action_due_at", { ascending: true, nullsFirst: false });

    if (error) {
      console.error("[DriveBy] fetch failed:", error);
      return;
    }

    const mapped: DriveByLead[] = (data ?? []).map((row: Record<string, unknown>) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prop = row.property as any;
      return {
        id: row.id as string,
        status: (row.status as string) ?? "unknown",
        address: prop?.full_address ?? "Unknown",
        city: prop?.city ?? null,
        ownerName: formatSellerName(prop?.owner_name) ?? prop?.owner_name ?? null,
        nextActionDueAt: (row.next_action_due_at as string) ?? null,
        lastContactAt: (row.last_contact_at as string) ?? null,
        totalCalls: (row.total_calls as number) ?? 0,
        notes: (row.notes as string) ?? null,
        pinned: row.pinned === true,
        raw: row,
      };
    });

    setLeads(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDriveByLeads();
  }, [fetchDriveByLeads]);

  const handleComplete = useCallback(async (leadId: string) => {
    setCompletingId(leadId);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("leads") as any)
        .update({ next_action: null, next_action_due_at: null })
        .eq("id", leadId);
      if (error) {
        toast.error("Failed to clear drive by");
        return;
      }
      toast.success("Drive by completed");
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
    } finally {
      setCompletingId(null);
    }
  }, []);

  const now = useMemo(() => new Date(), []);

  const filtered = useMemo(() => {
    if (viewFilter === "all") return leads;
    return leads.filter((l) => {
      if (!l.nextActionDueAt) return false;
      const due = new Date(l.nextActionDueAt);
      const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const diffDays = Math.round((dueStart.getTime() - todayStart.getTime()) / 86400000);
      if (viewFilter === "overdue") return diffDays < 0;
      if (viewFilter === "today") return diffDays === 0;
      if (viewFilter === "upcoming") return diffDays > 0;
      return true;
    });
  }, [leads, viewFilter, now]);

  const counts = useMemo(() => {
    let overdue = 0, today = 0, upcoming = 0;
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    for (const l of leads) {
      if (!l.nextActionDueAt) continue;
      const due = new Date(l.nextActionDueAt);
      const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());
      const diffDays = Math.round((dueStart.getTime() - todayStart.getTime()) / 86400000);
      if (diffDays < 0) overdue++;
      else if (diffDays === 0) today++;
      else upcoming++;
    }
    return { all: leads.length, overdue, today, upcoming };
  }, [leads, now]);

  const selectedLead = useMemo(() => {
    if (!selectedId) return null;
    return leads.find((l) => l.id === selectedId) ?? null;
  }, [leads, selectedId]);

  const selectedClientFile = useMemo(() => {
    if (!selectedLead) return null;
    const r = selectedLead.raw;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prop = (r.property as any) ?? {};
    return clientFileFromRaw(r, prop);
  }, [selectedLead]);

  const filterTabs: { id: ViewFilter; label: string; count: number }[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "overdue", label: "Overdue", count: counts.overdue },
    { id: "today", label: "Today", count: counts.today },
    { id: "upcoming", label: "Upcoming", count: counts.upcoming },
  ];

  return (
    <PageShell title="Drive By" description="Properties to visit in person">
      {/* Filter tabs */}
      <div className="flex gap-1.5 mb-4">
        {filterTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setViewFilter(tab.id)}
            className={cn(
              "px-3 py-1.5 text-xs rounded-md border transition-colors font-medium",
              viewFilter === tab.id
                ? tab.id === "overdue"
                  ? "bg-red-500/15 text-red-400 border-red-500/30"
                  : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                : "bg-overlay-3 text-muted-foreground border-overlay-8 hover:bg-overlay-6",
            )}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1.5 text-[10px] opacity-70">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="text-sm text-muted-foreground py-12 text-center">Loading drive-by leads...</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground py-12 text-center">
          {viewFilter === "all" ? "No leads in drive-by queue" : `No ${viewFilter} drive-by leads`}
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map((lead) => {
            const due = lead.nextActionDueAt ? formatDueDateLabel(lead.nextActionDueAt, now) : null;
            const isOverdue = due?.overdue ?? false;

            return (
              <div
                key={lead.id}
                className="group flex items-center gap-3 px-3 py-2.5 rounded-lg border border-overlay-8 bg-overlay-3 hover:bg-overlay-6 transition-colors cursor-pointer"
                onClick={() => setSelectedId(lead.id)}
              >
                {/* Urgency indicator */}
                <div className="shrink-0">
                  {isOverdue ? (
                    <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                  ) : due?.urgent ? (
                    <Clock className="h-3.5 w-3.5 text-amber-400" />
                  ) : (
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground/50" />
                  )}
                </div>

                {/* Address + owner */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">
                      {lead.address}
                    </span>
                    {lead.city && (
                      <span className="text-[10px] text-muted-foreground/60 shrink-0">{lead.city}</span>
                    )}
                  </div>
                  {lead.ownerName && (
                    <span className="text-xs text-muted-foreground/70">{lead.ownerName}</span>
                  )}
                </div>

                {/* Due label */}
                <div className="shrink-0 text-right">
                  {due ? (
                    <span
                      className={cn(
                        "text-xs font-medium",
                        isOverdue ? "text-red-400" : due.urgent ? "text-amber-400" : "text-muted-foreground",
                      )}
                    >
                      {due.text}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground/40">No date</span>
                  )}
                </div>

                {/* Complete action */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleComplete(lead.id);
                  }}
                  disabled={completingId === lead.id}
                  className="shrink-0 p-1.5 rounded-md border border-overlay-8 bg-overlay-3 hover:bg-emerald-500/15 hover:border-emerald-500/30 hover:text-emerald-400 transition-colors text-muted-foreground/50 disabled:opacity-40"
                  title="Mark drive by complete"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>

                {/* Chevron */}
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground/60 shrink-0" />
              </div>
            );
          })}
        </div>
      )}

      {/* Detail modal */}
      <MasterClientFileModal
        clientFile={selectedClientFile}
        open={selectedId !== null}
        onClose={() => setSelectedId(null)}
        onRefresh={fetchDriveByLeads}
      />
    </PageShell>
  );
}
