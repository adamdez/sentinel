"use client";

/**
 * /dialer/review — Dialer Weekly KPI Summary
 *
 * Read-only operational review page. Consumes GET /api/dialer/v1/weekly.
 * Shows last 4 ISO weeks of call/task discipline metrics with
 * week-over-week direction signals and deep links into tasks/leads surfaces.
 *
 * Does NOT touch publish-manager, crm-bridge, or any write path.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Phone, ArrowRight, CalendarClock, AlertTriangle,
  CheckSquare, Brain, Loader2, TrendingUp, TrendingDown,
  Minus, RefreshCw, Flag, FileText, BookMarked, X,
  HelpCircle, GitCompare, Radio, MessageSquare, ShieldAlert,
} from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { useDialerWeekly, type WeekBucket } from "@/hooks/use-dialer-weekly";
import { useStaleBuyerCount } from "@/components/sentinel/buyer-stale-panel";
import { usePromptRegistry } from "@/hooks/use-prompt-registry";
import { PromptVersionBadge } from "@/components/sentinel/prompt-version-badge";
import { useVoiceRegistry } from "@/hooks/use-voice-registry";
import { VOICE_WORKFLOW_LABELS } from "@/lib/voice-registry";
import { VoiceConsentLedger } from "@/components/sentinel/voice-consent-ledger";
import { TRUST_LANGUAGE_VERSION, getFirstCallSnippets, getAllSnippets } from "@/lib/trust-language";
import { useObjectionSummary } from "@/hooks/use-objection-summary";
import { OBJECTION_TAG_LABELS } from "@/lib/dialer/types";
import { supabase } from "@/lib/supabase";
import type { QualGapLeadRow, QualGapsSummary } from "@/app/api/dialer/v1/qual-gaps/route";
import type { QualItemKey } from "@/lib/dialer/qual-checklist";
import { QUAL_CHECKLIST } from "@/lib/dialer/qual-checklist";
import { CONTRADICTION_CHECK_LABELS } from "@/lib/contradiction-checks";
import type { ContradictionCheckType } from "@/lib/contradiction-checks";

// ── Helpers ───────────────────────────────────────────────────

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  return `${v}%`;
}

function fmtWeekLabel(weekStr: string, weekStart: string): string {
  // "2026-W11" + Monday ISO → "W11 · Mar 9"
  const d = new Date(weekStart);
  const mon = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${weekStr.replace(/^\d{4}-/, "")} · ${mon}`;
}

type Direction = "up" | "down" | "flat" | "new";

/** Compare two nullable numbers. Returns direction for a metric where higher = better. */
function dirGood(curr: number | null, prev: number | null): Direction {
  if (curr == null || prev == null) return "new";
  if (curr > prev) return "up";
  if (curr < prev) return "down";
  return "flat";
}

/** Higher = worse (slippage, flags). */
function dirBad(curr: number | null, prev: number | null): Direction {
  if (curr == null || prev == null) return "new";
  if (curr > prev) return "down";   // worse
  if (curr < prev) return "up";     // better
  return "flat";
}

function DirectionBadge({ dir }: { dir: Direction }) {
  if (dir === "new")  return <span className="text-[9px] text-muted-foreground/40">new</span>;
  if (dir === "flat") return <Minus className="h-2.5 w-2.5 text-muted-foreground/30" />;
  if (dir === "up")   return <TrendingUp   className="h-2.5 w-2.5 text-emerald-400" />;
  return                     <TrendingDown className="h-2.5 w-2.5 text-red-400" />;
}

// ── Column definitions ────────────────────────────────────────

interface ColDef {
  key: string;
  label: string;
  abbr?: string;     // short label for mobile
  icon: React.ElementType;
  iconColor: string;
  getValue: (w: WeekBucket) => string;
  getDir: (curr: WeekBucket, prev: WeekBucket | null) => Direction;
  /** Highlight cell when value indicates a problem */
  isDanger?: (w: WeekBucket) => boolean;
}

const COLS: ColDef[] = [
  {
    key: "calls_published",
    label: "Calls",
    icon: Phone,
    iconColor: "text-cyan/70",
    getValue: (w) => String(w.calls_published),
    getDir: (c, p) => dirGood(c.calls_published, p?.calls_published ?? null),
  },
  {
    key: "follow_up_calls",
    label: "Follow-ups",
    abbr: "F/U calls",
    icon: ArrowRight,
    iconColor: "text-purple-400/70",
    getValue: (w) => String(w.follow_up_calls),
    getDir: (c, p) => dirGood(c.follow_up_calls, p?.follow_up_calls ?? null),
  },
  {
    key: "tasks_created",
    label: "Tasks created",
    abbr: "Tasks",
    icon: CheckSquare,
    iconColor: "text-amber-400/70",
    getValue: (w) => String(w.tasks_created),
    getDir: (c, p) => dirGood(c.tasks_created, p?.tasks_created ?? null),
  },
  {
    key: "task_creation_pct",
    label: "Task rate",
    icon: CheckSquare,
    iconColor: "text-amber-400/70",
    getValue: (w) => fmtPct(w.task_creation_pct),
    getDir: (c, p) => dirGood(c.task_creation_pct, p?.task_creation_pct ?? null),
    isDanger: (w) => w.task_creation_pct != null && w.task_creation_pct < 80,
  },
  {
    key: "callbacks_defaulted",
    label: "Defaulted",
    abbr: "No date",
    icon: CalendarClock,
    iconColor: "text-orange-400/70",
    getValue: (w) => String(w.callbacks_defaulted),
    getDir: (c, p) => dirBad(c.callbacks_defaulted, p?.callbacks_defaulted ?? null),
    isDanger: (w) => w.callbacks_defaulted > 0,
  },
  {
    key: "callback_slippage_pct",
    label: "Slippage",
    icon: CalendarClock,
    iconColor: "text-orange-400/70",
    getValue: (w) => fmtPct(w.callback_slippage_pct),
    getDir: (c, p) => dirBad(c.callback_slippage_pct, p?.callback_slippage_pct ?? null),
    isDanger: (w) => w.callback_slippage_pct != null && w.callback_slippage_pct > 40,
  },
  {
    key: "ai_reviewed",
    label: "AI reviewed",
    abbr: "AI rev.",
    icon: Brain,
    iconColor: "text-purple-400/70",
    getValue: (w) => String(w.ai_reviewed),
    getDir: (c, p) => dirGood(c.ai_reviewed, p?.ai_reviewed ?? null),
  },
  {
    key: "ai_flagged",
    label: "AI flagged",
    abbr: "Flagged",
    icon: Flag,
    iconColor: "text-red-400/70",
    getValue: (w) => String(w.ai_flagged),
    getDir: (c, p) => dirBad(c.ai_flagged, p?.ai_flagged ?? null),
    isDanger: (w) => w.ai_flagged > 0,
  },
  {
    key: "ai_flag_rate_pct",
    label: "Flag rate",
    icon: Flag,
    iconColor: "text-red-400/70",
    getValue: (w) => fmtPct(w.ai_flag_rate_pct),
    getDir: (c, p) => dirBad(c.ai_flag_rate_pct, p?.ai_flag_rate_pct ?? null),
    isDanger: (w) => w.ai_flag_rate_pct != null && w.ai_flag_rate_pct > 25,
  },
];

// ── Qual gap hook (inline — single endpoint, no shared state) ─────────────────

interface QualGapsData {
  summary: QualGapsSummary;
  leads:   QualGapLeadRow[];
}

function useQualGaps(days = 30) {
  const [data,    setData]    = useState<QualGapsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase.auth.getSession().then(({ data: { session } }) => {
      const h: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) h["Authorization"] = `Bearer ${session.access_token}`;
      return fetch(`/api/dialer/v1/qual-gaps?days=${days}&limit=15`, { headers: h });
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: QualGapsData | null) => { if (!cancelled && d) setData(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days]);

  return { data, loading };
}

// ── Contradiction flags summary hook (inline) ─────────────────────────────────

interface ContradictionFlagSummaryRow {
  id:          string;
  lead_id:     string;
  check_type:  string;
  severity:    string;
  description: string;
  created_at:  string;
}

function useContradictionFlagsSummary(days = 14) {
  const [rows,    setRows]    = useState<ContradictionFlagSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("lead_contradiction_flags")
      .select("id, lead_id, check_type, severity, description, created_at")
      .eq("status", "unreviewed")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }: { data: ContradictionFlagSummaryRow[] | null }) => {
        if (!cancelled && data) setRows(data);
      })
      .then(
        () => { if (!cancelled) setLoading(false); },
        () => { if (!cancelled) setLoading(false); }
      );
    return () => { cancelled = true; };
  }, [days]);

  return { rows, loading };
}

// ── Page ──────────────────────────────────────────────────────

export default function DialerReviewPage() {
  const { data, loading, error } = useDialerWeekly(4);
  const { count: staleBuyerCount } = useStaleBuyerCount();
  const { versions: promptVersions, metaMap, loading: promptsLoading } = usePromptRegistry();
  const { versions: voiceVersions, loading: voiceLoading } = useVoiceRegistry();
  const { summary: objSummary, loading: objLoading, resolveTag } = useObjectionSummary(30);
  const { data: qualGapsData, loading: qualGapsLoading } = useQualGaps(30);
  const { rows: contradictionRows, loading: contradictionLoading } = useContradictionFlagsSummary(14);

  return (
    <PageShell
      title="Dialer Review"
      description="Weekly call and task discipline — last 4 ISO weeks. Deep data from dialer_events."
    >
      <div className="space-y-4">

        {/* ── Overdue alert ─────────────────────────────────── */}
        {data && data.overdue_tasks_now > 0 && (
          <Link href="/tasks">
            <div className="flex items-center gap-2 rounded-[10px] border border-orange-500/30 bg-orange-500/[0.06] px-3 py-2 text-xs text-orange-300 hover:bg-orange-500/[0.1] transition-colors cursor-pointer">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>
                {data.overdue_tasks_now} overdue dialer follow-up task{data.overdue_tasks_now !== 1 ? "s" : ""} —
                callback was missed
              </span>
              <span className="ml-auto text-orange-400/70 text-[10px]">View Tasks →</span>
            </div>
          </Link>
        )}

        {/* ── Loading ───────────────────────────────────────── */}
        {loading && (
          <GlassCard hover={false} className="!p-8">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading weekly data…
            </div>
          </GlassCard>
        )}

        {/* ── Error ─────────────────────────────────────────── */}
        {error && !loading && (
          <GlassCard hover={false} className="!p-4 border-red-500/20">
            <p className="text-sm text-red-400">{error}</p>
          </GlassCard>
        )}

        {/* ── Main table ────────────────────────────────────── */}
        {data && !loading && (
          <GlassCard hover={false} className="!p-0 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-3.5 w-3.5 text-cyan" />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Weekly Discipline
                </h2>
              </div>
              <span className="text-[10px] text-muted-foreground/40">
                Updated {new Date(data.generated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>

            {/* Scrollable table */}
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.04]">
                    <th className="sticky left-0 bg-[#0d0d12] z-10 px-4 py-2.5 text-left text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider whitespace-nowrap min-w-[110px]">
                      Week
                    </th>
                    {COLS.map((col) => (
                      <th
                        key={col.key}
                        className="px-3 py-2.5 text-right text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider whitespace-nowrap"
                      >
                        <div className="flex items-center justify-end gap-1">
                          <col.icon className={`h-2.5 w-2.5 ${col.iconColor}`} />
                          <span className="hidden sm:inline">{col.label}</span>
                          <span className="sm:hidden">{col.abbr ?? col.label}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.weeks.map((week, i) => {
                    const prev = data.weeks[i + 1] ?? null;
                    const isCurrentWeek = i === 0;

                    return (
                      <tr
                        key={week.week}
                        className={`border-b border-white/[0.03] transition-colors hover:bg-white/[0.02] ${
                          isCurrentWeek ? "bg-white/[0.015]" : ""
                        }`}
                      >
                        {/* Week label */}
                        <td className="sticky left-0 bg-[#0d0d12] z-10 px-4 py-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {isCurrentWeek && (
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan shrink-0" />
                            )}
                            <span className={`font-medium ${isCurrentWeek ? "text-foreground" : "text-muted-foreground/70"}`}>
                              {fmtWeekLabel(week.week, week.week_start)}
                            </span>
                          </div>
                        </td>

                        {/* Metric cells */}
                        {COLS.map((col) => {
                          const value = col.getValue(week);
                          const dir   = col.getDir(week, prev);
                          const danger = col.isDanger?.(week) ?? false;

                          return (
                            <td
                              key={col.key}
                              className={`px-3 py-2.5 text-right tabular-nums whitespace-nowrap ${
                                danger
                                  ? "text-orange-300"
                                  : value === "—"
                                  ? "text-muted-foreground/30"
                                  : "text-foreground/80"
                              }`}
                            >
                              <div className="flex items-center justify-end gap-1">
                                {isCurrentWeek && <DirectionBadge dir={dir} />}
                                <span className={isCurrentWeek && danger ? "font-semibold" : ""}>
                                  {value}
                                </span>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 border-t border-white/[0.04]">
              <span className="text-[10px] text-muted-foreground/40 flex items-center gap-1">
                <TrendingUp className="h-2.5 w-2.5 text-emerald-400" /> better vs prior week
              </span>
              <span className="text-[10px] text-muted-foreground/40 flex items-center gap-1">
                <TrendingDown className="h-2.5 w-2.5 text-red-400" /> worse vs prior week
              </span>
              <span className="text-[10px] text-muted-foreground/40">
                — = no data / zero denominator
              </span>
              <span className="text-[10px] text-muted-foreground/40 flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan" /> current week (partial)
              </span>
            </div>
          </GlassCard>
        )}

        {/* ── Metric glossary ───────────────────────────────── */}
        {data && !loading && (
          <GlassCard hover={false} className="!p-4">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3">
              Metric notes
            </h3>
            <dl className="space-y-1.5 text-[11px]">
              <div className="flex gap-2">
                <dt className="text-muted-foreground/50 whitespace-nowrap shrink-0 w-28">Task rate</dt>
                <dd className="text-muted-foreground/70">Follow-up tasks created ÷ follow-up calls published. &lt;80% = task creation is leaking.</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground/50 whitespace-nowrap shrink-0 w-28">Slippage</dt>
                <dd className="text-muted-foreground/70">Tasks with defaulted callback date ÷ tasks created. High = operator not setting dates, callbacks unscheduled.</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground/50 whitespace-nowrap shrink-0 w-28">Flag rate</dt>
                <dd className="text-muted-foreground/70">AI outputs flagged as bad ÷ AI outputs reviewed. &gt;25% = prompt quality needs attention.</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground/50 whitespace-nowrap shrink-0 w-28">Overdue now</dt>
                <dd className="text-muted-foreground/70">
                  Live count of pending dialer follow-up tasks past due_at. {" "}
                  <Link href="/tasks" className="text-cyan/70 hover:text-cyan underline-offset-2 hover:underline">
                    View in Tasks →
                  </Link>
                </dd>
              </div>
            </dl>
            <p className="text-[10px] text-muted-foreground/30 mt-3">
              Direction arrows (▲▼) compare current week to prior week. Current week is always partial.
              Rates show — when the denominator is zero — this is correct, not missing data.
            </p>
          </GlassCard>
        )}

        {/* ── Qualification gaps ────────────────────────────── */}
        <GlassCard hover={false} className="!p-4">
          <div className="flex items-center gap-2 mb-3">
            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50" />
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Qualification Gaps — Last 30 Days
            </h3>
            {qualGapsData && (
              <span className="ml-auto text-[10px] text-muted-foreground/35">
                {qualGapsData.summary.leads_with_gaps} of {qualGapsData.summary.total_live_calls} live calls incomplete
              </span>
            )}
          </div>

          {qualGapsLoading && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/30">
              <Loader2 className="h-2.5 w-2.5 animate-spin" /> Loading…
            </div>
          )}

          {!qualGapsLoading && qualGapsData && (
            <div className="space-y-3">
              {/* By-field counts */}
              {Object.keys(qualGapsData.summary.by_field).length > 0 && (
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground/30 mb-1.5">
                    Most common missing fields
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(QUAL_CHECKLIST as readonly { key: QualItemKey; label: string }[])
                      .filter((item) => (qualGapsData.summary.by_field[item.key] ?? 0) > 0)
                      .sort((a, b) =>
                        (qualGapsData.summary.by_field[b.key] ?? 0) -
                        (qualGapsData.summary.by_field[a.key] ?? 0)
                      )
                      .map((item) => (
                        <span
                          key={item.key}
                          className="inline-flex items-center gap-1 rounded-[6px] border border-white/[0.06] bg-white/[0.02] px-2 py-0.5 text-[10px] text-muted-foreground/60"
                        >
                          <HelpCircle className="h-2 w-2 opacity-40" aria-hidden="true" />
                          {item.label}
                          <span className="text-[9px] text-muted-foreground/35 ml-0.5">
                            {qualGapsData.summary.by_field[item.key]}
                          </span>
                        </span>
                      ))}
                  </div>
                </div>
              )}

              {/* Leads list */}
              {qualGapsData.leads.length > 0 ? (
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground/30 mb-1.5">
                    Leads with incomplete qualification
                  </p>
                  <div className="space-y-1">
                    {qualGapsData.leads.map((row) => (
                      <div
                        key={row.leadId}
                        className="flex items-start gap-2 rounded-[8px] border border-white/[0.04] bg-white/[0.015] px-2.5 py-1.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-medium text-foreground/70 truncate">
                              {row.address ?? row.ownerName ?? "Unknown lead"}
                            </span>
                            <span className="shrink-0 text-[9px] text-muted-foreground/30 capitalize">
                              {row.disposition.replace(/_/g, " ")}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {row.gapLabels.map((label) => (
                              <span
                                key={label}
                                className="inline-flex items-center rounded-[4px] border border-white/[0.05] bg-white/[0.02] px-1.5 py-px text-[9px] text-muted-foreground/40"
                              >
                                {label}
                              </span>
                            ))}
                          </div>
                          {row.nextQuestion && (
                            <p className="mt-0.5 text-[10px] text-muted-foreground/30 italic truncate">
                              Ask: {row.nextQuestion}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[9px] text-muted-foreground/30">
                            {new Date(row.lastCallDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </p>
                          <Link
                            href={`/leads/${row.leadId}`}
                            className="text-[9px] text-cyan/40 hover:text-cyan/70 transition-colors"
                          >
                            View →
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground/30">
                  No qualification gaps found in the last 30 days.
                </p>
              )}
            </div>
          )}
        </GlassCard>

        {/* ── Objection patterns ────────────────────────────── */}
        <GlassCard hover={false} className="!p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-3.5 w-3.5 text-orange-400/60" />
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Objection Patterns — Last 30 Days
            </h3>
            {objSummary && (
              <span className="ml-auto text-[10px] text-muted-foreground/30">
                {objSummary.total_tagged} lead{objSummary.total_tagged !== 1 ? "s" : ""} tagged
              </span>
            )}
          </div>

          {objLoading && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/30">
              <Loader2 className="h-2.5 w-2.5 animate-spin" /> Loading…
            </div>
          )}

          {!objLoading && (!objSummary || objSummary.by_tag.length === 0) && (
            <p className="text-[11px] text-muted-foreground/30 italic">
              No objection tags recorded yet. Tags are captured when Logan selects an objection in the post-call panel.
            </p>
          )}

          {!objLoading && objSummary && objSummary.by_tag.length > 0 && (
            <div className="space-y-1.5">
              {objSummary.by_tag.map((item) => (
                <div key={item.tag} className="flex items-center gap-2">
                  {/* Bar */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[11px] font-medium text-foreground/80 truncate">{item.label}</span>
                      <div className="flex items-center gap-2 ml-2 shrink-0">
                        <span className="text-[10px] text-muted-foreground/50">{item.total} total</span>
                        {item.open > 0 && (
                          <span className="text-[10px] text-orange-400/70">{item.open} open</span>
                        )}
                        {item.resolved > 0 && (
                          <span className="text-[10px] text-emerald-400/50">{item.resolved} resolved</span>
                        )}
                      </div>
                    </div>
                    <div className="h-1 rounded-full bg-white/[0.04] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-orange-500/40"
                        style={{
                          width: `${Math.round((item.total / objSummary.by_tag[0].total) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}

              {/* Recent unresolved — compact list with one-click resolve */}
              {objSummary.recent.filter((r) => r.status === "open").length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/[0.04]">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/40 mb-1.5">
                    Recent unresolved
                  </p>
                  <div className="space-y-1">
                    {objSummary.recent
                      .filter((r) => r.status === "open")
                      .slice(0, 5)
                      .map((r) => (
                        <div key={r.id} className="flex items-center gap-2 text-[11px]">
                          <span className="flex-1 text-foreground/70 truncate">
                            {(OBJECTION_TAG_LABELS as Record<string, string>)[r.tag] ?? r.tag}
                            {r.note && (
                              <span className="text-muted-foreground/40 ml-1">— {r.note}</span>
                            )}
                          </span>
                          <span className="text-[10px] text-muted-foreground/30 shrink-0">
                            {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                          <button
                            type="button"
                            onClick={() => resolveTag(r.id)}
                            className="shrink-0 flex items-center gap-0.5 rounded-[5px] border border-white/[0.06] bg-white/[0.02] px-1.5 py-0.5 text-[9px] text-muted-foreground/40 hover:text-emerald-400 hover:border-emerald-500/30 transition-colors"
                            title="Mark resolved"
                          >
                            <X className="h-2.5 w-2.5" />
                            resolve
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </GlassCard>

        {/* ── Contradiction flags ───────────────────────────── */}
        <GlassCard hover={false} className="!p-4">
          <div className="flex items-center gap-2 mb-3">
            <GitCompare className="h-3.5 w-3.5 text-orange-400/60" />
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Contradiction Flags — Last 14 Days
            </h3>
            {!contradictionLoading && (
              <span className="ml-auto text-[10px] text-muted-foreground/35">
                {contradictionRows.length} unreviewed
              </span>
            )}
          </div>

          {contradictionLoading && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/30">
              <Loader2 className="h-2.5 w-2.5 animate-spin" /> Loading…
            </div>
          )}

          {!contradictionLoading && contradictionRows.length === 0 && (
            <p className="text-[11px] text-muted-foreground/30">No unreviewed contradiction flags in the last 14 days.</p>
          )}

          {!contradictionLoading && contradictionRows.length > 0 && (
            <div className="space-y-1.5">
              {/* Count by type */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(Object.keys(CONTRADICTION_CHECK_LABELS) as ContradictionCheckType[])
                  .filter((k) => contradictionRows.some((r) => r.check_type === k))
                  .map((k) => {
                    const count = contradictionRows.filter((r) => r.check_type === k).length;
                    const hasFlagSeverity = contradictionRows.some((r) => r.check_type === k && r.severity === "flag");
                    return (
                      <span
                        key={k}
                        className={`inline-flex items-center gap-1 rounded-[6px] border px-2 py-0.5 text-[10px] ${
                          hasFlagSeverity
                            ? "border-red-500/25 bg-red-500/[0.06] text-red-400/80"
                            : "border-orange-500/20 bg-orange-500/[0.05] text-orange-400/70"
                        }`}
                      >
                        {hasFlagSeverity
                          ? <Flag className="h-2 w-2" aria-hidden="true" />
                          : <AlertTriangle className="h-2 w-2" aria-hidden="true" />}
                        {CONTRADICTION_CHECK_LABELS[k]}
                        <span className="opacity-60">{count}</span>
                      </span>
                    );
                  })}
              </div>

              {/* Recent flag rows */}
              <div className="space-y-1">
                {contradictionRows.slice(0, 5).map((row) => (
                  <div
                    key={row.id}
                    className="flex items-start gap-2 rounded-[8px] border border-white/[0.04] bg-white/[0.015] px-2.5 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-foreground/65 leading-snug line-clamp-2">{row.description}</p>
                      <p className="text-[9px] text-muted-foreground/30 mt-0.5">
                        {new Date(row.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </p>
                    </div>
                    <Link
                      href={`/leads/${row.lead_id}`}
                      className="shrink-0 text-[9px] text-cyan/40 hover:text-cyan/70 transition-colors"
                    >
                      View →
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}
        </GlassCard>

        {/* ── Prompt versions ───────────────────────────────── */}
        <GlassCard hover={false} className="!p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BookMarked className="h-3.5 w-3.5 text-muted-foreground/40" />
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Active Prompt Versions
              </h3>
            </div>
            <Link
              href="/settings/prompt-registry"
              className="text-[9px] text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors"
            >
              Manage →
            </Link>
          </div>
          {promptsLoading ? (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/30">
              <Loader2 className="h-2.5 w-2.5 animate-spin" /> Loading…
            </div>
          ) : promptVersions.length === 0 ? (
            <p className="text-[11px] text-muted-foreground/30">No prompt versions registered.</p>
          ) : (
            <div className="space-y-2">
              {promptVersions.map(v => (
                <div key={`${v.workflow}@${v.version}`} className="flex items-start gap-3">
                  <PromptVersionBadge
                    workflow={v.workflow}
                    version={v.version}
                    meta={metaMap[`${v.workflow}@${v.version}`]}
                  />
                </div>
              ))}
            </div>
          )}
        </GlassCard>

        {/* ── Voice Config ──────────────────────────────────── */}
        <GlassCard hover={false} className="!p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Radio className="h-3.5 w-3.5 text-muted-foreground/40" />
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Active Voice Config
              </h3>
            </div>
            <Link
              href="/settings/voice-registry"
              className="text-[9px] text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors"
            >
              Manage →
            </Link>
          </div>
          {voiceLoading ? (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/30">
              <Loader2 className="h-2.5 w-2.5 animate-spin" /> Loading…
            </div>
          ) : voiceVersions.length === 0 ? (
            <p className="text-[11px] text-muted-foreground/30">No voice registry entries found.</p>
          ) : (
            <div className="space-y-1.5">
              {voiceVersions
                .filter(v => v.status === "active")
                .map(v => {
                  const label = (VOICE_WORKFLOW_LABELS as Record<string, string>)[v.workflow] ?? v.workflow;
                  return (
                    <div key={`${v.workflow}@${v.version}`} className="flex items-start gap-2 text-[10px]">
                      <span className="text-muted-foreground/50 w-[120px] shrink-0">{label}</span>
                      <code className="text-foreground/50 font-mono text-[9px]">v{v.version}</code>
                      <span className={`text-[8px] px-1 py-0.5 rounded border ${
                        v.registry_type === "handoff_rule"
                          ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                          : "bg-cyan/10 text-cyan border-cyan/20"
                      }`}>
                        {v.registry_type === "handoff_rule" ? "rule" : "script"}
                      </span>
                    </div>
                  );
                })}
              {voiceVersions.filter(v => v.status === "active").length === 0 && (
                <p className="text-[10px] text-amber-400/60">No active entries. Check voice-registry settings.</p>
              )}
            </div>
          )}
        </GlassCard>

        {/* ── Trust Language ────────────────────────────────── */}
        <GlassCard hover={false} className="!p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground/40" />
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Trust Language Pack
              </h3>
              <code className="text-[8px] font-mono text-muted-foreground/25">v{TRUST_LANGUAGE_VERSION}</code>
            </div>
            <Link
              href="/settings/trust-language"
              className="text-[9px] text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors"
            >
              View all →
            </Link>
          </div>
          <div className="space-y-1">
            {getFirstCallSnippets().map(s => (
              <div key={s.key} className="flex items-start gap-2 text-[9px]">
                <span className="text-muted-foreground/40 w-[130px] shrink-0 truncate">{s.label}</span>
                <span className="text-muted-foreground/30 italic line-clamp-1">{s.summary}</span>
              </div>
            ))}
          </div>
          <p className="text-[8px] text-muted-foreground/20 mt-2">
            {getAllSnippets().length} snippets active · First-call priority: {getFirstCallSnippets().length}
          </p>
        </GlassCard>

        {/* ── Voice Policy Ledger ────────────────────────────── */}
        <VoiceConsentLedger days={14} />

        {/* ── Actions ───────────────────────────────────────── */}
        {data && !loading && (
          <div className="flex flex-wrap gap-2">
            <Link
              href="/tasks"
              className="flex items-center gap-1.5 rounded-[10px] border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-[11px] text-muted-foreground hover:text-foreground hover:border-white/[0.12] transition-colors"
            >
              <CheckSquare className="h-3 w-3" />
              Open Tasks
            </Link>
            <Link
              href="/leads"
              className="flex items-center gap-1.5 rounded-[10px] border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-[11px] text-muted-foreground hover:text-foreground hover:border-white/[0.12] transition-colors"
            >
              <Phone className="h-3 w-3" />
              Leads
            </Link>
            <Link
              href="/dialer"
              className="flex items-center gap-1.5 rounded-[10px] border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-[11px] text-muted-foreground hover:text-foreground hover:border-white/[0.12] transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Back to Dialer
            </Link>
            <Link
              href="/dialer/review/dossier-queue"
              className="flex items-center gap-1.5 rounded-[10px] border border-amber-500/20 bg-amber-500/[0.04] px-3 py-2 text-[11px] text-amber-600/70 dark:text-amber-400/70 hover:text-amber-600 dark:hover:text-amber-400 hover:border-amber-500/30 transition-colors"
            >
              <FileText className="h-3 w-3" />
              Dossier Review →
            </Link>
            <Link
              href="/buyers"
              className="flex items-center gap-1.5 rounded-[10px] border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-[11px] text-muted-foreground hover:text-foreground hover:border-white/[0.12] transition-colors"
            >
              <AlertTriangle className="h-3 w-3" />
              Buyers
              {staleBuyerCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[9px] font-medium">
                  {staleBuyerCount} stale
                </span>
              )}
            </Link>
            <Link
              href="/dialer/war-room"
              className="flex items-center gap-1.5 rounded-[10px] border border-cyan/20 bg-cyan/[0.04] px-3 py-2 text-[11px] text-cyan/70 hover:text-cyan hover:border-cyan/30 transition-colors"
            >
              <TrendingUp className="h-3 w-3" />
              War Room →
            </Link>
            <Link
              href="/settings/voice-registry"
              className="flex items-center gap-1.5 rounded-[10px] border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-[11px] text-muted-foreground hover:text-foreground hover:border-white/[0.12] transition-colors"
            >
              <Radio className="h-3 w-3" />
              Voice Registry
            </Link>
            <Link
              href="/settings/trust-language"
              className="flex items-center gap-1.5 rounded-[10px] border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-[11px] text-muted-foreground hover:text-foreground hover:border-white/[0.12] transition-colors"
            >
              <MessageSquare className="h-3 w-3" />
              Trust Language
            </Link>
            <Link
              href="/settings/outbound-pilot"
              className="flex items-center gap-1.5 rounded-[10px] border border-amber-500/20 bg-amber-500/[0.04] px-3 py-2 text-[11px] text-amber-600/70 dark:text-amber-400/70 hover:text-amber-600 dark:hover:text-amber-400 hover:border-amber-500/30 transition-colors"
            >
              <ShieldAlert className="h-3 w-3" />
              Outbound Prep
            </Link>
            <Link
              href="/dialer/review/eval"
              className="flex items-center gap-1.5 rounded-[10px] border border-blue-500/20 bg-blue-500/[0.04] px-3 py-2 text-[11px] text-blue-600/70 dark:text-blue-400/70 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-500/30 transition-colors"
            >
              <Brain className="h-3 w-3" />
              AI Eval →
            </Link>
          </div>
        )}

      </div>
    </PageShell>
  );
}
