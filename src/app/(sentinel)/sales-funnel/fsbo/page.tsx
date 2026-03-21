"use client";

import { useState, useMemo, useEffect, Fragment } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home, Search, Loader2, Phone, ExternalLink, ArrowUpDown,
  AlertTriangle, Globe, TrendingUp, Trash2, UserPlus,
} from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { AIScoreBadge } from "@/components/sentinel/ai-score-badge";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";
import { useFsboLeads } from "@/hooks/use-fsbo-leads";
import { MasterClientFileModal, clientFileFromRaw } from "@/components/sentinel/master-client-file-modal";
import type { ProspectRow } from "@/hooks/use-prospects";
import { deleteLeadCustomerFile } from "@/lib/lead-write-helpers";
import { supabase } from "@/lib/supabase";
import { getAuthenticatedProspectPatchHeaders } from "@/lib/prospect-api-client";
import { toast } from "sonner";

// ── Constants ─────────────────────────────────────────────────────────

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

const SOURCE_BADGES: Record<string, { label: string; text: string; bg: string; border: string }> = {
  craigslist: { label: "CL", text: "text-foreground", bg: "bg-muted/10", border: "border-border/25" },
  facebook: { label: "FB", text: "text-foreground", bg: "bg-muted/10", border: "border-border/25" },
  fb: { label: "FB", text: "text-foreground", bg: "bg-muted/10", border: "border-border/25" },
  fb_craigslist: { label: "FB/CL", text: "text-foreground", bg: "bg-muted/10", border: "border-border/25" },
  fsbo: { label: "FSBO", text: "text-foreground", bg: "bg-muted/10", border: "border-border/25" },
  zillow_fsbo: { label: "Zillow", text: "text-foreground", bg: "bg-muted/10", border: "border-border/25" },
  fsbo_com: { label: "FSBO.com", text: "text-foreground", bg: "bg-muted/10", border: "border-border/25" },
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

function SourceBadge({ source }: { source: string }) {
  const badge = SOURCE_BADGES[source] ?? { label: source, text: "text-muted-foreground", bg: "bg-white/[0.04]", border: "border-white/[0.08]" };
  return (
    <span className={cn("text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase whitespace-nowrap", badge.text, badge.bg, badge.border)}>
      {badge.label}
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

function getListingUrl(row: ProspectRow): string | null {
  const flags = row.owner_flags ?? {};
  return (flags.listing_url as string) ?? (flags.link as string) ?? null;
}

function getAskingPrice(row: ProspectRow): number | null {
  const flags = row.owner_flags ?? {};
  const price = (flags.price as number) ?? null;
  return price;
}

// ── Page ──────────────────────────────────────────────────────────────

export default function FsboPage() {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<"composite_score" | "updated_at" | "owner_name" | "address">("composite_score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const { rows, loading, error, totalCount, refetch } = useFsboLeads({ search, sortField, sortDir });
  const [selectedRow, setSelectedRow] = useState<ProspectRow | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [promoting, setPromoting] = useState<string | null>(null);

  const handlePromote = async (row: ProspectRow, e: React.MouseEvent) => {
    e.stopPropagation();
    setPromoting(row.id);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: current, error: fetchErr } = await (supabase.from("leads") as any)
        .select("lock_version")
        .eq("id", row.id)
        .single();

      if (fetchErr || !current) {
        toast.error("Could not fetch lead. Refresh and try again.");
        return;
      }

      const headers = await getAuthenticatedProspectPatchHeaders(current.lock_version ?? 0);
      const res = await fetch("/api/prospects", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          lead_id: row.id,
          status: "prospect",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(`Promote failed: ${data.detail ?? data.error ?? "Unknown error"}`);
      } else {
        toast.success(`${row.owner_name} promoted to Prospect`, { description: row.address || "No address" });
        refetch();
      }
    } catch {
      toast.error("Network error — could not promote");
    } finally {
      setPromoting(null);
    }
  };

  // Sync selectedRow with latest data after refetch (e.g. after Contact tab saves)
  useEffect(() => {
    if (selectedRow) {
      const updated = rows.find((r) => r.id === selectedRow.id);
      if (updated && updated !== selectedRow) setSelectedRow(updated);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const handleDelete = async (row: ProspectRow, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete "${row.owner_name}" at ${row.address}?\n\nThis will remove the FSBO lead.`)) return;
    setDeleting(row.id);
    try {
      const result = await deleteLeadCustomerFile(row.id);
      if (!result.ok) {
        toast.error(`Delete failed: ${result.error}`);
        return;
      }

      toast.success(`Deleted: ${row.owner_name}`);
      refetch();
    } finally {
      setDeleting(null);
    }
  };

  const stats = useMemo(() => {
    const total = rows.length;
    const clCount = rows.filter((r) => r.source === "craigslist").length;
    const avgScore = total > 0 ? Math.round(rows.reduce((s, r) => s + r.composite_score, 0) / total) : 0;
    return { total, clCount, avgScore };
  }, [rows]);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortField(field); setSortDir("desc"); }
  };

  return (
    <Fragment>
      <PageShell
        title="FSBO"
        description="For Sale By Owner — crawled from Craigslist and other sources"
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
              <Home className="h-5 w-5 text-primary" />
              <div>
                <div className="text-2xl font-bold tabular-nums">{stats.total}</div>
                <div className="text-xs text-muted-foreground">Total FSBO Leads</div>
              </div>
            </div>
          </GlassCard>
          <GlassCard glow>
            <div className="flex items-center gap-3 p-4">
              <Globe className="h-5 w-5 text-foreground" />
              <div>
                <div className="text-2xl font-bold tabular-nums">{stats.clCount}</div>
                <div className="text-xs text-muted-foreground">From Craigslist</div>
              </div>
            </div>
          </GlassCard>
          <GlassCard glow>
            <div className="flex items-center gap-3 p-4">
              <TrendingUp className="h-5 w-5 text-foreground" />
              <div>
                <div className="text-2xl font-bold tabular-nums">{stats.avgScore}</div>
                <div className="text-xs text-muted-foreground">Avg AI Score</div>
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
              className="w-full pl-9 pr-3 py-2 rounded-[10px] text-sm bg-white/[0.04] border border-white/[0.08] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/30 focus:ring-1 focus:ring-ring/20 transition-all"
            />
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {totalCount} FSBO lead{totalCount !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Table */}
        <GlassCard hover={false}>
          {error && (
            <div className="p-6 text-center text-foreground text-sm flex items-center justify-center gap-2">
              <AlertTriangle className="h-4 w-4" />{error}
              <Button size="sm" variant="outline" onClick={() => refetch()} className="ml-2 text-xs">Retry</Button>
            </div>
          )}

          {loading && !error && rows.length === 0 && (
            <div className="p-12 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />Loading FSBO leads...</div>
          )}

          {!loading && !error && rows.length === 0 && (
            <div className="p-12 text-center text-muted-foreground">
              <Home className="h-8 w-8 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-sm font-medium mb-1">No FSBO leads yet</p>
              <p className="text-xs text-muted-foreground/60">The Craigslist crawler runs every 2 hours. FSBO listings will appear here automatically.</p>
            </div>
          )}

          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[11px] text-muted-foreground uppercase tracking-wider">
                    <th className="text-left px-4 py-3 cursor-pointer hover:text-foreground transition-colors" onClick={() => toggleSort("address")}>
                      Property {sortField === "address" && (sortDir === "desc" ? "↓" : "↑")}
                    </th>
                    <th className="text-center px-3 py-3">Source</th>
                    <th className="text-center px-3 py-3 cursor-pointer hover:text-foreground transition-colors" onClick={() => toggleSort("composite_score")}>
                      Score {sortField === "composite_score" && (sortDir === "desc" ? "↓" : "↑")}
                    </th>
                    <th className="text-right px-3 py-3">Asking Price</th>
                    <th className="text-left px-3 py-3">Distress</th>
                    <th className="text-center px-3 py-3 cursor-pointer hover:text-foreground transition-colors" onClick={() => toggleSort("updated_at")}>
                      Posted {sortField === "updated_at" && (sortDir === "desc" ? "↓" : "↑")}
                    </th>
                    <th className="text-right px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence mode="popLayout">
                    {rows.map((row, i) => {
                      const validSignals = (row.tags ?? []).filter((t) => DISTRESS_LABELS[t]);
                      const listingUrl = getListingUrl(row);
                      const askingPrice = getAskingPrice(row);

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
                            <div className="text-xs text-muted-foreground truncate">{row.owner_name} · {row.city || row.county}</div>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <SourceBadge source={row.source} />
                          </td>
                          <td className="px-3 py-3 text-center">
                            <AIScoreBadge score={{ composite: row.composite_score, motivation: row.motivation_score, equityVelocity: 0, urgency: 0, historicalConversion: 0, aiBoost: row.ai_boost, label: row.score_label }} size="sm" />
                          </td>
                          <td className="px-3 py-3 text-right">
                            <div className="text-sm font-medium tabular-nums">
                              {askingPrice ? formatCurrency(askingPrice) : row.estimated_value ? formatCurrency(row.estimated_value) : "—"}
                            </div>
                            {askingPrice && row.estimated_value ? (
                              <div className={cn("text-xs tabular-nums", row.estimated_value > askingPrice ? "text-foreground" : "text-muted-foreground")}>
                                {row.estimated_value > askingPrice ? "Below AVM" : "At/Above AVM"}
                              </div>
                            ) : null}
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
                            <span className="text-xs text-muted-foreground">{timeAgo(row.created_at)}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 gap-1 text-[10px] text-foreground border-border/20 hover:border-border/40 hover:bg-muted/[0.06]"
                                onClick={(e) => handlePromote(row, e)}
                                disabled={promoting === row.id}
                                title="Promote to Prospect"
                              >
                                {promoting === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
                                Promote
                              </Button>
                              {listingUrl && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 gap-1 text-[10px] text-primary border-primary/20 hover:border-primary/40 hover:bg-primary/[0.06]"
                                  onClick={(e) => { e.stopPropagation(); window.open(listingUrl, "_blank"); }}
                                >
                                  <Globe className="h-3 w-3" />
                                  Listing
                                </Button>
                              )}
                              {row.owner_phone && (
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Copy phone number" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(row.owner_phone!); toast.success("Phone number copied to clipboard"); }}>
                                  <Phone className="h-3.5 w-3.5 text-foreground" />
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); setSelectedRow(row); }}>
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-foreground/60 hover:text-foreground hover:bg-muted/10"
                                onClick={(e) => handleDelete(row, e)}
                                disabled={deleting === row.id}
                                title="Delete"
                              >
                                {deleting === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
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
