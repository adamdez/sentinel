"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3,
  Brain,
  Send,
  Loader2,
  Trash2,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  TrendingUp,
  TrendingDown,
  DollarSign,
  MousePointerClick,
  Eye,
  Target,
  Globe,
  FileText,
  Zap,
  ChevronDown,
  Clock,
  Filter,
  Settings,
  Save,
  RotateCcw,
  Layers,
  Play,
  Pause,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSentinelStore } from "@/lib/store";
import { PendingApprovalsTable } from "@/components/sentinel/ads/pending-approvals-table";

// ── Types ───────────────────────────────────────────────────────────

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface DailyMetric {
  id: number;
  report_date: string;
  campaign_id: number | null;
  market: "spokane" | "kootenai" | null;
  impressions: number;
  clicks: number;
  cost_micros: number;
  conversions: number;
}

interface AdsCampaign {
  id: number;
  name: string;
  market: "spokane" | "kootenai";
  status: string;
}

type MarketFilter = "all" | "spokane" | "kootenai";

type TabId = "dashboard" | "ad-groups" | "approvals" | "intelligence" | "copylab" | "landing" | "chat" | "system-prompt";

// ── Helpers ─────────────────────────────────────────────────────────

const CHAT_STORAGE_KEY = "sentinel_ads_chat_history";

function loadChatHistory(): ChatMsg[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveChatHistory(msgs: ChatMsg[]) {
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(msgs.slice(-100)));
  } catch { /* quota */ }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

function fmt$(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

// ── Main Page ───────────────────────────────────────────────────────

export default function AdsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [chatPreload, setChatPreload] = useState<string | null>(null);

  // Called from Intel tab to send a finding to Chat
  const sendToChat = useCallback((message: string) => {
    setChatPreload(message);
    setActiveTab("chat");
  }, []);

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: "dashboard", label: "Performance", icon: BarChart3 },
    { id: "ad-groups", label: "Ad Groups", icon: Layers },
    { id: "approvals", label: "Approvals", icon: Zap },
    { id: "intelligence", label: "Key Intel", icon: Brain },
    { id: "copylab", label: "Ad Copy Lab", icon: FileText },
    { id: "landing", label: "Landing Pages", icon: Globe },
    { id: "chat", label: "Chat", icon: Sparkles },
    { id: "system-prompt", label: "System Prompt", icon: Settings },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-cyan/8 flex items-center justify-center border border-cyan/15">
            <Target className="h-5 w-5 text-cyan" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight title-glow">
              Ads Command Center
            </h1>
            <p className="text-xs text-muted-foreground/60">
              Google Ads &middot; dominionhomedeals.com
            </p>
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 px-6 pt-3 pb-0">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 px-4 py-2.5 text-sm rounded-t-lg transition-all ${
                isActive
                  ? "text-cyan bg-white/[0.03] border border-white/[0.06] border-b-transparent"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/[0.02]"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
              {isActive && (
                <motion.div
                  layoutId="ads-tab-indicator"
                  className="absolute bottom-0 left-2 right-2 h-[2px] bg-cyan rounded-full"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto px-6 py-4 border-t border-white/[0.06]">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            {activeTab === "dashboard" && <DashboardTab />}
            {activeTab === "ad-groups" && <AdGroupsTab />}
            {activeTab === "approvals" && <PendingApprovalsTable />}
            {activeTab === "intelligence" && <IntelligenceTab onSendToChat={sendToChat} />}
            {activeTab === "copylab" && <CopyLabTab />}
            {activeTab === "landing" && <LandingTab />}
            {activeTab === "chat" && <ChatTab preloadMessage={chatPreload} onPreloadConsumed={() => setChatPreload(null)} />}
            {activeTab === "system-prompt" && <SystemPromptTab />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Dashboard Tab ───────────────────────────────────────────────────

function DashboardTab() {
  const [metrics, setMetrics] = useState<DailyMetric[]>([]);
  const [campaigns, setCampaigns] = useState<AdsCampaign[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("all");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [dateRange, setDateRange] = useState(30);

  const DATE_RANGE_OPTIONS = [
    { label: "Yesterday", days: 1 },
    { label: "7 days", days: 7 },
    { label: "14 days", days: 14 },
    { label: "30 days", days: 30 },
  ];

  const METRICS_ROW_CAP = 5000;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const sinceDate = new Date(Date.now() - dateRange * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10); // YYYY-MM-DD
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [metricsRes, campaignsRes, syncRes] = await Promise.all([
        (supabase.from("ads_daily_metrics") as any)
          .select("id, report_date, campaign_id, market, impressions, clicks, cost_micros, conversions")
          .gte("report_date", sinceDate)
          .order("report_date", { ascending: false })
          .limit(METRICS_ROW_CAP),
        (supabase.from("ads_campaigns") as any)
          .select("id, name, market, status")
          .neq("status", "REMOVED"),
        (supabase.from("ads_sync_logs") as any)
          .select("completed_at")
          .eq("status", "completed")
          .order("completed_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      const metricsData = metricsRes.data ?? [];
      setMetrics(metricsData);
      setTruncated(metricsData.length >= METRICS_ROW_CAP);
      setCampaigns(campaignsRes.data ?? []);
      setLastSyncAt(syncRes.data?.completed_at ?? null);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/ads/sync", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error("Sync failed:", body.error ?? res.status);
      }
      await loadData();
    } catch (err) {
      console.error("Sync failed:", err);
    }
    setSyncing(false);
  };

  // Build campaign name map
  const campaignNameMap = new Map(campaigns.map((c) => [c.id, c.name]));
  const campaignMarketMap = new Map(campaigns.map((c) => [c.id, c.market]));

  // Filter metrics by market
  const filtered = marketFilter === "all"
    ? metrics
    : metrics.filter((m) => {
        // Prefer metric-level market, fall back to campaign market
        const mkt = m.market ?? (m.campaign_id ? campaignMarketMap.get(m.campaign_id) : null);
        return mkt === marketFilter;
      });

  // Aggregate metrics (cost_micros → dollars)
  const totalSpend = filtered.reduce((s, r) => s + Number(r.cost_micros ?? 0), 0) / 1_000_000;
  const totalClicks = filtered.reduce((s, r) => s + Number(r.clicks ?? 0), 0);
  const totalImpressions = filtered.reduce((s, r) => s + Number(r.impressions ?? 0), 0);
  const totalConversions = filtered.reduce((s, r) => s + Number(r.conversions ?? 0), 0);
  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
  const costPerLead = totalConversions > 0 ? totalSpend / totalConversions : 0;

  // Campaign-level aggregation from daily metrics
  const campaignAgg = new Map<number, { name: string; market: string; spend: number; clicks: number; impressions: number; conversions: number }>();
  for (const m of filtered) {
    if (m.campaign_id == null) continue;
    const existing = campaignAgg.get(m.campaign_id) ?? {
      name: campaignNameMap.get(m.campaign_id) ?? `Campaign ${m.campaign_id}`,
      market: campaignMarketMap.get(m.campaign_id) ?? "—",
      spend: 0, clicks: 0, impressions: 0, conversions: 0,
    };
    existing.spend += Number(m.cost_micros ?? 0) / 1_000_000;
    existing.clicks += Number(m.clicks ?? 0);
    existing.impressions += Number(m.impressions ?? 0);
    existing.conversions += Number(m.conversions ?? 0);
    campaignAgg.set(m.campaign_id, existing);
  }
  const campaignRows = Array.from(campaignAgg.entries()).sort((a, b) => b[1].spend - a[1].spend);

  // Last synced display
  const syncAge = lastSyncAt ? Math.round((Date.now() - new Date(lastSyncAt).getTime()) / (1000 * 60)) : null;
  const syncLabel = syncAge == null
    ? "Never synced"
    : syncAge < 60
      ? `${syncAge}m ago`
      : syncAge < 1440
        ? `${Math.round(syncAge / 60)}h ago`
        : `${Math.round(syncAge / 1440)}d ago`;
  const syncStale = syncAge != null && syncAge > 24 * 60; // >24h = stale

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-cyan/50" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toolbar: Market filter + Sync status + Sync button */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          {/* Market filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-muted-foreground/50" />
            <div className="flex rounded-lg border border-white/[0.08] overflow-hidden">
              {(["all", "spokane", "kootenai"] as MarketFilter[]).map((mkt) => (
                <button
                  key={mkt}
                  onClick={() => setMarketFilter(mkt)}
                  className={`px-3 py-1.5 text-xs capitalize transition ${
                    marketFilter === mkt
                      ? "bg-cyan/15 text-cyan font-medium"
                      : "text-muted-foreground/60 hover:text-foreground hover:bg-white/[0.03]"
                  }`}
                >
                  {mkt === "all" ? "All Markets" : mkt}
                </button>
              ))}
            </div>
          </div>

          {/* Date range selector */}
          <div className="flex rounded-lg border border-white/[0.08] overflow-hidden">
            {DATE_RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.days}
                onClick={() => setDateRange(opt.days)}
                className={`px-3 py-1.5 text-xs transition ${
                  dateRange === opt.days
                    ? "bg-cyan/15 text-cyan font-medium"
                    : "text-muted-foreground/60 hover:text-foreground hover:bg-white/[0.03]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Last synced badge */}
          <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
            syncStale
              ? "border-amber-500/20 text-amber-400 bg-amber-500/5"
              : lastSyncAt
                ? "border-emerald-500/20 text-emerald-400 bg-emerald-500/5"
                : "border-white/[0.08] text-muted-foreground/50"
          }`}>
            <Clock className="h-3 w-3" />
            <span>{syncLabel}</span>
          </div>
        </div>

        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-cyan/10 text-cyan hover:bg-cyan/20 border border-cyan/20 transition disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : "Sync Google Ads"}
        </button>
      </div>

      {/* Truncation warning — surfaces if row cap is hit */}
      {truncated && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>Data may be incomplete — too many metric rows for the last {dateRange} days. Totals could be understated.</span>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <Target className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground mb-2">
            {metrics.length === 0 ? "No Ad Data Yet" : `No data for ${marketFilter}`}
          </h3>
          <p className="text-sm text-muted-foreground/60 max-w-md mx-auto">
            {metrics.length === 0
              ? "Click \u201CSync Google Ads\u201D to pull your campaign data, or configure your Google Ads API credentials in environment variables."
              : "Try switching the market filter or syncing fresh data."}
          </p>
        </div>
      ) : (
        <>
          {/* Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricCard icon={DollarSign} label="Total Spend" value={fmt$(totalSpend)} trend={null} />
            <MetricCard icon={MousePointerClick} label="Clicks" value={totalClicks.toLocaleString()} trend={null} />
            <MetricCard icon={Eye} label="Impressions" value={totalImpressions.toLocaleString()} trend={null} />
            <MetricCard icon={Target} label="Conversions" value={totalConversions.toFixed(1)} trend={null} />
            <MetricCard icon={TrendingUp} label="Avg CPC" value={fmt$(avgCpc)} trend={null} />
            <MetricCard icon={TrendingDown} label="Cost/Lead" value={costPerLead > 0 ? fmt$(costPerLead) : "—"} trend={null} />
          </div>

          {/* CTR highlight */}
          <div className="glass-strong rounded-xl p-4 border border-white/[0.06]">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Click-Through Rate</span>
              <span className="text-lg font-bold text-cyan">{fmtPct(avgCtr)}</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-white/[0.04] overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-cyan/60 to-cyan"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(avgCtr * 100 * 10, 100)}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
          </div>

          {/* Campaign Table */}
          <div className="glass-strong rounded-xl border border-white/[0.06] overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06]">
              <h3 className="text-sm font-semibold">Campaigns</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.04] text-muted-foreground/60">
                    <th className="text-left px-4 py-2 font-medium">Campaign</th>
                    <th className="text-left px-4 py-2 font-medium">Market</th>
                    <th className="text-right px-4 py-2 font-medium">Spend</th>
                    <th className="text-right px-4 py-2 font-medium">Clicks</th>
                    <th className="text-right px-4 py-2 font-medium">Impressions</th>
                    <th className="text-right px-4 py-2 font-medium">CTR</th>
                    <th className="text-right px-4 py-2 font-medium">Conv.</th>
                    <th className="text-right px-4 py-2 font-medium">CPC</th>
                  </tr>
                </thead>
                <tbody>
                  {campaignRows.map(([id, c]) => (
                    <tr key={id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition">
                      <td className="px-4 py-2.5 font-medium">{c.name}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.04] capitalize">{c.market}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right">{fmt$(c.spend)}</td>
                      <td className="px-4 py-2.5 text-right">{c.clicks.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right">{c.impressions.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right">{c.impressions > 0 ? fmtPct(c.clicks / c.impressions) : "—"}</td>
                      <td className="px-4 py-2.5 text-right">{c.conversions.toFixed(1)}</td>
                      <td className="px-4 py-2.5 text-right">{c.clicks > 0 ? fmt$(c.spend / c.clicks) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, trend }: { icon: React.ElementType; label: string; value: string; trend: number | null }) {
  return (
    <div className="glass-strong rounded-xl p-4 border border-white/[0.06]">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-cyan/60" />
        <span className="text-xs text-muted-foreground/60 uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-xl font-bold">{value}</div>
      {trend !== null && (
        <div className={`text-xs mt-1 ${trend >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          {trend >= 0 ? "+" : ""}{trend.toFixed(1)}%
        </div>
      )}
    </div>
  );
}

// ── Key Intelligence Tab ─────────────────────────────────────────────

interface DataPoint {
  rank: number;
  category: string;
  signal: string;
  why_it_matters: string;
  confidence: string;
  urgency: string;
  dollar_impact: string;
  market: string;
  entity?: string;
  entity_id?: string;
  recommended_action: string;
}

interface IntelligenceData {
  briefing_date: string;
  account_status: string;
  executive_summary: string;
  total_estimated_monthly_waste: number;
  total_estimated_monthly_opportunity: number;
  data_points: DataPoint[];
}

interface AdversarialIntel {
  verdict: string;
  grade: string;
  assessment: string;
  challenges: Array<{ targetFinding: string; challenge: string; severity: string; alternativeInterpretation: string }>;
  missedOpportunities: string[];
  overconfidentClaims: string[];
  finalInstruction: string;
}

function IntelligenceTab({ onSendToChat }: { onSendToChat: (message: string) => void }) {
  const [intelligence, setIntelligence] = useState<IntelligenceData | null>(null);
  const [adversarial, setAdversarial] = useState<AdversarialIntel | null>(null);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [urgencyFilter, setUrgencyFilter] = useState<string>("all");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [executingAction, setExecutingAction] = useState<number | null>(null);
  const [actionResults, setActionResults] = useState<Record<number, { ok: boolean; message: string }>>({});

  // Load latest briefing from server on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch("/api/ads/intelligence", {
          method: "GET",
          headers,
        });
        const text = await res.text();
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(text);
        } catch {
          if (!cancelled) setError("Failed to load briefing — server returned invalid response");
          return;
        }
        if (!res.ok) {
          if (!cancelled) setError((data.error as string) || "Failed to load briefing");
          return;
        }
        if (!cancelled) {
          if (data.intelligence) {
            setIntelligence(data.intelligence as typeof intelligence);
            setAdversarial((data.adversarial as typeof adversarial) ?? null);
            setSavedAt((data.savedAt as string) ?? null);
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load briefing");
      } finally {
        if (!cancelled) {
          setLoading(false);
          setInitialized(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Format the age of the briefing for display
  const briefingAge = (() => {
    if (!savedAt) return null;
    const diffMs = Date.now() - new Date(savedAt).getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays > 0) return { text: `Updated ${diffDays} day${diffDays > 1 ? "s" : ""} ago`, stale: diffDays >= 1 };
    if (diffHours > 0) return { text: `Updated ${diffHours} hour${diffHours > 1 ? "s" : ""} ago`, stale: diffHours >= 24 };
    return { text: "Updated just now", stale: false };
  })();

  const handleExtract = async () => {
    setExtracting(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/ads/intelligence", {
        method: "POST",
        headers,
      });
      // Safely parse response — Vercel may return HTML on timeout
      const text = await res.text();
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(text);
      } catch {
        // Non-JSON response (likely Vercel timeout or 502)
        console.error("[Intel] Non-JSON response:", text.slice(0, 200));
        setError("The intelligence extraction timed out. This usually means the AI models took too long. Please try again — it typically works on retry.");
        return;
      }
      if (!res.ok) {
        setError((data.error as string) || "Failed to extract intelligence");
        return;
      }
      setIntelligence(data.intelligence as typeof intelligence);
      setAdversarial((data.adversarial as typeof adversarial) ?? null);
      setSavedAt((data.savedAt as string) ?? new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed — check your connection and try again");
    } finally {
      setExtracting(false);
    }
  };

  // ── Determine if a data point has a directly executable action ──
  function parseExecutableAction(dp: DataPoint): {
    label: string;
    confirmMessage: string;
    action: string;
    params: Record<string, unknown>;
  } | null {
    const rec = (dp.recommended_action ?? "").toLowerCase();
    const signal = (dp.signal ?? "").toLowerCase();

    // Negative keyword additions
    if (rec.includes("add") && (rec.includes("negative") || rec.includes("'homes for sale'"))) {
      // Extract quoted keywords from the recommended action
      const quotedMatches = dp.recommended_action.match(/'([^']+)'/g);
      if (quotedMatches && quotedMatches.length > 0) {
        const keywords = quotedMatches.map(q => q.replace(/'/g, "").replace(/[,;:]+$/g, "").trim()).filter(Boolean);
        return {
          label: `Add ${keywords.length} Negatives`,
          confirmMessage: `Add ${keywords.length} negative keywords to the campaign?\n\n${keywords.map(k => `• "${k}"`).join("\n")}\n\nThis stops your ads from showing for these search terms.`,
          action: "add_negatives",
          params: { keywords, campaignId: "23643350797", matchType: "EXACT" },
        };
      }
    }

    // Pause broad match keywords in an ad group
    if (rec.includes("pause") && rec.includes("broad match") && dp.entity) {
      const adGroupName = dp.entity.replace(" ad group", "").replace("ad group ", "");
      return {
        label: "Pause Broad Match",
        confirmMessage: `Pause all broad match keywords in "${adGroupName}"?\n\nThis keeps phrase and exact match keywords running but stops the broad match keywords from triggering irrelevant queries.`,
        action: "pause_keywords_broad",
        params: { adGroupName },
      };
    }

    // Pause specific keyword (blank keyword or specific ID)
    if (rec.includes("pause") && (signal.includes("blank keyword") || signal.includes("empty keyword")) && dp.entity_id) {
      return {
        label: "Pause Keyword",
        confirmMessage: `Pause the blank/empty keyword (ID: ${dp.entity_id})?\n\nThis keyword is matching on random queries and wasting budget.`,
        action: "pause_keyword",
        params: { keywordId: dp.entity_id, adGroupId: "" }, // Will need ad group lookup
      };
    }

    // Budget adjustment
    if (rec.includes("reduce") && rec.includes("budget") && rec.includes("$")) {
      const budgetMatch = rec.match(/\$(\d+)(?:\s*[-–]\s*\$?(\d+))?/);
      if (budgetMatch) {
        const targetBudget = budgetMatch[2] ? Number(budgetMatch[2]) : Number(budgetMatch[1]);
        return {
          label: `Set Budget $${targetBudget}/day`,
          confirmMessage: `Reduce the daily budget to $${targetBudget}/day?\n\nThis takes effect immediately and limits daily spend until you change it back.`,
          action: "budget_adjust",
          params: { newDailyBudget: targetBudget },
        };
      }
    }

    return null;
  }

  const executeAction = async (dp: DataPoint, index: number) => {
    const action = parseExecutableAction(dp);
    if (!action) return;

    if (!window.confirm(action.confirmMessage)) return;

    setExecutingAction(index);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/ads/intel-action", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: action.action,
          params: action.params,
          finding: { rank: dp.rank, signal: dp.signal, recommended_action: dp.recommended_action },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      // Build a clear success message from the results
      const resultItems = data.results as Array<{ status: string }> | undefined;
      const successCount = resultItems?.filter((r) => r.status === "added" || r.status === "paused" || r.status === "adjusted" || r.status === "already_exists").length ?? 0;
      const failCount = resultItems?.filter((r) => r.status === "error").length ?? 0;
      const msg = failCount > 0
        ? `Applied ${successCount}, ${failCount} failed — check logs`
        : `Applied successfully (${successCount} changes)`;
      setActionResults(prev => ({ ...prev, [index]: { ok: failCount === 0, message: msg } }));
    } catch (err) {
      setActionResults(prev => ({ ...prev, [index]: { ok: false, message: err instanceof Error ? err.message : "Failed" } }));
    } finally {
      setExecutingAction(null);
    }
  };

  const urgencyColor: Record<string, string> = {
    act_now: "text-red-400 bg-red-400/10 border-red-400/20",
    this_week: "text-amber-400 bg-amber-400/10 border-amber-400/20",
    monitor: "text-cyan bg-cyan/10 border-cyan/20",
    fyi: "text-muted-foreground bg-white/5 border-white/10",
  };

  const categoryIcon: Record<string, string> = {
    waste: "text-red-400",
    opportunity: "text-emerald-400",
    competitive: "text-purple-400",
    trend: "text-blue-400",
    quality: "text-cyan",
    attribution: "text-amber-400",
    structural: "text-orange-400",
    market: "text-indigo-400",
    creative: "text-pink-400",
    risk: "text-red-500",
  };

  const statusColor: Record<string, string> = {
    healthy: "text-emerald-400 bg-emerald-400/10",
    caution: "text-amber-400 bg-amber-400/10",
    warning: "text-orange-400 bg-orange-400/10",
    critical: "text-red-400 bg-red-400/10",
  };

  const filteredPoints = (intelligence?.data_points ?? []).filter((dp) => {
    if (categoryFilter !== "all" && dp.category !== categoryFilter) return false;
    if (urgencyFilter !== "all" && dp.urgency !== urgencyFilter) return false;
    return true;
  });

  const categories = [...new Set((intelligence?.data_points ?? []).map((dp) => dp.category))];

  if (loading || !initialized) {
    return (
      <div className="text-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-cyan/50 mx-auto mb-4" />
        <p className="text-sm text-muted-foreground">Loading intelligence briefing...</p>
      </div>
    );
  }

  if (extracting) {
    return (
      <div className="text-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-cyan/50 mx-auto mb-4" />
        <p className="text-sm text-muted-foreground">Running dual-model intelligence extraction...</p>
        <p className="text-xs text-muted-foreground/50 mt-1">Opus 4.6 analyzing → GPT-5.4 Pro challenging</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <XCircle className="h-8 w-8 text-red-400/60 mx-auto mb-3" />
        <p className="text-sm text-red-400">{error}</p>
        <button onClick={handleExtract} className="mt-4 px-4 py-2 text-xs rounded-lg bg-cyan/10 text-cyan border border-cyan/20">
          Retry
        </button>
      </div>
    );
  }

  if (!intelligence) {
    return (
      <div className="space-y-6">
        <div className="flex items-start gap-2 p-3 rounded-lg bg-cyan/5 border border-cyan/10 text-xs text-muted-foreground">
          <Info className="h-4 w-4 text-cyan/50 shrink-0 mt-0.5" />
          <div>
            <span className="text-foreground/80 font-medium">Dual-model intelligence extraction.</span>{" "}
            Opus 4.6 scans all account data and ranks the top 30-50 most important signals.
            GPT-5.4 Pro then challenges the rankings, flags blind spots, and adjusts confidence levels.
          </div>
        </div>

        <div className="text-center py-16">
          <Zap className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground mb-2">Key Intelligence</h3>
          <p className="text-sm text-muted-foreground/60 max-w-md mx-auto mb-6">
            No briefing yet. Extract and rank the most important data points from your entire account.
            Every signal is dollar-quantified and adversarially challenged.
          </p>
          <button
            onClick={handleExtract}
            className="flex items-center gap-2 px-6 py-2.5 text-sm rounded-lg bg-cyan/10 text-cyan hover:bg-cyan/20 border border-cyan/20 transition mx-auto"
          >
            <Zap className="h-4 w-4" />
            Extract Intelligence Briefing
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Executive Summary */}
      <div className="glass-strong rounded-xl border border-white/[0.06] p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold">Intelligence Briefing</h3>
            {intelligence?.account_status && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono uppercase ${statusColor[intelligence.account_status] ?? ""}`}>
                {intelligence.account_status}
              </span>
            )}
            {briefingAge && (
              <span className={`text-[10px] font-mono ${briefingAge.stale ? "text-amber-400" : "text-muted-foreground/40"}`} title={savedAt ?? undefined}>
                {briefingAge.text}{briefingAge.stale ? " — consider refreshing" : ""}
              </span>
            )}
          </div>
          <button
            onClick={handleExtract}
            disabled={extracting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-white/10 text-muted-foreground hover:text-foreground transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${extracting ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
        <p className="text-sm text-foreground/80 leading-relaxed">{intelligence?.executive_summary}</p>

        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="p-3 rounded-lg bg-red-400/5 border border-red-400/10">
            <div className="text-[10px] text-red-400/60 uppercase tracking-wide mb-1">Est. Monthly Waste</div>
            <div className="text-lg font-semibold text-red-400">
              ${(intelligence?.total_estimated_monthly_waste ?? 0).toLocaleString()}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-emerald-400/5 border border-emerald-400/10">
            <div className="text-[10px] text-emerald-400/60 uppercase tracking-wide mb-1">Est. Monthly Opportunity</div>
            <div className="text-lg font-semibold text-emerald-400">
              ${(intelligence?.total_estimated_monthly_opportunity ?? 0).toLocaleString()}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-cyan/5 border border-cyan/10">
            <div className="text-[10px] text-cyan/60 uppercase tracking-wide mb-1">Data Points</div>
            <div className="text-lg font-semibold text-cyan">
              {intelligence?.data_points?.length ?? 0}
            </div>
          </div>
        </div>
      </div>

      {/* Adversarial Assessment */}
      {adversarial && (
        <div className="glass-strong rounded-xl border border-amber-500/15 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-amber-400">Adversarial Review — GPT-5.4 Pro</h3>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono border ${
              adversarial.verdict === "approve" ? "text-emerald-400 border-emerald-400/20 bg-emerald-400/5" :
              adversarial.verdict === "approve_with_changes" ? "text-amber-400 border-amber-400/20 bg-amber-400/5" :
              "text-red-400 border-red-400/20 bg-red-400/5"
            }`}>
              {adversarial.verdict?.replace(/_/g, " ")} · Grade: {adversarial.grade}
            </span>
          </div>
          <p className="text-xs text-foreground/70 mb-3">{adversarial.assessment}</p>

          {adversarial.challenges.length > 0 && (
            <div className="space-y-2 mb-3">
              <div className="text-[10px] text-amber-400/60 uppercase tracking-wide">Challenges</div>
              {adversarial.challenges.slice(0, 5).map((c, i) => (
                <div key={i} className="flex gap-2 text-xs p-2 rounded bg-amber-500/5 border border-amber-500/8">
                  <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded border ${
                    c.severity === "critical" ? "text-red-400 border-red-400/20" :
                    c.severity === "moderate" ? "text-amber-400 border-amber-400/20" :
                    "text-muted-foreground border-white/10"
                  }`}>{c.severity}</span>
                  <div>
                    <span className="text-foreground/80">{c.challenge}</span>
                    {c.alternativeInterpretation && (
                      <span className="block text-muted-foreground/60 mt-0.5">Alt: {c.alternativeInterpretation}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {adversarial.missedOpportunities.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] text-amber-400/60 uppercase tracking-wide mb-1">Blind Spots Flagged</div>
              <ul className="space-y-1">
                {adversarial.missedOpportunities.map((m, i) => (
                  <li key={i} className="text-xs text-foreground/70 flex gap-1.5">
                    <span className="text-amber-400/40 shrink-0">●</span> {m}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {adversarial.overconfidentClaims.length > 0 && (
            <div>
              <div className="text-[10px] text-red-400/60 uppercase tracking-wide mb-1">Overconfident Claims</div>
              <ul className="space-y-1">
                {adversarial.overconfidentClaims.map((c, i) => (
                  <li key={i} className="text-xs text-foreground/70 flex gap-1.5">
                    <span className="text-red-400/40 shrink-0">●</span> {c}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-muted-foreground/40" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-xs bg-black/30 border border-white/[0.08] rounded-lg px-2 py-1.5 text-foreground/80"
          >
            <option value="all">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
        <select
          value={urgencyFilter}
          onChange={(e) => setUrgencyFilter(e.target.value)}
          className="text-xs bg-black/30 border border-white/[0.08] rounded-lg px-2 py-1.5 text-foreground/80"
        >
          <option value="all">All Urgency</option>
          <option value="act_now">Act Now</option>
          <option value="this_week">This Week</option>
          <option value="monitor">Monitor</option>
          <option value="fyi">FYI</option>
        </select>
        <span className="text-[10px] text-muted-foreground/40 ml-auto">
          Showing {filteredPoints.length} of {intelligence?.data_points?.length ?? 0}
        </span>
      </div>

      {/* Data Points */}
      <div className="space-y-2">
        {filteredPoints.map((dp, i) => (
          <div key={i} className="glass-strong rounded-lg border border-white/[0.06] p-3">
            <div className="flex items-start gap-3">
              {/* Rank */}
              <div className="text-lg font-bold text-muted-foreground/20 w-8 text-right shrink-0">
                {dp.rank}
              </div>

              <div className="flex-1 min-w-0">
                {/* Header row */}
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border border-white/10 uppercase tracking-wide ${categoryIcon[dp.category] ?? "text-muted-foreground"}`}>
                    {dp.category}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${urgencyColor[dp.urgency] ?? ""}`}>
                    {dp.urgency?.replace(/_/g, " ")}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border border-white/10 ${
                    dp.confidence === "confirmed" ? "text-emerald-400" :
                    dp.confidence === "inferred" ? "text-amber-400" : "text-red-400"
                  }`}>
                    {dp.confidence}
                  </span>
                  {dp.market && dp.market !== "both" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-white/10 text-muted-foreground">
                      {dp.market}
                    </span>
                  )}
                  {dp.dollar_impact && dp.dollar_impact !== "unquantifiable" && (
                    <span className="text-[10px] font-mono text-cyan/70 ml-auto">
                      {dp.dollar_impact}
                    </span>
                  )}
                </div>

                {/* Signal */}
                <p className="text-sm text-foreground/90 font-medium">{dp.signal}</p>

                {/* Why it matters */}
                <p className="text-xs text-muted-foreground mt-1">{dp.why_it_matters}</p>

                {/* Entity + Action */}
                <div className="flex items-center gap-3 mt-2">
                  {dp.entity && (
                    <span className="text-[10px] text-muted-foreground/50 font-mono">{dp.entity}</span>
                  )}
                  {dp.recommended_action && (
                    <span className="text-[10px] text-cyan/60">→ {dp.recommended_action}</span>
                  )}
                </div>

                {/* Action Buttons */}
                {(() => {
                  const execAction = parseExecutableAction(dp);
                  const result = actionResults[i];
                  const isExecuting = executingAction === i;

                  return (
                    <div className="flex items-center gap-2 mt-3 pt-2 border-t border-white/[0.04]">
                      {execAction && !result?.ok && (
                        <button
                          onClick={(e) => { e.stopPropagation(); executeAction(dp, i); }}
                          disabled={isExecuting}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg bg-cyan/10 text-cyan border border-cyan/20 hover:bg-cyan/20 transition disabled:opacity-50"
                        >
                          {isExecuting ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Zap className="h-3 w-3" />
                          )}
                          {isExecuting ? "Applying..." : execAction.label}
                        </button>
                      )}
                      {result && (
                        <span className={`flex items-center gap-1 text-[11px] ${result.ok ? "text-emerald-400" : "text-red-400"}`}>
                          {result.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                          {result.message}
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const msg = `Intel finding #${dp.rank}: "${dp.signal}"\n\nRecommended action: ${dp.recommended_action}\n\nEntity: ${dp.entity ?? "N/A"}\nCategory: ${dp.category} | Urgency: ${dp.urgency}\nImpact: ${dp.dollar_impact}\n\nHelp me understand this finding and decide what to do about it.`;
                          onSendToChat(msg);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg bg-white/[0.04] text-muted-foreground border border-white/[0.06] hover:text-foreground hover:bg-white/[0.08] transition"
                      >
                        <Sparkles className="h-3 w-3" />
                        Discuss in Chat
                      </button>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Ad Copy Lab Tab ────────────────────────────────────────────────

interface IntentCluster {
  name: string;
  search_terms: string[];
  volume_signal: string;
  economic_potential: string;
}

interface AdVariant {
  angle: string;
  headlines: string[];
  descriptions: string[];
}

interface AdFamily {
  target_cluster: string;
  evidence: string;
  confidence: string;
  test_type: string;
  rsa: { headlines: string[]; descriptions: string[] };
  variants: AdVariant[];
  landing_page_match: string;
  success_metric: string;
}

interface CopyLabAdversarial {
  verdict: string;
  grade: string;
  assessment: string;
  challenges: Array<{ targetFinding: string; challenge: string; severity: string; alternativeInterpretation: string }>;
  missedOpportunities: string[];
  overconfidentClaims: string[];
  agreesWithPrimary: string[];
  requiredChanges: string[];
  finalInstruction: string;
}

interface CopyLabResult {
  generated: {
    intent_clusters: IntentCluster[];
    ad_families: AdFamily[];
  };
  adversarial: CopyLabAdversarial | null;
}

function CopyLabTab() {
  const [result, setResult] = useState<CopyLabResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedFamilies, setExpandedFamilies] = useState<Set<number>>(new Set());
  const [expandedVariants, setExpandedVariants] = useState<Set<string>>(new Set());

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/ads/copy-lab", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Generation failed");
      } else {
        setResult(data);
        // Auto-expand all families; reset any stale variant expansions from a previous run
        const allFamilies = new Set<number>();
        (data.generated?.ad_families ?? []).forEach((_: unknown, i: number) => allFamilies.add(i));
        setExpandedFamilies(allFamilies);
        setExpandedVariants(new Set());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    }
    setGenerating(false);
  };

  const toggleFamily = (idx: number) => {
    setExpandedFamilies((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleVariant = (key: string) => {
    setExpandedVariants((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const confidenceBadge = (level: string) => {
    const colors: Record<string, string> = {
      high: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
      moderate: "bg-cyan/10 text-cyan border-cyan/20",
      exploratory: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    };
    return colors[level] ?? colors.exploratory;
  };

  const verdictColor = (verdict: string) => {
    const colors: Record<string, string> = {
      approve: "text-emerald-400",
      approve_with_changes: "text-amber-400",
      reject: "text-red-400",
      insufficient_evidence: "text-muted-foreground/60",
    };
    return colors[verdict] ?? "text-muted-foreground/60";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Ad Copy Lab</h3>
          <p className="text-xs text-muted-foreground/60">
            Dual-model AI engine: Opus 4.6 generates, GPT-5.4 Pro challenges
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-cyan/10 text-cyan hover:bg-cyan/20 border border-cyan/20 transition disabled:opacity-50"
        >
          <Sparkles className={`h-4 w-4 ${generating ? "animate-pulse" : ""}`} />
          {generating ? "Generating..." : "Generate Ad Concepts"}
        </button>
      </div>

      {/* Loading state */}
      {generating && (
        <div className="glass-strong rounded-xl border border-white/[0.06] p-8">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-cyan/60" />
            <div className="text-center">
              <p className="text-sm font-medium">Running dual-model analysis</p>
              <p className="text-xs text-muted-foreground/50 mt-1">
                Opus 4.6 is analyzing intent clusters and generating RSAs, then GPT-5.4 Pro will challenge the output.
                This typically takes 30-60 seconds.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !generating && (
        <div className="glass-strong rounded-xl border border-red-500/20 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!result && !generating && !error && (
        <div className="text-center py-16">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground mb-2">Ad Copy Lab</h3>
          <p className="text-sm text-muted-foreground/60 max-w-md mx-auto">
            Generate intent-driven RSA concepts from your search term data.
            Click &ldquo;Generate Ad Concepts&rdquo; to start.
          </p>
        </div>
      )}

      {/* Results */}
      {result && !generating && (
        <>
          {/* Intent Clusters */}
          {result.generated.intent_clusters.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground/60 tracking-wide">
                Discovered Intent Clusters ({result.generated.intent_clusters.length})
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {result.generated.intent_clusters.map((cluster, i) => (
                  <div key={i} className="glass-strong rounded-xl border border-white/[0.06] p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Target className="h-4 w-4 text-cyan shrink-0" />
                      <span className="text-sm font-semibold truncate">{cluster.name}</span>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${
                        cluster.volume_signal === "high"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : cluster.volume_signal === "medium"
                          ? "bg-cyan/10 text-cyan border-cyan/20"
                          : "bg-white/[0.04] text-muted-foreground/60 border-white/[0.08]"
                      }`}>
                        {cluster.volume_signal} volume
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground/60 mb-2">{cluster.economic_potential}</p>
                    <div className="flex flex-wrap gap-1">
                      {cluster.search_terms.slice(0, 5).map((term, j) => (
                        <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] text-muted-foreground/50">
                          {term}
                        </span>
                      ))}
                      {cluster.search_terms.length > 5 && (
                        <span className="text-[10px] px-1.5 py-0.5 text-muted-foreground/40">
                          +{cluster.search_terms.length - 5} more
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ad Families */}
          {result.generated.ad_families.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground/60 tracking-wide">
                Generated Ad Families ({result.generated.ad_families.length})
              </h4>
              <div className="space-y-3">
                {result.generated.ad_families.map((family, i) => (
                  <div key={i} className="glass-strong rounded-xl border border-white/[0.06] overflow-hidden">
                    {/* Family header */}
                    <button
                      onClick={() => toggleFamily(i)}
                      className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-white/[0.02] transition"
                    >
                      <FileText className="h-5 w-5 text-cyan shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold">{family.target_cluster}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${confidenceBadge(family.confidence)}`}>
                            {family.confidence}
                          </span>
                          {family.test_type && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.04] text-muted-foreground/50 border border-white/[0.06]">
                              {family.test_type}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground/50 mt-1 truncate">{family.evidence}</p>
                      </div>
                      <ChevronDown className={`h-4 w-4 text-muted-foreground/40 transition-transform shrink-0 ${expandedFamilies.has(i) ? "rotate-180" : ""}`} />
                    </button>

                    <AnimatePresence>
                      {expandedFamilies.has(i) && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4 space-y-4 border-t border-white/[0.04] pt-3">
                            {/* Evidence & rationale */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div className="bg-white/[0.02] rounded-lg p-3">
                                <h5 className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wide mb-1">Evidence</h5>
                                <p className="text-xs text-muted-foreground/80">{family.evidence}</p>
                              </div>
                              <div className="bg-white/[0.02] rounded-lg p-3">
                                <h5 className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wide mb-1">Success Metric</h5>
                                <p className="text-xs text-muted-foreground/80">{family.success_metric}</p>
                              </div>
                            </div>
                            {family.landing_page_match && (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
                                <Globe className="h-3 w-3" />
                                Landing page: <span className="text-cyan">{family.landing_page_match}</span>
                              </div>
                            )}

                            {/* Headlines */}
                            <div>
                              <h5 className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wide mb-2">
                                Headlines ({family.rsa.headlines.length})
                              </h5>
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5">
                                {family.rsa.headlines.map((h, j) => (
                                  <div key={j} className="flex items-center gap-2 bg-white/[0.02] rounded px-2.5 py-1.5">
                                    <span className="text-[10px] text-muted-foreground/30 font-mono w-4 shrink-0">{j + 1}</span>
                                    <span className="text-xs flex-1 truncate">{h}</span>
                                    <span className={`text-[10px] font-mono shrink-0 ${h.length > 30 ? "text-red-400" : "text-muted-foreground/30"}`}>
                                      {h.length}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Descriptions */}
                            <div>
                              <h5 className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wide mb-2">
                                Descriptions ({family.rsa.descriptions.length})
                              </h5>
                              <div className="space-y-1.5">
                                {family.rsa.descriptions.map((d, j) => (
                                  <div key={j} className="flex items-start gap-2 bg-white/[0.02] rounded px-2.5 py-1.5">
                                    <span className="text-[10px] text-muted-foreground/30 font-mono w-4 shrink-0 mt-0.5">{j + 1}</span>
                                    <span className="text-xs flex-1">{d}</span>
                                    <span className={`text-[10px] font-mono shrink-0 mt-0.5 ${d.length > 90 ? "text-red-400" : "text-muted-foreground/30"}`}>
                                      {d.length}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Variants */}
                            {family.variants.length > 0 && (
                              <div>
                                <h5 className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wide mb-2">
                                  Variants ({family.variants.length})
                                </h5>
                                <div className="space-y-2">
                                  {family.variants.map((variant, vi) => {
                                    const variantKey = `${i}-${vi}`;
                                    return (
                                      <div key={vi} className="border border-white/[0.04] rounded-lg overflow-hidden">
                                        <button
                                          onClick={() => toggleVariant(variantKey)}
                                          className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-white/[0.02] transition text-xs"
                                        >
                                          <Zap className="h-3 w-3 text-amber-400 shrink-0" />
                                          <span className="font-medium flex-1">{variant.angle}</span>
                                          <ChevronDown className={`h-3 w-3 text-muted-foreground/40 transition-transform ${expandedVariants.has(variantKey) ? "rotate-180" : ""}`} />
                                        </button>
                                        <AnimatePresence>
                                          {expandedVariants.has(variantKey) && (
                                            <motion.div
                                              initial={{ height: 0, opacity: 0 }}
                                              animate={{ height: "auto", opacity: 1 }}
                                              exit={{ height: 0, opacity: 0 }}
                                              transition={{ duration: 0.15 }}
                                              className="overflow-hidden"
                                            >
                                              <div className="px-3 pb-3 pt-1 space-y-2 border-t border-white/[0.04]">
                                                <div className="space-y-1">
                                                  {variant.headlines.map((h, hi) => (
                                                    <div key={hi} className="flex items-center gap-2 bg-white/[0.02] rounded px-2 py-1">
                                                      <span className="text-[10px] text-muted-foreground/30 font-mono w-3 shrink-0">{hi + 1}</span>
                                                      <span className="text-xs flex-1 truncate">{h}</span>
                                                      <span className={`text-[10px] font-mono shrink-0 ${h.length > 30 ? "text-red-400" : "text-muted-foreground/30"}`}>
                                                        {h.length}
                                                      </span>
                                                    </div>
                                                  ))}
                                                </div>
                                                <div className="space-y-1">
                                                  {variant.descriptions.map((d, di) => (
                                                    <div key={di} className="flex items-start gap-2 bg-white/[0.02] rounded px-2 py-1">
                                                      <span className="text-[10px] text-muted-foreground/30 font-mono w-3 shrink-0 mt-0.5">{di + 1}</span>
                                                      <span className="text-xs flex-1">{d}</span>
                                                      <span className={`text-[10px] font-mono shrink-0 mt-0.5 ${d.length > 90 ? "text-red-400" : "text-muted-foreground/30"}`}>
                                                        {d.length}
                                                      </span>
                                                    </div>
                                                  ))}
                                                </div>
                                              </div>
                                            </motion.div>
                                          )}
                                        </AnimatePresence>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Adversarial Assessment */}
          {result.adversarial && (
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground/60 tracking-wide">
                Adversarial Assessment (GPT-5.4 Pro)
              </h4>
              <div className="glass-strong rounded-xl border border-amber-500/20 overflow-hidden">
                {/* Verdict header */}
                <div className="px-4 py-3 border-b border-white/[0.04] flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-semibold ${verdictColor(result.adversarial.verdict)}`}>
                        {result.adversarial.verdict.replace(/_/g, " ")}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        Grade: {result.adversarial.grade}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${
                        result.adversarial.finalInstruction === "proceed"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : result.adversarial.finalInstruction === "revise"
                          ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          : "bg-red-500/10 text-red-400 border-red-500/20"
                      }`}>
                        {result.adversarial.finalInstruction}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="px-4 py-3 space-y-4">
                  {/* Overall assessment */}
                  <p className="text-sm text-muted-foreground/80 leading-relaxed">{result.adversarial.assessment}</p>

                  {/* Challenges */}
                  {result.adversarial.challenges.length > 0 && (
                    <div className="space-y-2">
                      <h5 className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
                        Challenges ({result.adversarial.challenges.length})
                      </h5>
                      {result.adversarial.challenges.map((c, i) => (
                        <div key={i} className="bg-amber-500/[0.04] rounded-lg p-3 border border-amber-500/10">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-semibold ${
                              c.severity === "critical" ? "bg-red-500/15 text-red-400"
                              : c.severity === "moderate" ? "bg-amber-500/15 text-amber-400"
                              : "bg-white/[0.06] text-muted-foreground/50"
                            }`}>
                              {c.severity}
                            </span>
                            <span className="text-xs font-medium text-amber-300">{c.targetFinding}</span>
                          </div>
                          <p className="text-xs text-muted-foreground/70">{c.challenge}</p>
                          {c.alternativeInterpretation && (
                            <p className="text-xs text-muted-foreground/50 mt-1 italic">Alt: {c.alternativeInterpretation}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Agrees with */}
                  {result.adversarial.agreesWithPrimary.length > 0 && (
                    <div>
                      <h5 className="text-xs font-semibold text-emerald-400 uppercase tracking-wide mb-1">Agrees With</h5>
                      <ul className="space-y-1">
                        {result.adversarial.agreesWithPrimary.map((item, i) => (
                          <li key={i} className="text-xs text-muted-foreground/60 flex items-start gap-1.5">
                            <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0 mt-0.5" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Missed opportunities */}
                  {result.adversarial.missedOpportunities.length > 0 && (
                    <div>
                      <h5 className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-1">Missed Opportunities</h5>
                      <ul className="space-y-1">
                        {result.adversarial.missedOpportunities.map((item, i) => (
                          <li key={i} className="text-xs text-muted-foreground/60 flex items-start gap-1.5">
                            <TrendingUp className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Required changes */}
                  {result.adversarial.requiredChanges.length > 0 && (
                    <div>
                      <h5 className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-1">Required Changes</h5>
                      <ul className="space-y-1">
                        {result.adversarial.requiredChanges.map((item, i) => (
                          <li key={i} className="text-xs text-muted-foreground/60 flex items-start gap-1.5">
                            <XCircle className="h-3 w-3 text-red-400 shrink-0 mt-0.5" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Overconfident claims */}
                  {result.adversarial.overconfidentClaims.length > 0 && (
                    <div>
                      <h5 className="text-xs font-semibold text-muted-foreground/50 uppercase tracking-wide mb-1">Overconfident Claims</h5>
                      <ul className="space-y-1">
                        {result.adversarial.overconfidentClaims.map((item, i) => (
                          <li key={i} className="text-xs text-muted-foreground/50 flex items-start gap-1.5">
                            <Info className="h-3 w-3 text-muted-foreground/40 shrink-0 mt-0.5" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Ad Groups Tab ──────────────────────────────────────────────────

interface AdGroupRow {
  id: string;
  googleAdGroupId: string;
  name: string;
  status: string;
  campaignName: string | null;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  ctr: number;
  avgCpc: number;
  keywords: { total: number; enabled: number; paused: number };
}

function AdGroupsTab() {
  const [adGroups, setAdGroups] = useState<AdGroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAdGroups = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/ads/ad-groups", { headers });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setAdGroups(data.adGroups ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ad groups");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAdGroups(); }, [fetchAdGroups]);

  const toggleStatus = async (ag: AdGroupRow) => {
    const action = ag.status === "ENABLED" ? "pause" : "enable";
    const confirmMsg = action === "pause"
      ? `Pause "${ag.name}"? This will stop all ads in this ad group from serving.`
      : `Enable "${ag.name}"? This will start serving ads in this ad group.`;
    if (!window.confirm(confirmMsg)) return;

    setToggling(ag.googleAdGroupId);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/ads/ad-groups", {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ googleAdGroupId: ag.googleAdGroupId, action }),
      });
      if (!res.ok) throw new Error(await res.text());
      // Optimistically update local state
      setAdGroups(prev => prev.map(g =>
        g.googleAdGroupId === ag.googleAdGroupId
          ? { ...g, status: action === "pause" ? "PAUSED" : "ENABLED" }
          : g
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update ad group");
    } finally {
      setToggling(null);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-cyan/50" /></div>;
  }

  const enabled = adGroups.filter(g => g.status === "ENABLED");
  const paused = adGroups.filter(g => g.status === "PAUSED");
  const totalCost = adGroups.reduce((s, g) => s + g.cost, 0);
  const totalClicks = adGroups.reduce((s, g) => s + g.clicks, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Ad Groups &middot; Direct Control</h3>
          <p className="text-xs text-muted-foreground/60">
            {enabled.length} enabled &middot; {paused.length} paused &middot; {fmt$(totalCost)} total spend &middot; {totalClicks} clicks
          </p>
        </div>
        <button
          onClick={() => { setLoading(true); fetchAdGroups(); }}
          className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg bg-white/[0.04] text-muted-foreground hover:text-foreground border border-white/[0.06] transition"
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Ad Group List */}
      <div className="space-y-2">
        {adGroups.map((ag) => {
          const isEnabled = ag.status === "ENABLED";
          const isToggling = toggling === ag.googleAdGroupId;
          const matchedPage = LANDING_PAGES.find(p => p.adGroup === ag.name);

          return (
            <div
              key={ag.googleAdGroupId}
              className={`glass-strong rounded-xl border p-4 transition-all ${
                isEnabled
                  ? "border-white/[0.06]"
                  : "border-white/[0.04] opacity-60"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className={`h-2 w-2 rounded-full ${isEnabled ? "bg-emerald-400" : "bg-zinc-500"}`} />
                  <div>
                    <p className="text-sm font-semibold">{ag.name}</p>
                    {ag.campaignName && (
                      <p className="text-[10px] text-muted-foreground/40">{ag.campaignName}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {matchedPage ? (
                    <span className="text-[10px] bg-cyan/10 text-cyan px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                      <Globe className="h-2.5 w-2.5" />
                      {matchedPage.path}
                    </span>
                  ) : (
                    <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full font-medium">
                      No Landing Page
                    </span>
                  )}
                  <button
                    onClick={() => toggleStatus(ag)}
                    disabled={isToggling}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition ${
                      isEnabled
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20"
                        : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                    } disabled:opacity-50`}
                  >
                    {isToggling ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : isEnabled ? (
                      <Pause className="h-3 w-3" />
                    ) : (
                      <Play className="h-3 w-3" />
                    )}
                    {isEnabled ? "Pause" : "Enable"}
                  </button>
                </div>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-6 gap-3 mt-3 pt-3 border-t border-white/[0.04]">
                <div>
                  <p className="text-[10px] text-muted-foreground/40 uppercase tracking-wider">Impressions</p>
                  <p className="text-sm font-semibold">{ag.impressions.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground/40 uppercase tracking-wider">Clicks</p>
                  <p className="text-sm font-semibold">{ag.clicks.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground/40 uppercase tracking-wider">CTR</p>
                  <p className="text-sm font-semibold">{fmtPct(ag.ctr)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground/40 uppercase tracking-wider">Avg CPC</p>
                  <p className="text-sm font-semibold">{fmt$(ag.avgCpc)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground/40 uppercase tracking-wider">Cost</p>
                  <p className="text-sm font-semibold">{fmt$(ag.cost)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground/40 uppercase tracking-wider">Keywords</p>
                  <p className="text-sm font-semibold">
                    {ag.keywords.enabled}<span className="text-muted-foreground/40 text-xs">/{ag.keywords.total}</span>
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {adGroups.length === 0 && !error && (
        <div className="text-center py-12">
          <Layers className="h-8 w-8 mx-auto text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground/50">No ad groups found. Run a sync first.</p>
        </div>
      )}
    </div>
  );
}

// ── Landing Page Tab ────────────────────────────────────────────────

interface LandingReview {
  id: string;
  review_type: string;
  summary: string;
  findings: Array<{ severity: string; title: string; detail: string }>;
  suggestions: Array<{ action: string; target: string; target_id: string; old_value: string; new_value: string; reason: string }>;
  ai_engine: string;
  created_at: string;
}

// Landing page → ad group mapping
const LANDING_PAGES = [
  {
    path: "/sell",
    label: "Sell My House",
    adGroup: "Sell My House",
    description: "Primary PPC page — speed, cash, certainty",
    intent: "Seller wants to sell fast for cash",
  },
  {
    path: "/sell/as-is",
    label: "Sell As-Is",
    adGroup: "As-Is / Repairs",
    description: "House needs work, skip repairs entirely",
    intent: "Seller knows house needs work, doesn't want to deal with it",
  },
  {
    path: "/sell/inherited",
    label: "Inherited Property",
    adGroup: "Inherited / Probate",
    description: "Estate situations, probate, family complexity",
    intent: "Seller dealing with inherited property or estate",
  },
  {
    path: "/sell/foreclosure",
    label: "Foreclosure",
    adGroup: "Foreclosure / Behind on Payments",
    description: "Behind on mortgage, facing foreclosure timeline",
    intent: "Seller under financial pressure, needs speed",
  },
  {
    path: "/sell/landlord",
    label: "Landlord Exit",
    adGroup: "AD GROUP 4: Landlord Exit",
    description: "Tired of being a landlord, sell rental with tenants",
    intent: "Landlord wants out — tenants in place, no repairs, walk away clean",
  },
];

interface AdGroupMetrics {
  name: string;
  clicks: number;
  impressions: number;
  cost: number;
  conversions: number;
}

function LandingTab() {
  const [review, setReview] = useState<LandingReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  const [adGroupMetrics, setAdGroupMetrics] = useState<AdGroupMetrics[]>([]);

  useEffect(() => {
    (async () => {
      try {
        // Fetch latest landing page review
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase.from("ad_reviews") as any)
          .select("*")
          .eq("review_type", "landing_page")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        setReview(data ?? null);

        // Fetch ad group performance (last 30 days)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: adGroups } = await (supabase.from("ads_ad_groups") as any)
          .select("name, google_ad_group_id")
          .eq("status", "ENABLED");

        if (adGroups && adGroups.length > 0) {
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: metrics } = await (supabase.from("ads_daily_metrics") as any)
            .select("ad_group_id, impressions, clicks, cost_micros, conversions")
            .gte("report_date", thirtyDaysAgo.toISOString().split("T")[0])
            .not("ad_group_id", "is", null);

          if (metrics) {
            // Aggregate by ad group
            const agMap = new Map<string, { clicks: number; impressions: number; cost: number; conversions: number }>();
            for (const m of metrics) {
              const existing = agMap.get(m.ad_group_id) ?? { clicks: 0, impressions: 0, cost: 0, conversions: 0 };
              existing.clicks += m.clicks || 0;
              existing.impressions += m.impressions || 0;
              existing.cost += (m.cost_micros || 0) / 1_000_000;
              existing.conversions += m.conversions || 0;
              agMap.set(m.ad_group_id, existing);
            }

            // Map ad group DB IDs to names
            const result: AdGroupMetrics[] = [];
            for (const ag of adGroups) {
              const m = agMap.get(ag.id) ?? { clicks: 0, impressions: 0, cost: 0, conversions: 0 };
              if (ag.name) {
                result.push({ name: ag.name, ...m });
              }
            }
            setAdGroupMetrics(result);
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleReview = async () => {
    setReviewing(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/ads/landing-page", {
        method: "POST",
        headers,
      });
      if (res.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase.from("ad_reviews") as any)
          .select("*")
          .eq("review_type", "landing_page")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        setReview(data ?? null);
      }
    } catch (err) {
      console.error("Landing page review failed:", err);
    }
    setReviewing(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-cyan/50" /></div>;
  }

  const severityIcon: Record<string, React.ReactNode> = {
    critical: <AlertTriangle className="h-4 w-4 text-red-400" />,
    warning: <AlertTriangle className="h-4 w-4 text-amber-400" />,
    info: <Info className="h-4 w-4 text-cyan" />,
  };

  const getMetricsForAdGroup = (adGroupName: string) => {
    return adGroupMetrics.find(m => m.name === adGroupName);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Landing Pages &middot; dominionhomedeals.com</h3>
          <p className="text-xs text-muted-foreground/60">
            {LANDING_PAGES.length} pages mapped to {LANDING_PAGES.length} ad groups
          </p>
        </div>
        <button
          onClick={handleReview}
          disabled={reviewing}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-cyan/10 text-cyan hover:bg-cyan/20 border border-cyan/20 transition disabled:opacity-50"
        >
          <Globe className={`h-4 w-4 ${reviewing ? "animate-spin" : ""}`} />
          {reviewing ? "Analyzing..." : "Review All Pages"}
        </button>
      </div>

      {/* Landing Page Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {LANDING_PAGES.map((page) => {
          const metrics = getMetricsForAdGroup(page.adGroup);
          const ctr = metrics && metrics.impressions > 0 ? (metrics.clicks / metrics.impressions) : 0;
          const cpc = metrics && metrics.clicks > 0 ? (metrics.cost / metrics.clicks) : 0;
          const isSelected = selectedPage === page.path;

          return (
            <button
              key={page.path}
              onClick={() => setSelectedPage(isSelected ? null : page.path)}
              className={`text-left glass-strong rounded-xl border p-4 transition-all ${
                isSelected
                  ? "border-cyan/30 bg-cyan/[0.03]"
                  : "border-white/[0.06] hover:border-white/[0.12]"
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-semibold">{page.label}</p>
                  <p className="text-xs text-muted-foreground/50 mt-0.5">{page.path}</p>
                </div>
                <span className="text-[10px] bg-cyan/10 text-cyan px-2 py-0.5 rounded-full font-medium">
                  LIVE
                </span>
              </div>

              <p className="text-xs text-muted-foreground/60 mb-3">{page.description}</p>

              {/* Ad Group Mapping */}
              <div className="flex items-center gap-1.5 mb-3 text-xs">
                <Target className="h-3 w-3 text-yellow-400" />
                <span className="text-muted-foreground/70">Ad Group:</span>
                <span className="text-yellow-400/80 font-medium">{page.adGroup}</span>
              </div>

              {/* Metrics Row */}
              {metrics && (metrics.clicks > 0 || metrics.impressions > 0) ? (
                <div className="grid grid-cols-4 gap-2 pt-2 border-t border-white/[0.04]">
                  <div>
                    <p className="text-[10px] text-muted-foreground/40 uppercase tracking-wider">Clicks</p>
                    <p className="text-sm font-semibold">{metrics.clicks.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground/40 uppercase tracking-wider">CTR</p>
                    <p className="text-sm font-semibold">{fmtPct(ctr)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground/40 uppercase tracking-wider">CPC</p>
                    <p className="text-sm font-semibold">{fmt$(cpc)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground/40 uppercase tracking-wider">Conv.</p>
                    <p className="text-sm font-semibold">{metrics.conversions}</p>
                  </div>
                </div>
              ) : (
                <div className="pt-2 border-t border-white/[0.04]">
                  <p className="text-[10px] text-muted-foreground/30 italic">No metrics yet — page is new</p>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected Page Detail */}
      {selectedPage && (
        <div className="glass-strong rounded-xl border border-white/[0.06] p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Globe className="h-4 w-4 text-cyan" />
            <h4 className="text-sm font-semibold">
              {LANDING_PAGES.find(p => p.path === selectedPage)?.label} — Page Details
            </h4>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground/40 mb-1">URL</p>
              <p className="text-cyan text-xs font-mono">dominionhomedeals.com{selectedPage}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground/40 mb-1">Matched Ad Group</p>
              <p className="text-yellow-400/80 text-xs">{LANDING_PAGES.find(p => p.path === selectedPage)?.adGroup}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground/40 mb-1">Visitor Intent</p>
              <p className="text-muted-foreground/70 text-xs">{LANDING_PAGES.find(p => p.path === selectedPage)?.intent}</p>
            </div>
          </div>
          <div className="pt-2 border-t border-white/[0.04]">
            <p className="text-[10px] text-muted-foreground/40">
              Google Ads tracking: Update your ad group final URLs to point each ad group to its matching landing page.
              Each page has gtag conversion tracking via the shared /sell layout.
            </p>
          </div>
        </div>
      )}

      {/* AI Review Section */}
      {review ? (
        <div className="space-y-4">
          <div className="glass-strong rounded-xl border border-white/[0.06] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Brain className="h-5 w-5 text-cyan" />
              <h3 className="text-sm font-semibold">Claude&apos;s Analysis</h3>
              <span className="text-xs text-muted-foreground/40 ml-auto">
                {new Date(review.created_at).toLocaleDateString()}
              </span>
            </div>
            <p className="text-sm text-muted-foreground/80 leading-relaxed">{review.summary}</p>
          </div>

          {review.findings.length > 0 && (
            <div className="glass-strong rounded-xl border border-white/[0.06] p-4 space-y-3">
              <h4 className="text-sm font-semibold">Findings</h4>
              {review.findings.map((f, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  {severityIcon[f.severity] ?? severityIcon.info}
                  <div>
                    <span className="font-medium">{f.title}</span>
                    <p className="text-muted-foreground/60 text-xs mt-0.5">{f.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {review.suggestions.length > 0 && (
            <div className="glass-strong rounded-xl border border-white/[0.06] p-4 space-y-3">
              <h4 className="text-sm font-semibold">Improvement Suggestions</h4>
              {review.suggestions.map((s, i) => (
                <div key={i} className="bg-white/[0.02] rounded-lg p-3 text-sm">
                  <span className="font-medium">{s.target}</span>
                  {s.old_value && s.new_value && (
                    <div className="mt-1 text-xs">
                      <div className="text-red-400/60 line-through">{s.old_value}</div>
                      <div className="text-cyan mt-0.5">{s.new_value}</div>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground/50 mt-1">{s.reason}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-8">
          <Brain className="h-8 w-8 mx-auto text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground/50">Click &ldquo;Review All Pages&rdquo; to get Claude&apos;s conversion analysis.</p>
        </div>
      )}

      {/* Setup Guide */}
      <div className="glass-strong rounded-xl border border-white/[0.06] p-4 space-y-3">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Settings className="h-4 w-4 text-muted-foreground/40" />
          Google Ads Setup
        </h4>
        <p className="text-xs text-muted-foreground/60 leading-relaxed">
          To connect each ad group to its landing page, update the <strong>Final URL</strong> in Google Ads:
        </p>
        <div className="space-y-2">
          {LANDING_PAGES.map((page) => (
            <div key={page.path} className="flex items-center justify-between text-xs bg-white/[0.02] rounded-lg px-3 py-2">
              <span className="text-muted-foreground/70">{page.adGroup}</span>
              <span className="text-cyan font-mono">dominionhomedeals.com{page.path}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground/40 leading-relaxed">
          Add <code className="text-cyan/60">?utm_source=google&amp;utm_medium=cpc&amp;utm_campaign=spokane_seller&amp;utm_content=</code> + ad group name
          for attribution tracking in analytics.
        </p>
      </div>
    </div>
  );
}

// ── Chat Tab ────────────────────────────────────────────────────────

const CHAT_SUGGESTIONS = [
  "What are our top performing keywords?",
  "Why might our CPC be high?",
  "Write 5 new headline variations for our main campaign",
  "Which ad groups should we pause?",
  "Analyze our search terms for negative keyword opportunities",
  "What budget changes would you recommend?",
];

function ChatTab({ preloadMessage, onPreloadConsumed }: { preloadMessage?: string | null; onPreloadConsumed?: () => void }) {
  const { currentUser } = useSentinelStore();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const preloadHandled = useRef(false);

  useEffect(() => {
    setMessages(loadChatHistory());
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useCallback(async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || streaming) return;
    setInput("");

    const userMsg: ChatMsg = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };
    const assistantMsg: ChatMsg = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setStreaming(true);

    try {
      const headers = await getAuthHeaders();
      const allMsgs = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/ads/chat", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ messages: allMsgs }),
      });

      if (!res.ok || !res.body) throw new Error(`Chat failed: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();
            if (payload === "[DONE]") continue;

            try {
              const parsed = JSON.parse(payload);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                accumulated += delta;
                setMessages((prev) => {
                  const copy = [...prev];
                  copy[copy.length - 1] = { ...copy[copy.length - 1], content: accumulated };
                  return copy;
                });
              }
            } catch { /* skip malformed frame */ }
          }
        }
      } catch (streamErr) {
        console.error("[Ads/Chat] Stream read error:", streamErr);
        // Re-throw so the outer catch can set the error UI
        throw streamErr;
      }

      // Commit final state and persist — avoid side-effects inside setState
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { ...copy[copy.length - 1], content: accumulated };
        return copy;
      });
      saveChatHistory([...messages, userMsg, { ...assistantMsg, content: accumulated }]);
    } catch (err) {
      console.error("[Ads/Chat]", err);
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        // Preserve any partial content already streamed; only show error if nothing received
        copy[copy.length - 1] = {
          ...last,
          content: last.content || "Sorry, something went wrong. Please try again.",
        };
        return copy;
      });
    }

    setStreaming(false);
  }, [input, streaming, messages]);

  // Handle preload from Intel tab "Discuss in Chat"
  useEffect(() => {
    if (preloadMessage && !preloadHandled.current && !streaming) {
      preloadHandled.current = true;
      // Small delay to ensure chat history is loaded
      const timer = setTimeout(() => {
        send(preloadMessage);
        onPreloadConsumed?.();
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [preloadMessage, streaming, send, onPreloadConsumed]);

  const clearHistory = () => {
    setMessages([]);
    localStorage.removeItem(CHAT_STORAGE_KEY);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-220px)]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <Sparkles className="h-10 w-10 mx-auto text-cyan/30 mb-4" />
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Ask Claude about your Google Ads</h3>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg mx-auto">
              {CHAT_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-xs px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.06] text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
                msg.role === "user"
                  ? "bg-cyan/10 border border-cyan/20 text-foreground"
                  : "bg-white/[0.03] border border-white/[0.06] text-muted-foreground"
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content || (streaming ? "..." : "")}</div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-white/[0.06] pt-3 flex items-end gap-2">
        {messages.length > 0 && (
          <button
            onClick={clearHistory}
            className="p-2.5 rounded-lg hover:bg-white/[0.04] text-muted-foreground/40 hover:text-red-400 transition shrink-0"
            title="Clear chat"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        <div className="flex-1 relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask Claude about your ads..."
            rows={1}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cyan/30 resize-none placeholder:text-muted-foreground/30"
          />
        </div>
        <button
          onClick={() => send()}
          disabled={!input.trim() || streaming}
          className="p-2.5 rounded-lg bg-cyan/10 text-cyan hover:bg-cyan/20 border border-cyan/20 transition disabled:opacity-30 shrink-0"
        >
          {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

// ── System Prompt Tab ────────────────────────────────────────────────

function PromptEditor({ promptKey, title, subtitle, modelLabel, accentColor }: {
  promptKey: "default" | "adversarial";
  title: string;
  subtitle: string;
  modelLabel: string;
  accentColor: string;
}) {
  const [promptText, setPromptText] = useState("");
  const [originalText, setOriginalText] = useState("");
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const hasChanges = promptText !== originalText;

  const loadPrompt = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/ads/system-prompt?key=${promptKey}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setPromptText(data.prompt_text);
        setOriginalText(data.prompt_text);
        setVersion(data.version ?? 0);
        setUpdatedAt(data.updated_at ?? null);
      }
    } catch (err) {
      console.error(`Failed to load ${promptKey} prompt:`, err);
    } finally {
      setLoading(false);
    }
  }, [promptKey]);

  useEffect(() => { loadPrompt(); }, [loadPrompt]);

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus("idle");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/ads/system-prompt", {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ prompt_key: promptKey, prompt_text: promptText }),
      });
      if (res.ok) {
        const data = await res.json();
        setVersion(data.version);
        setUpdatedAt(data.updated_at);
        setOriginalText(promptText);
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 3000);
      } else {
        setSaveStatus("error");
      }
    } catch {
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Loading...
      </div>
    );
  }

  const charCount = promptText.length;
  const lineCount = promptText.split("\n").length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{title}</h3>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono ${accentColor}`}>
              {modelLabel}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {subtitle}
            {version > 0 && (
              <span className="ml-2 opacity-60">
                v{version}
                {updatedAt && ` · ${new Date(updatedAt).toLocaleDateString()}`}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <button
              onClick={() => setPromptText(originalText)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20 transition"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Discard
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-lg bg-cyan/10 text-cyan border border-cyan/20 hover:bg-cyan/20 transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? "Saving..." : "Save"}
          </button>
          {saveStatus === "saved" && (
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Saved
            </span>
          )}
          {saveStatus === "error" && (
            <span className="flex items-center gap-1 text-xs text-red-400">
              <XCircle className="h-3.5 w-3.5" /> Failed
            </span>
          )}
        </div>
      </div>

      <div className="relative">
        <textarea
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          className="w-full h-[calc(100vh-420px)] min-h-[300px] p-4 rounded-lg bg-black/30 border border-white/[0.08] text-sm font-mono text-foreground/90 leading-relaxed resize-none focus:outline-none focus:border-cyan/30 focus:ring-1 focus:ring-cyan/20 transition placeholder:text-muted-foreground/30"
          placeholder={`Enter the ${promptKey} prompt...`}
          spellCheck={false}
        />
        <div className="absolute bottom-3 right-3 flex items-center gap-3 text-[10px] text-muted-foreground/40 font-mono">
          {hasChanges && <span className="text-amber-400/60">{Math.abs(charCount - originalText.length)} chars {charCount > originalText.length ? "added" : "removed"}</span>}
          <span>{lineCount} lines</span>
          <span>{charCount.toLocaleString()} chars</span>
        </div>
      </div>
    </div>
  );
}

function SystemPromptTab() {
  const [activePrompt, setActivePrompt] = useState<"default" | "adversarial">("default");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-cyan/5 border border-cyan/10 text-xs text-muted-foreground">
        <Info className="h-4 w-4 text-cyan/50 shrink-0 mt-0.5" />
        <div>
          <span className="text-foreground/80 font-medium">Dual-model AI engine.</span>{" "}
          The primary analyst (Opus 4.6) runs the full review, then the adversarial reviewer (GPT-5.4 Pro)
          challenges every finding. Both prompts are editable — changes take effect on the next review cycle.
        </div>
      </div>

      {/* Prompt selector tabs */}
      <div className="flex gap-1 p-1 rounded-lg bg-black/20 border border-white/[0.06] w-fit">
        <button
          onClick={() => setActivePrompt("default")}
          className={`px-4 py-2 text-xs rounded-md transition font-medium ${
            activePrompt === "default"
              ? "bg-cyan/10 text-cyan border border-cyan/20"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Brain className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
          Primary Analyst — Opus 4.6
        </button>
        <button
          onClick={() => setActivePrompt("adversarial")}
          className={`px-4 py-2 text-xs rounded-md transition font-medium ${
            activePrompt === "adversarial"
              ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
          Adversarial Reviewer — GPT-5.4 Pro
        </button>
      </div>

      {/* Active editor */}
      {activePrompt === "default" ? (
        <PromptEditor
          promptKey="default"
          title="Primary Operating Prompt"
          subtitle="Governs all AI Review, Chat, and recommendation generation."
          modelLabel="Claude Opus 4.6"
          accentColor="text-cyan border-cyan/20 bg-cyan/5"
        />
      ) : (
        <PromptEditor
          promptKey="adversarial"
          title="Adversarial Review Prompt"
          subtitle="Challenges every primary finding. Issues verdict: approve, revise, reject, or hold."
          modelLabel="GPT-5.4 Pro"
          accentColor="text-amber-400 border-amber-500/20 bg-amber-500/5"
        />
      )}
    </div>
  );
}
