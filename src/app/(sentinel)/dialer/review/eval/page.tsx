"use client";

/**
 * /dialer/review/eval — AI Review Surface
 *
 * Adam's surface for reviewing AI output quality across workflows.
 * Shows per-workflow-version summaries with raw example drawers,
 * a manual rating form for ad-hoc review, and a filterable full rating list.
 *
 * DESIGN RULES:
 *   - Pass rate shown only when n >= EVAL_MIN_SAMPLE (5)
 *   - Sample-size caveat always displayed alongside any rate
 *   - Raw examples always accessible — summaries do not hide the data
 *   - No bar charts — counts and text until data volume justifies visualization
 *   - Tone: "what can we improve" not "what went wrong"
 *
 * BOUNDARY:
 *   - Read: eval-ratings API, eval-ratings/summary API
 *   - Write: eval-ratings POST (manual rating only)
 *   - Never reads dialer_ai_traces, dossiers, or calls_log directly
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Brain, ArrowLeft, RefreshCw, Loader2, AlertTriangle,
  ChevronRight, Filter, Plus, CheckCircle2,
} from "lucide-react";
import { PageShell }          from "@/components/sentinel/page-shell";
import { GlassCard }          from "@/components/sentinel/glass-card";
import { Button }             from "@/components/ui/button";
import { Badge }              from "@/components/ui/badge";
import { Input }              from "@/components/ui/input";
import {
  EvalRatingsPanel,
  RateOutputForm,
} from "@/components/sentinel/eval-ratings-panel";
import {
  EVAL_WORKFLOWS,
  EVAL_WORKFLOW_LABELS,
  EVAL_WORKFLOW_DESCRIPTIONS,
  EVAL_VERDICT_LABELS,
  EVAL_VERDICT_COLORS,
  EVAL_RUBRIC_LABELS,
  EVAL_RUBRIC_COLORS,
  EVAL_VERDICTS,
  EVAL_MIN_SAMPLE,
  evalSampleCaveat,
  type EvalWorkflow,
  type EvalVerdict,
  type EvalRatingRow,
} from "@/lib/eval-ratings";
import { supabase }           from "@/lib/supabase";

// ── Auth helper ───────────────────────────────────────────────────────────────

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (session?.access_token) h["Authorization"] = `Bearer ${session.access_token}`;
  return h;
}

// ── Workflow info card ────────────────────────────────────────────────────────

function WorkflowInfoCard({ workflow }: { workflow: EvalWorkflow }) {
  return (
    <div className="rounded-lg border border-overlay-4 bg-overlay-2 px-3 py-2 space-y-0.5">
      <p className="text-sm font-medium text-foreground/70">
        {EVAL_WORKFLOW_LABELS[workflow]}
      </p>
      <p className="text-sm text-muted-foreground/40 leading-relaxed">
        {EVAL_WORKFLOW_DESCRIPTIONS[workflow]}
      </p>
    </div>
  );
}

// ── Rating list row ───────────────────────────────────────────────────────────

function RatingListRow({ rating }: { rating: EvalRatingRow }) {
  const [showOutput, setShowOutput] = useState(false);
  return (
    <div className="border-b border-overlay-3 last:border-0 py-2.5 space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className={`text-xs px-1.5 py-0 ${EVAL_VERDICT_COLORS[rating.verdict]}`}>
          {EVAL_VERDICT_LABELS[rating.verdict]}
        </Badge>
        {rating.rubric_dimension && (
          <Badge variant="outline" className={`text-xs px-1.5 py-0 ${EVAL_RUBRIC_COLORS[rating.rubric_dimension]}`}>
            {EVAL_RUBRIC_LABELS[rating.rubric_dimension]}
          </Badge>
        )}
        <code className="text-xs text-muted-foreground/30 font-mono">
          {rating.workflow}@{rating.prompt_version}
        </code>
        <span className="text-xs text-muted-foreground/25 ml-auto">
          {new Date(rating.reviewed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
      </div>
      {rating.reviewer_note && (
        <p className="text-sm text-muted-foreground/60 leading-relaxed pl-0.5">
          {rating.reviewer_note}
        </p>
      )}
      {rating.output_snapshot && (
        <button
          onClick={() => setShowOutput(o => !o)}
          className="text-xs text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
        >
          {showOutput ? "Hide output" : "Show output snapshot"}
        </button>
      )}
      {showOutput && rating.output_snapshot && (
        <pre className="text-xs text-muted-foreground/40 bg-overlay-2 rounded p-2 whitespace-pre-wrap max-h-28 overflow-auto">
          {rating.output_snapshot}
        </pre>
      )}
    </div>
  );
}

// ── Manual rate form wrapper ──────────────────────────────────────────────────

function ManualRateSection({ onRated }: { onRated: () => void }) {
  const [open,    setOpen]    = useState(false);
  const [runId,   setRunId]   = useState("");
  const [wf,      setWf]      = useState<EvalWorkflow>("summarize");
  const [version, setVersion] = useState("2.1.0");
  const [snapshot, setSnapshot] = useState("");
  const [done,    setDone]    = useState(false);

  if (done) return (
    <GlassCard className="p-4 flex items-center gap-2 text-xs text-foreground">
      <CheckCircle2 className="w-4 h-4" />
      Rating saved.
      <button onClick={() => { setDone(false); setOpen(false); setRunId(""); }} className="ml-auto text-muted-foreground/40 hover:text-muted-foreground/70 text-sm">
        Rate another
      </button>
    </GlassCard>
  );

  return (
    <GlassCard className="p-4 space-y-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-sm font-medium text-foreground/70 hover:text-foreground/90 transition-colors w-full text-left"
      >
        <Plus className="w-3.5 h-3.5 text-muted-foreground/50" />
        Rate an output manually (by run ID)
        <span className="ml-auto text-muted-foreground/30">
          {open ? "−" : "+"}
        </span>
      </button>
      {open && (
        <div className="space-y-2.5 pt-1 border-t border-overlay-4">
          <p className="text-sm text-muted-foreground/40">
            Paste the run_id from a dialer_ai_traces row to rate that specific output.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground/40 uppercase tracking-wide">Run ID</label>
              <Input
                value={runId}
                onChange={e => setRunId(e.target.value)}
                placeholder="uuid or run-…"
                className="text-xs h-7 bg-overlay-3 border-overlay-6"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground/40 uppercase tracking-wide">Workflow</label>
              <select
                value={wf}
                onChange={e => setWf(e.target.value as EvalWorkflow)}
                className="w-full h-7 text-xs rounded-md bg-background border border-overlay-6 px-2 text-foreground"
              >
                {EVAL_WORKFLOWS.map(w => (
                  <option key={w} value={w}>{EVAL_WORKFLOW_LABELS[w]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground/40 uppercase tracking-wide">Prompt version</label>
              <Input
                value={version}
                onChange={e => setVersion(e.target.value)}
                placeholder="e.g. 2.1.0"
                className="text-xs h-7 bg-overlay-3 border-overlay-6"
              />
            </div>
            <div className="space-y-1 col-span-2">
              <label className="text-xs text-muted-foreground/40 uppercase tracking-wide">Output snapshot (optional)</label>
              <Input
                value={snapshot}
                onChange={e => setSnapshot(e.target.value)}
                placeholder="Paste output text to include in rating…"
                className="text-xs h-7 bg-overlay-3 border-overlay-6"
              />
            </div>
          </div>
          {runId.trim() && (
            <RateOutputForm
              runId={runId.trim()}
              workflow={wf}
              promptVersion={version}
              outputSnapshot={snapshot || undefined}
              onRated={() => { setDone(true); onRated(); }}
            />
          )}
        </div>
      )}
    </GlassCard>
  );
}

// ── Full ratings list ─────────────────────────────────────────────────────────

function FullRatingsList() {
  const [ratings,       setRatings]       = useState<EvalRatingRow[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [workflowFilter, setWorkflowFilter] = useState<EvalWorkflow | "all">("all");
  const [verdictFilter,  setVerdictFilter]  = useState<EvalVerdict | "all">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const h = await authHeaders();
      const params = new URLSearchParams({ limit: "100" });
      if (workflowFilter !== "all") params.set("workflow", workflowFilter);
      if (verdictFilter  !== "all") params.set("verdict",  verdictFilter);
      const res = await fetch(`/api/dialer/v1/eval-ratings?${params}`, { headers: h });
      if (!res.ok) throw new Error("Failed to load ratings");
      const { ratings: data } = await res.json();
      setRatings(data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [workflowFilter, verdictFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <GlassCard className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-muted-foreground/40" />
          <h3 className="text-sm font-semibold text-foreground/80">All Ratings</h3>
          <Badge variant="outline" className="text-xs">{ratings.length}</Badge>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <select
            value={workflowFilter}
            onChange={e => setWorkflowFilter(e.target.value as EvalWorkflow | "all")}
            className="h-6 text-sm rounded border border-overlay-6 bg-background text-muted-foreground px-1.5"
          >
            <option value="all">All workflows</option>
            {EVAL_WORKFLOWS.map(w => (
              <option key={w} value={w}>{EVAL_WORKFLOW_LABELS[w]}</option>
            ))}
          </select>
          <select
            value={verdictFilter}
            onChange={e => setVerdictFilter(e.target.value as EvalVerdict | "all")}
            className="h-6 text-sm rounded border border-overlay-6 bg-background text-muted-foreground px-1.5"
          >
            <option value="all">All verdicts</option>
            {EVAL_VERDICTS.map(v => (
              <option key={v} value={v}>{EVAL_VERDICT_LABELS[v]}</option>
            ))}
          </select>
          <button
            onClick={load}
            disabled={loading}
            className="text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-foreground">
          <AlertTriangle className="w-3 h-3" />{error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/30" />
        </div>
      ) : ratings.length === 0 ? (
        <p className="text-xs text-muted-foreground/30 py-4 text-center">No ratings match this filter.</p>
      ) : (
        <div>
          {ratings.map(r => <RatingListRow key={r.id} rating={r} />)}
        </div>
      )}
    </GlassCard>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EvalPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <PageShell title="AI Review">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {/* ── Breadcrumb ── */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
          <Link href="/dialer/review" className="hover:text-muted-foreground transition-colors flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Review Console
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-muted-foreground/70">AI Evals</span>
        </div>

        {/* ── Page header ── */}
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-foreground/90 flex items-center gap-2">
            <Brain className="w-4 h-4 text-muted-foreground/50" />
            AI Review
          </h1>
          <p className="text-xs text-muted-foreground/50 leading-relaxed max-w-xl">
            Reviewed AI output quality grouped by workflow and prompt version.
            Pass rate shown only when n ≥ {EVAL_MIN_SAMPLE}.
            Raw examples always accessible — no metric hides the data behind it.
          </p>
        </div>

        {/* ── Covered workflows ── */}
        <GlassCard className="p-4 space-y-2">
          <p className="text-xs font-medium text-foreground/70">Covered workflows</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {EVAL_WORKFLOWS.map(w => <WorkflowInfoCard key={w} workflow={w} />)}
          </div>
          <p className="text-sm text-muted-foreground/30 leading-relaxed">
            Ratings are written automatically when Adam reviews dossier outputs (extract),
            marks QA findings (qa_notes), or approves/rejects draft notes (draft_note).
            Use the manual form below to rate any output by run_id.
          </p>
        </GlassCard>

        {/* ── Summary panel ── */}
        <EvalRatingsPanel key={refreshKey} days={90} />

        {/* ── Manual rating ── */}
        <ManualRateSection onRated={() => setRefreshKey(k => k + 1)} />

        {/* ── Full ratings list ── */}
        <FullRatingsList key={refreshKey} />

        {/* ── Related links ── */}
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground/40">
          <Link href="/dialer/review" className="hover:text-muted-foreground flex items-center gap-1 transition-colors">
            <ChevronRight className="w-3 h-3" /> Review Console
          </Link>
          <Link href="/settings/prompt-registry" className="hover:text-muted-foreground flex items-center gap-1 transition-colors">
            <ChevronRight className="w-3 h-3" /> Prompt Registry
          </Link>
          <Link href="/dialer/qa" className="hover:text-muted-foreground flex items-center gap-1 transition-colors">
            <ChevronRight className="w-3 h-3" /> Call QA
          </Link>
          <Link href="/dialer/review/dossier-queue" className="hover:text-muted-foreground flex items-center gap-1 transition-colors">
            <ChevronRight className="w-3 h-3" /> Research Review
          </Link>
        </div>

      </div>
    </PageShell>
  );
}
