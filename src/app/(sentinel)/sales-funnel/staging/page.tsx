"use client";

import { useState, useMemo, Fragment } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock, Search, Loader2, ArrowUpDown, AlertTriangle,
  RefreshCw, ExternalLink, CheckCircle2, XCircle,
} from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";
import { useLeadsByStatus } from "@/hooks/use-leads-by-status";
import { MasterClientFileModal, clientFileFromRaw } from "@/components/sentinel/master-client-file-modal";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import type { ProspectRow } from "@/hooks/use-prospects";

const DISTRESS_LABELS: Record<string, string> = {
  probate: "Probate", pre_foreclosure: "Pre-Foreclosure", tax_lien: "Tax Lien",
  code_violation: "Code Violation", vacant: "Vacant", divorce: "Divorce",
  bankruptcy: "Bankruptcy", fsbo: "FSBO", absentee: "Absentee", inherited: "Inherited",
  water_shutoff: "Water Shut-off", condemned: "Condemned",
  tired_landlord: "Tired Landlord", underwater: "Underwater",
};

const DISTRESS_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  probate: { text: "text-foreground", bg: "bg-muted/10", border: "border-border/25" },
  pre_foreclosure: { text: "text-foreground", bg: "bg-muted/10", border: "border-border/25" },
  tax_lien: { text: "text-foreground", bg: "bg-muted/10", border: "border-border/25" },
  code_violation: { text: "text-foreground", bg: "bg-muted/10", border: "border-border/25" },
  water_shutoff: { text: "text-foreground", bg: "bg-muted/10", border: "border-border/25" },
  condemned: { text: "text-foreground", bg: "bg-muted/10", border: "border-border/25" },
  vacant: { text: "text-foreground", bg: "bg-muted/10", border: "border-border/25" },
  divorce: { text: "text-foreground", bg: "bg-muted/10", border: "border-border/25" },
  bankruptcy: { text: "text-foreground", bg: "bg-muted/10", border: "border-border/25" },
  inherited: { text: "text-foreground", bg: "bg-muted/10", border: "border-border/25" },
  absentee: { text: "text-primary-400", bg: "bg-primary-500/10", border: "border-primary-500/25" },
  fsbo: { text: "text-foreground", bg: "bg-muted/10", border: "border-border/25" },
  tired_landlord: { text: "text-foreground", bg: "bg-muted/10", border: "border-border/25" },
  underwater: { text: "text-foreground", bg: "bg-muted/10", border: "border-border/25" },
};

function SignalPill({ signal }: { signal: string }) {
  const label = DISTRESS_LABELS[signal];
  if (!label) return null;
  const colors = DISTRESS_COLORS[signal] ?? { text: "text-muted-foreground", bg: "bg-overlay-4", border: "border-overlay-8" };
  return (
    <span className={cn("text-xs px-1.5 py-0.5 rounded border font-medium whitespace-nowrap", colors.text, colors.bg, colors.border)}>
      {label}
    </span>
  );
}

function daysInStaging(dateStr: string | null): number {
  if (!dateStr) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(dateStr).getTime()) / 86400000));
}

function enrichmentBadge(flags: Record<string, unknown>): { label: string; color: string; bgColor: string; borderColor: string } {
  const status = flags.enrichment_status as string | undefined;
  if (status === "enriched") return { label: "Scored", color: "text-foreground", bgColor: "bg-muted/10", borderColor: "border-border/25" };
  if (status === "pending") return { label: "Enriching...", color: "text-foreground", bgColor: "bg-muted/10", borderColor: "border-border/25" };
  if (status === "failed") return { label: "Stuck", color: "text-foreground", bgColor: "bg-muted/10", borderColor: "border-border/25" };
  return { label: "Queued", color: "text-foreground", bgColor: "bg-muted/10", borderColor: "border-border/25" };
}

export default function StagingPage() {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<"updated_at" | "owner_name" | "address">("updated_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const { rows: rawRows, loading, error, totalCount, refetch } = useLeadsByStatus("staging", { search, sortField, sortDir });
  const [selectedRow, setSelectedRow] = useState<ProspectRow | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const rows = useMemo(() => {
    if (sortField !== "updated_at") return rawRows;
    return [...rawRows].sort((a, b) => {
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      return sortDir === "asc" ? aTime - bTime : bTime - aTime;
    });
  }, [rawRows, sortField, sortDir]);

  const stats = useMemo(() => {
    const total = rows.length;
    const enriched = rows.filter((r) => (r.owner_flags?.enrichment_status as string) === "enriched").length;
    const stuck = rows.filter((r) => Number(r.owner_flags?.enrichment_attempts ?? 0) >= 3).length;
    return { total, enriched, stuck };
  }, [rows]);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortField(field); setSortDir(field === "updated_at" ? "asc" : "desc"); }
  };

  const handleStatusChange = async (row: ProspectRow, newStatus: "prospect" | "dead", e: React.MouseEvent) => {
    e.stopPropagation();
    setActionLoading(row.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Not logged in"); return; }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: current } = await (supabase.from("leads") as any)
        .select("lock_version")
        .eq("id", row.id)
        .single();

      const res = await fetch("/api/prospects", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-lock-version": String(current?.lock_version ?? 0),
        },
        body: JSON.stringify({
          lead_id: row.id,
          status: newStatus,
          actor_id: user.id,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.detail ?? data.error ?? `Failed to ${newStatus === "prospect" ? "promote" : "delete"}`);
        return;
      }

      toast.success(newStatus === "prospect" ? `${row.owner_name} promoted to Prospects` : `${row.owner_name} moved to Dead`);
      refetch();
    } catch {
      toast.error("Network error");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <Fragment>
      <PageShell
        title="Staging Queue"
        description="Properties being enriched and crawled before promotion to Prospects"
        actions={
          <Button size="sm" variant="outline" onClick={() => refetch()} className="gap-2">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-4 mb-6 sm:grid-cols-3">
          <GlassCard glow>
            <div className="flex items-center gap-3 p-4">
              <Clock className="h-5 w-5 text-primary" />
              <div>
                <div className="text-2xl font-bold tabular-nums">{stats.total}</div>
                <div className="text-xs text-muted-foreground">In Staging</div>
              </div>
            </div>
          </GlassCard>
          <GlassCard glow>
            <div className="flex items-center gap-3 p-4">
              <CheckCircle2 className="h-5 w-5 text-foreground" />
              <div>
                <div className="text-2xl font-bold tabular-nums text-foreground">{stats.enriched}</div>
                <div className="text-xs text-muted-foreground">Enriched</div>
              </div>
            </div>
          </GlassCard>
          <GlassCard glow>
            <div className="flex items-center gap-3 p-4">
              <AlertTriangle className="h-5 w-5 text-foreground" />
              <div>
                <div className="text-2xl font-bold tabular-nums text-foreground">{stats.stuck}</div>
                <div className="text-xs text-muted-foreground">Stuck</div>
              </div>
            </div>
          </GlassCard>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
            <input
              type="text"
              placeholder="Search address, owner, APN..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-[10px] text-sm bg-overlay-4 border border-overlay-8 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/30 focus:ring-1 focus:ring-ring/20 transition-all"
            />
          </div>
          <Badge variant="outline" className="text-xs">FIFO Queue</Badge>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {totalCount} propert{totalCount !== 1 ? "ies" : "y"}
          </div>
        </div>

        <GlassCard hover={false}>
          {error && (
            <div className="p-6 text-center text-foreground text-sm flex items-center justify-center gap-2">
              <AlertTriangle className="h-4 w-4" />{error}
              <Button size="sm" variant="outline" onClick={() => refetch()} className="ml-2 text-xs">Retry</Button>
            </div>
          )}

          {loading && !error && rows.length === 0 && (
            <div className="p-12 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />Loading staging queue...</div>
          )}

          {!loading && !error && rows.length === 0 && (
            <div className="p-12 text-center text-muted-foreground">No properties in staging queue</div>
          )}

          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-overlay-6 text-sm text-muted-foreground uppercase tracking-wider">
                    <th className="text-left px-4 py-3 cursor-pointer hover:text-foreground transition-colors" onClick={() => toggleSort("address")}>
                      Property {sortField === "address" && (sortDir === "desc" ? "↓" : "↑")}
                    </th>
                    <th className="text-center px-3 py-3">Status</th>
                    <th className="text-center px-3 py-3">Signals</th>
                    <th className="text-center px-3 py-3 cursor-pointer hover:text-foreground transition-colors" onClick={() => toggleSort("updated_at")}>
                      Days In Queue {sortField === "updated_at" && (sortDir === "desc" ? "↓" : "↑")}
                    </th>
                    <th className="text-right px-3 py-3">Est. Value</th>
                    <th className="text-right px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence mode="popLayout">
                    {rows.map((row, i) => {
                      const validSignals = (row.tags ?? []).filter((t) => DISTRESS_LABELS[t]);
                      const badge = enrichmentBadge(row.owner_flags ?? {});
                      const days = daysInStaging(row.created_at);
                      const isLoading = actionLoading === row.id;

                      return (
                        <motion.tr
                          key={row.id}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          transition={{ delay: i * 0.03 }}
                          className="border-b border-overlay-4 hover:bg-overlay-4 cursor-pointer transition-colors"
                          onClick={() => setSelectedRow(row)}
                        >
                          <td className="px-4 py-3 max-w-[260px]">
                            <div className="text-sm font-semibold truncate">{row.address || "No address"}</div>
                            <div className="text-xs text-muted-foreground truncate">{row.owner_name}</div>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className={cn("text-sm px-2 py-0.5 rounded border font-semibold", badge.color, badge.bgColor, badge.borderColor)}>
                              {badge.label}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            {validSignals.length > 0 ? (
                              <div className="flex flex-wrap justify-center gap-1 max-w-[120px] mx-auto">
                                {validSignals.slice(0, 2).map((s) => <SignalPill key={s} signal={s} />)}
                                {validSignals.length > 2 && <span className="text-xs text-muted-foreground/50 self-center">+{validSignals.length - 2}</span>}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground/40">0</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className={cn("text-xs tabular-nums", days >= 7 ? "text-foreground" : days >= 3 ? "text-foreground" : "text-muted-foreground")}>
                              {days}d
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {row.estimated_value ? formatCurrency(row.estimated_value) : "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 gap-1 text-sm text-foreground border-border/20 hover:border-border/40 hover:bg-muted/[0.06]"
                                onClick={(e) => handleStatusChange(row, "prospect", e)}
                                disabled={isLoading}
                              >
                                {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                                Promote
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 gap-1 text-sm text-foreground border-border/20 hover:border-border/40 hover:bg-muted/[0.06]"
                                onClick={(e) => handleStatusChange(row, "dead", e)}
                                disabled={isLoading}
                              >
                                <XCircle className="h-3 w-3" />
                                Delete
                              </Button>
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
