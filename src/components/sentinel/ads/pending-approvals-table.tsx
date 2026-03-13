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
}

interface PendingApprovalsTableProps {
  onDecision?: (id: string, decision: "approved" | "rejected") => void;
}

export function PendingApprovalsTable({ onDecision }: PendingApprovalsTableProps) {
  const [recommendations, setRecommendations] = useState<PendingRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"needs_review" | "approved">("needs_review");
  const [simulationResult, setSimulationResult] = useState<{ id: string; success: boolean; message: string } | null>(null);

  const fetchApprovals = useCallback(async (status: "pending" | "approved" = "pending") => {
    setLoading(true);
    setError(null);
    setSimulationResult(null);
    try {
      const { data: { session } } = await (await import("@/lib/supabase")).supabase.auth.getSession();
      const res = await fetch(`/api/ads/approvals?status=${status}`, {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
      });
      
      if (!res.ok) throw new Error("Failed to fetch recommendations");
      
      const { data } = await res.json();
      setRecommendations(data || []);
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

  const handleSimulate = async (id: string) => {
    setProcessingId(id);
    setSimulationResult(null);
    try {
      const { data: { session } } = await (await import("@/lib/supabase")).supabase.auth.getSession();
      const res = await fetch("/api/ads/gateway/simulate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: session?.access_token ? `Bearer ${session.access_token}` : ""
        },
        body: JSON.stringify({ recommendationId: id })
      });

      const data = await res.json();
      setSimulationResult({ id, success: data.ok, message: data.message });
      
      if (!data.ok) {
        console.warn("[Simulator] Simulation failed:", data.code, data.message);
      }
    } catch (err) {
      console.error("[Simulator] Connection error:", err);
      setSimulationResult({ id, success: false, message: "Network error during simulation." });
    } finally {
      setProcessingId(null);
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
        // Stale or already decided
        alert("Action failed: This recommendation is stale or was already decided by another operator.");
        setRecommendations(prev => prev.filter(r => r.id !== id));
      } else if (!res.ok) {
        throw new Error("Decision failed");
      } else {
        // Success: Remove from list
        setRecommendations(prev => prev.filter(r => r.id !== id));
        if (onDecision) onDecision(id, decision);
      }
    } catch (err) {
      console.error("[PendingApprovals] Decision error:", err);
      alert("Failed to submit decision. Please try again.");
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
          Approved (Dry-Run Ready)
        </button>
      </div>

      <div className="space-y-4">
      <div className="relative overflow-hidden rounded-xl bg-amber-500/5 border border-amber-500/20 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold text-amber-400 uppercase tracking-wider">
              {activeView === "needs_review" ? "Approval Sandbox Mode" : "Dry-Run Simulation Mode"}
            </h4>
            <p className="text-xs text-amber-400/70 mt-1 leading-relaxed">
              {activeView === "needs_review" 
                ? "Decisions made here are recorded in the audit ledger but DO NOT execute changes in Google Ads."
                : "Simulation proved the orchestration logic works but DID NOT make any real changes to Google Ads."}
              <br />
              <strong>Read-Only Environment.</strong>
            </p>
          </div>
        </div>
        <div className="absolute top-0 right-0 p-1">
          <div className="text-[10px] font-mono text-amber-500/20 uppercase font-black rotate-12 translate-x-1 -translate-y-1 select-none">
            {activeView === "needs_review" ? "Draft Only" : "Simulation"}
          </div>
        </div>
      </div>
      </div>

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
              : "Approve a recommendation to prepare it for simulation."}
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
                    {activeView === "needs_review" ? "Actions" : "Execution Test"}
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
                          <span className="text-[11px] text-muted-foreground/50 font-mono">
                            ID: {rec.related_keyword_id || rec.related_ad_group_id || rec.related_campaign_id}
                          </span>
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
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleDecision(rec.id, "approved")}
                                disabled={!!processingId}
                                className={`p-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all ${processingId === rec.id ? "opacity-50 animate-pulse" : ""}`}
                                title="Record Approval"
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
                          ) : (
                            <div className="flex flex-col items-end gap-1.5">
                              <button
                                onClick={() => handleSimulate(rec.id)}
                                disabled={!!processingId}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/[0.06] bg-white/[0.04] text-[11px] font-bold uppercase tracking-wider hover:bg-white/[0.08] transition-all ${processingId === rec.id ? "opacity-50" : ""}`}
                              >
                                {processingId === rec.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Zap className="h-3.5 w-3.5 text-amber-400" />
                                )}
                                Run Dry-Run
                              </button>
                              
                              {simulationResult?.id === rec.id && (
                                <motion.div 
                                  initial={{ opacity: 0, y: 5 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                                    simulationResult.success ? "text-emerald-400 bg-emerald-400/10" : "text-amber-400 bg-amber-400/10"
                                  }`}
                                >
                                  {simulationResult.success ? "Simulated Successfully" : simulationResult.message}
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
