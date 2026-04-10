"use client";

import { Fragment, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, ArrowUpDown, CircleCheckBig, DollarSign, ExternalLink, Loader2, Search } from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { useLeadsByStatus } from "@/hooks/use-leads-by-status";
import { compareRowText, compareRowTime, sortRowsWithComparator } from "@/hooks/use-leads-sort";
import { MasterClientFileModal, clientFileFromRaw } from "@/components/sentinel/master-client-file-modal";
import type { ProspectRow } from "@/hooks/use-prospects";

type ClosedSortField = "updated_at" | "owner_name" | "address";
type SortDir = "asc" | "desc";

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  const diffDays = Math.floor((Date.now() - ms) / 86400000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "1d ago";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.round(diffDays / 7)}w ago`;
  return `${Math.round(diffDays / 30)}mo ago`;
}

export default function ClosedPage() {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<ClosedSortField>("updated_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const { rows: rawRows, loading, error, totalCount, refetch } = useLeadsByStatus("closed", { search });
  const [selectedRow, setSelectedRow] = useState<ProspectRow | null>(null);

  const rows = useMemo(() => {
    return sortRowsWithComparator(rawRows, (a, b) => {
      switch (sortField) {
        case "owner_name":
          return (
            compareRowText(a, b, (row) => row.owner_name, sortDir) ||
            compareRowText(a, b, (row) => row.address, sortDir) ||
            compareRowTime(a, b, (row) => row.updated_at ?? row.created_at, sortDir) ||
            compareRowText(a, b, (row) => row.id, sortDir)
          );
        case "address":
          return (
            compareRowText(a, b, (row) => row.address, sortDir) ||
            compareRowText(a, b, (row) => row.owner_name, sortDir) ||
            compareRowTime(a, b, (row) => row.updated_at ?? row.created_at, sortDir) ||
            compareRowText(a, b, (row) => row.id, sortDir)
          );
        case "updated_at":
        default:
          return (
            compareRowTime(a, b, (row) => row.updated_at ?? row.created_at, sortDir) ||
            compareRowText(a, b, (row) => row.owner_name, sortDir) ||
            compareRowText(a, b, (row) => row.address, sortDir) ||
            compareRowText(a, b, (row) => row.id, sortDir)
          );
      }
    });
  }, [rawRows, sortDir, sortField]);

  const stats = useMemo(() => {
    const totalValue = rows.reduce((sum, row) => sum + (row.estimated_value ?? 0), 0);
    return { total: rows.length, totalValue };
  }, [rows]);

  const toggleSort = (field: ClosedSortField) => {
    if (sortField === field) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(field);
    setSortDir("asc");
  };

  return (
    <Fragment>
      <PageShell
        title="Closed"
        description="Closed files and completed outcomes."
        actions={<Button size="sm" variant="outline" onClick={() => refetch()} className="gap-2">{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpDown className="h-3.5 w-3.5" />}Refresh</Button>}
      >
        <div className="grid grid-cols-1 gap-4 mb-6 sm:grid-cols-2">
          <GlassCard glow><div className="flex items-center gap-3 p-4"><CircleCheckBig className="h-5 w-5 text-primary" /><div><div className="text-2xl font-bold tabular-nums">{stats.total}</div><div className="text-xs text-muted-foreground">Closed Files</div></div></div></GlassCard>
          <GlassCard glow><div className="flex items-center gap-3 p-4"><DollarSign className="h-5 w-5 text-foreground" /><div><div className="text-2xl font-bold tabular-nums">{formatCurrency(stats.totalValue)}</div><div className="text-xs text-muted-foreground">Estimated Value</div></div></div></GlassCard>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
            <input type="text" placeholder="Search address or owner..." value={search} onChange={(event) => setSearch(event.target.value)} className="w-full pl-9 pr-3 py-2 rounded-[10px] text-sm bg-overlay-4 border border-overlay-8 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/30 focus:ring-1 focus:ring-ring/20 transition-all" />
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">{totalCount} closed file{totalCount !== 1 ? "s" : ""}</div>
        </div>

        <GlassCard hover={false}>
          {error && <div className="p-6 text-center text-foreground text-sm flex items-center justify-center gap-2"><AlertTriangle className="h-4 w-4" />{error}<Button size="sm" variant="outline" onClick={() => refetch()} className="ml-2 text-xs">Retry</Button></div>}
          {loading && !error && rows.length === 0 && <div className="p-12 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />Loading closed files...</div>}
          {!loading && !error && rows.length === 0 && <div className="p-12 text-center text-muted-foreground">No closed files yet</div>}

          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-overlay-6 text-sm text-muted-foreground uppercase tracking-wider">
                    <th className="text-left px-4 py-3 cursor-pointer hover:text-foreground transition-colors" onClick={() => toggleSort("owner_name")}>Owner / Property {sortField === "owner_name" && (sortDir === "desc" ? "↓" : "↑")}</th>
                    <th className="text-right px-3 py-3">Value</th>
                    <th className="text-center px-3 py-3 cursor-pointer hover:text-foreground transition-colors" onClick={() => toggleSort("updated_at")}>Closed {sortField === "updated_at" && (sortDir === "desc" ? "↓" : "↑")}</th>
                    <th className="text-right px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence mode="popLayout">
                    {rows.map((row, index) => (
                      <motion.tr key={row.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ delay: index * 0.02 }} className="border-b border-overlay-4 hover:bg-overlay-4 cursor-pointer transition-colors" onClick={() => setSelectedRow(row)}>
                        <td className="px-4 py-3 max-w-[320px]"><div className="text-sm font-semibold truncate">{row.owner_name || "Unknown owner"}</div><div className="text-xs text-muted-foreground truncate">{row.address || "No address"}</div></td>
                        <td className="px-3 py-3 text-right"><div className="text-sm font-medium tabular-nums">{row.estimated_value ? formatCurrency(row.estimated_value) : "—"}</div></td>
                        <td className="px-3 py-3 text-center"><span className="text-xs text-muted-foreground">{timeAgo(row.updated_at ?? row.created_at)}</span></td>
                        <td className="px-4 py-3 text-right"><Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={(event) => { event.stopPropagation(); setSelectedRow(row); }}><ExternalLink className="h-3.5 w-3.5" /></Button></td>
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
