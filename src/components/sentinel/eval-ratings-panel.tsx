"use client";

/**
 * EvalRatingsPanel
 *
 * Compact eval surface for AI workflow quality review.
 * Shows per-workflow-version summaries with honest sample-size caveats,
 * and a raw-examples drawer per version so Adam can read actual outputs.
 *
 * DESIGN RULES:
 *   - No bar charts until n >= 20. Text + counts until then.
 *   - Pass rate only shown when n >= EVAL_MIN_SAMPLE (5).
 *   - Sample-size caveat always visible alongside any rate.
 *   - Raw examples always accessible — summaries never hide the data.
 *   - Verdict and rubric labels are plain English, never jargon.
 *
 * BOUNDARY:
 *   - Reads from eval-ratings API only.
 *   - Write path (rate a new output) is exposed via RateOutputForm.
 *   - Does NOT read dialer_ai_traces, calls_log, or dossiers directly.
 */

import { useState, useEffect, useCallback } from "react";
import {
  Brain, ChevronDown, ChevronUp, RefreshCw, Loader2,
  CheckCircle2, AlertTriangle, XCircle, BookOpen, Sparkles,
} from "lucide-react";
import { GlassCard }  from "@/components/sentinel/glass-card";
import { Badge }      from "@/components/ui/badge";
import { Button }     from "@/components/ui/button";
import { Textarea }   from "@/components/ui/textarea";
import { supabase }   from "@/lib/supabase";
import {
  EVAL_WORKFLOW_LABELS,
  EVAL_WORKFLOW_DESCRIPTIONS,
  EVAL_VERDICT_LABELS,
  EVAL_VERDICT_COLORS,
  EVAL_RUBRIC_LABELS,
  EVAL_RUBRIC_COLORS,
  EVAL_VERDICTS,
  VERDICT_RUBRIC_MAP,
  EVAL_MIN_SAMPLE,
  evalSampleCaveat,
  deriveVersionSummaries,
  type EvalVersionSummary,
  type EvalRatingRow,
  type EvalWorkflow,
  type EvalVerdict,
  type EvalRubricDimension,
  type WriteEvalRatingInput,
} from "@/lib/eval-ratings";

// ── Auth helper ───────────────────────────────────────────────────────────────

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (session?.access_token) h["Authorization"] = `Bearer ${session.access_token}`;
  return h;
}

// ── Pass-rate display ─────────────────────────────────────────────────────────

function PassRatePill({ n, rate }: { n: number; rate: number | null }) {
  if (n === 0) return <span className="text-sm text-muted-foreground/30 italic">No data yet</span>;
  if (rate == null) return (
    <span className="text-sm text-muted-foreground/40 italic">
      {n}/{EVAL_MIN_SAMPLE} min (rate pending)
    </span>
  );
  const color = rate >= 80 ? "text-foreground" : rate >= 50 ? "text-foreground" : "text-foreground";
  return (
    <span className={`text-sm font-bold tabular-nums ${color}`}>{rate}%</span>
  );
}

// ── Verdict badge ─────────────────────────────────────────────────────────────

function VerdictBadge({ verdict }: { verdict: EvalVerdict }) {
  return (
    <Badge variant="outline" className={`text-xs px-1.5 py-0 ${EVAL_VERDICT_COLORS[verdict]}`}>
      {EVAL_VERDICT_LABELS[verdict]}
    </Badge>
  );
}

// ── Raw example row ───────────────────────────────────────────────────────────

function ExampleRow({ rating }: { rating: EvalRatingRow }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-2.5 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <VerdictBadge verdict={rating.verdict} />
        {rating.rubric_dimension && (
          <Badge variant="outline" className={`text-xs px-1.5 py-0 ${EVAL_RUBRIC_COLORS[rating.rubric_dimension]}`}>
            {EVAL_RUBRIC_LABELS[rating.rubric_dimension]}
          </Badge>
        )}
        <span className="text-xs text-muted-foreground/30 ml-auto">
          {new Date(rating.reviewed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
      </div>
      {rating.reviewer_note && (
        <p className="text-sm text-muted-foreground/70 leading-relaxed">
          {rating.reviewer_note}
        </p>
      )}
      {rating.output_snapshot && (
        <>
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 text-xs text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors"
          >
            {expanded ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
            Output snapshot
          </button>
          {expanded && (
            <pre className="text-xs text-muted-foreground/50 bg-white/[0.02] rounded p-2 whitespace-pre-wrap leading-relaxed max-h-32 overflow-auto">
              {rating.output_snapshot}
            </pre>
          )}
        </>
      )}
    </div>
  );
}

// ── Rate output form ──────────────────────────────────────────────────────────

interface RateOutputFormProps {
  runId:          string;
  workflow:       EvalWorkflow;
  promptVersion:  string;
  outputSnapshot?: string;
  onRated:        (rating: EvalRatingRow) => void;
}

export function RateOutputForm({
  runId, workflow, promptVersion, outputSnapshot, onRated,
}: RateOutputFormProps) {
  const [verdict,   setVerdict]   = useState<EvalVerdict | null>(null);
  const [rubric,    setRubric]    = useState<EvalRubricDimension | null>(null);
  const [note,      setNote]      = useState("");
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const allowedRubrics = verdict ? VERDICT_RUBRIC_MAP[verdict] : [];

  async function submit() {
    if (!verdict) return;
    setSaving(true);
    setError(null);
    try {
      const h = await authHeaders();
      const body: WriteEvalRatingInput = {
        run_id:           runId,
        workflow,
        prompt_version:   promptVersion,
        verdict,
        rubric_dimension: rubric ?? undefined,
        reviewer_note:    note.trim() || undefined,
        output_snapshot:  outputSnapshot,
      };
      const res = await fetch("/api/dialer/v1/eval-ratings", {
        method: "POST", headers: h, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const { rating } = await res.json();
      onRated(rating);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save rating");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2.5 p-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <p className="text-sm font-medium text-muted-foreground/70">
        Rate this output — <span className="font-mono text-muted-foreground/40">{workflow}@{promptVersion}</span>
      </p>

      {/* Verdict */}
      <div className="flex gap-1.5 flex-wrap">
        {EVAL_VERDICTS.map(v => (
          <button
            key={v}
            onClick={() => { setVerdict(v); setRubric(null); }}
            className={`text-sm px-2.5 py-1 rounded-md border transition-colors ${
              verdict === v
                ? EVAL_VERDICT_COLORS[v]
                : "border-white/[0.06] text-muted-foreground/50 hover:text-muted-foreground"
            }`}
          >
            {EVAL_VERDICT_LABELS[v]}
          </button>
        ))}
      </div>

      {/* Rubric */}
      {verdict && (
        <div className="flex gap-1.5 flex-wrap">
          {allowedRubrics.map(d => (
            <button
              key={d}
              onClick={() => setRubric(d)}
              className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                rubric === d
                  ? EVAL_RUBRIC_COLORS[d]
                  : "border-white/[0.05] text-muted-foreground/40 hover:text-muted-foreground/60"
              }`}
            >
              {EVAL_RUBRIC_LABELS[d]}
            </button>
          ))}
        </div>
      )}

      {/* Note */}
      <Textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Optional note — what was wrong or especially good?"
        className="text-xs min-h-[48px] bg-white/[0.02] border-white/[0.06]"
        rows={2}
      />

      {error && <p className="text-sm text-foreground">{error}</p>}

      <Button
        size="sm"
        variant="outline"
        disabled={!verdict || saving}
        onClick={submit}
        className="text-sm h-6 px-3 border-white/[0.08]"
      >
        {saving ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : "Save rating"}
      </Button>
    </div>
  );
}

// ── Version summary row ───────────────────────────────────────────────────────

function VersionSummaryRow({
  summary,
  examples,
  onLoadExamples,
}: {
  summary:        EvalVersionSummary;
  examples:       EvalRatingRow[] | null;
  onLoadExamples: (workflow: EvalWorkflow, version: string) => void;
}) {
  const [open, setOpen] = useState(false);

  function toggle() {
    setOpen(o => !o);
    if (!open && examples === null) onLoadExamples(summary.workflow, summary.prompt_version);
  }

  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] overflow-hidden">
      {/* Summary header */}
      <button
        onClick={toggle}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground/80">
              {EVAL_WORKFLOW_LABELS[summary.workflow]}
            </span>
            <code className="text-xs text-muted-foreground/40 font-mono">v{summary.prompt_version}</code>
            {summary.n > 0 && (
              <span className="text-xs text-muted-foreground/30">{summary.n} reviewed</span>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <PassRatePill n={summary.n} rate={summary.pass_rate} />
            {summary.n > 0 && (
              <span className="text-xs text-muted-foreground/40">
                {summary.good}✓ {summary.needs_work}~ {summary.incorrect}✗
              </span>
            )}
            {summary.top_failure && (
              <span className={`text-xs rounded px-1.5 py-0.5 border ${EVAL_RUBRIC_COLORS[summary.top_failure]}`}>
                top: {EVAL_RUBRIC_LABELS[summary.top_failure]}
              </span>
            )}
          </div>
        </div>
        <span className="text-muted-foreground/30 flex-shrink-0">
          {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </span>
      </button>

      {/* Examples drawer */}
      {open && (
        <div className="border-t border-white/[0.04] px-3 py-2.5 space-y-2">
          <p className="text-xs text-muted-foreground/30 italic">
            {evalSampleCaveat(summary.n)}
          </p>
          {examples === null ? (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground/30">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading examples…
            </div>
          ) : examples.length === 0 ? (
            <p className="text-sm text-muted-foreground/30">No reviewed examples for this version yet.</p>
          ) : (
            <div className="space-y-2">
              {examples.slice(0, 10).map(r => <ExampleRow key={r.id} rating={r} />)}
              {examples.length > 10 && (
                <p className="text-xs text-muted-foreground/30">
                  Showing 10 of {examples.length}. Use the full eval page for more.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface EvalRatingsPanelProps {
  /** If set, only show this workflow */
  workflowFilter?: EvalWorkflow;
  /** Days look-back (default 90) */
  days?: number;
  /** Compact mode — fewer rows, no workflow description */
  compact?: boolean;
}

export function EvalRatingsPanel({
  workflowFilter,
  days = 90,
  compact = false,
}: EvalRatingsPanelProps) {
  const [summaries, setSummaries] = useState<EvalVersionSummary[]>([]);
  const [examples,  setExamples]  = useState<Map<string, EvalRatingRow[]>>(new Map());
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const h   = await authHeaders();
      const url = `/api/dialer/v1/eval-ratings/summary?days=${days}${workflowFilter ? `&workflow=${workflowFilter}` : ""}`;
      const res = await fetch(url, { headers: h });
      if (!res.ok) throw new Error("Failed to load eval summary");
      const { summaries: data } = await res.json();
      setSummaries(data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [workflowFilter, days]);

  useEffect(() => { load(); }, [load]);

  const loadExamples = useCallback(async (workflow: EvalWorkflow, version: string) => {
    const key = `${workflow}@${version}`;
    if (examples.has(key)) return;
    try {
      const h   = await authHeaders();
      const res = await fetch(
        `/api/dialer/v1/eval-ratings?workflow=${workflow}&prompt_version=${encodeURIComponent(version)}&limit=50`,
        { headers: h },
      );
      if (!res.ok) return;
      const { ratings } = await res.json();
      setExamples(prev => new Map(prev).set(key, ratings ?? []));
    } catch {
      // non-fatal
    }
  }, [examples]);

  return (
    <GlassCard className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-muted-foreground/50" />
          <h3 className="text-sm font-semibold text-foreground/80">
            {workflowFilter ? EVAL_WORKFLOW_LABELS[workflowFilter] : "AI Review"}
          </h3>
          <Badge variant="outline" className="text-xs border-border/20 text-foreground bg-muted/5">
            {days}d
          </Badge>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors"
          aria-label="Refresh"
        >
          {loading
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <RefreshCw className="w-3.5 h-3.5" />}
        </button>
      </div>

      {!compact && !workflowFilter && (
        <p className="text-sm text-muted-foreground/40 leading-relaxed">
          Reviewed AI output ratings grouped by workflow and prompt version.
          Pass rate shown only when n ≥ {EVAL_MIN_SAMPLE}. Raw examples always accessible.
        </p>
      )}

      {error && (
        <div className="flex items-center gap-2 text-xs text-foreground bg-muted/5 border border-border/20 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/30" />
        </div>
      ) : summaries.length === 0 ? (
        <div className="text-center py-6 space-y-2">
          <BookOpen className="w-6 h-6 text-muted-foreground/20 mx-auto" />
          <p className="text-xs text-muted-foreground/40">No eval ratings yet.</p>
          <p className="text-sm text-muted-foreground/25 leading-relaxed max-w-xs mx-auto">
            Ratings are written when Adam reviews dossier outputs, call QA findings,
            or post-call draft notes. The first row appears automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {(compact ? summaries.slice(0, 3) : summaries).map(s => (
            <VersionSummaryRow
              key={`${s.workflow}@${s.prompt_version}`}
              summary={s}
              examples={examples.get(`${s.workflow}@${s.prompt_version}`) ?? null}
              onLoadExamples={loadExamples}
            />
          ))}
          {compact && summaries.length > 3 && (
            <p className="text-xs text-muted-foreground/30 text-center">
              +{summaries.length - 3} more workflow versions — see full eval page
            </p>
          )}
        </div>
      )}
    </GlassCard>
  );
}
