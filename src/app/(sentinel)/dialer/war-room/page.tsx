"use client";

/**
 * /dialer/war-room — Call Review
 *
 * Single read-only surface composing all existing read-side signals:
 *   - Live overdue alert banner (tasks past due)
 *   - Daily brief: top slippage / overdue follow-up / flagged AI / attention leads
 *   - Call quality snapshot: AI review queue, correction rate, unreviewed traces
 *   - Missed opportunity queue: per-lead leakage signals
 *   - Weekly discipline table: 4-week KPI trend (from /dialer/review)
 *
 * Every section delegates data fetching to existing endpoints.
 * No new API routes, no migrations, no write paths.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckSquare,
  Phone,
  PhoneIncoming,
  BrainCircuit,
  SearchX,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  RefreshCw,
  CalendarClock,
  Flag,
  ArrowRight,
  Brain,
  Crosshair,
  ExternalLink,
} from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { DailyBrief } from "@/components/sentinel/dashboard/widgets/daily-brief";
import { CallQualitySnapshot } from "@/components/sentinel/dashboard/widgets/call-quality-snapshot";
import { MissedOpportunityQueue } from "@/components/sentinel/dashboard/widgets/missed-opportunity-queue";
import { MissedInboundQueue } from "@/components/sentinel/dashboard/widgets/missed-inbound-queue";
import { useDialerWeekly, type WeekBucket } from "@/hooks/use-dialer-weekly";
import { supabase } from "@/lib/supabase";
import type { MissedInbound, UnclassifiedAnswered } from "@/app/api/dialer/v1/queue/route";

// ─────────────────────────────────────────────────────────────
// Weekly table helpers (mirror of /dialer/review)
// ─────────────────────────────────────────────────────────────

function fmtPct(v: number | null): string {
  return v == null ? "—" : `${v}%`;
}

function fmtWeekLabel(weekStr: string, weekStart: string): string {
  const d = new Date(weekStart);
  const mon = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${weekStr.replace(/^\d{4}-/, "")} · ${mon}`;
}

type Direction = "up" | "down" | "flat" | "new";

function dirGood(curr: number | null, prev: number | null): Direction {
  if (curr == null || prev == null) return "new";
  if (curr > prev) return "up";
  if (curr < prev) return "down";
  return "flat";
}

function dirBad(curr: number | null, prev: number | null): Direction {
  if (curr == null || prev == null) return "new";
  if (curr > prev) return "down";
  if (curr < prev) return "up";
  return "flat";
}

function DirBadge({ dir }: { dir: Direction }) {
  if (dir === "new")  return <span className="text-xs text-muted-foreground/40">new</span>;
  if (dir === "flat") return <Minus className="h-2.5 w-2.5 text-muted-foreground/30" />;
  if (dir === "up")   return <TrendingUp className="h-2.5 w-2.5 text-foreground" />;
  return <TrendingDown className="h-2.5 w-2.5 text-foreground" />;
}

interface ColDef {
  key: string;
  label: string;
  icon: React.ElementType;
  iconColor: string;
  getValue: (w: WeekBucket) => string;
  getDir: (curr: WeekBucket, prev: WeekBucket | null) => Direction;
  isDanger?: (w: WeekBucket) => boolean;
}

const WEEK_COLS: ColDef[] = [
  { key: "calls_published",      label: "Calls",      icon: Phone,         iconColor: "text-primary/70",      getValue: (w) => String(w.calls_published),        getDir: (c, p) => dirGood(c.calls_published, p?.calls_published ?? null) },
  { key: "follow_up_calls",      label: "F/U Calls",  icon: ArrowRight,    iconColor: "text-foreground/70", getValue: (w) => String(w.follow_up_calls),        getDir: (c, p) => dirGood(c.follow_up_calls, p?.follow_up_calls ?? null) },
  { key: "tasks_created",        label: "Tasks",      icon: CheckSquare,   iconColor: "text-foreground/70",  getValue: (w) => String(w.tasks_created),          getDir: (c, p) => dirGood(c.tasks_created, p?.tasks_created ?? null) },
  { key: "task_creation_pct",    label: "Task rate",  icon: CheckSquare,   iconColor: "text-foreground/70",  getValue: (w) => fmtPct(w.task_creation_pct),      getDir: (c, p) => dirGood(c.task_creation_pct, p?.task_creation_pct ?? null), isDanger: (w) => w.task_creation_pct != null && w.task_creation_pct < 80 },
  { key: "callbacks_defaulted",  label: "No date",    icon: CalendarClock, iconColor: "text-foreground/70", getValue: (w) => String(w.callbacks_defaulted),    getDir: (c, p) => dirBad(c.callbacks_defaulted, p?.callbacks_defaulted ?? null), isDanger: (w) => w.callbacks_defaulted > 0 },
  { key: "callback_slippage_pct",label: "Slippage",   icon: CalendarClock, iconColor: "text-foreground/70", getValue: (w) => fmtPct(w.callback_slippage_pct),  getDir: (c, p) => dirBad(c.callback_slippage_pct, p?.callback_slippage_pct ?? null), isDanger: (w) => w.callback_slippage_pct != null && w.callback_slippage_pct > 40 },
  { key: "ai_reviewed",          label: "AI rev.",    icon: Brain,         iconColor: "text-foreground/70", getValue: (w) => String(w.ai_reviewed),            getDir: (c, p) => dirGood(c.ai_reviewed, p?.ai_reviewed ?? null) },
  { key: "ai_flagged",           label: "Flagged",    icon: Flag,          iconColor: "text-foreground/70",    getValue: (w) => String(w.ai_flagged),             getDir: (c, p) => dirBad(c.ai_flagged, p?.ai_flagged ?? null), isDanger: (w) => w.ai_flagged > 0 },
  { key: "ai_flag_rate_pct",     label: "Flag rate",  icon: Flag,          iconColor: "text-foreground/70",    getValue: (w) => fmtPct(w.ai_flag_rate_pct),       getDir: (c, p) => dirBad(c.ai_flag_rate_pct, p?.ai_flag_rate_pct ?? null), isDanger: (w) => w.ai_flag_rate_pct != null && w.ai_flag_rate_pct > 25 },
];

// ─────────────────────────────────────────────────────────────
// Section wrapper
// ─────────────────────────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  iconColor = "text-muted-foreground/60",
  children,
}: {
  title: string;
  icon: React.ElementType;
  iconColor?: string;
  children: React.ReactNode;
}) {
  return (
    <GlassCard hover={false} className="!p-0 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.05]">
        <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
      </div>
      <div className="p-4">{children}</div>
    </GlassCard>
  );
}

// ─────────────────────────────────────────────────────────────
// Weekly table (inline from /dialer/review)
// ─────────────────────────────────────────────────────────────

function WeeklyTable() {
  const { data, loading, error } = useDialerWeekly(4);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading weekly data…
      </div>
    );
  }

  if (error) {
    return <p className="text-xs text-foreground py-2">{error}</p>;
  }

  if (!data || data.weeks.length === 0) {
    return <p className="text-xs text-muted-foreground/40 py-2">No weekly data yet.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-white/[0.04]">
              <th className="sticky left-0 bg-[#0d0d12] z-10 px-3 py-2 text-left text-sm font-medium text-muted-foreground/50 uppercase tracking-wider whitespace-nowrap min-w-[100px]">
                Week
              </th>
              {WEEK_COLS.map((col) => (
                <th
                  key={col.key}
                  className="px-2 py-2 text-right text-sm font-medium text-muted-foreground/50 uppercase tracking-wider whitespace-nowrap"
                >
                  <div className="flex items-center justify-end gap-1">
                    <col.icon className={`h-2.5 w-2.5 ${col.iconColor}`} />
                    <span>{col.label}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.weeks.map((week, i) => {
              const prev = data.weeks[i + 1] ?? null;
              const isCurrent = i === 0;
              return (
                <tr
                  key={week.week}
                  className={`border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors ${isCurrent ? "bg-white/[0.015]" : ""}`}
                >
                  <td className="sticky left-0 bg-[#0d0d12] z-10 px-3 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      {isCurrent && <span className="h-1.5 w-1.5 rounded-full bg-primary inline-block shrink-0" />}
                      <span className={`font-medium ${isCurrent ? "text-foreground" : "text-muted-foreground/70"}`}>
                        {fmtWeekLabel(week.week, week.week_start)}
                      </span>
                    </div>
                  </td>
                  {WEEK_COLS.map((col) => {
                    const value = col.getValue(week);
                    const dir = col.getDir(week, prev);
                    const danger = col.isDanger?.(week) ?? false;
                    return (
                      <td
                        key={col.key}
                        className={`px-2 py-2 text-right tabular-nums whitespace-nowrap ${
                          danger ? "text-foreground" : value === "—" ? "text-muted-foreground/30" : "text-foreground/80"
                        }`}
                      >
                        <div className="flex items-center justify-end gap-1">
                          {isCurrent && <DirBadge dir={dir} />}
                          <span className={isCurrent && danger ? "font-semibold" : ""}>{value}</span>
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
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground/40 pt-1 border-t border-white/[0.04]">
        <span className="flex items-center gap-1"><TrendingUp className="h-2 w-2 text-foreground" /> better vs prior week</span>
        <span className="flex items-center gap-1"><TrendingDown className="h-2 w-2 text-foreground" /> worse vs prior week</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-primary inline-block" /> current week (partial)</span>
        <Link href="/dialer/review" className="text-primary/60 hover:text-primary ml-auto">Full review →</Link>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default function WarRoomPage() {
  const { data: weeklyData } = useDialerWeekly(1);
  const overdueCount = weeklyData?.overdue_tasks_now ?? 0;
  const [missedInbound, setMissedInbound] = useState<MissedInbound[]>([]);
  const [unclassifiedAnswered, setUnclassifiedAnswered] = useState<UnclassifiedAnswered[]>([]);
  const [missedLoading, setMissedLoading] = useState(false);

  const loadMissed = useCallback(async () => {
    setMissedLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch("/api/dialer/v1/queue", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setMissedInbound(data.missed_inbound ?? []);
        setUnclassifiedAnswered(data.unclassified_answered ?? []);
      }
    } catch { /* non-fatal */ }
    finally { setMissedLoading(false); }
  }, []);

  useEffect(() => { loadMissed(); }, [loadMissed]);

  return (
    <PageShell
      title="Call Review"
      description="Operator command surface — overdue first, top signals, direct action links."
      actions={
        <div className="flex items-center gap-2">
          <Link
            href="/dialer/review"
            className="flex items-center gap-1.5 rounded-[10px] border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:border-white/[0.12] transition-colors"
          >
            <TrendingUp className="h-3 w-3" />
            Weekly Review
          </Link>
          <Link
            href="/dialer"
            className="flex items-center gap-1.5 rounded-[10px] border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:border-white/[0.12] transition-colors"
          >
            <Phone className="h-3 w-3" />
            Dialer
          </Link>
        </div>
      }
    >
      <div className="space-y-4">

        {/* ── Overdue alert banner ───────────────────────────────── */}
        {overdueCount > 0 && (
          <Link href="/tasks">
            <div className="flex items-center gap-2 rounded-[10px] border border-border/30 bg-muted/[0.06] px-3 py-2.5 text-xs text-foreground hover:bg-muted/[0.09] transition-colors">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>
                <strong>{overdueCount}</strong> overdue follow-up task{overdueCount !== 1 ? "s" : ""} — callbacks were missed
              </span>
              <span className="ml-auto flex items-center gap-1 text-foreground/70 text-sm shrink-0">
                View Tasks <ExternalLink className="h-2.5 w-2.5" />
              </span>
            </div>
          </Link>
        )}

        {/* ── Missed inbound banner (highest urgency — surfaces first) ─ */}
        {(missedLoading || missedInbound.length > 0 || unclassifiedAnswered.length > 0) && (
          <Section title="Missed Inbound Calls" icon={PhoneIncoming} iconColor="text-foreground/80">
            <MissedInboundQueue
              items={missedInbound}
              unclassified={unclassifiedAnswered}
              loading={missedLoading}
              onRefresh={loadMissed}
            />
          </Section>
        )}

        {/* ── Two-column layout: brief + signals ────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Daily brief */}
          <Section title="Daily Brief" icon={Crosshair} iconColor="text-primary/70">
            <DailyBrief />
          </Section>

          {/* Missed opportunity queue */}
          <Section title="Missed Opportunities" icon={SearchX} iconColor="text-foreground/70">
            <MissedOpportunityQueue />
          </Section>

        </div>

        {/* ── Call quality snapshot (full width) ────────────────── */}
        <Section title="Call Quality / AI Review Queue" icon={BrainCircuit} iconColor="text-foreground/70">
          <CallQualitySnapshot />
        </Section>

        {/* ── Weekly discipline table (full width) ──────────────── */}
        <Section title="Weekly Discipline" icon={TrendingUp} iconColor="text-primary/70">
          <WeeklyTable />
        </Section>

        {/* ── Action links ──────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2">
          {[
            { href: "/tasks",           label: "Tasks",           icon: CheckSquare },
            { href: "/leads",           label: "Leads",           icon: Phone },
            { href: "/dialer",          label: "Dialer",          icon: Phone },
            { href: "/dialer/inbound",  label: "Inbound",         icon: PhoneIncoming },
            { href: "/dialer/review",   label: "Weekly Review",   icon: TrendingUp },
            { href: "/pipeline",        label: "Pipeline",        icon: ArrowRight },
          ].map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-1.5 rounded-[10px] border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-white/[0.12] transition-colors"
            >
              <Icon className="h-3 w-3" />
              {label}
            </Link>
          ))}
        </div>

      </div>
    </PageShell>
  );
}
