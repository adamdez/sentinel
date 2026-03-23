"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  UserPlus, Search, Filter, ArrowUpDown, ArrowUp, ArrowDown,
  Phone, MoreHorizontal, Radar, Loader2, AlertCircle,
  RefreshCw, UserCheck, Home, Trash2, Eye,
  Clock, ListPlus,
  HeartOff,
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
import { getAuthenticatedProspectPatchHeaders } from "@/lib/prospect-api-client";
import { useSentinelStore } from "@/lib/store";
import { useModal } from "@/providers/modal-provider";
import type { AIScore } from "@/lib/types";
import { toast } from "sonner";
import { RelationshipBadgeCompact } from "@/components/sentinel/relationship-badge";
import { deleteLeadCustomerFile } from "@/lib/lead-write-helpers";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

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

const SOURCE_FILTERS = [
  { value: "", label: "All Sources" },
  { value: "propertyradar", label: "PropertyRadar" },
  { value: "ranger_push", label: "Ranger" },
  { value: "manual", label: "Manual" },
];

const SCORE_FILTERS: { value: string; label: string; color: string; min: number; max: number }[] = [
  { value: "", label: "All", color: "text-muted-foreground", min: 0, max: 100 },
  { value: "platinum", label: "Platinum", color: "text-primary-300", min: 85, max: 100 },
  { value: "gold", label: "Gold", color: "text-foreground", min: 65, max: 84 },
  { value: "silver", label: "Silver", color: "text-foreground", min: 40, max: 64 },
  { value: "bronze", label: "Bronze", color: "text-foreground", min: 0, max: 39 },
];

const SIGNAL_FILTERS: { value: string; label: string; color: string }[] = [
  { value: "", label: "All Signals", color: "text-muted-foreground" },
  { value: "probate", label: "Probate", color: "text-foreground" },
  { value: "inherited", label: "Inherited", color: "text-foreground" },
  { value: "tax_lien", label: "Tax Lien", color: "text-foreground" },
  { value: "pre_foreclosure", label: "Pre-Foreclosure", color: "text-foreground" },
  { value: "vacant", label: "Vacant", color: "text-foreground" },
  { value: "divorce", label: "Divorce", color: "text-foreground" },
  { value: "bankruptcy", label: "Bankruptcy", color: "text-foreground" },
];

// ── Subcomponents ─────────────────────────────────────────────────────

function SourceBadge({ source }: { source: string }) {
  if (source === "ranger_push") {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border font-semibold text-foreground bg-muted/10 border-border/20">
        <Radar className="h-2.5 w-2.5" />
        RANGER
      </span>
    );
  }
  if (source === "propertyradar") {
    return (
      <span className="text-xs px-1.5 py-0.5 rounded border font-semibold text-foreground bg-muted/10 border-border/20">
        PROPRADAR
      </span>
    );
  }
  if (source.startsWith("csv:")) {
    return (
      <span className="text-xs px-1.5 py-0.5 rounded border font-semibold text-foreground bg-muted/10 border-border/20">
        CSV
      </span>
    );
  }
  if (source.includes("scraper") || source.includes("api") || source.includes("crawler")) {
    return (
      <span className="text-xs px-1.5 py-0.5 rounded border text-primary-400 bg-primary-500/10 border-primary-500/20">
        CRAWLER
      </span>
    );
  }
  if (source.includes("attom")) {
    return (
      <span className="text-xs px-1.5 py-0.5 rounded border text-foreground bg-muted/10 border-border/20">
        ATTOM
      </span>
    );
  }
  return (
    <span className="text-xs px-1.5 py-0.5 rounded border text-muted-foreground border-overlay-6">
      MANUAL
    </span>
  );
}

/** Map ForeclosureStage from PR to short label */
function formatForeclosureStage(stage: string | null | undefined): string | null {
  if (!stage) return null;
  const s = stage.toLowerCase();
  if (s.includes("auction")) return "Auction";
  if (s.includes("notice of sale") || s.includes("nos")) return "NOS";
  if (s.includes("notice of default") || s.includes("nod")) return "NOD";
  if (s.includes("bank") || s.includes("reo")) return "REO";
  if (s.includes("lis pendens")) return "Lis Pendens";
  return stage.length > 12 ? stage.slice(0, 10) + "…" : stage;
}

/** Map stage string to short label */
function formatStage(stage: string): string {
  const labels: Record<string, string> = {
    notice_of_default: "NOD",
    notice_of_sale: "NOS",
    auction_scheduled: "Auction",
    bank_owned: "REO",
    pre_foreclosure: "Pre-FC",
    delinquent: "Delinquent",
    escalating: "Escalating",
    tax_sale_risk: "Tax Sale Risk",
    active_filing: "Active",
    estate_in_probate: "In Probate",
    active_proceedings: "Active",
    lien_active: "Active Lien",
  };
  return labels[stage] ?? stage.replace(/_/g, " ");
}

/** Derive stage label for a signal from prospect data */
function getStageLabel(signal: string, p: ProspectRow): string | null {
  if (signal === "pre_foreclosure" && p.foreclosure_stage) {
    return formatForeclosureStage(p.foreclosure_stage);
  }
  if (signal === "tax_lien") {
    const prRaw = (p.owner_flags?.pr_raw ?? {}) as Record<string, unknown>;
    const installments = prRaw.NumberDelinquentInstallments;
    if (installments && Number(installments) >= 2) return `${installments} inst.`;
  }
  // For other types, check raw_data stage from distress events if available
  const prRaw = (p.owner_flags?.pr_raw ?? {}) as Record<string, unknown>;
  if (signal === "bankruptcy" && (prRaw.inBankruptcyProperty === true || prRaw.inBankruptcyProperty === "Yes" || prRaw.inBankruptcyProperty === 1)) {
    return "Active";
  }
  if (signal === "probate" && (prRaw.isDeceasedProperty === true || prRaw.isDeceasedProperty === "Yes" || prRaw.isDeceasedProperty === 1)) {
    return "In Probate";
  }
  if (signal === "divorce" && (prRaw.inDivorce === true || prRaw.inDivorce === "Yes" || prRaw.inDivorce === 1)) {
    return "Active";
  }
  return null;
}

/** Color-coded distress signal pill with optional stage label */
function SignalPill({ signal, stageLabel }: { signal: string; stageLabel?: string | null }) {
  // Filter out non-distress tags (like "score-silver")
  const label = DISTRESS_LABELS[signal];
  if (!label) return null;
  const colors = DISTRESS_COLORS[signal] ?? { text: "text-muted-foreground", bg: "bg-overlay-4", border: "border-overlay-8" };
  const displayLabel = stageLabel ? `${label}: ${stageLabel}` : label;
  return (
    <span className={cn("text-xs px-1.5 py-0.5 rounded border font-medium whitespace-nowrap", colors.text, colors.bg, colors.border)}>
      {displayLabel}
    </span>
  );
}

/** Days-ago formatter */
function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const days = Math.round((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
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
  const [scoreFilter, setScoreFilter] = useState("");
  const [signalFilter, setSignalFilter] = useState("");
  const [selectedProspect, setSelectedProspect] = useState<ProspectRow | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [nurturing, setNurturing] = useState<string | null>(null);
  const [queueing, setQueueing] = useState<string | null>(null);
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

  // Apply score label filter + signal filter client-side
  const activeFilter = SCORE_FILTERS.find((f) => f.value === scoreFilter);
  let filteredProspects = activeFilter && activeFilter.value
    ? prospects.filter((p) => p.composite_score >= activeFilter.min && p.composite_score <= activeFilter.max)
    : prospects;

  if (signalFilter) {
    filteredProspects = filteredProspects.filter((p) => p.tags.includes(signalFilter));
  }

  // ── Staging count (lightweight poll for banner) ──────────────────
  const [stagingCount, setStagingCount] = useState(0);

  const fetchStagingCount = useCallback(async () => {
    try {
      const res = await fetch("/api/enrichment/promote");
      if (res.ok) {
        const data = await res.json();
        setStagingCount(data.total ?? 0);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchStagingCount();
    const interval = setInterval(fetchStagingCount, 60000);
    return () => clearInterval(interval);
  }, [fetchStagingCount]);

  const rangerCount = prospects.filter((p) => p.source === "ranger_push").length;
  const prCount = prospects.filter((p) => p.source === "propertyradar").length;
  const platinumCnt = prospects.filter((p) => p.composite_score >= 85).length;
  const goldCnt = prospects.filter((p) => p.composite_score >= 65 && p.composite_score < 85).length;
  const silverCnt = prospects.filter((p) => p.composite_score >= 40 && p.composite_score < 65).length;
  const bronzeCnt = prospects.filter((p) => p.composite_score < 40).length;

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
    const userId = currentUser.id;
    if (!userId) {
      toast.error("Not logged in — cannot claim");
      return;
    }

    console.log(`[Prospects] CLAIM ATTEMPT for lead ${leadId} by user ${userId}`);

    setClaiming(leadId);
    try {
      // Fetch current lock_version for optimistic locking
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: current, error: fetchErr } = await (supabase.from("leads") as any)
        .select("status, lock_version")
        .eq("id", leadId)
        .single();

      if (fetchErr || !current) {
        toast.error("Claim failed: Could not fetch lead status. Refresh and try again.");
        return;
      }

      const headers = await getAuthenticatedProspectPatchHeaders(current.lock_version ?? 0);
      const res = await fetch("/api/prospects", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          lead_id: leadId,
          status: "lead",
          assigned_to: userId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("[Prospects] CLAIM FAILED:", data);
        if (res.status === 409) {
          toast.error("Claim failed: Lead was already claimed by someone else. Refresh and try again.");
        } else {
          toast.error(`Claim failed: ${data.detail ?? data.error ?? "Unknown error"}`);
        }
      } else {
        console.log("[Prospects] CLAIM SUCCESS — lead now owned", data);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("audit_log") as any).insert({
          lead_id: leadId,
          action: "CLAIMED",
          user_id: userId,
          details: "Claimed from Prospects page (24h soft lock)",
        });

        setModalOpen(false);
        if (typeof refetch === "function") refetch();
      }
    } finally {
      setClaiming(null);
    }
  };

  const handleDelete = async (prospect: ProspectRow) => {
    if (!confirm(`Delete prospect "${prospect.owner_name}" at ${prospect.address}? This cannot be undone.`)) return;

    setDeleting(prospect.id);
    try {
      const result = await deleteLeadCustomerFile(prospect.id);
      if (!result.ok) {
        console.error("[Prospects] DELETE FAILED:", result.error);
        toast.error(`Delete failed: ${result.error}`);
        return;
      }

      toast.success(`Deleted prospect: ${prospect.owner_name}`);
      if (typeof refetch === "function") refetch();
    } catch (err) {
      toast.error("Network error — could not delete");
      console.error("[Prospects] delete error:", err);
    } finally {
      setDeleting(null);
    }
  };

  const handleNurture = async (prospect: ProspectRow) => {
    setNurturing(prospect.id);
    try {
      const { data: current, error: fetchErr } = await (supabase.from("leads") as any)
        .select("lock_version")
        .eq("id", prospect.id)
        .single();

      if (fetchErr || !current) {
        toast.error("Could not fetch lead. Refresh and try again.");
        return;
      }

      const res = await fetch("/api/prospects", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-lock-version": String(current.lock_version ?? 0),
        },
        body: JSON.stringify({
          lead_id: prospect.id,
          status: "nurture",
          actor_id: currentUser.id,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(`Move to nurture failed: ${data.detail ?? data.error ?? "Unknown error"}`);
      } else {
        toast.success(`${prospect.owner_name} moved to nurture`, {
          description: prospect.address || "No address",
        });
        if (typeof refetch === "function") refetch();
      }
    } catch (err) {
      toast.error("Network error — could not move to nurture");
    } finally {
      setNurturing(null);
    }
  };

  const handleQueueForCall = async (prospect: ProspectRow) => {
    setQueueing(prospect.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/leads/${prospect.id}/queue`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
      });
      if (res.ok) {
        toast.success("Added to call queue", { description: prospect.address || prospect.owner_name });
      } else {
        toast.error("Could not add to queue");
      }
    } catch {
      toast.error("Network error — could not queue for call");
    } finally {
      setQueueing(null);
    }
  };

  return (
    <PageShell
      title="Prospects"
      description="Live property prospects scored by AI — new leads appear in real-time"
      actions={
        <div className="flex items-center gap-2">
          {rangerCount > 0 && (
            <Badge variant="neon" className="text-sm gap-1">
              <Radar className="h-2.5 w-2.5" />
              {rangerCount} Ranger
            </Badge>
          )}
          {prCount > 0 && (
            <Badge variant="outline" className="text-sm gap-1 text-foreground border-border/30">
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
      {/* ── Staging Link Banner ── */}
      {stagingCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3"
        >
          <a
            href="/sales-funnel/staging"
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-primary-500/20 bg-primary-500/[0.04] hover:bg-primary-500/[0.08] transition-colors"
          >
            <Clock className="h-3.5 w-3.5 text-primary-400 shrink-0" />
            <span className="text-xs font-semibold text-primary-300">
              {stagingCount} in staging
            </span>
            <span className="text-sm text-muted-foreground">
              Properties enriching and awaiting auto-promotion
            </span>
            <span className="ml-auto text-sm text-primary-400 font-medium">View Staging &rarr;</span>
          </a>
        </motion.div>
      )}

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
                  "text-sm px-2 py-1 rounded border transition-all",
                  sourceFilter === sf.value
                    ? "text-primary border-primary/20 bg-primary/8"
                    : "text-muted-foreground border-glass-border hover:text-foreground hover:border-overlay-10"
                )}
              >
                {sf.label}
              </button>
            ))}
          </div>

          {/* Score label filter */}
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground font-medium">Score:</span>
            {SCORE_FILTERS.map((sf) => {
              const count = sf.value === "platinum" ? platinumCnt : sf.value === "gold" ? goldCnt : sf.value === "silver" ? silverCnt : sf.value === "bronze" ? bronzeCnt : prospects.length;
              return (
                <button
                  key={sf.value}
                  onClick={() => setScoreFilter(sf.value)}
                  className={cn(
                    "text-sm px-2 py-1 rounded border transition-all inline-flex items-center gap-1",
                    scoreFilter === sf.value
                      ? `${sf.color} border-current/20 bg-current/8`
                      : "text-muted-foreground border-glass-border hover:text-foreground hover:border-overlay-10"
                  )}
                >
                  {sf.label}
                  <span className="opacity-60">({count})</span>
                </button>
              );
            })}
          </div>

          {/* Distress signal filter */}
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground font-medium">Signal:</span>
            {SIGNAL_FILTERS.map((sf) => {
              const count = sf.value
                ? prospects.filter((p) => p.tags.includes(sf.value)).length
                : prospects.length;
              return (
                <button
                  key={sf.value}
                  onClick={() => setSignalFilter(sf.value)}
                  className={cn(
                    "text-sm px-2 py-1 rounded border transition-all inline-flex items-center gap-1",
                    signalFilter === sf.value
                      ? `${sf.color} border-current/20 bg-current/8`
                      : "text-muted-foreground border-glass-border hover:text-foreground hover:border-overlay-10"
                  )}
                >
                  {sf.label}
                  {sf.value && <span className="opacity-60">({count})</span>}
                </button>
              );
            })}
          </div>

          {/* Sort controls */}
          <div className="flex items-center gap-1 ml-auto">
            <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
            {(["composite_score", "promoted_at", "owner_name"] as SortField[]).map((field) => (
              <button
                key={field}
                onClick={() => toggleSort(field)}
                className={cn(
                  "text-sm px-2 py-1 rounded border transition-all inline-flex items-center gap-1",
                  sortField === field
                    ? "text-primary border-primary/20 bg-primary/8"
                    : "text-muted-foreground border-glass-border hover:text-foreground"
                )}
              >
                {field === "composite_score" ? "Score" : field === "promoted_at" ? "Date" : "Name"}
                {sortField === field && <SortIcon className="h-2.5 w-2.5" />}
              </button>
            ))}
          </div>

          <Badge variant="outline" className="text-sm shrink-0">
            {scoreFilter ? filteredProspects.length : totalCount} prospects
          </Badge>
        </div>

        {/* Error state */}
        {error && (
          <div className="p-4 mb-4 rounded-[12px] border border-border/20 bg-muted/5 space-y-2">
            <div className="flex items-center gap-3 text-foreground text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="flex-1">{error}</span>
              <Button size="sm" variant="outline" className="text-xs" onClick={refetch}>
                Retry
              </Button>
            </div>
            <p className="text-sm text-foreground/60 font-mono">
              Query: leads.select(&apos;*, properties(*)&apos;).eq(&apos;status&apos;, &apos;prospect&apos;) — Check browser console for full error
            </p>
          </div>
        )}

        {/* Loading state */}
        {loading && filteredProspects.length === 0 && (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-3">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading prospects from Supabase...</span>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && filteredProspects.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
            <UserPlus className="h-8 w-8 opacity-30" />
            <p className="text-sm">No prospects found</p>
            <p className="text-xs">Ingest a property from PropertyRadar or push from Ranger to get started.</p>
          </div>
        )}

        {/* Table */}
        {filteredProspects.length > 0 && (
          <div className="overflow-hidden rounded-[12px] border border-glass-border">
            <table className="w-full">
              <thead>
                <tr className="border-b border-overlay-6 bg-overlay-2">
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground w-[280px]">Property</th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground w-[140px]">Phone</th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Distress Signals</th>
                  <th className="text-right p-3 text-xs font-medium text-muted-foreground">Est. Value</th>
                  <th
                    className="text-left p-3 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => toggleSort("composite_score")}
                  >
                    <span className="inline-flex items-center gap-1">
                      AI Score
                      {sortField === "composite_score" && <SortIcon className="h-2.5 w-2.5 text-primary" />}
                    </span>
                  </th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Last Activity</th>
                  <th className="text-right p-3 text-xs font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence mode="popLayout">
                  {filteredProspects.map((p, i) => {
                    // Filter tags to only valid distress types
                    const validSignals = p.tags.filter((t) => DISTRESS_LABELS[t]);
                    const freshness = timeAgo(p.promoted_at ?? p.created_at);
                    const hasAddress = p.address && p.address !== "" && !p.address.startsWith("Unknown");

                    return (
                      <motion.tr
                        key={p.id}
                        layout
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ delay: Math.min(i * 0.02, 0.5) }}
                        onClick={() => openDetail(p)}
                        className={cn(
                          "border-b border-overlay-6 hover:bg-overlay-4 transition-colors cursor-pointer",
                          p.source === "ranger_push" && "bg-muted/[0.02] hover:bg-muted/[0.05]",
                          p.source === "propertyradar" && "bg-muted/[0.02] hover:bg-muted/[0.05]"
                        )}
                      >
                        {/* ── Property / Owner / County / Source ── */}
                        <td className="p-3">
                          <div className="min-w-0 space-y-0.5">
                            {/* Address line */}
                            <p className="text-sm font-semibold text-foreground leading-tight truncate" style={{ WebkitFontSmoothing: "antialiased" }}>
                              {hasAddress ? (
                                <>{p.address}</>
                              ) : p.owner_name !== "Unknown" ? (
                                <span className="text-muted-foreground/70 italic">No address — {p.owner_name}</span>
                              ) : (
                                <span className="text-muted-foreground/50 italic">Needs enrichment</span>
                              )}
                            </p>
                            {/* Owner + County row */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {hasAddress && p.owner_name !== "Unknown" && (
                                <span className="text-xs text-muted-foreground/80 font-medium">{p.owner_name}</span>
                              )}
                              {hasAddress && p.owner_name !== "Unknown" && p.county && (
                                <span className="text-muted-foreground/30">·</span>
                              )}
                              {p.county && (
                                <span className="text-sm text-muted-foreground/60">{p.county} Co.</span>
                              )}
                              <SourceBadge source={p.source} />
                              {p.owner_phone && (
                                <span className="inline-flex items-center gap-0.5 text-xs text-foreground font-medium">
                                  <Phone className="h-2.5 w-2.5" />
                                  Phone
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* ── Phone / Contact ── */}
                        <td className="p-3">
                          <div className="space-y-0.5">
                            {p.owner_phone ? (
                              <>
                                <p className="text-xs font-mono text-foreground/90">{p.owner_phone}</p>
                                {p.owner_email && (
                                  <p className="text-sm text-muted-foreground/50 truncate max-w-[140px]">{p.owner_email}</p>
                                )}
                              </>
                            ) : (
                              <span className="text-sm text-foreground/60 font-medium">No phone</span>
                            )}
                          </div>
                        </td>

                        {/* ── Distress Signal Badges ── */}
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1 max-w-[220px]">
                            {validSignals.length > 0 ? (
                              <>
                                {validSignals.slice(0, 4).map((s) => (
                                  <SignalPill key={s} signal={s} stageLabel={getStageLabel(s, p)} />
                                ))}
                                {validSignals.length > 4 && (
                                  <span className="text-xs text-muted-foreground/50 self-center">+{validSignals.length - 4}</span>
                                )}
                              </>
                            ) : (
                              <span className="text-sm text-muted-foreground/40">No signals</span>
                            )}
                          </div>
                        </td>

                        {/* ── Est. Value (AVM + Tax Assessed) ── */}
                        <td className="p-3 text-right">
                          <div className="space-y-0.5">
                            {p.estimated_value ? (
                              <p className={cn(
                                "text-sm font-bold tabular-nums",
                                p.estimated_value < 200_000 ? "text-foreground" :
                                p.estimated_value < 410_000 ? "text-foreground" :
                                "text-foreground"
                              )} style={{ WebkitFontSmoothing: "antialiased" }}>
                                ${p.estimated_value >= 1000000
                                  ? `${(p.estimated_value / 1000000).toFixed(1)}M`
                                  : p.estimated_value >= 1000
                                    ? `${Math.round(p.estimated_value / 1000)}K`
                                    : p.estimated_value.toLocaleString()}
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground/40">No AVM</p>
                            )}
                            {(() => {
                              const taxVal = Number(p.owner_flags?.tax_assessed_value) || 0;
                              return taxVal > 0 ? (
                                <p className="text-sm text-muted-foreground/60 tabular-nums">
                                  Tax: ${taxVal >= 1000 ? `${Math.round(taxVal / 1000)}K` : taxVal.toLocaleString()}
                                </p>
                              ) : null;
                            })()}
                            {p.equity_percent != null ? (
                              <p className={cn(
                                "text-sm font-semibold tabular-nums",
                                p.equity_percent >= 60 ? "text-primary" : p.equity_percent >= 30 ? "text-foreground" : "text-muted-foreground/70"
                              )}>
                                {Math.round(p.equity_percent)}% eq
                              </p>
                            ) : p.is_free_clear ? (
                              <p className="text-sm font-semibold text-primary">Free &amp; Clear</p>
                            ) : null}
                          </div>
                        </td>

                        {/* ── AI Score ── */}
                        <td className="p-3">
                          <AIScoreBadge
                            score={buildAIScore(p)}
                            size="sm"
                            tags={p.tags}
                            equityPercent={p.equity_percent}
                            isAbsentee={p.is_absentee}
                          />
                        </td>

                        {/* ── Last Activity ── */}
                        <td className="p-3">
                          <div className="space-y-0.5 text-sm">
                            {freshness && (
                              <p className="text-muted-foreground/60 flex items-center gap-1">
                                <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary/60 shrink-0" />
                                {freshness}
                              </p>
                            )}
                            {p.total_loan_balance != null && p.total_loan_balance > 0 && (
                              <p className="text-muted-foreground/70">
                                Owes ${p.total_loan_balance >= 1000 ? `${Math.round(p.total_loan_balance / 1000)}K` : p.total_loan_balance.toLocaleString()}
                              </p>
                            )}
                            {p.foreclosure_stage && (
                              <p className="text-foreground font-medium">{p.foreclosure_stage}</p>
                            )}
                            {validSignals.length >= 3 && (
                              <p className="text-primary font-semibold">{validSignals.length} signals stacked</p>
                            )}
                          </div>
                        </td>

                        {/* ── Actions ── */}
                        <td className="p-3">
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-primary hover:text-primary hover:bg-primary/10"
                              title="Queue for Call"
                              disabled={queueing === p.id}
                              onClick={() => handleQueueForCall(p)}
                            >
                              {queueing === p.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <ListPlus className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            {p.owner_phone && (
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-foreground hover:text-foreground hover:bg-muted/10" title="Copy phone number"
                                onClick={() => { navigator.clipboard.writeText(p.owner_phone!); toast.success("Phone number copied to clipboard"); }}>
                                <Phone className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="Claim this lead"
                              disabled={claiming === p.id}
                              onClick={() => handleClaim(p.id)}
                            >
                              {claiming === p.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <UserCheck className="h-3 w-3" />
                              )}
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7" title="More">
                                  <MoreHorizontal className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="min-w-[160px]">
                                <DropdownMenuItem onClick={() => openDetail(p)} className="gap-2 text-xs">
                                  <Eye className="h-3 w-3" />
                                  View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleNurture(p)}
                                  disabled={nurturing === p.id}
                                  className="gap-2 text-xs text-foreground focus:text-foreground focus:bg-muted/10"
                                >
                                  {nurturing === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <HeartOff className="h-3 w-3" />}
                                  Move to Nurture
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => handleDelete(p)}
                                  disabled={deleting === p.id}
                                  className="gap-2 text-xs text-foreground focus:text-foreground focus:bg-muted/10"
                                >
                                  {deleting === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                  Delete Prospect
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
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

        {/* Loading overlay for refetch */}
        {loading && filteredProspects.length > 0 && (
          <div className="flex items-center justify-center py-3 text-muted-foreground gap-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span className="text-sm">Refreshing...</span>
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
