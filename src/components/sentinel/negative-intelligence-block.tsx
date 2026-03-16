"use client";

/**
 * NegativeIntelligenceBlock
 *
 * Compact collapsible block in Lead Detail that surfaces "signals worth checking
 * before committing further time to this lead." Sourced from:
 *   - Lead qualification fields (motivation, price gap, equity risk)
 *   - Operator-set dispo friction
 *   - Open structural objection tags
 *   - Staleness / no-next-action pattern
 *   - Confirmed or unreviewed contradiction flags
 *
 * Design rules:
 *   - Only renders when ≥1 signal is present (invisible for clean leads)
 *   - Header reads "Signals worth checking" — not "Bad lead"
 *   - Each signal shows: confidence badge, label, one-sentence explanation, source
 *   - No CRM state changes, no blocking, no single score
 *   - Confidence badges are evidence-linked (verified / strong / probable / possible)
 *   - Visible to both Logan and Adam — this is operator context, not admin-only
 */

import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle, ChevronDown, ChevronUp, Loader2,
  ShieldAlert, Info,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  deriveNegativeSignals,
  CONFIDENCE_DISPLAY,
  type NegativeSignal,
  type NegativeSignalsInput,
  type SignalConfidence,
} from "@/lib/negative-signals";
import type { ClientFile } from "@/components/sentinel/master-client-file-helpers";
import type { ContradictionFlagRow } from "@/app/api/leads/[id]/contradiction-flags/route";

// ── Auth helper ───────────────────────────────────────────────────────────────

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (session?.access_token) h["Authorization"] = `Bearer ${session.access_token}`;
  return h;
}

// ── Confidence badge ──────────────────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: SignalConfidence }) {
  const styles: Record<SignalConfidence, string> = {
    verified: "border-red-500/30 bg-red-500/[0.08] text-red-400",
    strong:   "border-orange-500/30 bg-orange-500/[0.08] text-orange-400/80",
    probable: "border-yellow-500/25 bg-yellow-500/[0.06] text-yellow-400/70",
    possible: "border-white/[0.10] bg-white/[0.02] text-muted-foreground/40",
  };

  return (
    <span
      className={`inline-flex items-center rounded-[4px] border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${styles[confidence]}`}
      title={CONFIDENCE_DISPLAY[confidence].description}
    >
      {CONFIDENCE_DISPLAY[confidence].label}
    </span>
  );
}

// ── Link hint label ───────────────────────────────────────────────────────────

function LinkHintLabel({ hint }: { hint: NegativeSignal["linkHint"] }) {
  if (!hint) return null;
  const labels: Record<NonNullable<NegativeSignal["linkHint"]>, string> = {
    qualification: "See Qualification ↓",
    objections:    "See Objections ↓",
    dossier:       "See Dossier ↓",
    tasks:         "See Tasks ↓",
  };
  return (
    <span className="text-[9px] text-cyan/30 ml-1">
      {labels[hint]}
    </span>
  );
}

// ── Single signal row ─────────────────────────────────────────────────────────

function SignalRow({ signal }: { signal: NegativeSignal }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-white/[0.05] rounded-[7px] bg-white/[0.01] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-white/[0.02] transition-colors"
      >
        <ConfidenceBadge confidence={signal.confidence} />
        <span className="text-[11px] font-medium text-foreground/70 flex-1 truncate">
          {signal.label}
        </span>
        {expanded
          ? <ChevronUp   className="h-3 w-3 text-muted-foreground/20 shrink-0" aria-hidden="true" />
          : <ChevronDown className="h-3 w-3 text-muted-foreground/20 shrink-0" aria-hidden="true" />}
      </button>

      {expanded && (
        <div className="px-2.5 pb-2.5 pt-1.5 border-t border-white/[0.04] space-y-1">
          <p className="text-[11px] text-foreground/60 leading-relaxed">
            {signal.explanation}
          </p>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-muted-foreground/30 italic">
              Source: {signal.sourceLabel}
            </span>
            <LinkHintLabel hint={signal.linkHint} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Block ─────────────────────────────────────────────────────────────────────

export interface NegativeIntelligenceBlockProps {
  cf: ClientFile;
}

export function NegativeIntelligenceBlock({ cf }: NegativeIntelligenceBlockProps) {
  const [open,          setOpen]          = useState(true);
  const [contFlags,     setContFlags]     = useState<ContradictionFlagRow[]>([]);
  const [objTags,       setObjTags]       = useState<Array<{ tag: string; note?: string | null }>>([]);
  const [loadingExtra,  setLoadingExtra]  = useState(true);

  const loadExtra = useCallback(async () => {
    if (!cf.id) return;
    setLoadingExtra(true);
    const h = await authHeaders();

    const [flagsRes, objRes] = await Promise.allSettled([
      fetch(`/api/leads/${cf.id}/contradiction-flags`, { headers: h }),
      fetch(`/api/dialer/v1/leads/${cf.id}/objections?status=open&limit=20`, { headers: h }),
    ]);

    if (flagsRes.status === "fulfilled" && flagsRes.value.ok) {
      const d = await flagsRes.value.json() as { flags: ContradictionFlagRow[] };
      // Only include flags that are unreviewed or explicitly confirmed real
      setContFlags((d.flags ?? []).filter((f) =>
        f.status === "unreviewed" || f.status === "real"
      ));
    }

    if (objRes.status === "fulfilled" && objRes.value.ok) {
      const d = await objRes.value.json() as { objections: Array<{ tag: string; note?: string | null }> };
      setObjTags(d.objections ?? []);
    }

    setLoadingExtra(false);
  }, [cf.id]);

  useEffect(() => { void loadExtra(); }, [loadExtra]);

  // ── Derive signals ───────────────────────────────────────────────────────────
  const input: NegativeSignalsInput = {
    motivationLevel:      cf.motivationLevel,
    sellerTimeline:       cf.sellerTimeline,
    conditionLevel:       cf.conditionLevel,
    qualificationRoute:   cf.qualificationRoute,
    priceExpectation:     cf.priceExpectation,
    estimatedValue:       cf.estimatedValue,
    totalLoanBalance:     cf.totalLoanBalance,
    followUpDate:         cf.followUpDate,
    nextCallScheduledAt:  cf.nextCallScheduledAt,
    totalCalls:           cf.totalCalls,
    dispoFrictionLevel:   cf.dispoFrictionLevel,
    openObjectionTags:    objTags,
    contradictionFlags:   contFlags,
    nowMs:                Date.now(),
  };

  const signals = loadingExtra ? [] : deriveNegativeSignals(input);

  // ── Don't render if no signals ───────────────────────────────────────────────
  if (!loadingExtra && signals.length === 0) return null;

  const highCount = signals.filter((s) =>
    s.confidence === "verified" || s.confidence === "strong"
  ).length;

  return (
    <div className="rounded-[12px] border border-orange-500/[0.12] bg-orange-500/[0.02]">
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-orange-500/[0.02] transition-colors rounded-[12px]"
      >
        <ShieldAlert className="h-3.5 w-3.5 text-orange-400/50 shrink-0" aria-hidden="true" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-orange-400/60 flex-1 text-left">
          Signals worth checking
        </span>

        {loadingExtra && (
          <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground/25" />
        )}

        {!loadingExtra && (
          <>
            {highCount > 0 && (
              <span className="rounded-[4px] bg-orange-500/[0.10] border border-orange-500/20 px-1.5 py-0.5 text-[9px] font-bold text-orange-400/80">
                {highCount} strong
              </span>
            )}
            {signals.length > 0 && (
              <span className="text-[9px] text-muted-foreground/30">
                {signals.length} signal{signals.length > 1 ? "s" : ""}
              </span>
            )}
          </>
        )}

        {open
          ? <ChevronUp   className="h-3 w-3 text-orange-400/20 shrink-0" aria-hidden="true" />
          : <ChevronDown className="h-3 w-3 text-orange-400/20 shrink-0" aria-hidden="true" />}
      </button>

      {/* Body */}
      {open && (
        <div className="px-3 pb-3 border-t border-orange-500/[0.08] pt-2.5 space-y-1.5">

          {loadingExtra && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/30 py-1">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              Loading signals…
            </div>
          )}

          {!loadingExtra && signals.map((signal) => (
            <SignalRow key={signal.type} signal={signal} />
          ))}

          {/* Explicit framing — not a veto, not a score */}
          <div className="flex items-start gap-1.5 pt-1 border-t border-orange-500/[0.06] mt-1">
            <Info className="h-3 w-3 text-muted-foreground/20 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-[9px] text-muted-foreground/25 leading-relaxed">
              These signals are informational. They do not change lead stage, assignment, or any CRM state.
              Use them as a checklist before committing additional time.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
