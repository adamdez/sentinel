"use client";

/**
 * InboundWritebackPanel
 *
 * Review surface for inbound call outcomes before they become durable CRM state.
 * Shown after an inbound seller call ends and the operator has logged an outcome.
 *
 * Workflow:
 *   1. Panel loads the pending draft (assembled from inbound event chain)
 *   2. Operator reviews: caller type, subject address, situation summary, disposition, callback
 *   3. Operator edits note_draft if needed
 *   4. Operator explicitly opts in (or out) to writing the note to leads.notes
 *   5. Operator clicks "Commit to CRM" — triggers POST .../commit
 *   6. Panel shows confirmation with calls_log_id and any leads.notes update
 *
 * Design rules:
 *   - update_lead_notes defaults to FALSE — operator must explicitly check the box
 *   - note_source shows "operator" or "ai draft" so Logan knows what he's approving
 *   - No CRM qualification fields touched (motivation, timeline, etc.)
 *   - Committed state is read-only — shows result, no re-submit
 *   - Panel renders nothing if inbound event has no lead context (unknown caller, no lead_id)
 */

import { useState, useEffect, useCallback } from "react";
import {
  Phone, Check, Loader2, User, MapPin, FileText,
  CalendarClock, AlertTriangle, CheckCircle2, ChevronDown,
  ChevronUp, Sparkles, Pen,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type {
  InboundWritebackDraft,
  InboundCallerType,
  InboundDisposition,
} from "@/lib/dialer/types";
import { INBOUND_DISPOSITIONS } from "@/lib/dialer/types";

// ── Auth helper ───────────────────────────────────────────────────────────────

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (session?.access_token) h["Authorization"] = `Bearer ${session.access_token}`;
  return h;
}

// ── Caller type badge ─────────────────────────────────────────────────────────

const CALLER_TYPE_STYLES: Record<InboundCallerType, string> = {
  seller:  "border-primary/25 bg-primary/[0.08] text-primary/80",
  buyer:   "border-border/25 bg-muted/[0.08] text-foreground/80",
  vendor:  "border-overlay-10 bg-overlay-3 text-muted-foreground/50",
  spam:    "border-border/25 bg-muted/[0.08] text-foreground/60",
  unknown: "border-border/20 bg-muted/[0.05] text-foreground/60",
};

const CALLER_TYPE_LABELS: Record<InboundCallerType, string> = {
  seller:  "Seller",
  buyer:   "Buyer",
  vendor:  "Vendor",
  spam:    "Spam",
  unknown: "Unknown",
};

function CallerTypeBadge({ type }: { type: InboundCallerType }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-[5px] border px-1.5 py-0.5 text-sm font-semibold uppercase tracking-wide ${CALLER_TYPE_STYLES[type]}`}>
      <User className="h-2.5 w-2.5" aria-hidden="true" />
      {CALLER_TYPE_LABELS[type]}
    </span>
  );
}

// ── Note source badge ─────────────────────────────────────────────────────────

function NoteSourceBadge({ source }: { source: "operator" | "ai_draft" }) {
  if (source === "ai_draft") return (
    <span className="inline-flex items-center gap-0.5 text-xs text-foreground/50">
      <span aria-hidden="true"><Sparkles className="h-2.5 w-2.5" /></span>
      AI draft — review before committing
    </span>
  );
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground/30">
      <span aria-hidden="true"><Pen className="h-2.5 w-2.5" /></span>
      Operator-written
    </span>
  );
}

// ── InboundWritebackPanel ─────────────────────────────────────────────────────

export interface InboundWritebackPanelProps {
  /** The inbound.answered or inbound.missed event_id */
  inboundEventId: string;
  /** Whether to show the panel at all (e.g. only for seller calls) */
  visible?: boolean;
}

export function InboundWritebackPanel({
  inboundEventId,
  visible = true,
}: InboundWritebackPanelProps) {
  const [draft,       setDraft]       = useState<InboundWritebackDraft | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [open,        setOpen]        = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [committing,  setCommitting]  = useState(false);
  const [committed,   setCommitted]   = useState(false);
  const [commitResult, setCommitResult] = useState<{ calls_log_id: string; lead_notes_updated: boolean } | null>(null);
  const [error,       setError]       = useState<string | null>(null);

  // Editable fields (local state, synced to draft on save)
  const [editNote,          setEditNote]          = useState("");
  const [editDisposition,   setEditDisposition]   = useState<InboundDisposition>("seller_answered");
  const [editAddress,       setEditAddress]       = useState("");
  const [updateLeadNotes,   setUpdateLeadNotes]   = useState(false);

  const loadDraft = useCallback(async () => {
    if (!inboundEventId) return;
    setLoading(true);
    setError(null);
    try {
      const h = await authHeaders();
      const res = await fetch(`/api/dialer/v1/inbound/${inboundEventId}/draft`, { headers: h });
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json() as { draft: InboundWritebackDraft; committed: boolean };
      setDraft(data.draft);
      setEditNote(data.draft.note_draft ?? data.draft.situation_summary ?? "");
      setEditDisposition(data.draft.disposition);
      setEditAddress(data.draft.subject_address ?? "");
      setUpdateLeadNotes(data.draft.update_lead_notes ?? false);
      if (data.committed) {
        setCommitted(true);
        setCommitResult({
          calls_log_id:       data.draft.calls_log_id ?? "",
          lead_notes_updated: false,
        });
      }
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, [inboundEventId]);

  useEffect(() => { void loadDraft(); }, [loadDraft]);

  const handleSaveDraft = async () => {
    if (!draft || saving) return;
    setSaving(true);
    try {
      const h = await authHeaders();
      await fetch(`/api/dialer/v1/inbound/${inboundEventId}/draft`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({
          ...draft,
          note_draft:        editNote.trim() || null,
          disposition:       editDisposition,
          subject_address:   editAddress.trim() || null,
          update_lead_notes: updateLeadNotes,
          note_source:       "operator",
        }),
      });
    } catch { /* non-fatal */ }
    finally { setSaving(false); }
  };

  const handleCommit = async () => {
    if (!draft || committing || committed) return;
    setCommitting(true);
    setError(null);
    try {
      const h = await authHeaders();
      const res = await fetch(`/api/dialer/v1/inbound/${inboundEventId}/commit`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({
          caller_type:       draft.caller_type,
          disposition:       editDisposition,
          note_draft:        editNote.trim() || null,
          situation_summary: draft.situation_summary,
          subject_address:   editAddress.trim() || null,
          callback_at:       draft.callback_at,
          update_lead_notes: updateLeadNotes,
          note_source:       editNote !== draft.situation_summary ? "operator" : draft.note_source,
        }),
      });
      const data = await res.json() as { ok: boolean; calls_log_id: string; lead_notes_updated: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Commit failed");
      } else {
        setCommitted(true);
        setCommitResult({ calls_log_id: data.calls_log_id, lead_notes_updated: data.lead_notes_updated });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setCommitting(false);
    }
  };

  if (!visible || loading) return null;
  if (!draft) return null;

  // Don't render for non-seller or spam callers — writeback not useful
  if (draft.caller_type === "spam" || draft.caller_type === "vendor") return null;

  return (
    <div className="rounded-[12px] border border-primary/[0.12] bg-primary/[0.015]">
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-primary/[0.02] transition-colors rounded-[12px]"
      >
        <Phone className="h-3.5 w-3.5 text-primary/50 shrink-0" aria-hidden="true" />
        <span className="text-sm font-semibold uppercase tracking-wider text-primary/50 flex-1 text-left">
          Inbound Call — CRM Writeback
        </span>
        {committed && (
          <span className="flex items-center gap-0.5 text-xs text-foreground/60 font-medium">
            <CheckCircle2 className="h-2.5 w-2.5" aria-hidden="true" /> Committed
          </span>
        )}
        {!committed && !loading && (
          <CallerTypeBadge type={draft.caller_type} />
        )}
        {open
          ? <ChevronUp   className="h-3 w-3 text-primary/20 shrink-0" aria-hidden="true" />
          : <ChevronDown className="h-3 w-3 text-primary/20 shrink-0" aria-hidden="true" />}
      </button>

      {/* Body */}
      {open && (
        <div className="px-3 pb-3 border-t border-primary/[0.08] pt-2.5 space-y-3">

          {/* ── Committed view ───────────────────────────────────── */}
          {committed && commitResult && (
            <div className="rounded-[8px] border border-border/15 bg-muted/[0.04] px-3 py-2.5 space-y-1">
              <p className="text-sm text-foreground/70 font-medium flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                Call committed to CRM
              </p>
              <p className="text-sm text-muted-foreground/40">
                Call log created. {commitResult.lead_notes_updated ? "Lead notes updated." : "Lead notes not updated."}
              </p>
            </div>
          )}

          {/* ── Review/edit form ────────────────────────────────── */}
          {!committed && (
            <>
              {/* Context row */}
              <div className="flex flex-wrap gap-2 items-center">
                <CallerTypeBadge type={draft.caller_type} />
                {draft.from_number && (
                  <span className="text-sm text-muted-foreground/40 font-mono">{draft.from_number}</span>
                )}
                {draft.lead_id && (
                  <span className="text-xs text-primary/30">Lead matched</span>
                )}
                {!draft.lead_id && (
                  <span className="inline-flex items-center gap-0.5 text-xs text-foreground/50">
                    <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
                    No lead matched
                  </span>
                )}
              </div>

              {/* Subject address */}
              <div className="space-y-1">
                <label className="flex items-center gap-1 text-xs uppercase tracking-wider text-muted-foreground/40">
                  <MapPin className="h-2.5 w-2.5" aria-hidden="true" /> Subject address
                </label>
                <input
                  type="text"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  placeholder="Property address caller mentioned…"
                  maxLength={300}
                  className="w-full rounded-[7px] border border-overlay-8 bg-overlay-2 px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/25 focus:outline-none focus:border-primary/20"
                />
              </div>

              {/* Note draft */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1 text-xs uppercase tracking-wider text-muted-foreground/40">
                    <FileText className="h-2.5 w-2.5" aria-hidden="true" /> Note for call log
                  </label>
                  <NoteSourceBadge source={draft.note_source} />
                </div>
                <textarea
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="Situation summary or call notes…"
                  maxLength={1200}
                  rows={4}
                  className="w-full resize-none rounded-[7px] border border-overlay-8 bg-overlay-2 px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/25 focus:outline-none focus:border-primary/20"
                />
                <p className="text-xs text-muted-foreground/20 text-right">
                  {editNote.length}/1200
                </p>
              </div>

              {/* Disposition */}
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wider text-muted-foreground/40">
                  Disposition
                </label>
                <select
                  value={editDisposition}
                  onChange={(e) => setEditDisposition(e.target.value as InboundDisposition)}
                  className="h-7 w-full text-sm rounded-[7px] border border-overlay-8 bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring/20"
                >
                  {INBOUND_DISPOSITIONS.map((d) => (
                    <option key={d} value={d}>{d.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>

              {/* leads.notes opt-in — explicit gate */}
              {draft.lead_id && (
                <label className="flex items-start gap-2 cursor-pointer rounded-[8px] border border-overlay-5 bg-overlay-2 px-2.5 py-2 hover:bg-overlay-3 transition-colors">
                  <input
                    type="checkbox"
                    checked={updateLeadNotes}
                    onChange={(e) => setUpdateLeadNotes(e.target.checked)}
                    className="mt-0.5 h-3 w-3 rounded border-overlay-20 bg-overlay-3 accent-cyan"
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground/65">
                      Also write note to lead record
                    </p>
                    <p className="text-xs text-muted-foreground/30 leading-relaxed">
                      Updates <code className="text-xs">leads.notes</code> with the note above.
                      Overwrites existing lead notes — only check if this is the best available summary.
                    </p>
                  </div>
                </label>
              )}

              {/* Error */}
              {error && (
                <p className="text-sm text-foreground/70 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {error}
                </p>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={saving || committing}
                  className="flex items-center gap-1.5 rounded-[7px] border border-overlay-8 bg-overlay-2 px-2.5 py-1 text-sm text-muted-foreground/50 hover:text-foreground/70 transition-colors disabled:opacity-40"
                >
                  {saving ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : null}
                  Save draft
                </button>
                <button
                  type="button"
                  onClick={handleCommit}
                  disabled={committing || saving || !editNote.trim()}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-[7px] border border-primary/20 bg-primary/[0.08] px-3 py-1 text-sm font-semibold text-primary/70 hover:bg-primary/[0.12] transition-colors disabled:opacity-40"
                >
                  {committing
                    ? <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden="true" />
                    : <Check className="h-2.5 w-2.5" aria-hidden="true" />}
                  {committing ? "Committing…" : "Commit to CRM"}
                </button>
              </div>

              {/* Contract clarity */}
              <p className="text-xs text-muted-foreground/20 leading-relaxed pt-0.5">
                Commit creates a call log entry. Qualification fields (motivation, timeline) are not
                written — those require a full dialer session with the confirmed decision-maker.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
