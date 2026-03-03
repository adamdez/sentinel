"use client";

import { useState, useMemo, Fragment } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileCheck, DollarSign, Clock, Search, Loader2, Phone,
  ExternalLink, ArrowUpDown, AlertTriangle, Users,
} from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { AIScoreBadge } from "@/components/sentinel/ai-score-badge";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";
import { useLeadsByStatus } from "@/hooks/use-leads-by-status";
import { MasterClientFileModal, clientFileFromRaw } from "@/components/sentinel/master-client-file-modal";
import type { ProspectRow } from "@/hooks/use-prospects";

function daysAgo(dateStr: string | null): number {
  if (!dateStr) return 0;
  return Math.max(Math.round((Date.now() - new Date(dateStr).getTime()) / 86400000), 0);
}

export default function DispositionPage() {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<"composite_score" | "updated_at" | "owner_name" | "address">("composite_score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const { rows, loading, error, totalCount, refetch } = useLeadsByStatus("disposition", { search, sortField, sortDir });
  const [selectedRow, setSelectedRow] = useState<ProspectRow | null>(null);

  const stats = useMemo(() => {
    const active = rows.length;
    const totalValue = rows.reduce((s, r) => s + (r.estimated_value ?? 0), 0);
    const avgDays = active > 0 ? Math.round(rows.reduce((s, r) => s + daysAgo(r.created_at), 0) / active) : 0;
    return { active, totalValue, avgDays };
  }, [rows]);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortField(field); setSortDir("desc"); }
  };

  return (
    <Fragment>
      <PageShell
        title="Disposition"
        description="Assign contracts to end buyers"
        actions={
          <Button size="sm" variant="outline" onClick={() => refetch()} className="gap-2">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpDown className="h-3.5 w-3.5" />}
            Refresh
          </Button>
        }
      >
        {/* Summary stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <GlassCard glow>
            <div className="flex items-center gap-3 p-4">
              <FileCheck className="h-5 w-5 text-cyan" />
              <div>
                <div className="text-2xl font-bold tabular-nums">{stats.active}</div>
                <div className="text-xs text-muted-foreground">Active Dispositions</div>
              </div>
            </div>
          </GlassCard>
          <GlassCard glow>
            <div className="flex items-center gap-3 p-4">
              <DollarSign className="h-5 w-5 text-emerald-400" />
              <div>
                <div className="text-2xl font-bold tabular-nums">{formatCurrency(stats.totalValue)}</div>
                <div className="text-xs text-muted-foreground">Total Value</div>
              </div>
            </div>
          </GlassCard>
          <GlassCard glow>
            <div className="flex items-center gap-3 p-4">
              <Clock className="h-5 w-5 text-amber-400" />
              <div>
                <div className="text-2xl font-bold tabular-nums">{stats.avgDays}d</div>
                <div className="text-xs text-muted-foreground">Avg Days in Stage</div>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Search */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
            <input
              type="text"
              placeholder="Search address, owner..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-[10px] text-sm bg-white/[0.04] border border-white/[0.08] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-cyan/30 focus:ring-1 focus:ring-cyan/20 transition-all"
            />
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {totalCount} disposition{totalCount !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Table */}
        <GlassCard>
          {error && (
            <div className="p-6 text-center text-red-400 text-sm flex items-center justify-center gap-2">
              <AlertTriangle className="h-4 w-4" />{error}
              <Button size="sm" variant="outline" onClick={() => refetch()} className="ml-2 text-xs">Retry</Button>
            </div>
          )}

          {loading && !error && rows.length === 0 && (
            <div className="p-12 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />Loading dispositions...</div>
          )}

          {!loading && !error && rows.length === 0 && (
            <div className="p-12 text-center text-muted-foreground">No active dispositions</div>
          )}

          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[11px] text-muted-foreground uppercase tracking-wider">
                    <th className="text-left px-4 py-3 cursor-pointer hover:text-foreground transition-colors" onClick={() => toggleSort("address")}>
                      Property {sortField === "address" && (sortDir === "desc" ? "↓" : "↑")}
                    </th>
                    <th className="text-right px-3 py-3">Value</th>
                    <th className="text-center px-3 py-3 cursor-pointer hover:text-foreground transition-colors" onClick={() => toggleSort("composite_score")}>
                      Score {sortField === "composite_score" && (sortDir === "desc" ? "↓" : "↑")}
                    </th>
                    <th className="text-right px-3 py-3">Equity</th>
                    <th className="text-center px-3 py-3 cursor-pointer hover:text-foreground transition-colors" onClick={() => toggleSort("updated_at")}>
                      Stage Time {sortField === "updated_at" && (sortDir === "desc" ? "↓" : "↑")}
                    </th>
                    <th className="text-right px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence mode="popLayout">
                    {rows.map((row, i) => {
                      const days = daysAgo(row.created_at);
                      const equityColor = (row.equity_percent ?? 0) >= 60 ? "text-cyan" : (row.equity_percent ?? 0) >= 30 ? "text-yellow-400" : "text-muted-foreground";
                      const stageColor = days > 14 ? "text-red-400" : days > 7 ? "text-amber-400" : "text-emerald-400";

                      return (
                        <motion.tr
                          key={row.id}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          transition={{ delay: i * 0.03 }}
                          className="border-b border-white/[0.04] hover:bg-white/[0.04] cursor-pointer transition-colors"
                          onClick={() => setSelectedRow(row)}
                        >
                          <td className="px-4 py-3 max-w-[280px]">
                            <div className="text-sm font-semibold truncate">{row.address || "No address"}</div>
                            <div className="text-xs text-muted-foreground truncate">{row.owner_name}</div>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <div className="text-sm font-medium tabular-nums">{row.estimated_value ? formatCurrency(row.estimated_value) : "—"}</div>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <AIScoreBadge score={{ composite: row.composite_score, motivation: row.motivation_score, equityVelocity: 0, urgency: 0, historicalConversion: 0, aiBoost: row.ai_boost, label: row.score_label }} size="sm" />
                          </td>
                          <td className="px-3 py-3 text-right">
                            <span className={cn("text-sm tabular-nums", equityColor)}>
                              {row.equity_percent != null ? `${Math.round(row.equity_percent)}%` : "—"}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className={cn("text-sm font-semibold tabular-nums", stageColor)}>{days}d</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {row.owner_phone && (
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); window.open(`tel:${row.owner_phone}`); }}>
                                  <Phone className="h-3.5 w-3.5 text-emerald-400" />
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); setSelectedRow(row); }}>
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })}
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
            { id: selectedRow.id, property_id: selectedRow.property_id, status: selectedRow.status, priority: selectedRow.composite_score, source: selectedRow.source, tags: selectedRow.tags, notes: selectedRow.notes, promoted_at: selectedRow.promoted_at, assigned_to: selectedRow.assigned_to, created_at: selectedRow.created_at },
            { apn: selectedRow.apn, county: selectedRow.county, address: selectedRow.address, city: selectedRow.city, state: selectedRow.state, zip: selectedRow.zip, owner_name: selectedRow.owner_name, owner_phone: selectedRow.owner_phone, owner_email: selectedRow.owner_email, estimated_value: selectedRow.estimated_value, equity_percent: selectedRow.equity_percent, property_type: selectedRow.property_type, bedrooms: selectedRow.bedrooms, bathrooms: selectedRow.bathrooms, sqft: selectedRow.sqft, year_built: selectedRow.year_built, lot_size: selectedRow.lot_size, owner_flags: selectedRow.owner_flags },
          )}
          open={!!selectedRow}
          onClose={() => setSelectedRow(null)}
          onRefresh={() => refetch()}
        />
      )}
    </Fragment>
  );
}
