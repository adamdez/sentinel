"use client";

/**
 * VoiceConsentLedger — compact review card for voice interaction policy visibility
 *
 * Shows medium/high/review-tier interactions from the voice_interaction_ledger
 * for the last N days. Adam can mark entries reviewed, corrected, or dismissed,
 * and optionally correct consent_basis, automation_tier, or dnc_flag.
 *
 * Rendered on /dialer/review and /dialer/war-room.
 * Does NOT render low-risk entries by default.
 *
 * BOUNDARY:
 *   - Reads from GET /api/dialer/v1/voice-ledger
 *   - Writes only through PATCH /api/dialer/v1/voice-ledger/[entry_id]
 *   - Zero direct Supabase queries — all through API routes
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  ShieldAlert, ChevronDown, ChevronUp, Loader2, CheckCircle2,
  X, RefreshCw,
} from "lucide-react";
import {
  VOICE_INTERACTION_LABELS,
  CONSENT_BASIS_LABELS,
  AUTOMATION_TIER_LABELS,
  RISK_TIER_LABELS,
  RISK_TIER_COLORS,
  LEDGER_REVIEW_STATUS_LABELS,
  type VoiceLedgerEntry,
  type RiskTier,
  type ConsentBasis,
  type AutomationTier,
  type LedgerReviewStatus,
} from "@/lib/voice-consent";

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Session expired");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  };
}

// ── API helpers ───────────────────────────────────────────────────────────────

interface LedgerResponse {
  rows:   VoiceLedgerEntry[];
  counts: { total: number; high: number; review: number; medium: number; pending: number };
  days:   number;
}

async function fetchLedger(days = 14): Promise<LedgerResponse> {
  const h   = await getHeaders();
  const res = await fetch(`/api/dialer/v1/voice-ledger?days=${days}`, { headers: h });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to load ledger");
  return res.json();
}

async function patchEntry(
  entryId: string,
  patch: {
    review_status:   LedgerReviewStatus;
    review_note?:    string;
    consent_basis?:  ConsentBasis;
    automation_tier?: AutomationTier;
    dnc_flag?:       boolean;
  }
): Promise<VoiceLedgerEntry> {
  const h   = await getHeaders();
  const res = await fetch(`/api/dialer/v1/voice-ledger/${entryId}`, {
    method:  "PATCH",
    headers: h,
    body:    JSON.stringify(patch),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to update entry");
  return (await res.json()).entry;
}

// ── Risk badge ────────────────────────────────────────────────────────────────

function RiskBadge({ tier }: { tier: RiskTier }) {
  const c = RISK_TIER_COLORS[tier];
  return (
    <span className={`inline-flex items-center text-xs px-1.5 py-0.5 rounded border font-medium ${c.bg} ${c.text} ${c.border}`}>
      {RISK_TIER_LABELS[tier]}
    </span>
  );
}

// ── Single entry row ──────────────────────────────────────────────────────────

function EntryRow({
  entry,
  onReview,
}: {
  entry:    VoiceLedgerEntry;
  onReview: (id: string, status: LedgerReviewStatus, note?: string, corrections?: {
    consent_basis?: ConsentBasis;
    automation_tier?: AutomationTier;
    dnc_flag?: boolean;
  }) => Promise<void>;
}) {
  const [open,        setOpen]       = useState(false);
  const [saving,      setSaving]     = useState(false);
  const [note,        setNote]       = useState("");
  const [consentCorr, setConsentCorr] = useState<ConsentBasis | "">("" as ConsentBasis | "");
  const [autoCorr,    setAutoCorr]   = useState<AutomationTier | "">("" as AutomationTier | "");
  const [dncCorr,     setDncCorr]    = useState<boolean | null>(null);

  const isDone = entry.review_status !== "pending";

  async function handleAction(status: LedgerReviewStatus) {
    setSaving(true);
    try {
      const corrections: { consent_basis?: ConsentBasis; automation_tier?: AutomationTier; dnc_flag?: boolean } = {};
      if (consentCorr) corrections.consent_basis  = consentCorr as ConsentBasis;
      if (autoCorr)    corrections.automation_tier = autoCorr as AutomationTier;
      if (dncCorr !== null) corrections.dnc_flag  = dncCorr;
      await onReview(entry.id, status, note.trim() || undefined, Object.keys(corrections).length ? corrections : undefined);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`rounded-[8px] border transition-colors ${
      isDone
        ? "border-white/[0.03] bg-white/[0.005]"
        : entry.risk_tier === "high"
          ? "border-border/20 bg-muted/[0.02]"
          : entry.risk_tier === "review"
            ? "border-border/20 bg-muted/[0.02]"
            : "border-white/[0.05] bg-white/[0.01]"
    }`}>
      <button
        type="button"
        className="w-full flex items-center gap-2 px-2.5 py-2 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <RiskBadge tier={entry.risk_tier} />
        <span className="flex-1 text-sm text-foreground/65 truncate">
          {(VOICE_INTERACTION_LABELS as Record<string, string>)[entry.interaction_type] ?? entry.interaction_type}
        </span>
        {entry.dnc_flag && (
          <span className="text-xs px-1 rounded border border-border/40 bg-muted/10 text-foreground shrink-0">DNC</span>
        )}
        {entry.ai_assisted && (
          <span className="text-xs px-1 rounded border border-border/30 bg-muted/10 text-foreground shrink-0">AI</span>
        )}
        <span className="text-xs text-muted-foreground/30 shrink-0">
          {new Date(entry.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
        {isDone
          ? <CheckCircle2 className="h-3 w-3 text-muted-foreground/25 shrink-0" />
          : open
            ? <ChevronUp   className="h-3 w-3 text-muted-foreground/30 shrink-0" />
            : <ChevronDown className="h-3 w-3 text-muted-foreground/30 shrink-0" />
        }
      </button>

      {open && (
        <div className="px-2.5 pb-2.5 space-y-2 border-t border-white/[0.04] pt-2">
          {/* Detail fields */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div>
              <span className="text-muted-foreground/40">Consent basis</span>
              <p className="text-foreground/60">
                {(CONSENT_BASIS_LABELS as Record<string, string>)[entry.consent_basis] ?? entry.consent_basis}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground/40">Automation tier</span>
              <p className="text-foreground/60">
                {(AUTOMATION_TIER_LABELS as Record<string, string>)[entry.automation_tier] ?? entry.automation_tier}
              </p>
            </div>
            {entry.script_class && (
              <div>
                <span className="text-muted-foreground/40">Script class</span>
                <p className="text-foreground/60 font-mono text-xs">{entry.script_class}</p>
              </div>
            )}
            {entry.handoff_rule_version && (
              <div>
                <span className="text-muted-foreground/40">Handoff rule</span>
                <p className="text-foreground/60 font-mono text-xs">v{entry.handoff_rule_version}</p>
              </div>
            )}
            {entry.context_notes && (
              <div className="col-span-2">
                <span className="text-muted-foreground/40">Context</span>
                <p className="text-foreground/50">{entry.context_notes}</p>
              </div>
            )}
            <div>
              <span className="text-muted-foreground/40">Review status</span>
              <p className="text-foreground/60">
                {(LEDGER_REVIEW_STATUS_LABELS as Record<string, string>)[entry.review_status] ?? entry.review_status}
              </p>
            </div>
            {entry.review_note && (
              <div className="col-span-2">
                <span className="text-muted-foreground/40">Review note</span>
                <p className="text-foreground/60 italic">{entry.review_note}</p>
              </div>
            )}
          </div>

          {/* Review actions (only for pending) */}
          {!isDone && (
            <div className="space-y-2 pt-1 border-t border-white/[0.04]">
              {/* Optional corrections */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs uppercase tracking-wider text-muted-foreground/35">Correct consent basis</label>
                  <select
                    value={consentCorr}
                    onChange={e => setConsentCorr(e.target.value as ConsentBasis | "")}
                    className="mt-0.5 w-full rounded border border-input bg-background px-1.5 py-1 text-xs text-foreground"
                  >
                    <option value="">— no change —</option>
                    <option value="inbound_response">Inbound (caller initiated)</option>
                    <option value="prior_opt_in">Prior opt-in</option>
                    <option value="marketing_list">Marketing list</option>
                    <option value="referral">Referral</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider text-muted-foreground/35">Correct automation tier</label>
                  <select
                    value={autoCorr}
                    onChange={e => setAutoCorr(e.target.value as AutomationTier | "")}
                    className="mt-0.5 w-full rounded border border-input bg-background px-1.5 py-1 text-xs text-foreground"
                  >
                    <option value="">— no change —</option>
                    <option value="operator_led">Operator-led</option>
                    <option value="ai_assisted">AI-assisted</option>
                    <option value="automation_prep">Automation prep</option>
                  </select>
                </div>
              </div>

              {/* DNC flag correction */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`dnc-${entry.id}`}
                  checked={dncCorr ?? entry.dnc_flag}
                  onChange={e => setDncCorr(e.target.checked)}
                  className="h-3 w-3"
                />
                <label htmlFor={`dnc-${entry.id}`} className="text-xs text-foreground/60">
                  Mark as DNC-adjacent (flag for no-contact)
                </label>
              </div>

              {/* Note */}
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Optional review note…"
                className="w-full rounded border border-input bg-background px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground/30"
              />

              {/* Action buttons */}
              <div className="flex gap-1.5 flex-wrap">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleAction("reviewed")}
                  className="flex items-center gap-1 rounded-[6px] border border-border/30 bg-muted/[0.06] px-2 py-1 text-xs text-foreground hover:bg-muted/[0.12] transition-colors"
                >
                  {saving ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <CheckCircle2 className="h-2.5 w-2.5" />}
                  Reviewed
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleAction("corrected")}
                  className="flex items-center gap-1 rounded-[6px] border border-border/30 bg-muted/[0.06] px-2 py-1 text-xs text-foreground hover:bg-muted/[0.12] transition-colors"
                >
                  Corrected
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleAction("dismissed")}
                  className="flex items-center gap-1 rounded-[6px] border border-white/[0.08] bg-white/[0.02] px-2 py-1 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                >
                  <X className="h-2.5 w-2.5" />
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface VoiceConsentLedgerProps {
  days?:      number;
  className?: string;
}

export function VoiceConsentLedger({ days = 14, className = "" }: VoiceConsentLedgerProps) {
  const [open,    setOpen]    = useState(true);
  const [data,    setData]    = useState<LedgerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchLedger(days);
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  async function handleReview(
    id: string,
    status: LedgerReviewStatus,
    note?: string,
    corrections?: { consent_basis?: ConsentBasis; automation_tier?: AutomationTier; dnc_flag?: boolean }
  ) {
    const updated = await patchEntry(id, { review_status: status, review_note: note, ...corrections });
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        rows: prev.rows.map(r => r.id === id ? updated : r),
      };
    });
  }

  const pendingCount = data?.counts.pending ?? 0;
  const highCount    = data?.counts.high    ?? 0;

  return (
    <div className={`rounded-[12px] border ${
      highCount > 0
        ? "border-border/20 bg-muted/[0.01]"
        : "border-white/[0.06] bg-white/[0.01]"
    } ${className}`}>
      {/* Header */}
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-white/[0.02] transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <ShieldAlert className={`h-3.5 w-3.5 shrink-0 ${highCount > 0 ? "text-foreground/70" : "text-muted-foreground/40"}`} />
        <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/60">
          Voice Policy Ledger
        </span>
        <span className="text-xs text-muted-foreground/30">
          last {days}d
        </span>
        {!loading && data && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground/35">
            {highCount > 0 && (
              <span className="px-1.5 py-0.5 rounded border border-border/30 bg-muted/10 text-foreground text-xs">
                {highCount} high
              </span>
            )}
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.5 rounded border border-border/30 bg-muted/10 text-foreground text-xs">
                {pendingCount} pending
              </span>
            )}
          </span>
        )}
        <button
          type="button"
          onClick={e => { e.stopPropagation(); load(); }}
          disabled={loading}
          className="shrink-0 p-0.5 rounded text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </button>
        {open
          ? <ChevronUp   className="h-3 w-3 text-muted-foreground/30 shrink-0" />
          : <ChevronDown className="h-3 w-3 text-muted-foreground/30 shrink-0" />
        }
      </button>

      {open && (
        <div className="px-3 pb-3 border-t border-white/[0.04] pt-2 space-y-2">
          {loading && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground/30">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </div>
          )}

          {error && (
            <p className="text-sm text-foreground">{error}</p>
          )}

          {!loading && !error && data && data.rows.length === 0 && (
            <p className="text-sm text-muted-foreground/30">
              No medium/high/review-tier interactions in the last {days} days.
            </p>
          )}

          {!loading && !error && data && data.rows.length > 0 && (
            <div className="space-y-1.5">
              {data.rows.map(entry => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  onReview={handleReview}
                />
              ))}
            </div>
          )}

          {/* Boundary note */}
          <p className="text-xs text-muted-foreground/25 pt-1">
            Low-risk inbound-response interactions are not shown.{" "}
            Risk tier is derived from consent basis, automation tier, and DNC flag.
            This ledger does not block calls — it provides visibility only.
          </p>
        </div>
      )}
    </div>
  );
}
