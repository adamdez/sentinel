"use client";

import { useState, useMemo, Fragment } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Heart, Clock, Search, Loader2, Phone, Mail,
  ExternalLink, ArrowUpDown, AlertTriangle, RefreshCw,
} from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { AIScoreBadge } from "@/components/sentinel/ai-score-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";
import { useLeadsByStatus } from "@/hooks/use-leads-by-status";
import { MasterClientFileModal, clientFileFromRaw } from "@/components/sentinel/master-client-file-modal";
import type { ProspectRow } from "@/hooks/use-prospects";

// ── Constants ─────────────────────────────────────────────────────────

const DISTRESS_LABELS: Record<string, string> = {
  probate: "Probate", pre_foreclosure: "Pre-Foreclosure", tax_lien: "Tax Lien",
  code_violation: "Code Violation", vacant: "Vacant", divorce: "Divorce",
  bankruptcy: "Bankruptcy", fsbo: "FSBO", absentee: "Absentee", inherited: "Inherited",
  water_shutoff: "Water Shut-off", condemned: "Condemned",
};

const DISTRESS_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  probate: { text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/25" },
  pre_foreclosure: { text: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/25" },
  tax_lien: { text: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/25" },
  code_violation: { text: "text-pink-400", bg: "bg-pink-500/10", border: "border-pink-500/25" },
  water_shutoff: { text: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/25" },
  condemned: { text: "text-rose-500", bg: "bg-rose-500/10", border: "border-rose-500/25" },
  vacant: { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/25" },
  divorce: { text: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/25" },
  bankruptcy: { text: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/25" },
  inherited: { text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/25" },
  absentee: { text: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/25" },
  fsbo: { text: "text-blue-300", bg: "bg-blue-500/10", border: "border-blue-500/25" },
};

function SignalPill({ signal }: { signal: string }) {
  const label = DISTRESS_LABELS[signal];
  if (!label) return null;
  const colors = DISTRESS_COLORS[signal] ?? { text: "text-muted-foreground", bg: "bg-white/[0.04]", border: "border-white/[0.08]" };
  return (
    <span className={cn("text-[9px] px-1.5 py-0.5 rounded border font-medium whitespace-nowrap", colors.text, colors.bg, colors.border)}>
      {label}
    </span>
  );
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "—";
  const days = Math.round((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days < 0) return "future";
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.round(days / 7)}w ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

function followUpUrgency(dateStr: string | null): { label: string; color: string; bgColor: string; borderColor: string; sortKey: number } {
  if (!dateStr) return { label: "Not set", color: "text-muted-foreground/60", bgColor: "", borderColor: "", sortKey: 99999 };
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - now.getTime()) / 86400000);

  if (diffDays < 0) {
    return { label: `${Math.abs(diffDays)}d overdue`, color: "text-red-400", bgColor: "bg-red-500/10", borderColor: "border-red-500/25", sortKey: diffDays };
  }
  if (diffDays === 0) {
    return { label: "Today", color: "text-amber-400", bgColor: "bg-amber-500/10", borderColor: "border-amber-500/25", sortKey: 0 };
  }
  if (diffDays <= 3) {
    return { label: `In ${diffDays}d`, color: "text-amber-400", bgColor: "bg-amber-500/10", borderColor: "border-amber-500/25", sortKey: diffDays };
  }
  if (diffDays <= 7) {
    return { label: `In ${diffDays}d`, color: "text-emerald-400", bgColor: "bg-emerald-500/10", borderColor: "border-emerald-500/25", sortKey: diffDays };
  }
  return { label: `In ${diffDays}d`, color: "text-muted-foreground", bgColor: "", borderColor: "", sortKey: diffDays };
}

// ── Page ──────────────────────────────────────────────────────────────

export default function NurturePage() {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<"composite_score" | "updated_at" | "owner_name" | "address">("updated_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const { rows: rawRows, loading, error, totalCount, refetch } = useLeadsByStatus("nurture", { search, sortField, sortDir });
  const [selectedRow, setSelectedRow] = useState<ProspectRow | null>(null);

  // Sort nurture by follow-up urgency (overdue first) when using default sort
  const rows = useMemo(() => {
    if (sortField !== "updated_at") return rawRows;
    return [...rawRows].sort((a, b) => {
      const aKey = followUpUrgency(a.promoted_at).sortKey;
      const bKey = followUpUrgency(b.promoted_at).sortKey;
      return sortDir === "asc" ? aKey - bKey : bKey - aKey;
    });
  }, [rawRows, sortField, sortDir]);

  const stats = useMemo(() => {
    const total = rows.length;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const overdue = rows.filter((r) => {
      if (!r.promoted_at) return false;
      const d = new Date(r.promoted_at);
      d.setHours(0, 0, 0, 0);
      return d.getTime() < now.getTime();
    }).length;
    const dueThisWeek = rows.filter((r) => {
      if (!r.promoted_at) return false;
      const d = new Date(r.promoted_at);
      d.setHours(0, 0, 0, 0);
      const diff = Math.round((d.getTime() - now.getTime()) / 86400000);
      return diff >= 0 && diff <= 7;
    }).length;
    return { total, overdue, dueThisWeek };
  }, [rows]);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortField(field); setSortDir(field === "updated_at" ? "asc" : "desc"); }
  };

  return (
    <Fragment>
      <PageShell
        title="Nurture"
        description="Long-term follow-up pipeline for future opportunities"
        actions={
          <Button size="sm" variant="outline" onClick={() => refetch()} className="gap-2">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Re-score All
          </Button>
        }
      >
        {/* Summary stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <GlassCard glow>
            <div className="flex items-center gap-3 p-4">
              <Heart className="h-5 w-5 text-cyan" />
              <div>
                <div className="text-2xl font-bold tabular-nums">{stats.total}</div>
                <div className="text-xs text-muted-foreground">In Nurture</div>
              </div>
            </div>
          </GlassCard>
          <GlassCard glow>
            <div className="flex items-center gap-3 p-4">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              <div>
                <div className="text-2xl font-bold tabular-nums text-red-400">{stats.overdue}</div>
                <div className="text-xs text-muted-foreground">Overdue</div>
              </div>
            </div>
          </GlassCard>
          <GlassCard glow>
            <div className="flex items-center gap-3 p-4">
              <Clock className="h-5 w-5 text-amber-400" />
              <div>
                <div className="text-2xl font-bold tabular-nums">{stats.dueThisWeek}</div>
                <div className="text-xs text-muted-foreground">Due This Week</div>
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
          <Badge variant="outline" className="text-xs">Auto-drip active</Badge>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {totalCount} lead{totalCount !== 1 ? "s" : ""}
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
            <div className="p-12 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />Loading nurture leads...</div>
          )}

          {!loading && !error && rows.length === 0 && (
            <div className="p-12 text-center text-muted-foreground">No leads in nurture pipeline</div>
          )}

          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[11px] text-muted-foreground uppercase tracking-wider">
                    <th className="text-left px-4 py-3 cursor-pointer hover:text-foreground transition-colors" onClick={() => toggleSort("address")}>
                      Property {sortField === "address" && (sortDir === "desc" ? "↓" : "↑")}
                    </th>
                    <th className="text-left px-3 py-3">Distress</th>
                    <th className="text-center px-3 py-3 cursor-pointer hover:text-foreground transition-colors" onClick={() => toggleSort("composite_score")}>
                      Score {sortField === "composite_score" && (sortDir === "desc" ? "↓" : "↑")}
                    </th>
                    <th className="text-left px-3 py-3">Notes</th>
                    <th className="text-center px-3 py-3">Last Contact</th>
                    <th className="text-center px-3 py-3 cursor-pointer hover:text-foreground transition-colors" onClick={() => toggleSort("updated_at")}>
                      Follow Up {sortField === "updated_at" && (sortDir === "desc" ? "↓" : "↑")}
                    </th>
                    <th className="text-right px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence mode="popLayout">
                    {rows.map((row, i) => {
                      const validSignals = (row.tags ?? []).filter((t) => DISTRESS_LABELS[t]);
                      const urgency = followUpUrgency(row.promoted_at);

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
                          <td className="px-4 py-3 max-w-[260px]">
                            <div className="text-sm font-semibold truncate">{row.address || "No address"}</div>
                            <div className="text-xs text-muted-foreground truncate">{row.owner_name}</div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-1 max-w-[160px]">
                              {validSignals.length > 0 ? (
                                <>
                                  {validSignals.slice(0, 3).map((s) => <SignalPill key={s} signal={s} />)}
                                  {validSignals.length > 3 && <span className="text-[9px] text-muted-foreground/50 self-center">+{validSignals.length - 3}</span>}
                                </>
                              ) : (
                                <span className="text-[9px] text-muted-foreground/40">No signals</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <AIScoreBadge score={{ composite: row.composite_score, motivation: row.motivation_score, equityVelocity: 0, urgency: 0, historicalConversion: 0, aiBoost: row.ai_boost, label: row.score_label }} size="sm" />
                          </td>
                          <td className="px-3 py-3 max-w-[180px]">
                            <div className="text-xs text-muted-foreground truncate">{row.notes || "—"}</div>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className="text-xs text-muted-foreground">{timeAgo(row.created_at)}</span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            {urgency.bgColor ? (
                              <span className={cn("text-[10px] px-2 py-0.5 rounded border font-semibold", urgency.color, urgency.bgColor, urgency.borderColor)}>
                                {urgency.label}
                              </span>
                            ) : (
                              <span className={cn("text-xs", urgency.color)}>{urgency.label}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {row.owner_phone && (
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); window.open(`tel:${row.owner_phone}`); }}>
                                  <Phone className="h-3.5 w-3.5 text-emerald-400" />
                                </Button>
                              )}
                              {row.owner_email && (
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" asChild onClick={(e) => e.stopPropagation()}>
                                  <a href={`mailto:${row.owner_email}`}><Mail className="h-3.5 w-3.5" /></a>
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
