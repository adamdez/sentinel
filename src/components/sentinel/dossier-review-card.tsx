"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import {
  CheckCircle2,
  XCircle,
  Pencil,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  User,
  Lightbulb,
  AlertTriangle,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import type {
  DossierTopFact,
  DossierVerificationItem,
  DossierSourceLink,
} from "@/hooks/use-dossier";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DossierQueueItem {
  id: string;
  lead_id: string;
  property_id: string | null;
  status: string;
  situation_summary: string | null;
  likely_decision_maker: string | null;
  top_facts: DossierTopFact[] | null;
  recommended_call_angle: string | null;
  verification_checklist: DossierVerificationItem[] | null;
  source_links: DossierSourceLink[] | null;
  ai_run_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
  leads: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    stage: string | null;
    status: string | null;
    notes: string | null;
    decision_maker_note: string | null;
    monetizability_score: number | null;
    dispo_friction_level: string | null;
    source: string | null;
    assigned_to: string | null;
    created_at: string;
  } | null;
  properties: {
    id: string;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    county: string | null;
  } | null;
}

interface DossierReviewCardProps {
  item: DossierQueueItem;
  onDone: (id: string, newStatus: "reviewed" | "flagged" | "promoted") => void;
}

// ── DossierReviewCard ─────────────────────────────────────────────────────────

export function DossierReviewCard({ item, onDone }: DossierReviewCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Editable field state — initialized from dossier values
  const [editSummary, setEditSummary] = useState(item.situation_summary ?? "");
  const [editDecisionMaker, setEditDecisionMaker] = useState(item.likely_decision_maker ?? "");
  const [editCallAngle, setEditCallAngle] = useState(item.recommended_call_angle ?? "");
  const [reviewNotes, setReviewNotes] = useState("");

  const leadName = [item.leads?.first_name, item.leads?.last_name].filter(Boolean).join(" ") || "Unknown lead";
  const address = [item.properties?.address, item.properties?.city, item.properties?.state]
    .filter(Boolean).join(", ") || null;
  const crawledAt = item.created_at
    ? new Date(item.created_at).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
      })
    : null;

  async function getHeaders() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Session expired");
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    };
  }

  async function handleApprove() {
    setBusy(true);
    setActionError(null);
    try {
      const headers = await getHeaders();

      // Step 1: review (optionally with edits)
      const reviewBody: Record<string, unknown> = {
        dossier_id: item.id,
        status: "reviewed",
        review_notes: reviewNotes || null,
      };
      if (editing) {
        reviewBody.situation_summary = editSummary || null;
        reviewBody.likely_decision_maker = editDecisionMaker || null;
        reviewBody.recommended_call_angle = editCallAngle || null;
      }

      const reviewRes = await fetch(`/api/dossiers/${item.lead_id}/review`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(reviewBody),
      });
      if (!reviewRes.ok) {
        const b = await reviewRes.json().catch(() => ({}));
        throw new Error(b.error || "Review failed");
      }

      // Step 2: auto-promote so CRM fields are written
      const promoteRes = await fetch(`/api/dossiers/${item.lead_id}/promote`, {
        method: "POST",
        headers,
        body: JSON.stringify({ dossier_id: item.id }),
      });
      if (!promoteRes.ok) {
        const b = await promoteRes.json().catch(() => ({}));
        throw new Error(b.error || "Promote failed");
      }

      onDone(item.id, "promoted");
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    setBusy(true);
    setActionError(null);
    try {
      const headers = await getHeaders();
      const res = await fetch(`/api/dossiers/${item.lead_id}/review`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          dossier_id: item.id,
          status: "flagged",
          review_notes: reviewNotes || "Rejected in review queue",
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || "Reject failed");
      }
      onDone(item.id, "flagged");
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card text-card-foreground shadow-sm overflow-hidden">
      {/* ── Header ── */}
      <div
        className="flex items-start justify-between gap-3 p-4 cursor-pointer select-none hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm truncate">{leadName}</span>
            <Badge variant="outline" className="text-xs shrink-0">
              {item.leads?.stage ?? "—"}
            </Badge>
            <Badge
              variant="outline"
              className="text-xs shrink-0 border-amber-400 text-amber-700 dark:border-amber-700 dark:text-amber-400"
            >
              proposed
            </Badge>
          </div>
          {address && (
            <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              {address}
            </div>
          )}
          {crawledAt && (
            <p className="text-xs text-muted-foreground mt-0.5">Crawled {crawledAt}</p>
          )}
        </div>
        <div className="shrink-0 mt-0.5">
          {expanded
            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground" />
          }
        </div>
      </div>

      {/* ── Expanded content ── */}
      {expanded && (
        <div className="border-t border-border">
          {/* Proposed vs Current CRM side-by-side */}
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
            {/* Left: Proposed intelligence */}
            <div className="p-4 space-y-3">
              <h4 className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3" />
                Proposed (AI — unreviewed)
              </h4>

              {editing ? (
                <div className="space-y-2">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-0.5">Summary</label>
                    <Textarea
                      value={editSummary}
                      onChange={e => setEditSummary(e.target.value)}
                      className="text-sm min-h-[60px]"
                      placeholder="Situation summary…"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-0.5">Decision-maker</label>
                    <Input
                      value={editDecisionMaker}
                      onChange={e => setEditDecisionMaker(e.target.value)}
                      className="text-sm h-8"
                      placeholder="Name / role…"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-0.5">Call angle</label>
                    <Textarea
                      value={editCallAngle}
                      onChange={e => setEditCallAngle(e.target.value)}
                      className="text-sm min-h-[50px]"
                      placeholder="Recommended approach…"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2 text-sm">
                  {item.situation_summary && (
                    <p className="leading-snug">{item.situation_summary}</p>
                  )}
                  {item.likely_decision_maker && (
                    <div className="flex items-center gap-1.5 text-sm">
                      <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span>{item.likely_decision_maker}</span>
                    </div>
                  )}
                  {item.recommended_call_angle && (
                    <div className="flex items-start gap-1.5 text-sm">
                      <Lightbulb className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      <span>{item.recommended_call_angle}</span>
                    </div>
                  )}
                  {!item.situation_summary && !item.likely_decision_maker && !item.recommended_call_angle && (
                    <p className="text-muted-foreground text-xs italic">No structured fields extracted</p>
                  )}
                </div>
              )}

              {/* Top facts */}
              {Array.isArray(item.top_facts) && item.top_facts.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Key facts</p>
                  <ul className="space-y-1">
                    {(item.top_facts as DossierTopFact[]).slice(0, 5).map((f, i) => (
                      <li key={i} className="text-xs leading-snug">
                        <span>{f.fact}</span>
                        {f.source && <span className="ml-1 text-muted-foreground">({f.source})</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Source links */}
              {Array.isArray(item.source_links) && item.source_links.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Sources</p>
                  <ul className="space-y-1">
                    {(item.source_links as DossierSourceLink[]).map((l, i) => (
                      <li key={i}>
                        <a
                          href={l.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                          onClick={e => e.stopPropagation()}
                        >
                          <ExternalLink className="h-3 w-3" />
                          {l.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Right: Current CRM values */}
            <div className="p-4 space-y-3">
              <h4 className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide flex items-center gap-1.5">
                <ShieldCheck className="h-3 w-3" />
                Current CRM state
              </h4>

              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground block">Decision-maker note</span>
                  <span className={item.leads?.decision_maker_note ? "" : "text-muted-foreground italic text-xs"}>
                    {item.leads?.decision_maker_note ?? "Not set"}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Stage</span>
                  <span>{item.leads?.stage ?? "—"}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Source</span>
                  <span>{item.leads?.source ?? "—"}</span>
                </div>
                {item.leads?.notes && (
                  <div>
                    <span className="text-xs text-muted-foreground block">Existing notes</span>
                    <p className="text-xs leading-relaxed line-clamp-4 whitespace-pre-line">
                      {item.leads.notes}
                    </p>
                  </div>
                )}
              </div>

              {/* Verification checklist — what still needs confirming */}
              {Array.isArray(item.verification_checklist) && item.verification_checklist.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Verify before approving
                  </p>
                  <ul className="space-y-1">
                    {(item.verification_checklist as DossierVerificationItem[]).map((v, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs">
                        <span className={`w-3 h-3 mt-0.5 rounded-sm border shrink-0 flex items-center justify-center ${v.verified ? "bg-emerald-500 border-emerald-500" : "border-muted-foreground"}`}>
                          {v.verified && <CheckCircle2 className="h-2 w-2 text-white" />}
                        </span>
                        <span className={v.verified ? "text-muted-foreground line-through" : ""}>{v.item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* ── Action zone ── */}
          <div className="border-t border-border p-4 space-y-3 bg-muted/20">
            {/* Review notes */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Review notes (optional)</label>
              <Textarea
                value={reviewNotes}
                onChange={e => setReviewNotes(e.target.value)}
                className="text-sm min-h-[48px]"
                placeholder="Why approving / rejecting, what was changed…"
              />
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleApprove}
                disabled={busy}
              >
                {busy
                  ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  : <CheckCircle2 className="h-3 w-3 mr-1" />
                }
                {editing ? "Save edits & approve" : "Approve & promote"}
              </Button>

              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => setEditing(e => !e)}
                disabled={busy}
              >
                <Pencil className="h-3 w-3 mr-1" />
                {editing ? "Cancel edit" : "Edit before approving"}
              </Button>

              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs border-red-400 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
                onClick={handleReject}
                disabled={busy}
              >
                <XCircle className="h-3 w-3 mr-1" />
                Reject
              </Button>
            </div>

            {actionError && (
              <p className="text-xs text-destructive">{actionError}</p>
            )}

            <Separator />
            <p className="text-xs text-muted-foreground">
              <strong>Approve:</strong> reviews this dossier and promotes decision-maker + summary into the lead record.
              {" "}<strong>Reject:</strong> flags as inaccurate — CRM state unchanged.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
