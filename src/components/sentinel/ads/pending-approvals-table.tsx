"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Loader2,
  Zap,
  Target,
  BarChart3,
  MousePointerClick,
  Clock
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface PendingRecommendation {
  id: string;
  recommendation_type: string;
  risk_level: "green" | "yellow" | "red";
  expected_impact: string;
  reason: string;
  market: string;
  created_at: string;
  related_campaign_id?: number;
  related_ad_group_id?: number;
  related_keyword_id?: number;
  entity_name?: string;
  campaign_name?: string;
  executable?: boolean;
  metadata?: Record<string, unknown> | null;
}

interface PendingApprovalsTableProps {
  onDecision?: (id: string, decision: "approved" | "rejected") => void;
}

export function PendingApprovalsTable({ onDecision }: PendingApprovalsTableProps) {
  const [recommendations, setRecommendations] = useState<PendingRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"needs_review" | "approved">("needs_review");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [executionResult, setExecutionResult] = useState<{ id: string; success: boolean; message: string } | null>(null);
  const [executedIds, setExecutedIds] = useState<Set<string>>(new Set());
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchResult, setBatchResult] = useState<string | null>(null);

  const fetchApprovals = useCallback(async (status: "pending" | "approved" = "pending") => {
    setLoading(true);
    setError(null);
    setExecutionResult(null);
    setDecisionError(null);
    try {
      const { supabase } = await import("@/lib/supabase");
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/ads/approvals?status=${status}`, {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
      });

      if (!res.ok) throw new Error("Failed to fetch recommendations");

      const { data } = await res.json();
      const recs: PendingRecommendation[] = data || [];
      setRecommendations(recs);
    } catch (err) {
      console.error("[PendingApprovals] Fetch error:", err);
      setError("Could not load pending approvals.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApprovals(activeView === "needs_review" ? "pending" : "approved");
  }, [fetchApprovals, activeView]);

  const handleExecute = async (id: string, confirmation?: string) => {
    setProcessingId(id);
    setExecutionResult(null);
    try {
      const { data: { session } } = await (await import("@/lib/supabase")).supabase.auth.getSession();
      const res = await fetch("/api/ads/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: session?.access_token ? `Bearer ${session.access_token}` : ""
        },
        body: JSON.stringify({ recommendationId: id, ...(confirmation ? { confirmation } : {}) })
      });

      const data = await res.json();

      if (res.status === 400 && data.requiresConfirmation) {
        setConfirmingId(id);
        setConfirmText("");
        setProcessingId(null);
        return;
      }

      if (res.status === 409) {
        setExecutionResult({ id, success: false, message: data.error || "Recommendation is stale. Re-run intel for fresh recommendations." });
      } else if (data.ok) {
        setExecutionResult({ id, success: true, message: `Successfully executed: ${data.executed}` });
        setExecutedIds((prev) => new Set([...prev, id]));
        // Remove from list after brief delay
        setTimeout(() => {
          setRecommendations(prev => prev.filter(r => r.id !== id));
          setExecutionResult(null);
        }, 2000);
      } else {
        setExecutionResult({ id, success: false, message: data.error || "Execution failed" });
      }
    } catch (err) {
      console.error("[Execute] Connection error:", err);
      setExecutionResult({ id, success: false, message: "Network error during execution." });
    } finally {
      setProcessingId(null);
      setConfirmingId(null);
      setConfirmText("");
    }
  };

  const handleDecision = async (id: string, decision: "approved" | "rejected") => {
    setProcessingId(id);
    try {
      const { data: { session } } = await (await import("@/lib/supabase")).supabase.auth.getSession();
      const res = await fetch("/api/ads/approvals", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: session?.access_token ? `Bearer ${session.access_token}` : ""
        },
        body: JSON.stringify({ recommendationId: id, decision })
      });

      if (res.status === 409) {
        // Stale or already decided — remove silently and surface inline
        setRecommendations(prev => prev.filter(r => r.id !== id));
        setDecisionError("This recommendation is stale or was already decided by another operator.");
      } else if (!res.ok) {
        setDecisionError("Failed to submit decision. Please try again.");
      } else {
        // Success: Remove from list
        setDecisionError(null);
        setRecommendations(prev => prev.filter(r => r.id !== id));
        if (onDecision) onDecision(id, decision);
      }
    } catch (err) {
      console.error("[PendingApprovals] Decision error:", err);
      setDecisionError("Failed to submit decision. Please try again.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleBatchApprove = async (riskLevel?: string) => {
    setBatchProcessing(true);
    setBatchResult(null);
    try {
      const { supabase } = await import("@/lib/supabase");
      const { data: { session } } = await supabase.auth.getSession();

      const payload: Record<string, unknown> = { decision: "approved" };
      if (riskLevel) {
        payload.filter = { risk_level: riskLevel };
      } else {
        // Approve all currently visible
        payload.ids = recommendations.map(r => r.id);
      }

      const res = await fetch("/api/ads/approvals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: session?.access_token ? `Bearer ${session.access_token}` : ""
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.ok) {
        setBatchResult(`Approved ${data.count} recommendations`);
        // Refresh the list
        setTimeout(() => {
          fetchApprovals("pending");
          setBatchResult(null);
        }, 1500);
      } else {
        setBatchResult(`Error: ${data.error}`);
      }
    } catch (err) {
      console.error("[BatchApprove] Error:", err);
      setBatchResult("Network error during batch approve");
    } finally {
      setBatchProcessing(false);
    }
  };

  const handleBatchExecute = async () => {
    setBatchProcessing(true);
    setBatchResult(null);
    let executed = 0;
    let failed = 0;

    // Sort: ad_group_create first (must exist before keywords), then negatives, then keywords
    const typeOrder: Record<string, number> = { ad_group_create: 0, negative_add: 1, keyword_add: 2 };
    const executableRecs = recommendations
      .filter(r => r.executable !== false && !executedIds.has(r.id))
      .sort((a, b) => (typeOrder[a.recommendation_type] ?? 99) - (typeOrder[b.recommendation_type] ?? 99));

    for (const rec of executableRecs) {
      try {
        const { supabase } = await import("@/lib/supabase");
        const { data: { session } } = await supabase.auth.getSession();

        // Skip red-risk (requires manual confirmation) and non-mutating types
        if (rec.risk_level === "red") continue;
        if (isNonMutating(rec.recommendation_type)) continue;

        const res = await fetch("/api/ads/execute", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: session?.access_token ? `Bearer ${session.access_token}` : ""
          },
          body: JSON.stringify({ recommendationId: rec.id })
        });

        const data = await res.json();
        if (data.ok) {
          executed++;
          setExecutedIds(prev => new Set([...prev, rec.id]));
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    setBatchResult(`Executed ${executed} in Google Ads${failed > 0 ? ` (${failed} failed)` : ""}`);
    // Refresh after a delay
    setTimeout(() => {
      fetchApprovals("approved");
      setBatchResult(null);
    }, 2500);
    setBatchProcessing(false);
  };

  const nonMutatingTypes = ["copy_suggestion", "waste_flag", "opportunity_flag"];
  const isNonMutating = (type: string) => nonMutatingTypes.includes(type);

  const handleDismiss = async (id: string) => {
    setProcessingId(id);
    try {
      const { supabase } = await import("@/lib/supabase");
      // Directly update the recommendation status to 'ignored' via Supabase
      // This works for both pending and approved recs
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("ads_recommendations") as any)
        .update({ status: "ignored" })
        .eq("id", id);
      setRecommendations(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      console.error("[Dismiss] Error:", err);
    } finally {
      setProcessingId(null);
    }
  };

  const greenCount = recommendations.filter(r => r.risk_level === "green").length;
  const yellowCount = recommendations.filter(r => r.risk_level === "yellow").length;
  const executableCount = recommendations.filter(r => r.executable !== false && !executedIds.has(r.id) && r.risk_level !== "red" && !isNonMutating(r.recommendation_type)).length;

  const riskColors = {
    green: "text-foreground bg-muted/10 border-border/20",
    yellow: "text-foreground bg-muted/10 border-border/20",
    red: "text-foreground bg-muted/10 border-border/20"
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary/50" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* View Toggle */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] w-fit">
        <button
          onClick={() => setActiveView("needs_review")}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeView === "needs_review"
              ? "bg-primary/10 text-primary border border-primary/20 shadow-lg shadow-cyan/5"
              : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
          }`}
        >
          Needs Review
        </button>
        <button
          onClick={() => setActiveView("approved")}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeView === "approved"
              ? "bg-muted/10 text-foreground border border-border/20 shadow-lg shadow-emerald-500/5"
              : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
          }`}
        >
          Approved (Execute)
        </button>
      </div>

      <div className="space-y-4">
      <div className="relative overflow-hidden rounded-xl bg-primary/5 border border-primary/20 p-4">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold text-primary uppercase tracking-wider">
              {activeView === "needs_review" ? "Review Queue" : "Execution Queue"}
            </h4>
            <p className="text-xs text-primary/70 mt-1 leading-relaxed">
              {activeView === "needs_review"
                ? "Approve or reject recommendations. Approved items move to the execution queue."
                : "Execute approved changes in Google Ads. Red-risk items require typed CONFIRM."}
            </p>
          </div>
        </div>
      </div>
      </div>

      {/* Batch Action Buttons */}
      {recommendations.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {activeView === "needs_review" ? (
            <>
              {greenCount > 0 && (
                <button
                  onClick={() => handleBatchApprove("green")}
                  disabled={batchProcessing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/20 bg-muted/10 text-foreground text-sm font-bold uppercase tracking-wider hover:bg-muted/20 transition-all disabled:opacity-50"
                >
                  {batchProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                  Approve All Green ({greenCount})
                </button>
              )}
              {yellowCount > 0 && (
                <button
                  onClick={() => handleBatchApprove("yellow")}
                  disabled={batchProcessing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/20 bg-muted/10 text-foreground text-sm font-bold uppercase tracking-wider hover:bg-muted/20 transition-all disabled:opacity-50"
                >
                  {batchProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                  Approve All Yellow ({yellowCount})
                </button>
              )}
              {recommendations.length > 1 && (
                <button
                  onClick={() => handleBatchApprove()}
                  disabled={batchProcessing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/20 bg-primary/10 text-primary text-sm font-bold uppercase tracking-wider hover:bg-primary/20 transition-all disabled:opacity-50"
                >
                  {batchProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                  Approve All ({recommendations.length})
                </button>
              )}
            </>
          ) : (
            <>
              {executableCount > 0 && (
                <button
                  onClick={handleBatchExecute}
                  disabled={batchProcessing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/20 bg-primary/10 text-primary text-sm font-bold uppercase tracking-wider hover:bg-primary/20 transition-all disabled:opacity-50"
                >
                  {batchProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                  Execute All ({executableCount})
                </button>
              )}
              <span className="text-sm text-muted-foreground/40">
                Red-risk items require individual confirmation
              </span>
            </>
          )}

          {batchResult && (
            <span className={`text-sm font-medium px-2 py-1 rounded ${
              batchResult.startsWith("Error") || batchResult.includes("failed")
                ? "text-foreground bg-muted/10"
                : "text-foreground bg-muted/10"
            }`}>
              {batchResult}
            </span>
          )}
        </div>
      )}

      {decisionError && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-muted/10 border border-border/20 text-xs text-foreground">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {decisionError}
          <button onClick={() => setDecisionError(null)} className="ml-auto text-foreground/60 hover:text-foreground">&#x2715;</button>
        </div>
      )}

      {error ? (
        <div className="text-center py-12 border border-white/[0.06] rounded-xl bg-white/[0.02]">
          <XCircle className="h-10 w-10 text-foreground mx-auto mb-3 opacity-50" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            onClick={() => fetchApprovals(activeView === "needs_review" ? "pending" : "approved")}
            className="mt-4 text-xs text-primary hover:underline"
          >
            Try Again
          </button>
        </div>
      ) : recommendations.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-white/[0.08] rounded-xl">
          <Zap className="h-12 w-12 mx-auto text-muted-foreground/20 mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground/80">
            {activeView === "needs_review" ? "No Pending Approvals" : "No Approved Items"}
          </h3>
          <p className="text-sm text-muted-foreground/40 max-w-xs mx-auto mt-2">
            {activeView === "needs_review"
              ? "Run an AI Review to generate new recommendations."
              : "Approve a recommendation to queue it for execution."}
          </p>
        </div>
      ) : (
        <div className="glass-strong rounded-xl border border-white/[0.06] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              {activeView === "needs_review" ? "Actionable Recommendations" : "Approved Recommendations"}
            </h3>
            <span className="text-sm px-1.5 py-0.5 rounded bg-white/[0.04] text-muted-foreground/60 uppercase tracking-widest font-bold">
              {recommendations.length} {activeView === "needs_review" ? "pending" : "approved"}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.04] text-muted-foreground/60">
                  <th className="text-left px-4 py-3 font-medium">Market/Entity</th>
                  <th className="text-left px-4 py-3 font-medium">Recommendation</th>
                  <th className="text-left px-4 py-3 font-medium">Rationale</th>
                  <th className="text-center px-4 py-3 font-medium">Risk</th>
                  <th className="text-right px-4 py-3 font-medium">
                    {activeView === "needs_review" ? "Actions" : "Execute"}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                <AnimatePresence mode="popLayout">
                  {recommendations.map((rec) => (
                    <motion.tr
                      key={rec.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="hover:bg-white/[0.02] transition-colors group"
                    >
                      <td className="px-4 py-4 align-top">
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-bold uppercase tracking-wider text-primary/70">
                            {rec.market}
                          </span>
                          <span className="font-semibold text-foreground/90">
                            {rec.recommendation_type === "keyword_add" ? "Add Keyword" :
                             rec.recommendation_type === "negative_add" ? "Block Term" :
                             rec.recommendation_type === "ad_group_create" ? "New Ad Group" :
                             rec.related_keyword_id ? "Keyword" :
                             rec.related_ad_group_id ? "Ad Group" : "Campaign"}
                          </span>
                          <span className="text-sm text-foreground/60 truncate max-w-[180px]" title={rec.entity_name}>
                            {rec.entity_name && rec.entity_name !== "Unknown" && rec.entity_name !== "Unknown keyword"
                              ? rec.entity_name
                              : (rec.metadata?.keyword_text as string) ?? (rec.metadata?.ad_group_name as string) ?? null}
                          </span>
                          {rec.metadata?.match_type ? (
                            <span className="text-xs text-muted-foreground/40 font-mono uppercase">
                              {String(rec.metadata.match_type)}
                            </span>
                          ) : null}
                          {rec.campaign_name && rec.related_keyword_id && (
                            <span className="text-sm text-muted-foreground/40 truncate max-w-[180px]">
                              in {rec.campaign_name}
                            </span>
                          )}
                          {rec.executable === false && (
                            <span className="text-sm text-foreground flex items-center gap-1 mt-0.5">
                              <AlertTriangle className="h-3 w-3" />
                              No Google Ads ID — needs sync
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="flex flex-col gap-1 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.03] group-hover:border-white/[0.06] transition-colors">
                          <span className="text-xs font-bold text-primary capitalize flex items-center gap-1.5">
                            {rec.recommendation_type.replace(/_/g, " ")}
                          </span>
                          <p className="text-sm text-foreground/70 leading-relaxed italic">
                            &quot;{rec.expected_impact}&quot;
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <p className="text-sm text-muted-foreground/70 leading-relaxed line-clamp-3 hover:line-clamp-none transition-all cursor-default">
                          {rec.reason}
                        </p>
                      </td>
                      <td className="px-4 py-4 align-top text-center">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-sm font-bold uppercase border ${riskColors[rec.risk_level]}`}>
                          {rec.risk_level}
                        </span>
                      </td>
                      <td className="px-4 py-4 align-top text-right">
                        <div className="flex flex-col items-end gap-2">
                          {activeView === "needs_review" ? (
                            <div className="flex flex-col items-end gap-1.5">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handleDecision(rec.id, "approved")}
                                  disabled={!!processingId}
                                  className={`p-2 rounded-lg border border-border/20 bg-muted/10 text-foreground hover:bg-muted/20 transition-all ${processingId === rec.id ? "opacity-50 animate-pulse" : ""}`}
                                  title="Approve"
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleDecision(rec.id, "rejected")}
                                  disabled={!!processingId}
                                  className={`p-2 rounded-lg border border-border/20 bg-muted/10 text-foreground hover:bg-muted/20 transition-all ${processingId === rec.id ? "opacity-50" : ""}`}
                                  title="Reject"
                                >
                                  <XCircle className="h-4 w-4" />
                                </button>
                              </div>
                              {rec.executable === false && (
                                <span className="text-xs text-foreground/70">
                                  ⚠ Not executable yet — needs sync
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col items-end gap-1.5">
                              {executedIds.has(rec.id) ? (
                                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/20 bg-muted/10 text-sm font-bold uppercase tracking-wider text-foreground">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Executed
                                </span>
                              ) : isNonMutating(rec.recommendation_type) ? (
                                <div className="flex flex-col items-end gap-1.5">
                                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] text-sm text-muted-foreground/60">
                                    <Info className="h-3.5 w-3.5" />
                                    Informational — no action needed
                                  </span>
                                  <button
                                    onClick={() => handleDismiss(rec.id)}
                                    disabled={!!processingId}
                                    className="text-sm text-muted-foreground/40 hover:text-foreground transition-colors"
                                  >
                                    Dismiss
                                  </button>
                                </div>
                              ) : rec.executable === false ? (
                                <div className="flex flex-col items-end gap-1">
                                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/20 bg-muted/5 text-sm text-foreground">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    Can&apos;t execute — missing Google Ads entity
                                  </span>
                                  <button
                                    onClick={() => handleDismiss(rec.id)}
                                    disabled={!!processingId}
                                    className="text-sm text-muted-foreground/40 hover:text-foreground transition-colors"
                                  >
                                    Dismiss
                                  </button>
                                </div>
                              ) : confirmingId === rec.id ? (
                                <div className="flex flex-col items-end gap-1.5">
                                  <p className="text-sm text-foreground font-medium">Type CONFIRM to execute red-risk change</p>
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="text"
                                      value={confirmText}
                                      onChange={(e) => setConfirmText(e.target.value)}
                                      placeholder="CONFIRM"
                                      className="w-24 px-2 py-1 rounded border border-border/30 bg-muted/5 text-xs text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-border/60"
                                      autoFocus
                                    />
                                    <button
                                      onClick={() => handleExecute(rec.id, confirmText)}
                                      disabled={confirmText !== "CONFIRM" || !!processingId}
                                      className={`px-3 py-1 rounded-lg border text-sm font-bold uppercase tracking-wider transition-all ${
                                        confirmText === "CONFIRM"
                                          ? "border-border/30 bg-muted/10 text-foreground hover:bg-muted/20"
                                          : "border-white/[0.06] bg-white/[0.02] text-muted-foreground/40 cursor-not-allowed"
                                      }`}
                                    >
                                      Execute
                                    </button>
                                    <button
                                      onClick={() => { setConfirmingId(null); setConfirmText(""); }}
                                      className="px-2 py-1 rounded-lg border border-white/[0.06] bg-white/[0.02] text-sm text-muted-foreground/60 hover:text-foreground transition-all"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleExecute(rec.id)}
                                  disabled={!!processingId}
                                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-bold uppercase tracking-wider transition-all ${
                                    processingId === rec.id ? "opacity-50" : ""
                                  } ${
                                    rec.risk_level === "red"
                                      ? "border-border/20 bg-muted/10 text-foreground hover:bg-muted/20"
                                      : "border-primary/20 bg-primary/10 text-primary hover:bg-primary/20"
                                  }`}
                                >
                                  {processingId === rec.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Zap className="h-3.5 w-3.5" />
                                  )}
                                  Execute in Google Ads
                                </button>
                              )}

                              {executionResult?.id === rec.id && !executedIds.has(rec.id) && (
                                <motion.div
                                  initial={{ opacity: 0, y: 5 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  className={`text-sm font-medium px-2 py-0.5 rounded ${
                                    executionResult.success
                                      ? "text-foreground bg-muted/10"
                                      : "text-foreground bg-muted/10"
                                  }`}
                                >
                                  {executionResult.message}
                                </motion.div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
