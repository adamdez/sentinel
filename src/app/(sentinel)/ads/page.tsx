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
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSentinelStore } from "@/lib/store";

// ── Types ───────────────────────────────────────────────────────────

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface AdSnapshot {
  id: string;
  campaign_id: string;
  campaign_name: string;
  ad_group_name: string | null;
  ad_id: string | null;
  headline1: string | null;
  headline2: string | null;
  headline3: string | null;
  description1: string | null;
  description2: string | null;
  impressions: number;
  clicks: number;
  ctr: number;
  avg_cpc: number;
  conversions: number;
  cost: number;
  roas: number | null;
  quality_score: number | null;
  snapshot_date: string;
}

interface AdReview {
  id: string;
  review_type: string;
  summary: string;
  findings: Array<{ severity: string; title: string; detail: string }>;
  suggestions: Array<{ action: string; target: string; target_id: string; old_value: string; new_value: string; reason: string }>;
  ai_engine: string;
  created_at: string;
}

interface AdAction {
  id: string;
  action_type: string;
  target_entity: string;
  target_id: string;
  old_value: string | null;
  new_value: string | null;
  status: string;
  created_at: string;
  ad_reviews?: { review_type: string; summary: string };
}

type TabId = "dashboard" | "review" | "copylab" | "landing" | "chat";

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

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: "dashboard", label: "Performance", icon: BarChart3 },
    { id: "review", label: "AI Review", icon: Brain },
    { id: "copylab", label: "Ad Copy Lab", icon: FileText },
    { id: "landing", label: "Landing Page", icon: Globe },
    { id: "chat", label: "Chat", icon: Sparkles },
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
            {activeTab === "review" && <ReviewTab />}
            {activeTab === "copylab" && <CopyLabTab />}
            {activeTab === "landing" && <LandingTab />}
            {activeTab === "chat" && <ChatTab />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Dashboard Tab ───────────────────────────────────────────────────

function DashboardTab() {
  const [snapshots, setSnapshots] = useState<AdSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const loadSnapshots = useCallback(async () => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from("ad_snapshots") as any)
      .select("*")
      .order("snapshot_date", { ascending: false })
      .limit(100);
    setSnapshots(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadSnapshots(); }, [loadSnapshots]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const headers = await getAuthHeaders();
      await fetch("/api/ads/sync", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
      });
      await loadSnapshots();
    } catch (err) {
      console.error("Sync failed:", err);
    }
    setSyncing(false);
  };

  // Aggregate metrics
  const totalSpend = snapshots.reduce((s, r) => s + Number(r.cost ?? 0), 0);
  const totalClicks = snapshots.reduce((s, r) => s + Number(r.clicks ?? 0), 0);
  const totalImpressions = snapshots.reduce((s, r) => s + Number(r.impressions ?? 0), 0);
  const totalConversions = snapshots.reduce((s, r) => s + Number(r.conversions ?? 0), 0);
  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
  const costPerLead = totalConversions > 0 ? totalSpend / totalConversions : 0;

  // Campaign-level aggregation
  const campaignMap = new Map<string, { name: string; spend: number; clicks: number; impressions: number; conversions: number }>();
  for (const s of snapshots) {
    if (!s.ad_id) {
      const existing = campaignMap.get(s.campaign_id) ?? { name: s.campaign_name, spend: 0, clicks: 0, impressions: 0, conversions: 0 };
      existing.spend += Number(s.cost ?? 0);
      existing.clicks += Number(s.clicks ?? 0);
      existing.impressions += Number(s.impressions ?? 0);
      existing.conversions += Number(s.conversions ?? 0);
      campaignMap.set(s.campaign_id, existing);
    }
  }
  const campaignRows = Array.from(campaignMap.entries()).sort((a, b) => b[1].spend - a[1].spend);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-cyan/50" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sync Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-cyan/10 text-cyan hover:bg-cyan/20 border border-cyan/20 transition disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : "Sync Google Ads"}
        </button>
      </div>

      {snapshots.length === 0 ? (
        <div className="text-center py-16">
          <Target className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground mb-2">No Ad Data Yet</h3>
          <p className="text-sm text-muted-foreground/60 max-w-md mx-auto">
            Click &ldquo;Sync Google Ads&rdquo; to pull your campaign data, or configure your Google Ads API credentials in environment variables.
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

// ── AI Review Tab ───────────────────────────────────────────────────

function ReviewTab() {
  const [reviews, setReviews] = useState<AdReview[]>([]);
  const [actions, setActions] = useState<AdAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [reviewType, setReviewType] = useState<string>("performance");

  const loadData = useCallback(async () => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [{ data: revs }, { data: acts }] = await Promise.all([
      (supabase.from("ad_reviews") as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20),
      (supabase.from("ad_actions") as any)
        .select("*, ad_reviews(review_type, summary)")
        .eq("status", "suggested")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    setReviews(revs ?? []);
    setActions(acts ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRunReview = async () => {
    setReviewing(true);
    try {
      const headers = await getAuthHeaders();
      await fetch("/api/ads/review", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ reviewType }),
      });
      await loadData();
    } catch (err) {
      console.error("Review failed:", err);
    }
    setReviewing(false);
  };

  const handleAction = async (actionId: string, decision: "approved" | "rejected") => {
    try {
      const headers = await getAuthHeaders();
      await fetch("/api/ads/actions", {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ actionId, decision }),
      });
      setActions((prev) => prev.filter((a) => a.id !== actionId));
    } catch (err) {
      console.error("Action failed:", err);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-cyan/50" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Run Review */}
      <div className="flex items-center gap-3">
        <select
          value={reviewType}
          onChange={(e) => setReviewType(e.target.value)}
          className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan/30"
        >
          <option value="performance">Performance Review</option>
          <option value="copy">Copy Review</option>
          <option value="strategy">Strategy Review</option>
        </select>
        <button
          onClick={handleRunReview}
          disabled={reviewing}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-cyan/10 text-cyan hover:bg-cyan/20 border border-cyan/20 transition disabled:opacity-50"
        >
          <Brain className={`h-4 w-4 ${reviewing ? "animate-pulse" : ""}`} />
          {reviewing ? "Analyzing..." : "Run AI Review"}
        </button>
      </div>

      {/* Pending Actions */}
      {actions.length > 0 && (
        <div className="glass-strong rounded-xl border border-amber-500/20 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-semibold">Pending Suggestions ({actions.length})</h3>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {actions.map((action) => (
              <div key={action.id} className="px-4 py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-cyan/10 text-cyan font-medium">
                      {action.action_type.replace("_", " ")}
                    </span>
                    <span className="text-sm font-medium truncate">{action.target_entity}</span>
                  </div>
                  {action.old_value && action.new_value && (
                    <div className="text-xs text-muted-foreground/60 mt-1">
                      {action.old_value} → <span className="text-cyan">{action.new_value}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleAction(action.id, "approved")}
                    className="p-1.5 rounded-lg hover:bg-emerald-500/10 text-emerald-400 transition"
                    title="Approve"
                  >
                    <CheckCircle2 className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => handleAction(action.id, "rejected")}
                    className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-400 transition"
                    title="Reject"
                  >
                    <XCircle className="h-5 w-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Review History */}
      {reviews.length === 0 ? (
        <div className="text-center py-16">
          <Brain className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground mb-2">No Reviews Yet</h3>
          <p className="text-sm text-muted-foreground/60">Run an AI review to get Claude&apos;s analysis of your campaigns.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewCard({ review }: { review: AdReview }) {
  const [expanded, setExpanded] = useState(false);
  const severityIcon = {
    critical: <AlertTriangle className="h-4 w-4 text-red-400" />,
    warning: <AlertTriangle className="h-4 w-4 text-amber-400" />,
    info: <Info className="h-4 w-4 text-cyan" />,
  };

  return (
    <div className="glass-strong rounded-xl border border-white/[0.06] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-white/[0.02] transition"
      >
        <Brain className="h-5 w-5 text-cyan shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded-full bg-cyan/10 text-cyan font-medium capitalize">
              {review.review_type}
            </span>
            <span className="text-xs text-muted-foreground/40">
              {new Date(review.created_at).toLocaleDateString()}
            </span>
          </div>
          <p className="text-sm mt-1 truncate">{review.summary}</p>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground/40 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3 border-t border-white/[0.04] pt-3">
              {/* Findings */}
              {review.findings.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground/60 tracking-wide">Findings</h4>
                  {review.findings.map((f, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      {severityIcon[f.severity as keyof typeof severityIcon] ?? severityIcon.info}
                      <div>
                        <span className="font-medium">{f.title}</span>
                        <p className="text-muted-foreground/60 text-xs mt-0.5">{f.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {/* Suggestions */}
              {review.suggestions.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground/60 tracking-wide">Suggestions</h4>
                  {review.suggestions.map((s, i) => (
                    <div key={i} className="bg-white/[0.02] rounded-lg p-3 text-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-cyan/10 text-cyan">{s.action}</span>
                        <span className="font-medium">{s.target}</span>
                      </div>
                      {s.old_value && s.new_value && (
                        <div className="text-xs text-muted-foreground/60">
                          <span className="line-through">{s.old_value}</span> → <span className="text-cyan">{s.new_value}</span>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground/50 mt-1">{s.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Copy Lab Tab ────────────────────────────────────────────────────

function CopyLabTab() {
  const [ads, setAds] = useState<AdSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from("ad_snapshots") as any)
        .select("*")
        .not("ad_id", "is", null)
        .order("impressions", { ascending: false })
        .limit(20);
      setAds(data ?? []);
      setLoading(false);
    })();
  }, []);

  const handleCopyReview = async () => {
    setReviewing(true);
    try {
      const headers = await getAuthHeaders();
      await fetch("/api/ads/review", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ reviewType: "copy" }),
      });
    } catch (err) {
      console.error("Copy review failed:", err);
    }
    setReviewing(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-cyan/50" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={handleCopyReview}
          disabled={reviewing}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-cyan/10 text-cyan hover:bg-cyan/20 border border-cyan/20 transition disabled:opacity-50"
        >
          <Sparkles className={`h-4 w-4 ${reviewing ? "animate-pulse" : ""}`} />
          {reviewing ? "Reviewing Copy..." : "Review All Copy"}
        </button>
      </div>

      {ads.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground mb-2">No Ad Copy Found</h3>
          <p className="text-sm text-muted-foreground/60">Sync your Google Ads data first to see your ad copy here.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {ads.map((ad) => (
            <div key={ad.id} className="glass-strong rounded-xl border border-white/[0.06] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground/60">{ad.campaign_name} &gt; {ad.ad_group_name}</span>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-cyan">{Number(ad.clicks).toLocaleString()} clicks</span>
                  <span className="text-muted-foreground/40">&middot;</span>
                  <span>{fmtPct(Number(ad.ctr ?? 0))} CTR</span>
                </div>
              </div>
              <div className="space-y-1.5">
                {[ad.headline1, ad.headline2, ad.headline3].filter(Boolean).map((h, i) => (
                  <div key={i} className="text-sm font-medium text-blue-400">{h}</div>
                ))}
                {[ad.description1, ad.description2].filter(Boolean).map((d, i) => (
                  <div key={i} className="text-xs text-muted-foreground/70">{d}</div>
                ))}
              </div>
              <div className="flex gap-3 text-xs text-muted-foreground/50 pt-1 border-t border-white/[0.04]">
                <span>{Number(ad.impressions).toLocaleString()} impr.</span>
                <span>{Number(ad.conversions ?? 0).toFixed(1)} conv.</span>
                <span>{fmt$(Number(ad.cost ?? 0))} spent</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Landing Page Tab ────────────────────────────────────────────────

function LandingTab() {
  const [review, setReview] = useState<AdReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from("ad_reviews") as any)
        .select("*")
        .eq("review_type", "landing_page")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      setReview(data ?? null);
      setLoading(false);
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
        // Reload
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">dominionhomedeals.com</h3>
          <p className="text-xs text-muted-foreground/60">Landing page conversion analysis</p>
        </div>
        <button
          onClick={handleReview}
          disabled={reviewing}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-cyan/10 text-cyan hover:bg-cyan/20 border border-cyan/20 transition disabled:opacity-50"
        >
          <Globe className={`h-4 w-4 ${reviewing ? "animate-spin" : ""}`} />
          {reviewing ? "Analyzing..." : "Review Landing Page"}
        </button>
      </div>

      {!review ? (
        <div className="text-center py-16">
          <Globe className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground mb-2">No Landing Page Review</h3>
          <p className="text-sm text-muted-foreground/60">Click &ldquo;Review Landing Page&rdquo; to have Claude analyze dominionhomedeals.com.</p>
        </div>
      ) : (
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
      )}
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

function ChatTab() {
  const { currentUser } = useSentinelStore();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
          } catch { /* skip malformed */ }
        }
      }

      setMessages((prev) => {
        saveChatHistory(prev);
        return prev;
      });
    } catch (err) {
      console.error("[Ads/Chat]", err);
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          ...copy[copy.length - 1],
          content: "Sorry, something went wrong. Please try again.",
        };
        return copy;
      });
    }

    setStreaming(false);
  }, [input, streaming, messages]);

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
