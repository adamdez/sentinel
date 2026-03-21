"use client";

/**
 * ContradictionFlagsPanel
 *
 * Compact collapsible panel showing detected contradictions between CRM fields,
 * dossier evidence, and fact assertions for a lead.
 *
 * Features:
 *   - Lists unreviewed + real flags first, sorted by severity
 *   - Each flag shows: check type label, severity badge, description, evidence pair
 *   - Three review actions: Mark Real, False Positive, Resolved (with optional note)
 *   - "Run scan" button triggers a fresh contradiction scan
 *   - AI-free: all findings are deterministic, labeled clearly
 *
 * Design rules:
 *   - Tone is "worth double-checking" — never accusatory
 *   - False positives are easy to dismiss (one-click)
 *   - Never shows CRM state change options
 */

import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle, Flag, Check, X, RefreshCw, Loader2,
  ChevronDown, ChevronUp, GitCompare, Pen,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { CONTRADICTION_CHECK_LABELS } from "@/lib/contradiction-checks";
import type { ContradictionFlagRow } from "@/app/api/leads/[id]/contradiction-flags/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (session?.access_token) h["Authorization"] = `Bearer ${session.access_token}`;
  return h;
}

// ── Severity badge ────────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  if (severity === "flag") return (
    <span className="inline-flex items-center gap-0.5 rounded-[4px] border border-border/30 bg-muted/10 px-1.5 py-0.5 text-xs font-semibold text-foreground uppercase tracking-wide">
      <Flag className="h-2 w-2" aria-hidden="true" /> flag
    </span>
  );
  return (
    <span className="inline-flex items-center gap-0.5 rounded-[4px] border border-border/25 bg-muted/[0.08] px-1.5 py-0.5 text-xs font-semibold text-foreground/80 uppercase tracking-wide">
      <AlertTriangle className="h-2 w-2" aria-hidden="true" /> warn
    </span>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === "real")           return <span className="text-xs text-foreground/60 font-medium">Confirmed real</span>;
  if (status === "false_positive") return <span className="text-xs text-muted-foreground/35 font-medium">False positive</span>;
  if (status === "resolved")       return <span className="text-xs text-foreground/50 font-medium">Resolved</span>;
  return null;
}

// ── Evidence pair ─────────────────────────────────────────────────────────────

function EvidencePair({ evidenceA, evidenceB }: {
  evidenceA: ContradictionFlagRow["evidence_a"];
  evidenceB: ContradictionFlagRow["evidence_b"];
}) {
  if (!evidenceA || !evidenceB) return null;
  return (
    <div className="grid grid-cols-2 gap-1.5 mt-1.5">
      <div className="rounded-[6px] bg-primary/[0.03] border border-primary/10 px-2 py-1.5">
        <p className="text-xs uppercase tracking-wider text-primary/40 mb-0.5">{evidenceA.source}</p>
        <p className="text-xs font-medium text-foreground/60 truncate">{evidenceA.label}</p>
        <p className="text-sm text-foreground/75 mt-0.5 break-words line-clamp-2">{evidenceA.value}</p>
      </div>
      <div className="rounded-[6px] bg-muted/[0.03] border border-border/10 px-2 py-1.5">
        <p className="text-xs uppercase tracking-wider text-foreground/40 mb-0.5">{evidenceB.source}</p>
        <p className="text-xs font-medium text-foreground/60 truncate">{evidenceB.label}</p>
        <p className="text-sm text-foreground/75 mt-0.5 break-words line-clamp-2">{evidenceB.value}</p>
      </div>
    </div>
  );
}

// ── Single flag row ───────────────────────────────────────────────────────────

function FlagRow({
  flag,
  onReview,
}: {
  flag: ContradictionFlagRow;
  onReview: (id: string, status: "real" | "false_positive" | "resolved", note?: string) => Promise<void>;
}) {
  const [expanded,  setExpanded]  = useState(flag.severity === "flag" && flag.status === "unreviewed");
  const [showNote,  setShowNote]  = useState(false);
  const [note,      setNote]      = useState(flag.review_note ?? "");
  const [reviewing, setReviewing] = useState(false);
  const [done,      setDone]      = useState(flag.status !== "unreviewed");

  const isResolved = flag.status === "false_positive" || flag.status === "resolved";

  const handle = async (status: "real" | "false_positive" | "resolved") => {
    if (reviewing) return;
    setReviewing(true);
    await onReview(flag.id, status, note.trim() || undefined);
    setDone(true);
    setReviewing(false);
  };

  const checkLabel = CONTRADICTION_CHECK_LABELS[flag.check_type as keyof typeof CONTRADICTION_CHECK_LABELS]
    ?? flag.check_type.replace(/_/g, " ");

  return (
    <div className={`rounded-[8px] border overflow-hidden transition-opacity ${
      isResolved ? "opacity-50 border-white/[0.04]" : "border-white/[0.07]"
    } bg-white/[0.015]`}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-white/[0.02] transition-colors"
      >
        <SeverityBadge severity={flag.severity} />
        <span className="text-sm font-medium text-foreground/75 flex-1 truncate">
          {checkLabel}
        </span>
        {done && <StatusBadge status={flag.status} />}
        {expanded
          ? <ChevronUp   className="h-3 w-3 text-muted-foreground/25 shrink-0" aria-hidden="true" />
          : <ChevronDown className="h-3 w-3 text-muted-foreground/25 shrink-0" aria-hidden="true" />}
      </button>

      {/* Body */}
      {expanded && (
        <div className="px-2.5 pb-2.5 border-t border-white/[0.04] pt-2 space-y-2">
          <p className="text-sm text-foreground/65 leading-relaxed">{flag.description}</p>

          <EvidencePair evidenceA={flag.evidence_a} evidenceB={flag.evidence_b} />

          {flag.review_note && done && (
            <p className="text-sm text-muted-foreground/40 italic px-0.5">
              Note: {flag.review_note}
            </p>
          )}

          {/* Review actions — only shown for unreviewed flags */}
          {!done && (
            <div className="space-y-1.5 pt-0.5">
              {showNote && (
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional note on why this is resolved or false positive…"
                  maxLength={300}
                  rows={2}
                  className="w-full resize-none rounded-[6px] border border-white/[0.06] bg-white/[0.03] px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/20"
                />
              )}
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => handle("real")}
                  disabled={reviewing}
                  className="flex-1 flex items-center justify-center gap-1 rounded-[6px] border border-border/20 bg-muted/[0.06] px-2 py-1 text-sm text-foreground/70 hover:bg-muted/10 transition-colors disabled:opacity-40"
                >
                  {reviewing ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Flag className="h-2.5 w-2.5" aria-hidden="true" />}
                  Real
                </button>
                <button
                  type="button"
                  onClick={() => { setShowNote(true); handle("false_positive"); }}
                  disabled={reviewing}
                  className="flex-1 flex items-center justify-center gap-1 rounded-[6px] border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-sm text-muted-foreground/50 hover:text-foreground/70 transition-colors disabled:opacity-40"
                >
                  <X className="h-2.5 w-2.5" aria-hidden="true" />
                  False +
                </button>
                <button
                  type="button"
                  onClick={() => { setShowNote(true); handle("resolved"); }}
                  disabled={reviewing}
                  className="flex-1 flex items-center justify-center gap-1 rounded-[6px] border border-border/15 bg-muted/[0.04] px-2 py-1 text-sm text-foreground/60 hover:bg-muted/[0.08] transition-colors disabled:opacity-40"
                >
                  <Check className="h-2.5 w-2.5" aria-hidden="true" />
                  Resolved
                </button>
                {!showNote && (
                  <button
                    type="button"
                    onClick={() => setShowNote(true)}
                    className="flex items-center gap-0.5 px-1.5 text-sm text-muted-foreground/25 hover:text-muted-foreground/50"
                  >
                    <Pen className="h-2.5 w-2.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export interface ContradictionFlagsPanelProps {
  leadId:     string;
  className?: string;
}

export function ContradictionFlagsPanel({ leadId, className = "" }: ContradictionFlagsPanelProps) {
  const [flags,    setFlags]    = useState<ContradictionFlagRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [scanning, setScanning] = useState(false);
  const [open,     setOpen]     = useState(true);

  const loadFlags = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    const h = await authHeaders();
    try {
      const res  = await fetch(`/api/leads/${leadId}/contradiction-flags`, { headers: h });
      const data = res.ok ? await res.json() as { flags: ContradictionFlagRow[] } : null;
      if (data) setFlags(data.flags);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, [leadId]);

  useEffect(() => { void loadFlags(); }, [loadFlags]);

  const handleScan = async () => {
    setScanning(true);
    const h = await authHeaders();
    await fetch(`/api/leads/${leadId}/contradiction-scan`, { method: "POST", headers: h });
    await loadFlags();
    setScanning(false);
  };

  const handleReview = useCallback(async (
    flagId: string,
    status: "real" | "false_positive" | "resolved",
    note?: string,
  ) => {
    const h = await authHeaders();
    await fetch(`/api/leads/${leadId}/contradiction-flags/${flagId}`, {
      method:  "PATCH",
      headers: h,
      body:    JSON.stringify({ status, review_note: note }),
    });
    setFlags((prev) =>
      prev.map((f) => f.id === flagId
        ? { ...f, status, review_note: note ?? f.review_note }
        : f
      )
    );
  }, [leadId]);

  const unreviewedFlags = flags.filter((f) => f.status === "unreviewed");
  const reviewedFlags   = flags.filter((f) => f.status !== "unreviewed");
  const hasFlags        = flags.length > 0;
  const flagCount       = unreviewedFlags.filter((f) => f.severity === "flag").length;
  const warnCount       = unreviewedFlags.filter((f) => f.severity === "warn").length;

  return (
    <div className={`border rounded-[10px] border-white/[0.06] bg-white/[0.01] ${className}`}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-white/[0.02] transition-colors rounded-[10px]"
      >
        <GitCompare className="h-3.5 w-3.5 text-foreground/60 shrink-0" aria-hidden="true" />
        <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/60 flex-1 text-left">
          Contradiction Flags
        </span>

        {loading && <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground/30" />}

        {!loading && (
          <>
            {flagCount > 0 && (
              <span className="rounded-[4px] bg-muted/10 border border-border/20 px-1.5 py-0.5 text-xs font-bold text-foreground">
                {flagCount}
              </span>
            )}
            {warnCount > 0 && (
              <span className="rounded-[4px] bg-muted/10 border border-border/15 px-1.5 py-0.5 text-xs font-bold text-foreground/80">
                {warnCount}
              </span>
            )}
            {!hasFlags && (
              <span className="text-xs text-muted-foreground/25">No flags</span>
            )}
          </>
        )}

        {open
          ? <ChevronUp   className="h-3 w-3 text-muted-foreground/25 shrink-0" aria-hidden="true" />
          : <ChevronDown className="h-3 w-3 text-muted-foreground/25 shrink-0" aria-hidden="true" />}
      </button>

      {/* Body */}
      {open && (
        <div className="px-3 pb-3 border-t border-white/[0.04] pt-2.5 space-y-2">

          {/* Run scan button */}
          <button
            type="button"
            onClick={handleScan}
            disabled={scanning}
            className="flex items-center gap-1.5 rounded-[7px] border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 text-sm text-muted-foreground/50 hover:text-foreground/70 hover:border-white/[0.10] transition-colors disabled:opacity-40"
          >
            {scanning
              ? <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden="true" />
              : <RefreshCw className="h-2.5 w-2.5" aria-hidden="true" />}
            {scanning ? "Scanning…" : "Run contradiction scan"}
          </button>

          {/* Flags list */}
          {!loading && !hasFlags && !scanning && (
            <p className="text-sm text-muted-foreground/30 italic px-0.5">
              No contradictions detected. Run a scan to check for conflicts between CRM fields and evidence.
            </p>
          )}

          {!loading && unreviewedFlags.length > 0 && (
            <div className="space-y-1.5">
              {unreviewedFlags.map((flag) => (
                <FlagRow key={flag.id} flag={flag} onReview={handleReview} />
              ))}
            </div>
          )}

          {/* Already-reviewed flags — collapsed summary */}
          {!loading && reviewedFlags.length > 0 && (
            <div className="pt-1 border-t border-white/[0.04]">
              <p className="text-xs text-muted-foreground/25 uppercase tracking-wider mb-1.5">
                Previously reviewed ({reviewedFlags.length})
              </p>
              <div className="space-y-1">
                {reviewedFlags.map((flag) => (
                  <FlagRow key={flag.id} flag={flag} onReview={handleReview} />
                ))}
              </div>
            </div>
          )}

          {/* Caveat */}
          <p className="text-xs text-muted-foreground/20 leading-relaxed px-0.5 pt-1">
            Contradiction checks are deterministic keyword and field comparisons — not AI reasoning.
            Keyword matches should be verified against the actual fact text before acting.
          </p>
        </div>
      )}
    </div>
  );
}
