"use client";

/**
 * /settings/outbound-pilot — Outbound Pilot Preparation Surface
 *
 * Adam-only review surface for evaluating future AI-assisted outbound
 * warm-transfer pilot readiness. NEVER places live calls.
 *
 * Surfaces:
 *   1. Pilot status banner (prep_only — always shown, cannot be changed here)
 *   2. Readiness summary: total frames, ready %, top fallback reasons
 *   3. Frame queue: filterable list of assembled prep frames with review controls
 *   4. Config notes: what would need to change to enable a live pilot
 *
 * BOUNDARY: No Twilio. No outbound calls. No cron. Read/review only.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ShieldAlert, ArrowLeft, RefreshCw, Loader2,
  CheckCircle2, XCircle, AlertTriangle, BarChart2,
  Filter, ChevronRight, Phone, FileText,
} from "lucide-react";
import { PageShell }        from "@/components/sentinel/page-shell";
import { GlassCard }        from "@/components/sentinel/glass-card";
import { Button }           from "@/components/ui/button";
import { Badge }            from "@/components/ui/badge";
import { OutboundPrepCard } from "@/components/sentinel/outbound-prep-card";
import type { PrepFrameCardRow } from "@/components/sentinel/outbound-prep-card";
import {
  derivePilotReadiness,
  PREP_FRAME_REVIEW_STATUS_LABELS,
  PREP_FRAME_REVIEW_STATUS_COLORS,
  type PrepFrameReviewStatus,
  type PilotReadinessSummary,
} from "@/lib/outbound-prep";
import { TRUST_LANGUAGE_VERSION } from "@/lib/trust-language";
import { getAllSellerPages }      from "@/lib/public-pages";
import { supabase }              from "@/lib/supabase";

// ── Auth helper ───────────────────────────────────────────────────────────────

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (session?.access_token) h["Authorization"] = `Bearer ${session.access_token}`;
  return h;
}

// ── Pilot status banner ───────────────────────────────────────────────────────

function PilotStatusBanner() {
  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex items-start gap-3">
      <ShieldAlert className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
      <div className="space-y-1 min-w-0">
        <p className="text-sm font-semibold text-amber-300">
          PREP ONLY — No live calls
        </p>
        <p className="text-xs text-amber-400/70 leading-relaxed">
          This surface assembles and reviews hypothetical outbound warm-transfer prep frames.
          No calls are placed, no Twilio connections are initiated, and no autonomous outbound
          automation is active. Activating a live pilot requires an explicit database migration,
          code change, and operator authorization.
        </p>
      </div>
    </div>
  );
}

// ── Readiness summary ─────────────────────────────────────────────────────────

function ReadinessSummaryCard({ summary }: { summary: PilotReadinessSummary }) {
  return (
    <GlassCard className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <BarChart2 className="w-4 h-4 text-muted-foreground/50" />
        <h3 className="text-sm font-semibold text-foreground/80">Pilot Readiness Summary</h3>
        <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-400 bg-amber-500/5">
          Hypothetical
        </Badge>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total frames",     value: summary.totalFrames,    color: "" },
          { label: "Ready",            value: summary.readyFrames,    color: "text-emerald-400" },
          { label: "Not ready",        value: summary.notReadyFrames, color: "text-red-400" },
          { label: "Ready %",          value: summary.readyPct != null ? `${summary.readyPct}%` : "—", color: summary.readyPct != null && summary.readyPct >= 60 ? "text-emerald-400" : "text-amber-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white/[0.02] rounded-lg p-2.5 space-y-0.5">
            <p className={`text-lg font-bold ${color || "text-foreground/80"}`}>{value}</p>
            <p className="text-[10px] text-muted-foreground/50">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Pending review", value: summary.pendingReview,  color: "text-muted-foreground/70" },
          { label: "Approved",       value: summary.approvedFrames, color: "text-emerald-400" },
          { label: "Flagged",        value: summary.flaggedFrames,  color: "text-amber-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white/[0.02] rounded-lg p-2 space-y-0.5">
            <p className={`text-base font-semibold ${color}`}>{value}</p>
            <p className="text-[10px] text-muted-foreground/50">{label}</p>
          </div>
        ))}
      </div>

      {summary.topFallbackReasons.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase text-muted-foreground/40 tracking-wide">Top not-ready reasons</p>
          <div className="space-y-1">
            {summary.topFallbackReasons.map(({ reason, count }) => (
              <div key={reason} className="flex items-start gap-2 text-[10px]">
                <XCircle className="w-2.5 h-2.5 text-red-400/60 mt-0.5 flex-shrink-0" />
                <span className="text-muted-foreground/70 flex-1 leading-snug">{reason}</span>
                <span className="text-muted-foreground/40">{count}×</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </GlassCard>
  );
}

// ── Pilot config notes ────────────────────────────────────────────────────────

function PilotConfigNotes() {
  const pages = getAllSellerPages();
  return (
    <GlassCard className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-muted-foreground/50" />
        <h3 className="text-sm font-semibold text-foreground/80">What changes for a live pilot</h3>
      </div>
      <div className="space-y-2 text-xs text-muted-foreground/70 leading-relaxed">
        <p>
          The following must be explicitly completed before any autonomous outbound calls are placed.
          This list is not exhaustive — it is the minimum known gate.
        </p>
        <ol className="list-decimal list-inside space-y-1.5 pl-1">
          <li>
            <span className="font-medium text-muted-foreground/80">Database migration</span> — alter{" "}
            <code className="text-[10px] bg-white/[0.05] px-1 rounded">outbound_prep_frames.automation_tier</code>{" "}
            check constraint to allow <code className="text-[10px] bg-white/[0.05] px-1 rounded">live_pilot</code>.
          </li>
          <li>
            <span className="font-medium text-muted-foreground/80">Voice registry</span> — register an{" "}
            active <code className="text-[10px] bg-white/[0.05] px-1 rounded">outbound_opener</code>{" "}
            script version in{" "}
            <Link href="/settings/voice-registry" className="text-blue-400 hover:underline">
              voice registry
            </Link>
            .
          </li>
          <li>
            <span className="font-medium text-muted-foreground/80">Voice consent review</span> — all outbound
            leads must have <code className="text-[10px] bg-white/[0.05] px-1 rounded">consent_basis</code>{" "}
            reviewed in the{" "}
            <Link href="/dialer/review" className="text-blue-400 hover:underline">
              voice ledger
            </Link>
            .
          </li>
          <li>
            <span className="font-medium text-muted-foreground/80">Trust language version</span> — current
            approved version is{" "}
            <code className="text-[10px] bg-white/[0.05] px-1 rounded">{TRUST_LANGUAGE_VERSION}</code>.
            Review snippets at{" "}
            <Link href="/settings/trust-language" className="text-blue-400 hover:underline">
              trust language settings
            </Link>
            .
          </li>
          <li>
            <span className="font-medium text-muted-foreground/80">Public pages live</span> — seller trust
            pages must be deployed before outbound links are sent. Current pages:{" "}
            {pages.map((p, i) => (
              <span key={p.key}>
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                  {p.label}
                </a>
                {i < pages.length - 1 ? ", " : ""}
              </span>
            ))}
            .
          </li>
          <li>
            <span className="font-medium text-muted-foreground/80">Adam authorization</span> — explicit
            written authorization from Adam required before any live call is placed.
          </li>
        </ol>
      </div>
    </GlassCard>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type ReviewFilter = "all" | PrepFrameReviewStatus;
type ReadyFilter  = "all" | "ready" | "not_ready";

export default function OutboundPilotPage() {
  const [frames,        setFrames]        = useState<PrepFrameCardRow[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [reviewFilter,  setReviewFilter]  = useState<ReviewFilter>("all");
  const [readyFilter,   setReadyFilter]   = useState<ReadyFilter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const h = await authHeaders();
      const params = new URLSearchParams({ limit: "100" });
      if (reviewFilter !== "all") params.set("review_status", reviewFilter);
      if (readyFilter  === "ready")     params.set("handoff_ready", "true");
      if (readyFilter  === "not_ready") params.set("handoff_ready", "false");

      const res = await fetch(`/api/dialer/v1/outbound-prep?${params}`, { headers: h });
      if (!res.ok) throw new Error("Failed to load frames");
      const { frames: data } = await res.json();
      setFrames(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [reviewFilter, readyFilter]);

  useEffect(() => { load(); }, [load]);

  const summary = derivePilotReadiness(frames);

  return (
    <PageShell title="Outbound Pilot Prep">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {/* ── Breadcrumb ── */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
          <Link href="/settings" className="hover:text-muted-foreground transition-colors flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Settings
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-muted-foreground/70">Outbound Pilot Prep</span>
        </div>

        {/* ── Page header ── */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-lg font-semibold text-foreground/90 flex items-center gap-2">
              <Phone className="w-4 h-4 text-muted-foreground/50" />
              Outbound Pilot Prep
            </h1>
            <p className="text-xs text-muted-foreground/50">
              Review assembled prep frames for future AI-assisted outbound warm-transfer pilot.
              No calls are placed from this surface.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
            className="flex-shrink-0 text-xs h-7"
          >
            {loading
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <RefreshCw className="w-3 h-3" />}
          </Button>
        </div>

        {/* ── Pilot status ── */}
        <PilotStatusBanner />

        {/* ── Readiness summary ── */}
        {frames.length > 0 && (
          <ReadinessSummaryCard summary={summary} />
        )}

        {/* ── Frame queue ── */}
        <GlassCard className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-muted-foreground/40" />
              <h3 className="text-sm font-semibold text-foreground/80">Prep Frames</h3>
              <Badge variant="outline" className="text-[9px]">{frames.length}</Badge>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {/* Ready filter */}
              {(["all", "ready", "not_ready"] as ReadyFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setReadyFilter(f)}
                  className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                    readyFilter === f
                      ? "border-blue-500/40 bg-blue-500/10 text-blue-400"
                      : "border-white/[0.06] text-muted-foreground/50 hover:text-muted-foreground"
                  }`}
                >
                  {f === "all" ? "All readiness" : f === "ready" ? "Ready" : "Not ready"}
                </button>
              ))}
              {/* Review filter */}
              {(["all", "pending", "approved", "flagged", "rejected"] as ReviewFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setReviewFilter(f)}
                  className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                    reviewFilter === f
                      ? "border-blue-500/40 bg-blue-500/10 text-blue-400"
                      : "border-white/[0.06] text-muted-foreground/50 hover:text-muted-foreground"
                  }`}
                >
                  {f === "all" ? "All reviews" : PREP_FRAME_REVIEW_STATUS_LABELS[f as PrepFrameReviewStatus]}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/40" />
            </div>
          ) : frames.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <CheckCircle2 className="w-6 h-6 text-muted-foreground/20 mx-auto" />
              <p className="text-xs text-muted-foreground/40">
                No prep frames yet.
              </p>
              <p className="text-[10px] text-muted-foreground/30">
                Frames are assembled manually from lead detail or via{" "}
                <code className="bg-white/[0.04] px-1 rounded">POST /api/dialer/v1/outbound-prep</code>.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {frames.map(f => (
                <OutboundPrepCard
                  key={f.id}
                  frame={f}
                  onReviewed={updated =>
                    setFrames(prev => prev.map(x => x.id === updated.id ? updated : x))
                  }
                />
              ))}
            </div>
          )}
        </GlassCard>

        {/* ── Config notes ── */}
        <PilotConfigNotes />

        {/* ── Related links ── */}
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground/50">
          <Link href="/settings/voice-registry" className="hover:text-muted-foreground flex items-center gap-1 transition-colors">
            <ChevronRight className="w-3 h-3" /> Voice Registry
          </Link>
          <Link href="/settings/trust-language" className="hover:text-muted-foreground flex items-center gap-1 transition-colors">
            <ChevronRight className="w-3 h-3" /> Trust Language
          </Link>
          <Link href="/dialer/review" className="hover:text-muted-foreground flex items-center gap-1 transition-colors">
            <ChevronRight className="w-3 h-3" /> Dialer Review
          </Link>
        </div>

      </div>
    </PageShell>
  );
}
