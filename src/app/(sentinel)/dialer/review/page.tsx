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

import Link from "next/link";
import {
  Phone, ArrowRight, CalendarClock, AlertTriangle,
  CheckSquare, Brain, Loader2, TrendingUp, TrendingDown,
  Minus, RefreshCw, Flag,
} from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { useDialerWeekly, type WeekBucket } from "@/hooks/use-dialer-weekly";

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

// ── Page ──────────────────────────────────────────────────────

export default function DialerReviewPage() {
  const { data, loading, error } = useDialerWeekly(4);

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
              href="/dialer/war-room"
              className="flex items-center gap-1.5 rounded-[10px] border border-cyan/20 bg-cyan/[0.04] px-3 py-2 text-[11px] text-cyan/70 hover:text-cyan hover:border-cyan/30 transition-colors"
            >
              <TrendingUp className="h-3 w-3" />
              War Room →
            </Link>
          </div>
        )}

      </div>
    </PageShell>
  );
}
