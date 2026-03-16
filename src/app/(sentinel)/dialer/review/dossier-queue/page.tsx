"use client";

/**
 * /dialer/review/dossier-queue — Dossier Review Queue
 *
 * Lists proposed dossiers (AI-generated lead intelligence from deep-crawl)
 * and lets Adam review, edit, approve, or reject each one before it
 * touches durable lead truth.
 *
 * Approved dossiers:  promotes decision_maker_note + appends to leads.notes
 * Rejected dossiers:  flagged — CRM state unchanged
 *
 * This page is read-only from the CRM's perspective until an explicit
 * approve or reject action is taken.
 */

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  FileText,
  ShieldCheck,
} from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import {
  DossierReviewCard,
  type DossierQueueItem,
} from "@/components/sentinel/dossier-review-card";

type StatusFilter = "proposed" | "reviewed" | "flagged" | "promoted" | "all";

const STATUS_TABS: { label: string; value: StatusFilter }[] = [
  { label: "Needs review", value: "proposed" },
  { label: "Approved",     value: "reviewed" },
  { label: "Promoted",     value: "promoted" },
  { label: "Rejected",     value: "flagged" },
  { label: "All",          value: "all" },
];

export default function DossierQueuePage() {
  const [status, setStatus] = useState<StatusFilter>("proposed");
  const [items, setItems] = useState<DossierQueueItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchQueue = useCallback(async (s: StatusFilter) => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Session expired");

      const res = await fetch(`/api/dossiers/queue?status=${s}&limit=50`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || `Failed to load queue (${res.status})`);
      }
      const data = await res.json();
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue(status);
  }, [status, fetchQueue]);

  function handleDone(id: string, newStatus: "reviewed" | "flagged" | "promoted") {
    // Remove from current view if the new status no longer matches filter
    if (status !== "all" && newStatus !== status) {
      setItems(prev => prev.filter(i => i.id !== id));
      setTotal(prev => Math.max(0, prev - 1));
    } else {
      // Update in place
      setItems(prev =>
        prev.map(i => i.id === id ? { ...i, status: newStatus } : i)
      );
    }
  }

  const pendingCount = status === "proposed" ? total : null;

  return (
    <PageShell>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link
              href="/dialer/review"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to review
            </Link>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              <h1 className="text-xl font-semibold tracking-tight">Dossier Review Queue</h1>
              {pendingCount != null && pendingCount > 0 && (
                <Badge className="bg-amber-500 text-white text-xs">{pendingCount}</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Review AI-generated intelligence before it enters the lead record.
            </p>
          </div>

          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs shrink-0"
            onClick={() => fetchQueue(status)}
            disabled={loading}
          >
            {loading
              ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
              : <RefreshCw className="h-3 w-3 mr-1" />
            }
            Refresh
          </Button>
        </div>

        {/* ── Promotion rule callout ── */}
        <GlassCard className="p-3">
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
            <span>
              <strong className="text-foreground">Promotion rule:</strong>{" "}
              AI output exists as proposed until you approve it. Approving writes
              the decision-maker note and a timestamped summary entry into the lead record.
              Rejecting leaves CRM state completely unchanged.
            </span>
          </div>
        </GlassCard>

        {/* ── Status tabs ── */}
        <div className="flex items-center gap-1 flex-wrap">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => setStatus(tab.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                status === tab.value
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Content ── */}
        {loading && items.length === 0 && (
          <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        )}

        {error && (
          <GlassCard className="p-4">
            <p className="text-sm text-destructive">{error}</p>
          </GlassCard>
        )}

        {!loading && !error && items.length === 0 && (
          <GlassCard className="p-8">
            <div className="flex flex-col items-center gap-3 text-center text-muted-foreground">
              {status === "proposed" ? (
                <>
                  <CheckCircle2 className="h-8 w-8 text-emerald-500/60" />
                  <p className="text-sm font-medium">No dossiers waiting for review</p>
                  <p className="text-xs">
                    Proposed dossiers appear here after a deep-crawl runs on a lead.
                    Run a deep-crawl on a probate or inherited lead to populate this queue.
                  </p>
                </>
              ) : status === "flagged" ? (
                <>
                  <XCircle className="h-8 w-8 text-red-400/60" />
                  <p className="text-sm font-medium">No rejected dossiers</p>
                </>
              ) : (
                <>
                  <FileText className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm">No dossiers with status &ldquo;{status}&rdquo;</p>
                </>
              )}
            </div>
          </GlassCard>
        )}

        {items.length > 0 && (
          <div className="space-y-3">
            {items.map(item => (
              <DossierReviewCard key={item.id} item={item} onDone={handleDone} />
            ))}
            {total > items.length && (
              <p className="text-xs text-center text-muted-foreground pt-2">
                Showing {items.length} of {total} — reload to see more
              </p>
            )}
          </div>
        )}
      </div>
    </PageShell>
  );
}
