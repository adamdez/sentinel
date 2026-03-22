"use client";

/**
 * /dialer/qa — Call QA Review
 *
 * Adam's surface for inspecting flagged call findings and marking them
 * valid, invalid, or corrected.
 *
 * Features:
 *   - Queue of calls with pending findings, sorted by severity
 *   - Per-call finding cards showing check type, severity, finding text
 *   - Run QA for any recent call directly from this surface
 *   - One-click mark valid / invalid, inline correction note for "corrected"
 *   - AI-derived findings clearly labeled
 *   - Never auto-updates CRM state
 *
 * Design: informational, not punitive. Tone is "what can we learn" not "what did Logan do wrong".
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Shield, Loader2, Flag, AlertTriangle, Info,
  Check, X, Pen, Sparkles, RefreshCw, ChevronDown, ChevronUp,
  Phone, Clock,
} from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import type { QaQueueRow, QaFindingItem } from "@/app/api/dialer/v1/qa/queue/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (session?.access_token) h["Authorization"] = `Bearer ${session.access_token}`;
  return h;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function fmtDuration(sec: number | null): string {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ── Severity badge ────────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  if (severity === "flag") return (
    <span className="inline-flex items-center gap-0.5 rounded-[4px] border border-border/30 bg-muted/10 px-1.5 py-0.5 text-xs font-semibold text-foreground uppercase tracking-wide">
      <Flag className="h-2 w-2" aria-hidden="true" /> flag
    </span>
  );
  if (severity === "warn") return (
    <span className="inline-flex items-center gap-0.5 rounded-[4px] border border-border/30 bg-muted/10 px-1.5 py-0.5 text-xs font-semibold text-foreground uppercase tracking-wide">
      <AlertTriangle className="h-2 w-2" aria-hidden="true" /> warn
    </span>
  );
  return (
    <span className="inline-flex items-center gap-0.5 rounded-[4px] border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 text-xs font-semibold text-muted-foreground/50 uppercase tracking-wide">
      <Info className="h-2 w-2" aria-hidden="true" /> info
    </span>
  );
}

// ── Check type label ──────────────────────────────────────────────────────────

const CHECK_LABELS: Record<string, string> = {
  missing_qual:           "Missing qualification",
  no_next_action:         "No next action",
  unresolved_objection:   "Unresolved objection",
  short_call:             "Short call",
  no_notes:               "No notes",
  ai_notes_flag:          "Weak follow-up (AI)",
  trust_risk:             "Trust risk (AI)",
};

// ── Finding row component ─────────────────────────────────────────────────────

function FindingRow({
  finding,
  onReview,
}: {
  finding: QaFindingItem & { status: string };
  onReview: (id: string, status: "valid" | "invalid" | "corrected", note?: string) => Promise<void>;
}) {
  const [reviewing, setReviewing] = useState(false);
  const [showNote,  setShowNote]  = useState(false);
  const [note,      setNote]      = useState("");
  const [done,      setDone]      = useState(false);

  const handle = async (status: "valid" | "invalid" | "corrected") => {
    if (status === "corrected" || status === "invalid") {
      if (!showNote) { setShowNote(true); return; }
    }
    setReviewing(true);
    await onReview(finding.id, status, note.trim() || undefined);
    setDone(true);
    setReviewing(false);
  };

  if (done) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-[6px] bg-muted/[0.04] border border-border/10">
        <Check className="h-3 w-3 text-foreground/50 shrink-0" aria-hidden="true" />
        <span className="text-sm text-foreground/50">Reviewed</span>
      </div>
    );
  }

  return (
    <div className="rounded-[8px] border border-white/[0.05] bg-white/[0.015] p-2.5 space-y-1.5">
      <div className="flex items-start gap-2">
        <div className="shrink-0 mt-0.5">
          <SeverityBadge severity={finding.severity} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-sm font-semibold text-foreground/70">
              {CHECK_LABELS[finding.check_type] ?? finding.check_type}
            </span>
            {finding.ai_derived && (
              <span className="inline-flex items-center gap-0.5 text-xs text-foreground/50 italic">
                <Sparkles className="h-2 w-2" aria-hidden="true" />
                AI-derived
              </span>
            )}
          </div>
          <p className="text-sm text-foreground/60 leading-snug">{finding.finding}</p>
          {finding.ai_derived && (
            <p className="text-xs text-muted-foreground/30 italic mt-0.5">
              Based on operator notes only — not a full transcript
            </p>
          )}
        </div>
      </div>

      {/* Correction note input */}
      {showNote && (
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Brief note on why this finding is invalid or what was corrected…"
          maxLength={300}
          rows={2}
          className="w-full resize-none rounded-[6px] border border-white/[0.06] bg-white/[0.03] px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/20"
        />
      )}

      {/* Actions */}
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => handle("valid")}
          disabled={reviewing}
          className="flex-1 flex items-center justify-center gap-1 rounded-[6px] border border-border/20 bg-muted/[0.06] px-2 py-1 text-sm text-foreground/70 hover:bg-muted/[0.10] transition-colors disabled:opacity-40"
        >
          {reviewing ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Check className="h-2.5 w-2.5" aria-hidden="true" />}
          Valid
        </button>
        <button
          type="button"
          onClick={() => handle("invalid")}
          disabled={reviewing}
          className="flex-1 flex items-center justify-center gap-1 rounded-[6px] border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-sm text-muted-foreground/50 hover:text-foreground/70 hover:border-white/[0.12] transition-colors disabled:opacity-40"
        >
          <X className="h-2.5 w-2.5" aria-hidden="true" />
          Invalid
        </button>
        <button
          type="button"
          onClick={() => handle("corrected")}
          disabled={reviewing}
          className="flex-1 flex items-center justify-center gap-1 rounded-[6px] border border-primary/15 bg-primary/[0.04] px-2 py-1 text-sm text-primary/60 hover:bg-primary/[0.08] transition-colors disabled:opacity-40"
        >
          <Pen className="h-2.5 w-2.5" aria-hidden="true" />
          Corrected
        </button>
      </div>
    </div>
  );
}

// ── Call QA card ──────────────────────────────────────────────────────────────

function CallQaCard({
  call,
  onReview,
  onRunQa,
}: {
  call: QaQueueRow;
  onReview: (findingId: string, status: "valid" | "invalid" | "corrected", note?: string) => Promise<void>;
  onRunQa: (callLogId: string) => Promise<void>;
}) {
  const [expanded,  setExpanded]  = useState(call.flagCount > 0);
  const [rerunning, setRerunning] = useState(false);

  const handleRerun = async () => {
    setRerunning(true);
    await onRunQa(call.callLogId);
    setRerunning(false);
  };

  const hasFindings = call.findings.length > 0;

  return (
    <GlassCard hover={false} className="!p-0 overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-3.5 py-3 hover:bg-white/[0.02] transition-colors text-left"
      >
        {/* Severity indicator */}
        <div className={`h-6 w-1 rounded-full shrink-0 ${
          call.flagCount > 0 ? "bg-muted/50" :
          call.warnCount > 0 ? "bg-muted/40" :
          "bg-white/10"
        }`} />

        {/* Lead info */}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground/80 truncate">
            {call.address ?? call.ownerName ?? "Unknown lead"}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-sm text-muted-foreground/40 capitalize">
              {call.disposition?.replace(/_/g, " ") ?? "—"}
            </span>
            <span className="text-muted-foreground/25 text-sm">·</span>
            <span className="text-sm text-muted-foreground/40">
              {fmtDate(call.callDate)}
            </span>
            {call.durationSec && (
              <>
                <span className="text-muted-foreground/25 text-sm">·</span>
                <span className="text-sm text-muted-foreground/35">{fmtDuration(call.durationSec)}</span>
              </>
            )}
          </div>
        </div>

        {/* Finding counts */}
        <div className="flex items-center gap-1.5 shrink-0">
          {call.flagCount > 0 && (
            <span className="rounded-[4px] bg-muted/10 border border-border/20 px-1.5 py-0.5 text-xs font-semibold text-foreground">
              {call.flagCount} flag{call.flagCount > 1 ? "s" : ""}
            </span>
          )}
          {call.warnCount > 0 && (
            <span className="rounded-[4px] bg-muted/10 border border-border/20 px-1.5 py-0.5 text-xs font-semibold text-foreground">
              {call.warnCount} warn{call.warnCount > 1 ? "s" : ""}
            </span>
          )}
          {!hasFindings && (
            <span className="text-xs text-muted-foreground/30">No findings</span>
          )}
          {expanded
            ? <ChevronUp   className="h-3.5 w-3.5 text-muted-foreground/25 ml-1" aria-hidden="true" />
            : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/25 ml-1" aria-hidden="true" />}
        </div>
      </button>

      {/* Expanded findings */}
      {expanded && (
        <div className="px-3.5 pb-3.5 border-t border-white/[0.04] pt-3 space-y-2">
          {hasFindings ? (
            call.findings.map((f) => (
              <FindingRow
                key={f.id}
                finding={f}
                onReview={onReview}
              />
            ))
          ) : (
            <p className="text-sm text-muted-foreground/30 italic px-1">No pending findings for this call.</p>
          )}

          {/* Re-run QA */}
          <button
            type="button"
            onClick={handleRerun}
            disabled={rerunning}
            className="flex items-center gap-1.5 text-sm text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors disabled:opacity-40 mt-1"
          >
            {rerunning
              ? <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden="true" />
              : <RefreshCw className="h-2.5 w-2.5" aria-hidden="true" />}
            Re-run QA
          </button>
        </div>
      )}
    </GlassCard>
  );
}

// ── Run QA on a recent call ───────────────────────────────────────────────────

function RunQaForm({ onRun }: { onRun: (callLogId: string) => Promise<void> }) {
  const [callLogId, setCallLogId] = useState("");
  const [running,   setRunning]   = useState(false);

  const handleRun = async () => {
    if (!callLogId.trim()) return;
    setRunning(true);
    await onRun(callLogId.trim());
    setCallLogId("");
    setRunning(false);
  };

  return (
    <div className="flex gap-2 items-center">
      <input
        type="text"
        value={callLogId}
        onChange={(e) => setCallLogId(e.target.value)}
        placeholder="calls_log UUID to QA…"
        className="flex-1 rounded-[8px] border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/20"
      />
      <Button
        onClick={handleRun}
        disabled={running || !callLogId.trim()}
        size="sm"
        className="gap-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-sm"
      >
        {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Shield className="h-3 w-3" />}
        Run QA
      </Button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DialerQaPage() {
  const [queue,   setQueue]   = useState<QaQueueRow[]>([]);
  const [summary, setSummary] = useState<{ pending: number; flagged: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [severity, setSeverity] = useState<"all" | "flag" | "warn">("all");

  const loadQueue = useCallback(async () => {
    setLoading(true);
    const h = await authHeaders();
    try {
      const res  = await fetch(`/api/dialer/v1/qa/queue?days=14&severity=${severity}`, { headers: h });
      const data = res.ok ? await res.json() as { calls: QaQueueRow[]; summary: { pending: number; flagged: number } } : null;
      if (data) { setQueue(data.calls); setSummary(data.summary); }
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, [severity]);

  useEffect(() => { void loadQueue(); }, [loadQueue]);

  const handleReview = useCallback(async (
    findingId: string,
    status: "valid" | "invalid" | "corrected",
    note?: string,
  ) => {
    const h = await authHeaders();
    await fetch(`/api/dialer/v1/qa/${findingId}`, {
      method:  "PATCH",
      headers: h,
      body:    JSON.stringify({ status, correction_note: note }),
    });
    // Remove the reviewed finding from local state
    setQueue((prev) =>
      prev.map((call) => ({
        ...call,
        findings:    call.findings.filter((f) => f.id !== findingId),
        pendingCount: Math.max(0, call.pendingCount - 1),
        flagCount:   call.findings.find((f) => f.id === findingId)?.severity === "flag"
          ? Math.max(0, call.flagCount - 1)
          : call.flagCount,
        warnCount:   call.findings.find((f) => f.id === findingId)?.severity === "warn"
          ? Math.max(0, call.warnCount - 1)
          : call.warnCount,
      })).filter((call) => call.pendingCount > 0),
    );
  }, []);

  const handleRunQa = useCallback(async (callLogId: string) => {
    const h = await authHeaders();
    await fetch(`/api/dialer/v1/calls/${callLogId}/qa`, { method: "POST", headers: h });
    // Reload queue to show new findings
    await loadQueue();
  }, [loadQueue]);

  return (
    <PageShell
      title="Call QA"
      description="Flagged call findings — missing qualification, weak follow-up, objection handling."
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground/50 mb-1">
          <Link href="/dialer/review" className="hover:text-muted-foreground transition-colors">
            Review Console
          </Link>
          <span>/</span>
          <span className="text-muted-foreground/70">Call QA</span>
        </div>

        {/* ── Summary strip ─────────────────────────────────── */}
        {summary && (
          <div className="grid grid-cols-3 gap-3">
            <GlassCard hover={false} className="!p-3 text-center">
              <Shield className="h-3.5 w-3.5 text-muted-foreground/40 mx-auto mb-1" aria-hidden="true" />
              <p className="text-lg font-bold text-foreground">{summary.pending}</p>
              <p className="text-xs text-muted-foreground/40 uppercase">Pending review</p>
            </GlassCard>
            <GlassCard hover={false} className={`!p-3 text-center ${summary.flagged > 0 ? "border-border/20" : ""}`}>
              <Flag className={`h-3.5 w-3.5 mx-auto mb-1 ${summary.flagged > 0 ? "text-foreground/70" : "text-muted-foreground/30"}`} aria-hidden="true" />
              <p className={`text-lg font-bold ${summary.flagged > 0 ? "text-foreground" : "text-foreground"}`}>{summary.flagged}</p>
              <p className="text-xs text-muted-foreground/40 uppercase">Flagged</p>
            </GlassCard>
            <GlassCard hover={false} className="!p-3 text-center">
              <Phone className="h-3.5 w-3.5 text-muted-foreground/40 mx-auto mb-1" aria-hidden="true" />
              <p className="text-lg font-bold text-foreground">{queue.length}</p>
              <p className="text-xs text-muted-foreground/40 uppercase">Calls</p>
            </GlassCard>
          </div>
        )}

        {/* ── Run QA manually ───────────────────────────────── */}
        <GlassCard hover={false} className="!p-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="h-3.5 w-3.5 text-muted-foreground/40" aria-hidden="true" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/60">
              Run QA on a Call
            </h3>
          </div>
          <RunQaForm onRun={handleRunQa} />
          <p className="text-xs text-muted-foreground/25 mt-2 px-0.5">
            Paste a calls_log UUID to run deterministic + AI notes checks. Results appear in the queue below.
          </p>
        </GlassCard>

        {/* ── Severity filter ────────────────────────────────── */}
        <div className="flex gap-1.5">
          {(["all", "flag", "warn"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSeverity(s)}
              className={`rounded-[8px] border px-3 py-1 text-sm font-medium transition-colors ${
                severity === s
                  ? "bg-primary/10 border-primary/20 text-primary"
                  : "bg-white/[0.02] border-white/[0.06] text-muted-foreground/50 hover:border-white/[0.12]"
              }`}
            >
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1) + "s"}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void loadQueue()}
            disabled={loading}
            className="ml-auto flex items-center gap-1 rounded-[8px] border border-white/[0.06] bg-white/[0.02] px-3 py-1 text-sm text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors disabled:opacity-40"
          >
            {loading ? <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-2.5 w-2.5" aria-hidden="true" />}
            Refresh
          </button>
        </div>

        {/* ── Queue ─────────────────────────────────────────── */}
        {loading && (
          <GlassCard hover={false} className="!p-8">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading QA queue…
            </div>
          </GlassCard>
        )}

        {!loading && queue.length === 0 && (
          <GlassCard hover={false} className="!p-8 text-center">
            <Check className="h-6 w-6 text-foreground/40 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm text-muted-foreground/50">No pending QA findings in the last 14 days.</p>
            <p className="text-sm text-muted-foreground/30 mt-1">
              Use the form above to run QA on a specific call.
            </p>
          </GlassCard>
        )}

        {!loading && queue.length > 0 && (
          <div className="space-y-3">
            {queue.map((call) => (
              <CallQaCard
                key={call.callLogId}
                call={call}
                onReview={handleReview}
                onRunQa={handleRunQa}
              />
            ))}
          </div>
        )}

        {/* ── Context note ──────────────────────────────────── */}
        <div className="flex items-start gap-2 rounded-[10px] border border-white/[0.04] bg-white/[0.01] px-3 py-2.5">
          <Clock className="h-3 w-3 text-muted-foreground/25 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-sm text-muted-foreground/30 leading-relaxed">
            QA findings are informational only. Marking a finding valid or invalid has no effect on CRM records, lead stages, or operator metrics. This surface is for Adam&apos;s operational awareness and coaching reference only.
          </p>
        </div>

      </div>
    </PageShell>
  );
}
