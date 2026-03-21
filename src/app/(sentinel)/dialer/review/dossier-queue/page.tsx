"use client";

/**
 * /dialer/review/dossier-queue — Dossier Review Queue
 *
 * Lists proposed dossiers with confidence/risk-based triage.
 * Items are sorted by triage score (highest risk first) by default.
 * Adam can filter by triage reason type and switch to date sort.
 *
 * Approved dossiers:  promotes decision_maker_note + appends to leads.notes
 * Rejected dossiers:  flagged — CRM state unchanged
 *
 * Triage is additive context — approve/reject/edit mechanics unchanged.
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft, RefreshCw, Loader2, CheckCircle2, XCircle,
  FileText, ShieldCheck, ArrowUpDown, Filter, X,
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
import {
  TRIAGE_REASON_LABELS,
  TRIAGE_SEVERITY_CLASSES,
  type TriageReasonCode,
  type TriageSeverity,
} from "@/lib/dossier-triage";

// ── Types ─────────────────────────────────────────────────────────────────────

type StatusFilter = "proposed" | "reviewed" | "flagged" | "promoted" | "all";
type SortMode     = "triage" | "created_at";

const STATUS_TABS: { label: string; value: StatusFilter }[] = [
  { label: "Needs review", value: "proposed" },
  { label: "Approved",     value: "reviewed" },
  { label: "Promoted",     value: "promoted" },
  { label: "Rejected",     value: "flagged" },
  { label: "All",          value: "all" },
];

// Reason codes to show as filter pills (ordered by severity weight)
const REASON_FILTER_OPTIONS: { code: TriageReasonCode; severity: TriageSeverity }[] = [
  { code: "durable_writeback_pending",  severity: "critical" },
  { code: "prior_dossier_flagged",      severity: "high" },
  { code: "blocked_source",             severity: "high" },
  { code: "review_required_source",     severity: "medium" },
  { code: "low_evidence_confidence",    severity: "medium" },
  { code: "missing_key_fields",         severity: "medium" },
  { code: "no_source_links",            severity: "low" },
  { code: "no_facts",                   severity: "low" },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DossierQueuePage() {
  const [status, setStatus]     = useState<StatusFilter>("proposed");
  const [items, setItems]       = useState<DossierQueueItem[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // Client-side sort + filter state (operates on already-fetched items)
  const [sort, setSort]               = useState<SortMode>("triage");
  const [reasonFilter, setReasonFilter] = useState<TriageReasonCode | null>(null);

  const fetchQueue = useCallback(async (s: StatusFilter, sortMode: SortMode) => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Session expired");

      const sortParam = sortMode === "triage" ? "triage" : "created_at";
      const res = await fetch(
        `/api/dossiers/queue?status=${s}&limit=50&sort=${sortParam}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
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
    fetchQueue(status, sort);
    setReasonFilter(null); // clear reason filter on tab change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Re-fetch when sort changes (server does the sort for triage mode)
  useEffect(() => {
    fetchQueue(status, sort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort]);

  function handleDone(id: string, newStatus: "reviewed" | "flagged" | "promoted") {
    if (status !== "all" && newStatus !== status) {
      setItems(prev => prev.filter(i => i.id !== id));
      setTotal(prev => Math.max(0, prev - 1));
    } else {
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: newStatus } : i));
    }
  }

  // ── Client-side reason filter ─────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    if (!reasonFilter) return items;
    return items.filter(item =>
      item.triage?.reasons.some(r => r.code === reasonFilter) ?? false
    );
  }, [items, reasonFilter]);

  // ── Reason stats for filter pills ─────────────────────────────────────────
  const reasonCounts = useMemo(() => {
    const counts: Partial<Record<TriageReasonCode, number>> = {};
    for (const item of items) {
      for (const r of item.triage?.reasons ?? []) {
        counts[r.code] = (counts[r.code] ?? 0) + 1;
      }
    }
    return counts;
  }, [items]);

  const pendingCount = status === "proposed" ? total : null;
  const showTriage   = status === "proposed" || status === "all";

  return (
    <PageShell title="Research Review">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">

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
              <FileText className="h-5 w-5 text-foreground dark:text-foreground" />
              <h1 className="text-xl font-semibold tracking-tight">Dossier Review Queue</h1>
              {pendingCount != null && pendingCount > 0 && (
                <Badge className="bg-muted text-white text-xs">{pendingCount}</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Sorted by risk — highest-priority items first.
            </p>
          </div>

          <Button
            size="sm" variant="outline" className="h-8 text-xs shrink-0"
            onClick={() => fetchQueue(status, sort)} disabled={loading}
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
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5 text-foreground" />
            <span>
              <strong className="text-foreground">Promotion rule:</strong>{" "}
              AI output exists as proposed until you approve it. Approving writes
              the decision-maker note and a timestamped summary entry into the lead record.
              Rejecting leaves CRM state completely unchanged.
            </span>
          </div>
        </GlassCard>

        {/* ── Status tabs + sort toggle ── */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
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

          {/* Sort toggle — only relevant for proposed/all */}
          {showTriage && (
            <button
              onClick={() => setSort(s => s === "triage" ? "created_at" : "triage")}
              className="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-muted-foreground/80 transition-colors"
            >
              <ArrowUpDown className="h-3 w-3" />
              {sort === "triage" ? "Sorted by risk" : "Sorted by date"}
            </button>
          )}
        </div>

        {/* ── Triage reason filter pills (proposed/all only) ── */}
        {showTriage && items.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground/40 shrink-0">
              <Filter className="h-2.5 w-2.5" /> Filter by signal
            </span>
            {REASON_FILTER_OPTIONS
              .filter(opt => (reasonCounts[opt.code] ?? 0) > 0)
              .map(opt => {
                const style   = TRIAGE_SEVERITY_CLASSES[opt.severity];
                const count   = reasonCounts[opt.code] ?? 0;
                const active  = reasonFilter === opt.code;
                return (
                  <button
                    key={opt.code}
                    onClick={() => setReasonFilter(active ? null : opt.code)}
                    className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border transition-colors ${
                      active
                        ? style.badge + " ring-1 ring-offset-1 ring-offset-background"
                        : "border-white/[0.06] text-muted-foreground/40 hover:border-white/[0.12] hover:text-muted-foreground/70"
                    }`}
                  >
                    {TRIAGE_REASON_LABELS[opt.code]}
                    <span className={`text-[9px] ${active ? "" : "opacity-60"}`}>
                      {count}
                    </span>
                    {active && <X className="h-2.5 w-2.5 ml-0.5" />}
                  </button>
                );
              })
            }
            {reasonFilter && (
              <button
                onClick={() => setReasonFilter(null)}
                className="text-[9px] text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
              >
                Clear filter
              </button>
            )}
          </div>
        )}

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

        {/* Empty state */}
        {!loading && !error && filteredItems.length === 0 && (
          <GlassCard className="p-8">
            <div className="flex flex-col items-center gap-3 text-center text-muted-foreground">
              {reasonFilter ? (
                <>
                  <Filter className="h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm font-medium">
                    No items match &ldquo;{TRIAGE_REASON_LABELS[reasonFilter]}&rdquo;
                  </p>
                  <button
                    onClick={() => setReasonFilter(null)}
                    className="text-xs text-primary/60 hover:text-primary underline-offset-2 hover:underline"
                  >
                    Clear filter
                  </button>
                </>
              ) : status === "proposed" ? (
                <>
                  <CheckCircle2 className="h-8 w-8 text-foreground/60" />
                  <p className="text-sm font-medium">No dossiers waiting for review</p>
                  <p className="text-xs">
                    Proposed dossiers appear here after evidence is compiled on a lead.
                  </p>
                </>
              ) : status === "flagged" ? (
                <>
                  <XCircle className="h-8 w-8 text-foreground/60" />
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

        {/* Item list */}
        {filteredItems.length > 0 && (
          <div className="space-y-3">
            {/* Filter context line */}
            {reasonFilter && (
              <p className="text-[10px] text-muted-foreground/40">
                Showing {filteredItems.length} of {items.length} items with &ldquo;{TRIAGE_REASON_LABELS[reasonFilter]}&rdquo; signal
              </p>
            )}

            {filteredItems.map(item => (
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
