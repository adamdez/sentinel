"use client";

/**
 * PostCallPanel — PR3b
 *
 * Shown after a call ends when a dialer session exists.
 * Submits to the publish route (writes calls_log + leads qualification)
 * and fires the legacy call PATCH (for increment_lead_call_counters RPC).
 *
 * Step flow:
 *   • no_answer / voicemail / disqualified → one-tap publish (no further steps)
 *   • completed / not_interested / offer_made → Step 1 dispo → Step 3 qual confirm
 *   • follow_up / appointment → Step 1 dispo → Step 2 callback date → Step 3 qual confirm
 *
 * Step 3 (qual confirm): pre-populated from pre-call CRM values, operator adjusts
 * before final publish. Passes motivation_level + seller_timeline to publish-manager
 * via the existing PublishInput fields. Skippable.
 *
 * publish-manager is the sole dialer write path back to CRM tables.
 */

import { useState, useEffect, useRef } from "react";
import {
  CheckCircle2, Loader2, SkipForward,
  Phone, PhoneOff, Voicemail, CalendarCheck,
  DollarSign, Skull, X, ArrowRight, ChevronLeft, Flag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/sentinel/glass-card";
import { supabase } from "@/lib/supabase";
import type { PublishDisposition } from "@/lib/dialer/types";

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
  return headers;
}

interface DispoMeta {
  key: PublishDisposition;
  label: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}

const DISPO_OPTIONS: DispoMeta[] = [
  { key: "no_answer",      label: "No Answer",      icon: PhoneOff,      color: "text-zinc-400",    bg: "bg-zinc-500/10 hover:bg-zinc-500/20 border-zinc-500/20" },
  { key: "voicemail",      label: "Voicemail",      icon: Voicemail,     color: "text-blue-400",    bg: "bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/20" },
  { key: "completed",      label: "Talked",         icon: Phone,         color: "text-cyan",        bg: "bg-cyan/8 hover:bg-cyan/15 border-cyan/15" },
  { key: "not_interested", label: "Not Interested", icon: X,             color: "text-red-400",     bg: "bg-red-500/10 hover:bg-red-500/20 border-red-500/20" },
  { key: "follow_up",      label: "Follow Up",      icon: ArrowRight,    color: "text-purple-400",  bg: "bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/20" },
  { key: "appointment",    label: "Appointment",    icon: CalendarCheck, color: "text-emerald-400", bg: "bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20" },
  { key: "offer_made",     label: "Offer Made",     icon: DollarSign,    color: "text-orange-400",  bg: "bg-orange-500/10 hover:bg-orange-500/20 border-orange-500/20" },
  { key: "disqualified",   label: "Disqualified",   icon: Skull,         color: "text-red-400/70",  bg: "bg-red-500/8 hover:bg-red-500/15 border-red-500/15" },
];

// Dispositions that include a callback date capture step (Step 2)
const NEXT_STEP_DISPOS = new Set<PublishDisposition>(["follow_up", "appointment"]);

// Dispositions that are likely live-answer and warrant a qual confirm step (Step 3)
const QUAL_CONFIRM_DISPOS = new Set<PublishDisposition>([
  "completed", "not_interested", "offer_made", "follow_up", "appointment",
]);

const TIMELINE_CHIPS: { value: string; label: string }[] = [
  { value: "immediate", label: "Immediate" },
  { value: "30_days",   label: "30 days" },
  { value: "60_days",   label: "60 days" },
  { value: "flexible",  label: "Flexible" },
];

export interface PostCallPanelProps {
  sessionId: string;
  callLogId: string | null;
  userId: string;
  timerElapsed: number;
  initialSummary?: string;
  /** Pre-populate qual confirm from current CRM values */
  initialMotivationLevel?: number | null;
  initialSellerTimeline?: string | null;
  onComplete: () => void;
  onSkip: () => void;
}

export function PostCallPanel({
  sessionId,
  callLogId,
  userId,
  timerElapsed,
  initialSummary = "",
  initialMotivationLevel = null,
  initialSellerTimeline = null,
  onComplete,
  onSkip,
}: PostCallPanelProps) {
  const [selected, setSelected] = useState<PublishDisposition | null>(null);
  const [pendingDispo, setPendingDispo] = useState<PublishDisposition | null>(null);
  const [callbackAt, setCallbackAt] = useState("");
  // Step 3 state
  const [qualStep, setQualStep] = useState(false);
  const [qualFromDate, setQualFromDate] = useState(false);     // came from Step 2
  const [pendingNextCallAt, setPendingNextCallAt] = useState<string | undefined>(undefined);
  const [qualMotivation, setQualMotivation] = useState<number | null>(initialMotivationLevel);
  const [qualTimeline, setQualTimeline] = useState<string | null>(initialSellerTimeline);

  const [summary, setSummary] = useState(initialSummary);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null); // dispo label shown briefly on success

  // ── AI extraction state ───────────────────────────────────────
  const [extracting, setExtracting] = useState(false);
  // Tracks which fields were last set by AI (cleared when operator manually changes)
  const [aiSuggested, setAiSuggested] = useState<Set<string>>(new Set());
  // run_id returned by the extract route — used for review signal at publish time
  const [extractRunId, setExtractRunId] = useState<string | null>(null);
  // Whether Logan flagged the AI output as bad (toggled in Step 3)
  const [summaryFlagged, setSummaryFlagged] = useState(false);
  const extractFired = useRef(false);

  // Fire extraction once when Step 3 opens and operator notes are non-empty
  useEffect(() => {
    if (!qualStep || extractFired.current || !summary.trim()) return;
    extractFired.current = true;
    setExtracting(true);

    authHeaders()
      .then((hdrs) =>
        fetch(`/api/dialer/v1/sessions/${sessionId}/extract`, {
          method: "POST",
          headers: hdrs,
          body: JSON.stringify({ notes: summary.trim() }),
        }),
      )
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { ok?: boolean; motivation_level?: number | null; seller_timeline?: string | null; run_id?: string | null } | null) => {
        if (!data?.ok) return;
        const suggested = new Set<string>();
        if (data.motivation_level != null) {
          setQualMotivation(data.motivation_level);
          suggested.add("motivation");
        }
        if (data.seller_timeline != null) {
          setQualTimeline(data.seller_timeline);
          suggested.add("timeline");
        }
        if (suggested.size > 0) setAiSuggested(suggested);
        // Store run_id for review signal at publish time
        if (data.run_id) setExtractRunId(data.run_id);
      })
      .catch(() => {/* non-fatal — step 3 already shows initial values */})
      .finally(() => setExtracting(false));
  // qualStep is the trigger; other deps are stable across the component lifetime
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qualStep]);

  const handlePublish = async (
    dispo: PublishDisposition,
    nextCallScheduledAt?: string,
    quals?: { motivation_level?: number; seller_timeline?: string },
    reviewSignal?: { flagged: boolean; motivationCorrected: boolean; timelineCorrected: boolean },
  ) => {
    setSelected(dispo);
    setPublishing(true);
    setError(null);

    const hdrs = await authHeaders();

    // Publish to session — authoritative write for calls_log disposition + notes + qual fields.
    // callback_at is forwarded so publish-manager can create a tasks row for follow_up/appointment.
    // extract_run_id + summary_flagged + ai_corrections close the operator review loop on the
    // AI extraction — updating the corresponding dialer_ai_traces row for eval visibility.
    const publishRes = await fetch(`/api/dialer/v1/sessions/${sessionId}/publish`, {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify({
        disposition: dispo,
        duration_sec: timerElapsed > 0 ? timerElapsed : undefined,
        summary: summary.trim() || undefined,
        ...(nextCallScheduledAt ? { callback_at: nextCallScheduledAt } : {}),
        ...(quals?.motivation_level != null ? { motivation_level: quals.motivation_level } : {}),
        ...(quals?.seller_timeline       ? { seller_timeline: quals.seller_timeline }       : {}),
        // Review signal — only sent when extraction ran in this session
        ...(extractRunId ? {
          extract_run_id:  extractRunId,
          summary_flagged: reviewSignal?.flagged ?? summaryFlagged,
          ai_corrections: {
            motivation_corrected: reviewSignal?.motivationCorrected ?? false,
            timeline_corrected:   reviewSignal?.timelineCorrected   ?? false,
          },
        } : {}),
      }),
    }).catch(() => null);

    if (!publishRes?.ok) {
      const data = await publishRes?.json().catch(() => ({})) as Record<string, unknown>;
      setError(
        data?.code === "INVALID_TRANSITION"
          ? "Call still finalizing — try again in a moment"
          : (data?.error as string) ?? "Save failed — try again",
      );
      setPublishing(false);
      setSelected(null);
      return;
    }

    // Fire legacy call path AFTER publish succeeds — only for increment_lead_call_counters RPC.
    // skipCallsLogWrite: publish-manager already owns the calls_log write above.
    // nextCallScheduledAt: operator-set date overrides cadence scheduling in the RPC.
    if (callLogId) {
      fetch("/api/dialer/call", {
        method: "PATCH",
        headers: hdrs,
        body: JSON.stringify({
          callLogId,
          disposition: dispo,
          durationSec: timerElapsed > 0 ? timerElapsed : undefined,
          userId,
          skipCallsLogWrite: true,
          ...(nextCallScheduledAt ? { nextCallScheduledAt } : {}),
        }),
      }).catch(() => {});
    }

    // Brief success confirmation before advancing to next lead
    const label = DISPO_OPTIONS.find((d) => d.key === dispo)?.label ?? dispo;
    setPublishing(false);
    setSaved(label);
    setTimeout(() => onComplete(), 850);
  };

  const handleSkip = () => {
    // Still fire legacy path so call counters increment even on skip
    if (callLogId) {
      authHeaders().then((hdrs) =>
        fetch("/api/dialer/call", {
          method: "PATCH",
          headers: hdrs,
          body: JSON.stringify({
            callLogId,
            disposition: "completed",
            durationSec: timerElapsed > 0 ? timerElapsed : undefined,
            userId,
          }),
        }),
      ).catch(() => {});
    }
    onSkip();
  };

  const handleDispoTap = (dispo: PublishDisposition) => {
    if (publishing) return;
    if (NEXT_STEP_DISPOS.has(dispo)) {
      // Step 1 → Step 2 (date) → Step 3 (qual confirm)
      setPendingDispo(dispo);
      setCallbackAt("");
      setQualStep(false);
      setQualFromDate(false);
    } else if (QUAL_CONFIRM_DISPOS.has(dispo)) {
      // Step 1 → Step 3 (qual confirm), skip date step
      setPendingDispo(dispo);
      setQualStep(true);
      setQualFromDate(false);
    } else {
      // no_answer / voicemail / disqualified — one-tap publish
      handlePublish(dispo);
    }
  };

  // Called from Step 2 confirm — stores date, advances to Step 3
  const handleConfirmPending = () => {
    if (!pendingDispo) return;
    const iso = callbackAt ? new Date(callbackAt).toISOString() : undefined;
    setPendingNextCallAt(iso);
    setQualFromDate(true);
    setQualStep(true);
  };

  // Called from Step 3 confirm — fires publish with qual values + review signal.
  // Corrections are inferred: if a field was AI-suggested but is no longer in
  // aiSuggested (operator changed it), that field was corrected.
  const handleQualConfirm = () => {
    if (!pendingDispo) return;
    handlePublish(
      pendingDispo,
      pendingNextCallAt,
      {
        motivation_level: qualMotivation ?? undefined,
        seller_timeline:  qualTimeline   ?? undefined,
      },
      {
        flagged:              summaryFlagged,
        // A field was corrected if it was previously AI-suggested but
        // the operator changed it (removing it from aiSuggested).
        // We detect this by checking if extractRunId exists (extraction ran)
        // and the field is NOT in aiSuggested (operator changed it from AI value).
        motivationCorrected: extractRunId != null && !aiSuggested.has("motivation"),
        timelineCorrected:   extractRunId != null && !aiSuggested.has("timeline"),
      },
    );
  };

  // Back button from Step 3
  const handleQualBack = () => {
    setQualStep(false);
    if (!qualFromDate) {
      // Came from dispo grid — go back to Step 1
      setPendingDispo(null);
    }
    // qualFromDate → stay in Step 2 (pendingDispo still set, qualStep=false)
  };

  const pendingMeta = pendingDispo ? DISPO_OPTIONS.find((d) => d.key === pendingDispo) : null;

  // Minimum datetime for the input — now, formatted as YYYY-MM-DDTHH:MM
  const minDatetime = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

  // ── Header title ─────────────────────────────────────────────
  const headerTitle = qualStep ? "Confirm Outcome" : pendingDispo ? "Set Callback" : "Log Outcome";

  return (
    <GlassCard hover={false} className="!p-3">
      {/* ── Success confirmation (briefly shown before auto-advance) ── */}
      {saved ? (
        <div className="flex flex-col items-center gap-2 py-5">
          <CheckCircle2 className="h-5 w-5 text-cyan" />
          <p className="text-sm font-medium text-foreground">Logged: {saved}</p>
          <p className="text-[10px] text-muted-foreground/50">Moving to next lead…</p>
        </div>
      ) : (
      <>
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3">
        <CheckCircle2 className="h-3.5 w-3.5 text-cyan" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {headerTitle}
        </h2>
        {(qualStep || (!qualStep && pendingDispo)) ? (
          <button
            onClick={qualStep ? handleQualBack : () => { setPendingDispo(null); setCallbackAt(""); }}
            disabled={publishing}
            className="ml-auto flex items-center gap-0.5 text-[10px] text-muted-foreground/50 hover:text-foreground disabled:opacity-40"
          >
            <ChevronLeft className="h-3 w-3" />
            Change
          </button>
        ) : (
          <span className="text-[10px] opacity-40 ml-auto">Tap to save &amp; continue</span>
        )}
      </div>

      {error && (
        <p className="text-[11px] text-red-400 mb-2 px-1">{error}</p>
      )}

      {qualStep && pendingDispo && pendingMeta ? (
        /* ── Step 3: qualification confirm ──────────────────── */
        <div>
          {/* Selected dispo display */}
          <div className={`flex items-center gap-3 rounded-[12px] px-3 py-2.5 mb-3 border ${pendingMeta.bg}`}>
            <pendingMeta.icon className={`h-4 w-4 ${pendingMeta.color}`} />
            <span className="text-sm font-medium">{pendingMeta.label}</span>
            {pendingNextCallAt && (
              <span className="ml-auto text-[10px] text-muted-foreground/50">
                {new Date(pendingNextCallAt).toLocaleDateString([], { month: "short", day: "numeric" })}
              </span>
            )}
          </div>

          {/* Motivation level */}
          <div className="flex items-center gap-1.5 mb-1.5 px-0.5">
            <label className="text-[11px] text-muted-foreground/60">Motivation level</label>
            {extracting && <Loader2 className="h-2.5 w-2.5 animate-spin text-purple-400/50" />}
            {!extracting && aiSuggested.has("motivation") && (
              <span className="text-[9px] text-purple-400/60 uppercase tracking-wide">AI</span>
            )}
          </div>
          <div className="flex gap-1.5 mb-3">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => {
                  setQualMotivation(qualMotivation === n ? null : n);
                  setAiSuggested((prev) => { const s = new Set(prev); s.delete("motivation"); return s; });
                }}
                disabled={publishing}
                className={`flex-1 rounded-[10px] py-2 text-sm font-semibold border transition-all ${
                  qualMotivation === n
                    ? "bg-cyan/20 border-cyan/40 text-cyan"
                    : "bg-white/[0.03] border-white/[0.06] text-muted-foreground/60 hover:border-white/[0.14]"
                } disabled:opacity-50`}
              >
                {n}
              </button>
            ))}
          </div>

          {/* Seller timeline */}
          <div className="flex items-center gap-1.5 mb-1.5 px-0.5">
            <label className="text-[11px] text-muted-foreground/60">Seller timeline</label>
            {extracting && <Loader2 className="h-2.5 w-2.5 animate-spin text-purple-400/50" />}
            {!extracting && aiSuggested.has("timeline") && (
              <span className="text-[9px] text-purple-400/60 uppercase tracking-wide">AI</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {TIMELINE_CHIPS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => {
                  setQualTimeline(qualTimeline === value ? null : value);
                  setAiSuggested((prev) => { const s = new Set(prev); s.delete("timeline"); return s; });
                }}
                disabled={publishing}
                className={`rounded-[10px] py-2 text-[12px] font-medium border transition-all ${
                  qualTimeline === value
                    ? "bg-cyan/20 border-cyan/40 text-cyan"
                    : "bg-white/[0.03] border-white/[0.06] text-muted-foreground/60 hover:border-white/[0.14]"
                } disabled:opacity-50`}
              >
                {label}
              </button>
            ))}
          </div>

          <Button
            onClick={handleQualConfirm}
            disabled={publishing}
            className="w-full gap-2 bg-cyan/15 hover:bg-cyan/25 text-cyan border border-cyan/25 text-sm font-semibold"
          >
            {publishing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            Save &amp; Continue
          </Button>

          {/* Flag AI output — only shown when extraction ran */}
          {extractRunId && (
            <button
              type="button"
              onClick={() => setSummaryFlagged((v) => !v)}
              disabled={publishing}
              className={`w-full mt-1.5 flex items-center justify-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[11px] transition-all border disabled:opacity-40 ${
                summaryFlagged
                  ? "bg-orange-500/10 border-orange-500/25 text-orange-400"
                  : "bg-white/[0.02] border-white/[0.04] text-muted-foreground/40 hover:text-muted-foreground/70 hover:border-white/[0.08]"
              }`}
            >
              <Flag className="h-3 w-3" />
              {summaryFlagged ? "AI output flagged" : "Flag AI output"}
            </button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => handlePublish(pendingDispo, pendingNextCallAt)}
            disabled={publishing}
            className="w-full mt-1 gap-1.5 text-[11px] text-muted-foreground/50 hover:text-foreground"
          >
            Skip — save without qual update
          </Button>
        </div>

      ) : !qualStep && pendingDispo && pendingMeta ? (
        /* ── Step 2: date capture for follow_up / appointment ── */
        <div>
          {/* Selected dispo display */}
          <div className={`flex items-center gap-3 rounded-[12px] px-3 py-2.5 mb-3 border ${pendingMeta.bg}`}>
            <pendingMeta.icon className={`h-4 w-4 ${pendingMeta.color}`} />
            <span className="text-sm font-medium">{pendingMeta.label}</span>
          </div>

          {/* Callback date input */}
          <label className="block text-[11px] text-muted-foreground/60 mb-1.5 px-0.5">
            Callback date &amp; time <span className="opacity-50">(optional)</span>
          </label>
          <input
            type="datetime-local"
            value={callbackAt}
            onChange={(e) => setCallbackAt(e.target.value)}
            min={minDatetime}
            disabled={publishing}
            style={{ colorScheme: "dark" }}
            className="w-full rounded-[10px] border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-[12px] text-foreground focus:outline-none focus:border-cyan/20 disabled:opacity-50 mb-3"
          />

          {/* Note textarea — contextual prompt for follow-up/appointment path */}
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="What was promised? Note any objections or things to clarify next call."
            maxLength={300}
            rows={2}
            disabled={publishing}
            className="w-full resize-none rounded-[10px] border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-cyan/20 disabled:opacity-50 mb-2"
          />

          <Button
            onClick={handleConfirmPending}
            disabled={publishing}
            className="w-full gap-2 bg-cyan/15 hover:bg-cyan/25 text-cyan border border-cyan/25 text-sm font-semibold"
          >
            {publishing && selected === pendingDispo ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <pendingMeta.icon className="h-3.5 w-3.5" />
            )}
            Next: Confirm Outcome
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => handlePublish(pendingDispo)}
            disabled={publishing}
            className="w-full mt-1 gap-1.5 text-[11px] text-muted-foreground/50 hover:text-foreground"
          >
            Skip date &amp; qual — save now
          </Button>
        </div>

      ) : (
        /* ── Step 1: disposition grid ─────────────────────────── */
        <>
          <div className="grid grid-cols-1 gap-1.5 mb-2.5">
            {DISPO_OPTIONS.map((d) => {
              const Icon = d.icon;
              const isLoading = publishing && selected === d.key;
              return (
                <button
                  key={d.key}
                  onClick={() => handleDispoTap(d.key)}
                  disabled={publishing}
                  className={`flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-left transition-all duration-150 border ${d.bg} disabled:opacity-50`}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Icon className={`h-4 w-4 ${d.color}`} />
                  )}
                  <span className="text-sm font-medium flex-1">{d.label}</span>
                  {NEXT_STEP_DISPOS.has(d.key) && (
                    <span className="text-[9px] text-muted-foreground/30 uppercase tracking-wider">+ date</span>
                  )}
                  {!NEXT_STEP_DISPOS.has(d.key) && QUAL_CONFIRM_DISPOS.has(d.key) && (
                    <span className="text-[9px] text-muted-foreground/30 uppercase tracking-wider">+ qual</span>
                  )}
                </button>
              );
            })}
          </div>

          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Key points from this call…"
            maxLength={300}
            rows={2}
            disabled={publishing}
            className="w-full resize-none rounded-[10px] border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-cyan/20 disabled:opacity-50"
          />

          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            disabled={publishing}
            className="w-full mt-1.5 gap-1.5 text-[11px] text-muted-foreground/60 hover:text-foreground"
          >
            <SkipForward className="h-3 w-3" />
            Skip — next lead
          </Button>
        </>
      )}
      </>
      )}
    </GlassCard>
  );
}
