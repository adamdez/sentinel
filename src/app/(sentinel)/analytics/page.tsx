"use client";

import { motion } from "framer-motion";
import {
  Phone, PhoneForwarded, Voicemail, CalendarCheck, FileSignature,
  Skull, Heart, Clock, DollarSign, BarChart3, TrendingUp, TrendingDown,
  Minus, Loader2, Trophy, Zap,
} from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Badge } from "@/components/ui/badge";
import { useAnalytics } from "@/hooks/use-analytics";
import { type TimePeriod, type KPIData, pctChange, formatDuration, TEAM_ROSTER } from "@/lib/analytics";
import { useSentinelStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

// ── KPI card config ────────────────────────────────────────────────────

interface KPIConfig {
  key: keyof KPIData;
  label: string;
  icon: LucideIcon;
  color: string;
  format: (v: number) => string;
}

const KPI_CARDS: KPIConfig[] = [
  { key: "totalDials",     label: "Total Dials",      icon: Phone,          color: "text-cyan",        format: (v) => String(v) },
  { key: "connects",       label: "Connects",         icon: PhoneForwarded, color: "text-blue-400",    format: (v) => String(v) },
  { key: "connectRate",    label: "Connect Rate",     icon: BarChart3,      color: "text-purple-400",  format: (v) => `${v}%` },
  { key: "voicemails",     label: "Voicemails",       icon: Voicemail,      color: "text-sky-400",     format: (v) => String(v) },
  { key: "appointments",   label: "Appointments",     icon: CalendarCheck,  color: "text-emerald-400", format: (v) => String(v) },
  { key: "contracts",      label: "Contracts",        icon: FileSignature,  color: "text-orange-400",  format: (v) => String(v) },
  { key: "deadLeads",      label: "Dead Leads",       icon: Skull,          color: "text-red-400",     format: (v) => String(v) },
  { key: "nurtures",       label: "Nurtures",         icon: Heart,          color: "text-pink-400",    format: (v) => String(v) },
  { key: "avgCallDuration",label: "Avg Duration",     icon: Clock,          color: "text-cyan-400",    format: formatDuration },
  { key: "revenue",        label: "Revenue",          icon: DollarSign,     color: "text-yellow-400",  format: (v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}` },
];

const PERIODS: { key: TimePeriod; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "all", label: "All Time" },
];

// ── Sparkline (pure Framer Motion SVG) ─────────────────────────────────

function Sparkline({ data, color, height = 24, width = 80 }: { data: number[]; color: string; height?: number; width?: number }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={width} height={height} className="opacity-60">
      <motion.polyline
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.8 }}
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Change badge ───────────────────────────────────────────────────────

function ChangeBadge({ current, previous }: { current: number; previous: number }) {
  const change = pctChange(current, previous);
  if (change === null) return <Minus className="h-3 w-3 text-muted-foreground/40" />;

  const positive = change >= 0;
  const Icon = positive ? TrendingUp : TrendingDown;

  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 text-[10px] font-medium",
      positive ? "text-cyan" : "text-red-400"
    )}>
      <Icon className="h-3 w-3" />
      {positive ? "+" : ""}{change}%
    </span>
  );
}

// ── Mini bar chart (SVG) ───────────────────────────────────────────────

function BarChart({ data, height = 180, barColor }: { data: { label: string; value: number; color?: string }[]; height?: number; barColor?: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const barWidth = 40;
  const gap = 24;
  const totalWidth = data.length * (barWidth + gap) - gap;

  return (
    <div className="flex flex-col items-center">
      <svg width={totalWidth + 20} height={height + 30} className="overflow-visible">
        {data.map((d, i) => {
          const barH = (d.value / max) * height;
          const x = i * (barWidth + gap) + 10;
          const y = height - barH;

          return (
            <g key={d.label}>
              <motion.rect
                initial={{ height: 0, y: height }}
                animate={{ height: barH, y }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
                x={x}
                width={barWidth}
                rx={4}
                fill={d.color ?? barColor ?? "#00d4ff"}
                opacity={0.8}
              />
              <text
                x={x + barWidth / 2}
                y={y - 6}
                textAnchor="middle"
                className="text-[10px] fill-foreground font-medium"
              >
                {d.value}
              </text>
              <text
                x={x + barWidth / 2}
                y={height + 16}
                textAnchor="middle"
                className="text-[9px] fill-muted-foreground"
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Line chart (SVG, dual axis) ────────────────────────────────────────

function LineChart({ data }: { data: { date: string; dials: number; connects: number; connectRate: number }[] }) {
  const width = 600;
  const height = 160;
  const padX = 30;
  const padY = 10;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;

  if (data.length < 2) {
    return <p className="text-xs text-muted-foreground text-center py-8">Not enough data yet</p>;
  }

  const maxDials = Math.max(...data.map((d) => d.dials), 1);
  const maxRate = 100;

  function toPath(values: number[], max: number): string {
    return values.map((v, i) => {
      const x = padX + (i / (values.length - 1)) * chartW;
      const y = padY + chartH - (v / max) * chartH;
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    }).join(" ");
  }

  const dialsPath = toPath(data.map((d) => d.dials), maxDials);
  const ratePath = toPath(data.map((d) => d.connectRate), maxRate);

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height + 20}`} preserveAspectRatio="xMidYMid meet">
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
        <line
          key={pct}
          x1={padX} y1={padY + chartH * (1 - pct)}
          x2={padX + chartW} y2={padY + chartH * (1 - pct)}
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={1}
        />
      ))}

      {/* Dials line */}
      <motion.path
        d={dialsPath}
        fill="none"
        stroke="#00d4ff"
        strokeWidth={2}
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1 }}
      />

      {/* Rate line */}
      <motion.path
        d={ratePath}
        fill="none"
        stroke="#0099ff"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray="4,4"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1, delay: 0.2 }}
      />

      {/* X-axis labels (every 5th day) */}
      {data.map((d, i) => {
        if (i % 5 !== 0 && i !== data.length - 1) return null;
        const x = padX + (i / (data.length - 1)) * chartW;
        return (
          <text key={i} x={x} y={height + 14} textAnchor="middle" className="text-[8px] fill-muted-foreground">
            {d.date.slice(5)}
          </text>
        );
      })}

      {/* Legend */}
      <circle cx={padX} cy={height + 14} r={3} fill="#00d4ff" />
      <text x={padX + 8} y={height + 17} className="text-[8px] fill-muted-foreground">Dials</text>
      <circle cx={padX + 50} cy={height + 14} r={3} fill="#0099ff" />
      <text x={padX + 58} y={height + 17} className="text-[8px] fill-muted-foreground">Rate %</text>
    </svg>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { currentUser } = useSentinelStore();
  const analytics = useAnalytics();
  const { period, setPeriod, kpis, prevKpis, agents, dailyDials, funnel, loading } = analytics;

  // Generate sparkline data from dailyDials for each KPI
  const sparklineMap: Partial<Record<keyof KPIData, number[]>> = {
    totalDials: dailyDials.map((d) => d.dials),
    connects: dailyDials.map((d) => d.connects),
    connectRate: dailyDials.map((d) => d.connectRate),
  };

  return (
    <PageShell
      title="Analytics"
      description="Dialer KPIs, team performance, and conversion intelligence"
      actions={
        <Badge variant="neon" className="text-[10px] gap-1">
          <Zap className="h-2.5 w-2.5" />
          Live — {currentUser.role === "admin" ? "Team View" : "My Stats"}
        </Badge>
      }
    >
      {/* ── Period Tabs ──────────────────────────────────────────── */}
      <div className="flex items-center gap-1 p-1 rounded-[14px] bg-secondary/20 border border-glass-border w-fit">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={cn(
              "px-4 py-1.5 rounded-[12px] text-xs font-medium transition-all duration-200",
              period === p.key
                ? "bg-cyan/10 text-cyan border border-cyan/20 shadow-[0_0_10px_rgba(0,212,255,0.1)]"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/30"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* ── 10 KPI Cards (5x2) ───────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mt-4">
        {KPI_CARDS.map((card, idx) => {
          const current = kpis?.[card.key] ?? 0;
          const prev = prevKpis?.[card.key] ?? 0;
          const Icon = card.icon;
          const sparkData = sparklineMap[card.key];

          return (
            <GlassCard key={card.key} hover={false} delay={idx * 0.03} className="!p-3">
              <div className="flex items-start justify-between mb-1">
                <Icon className={`h-4 w-4 ${card.color}`} />
                {!loading && <ChangeBadge current={current} previous={prev} />}
              </div>
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto my-2" />
              ) : (
                <>
                  <p className="text-xl font-bold tracking-tight mt-1">{card.format(current)}</p>
                  {sparkData && sparkData.length > 1 && (
                    <div className="mt-1.5">
                      <Sparkline
                        data={sparkData}
                        color={card.color.includes("neon") || card.color.includes("cyan") ? "#00d4ff" : card.color.includes("blue") ? "#0099ff" : "#a855f7"}
                      />
                    </div>
                  )}
                </>
              )}
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">{card.label}</p>
            </GlassCard>
          );
        })}
      </div>

      {/* ── Charts Row ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        {/* Daily Dials & Connect Rate (2/3 width) */}
        <GlassCard hover={false} className="lg:col-span-2 !p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5 text-cyan" />
            Daily Dials & Connect Rate — Last 30 Days
          </h3>
          {loading ? (
            <div className="h-40 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <LineChart data={dailyDials} />
          )}
        </GlassCard>

        {/* Conversion Funnel (1/3 width) */}
        <GlassCard hover={false} className="!p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-cyan" />
            Conversion Funnel
          </h3>
          {loading ? (
            <div className="h-40 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <BarChart data={funnel} height={140} />
          )}
        </GlassCard>
      </div>

      {/* ── Agent Leaderboard ────────────────────────────────────── */}
      {currentUser.role === "admin" && (
        <GlassCard hover={false} className="mt-4 !p-0 overflow-hidden">
          <div className="p-4 border-b border-glass-border flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Trophy className="h-3.5 w-3.5 text-yellow-400" />
              Agent Leaderboard — {PERIODS.find((p) => p.key === period)?.label}
            </h3>
            <Badge variant="outline" className="text-[10px]">{agents.length} agents</Badge>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-glass-border">
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">#</th>
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Agent</th>
                  {KPI_CARDS.map((c) => (
                    <th key={c.key} className="text-right px-3 py-2.5 text-muted-foreground font-medium whitespace-nowrap">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={12} className="text-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                    </td>
                  </tr>
                ) : (
                  <>
                    {[...agents]
                      .sort((a, b) => b.kpis.totalDials - a.kpis.totalDials)
                      .map((agent, idx) => (
                        <motion.tr
                          key={agent.name}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className="border-b border-glass-border/50 hover:bg-secondary/10 transition-colors"
                        >
                          <td className="px-4 py-2.5">
                            {idx === 0 ? (
                              <span className="text-yellow-400 font-bold">1st</span>
                            ) : idx === 1 ? (
                              <span className="text-zinc-300 font-bold">2nd</span>
                            ) : (
                              <span className="text-orange-600 font-bold">3rd</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <div
                                className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold text-black"
                                style={{ backgroundColor: agent.color }}
                              >
                                {agent.name.charAt(0)}
                              </div>
                              <span className="font-medium">{agent.name}</span>
                            </div>
                          </td>
                          {KPI_CARDS.map((c) => (
                            <td key={c.key} className="text-right px-3 py-2.5 font-mono">
                              {c.format(agent.kpis[c.key])}
                            </td>
                          ))}
                        </motion.tr>
                      ))}

                    {/* Team total row */}
                    {agents.length > 0 && (
                      <tr className="bg-cyan/5 border-t-2 border-cyan/20 font-semibold">
                        <td className="px-4 py-2.5" />
                        <td className="px-4 py-2.5 text-neon">TEAM TOTAL</td>
                        {KPI_CARDS.map((c) => {
                          const total = agents.reduce((s, a) => s + a.kpis[c.key], 0);
                          const display = c.key === "connectRate"
                            ? `${agents.length > 0 ? Math.round(total / agents.length) : 0}%`
                            : c.key === "avgCallDuration"
                              ? formatDuration(agents.length > 0 ? Math.round(total / agents.length) : 0)
                              : c.format(total);
                          return (
                            <td key={c.key} className="text-right px-3 py-2.5 font-mono text-neon">
                              {display}
                            </td>
                          );
                        })}
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}
    </PageShell>
  );
}
