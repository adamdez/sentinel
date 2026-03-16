"use client";

/**
 * OutboundPrepCard
 *
 * Compact review card for a single outbound_prep_frame.
 * Shows: qual snapshot, objection tags, trust snippets, seller pages,
 *        handoff readiness verdict, and review controls.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PREP ONLY — NO LIVE CALLS. This card never triggers Twilio or outbound SIP.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * BOUNDARY: Reads from outbound_prep_frames. Does NOT read CRM tables directly.
 * Review actions go through PATCH /api/dialer/v1/outbound-prep/[frame_id].
 */

import { useState } from "react";
import {
  CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp,
  ShieldAlert, Loader2, Phone, MapPin, Clock, TrendingUp,
  MessageSquare, Link2, Sparkles, Pen,
} from "lucide-react";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  PREP_FRAME_REVIEW_STATUS_LABELS,
  PREP_FRAME_REVIEW_STATUS_COLORS,
  type PrepFrameReviewStatus,
} from "@/lib/outbound-prep";
import { getTrustSnippet, type TrustSnippetKey } from "@/lib/trust-language";
import { getSellerPage, type SellerPageKey } from "@/lib/public-pages";
import { OBJECTION_TAG_LABELS, type ObjectionTag } from "@/lib/dialer/types";
import { supabase } from "@/lib/supabase";

// ── Row type (subset of DB row) ───────────────────────────────────────────────

export interface PrepFrameCardRow {
  id:                    string;
  lead_id:               string;
  assembled_at:          string;
  opener_script_key:     string | null;
  opener_script_version: string | null;
  qual_snapshot:         Record<string, unknown>;
  objection_tags:        string[];
  trust_snippets_used:   string[];
  seller_pages_included: string[];
  handoff_ready:         boolean;
  fallback_reason:       string | null;
  review_status:         PrepFrameReviewStatus;
  reviewer_notes:        string | null;
  reviewed_at:           string | null;
  automation_tier:       string;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PrepOnlyBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest rounded border border-amber-500/30 bg-amber-500/10 text-amber-400 px-1.5 py-0.5">
      <ShieldAlert className="w-2.5 h-2.5" />
      Prep only — no call placed
    </span>
  );
}

function ReadinessChip({ ready, reason }: { ready: boolean; reason: string | null }) {
  return ready ? (
    <span className="inline-flex items-center gap-1 text-[10px] rounded border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 px-2 py-0.5">
      <CheckCircle2 className="w-2.5 h-2.5" />
      Handoff ready
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[10px] rounded border border-red-500/20 bg-red-500/10 text-red-400 px-2 py-0.5">
      <XCircle className="w-2.5 h-2.5" />
      Not ready{reason ? ` — ${reason}` : ""}
    </span>
  );
}

function SnapRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-1.5">
      <Icon className="w-3 h-3 mt-0.5 text-muted-foreground/40 flex-shrink-0" />
      <span className="text-[10px] text-muted-foreground/50 w-20 flex-shrink-0">{label}</span>
      <span className="text-[10px] text-muted-foreground leading-snug">{value}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface OutboundPrepCardProps {
  frame:      PrepFrameCardRow;
  onReviewed?: (updated: PrepFrameCardRow) => void;
}

export function OutboundPrepCard({ frame, onReviewed }: OutboundPrepCardProps) {
  const [expanded,      setExpanded]      = useState(false);
  const [reviewNotes,   setReviewNotes]   = useState(frame.reviewer_notes ?? "");
  const [saving,        setSaving]        = useState(false);
  const [localStatus,   setLocalStatus]   = useState<PrepFrameReviewStatus>(frame.review_status);
  const [localReviewed, setLocalReviewed] = useState(frame.reviewed_at);

  const snap = frame.qual_snapshot;
  const ageDays = Math.floor(
    (Date.now() - new Date(frame.assembled_at).getTime()) / 86_400_000,
  );

  async function handleReview(status: PrepFrameReviewStatus) {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;

      const res = await fetch(`/api/dialer/v1/outbound-prep/${frame.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ review_status: status, reviewer_notes: reviewNotes }),
      });
      if (!res.ok) throw new Error("Failed to save review");
      const { frame: updated } = await res.json();
      setLocalStatus(updated.review_status);
      setLocalReviewed(updated.reviewed_at);
      onReviewed?.({ ...frame, review_status: updated.review_status, reviewer_notes: updated.reviewer_notes, reviewed_at: updated.reviewed_at });
    } catch (err) {
      console.error("[OutboundPrepCard] review error", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <GlassCard className="p-3 space-y-2.5">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <PrepOnlyBadge />
            <Badge
              variant="outline"
              className={`text-[9px] px-1.5 py-0 ${PREP_FRAME_REVIEW_STATUS_COLORS[localStatus]}`}
            >
              {PREP_FRAME_REVIEW_STATUS_LABELS[localStatus]}
            </Badge>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <ReadinessChip ready={frame.handoff_ready} reason={frame.fallback_reason} />
            <span className="text-[9px] text-muted-foreground/40">
              {ageDays === 0 ? "Today" : `${ageDays}d ago`}
            </span>
            {frame.opener_script_key && (
              <span className="text-[9px] text-muted-foreground/40">
                Script: {frame.opener_script_key}
                {frame.opener_script_version ? ` v${frame.opener_script_version}` : ""}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-muted-foreground/40 hover:text-muted-foreground transition-colors flex-shrink-0 mt-0.5"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded
            ? <ChevronUp className="w-3.5 h-3.5" />
            : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* ── Qual snapshot (always visible) ── */}
      <div className="space-y-1">
        <SnapRow icon={MapPin}    label="Address"    value={snap.address as string | null} />
        <SnapRow icon={Phone}     label="Phone"      value={snap.phone as string | null} />
        <SnapRow icon={TrendingUp} label="Motivation" value={snap.motivationLevel != null ? `${snap.motivationLevel}/5` : null} />
        <SnapRow icon={Clock}     label="Timeline"   value={snap.sellerTimeline as string | null} />
        <SnapRow icon={Phone}     label="Calls"      value={snap.totalCalls != null ? `${snap.totalCalls} total, ${snap.liveAnswers} live` : null} />
        {typeof snap.openTaskTitle === "string" && snap.openTaskTitle && (
          <SnapRow icon={CheckCircle2} label="Open task" value={snap.openTaskTitle} />
        )}
      </div>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div className="space-y-3 pt-1 border-t border-white/[0.04]">

          {/* Objections */}
          {frame.objection_tags.length > 0 && (
            <div className="space-y-1">
              <span className="text-[9px] uppercase text-muted-foreground/40 tracking-wide flex items-center gap-1">
                <AlertTriangle className="w-2.5 h-2.5" />
                Objections at assembly
              </span>
              <div className="flex flex-wrap gap-1">
                {frame.objection_tags.map(tag => (
                  <Badge key={tag} variant="outline" className="text-[9px] px-1.5 py-0 border-amber-500/20 text-amber-400 bg-amber-500/5">
                    {OBJECTION_TAG_LABELS[tag as ObjectionTag] ?? tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Trust snippets */}
          {frame.trust_snippets_used.length > 0 && (
            <div className="space-y-1">
              <span className="text-[9px] uppercase text-muted-foreground/40 tracking-wide flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" aria-hidden="true" />
                Trust snippets selected
              </span>
              <div className="space-y-1">
                {frame.trust_snippets_used.map(key => {
                  try {
                    const s = getTrustSnippet(key as TrustSnippetKey);
                    return (
                      <div key={key} className="text-[10px] text-muted-foreground/70 bg-white/[0.02] rounded px-2 py-1">
                        <span className="font-medium text-muted-foreground">{s.label}: </span>
                        {s.summary}
                      </div>
                    );
                  } catch {
                    return <div key={key} className="text-[10px] text-muted-foreground/40">{key}</div>;
                  }
                })}
              </div>
            </div>
          )}

          {/* Seller pages */}
          {frame.seller_pages_included.length > 0 && (
            <div className="space-y-1">
              <span className="text-[9px] uppercase text-muted-foreground/40 tracking-wide flex items-center gap-1">
                <Link2 className="w-2.5 h-2.5" />
                Seller pages included
              </span>
              <div className="flex flex-wrap gap-1">
                {frame.seller_pages_included.map(key => {
                  try {
                    const p = getSellerPage(key as SellerPageKey);
                    return (
                      <a
                        key={key}
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-emerald-400 hover:underline"
                      >
                        {p.label}
                      </a>
                    );
                  } catch {
                    return <span key={key} className="text-[10px] text-muted-foreground/40">{key}</span>;
                  }
                })}
              </div>
            </div>
          )}

          {/* Last call notes */}
          {typeof snap.lastCallNotes === "string" && snap.lastCallNotes && (
            <div className="space-y-1">
              <span className="text-[9px] uppercase text-muted-foreground/40 tracking-wide flex items-center gap-1">
                <Pen className="w-2.5 h-2.5" aria-hidden="true" />
                Last call notes
              </span>
              <p className="text-[10px] text-muted-foreground/70 leading-relaxed bg-white/[0.02] rounded px-2 py-1">
                {snap.lastCallNotes}
              </p>
            </div>
          )}

          {/* Review controls */}
          <div className="space-y-2 pt-1 border-t border-white/[0.04]">
            <span className="text-[9px] uppercase text-muted-foreground/40 tracking-wide flex items-center gap-1">
              <MessageSquare className="w-2.5 h-2.5" />
              Review this frame
            </span>
            <Textarea
              value={reviewNotes}
              onChange={e => setReviewNotes(e.target.value)}
              placeholder="Reviewer notes — what's missing, what looks good…"
              className="text-xs min-h-[56px] bg-white/[0.03] border-white/[0.06]"
              rows={2}
            />
            {localReviewed && (
              <p className="text-[9px] text-muted-foreground/40">
                Last reviewed: {new Date(localReviewed).toLocaleDateString()}
              </p>
            )}
            <div className="flex gap-1.5 flex-wrap">
              {(["approved", "flagged", "rejected"] as PrepFrameReviewStatus[]).map(status => (
                <Button
                  key={status}
                  variant="outline"
                  size="sm"
                  disabled={saving || localStatus === status}
                  onClick={() => handleReview(status)}
                  className={`text-[10px] h-6 px-2 ${
                    status === "approved" ? "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10" :
                    status === "flagged"  ? "border-amber-500/30 text-amber-400 hover:bg-amber-500/10" :
                                           "border-red-500/30 text-red-400 hover:bg-red-500/10"
                  } ${localStatus === status ? "opacity-40 cursor-default" : ""}`}
                >
                  {saving ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : status.charAt(0).toUpperCase() + status.slice(1)}
                </Button>
              ))}
            </div>
          </div>

        </div>
      )}
    </GlassCard>
  );
}
