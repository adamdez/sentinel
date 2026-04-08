"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, ArrowUpDown, Briefcase, Clock, ExternalLink, Loader2, Search, UserRoundCheck } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Button } from "@/components/ui/button";
import { useLeadsByStatus } from "@/hooks/use-leads-by-status";
import { MasterClientFileModal, clientFileFromRaw } from "@/components/sentinel/master-client-file-modal";
import { supabase } from "@/lib/supabase";
import { getAuthenticatedProspectPatchHeaders } from "@/lib/prospect-api-client";
import type { ProspectRow } from "@/hooks/use-prospects";

type ActiveSortField = "owner_name" | "address" | "source" | "assigned_to" | "next_action" | "next_action_due_at" | "last_contact_at";
type SortDir = "asc" | "desc";

function labelOrDash(value: string | null | undefined): string {
  return value && value.trim().length > 0 ? value : "—";
}

function dueValue(row: ProspectRow): number {
  const iso = row.next_action_due_at ?? row.next_call_scheduled_at ?? row.next_follow_up_at;
  if (!iso) return Number.POSITIVE_INFINITY;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

function touchValue(row: ProspectRow): number {
  if (!row.last_contact_at) return Number.NEGATIVE_INFINITY;
  const ms = new Date(row.last_contact_at).getTime();
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
}

function dueLabel(row: ProspectRow): string {
  const value = dueValue(row);
  if (!Number.isFinite(value)) return "No due date";
  const diffDays = Math.floor((value - Date.now()) / 86400000);
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "Due tomorrow";
  return `Due in ${diffDays}d`;
}

function lastTouchLabel(iso: string | null | undefined): string {
  if (!iso) return "No touch";
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return "No touch";
  const diffDays = Math.floor((Date.now() - ms) / 86400000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "1d ago";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.round(diffDays / 7)}w ago`;
  return `${Math.round(diffDays / 30)}mo ago`;
}

export default function ActivePage() {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<ActiveSortField>("next_action_due_at");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const { rows: rawRows, loading, error, totalCount, refetch } = useLeadsByStatus("active", { search });
  const [selectedRow, setSelectedRow] = useState<ProspectRow | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [assignedNames, setAssignedNames] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase.from("user_profiles") as any)
          .select("id, full_name")
          .in("role", ["admin", "agent"])
          .order("full_name");
        if (cancelled || !data) return;
        const next: Record<string, string> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const row of data as any[]) next[row.id] = row.full_name ?? "Assigned";
        setAssignedNames(next);
      } catch {
        if (!cancelled) setAssignedNames({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rawRows].sort((a, b) => {
      switch (sortField) {
        case "owner_name":
          return a.owner_name.localeCompare(b.owner_name) * dir;
        case "address":
          return a.address.localeCompare(b.address) * dir;
        case "source":
          return a.source.localeCompare(b.source) * dir;
        case "assigned_to":
          return labelOrDash(assignedNames[a.assigned_to ?? ""]).localeCompare(labelOrDash(assignedNames[b.assigned_to ?? ""])) * dir;
        case "next_action":
          return labelOrDash(a.next_action).localeCompare(labelOrDash(b.next_action)) * dir;
        case "last_contact_at":
          return (touchValue(a) - touchValue(b)) * dir;
        case "next_action_due_at":
        default:
          return (dueValue(a) - dueValue(b)) * dir;
      }
    });
  }, [assignedNames, rawRows, sortDir, sortField]);

  const stats = useMemo(() => {
    const overdue = rows.filter((row) => dueValue(row) < Date.now()).length;
    const unassigned = rows.filter((row) => !row.assigned_to).length;
    return { active: rows.length, overdue, unassigned };
  }, [rows]);

  const toggleSort = (field: ActiveSortField) => {
    if (sortField === field) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(field);
    setSortDir("asc");
  };

  const handleMoveToNegotiation = async (row: ProspectRow, event: React.MouseEvent) => {
    event.stopPropagation();
    setMovingId(row.id);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: current, error: fetchErr } = await (supabase.from("leads") as any)
        .select("lock_version, next_action, next_action_due_at, next_call_scheduled_at, next_follow_up_at, follow_up_date")
        .eq("id", row.id)
        .single();
      if (fetchErr || !current) {
        toast.error("Could not load lead. Refresh and try again.");
        return;
      }

      const headers = await getAuthenticatedProspectPatchHeaders(current.lock_version ?? 0);
      const res = await fetch("/api/prospects", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          lead_id: row.id,
          status: "negotiation",
          next_action: typeof current.next_action === "string" && current.next_action.trim() ? current.next_action.trim() : "Prepare negotiation follow-up",
          next_action_due_at: current.next_action_due_at ?? current.next_call_scheduled_at ?? current.next_follow_up_at ?? current.follow_up_date ?? null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.detail ?? data.error ?? "Could not move to Negotiation");
        return;
      }
      toast.success(`${row.owner_name} moved to Negotiation`);
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not move to Negotiation");
    } finally {
      setMovingId(null);
    }
  };

  return (
    <Fragment>
      <PageShell
        title="Active"
        description="Active seller files being worked right now."
        actions={
          <Button size="sm" variant="outline" onClick={() => refetch()} className="gap-2">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpDown className="h-3.5 w-3.5" />}
            Refresh
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-4 mb-6 sm:grid-cols-3">
          <GlassCard glow><div className="flex items-center gap-3 p-4"><Briefcase className="h-5 w-5 text-primary" /><div><div className="text-2xl font-bold tabular-nums">{stats.active}</div><div className="text-xs text-muted-foreground">Active Files</div></div></div></GlassCard>
          <GlassCard glow><div className="flex items-center gap-3 p-4"><Clock className="h-5 w-5 text-foreground" /><div><div className="text-2xl font-bold tabular-nums">{stats.overdue}</div><div className="text-xs text-muted-foreground">Overdue Tasks</div></div></div></GlassCard>
          <GlassCard glow><div className="flex items-center gap-3 p-4"><UserRoundCheck className="h-5 w-5 text-foreground" /><div><div className="text-2xl font-bold tabular-nums">{stats.unassigned}</div><div className="text-xs text-muted-foreground">Unassigned</div></div></div></GlassCard>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
            <input
              type="text"
              placeholder="Search address or owner..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-[10px] text-sm bg-overlay-4 border border-overlay-8 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/30 focus:ring-1 focus:ring-ring/20 transition-all"
            />
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">{totalCount} active file{totalCount !== 1 ? "s" : ""}</div>
        </div>

        <GlassCard hover={false}>
          {error && <div className="p-6 text-center text-foreground text-sm flex items-center justify-center gap-2"><AlertTriangle className="h-4 w-4" />{error}<Button size="sm" variant="outline" onClick={() => refetch()} className="ml-2 text-xs">Retry</Button></div>}
          {loading && !error && rows.length === 0 && <div className="p-12 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />Loading active files...</div>}
          {!loading && !error && rows.length === 0 && <div className="p-12 text-center text-muted-foreground">No files are in Active right now</div>}

          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-overlay-6 text-sm text-muted-foreground uppercase tracking-wider">
                    <th className="text-left px-4 py-3 cursor-pointer hover:text-foreground transition-colors" onClick={() => toggleSort("owner_name")}>Owner / Property {sortField === "owner_name" && (sortDir === "desc" ? "↓" : "↑")}</th>
                    <th className="text-left px-3 py-3 cursor-pointer hover:text-foreground transition-colors" onClick={() => toggleSort("source")}>Source {sortField === "source" && (sortDir === "desc" ? "↓" : "↑")}</th>
                    <th className="text-left px-3 py-3 cursor-pointer hover:text-foreground transition-colors" onClick={() => toggleSort("next_action")}>Next Task {sortField === "next_action" && (sortDir === "desc" ? "↓" : "↑")}</th>
                    <th className="text-center px-3 py-3 cursor-pointer hover:text-foreground transition-colors" onClick={() => toggleSort("next_action_due_at")}>Due {sortField === "next_action_due_at" && (sortDir === "desc" ? "↓" : "↑")}</th>
                    <th className="text-center px-3 py-3 cursor-pointer hover:text-foreground transition-colors" onClick={() => toggleSort("last_contact_at")}>Last Touch {sortField === "last_contact_at" && (sortDir === "desc" ? "↓" : "↑")}</th>
                    <th className="text-left px-3 py-3 cursor-pointer hover:text-foreground transition-colors" onClick={() => toggleSort("assigned_to")}>Assigned {sortField === "assigned_to" && (sortDir === "desc" ? "↓" : "↑")}</th>
                    <th className="text-right px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence mode="popLayout">
                    {rows.map((row, index) => (
                      <motion.tr key={row.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ delay: index * 0.02 }} className="border-b border-overlay-4 hover:bg-overlay-4 cursor-pointer transition-colors" onClick={() => setSelectedRow(row)}>
                        <td className="px-4 py-3 max-w-[280px]"><div className="text-sm font-semibold truncate">{row.owner_name || "Unknown owner"}</div><div className="text-xs text-muted-foreground truncate">{row.address || "No address"}</div></td>
                        <td className="px-3 py-3"><div className="text-xs text-muted-foreground truncate">{labelOrDash(row.source)}</div></td>
                        <td className="px-3 py-3 max-w-[220px]"><div className="text-sm font-medium truncate">{labelOrDash(row.next_action)}</div><div className="text-xs text-muted-foreground truncate">{row.total_calls} call{row.total_calls === 1 ? "" : "s"}</div></td>
                        <td className="px-3 py-3 text-center"><span className="text-xs text-muted-foreground">{dueLabel(row)}</span></td>
                        <td className="px-3 py-3 text-center"><span className="text-xs text-muted-foreground">{lastTouchLabel(row.last_contact_at)}</span></td>
                        <td className="px-3 py-3"><span className="text-xs text-muted-foreground truncate">{row.assigned_to ? (assignedNames[row.assigned_to] ?? "Assigned") : "Unassigned"}</span></td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-sm text-foreground border-border/20 hover:border-border/40 hover:bg-muted/[0.06]" onClick={(event) => void handleMoveToNegotiation(row, event)} disabled={movingId === row.id}>
                              {movingId === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Negotiate"}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={(event) => { event.stopPropagation(); setSelectedRow(row); }}>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>
      </PageShell>

      {selectedRow && (
        <MasterClientFileModal
          clientFile={clientFileFromRaw(
            {
              id: selectedRow.id,
              property_id: selectedRow.property_id,
              status: selectedRow.status,
              priority: selectedRow.composite_score,
              source: selectedRow.source,
              source_vendor: selectedRow.source_vendor,
              source_list_name: selectedRow.source_list_name,
              tags: selectedRow.tags,
              notes: selectedRow.notes,
              promoted_at: selectedRow.promoted_at,
              assigned_to: selectedRow.assigned_to,
              created_at: selectedRow.created_at,
              updated_at: selectedRow.updated_at,
              next_action: selectedRow.next_action,
              next_action_due_at: selectedRow.next_action_due_at,
              next_call_scheduled_at: selectedRow.next_call_scheduled_at,
              next_follow_up_at: selectedRow.next_follow_up_at,
              last_contact_at: selectedRow.last_contact_at,
              total_calls: selectedRow.total_calls,
            },
            {
              apn: selectedRow.apn,
              county: selectedRow.county,
              address: selectedRow.address,
              city: selectedRow.city,
              state: selectedRow.state,
              zip: selectedRow.zip,
              owner_name: selectedRow.owner_name,
              owner_phone: selectedRow.owner_phone,
              owner_email: selectedRow.owner_email,
              estimated_value: selectedRow.estimated_value,
              equity_percent: selectedRow.equity_percent,
              property_type: selectedRow.property_type,
              bedrooms: selectedRow.bedrooms,
              bathrooms: selectedRow.bathrooms,
              sqft: selectedRow.sqft,
              year_built: selectedRow.year_built,
              lot_size: selectedRow.lot_size,
              owner_flags: selectedRow.owner_flags,
            }
          )}
          open={!!selectedRow}
          onClose={() => setSelectedRow(null)}
          onRefresh={() => refetch()}
        />
      )}
    </Fragment>
  );
}
