"use client";

import { useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  UserPlus, Search, Filter, ArrowUpDown, ArrowUp, ArrowDown,
  Phone, MoreHorizontal, Radar, Loader2, AlertCircle,
  RefreshCw, Shield, UserCheck,
} from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { AIScoreBadge } from "@/components/sentinel/ai-score-badge";
import { MasterClientFileModal, clientFileFromProspect } from "@/components/sentinel/master-client-file-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useProspects, type ProspectRow, type SortField, type SortDir } from "@/hooks/use-prospects";
import { supabase } from "@/lib/supabase";
import { useSentinelStore } from "@/lib/store";
import { useModal } from "@/providers/modal-provider";
import type { AIScore } from "@/lib/types";
import { toast } from "sonner";

// ── Constants ─────────────────────────────────────────────────────────

const DISTRESS_LABELS: Record<string, string> = {
  probate: "Probate", pre_foreclosure: "Pre-Foreclosure", tax_lien: "Tax Lien",
  code_violation: "Code Violation", vacant: "Vacant", divorce: "Divorce",
  bankruptcy: "Bankruptcy", fsbo: "FSBO", absentee: "Absentee", inherited: "Inherited",
};

const SOURCE_FILTERS = [
  { value: "", label: "All Sources" },
  { value: "propertyradar", label: "PropertyRadar" },
  { value: "ranger_push", label: "Ranger" },
  { value: "manual", label: "Manual" },
];

// ── Subcomponents ─────────────────────────────────────────────────────

function SourceBadge({ source }: { source: string }) {
  if (source === "ranger_push") {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border font-semibold text-purple-400 bg-purple-500/10 border-purple-500/20">
        <Radar className="h-2.5 w-2.5" />
        RANGER
      </span>
    );
  }
  if (source === "propertyradar") {
    return (
      <span className="text-[9px] px-1.5 py-0.5 rounded border font-semibold text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
        PROPRADAR
      </span>
    );
  }
  if (source.includes("scraper") || source.includes("api")) {
    return (
      <span className="text-[9px] px-1.5 py-0.5 rounded border text-cyan-400 bg-cyan-500/10 border-cyan-500/20">
        SCRAPER
      </span>
    );
  }
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded border text-muted-foreground border-glass-border">
      MANUAL
    </span>
  );
}

function formatDistress(signals: string[]): string {
  if (signals.length === 0) return "—";
  return signals.slice(0, 3).map((s) => DISTRESS_LABELS[s] ?? s).join(" + ")
    + (signals.length > 3 ? ` +${signals.length - 3}` : "");
}

function buildAIScore(p: ProspectRow): AIScore {
  return {
    composite: p.composite_score,
    motivation: p.motivation_score,
    equityVelocity: Math.round((p.equity_percent ?? 50) * 0.8),
    urgency: Math.min(p.composite_score + 5, 100),
    historicalConversion: Math.round(p.deal_score * 0.9),
    aiBoost: p.ai_boost,
    label: p.score_label,
  };
}

// ── Page ──────────────────────────────────────────────────────────────

export default function ProspectsPage() {
  const { currentUser } = useSentinelStore();
  const { openModal } = useModal();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("composite_score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [sourceFilter, setSourceFilter] = useState("");
  const [selectedProspect, setSelectedProspect] = useState<ProspectRow | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [testingPR, setTestingPR] = useState(false);

  const handleQuickTestPR = async () => {
    setTestingPR(true);
    const testAddr = "1234 Wilshire Blvd, Los Angeles, CA";
    toast.loading("Looking up property on PropertyRadar...", { id: "pr-test" });

    try {
      const res = await fetch("/api/ingest/propertyradar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: testAddr }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        toast.error(data.error ?? "PropertyRadar lookup failed", {
          id: "pr-test",
          description: data.detail ?? data.message ?? `HTTP ${res.status}`,
          duration: 6000,
        });
        return;
      }

      toast.success(`${data.owner ?? "Property"} ingested — Score ${data.heatScore}`, {
        id: "pr-test",
        description: `${data.address} • ${data.signals?.length ?? 0} signal(s) • ${data.label?.toUpperCase()}`,
        duration: 5000,
      });
    } catch (err) {
      toast.error("Network error — is the dev server running?", {
        id: "pr-test",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setTestingPR(false);
    }
  };

  // Debounce search input
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (debounceTimer) clearTimeout(debounceTimer);
    const timer = setTimeout(() => setDebouncedSearch(value), 300);
    setDebounceTimer(timer);
  }, [debounceTimer]);

  const { prospects, loading, error, totalCount, refetch } = useProspects({
    search: debouncedSearch,
    sortField,
    sortDir,
    sourceFilter: sourceFilter || undefined,
  });

  const rangerCount = prospects.filter((p) => p.source === "ranger_push").length;
  const prCount = prospects.filter((p) => p.source === "propertyradar").length;

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const SortIcon = sortDir === "desc" ? ArrowDown : ArrowUp;

  const openDetail = (p: ProspectRow) => {
    setSelectedProspect(p);
    setModalOpen(true);
  };

  const handleClaim = async (leadId: string) => {
    const userId = "c0b4d733-607b-4c3c-8049-9e4ba207a258";

    console.log(`[Prospects] CLAIM ATTEMPT for lead ${leadId} by user ${userId}`);

    setClaiming(leadId);
    try {
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: claimError } = await (supabase.from("leads") as any)
        .update({
          status: "My Leads",
          owner_id: userId,
          claimed_at: new Date().toISOString(),
          claim_expires_at: expires,
        })
        .eq("id", leadId)
        .select()
        .single();

      if (claimError) {
        console.error("[Prospects] CLAIM FAILED — FULL RAW ERROR OBJECT:", claimError);
        console.error("Error Code:", claimError.code);
        console.error("Error Message:", claimError.message);
        console.error("Error Details:", claimError.details);
        console.error("Error Hint:", claimError.hint);
        alert(`Claim failed: ${claimError.message || "Check console for full details"}`);
      } else {
        console.log("[Prospects] CLAIM SUCCESS — lead now owned by Adam", data);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("audit_log") as any).insert({
          lead_id: leadId,
          action: "CLAIMED",
          user_id: userId,
          details: "Claimed from Prospects modal (24h soft lock)",
        });

        setModalOpen(false);
        if (typeof refetch === "function") refetch();
      }
    } finally {
      setClaiming(null);
    }
  };

  return (
    <PageShell
      title="Prospects"
      description="Live property prospects scored by AI — new leads appear in real-time"
      actions={
        <div className="flex items-center gap-2">
          {rangerCount > 0 && (
            <Badge variant="neon" className="text-[10px] gap-1">
              <Radar className="h-2.5 w-2.5" />
              {rangerCount} Ranger
            </Badge>
          )}
          {prCount > 0 && (
            <Badge variant="outline" className="text-[10px] gap-1 text-emerald-400 border-emerald-500/30">
              {prCount} PropRadar
            </Badge>
          )}
          <Button size="sm" variant="outline" className="gap-2 text-xs" onClick={refetch}>
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button size="sm" className="gap-2 text-xs" onClick={() => openModal("new-prospect")}>
            <UserPlus className="h-3 w-3" />
            Add Prospect
          </Button>
          <Button
            size="sm"
            onClick={handleQuickTestPR}
            disabled={testingPR}
            className="gap-2 text-xs bg-white text-black font-bold rounded-2xl hover:scale-105 transition-all disabled:opacity-50"
          >
            {testingPR ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Radar className="h-3 w-3" />
            )}
            Quick Test PropertyRadar
          </Button>
        </div>
      }
    >
      <GlassCard hover={false}>
        {/* Search + Filters */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, APN, address..."
              className="pl-9"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>

          {/* Source filter */}
          <div className="flex items-center gap-1">
            <Filter className="h-3 w-3 text-muted-foreground" />
            {SOURCE_FILTERS.map((sf) => (
              <button
                key={sf.value}
                onClick={() => setSourceFilter(sf.value)}
                className={cn(
                  "text-[10px] px-2 py-1 rounded border transition-all",
                  sourceFilter === sf.value
                    ? "text-cyan border-cyan/20 bg-cyan/8"
                    : "text-muted-foreground border-glass-border hover:text-foreground hover:border-white/10"
                )}
              >
                {sf.label}
              </button>
            ))}
          </div>

          {/* Sort controls */}
          <div className="flex items-center gap-1 ml-auto">
            <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
            {(["composite_score", "promoted_at", "owner_name"] as SortField[]).map((field) => (
              <button
                key={field}
                onClick={() => toggleSort(field)}
                className={cn(
                  "text-[10px] px-2 py-1 rounded border transition-all inline-flex items-center gap-1",
                  sortField === field
                    ? "text-cyan border-cyan/20 bg-cyan/8"
                    : "text-muted-foreground border-glass-border hover:text-foreground"
                )}
              >
                {field === "composite_score" ? "Score" : field === "promoted_at" ? "Date" : "Name"}
                {sortField === field && <SortIcon className="h-2.5 w-2.5" />}
              </button>
            ))}
          </div>

          <Badge variant="outline" className="text-[10px] shrink-0">
            {totalCount} prospects
          </Badge>
        </div>

        {/* Error state */}
        {error && (
          <div className="p-4 mb-4 rounded-[12px] border border-red-500/20 bg-red-500/5 space-y-2">
            <div className="flex items-center gap-3 text-red-400 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="flex-1">{error}</span>
              <Button size="sm" variant="outline" className="text-xs" onClick={refetch}>
                Retry
              </Button>
            </div>
            <p className="text-[10px] text-red-400/60 font-mono">
              Query: leads.select(&apos;*, properties(*)&apos;).eq(&apos;status&apos;, &apos;prospect&apos;) — Check browser console for full error
            </p>
          </div>
        )}

        {/* Loading state */}
        {loading && prospects.length === 0 && (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-3">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading prospects from Supabase...</span>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && prospects.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
            <UserPlus className="h-8 w-8 opacity-30" />
            <p className="text-sm">No prospects found</p>
            <p className="text-xs">Ingest a property from PropertyRadar or push from Ranger to get started.</p>
          </div>
        )}

        {/* Table */}
        {prospects.length > 0 && (
          <div className="overflow-hidden rounded-[12px] border border-glass-border">
            <table className="w-full">
              <thead>
                <tr className="border-b border-glass-border bg-secondary/20">
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Property / Owner</th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">APN</th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Source</th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Type</th>
                  <th className="text-right p-3 text-xs font-medium text-muted-foreground">ARV</th>
                  <th className="text-right p-3 text-xs font-medium text-muted-foreground">Equity %</th>
                  <th
                    className="text-left p-3 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => toggleSort("composite_score")}
                  >
                    <span className="inline-flex items-center gap-1">
                      AI Score
                      {sortField === "composite_score" && <SortIcon className="h-2.5 w-2.5 text-cyan" />}
                    </span>
                  </th>
                  <th className="text-right p-3 text-xs font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence mode="popLayout">
                  {prospects.map((p, i) => (
                    <motion.tr
                      key={p.id}
                      layout
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ delay: Math.min(i * 0.02, 0.5) }}
                      onClick={() => openDetail(p)}
                      className={cn(
                        "border-b border-glass-border hover:bg-secondary/10 transition-colors cursor-pointer",
                        p.source === "ranger_push" && "bg-purple-500/[0.02] hover:bg-purple-500/[0.05]",
                        p.source === "propertyradar" && "bg-emerald-500/[0.02] hover:bg-emerald-500/[0.05]"
                      )}
                    >
                      <td className="p-3">
                        <p
                          className="text-sm font-semibold text-foreground"
                          style={{
                            textShadow: "0 0 8px rgba(0,212,255,0.15), 0 0 16px rgba(0,212,255,0.06)",
                            WebkitFontSmoothing: "antialiased",
                          }}
                        >
                          {p.address}{p.city ? `, ${p.city}` : ""} {p.state} {p.zip}
                        </p>
                        <p
                          className="text-xs font-medium text-muted-foreground/90"
                          style={{ WebkitFontSmoothing: "antialiased" }}
                        >
                          {p.owner_name}
                        </p>
                      </td>
                      <td className="p-3 text-sm font-mono text-muted-foreground">{p.apn}</td>
                      <td className="p-3">
                        <SourceBadge source={p.source} />
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className="text-[10px] max-w-[180px] truncate">
                          {formatDistress(p.tags)}
                        </Badge>
                      </td>
                      <td className="p-3 text-right">
                        {p.estimated_value ? (
                          <span className="text-sm font-semibold text-foreground" style={{ WebkitFontSmoothing: "antialiased" }}>
                            ${p.estimated_value.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {p.equity_percent != null ? (
                          <span className={cn(
                            "text-sm font-semibold",
                            p.equity_percent >= 60 ? "text-neon" : p.equity_percent >= 30 ? "text-yellow-400" : "text-muted-foreground"
                          )} style={{ WebkitFontSmoothing: "antialiased" }}>
                            {Math.round(p.equity_percent)}%
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="p-3">
                        <AIScoreBadge score={buildAIScore(p)} size="sm" />
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          {p.owner_phone && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Call">
                              <Phone className="h-3 w-3" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Claim"
                            disabled={claiming === p.id}
                            onClick={() => handleClaim(p.id)}
                          >
                            {claiming === p.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <UserCheck className="h-3 w-3" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Skip Trace"
                          >
                            <Shield className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="More">
                            <MoreHorizontal className="h-3 w-3" />
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

        {/* Loading overlay for refetch */}
        {loading && prospects.length > 0 && (
          <div className="flex items-center justify-center py-3 text-muted-foreground gap-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span className="text-[10px]">Refreshing...</span>
          </div>
        )}
      </GlassCard>

      {/* Detail modal */}
      <MasterClientFileModal
        clientFile={selectedProspect ? clientFileFromProspect(selectedProspect) : null}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onClaim={handleClaim}
        onRefresh={refetch}
      />

      {/* TODO: Compliance gating — DNC/litigant check before enabling Call button */}
      {/* TODO: RBAC — only admin/agent can claim, viewers read-only */}
      {/* TODO: Pagination for 200k+ properties (virtual scroll or server-side) */}
      {/* TODO: Bulk actions — select multiple, claim all, export */}
    </PageShell>
  );
}
