"use client";

/**
 * SellerMemoryPanel — Phase 2
 *
 * Surfaces seller context during a live call. Reads only from the
 * session's context_snapshot (captured at call start via crm-bridge).
 * Zero additional DB queries during the call — all data was snapshotted
 * when the session was created.
 *
 * Use cases:
 *   - Remind Logan what was said on the last call
 *   - Show qualification signals already captured
 *   - Show how many times this seller has been called
 *
 * BOUNDARY: This component may only receive a CRMLeadContext-shaped prop
 * or fetch from /api/dialer/v1/sessions/[id]/context (which reads
 * call_sessions.context_snapshot — dialer-owned table only).
 * It MUST NOT query CRM tables directly.
 */

import { useState, useEffect } from "react";
import { Brain, Phone, CalendarClock, TrendingUp, Clock, Loader2, MessageSquare, Sparkles } from "lucide-react";
import { GlassCard } from "@/components/sentinel/glass-card";
import { supabase } from "@/lib/supabase";
import type { CRMLeadContext } from "@/lib/dialer/types";

// ── Timeline label map ────────────────────────────────────────

const TIMELINE_LABELS: Record<string, string> = {
  immediate: "Immediate",
  "30_days": "30 days",
  "60_days": "60 days",
  flexible:  "Flexible",
  unknown:   "Unknown",
};

const ROUTE_LABELS: Record<string, { label: string; color: string }> = {
  offer_ready: { label: "Offer Ready",    color: "text-emerald-400" },
  follow_up:   { label: "Follow Up",      color: "text-cyan" },
  nurture:     { label: "Nurture",        color: "text-purple-400" },
  dead:        { label: "Dead",           color: "text-red-400" },
  escalate:    { label: "Escalate",       color: "text-orange-400" },
};

// ── Motivation dots ──────────────────────────────────────────

function MotivationDots({ level }: { level: number | null }) {
  if (level == null) return <span className="text-[11px] text-muted-foreground/40">—</span>;
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={`h-2 w-2 rounded-full transition-colors ${
            n <= level
              ? level >= 4 ? "bg-emerald-400" : level >= 2 ? "bg-cyan" : "bg-zinc-500"
              : "bg-white/[0.08]"
          }`}
        />
      ))}
      <span className="ml-1 text-[10px] text-muted-foreground/50">{level}/5</span>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────

export interface SellerMemoryPanelProps {
  sessionId: string;
  /** Optional: pass context directly if already loaded (avoids extra fetch) */
  context?: CRMLeadContext | null;
  className?: string;
}

// ── Component ─────────────────────────────────────────────────

export function SellerMemoryPanel({ sessionId, context: contextProp, className = "" }: SellerMemoryPanelProps) {
  const [context, setContext] = useState<CRMLeadContext | null>(contextProp ?? null);
  const [loading, setLoading] = useState(!contextProp);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (contextProp !== undefined) {
      setContext(contextProp);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    supabase.auth.getSession().then(({ data: { session } }) => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
      // Fetch session — context_snapshot is stored on the session row
      return fetch(`/api/dialer/v1/sessions/${sessionId}`, { headers });
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load session"))))
      .then((data: { session: { context_snapshot?: CRMLeadContext | null } }) => {
        if (!cancelled) {
          setContext(data.session?.context_snapshot ?? null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not load seller history");
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [sessionId, contextProp]);

  return (
    <GlassCard hover={false} className={`!p-3 border-purple-500/15 ${className}`}>
      <div className="flex items-center gap-1.5 mb-2.5">
        <Brain className="h-3 w-3 text-purple-400" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-400/80">
          Seller Memory
        </span>
        {loading && <Loader2 className="h-2.5 w-2.5 animate-spin text-purple-400/40 ml-auto" />}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/30" />
        </div>
      )}

      {error && !loading && (
        <p className="text-[11px] text-muted-foreground/40 italic">{error}</p>
      )}

      {!loading && !error && context && (
        <div className="space-y-2.5">
          {/* Call history row */}
          <div className="grid grid-cols-3 gap-1.5">
            <div className="rounded-[8px] bg-white/[0.03] border border-white/[0.04] p-2 text-center">
              <div className="flex items-center justify-center gap-0.5 mb-0.5">
                <Phone className="h-2.5 w-2.5 text-cyan/60" />
              </div>
              <p className="text-sm font-bold text-foreground">{context.totalCalls}</p>
              <p className="text-[9px] text-muted-foreground/50 uppercase">Calls</p>
            </div>
            <div className="rounded-[8px] bg-white/[0.03] border border-white/[0.04] p-2 text-center">
              <div className="flex items-center justify-center gap-0.5 mb-0.5">
                <TrendingUp className="h-2.5 w-2.5 text-emerald-400/60" />
              </div>
              <p className="text-sm font-bold text-foreground">{context.liveAnswers}</p>
              <p className="text-[9px] text-muted-foreground/50 uppercase">Answered</p>
            </div>
            <div className="rounded-[8px] bg-white/[0.03] border border-white/[0.04] p-2 text-center">
              <div className="flex items-center justify-center gap-0.5 mb-0.5">
                <Clock className="h-2.5 w-2.5 text-orange-400/60" />
              </div>
              <p className="text-[10px] font-semibold text-foreground truncate">
                {context.lastCallDate
                  ? new Date(context.lastCallDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  : "—"}
              </p>
              <p className="text-[9px] text-muted-foreground/50 uppercase">Last</p>
            </div>
          </div>

          {/* Last disposition */}
          {context.lastCallDisposition && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground/50">Last outcome</span>
              <span className="font-medium capitalize text-foreground/80">
                {context.lastCallDisposition.replace(/_/g, " ")}
              </span>
            </div>
          )}

          {/* Scheduled callback */}
          {context.nextCallScheduledAt && (
            <div className="flex items-center gap-1.5 rounded-[8px] bg-cyan/[0.04] border border-cyan/15 px-2.5 py-1.5">
              <CalendarClock className="h-3 w-3 text-cyan/60 shrink-0" />
              <span className="text-[11px] text-cyan/80">
                Callback:{" "}
                {new Date(context.nextCallScheduledAt).toLocaleDateString("en-US", {
                  month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                })}
              </span>
            </div>
          )}

          {/* Qualification signals */}
          {(context.motivationLevel != null || context.sellerTimeline || context.qualificationRoute) && (
            <div className="space-y-1.5 pt-0.5 border-t border-white/[0.04]">
              {context.motivationLevel != null && (
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground/50">Motivation</span>
                  <MotivationDots level={context.motivationLevel} />
                </div>
              )}
              {context.sellerTimeline && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground/50">Timeline</span>
                  <span className="text-foreground/80 font-medium">
                    {TIMELINE_LABELS[context.sellerTimeline] ?? context.sellerTimeline}
                  </span>
                </div>
              )}
              {context.qualificationRoute && ROUTE_LABELS[context.qualificationRoute] && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground/50">Route</span>
                  <span className={`font-semibold ${ROUTE_LABELS[context.qualificationRoute].color}`}>
                    {ROUTE_LABELS[context.qualificationRoute].label}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Last-call content — operator notes first, AI summary as labeled fallback */}
          {(context.lastCallNotes || context.lastCallAiSummary) && (
            <div className="pt-0.5 border-t border-white/[0.04]">
              {context.lastCallNotes ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <MessageSquare className="h-2.5 w-2.5 text-cyan/50 shrink-0" />
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-cyan/50">
                      Last call
                    </span>
                  </div>
                  <p className="text-[11px] text-foreground/75 leading-relaxed line-clamp-4">
                    {context.lastCallNotes}
                  </p>
                </div>
              ) : context.lastCallAiSummary ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <Sparkles className="h-2.5 w-2.5 text-purple-400/50 shrink-0" />
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-purple-400/50">
                      AI summary (unreviewed)
                    </span>
                  </div>
                  <p className="text-[11px] text-foreground/55 leading-relaxed italic line-clamp-4">
                    {context.lastCallAiSummary}
                  </p>
                </div>
              ) : null}
            </div>
          )}

          {/* Empty state */}
          {context.totalCalls === 0 && !context.motivationLevel && !context.sellerTimeline && (
            <p className="text-[11px] text-muted-foreground/40 italic text-center py-1">
              First contact — no prior history
            </p>
          )}
        </div>
      )}

      {!loading && !error && !context && (
        <p className="text-[11px] text-muted-foreground/40 italic">No seller context available</p>
      )}
    </GlassCard>
  );
}
