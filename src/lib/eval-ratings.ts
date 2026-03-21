/**
 * Eval Ratings — judgment layer for AI workflow outputs
 *
 * Provides typed definitions, rubric vocabulary, and aggregation logic
 * for the eval_ratings table.
 *
 * PURPOSE:
 *   dialer_ai_traces = execution log (what ran, latency, raw output)
 *   eval_ratings     = judgment layer (was this output actually useful?)
 *
 * DESIGN RULES:
 *   - Verdicts are three-value: good / needs_work / incorrect
 *   - Rubric dimensions explain WHY — one per row, bounded allowlist
 *   - Aggregates are honest about sample size — show n, warn when n < 5
 *   - Raw examples are always accessible — summaries never hide the data
 *
 * BOUNDARY:
 *   - Zero DB imports. Pure TypeScript.
 *   - Client and server safe.
 *   - Never writes to leads, calls_log, or tasks.
 */

// ── Workflow vocabulary ───────────────────────────────────────────────────────

/**
 * AI workflows that produce eval-able outputs.
 * Mirrors dialer_ai_traces.workflow plus "routing" for classify outcomes.
 */
export type EvalWorkflow =
  | "summarize"   // AI call summarizer → calls_log.ai_summary
  | "extract"     // Claude extractor    → dossier artifacts
  | "draft_note"  // AI draft note       → post-call draft
  | "qa_notes"    // AI QA checker       → call_qa_findings
  | "routing";    // Classify caller type → inbound routing decision

export const EVAL_WORKFLOWS: EvalWorkflow[] = [
  "summarize", "extract", "draft_note", "qa_notes", "routing",
];

export const EVAL_WORKFLOW_LABELS: Record<EvalWorkflow, string> = {
  summarize:  "Call Summarizer",
  extract:    "Dossier Extractor",
  draft_note: "Post-Call Draft",
  qa_notes:   "Call QA",
  routing:    "Inbound Routing",
};

export const EVAL_WORKFLOW_DESCRIPTIONS: Record<EvalWorkflow, string> = {
  summarize:  "AI-generated call summary from operator notes and prior context.",
  extract:    "Claude-extracted facts from dossier artifacts (assessor, probate, etc.).",
  draft_note: "AI-drafted post-call structured note with summary, facts, next task.",
  qa_notes:   "AI QA check: trust-risk, weak follow-up, notes quality.",
  routing:    "Inbound caller classification: seller / buyer / vendor / spam / unknown.",
};

// ── Verdict ───────────────────────────────────────────────────────────────────

export type EvalVerdict = "good" | "needs_work" | "incorrect";

export const EVAL_VERDICTS: EvalVerdict[] = ["good", "needs_work", "incorrect"];

export const EVAL_VERDICT_LABELS: Record<EvalVerdict, string> = {
  good:       "Good",
  needs_work: "Needs work",
  incorrect:  "Incorrect",
};

export const EVAL_VERDICT_COLORS: Record<EvalVerdict, string> = {
  good:       "bg-muted/10 text-foreground border-border/20",
  needs_work: "bg-muted/10 text-foreground border-border/20",
  incorrect:  "bg-muted/10 text-foreground border-border/20",
};

// ── Rubric dimensions ─────────────────────────────────────────────────────────

export type EvalRubricDimension =
  | "useful_and_accurate"
  | "missing_key_fact"
  | "hallucinated_fact"
  | "wrong_tone"
  | "wrong_routing"
  | "incomplete_output"
  | "low_relevance"
  | "other";

export const EVAL_RUBRIC_DIMENSIONS: EvalRubricDimension[] = [
  "useful_and_accurate",
  "missing_key_fact",
  "hallucinated_fact",
  "wrong_tone",
  "wrong_routing",
  "incomplete_output",
  "low_relevance",
  "other",
];

export const EVAL_RUBRIC_LABELS: Record<EvalRubricDimension, string> = {
  useful_and_accurate: "Useful and accurate",
  missing_key_fact:    "Missing key fact",
  hallucinated_fact:   "Hallucinated fact",
  wrong_tone:          "Wrong tone",
  wrong_routing:       "Wrong routing",
  incomplete_output:   "Incomplete output",
  low_relevance:       "Low relevance",
  other:               "Other",
};

export const EVAL_RUBRIC_COLORS: Record<EvalRubricDimension, string> = {
  useful_and_accurate: "bg-muted/10 text-foreground border-border/20",
  missing_key_fact:    "bg-muted/10 text-foreground border-border/20",
  hallucinated_fact:   "bg-muted/10 text-foreground border-border/20",
  wrong_tone:          "bg-muted/10 text-foreground border-border/20",
  wrong_routing:       "bg-muted/10 text-foreground border-border/20",
  incomplete_output:   "bg-muted/10 text-foreground border-border/20",
  low_relevance:       "bg-muted/10 text-foreground border-border/20",
  other:               "bg-muted/10 text-foreground border-border/20",
};

/**
 * Which rubric dimensions are valid for a given verdict.
 * Prevents nonsensical combinations (e.g., verdict=good + dimension=hallucinated).
 */
export const VERDICT_RUBRIC_MAP: Record<EvalVerdict, EvalRubricDimension[]> = {
  good: [
    "useful_and_accurate",
  ],
  needs_work: [
    "missing_key_fact",
    "incomplete_output",
    "low_relevance",
    "wrong_tone",
    "other",
  ],
  incorrect: [
    "hallucinated_fact",
    "wrong_routing",
    "missing_key_fact",
    "wrong_tone",
    "other",
  ],
};

// ── DB row shape ──────────────────────────────────────────────────────────────

export interface EvalRatingRow {
  id:               string;
  run_id:           string;
  workflow:         EvalWorkflow;
  prompt_version:   string;
  model:            string | null;
  lead_id:          string | null;
  call_log_id:      string | null;
  session_id:       string | null;
  verdict:          EvalVerdict;
  rubric_dimension: EvalRubricDimension | null;
  reviewer_note:    string | null;
  output_snapshot:  string | null;
  reviewed_by:      string | null;
  reviewed_at:      string;
  created_at:       string;
  updated_at:       string;
}

// ── Write input ───────────────────────────────────────────────────────────────

export interface WriteEvalRatingInput {
  run_id:           string;
  workflow:         EvalWorkflow;
  prompt_version:   string;
  model?:           string | null;
  lead_id?:         string | null;
  call_log_id?:     string | null;
  session_id?:      string | null;
  verdict:          EvalVerdict;
  rubric_dimension?: EvalRubricDimension | null;
  reviewer_note?:   string | null;
  output_snapshot?: string | null;
}

// ── Aggregation ───────────────────────────────────────────────────────────────

export interface EvalVersionSummary {
  workflow:       EvalWorkflow;
  prompt_version: string;
  /** Total reviewed ratings for this version */
  n:              number;
  /** Verdict counts */
  good:           number;
  needs_work:     number;
  incorrect:      number;
  /** Pass rate = good / n. Null when n < MIN_SAMPLE */
  pass_rate:      number | null;
  /** Most common failure dimension (needs_work + incorrect rows) */
  top_failure:    EvalRubricDimension | null;
  /** Latest review date */
  last_reviewed:  string | null;
}

/** Minimum sample size before showing pass rate as a meaningful metric */
export const EVAL_MIN_SAMPLE = 5;

/**
 * Derive per-workflow-version summaries from a flat list of rating rows.
 * Pure function — no DB calls.
 */
export function deriveVersionSummaries(rows: EvalRatingRow[]): EvalVersionSummary[] {
  const groups = new Map<string, EvalRatingRow[]>();
  for (const row of rows) {
    const key = `${row.workflow}@${row.prompt_version}`;
    const g   = groups.get(key) ?? [];
    g.push(row);
    groups.set(key, g);
  }

  return [...groups.entries()].map(([key, group]) => {
    const [workflow, prompt_version] = key.split("@") as [EvalWorkflow, string];
    const n          = group.length;
    const good       = group.filter(r => r.verdict === "good").length;
    const needs_work = group.filter(r => r.verdict === "needs_work").length;
    const incorrect  = group.filter(r => r.verdict === "incorrect").length;

    // Count failure dimensions
    const dimCounts = new Map<EvalRubricDimension, number>();
    for (const r of group) {
      if (r.verdict !== "good" && r.rubric_dimension) {
        dimCounts.set(r.rubric_dimension, (dimCounts.get(r.rubric_dimension) ?? 0) + 1);
      }
    }
    const top_failure = dimCounts.size > 0
      ? [...dimCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
      : null;

    const last_reviewed = group
      .map(r => r.reviewed_at)
      .sort()
      .at(-1) ?? null;

    return {
      workflow,
      prompt_version,
      n,
      good,
      needs_work,
      incorrect,
      pass_rate: n >= EVAL_MIN_SAMPLE ? Math.round((good / n) * 100) : null,
      top_failure,
      last_reviewed,
    };
  }).sort((a, b) => {
    // Sort: workflow asc, then most recent first
    const wc = a.workflow.localeCompare(b.workflow);
    if (wc !== 0) return wc;
    return (b.last_reviewed ?? "").localeCompare(a.last_reviewed ?? "");
  });
}

/**
 * Returns a human-readable sample-size caveat.
 * Always shown alongside any rate to prevent misleading interpretation.
 */
export function evalSampleCaveat(n: number): string {
  if (n === 0)  return "No reviewed examples yet.";
  if (n < EVAL_MIN_SAMPLE) return `Only ${n} reviewed example${n === 1 ? "" : "s"} — not statistically useful yet.`;
  if (n < 20)   return `${n} reviewed examples — directional, not conclusive.`;
  return `${n} reviewed examples.`;
}
