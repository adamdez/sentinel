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

  const riskColors = {
    green: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    yellow: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    red: "text-red-400 bg-red-500/10 border-red-500/20"
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-cyan/50" />
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
              ? "bg-cyan/10 text-cyan border border-cyan/20 shadow-lg shadow-cyan/5"
              : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
          }`}
        >
          Needs Review
        </button>
        <button
          onClick={() => setActiveView("approved")}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeView === "approved"
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-lg shadow-emerald-500/5"
              : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
          }`}
        >
          Approved (Execute)
        </button>
      </div>

      <div className="space-y-4">
      <div className="relative overflow-hidden rounded-xl bg-cyan/5 border border-cyan/20 p-4">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-cyan shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold text-cyan uppercase tracking-wider">
              {activeView === "needs_review" ? "Review Queue" : "Execution Queue"}
            </h4>
            <p className="text-xs text-cyan/70 mt-1 leading-relaxed">
              {activeView === "needs_review"
                ? "Approve or reject recommendations. Approved items move to the execution queue."
                : "Execute approved changes in Google Ads. Red-risk items require typed CONFIRM."}
            </p>
          </div>
        </div>
      </div>
      </div>

      {decisionError && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {decisionError}
          <button onClick={() => setDecisionError(null)} className="ml-auto text-red-400/60 hover:text-red-400">&#x2715;</button>
        </div>
      )}

      {error ? (
        <div className="text-center py-12 border border-white/[0.06] rounded-xl bg-white/[0.02]">
          <XCircle className="h-10 w-10 text-red-400 mx-auto mb-3 opacity-50" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            onClick={() => fetchApprovals(activeView === "needs_review" ? "pending" : "approved")}
            className="mt-4 text-xs text-cyan hover:underline"
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
              <Clock className="h-4 w-4 text-cyan" />
              {activeView === "needs_review" ? "Actionable Recommendations" : "Approved Recommendations"}
            </h3>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] text-muted-foreground/60 uppercase tracking-widest font-bold">
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
                          <span className="text-[10px] font-bold uppercase tracking-wider text-cyan/70">
                            {rec.market}
                          </span>
                          <span className="font-semibold text-foreground/90">
                            {rec.related_keyword_id ? "Keyword" : rec.related_ad_group_id ? "Ad Group" : "Campaign"}
                          </span>
                          <span className="text-[11px] text-foreground/60 truncate max-w-[180px]" title={rec.entity_name}>
                            {rec.entity_name && rec.entity_name !== "Unknown" && rec.entity_name !== "Unknown keyword"
                              ? rec.entity_name
                              : null}
                          </span>
                          {rec.campaign_name && rec.related_keyword_id && (
                            <span className="text-[10px] text-muted-foreground/40 truncate max-w-[180px]">
                              in {rec.campaign_name}
                            </span>
                          )}
                          {rec.executable === false && (
                            <span className="text-[10px] text-amber-400 flex items-center gap-1 mt-0.5">
                              <AlertTriangle className="h-3 w-3" />
                              No Google Ads ID — needs sync
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="flex flex-col gap-1 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.03] group-hover:border-white/[0.06] transition-colors">
                          <span className="text-xs font-bold text-cyan capitalize flex items-center gap-1.5">
                            {rec.recommendation_type.replace(/_/g, " ")}
                          </span>
                          <p className="text-[11px] text-foreground/70 leading-relaxed italic">
                            &quot;{rec.expected_impact}&quot;
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <p className="text-[11px] text-muted-foreground/70 leading-relaxed line-clamp-3 hover:line-clamp-none transition-all cursor-default">
                          {rec.reason}
                        </p>
                      </td>
                      <td className="px-4 py-4 align-top text-center">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${riskColors[rec.risk_level]}`}>
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
                                  className={`p-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all ${processingId === rec.id ? "opacity-50 animate-pulse" : ""}`}
                                  title="Approve"
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleDecision(rec.id, "rejected")}
                                  disabled={!!processingId}
                                  className={`p-2 rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all ${processingId === rec.id ? "opacity-50" : ""}`}
                                  title="Reject"
                                >
                                  <XCircle className="h-4 w-4" />
                                </button>
                              </div>
                              {rec.executable === false && (
                                <span className="text-[9px] text-amber-400/70">
                                  ⚠ Not executable yet — needs sync
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col items-end gap-1.5">
                              {executedIds.has(rec.id) ? (
                                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Executed
                                </span>
                              ) : rec.executable === false ? (
                                <div className="flex flex-col items-end gap-1">
                                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 text-[10px] text-amber-400">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    Can&apos;t execute — missing Google Ads entity
                                  </span>
                                  <span className="text-[9px] text-muted-foreground/40">
                                    Run a fresh sync, then re-run Key Intel
                                  </span>
                                </div>
                              ) : confirmingId === rec.id ? (
                                <div className="flex flex-col items-end gap-1.5">
                                  <p className="text-[10px] text-red-400 font-medium">Type CONFIRM to execute red-risk change</p>
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="text"
                                      value={confirmText}
                                      onChange={(e) => setConfirmText(e.target.value)}
                                      placeholder="CONFIRM"
                                      className="w-24 px-2 py-1 rounded border border-red-500/30 bg-red-500/5 text-xs text-foreground placeholder:text-red-400/40 focus:outline-none focus:border-red-500/60"
                                      autoFocus
                                    />
                                    <button
                                      onClick={() => handleExecute(rec.id, confirmText)}
                                      disabled={confirmText !== "CONFIRM" || !!processingId}
                                      className={`px-3 py-1 rounded-lg border text-[11px] font-bold uppercase tracking-wider transition-all ${
                                        confirmText === "CONFIRM"
                                          ? "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                                          : "border-white/[0.06] bg-white/[0.02] text-muted-foreground/40 cursor-not-allowed"
                                      }`}
                                    >
                                      Execute
                                    </button>
                                    <button
                                      onClick={() => { setConfirmingId(null); setConfirmText(""); }}
                                      className="px-2 py-1 rounded-lg border border-white/[0.06] bg-white/[0.02] text-[11px] text-muted-foreground/60 hover:text-foreground transition-all"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleExecute(rec.id)}
                                  disabled={!!processingId}
                                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[11px] font-bold uppercase tracking-wider transition-all ${
                                    processingId === rec.id ? "opacity-50" : ""
                                  } ${
                                    rec.risk_level === "red"
                                      ? "border-amber-500/20 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                                      : "border-cyan/20 bg-cyan/10 text-cyan hover:bg-cyan/20"
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
                                  className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                                    executionResult.success
                                      ? "text-emerald-400 bg-emerald-400/10"
                                      : "text-red-400 bg-red-400/10"
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
