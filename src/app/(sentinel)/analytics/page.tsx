"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import {
  AlertCircle, AlertTriangle, BarChart3, Clock3, DollarSign,
  Loader2, MapPinned, RotateCcw, Shield, TrendingUp, TrendingDown,
  Users, Zap, ArrowRight, ChevronDown,
} from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Badge } from "@/components/ui/badge";
import { useAnalytics } from "@/hooks/use-analytics";
import { formatCurrency, formatMinutes, formatPercent, type TimePeriod } from "@/lib/analytics";
import type { MarketScoreRow, SourceOutcomeRow, PipelineHealthRow } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

const PERIODS: { key: TimePeriod; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "all", label: "All Time" },
];

// ── Main Page ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { period, setPeriod, data, loading, error, refetch } = useAnalytics();

  const [timedOut, setTimedOut] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (loading) {
      setTimedOut(false);
      timeoutRef.current = setTimeout(() => setTimedOut(true), 10000);
    } else {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [loading]);

  const showError = error || (timedOut && loading);

  const marketScoreboard = data?.marketScoreboard ?? [];
  const sourceOutcomes = data?.sourceOutcomes ?? [];
  const pipelineHealth = data?.pipelineHealth ?? [];
  const speed = data?.speedToLead;
  const revenue = data?.revenue;
  const founderEfficiency = data?.founderEfficiency;

  const spokane = marketScoreboard.find((r) => r.market === "spokane");
  const kootenai = marketScoreboard.find((r) => r.market === "kootenai");

  const totalNewLeads = marketScoreboard.reduce((s, r) => s + r.newLeads, 0);
  const totalActive = marketScoreboard.reduce((s, r) => s + r.activePipeline, 0);
  const totalOverdue = marketScoreboard.reduce((s, r) => s + r.overdueFollowUps, 0);
  const totalAwaiting = marketScoreboard.reduce((s, r) => s + r.awaitingFirstContact, 0);
  const closedDeals = revenue?.closedDeals ?? 0;
  const totalRevenue = revenue?.assignmentRevenue ?? 0;
  const jeffInfluencedClosedDeals = revenue?.jeffInfluencedClosedDeals ?? 0;
  const jeffInfluencedRevenue = revenue?.jeffInfluencedRevenue ?? 0;
  const jeffInfluenceRate = revenue?.jeffInfluenceRatePct ?? null;
  const contractsPerFounderHour = founderEfficiency?.contractsPerFounderHourEstimated ?? null;
  const founderHoursEstimated = founderEfficiency?.founderHoursEstimated ?? 0;
  const founderCallCount = founderEfficiency?.founderCallCount ?? 0;

  const sortedSources = useMemo(() =>
    [...sourceOutcomes].sort((a, b) => {
      if (b.assignmentRevenue !== a.assignmentRevenue) return b.assignmentRevenue - a.assignmentRevenue;
      if (b.closedDeals !== a.closedDeals) return b.closedDeals - a.closedDeals;
      return b.leads - a.leads;
    }),
  [sourceOutcomes]);

  const topSource = sortedSources.length > 0 ? sortedSources[0] : null;

  const watchOuts = useMemo(() => {
    const items: Array<{ text: string; severity: "warn" | "info"; href?: string }> = [];
    if (totalOverdue > 0) items.push({ text: `${totalOverdue} overdue follow-up${totalOverdue !== 1 ? "s" : ""} need attention`, severity: "warn", href: "/tasks" });
    if (totalAwaiting > 3) items.push({ text: `${totalAwaiting} leads still awaiting first contact`, severity: "warn", href: "/leads?filter=new_inbound" });
    if (speed && speed.slowOrMissingCount > 2) items.push({ text: `${speed.slowOrMissingCount} leads with slow or missing first response`, severity: "warn" });
    if (contractsPerFounderHour != null && founderHoursEstimated >= 10 && contractsPerFounderHour < 0.05) {
      items.push({ text: `Leverage is low at ${contractsPerFounderHour} contracts/founder-hour`, severity: "warn", href: "/settings/jeff-outbound" });
    }
    if (closedDeals > 0 && jeffInfluencedClosedDeals === 0) {
      items.push({ text: "Closed deals have no Jeff-attributed influence in this window", severity: "info", href: "/settings/jeff-outbound" });
    }

    const spokanePipeline = pipelineHealth.find((r) => r.market === "spokane");
    const kootenaiPipeline = pipelineHealth.find((r) => r.market === "kootenai");
    if (spokanePipeline && kootenaiPipeline) {
      const sDead = spokanePipeline.dead;
      const kDead = kootenaiPipeline.dead;
      const sTotal = spokanePipeline.active + sDead + spokanePipeline.closed;
      const kTotal = kootenaiPipeline.active + kDead + kootenaiPipeline.closed;
      const sDeadPct = sTotal > 0 ? (sDead / sTotal) * 100 : 0;
      const kDeadPct = kTotal > 0 ? (kDead / kTotal) * 100 : 0;
      if (sDeadPct > 40 && sTotal > 5) items.push({ text: `Spokane dead rate ${sDeadPct.toFixed(0)}% — review source quality`, severity: "warn" });
      if (kDeadPct > 40 && kTotal > 5) items.push({ text: `Kootenai dead rate ${kDeadPct.toFixed(0)}% — review source quality`, severity: "warn" });
    }

    const unknownSourceLeads = sourceOutcomes.find((r) => r.sourceKey === "unknown")?.leads ?? 0;
    if (unknownSourceLeads > 3) items.push({ text: `${unknownSourceLeads} leads have no source attribution`, severity: "info" });

    return items;
  }, [totalOverdue, totalAwaiting, speed, pipelineHealth, sourceOutcomes, contractsPerFounderHour, founderHoursEstimated, closedDeals, jeffInfluencedClosedDeals]);

  return (
    <PageShell
      title="Analytics"
      description="Source performance, market split, funnel discipline — Spokane & Kootenai."
    >
      <div className="space-y-4">
        {/* ── Period selector ──────────────────────────────────── */}
        <div className="flex items-center gap-1 p-1 rounded-[14px] bg-secondary/20 border border-glass-border w-fit">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={cn(
                "px-4 py-1.5 rounded-[12px] text-xs font-medium transition-all duration-200",
                period === p.key
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/30"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* ── Loading / Error ──────────────────────────────────── */}
        {showError ? (
          <GlassCard hover={false} className="!p-8">
            <div className="flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              <AlertCircle className="h-5 w-5 text-foreground/70" />
              <p>{error || "Analytics took too long to load."}</p>
              <button
                onClick={() => { setTimedOut(false); refetch(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-medium bg-primary/15 text-primary border border-primary/20 hover:bg-primary/25 transition-all"
              >
                <RotateCcw className="h-3 w-3" /> Retry
              </button>
            </div>
          </GlassCard>
        ) : loading ? (
          <GlassCard hover={false} className="!p-8">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </div>
          </GlassCard>
        ) : (
          <>
            {/* ── Executive Summary ─────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
              <SummaryCard label="New Leads" value={String(totalNewLeads)} icon={Users} />
              <SummaryCard label="Active Pipeline" value={String(totalActive)} icon={Zap} />
              <SummaryCard label="Contracts" value={String(closedDeals)} icon={BarChart3} />
              <SummaryCard
                label="Contracts / Founder Hr"
                value={contractsPerFounderHour != null ? String(contractsPerFounderHour) : "n/a"}
                icon={TrendingUp}
                sub={`${founderHoursEstimated}h est`}
                tone={contractsPerFounderHour != null && contractsPerFounderHour > 0 ? "positive" : "default"}
              />
              <SummaryCard label="Revenue" value={formatCurrency(totalRevenue)} icon={DollarSign} tone={totalRevenue > 0 ? "positive" : "default"} />
              <SummaryCard
                label="Speed to Lead"
                value={speed?.medianMinutes != null ? `${speed.medianMinutes}m` : "n/a"}
                icon={Clock3}
                sub="median"
              />
              <SummaryCard
                label="Overdue"
                value={String(totalOverdue)}
                icon={AlertTriangle}
                sub={`${founderCallCount} founder calls`}
                tone={totalOverdue > 0 ? "danger" : "positive"}
              />
            </div>

            {/* Best source callout */}
            {topSource && topSource.leads > 0 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                <TrendingUp className="h-3 w-3 text-primary shrink-0" />
                <span>
                  Top source: <span className="text-foreground font-medium">{topSource.sourceLabel}</span>
                  {" — "}{topSource.leads} lead{topSource.leads !== 1 ? "s" : ""}
                  {topSource.closedDeals > 0 && <>, {topSource.closedDeals} closed, {formatCurrency(topSource.assignmentRevenue)}</>}
                </span>
              </div>
            )}

            {/* ── Watch-outs ───────────────────────────────────── */}
            {watchOuts.length > 0 && (
              <GlassCard hover={false} className="!py-3 !px-4 border-amber-500/15">
                <p className="text-xs font-bold uppercase tracking-wider text-amber-400/70 mb-1.5 flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3" /> Needs Attention
                </p>
                <div className="space-y-1">
                  {watchOuts.map((w, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", w.severity === "warn" ? "bg-amber-400" : "bg-muted-foreground/30")} />
                      <span className="text-muted-foreground flex-1">{w.text}</span>
                      {w.href && (
                        <Link href={w.href} className="text-primary/60 hover:text-primary transition-colors shrink-0">
                          View <ArrowRight className="h-2.5 w-2.5 inline" />
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}

            {/* ── Market Split: Spokane vs Kootenai ────────────── */}
            <GlassCard hover={false} className="!p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <MapPinned className="h-4 w-4 text-primary" />
                  Market Split
                </h3>
                <TrustBadge type="hard" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[spokane, kootenai].filter(Boolean).map((m) => (
                  <MarketCard key={m!.market} row={m!} />
                ))}
              </div>

              {/* Comparison callout */}
              {spokane && kootenai && (
                <div className="mt-3 pt-3 border-t border-overlay-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                  <MarketCompare label="New leads" a={spokane.newLeads} b={kootenai.newLeads} />
                  <MarketCompare label="Active" a={spokane.activePipeline} b={kootenai.activePipeline} />
                  <MarketCompare label="Overdue" a={spokane.overdueFollowUps} b={kootenai.overdueFollowUps} inverse />
                  <MarketCompare label="Closed" a={spokane.closedDeals} b={kootenai.closedDeals} />
                  <MarketCompare label="Revenue" a={spokane.assignmentRevenue} b={kootenai.assignmentRevenue} />
                </div>
              )}
            </GlassCard>

            {/* ── Source Performance ───────────────────────────── */}
            <GlassCard hover={false} className="!p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Source Performance
                </h3>
                <div className="flex items-center gap-1.5">
                  <TrustBadge type="hard" />
                  <TrustBadge type="estimated" />
                </div>
              </div>

              {sortedSources.length === 0 ? (
                <p className="text-xs text-muted-foreground">No source attribution data in this period.</p>
              ) : (
                <SourceTable sources={sortedSources} />
              )}
            </GlassCard>

            {/* ── Funnel & Discipline ─────────────────────────── */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {/* Speed to Lead */}
              <GlassCard hover={false} className="!p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Clock3 className="h-4 w-4 text-primary" />
                    Speed to Lead
                  </h3>
                  <TrustBadge type="estimated" />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                  <MiniMetric label="Median" value={formatMinutes(speed?.medianMinutes ?? null)} />
                  <MiniMetric label="Within 15 min" value={formatPercent(speed?.within15mRatePct ?? null)} />
                  <MiniMetric label="Slow / missing" value={String(speed?.slowOrMissingCount ?? 0)} tone={(speed?.slowOrMissingCount ?? 0) > 0 ? "warn" : "default"} />
                  <MiniMetric label="Coverage" value={`${speed?.sampleCount ?? 0} samples (${speed?.coveragePct ?? 0}%)`} />
                </div>

                {(speed?.byMarket ?? []).length > 0 && (
                  <div className="border-t border-overlay-4 pt-2 space-y-1">
                    {(speed?.byMarket ?? []).map((row) => (
                      <div key={row.market} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground font-medium">{row.label}</span>
                        <span className="tabular-nums text-foreground/70">
                          {formatMinutes(row.medianMinutes)} median · {formatPercent(row.within15mRatePct)} within 15m
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-[11px] text-muted-foreground/40 mt-2">
                  From first logged call. Falls back to last_contact_at when call data is missing.
                </p>
              </GlassCard>

              {/* Revenue */}
              <GlassCard hover={false} className="!p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-primary" />
                    Revenue
                  </h3>
                  <TrustBadge type="hard" />
                </div>

                <div className="grid grid-cols-3 gap-2 mb-3">
                  <MiniMetric label="Closed" value={String(closedDeals)} />
                  <MiniMetric label="Total" value={formatCurrency(totalRevenue)} tone={totalRevenue > 0 ? "positive" : "default"} />
                  <MiniMetric label="Avg fee" value={closedDeals > 0 ? formatCurrency(revenue?.avgAssignmentFee ?? 0) : "n/a"} />
                </div>

                {(revenue?.byMarket ?? []).length > 0 && (
                  <div className="border-t border-overlay-4 pt-2 space-y-1">
                    {(revenue?.byMarket ?? []).map((row) => (
                      <div key={row.market} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground font-medium">{row.label}</span>
                        <span className="tabular-nums text-foreground/70">
                          {row.closedDeals} deal{row.closedDeals !== 1 ? "s" : ""} · {formatCurrency(row.assignmentRevenue)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {closedDeals > 0 && (
                  <div className="mt-2 border-t border-overlay-4 pt-2 text-xs text-muted-foreground">
                    Jeff influenced <span className="tabular-nums text-foreground/80">{jeffInfluencedClosedDeals}/{closedDeals}</span>
                    {" closed"} ({formatPercent(jeffInfluenceRate)}) • {formatCurrency(jeffInfluencedRevenue)}
                  </div>
                )}
              </GlassCard>
            </div>

            {/* ── Pipeline by Stage ───────────────────────────── */}
            <GlassCard hover={false} className="!p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Pipeline by Stage
                </h3>
                <TrustBadge type="hard" />
              </div>

              <PipelineTable rows={pipelineHealth} />
            </GlassCard>

            {/* ── Dispo Funnel ─────────────────────────────────── */}
            <DispoFunnelCard />

            {/* ── Data Trust Notes (demoted) ───────────────────── */}
            <DataTrustNotes speed={speed} revenue={revenue} marketScoreboard={marketScoreboard} sourceOutcomes={sourceOutcomes} />
          </>
        )}
      </div>
    </PageShell>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function SummaryCard({ label, value, icon: Icon, tone = "default", sub }: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "positive" | "danger";
  sub?: string;
}) {
  return (
    <div className={cn(
      "rounded-[12px] border px-3 py-2.5 bg-glass/40",
      tone === "default" && "border-glass-border",
      tone === "positive" && "border-emerald-500/25 bg-emerald-500/[0.04]",
      tone === "danger" && "border-red-500/30 bg-red-500/[0.06]",
    )}>
      <div className="flex items-center gap-1.5 mb-0.5">
        <Icon className="h-3 w-3 text-primary shrink-0" />
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground truncate">{label}</span>
      </div>
      <p className="text-sm font-bold tabular-nums leading-tight">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground/40">{sub}</p>}
    </div>
  );
}

function MarketCard({ row }: { row: MarketScoreRow }) {
  return (
    <div className="rounded-[12px] border border-glass-border bg-glass/30 p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold">{row.label}</p>
        <span className="text-xs text-muted-foreground tabular-nums">{row.totalLeads} total</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <MarketStat label="New" value={row.newLeads} />
        <MarketStat label="Active" value={row.activePipeline} />
        <MarketStat label="Contacted" value={formatPercent(row.contactedRatePct)} sub="est" />
        <MarketStat label="Speed" value={formatMinutes(row.medianSpeedToLeadMinutes)} sub="est" />
        <MarketStat label="Overdue" value={row.overdueFollowUps} tone={row.overdueFollowUps > 0 ? "warn" : "default"} />
        <MarketStat label="No Contact" value={row.awaitingFirstContact} tone={row.awaitingFirstContact > 0 ? "warn" : "default"} />
        <MarketStat label="Closed" value={row.closedDeals} />
        <MarketStat label="Revenue" value={formatCurrency(row.assignmentRevenue)} tone={row.assignmentRevenue > 0 ? "positive" : "default"} />
      </div>
    </div>
  );
}

function MarketStat({ label, value, tone = "default", sub }: {
  label: string;
  value: string | number;
  tone?: "default" | "warn" | "positive";
  sub?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-1">
      <span className="text-muted-foreground">{label}{sub && <span className="text-muted-foreground/30 ml-0.5 text-[10px]">({sub})</span>}</span>
      <span className={cn(
        "font-medium tabular-nums",
        tone === "warn" && "text-amber-400",
        tone === "positive" && "text-emerald-400",
        tone === "default" && "text-foreground/80",
      )}>{value}</span>
    </div>
  );
}

function MarketCompare({ label, a, b, inverse }: { label: string; a: number; b: number; inverse?: boolean }) {
  const sWins = inverse ? a < b : a > b;
  const kWins = inverse ? b < a : b > a;
  const tied = a === b;
  return (
    <span className="flex items-center gap-1">
      <span className="text-muted-foreground/50">{label}:</span>
      <span className={cn("font-medium tabular-nums", sWins && "text-primary/80", !sWins && !tied && "text-muted-foreground/60")}>{a}</span>
      <span className="text-muted-foreground/30">vs</span>
      <span className={cn("font-medium tabular-nums", kWins && "text-primary/80", !kWins && !tied && "text-muted-foreground/60")}>{b}</span>
    </span>
  );
}

function SourceTable({ sources }: { sources: SourceOutcomeRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-overlay-6 text-muted-foreground/50">
            <th className="text-left py-1.5 pr-3 font-medium">#</th>
            <th className="text-left py-1.5 pr-3 font-medium">Source</th>
            <th className="text-right py-1.5 px-2 font-medium">Leads</th>
            <th className="text-right py-1.5 px-2 font-medium">S / K</th>
            <th className="text-right py-1.5 px-2 font-medium">Contacted</th>
            <th className="text-right py-1.5 px-2 font-medium">Closed</th>
            <th className="text-right py-1.5 px-2 font-medium">Revenue</th>
            <th className="text-right py-1.5 pl-2 font-medium">Speed</th>
          </tr>
        </thead>
        <tbody>
          {sources.slice(0, 12).map((row, i) => {
            const isTopPerformer = i === 0 && row.assignmentRevenue > 0;
            const isWaste = row.leads >= 5 && row.closedDeals === 0 && row.contactedRatePct != null && row.contactedRatePct < 30;
            return (
              <tr key={row.sourceKey} className={cn(
                "border-b border-overlay-3",
                isTopPerformer && "bg-emerald-500/[0.03]",
                isWaste && "bg-amber-500/[0.02]",
              )}>
                <td className="py-1.5 pr-3 text-muted-foreground/30 tabular-nums">{i + 1}</td>
                <td className="py-1.5 pr-3 font-medium">
                  {row.sourceKey === "unknown" ? "Unknown" : row.sourceLabel}
                  {isWaste && <span className="ml-1.5 text-[10px] text-amber-400/60">low conversion</span>}
                </td>
                <td className="py-1.5 px-2 text-right tabular-nums">{row.leads}</td>
                <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground/60">{row.spokaneLeads}/{row.kootenaiLeads}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{formatPercent(row.contactedRatePct)}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{row.closedDeals}</td>
                <td className={cn("py-1.5 px-2 text-right tabular-nums", row.assignmentRevenue > 0 && "text-emerald-400/80")}>{formatCurrency(row.assignmentRevenue)}</td>
                <td className="py-1.5 pl-2 text-right tabular-nums text-muted-foreground/60">{formatMinutes(row.medianSpeedToLeadMinutes)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PipelineTable({ rows }: { rows: PipelineHealthRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-overlay-6 text-muted-foreground/50">
            <th className="text-left py-1.5 pr-3 font-medium">Market</th>
            <th className="text-right py-1.5 px-2 font-medium">Active</th>
            <th className="text-right py-1.5 px-2 font-medium">New</th>
            <th className="text-right py-1.5 px-2 font-medium">Lead</th>
            <th className="text-right py-1.5 px-2 font-medium">Negotiation</th>
            <th className="text-right py-1.5 px-2 font-medium">Disposition</th>
            <th className="text-right py-1.5 px-2 font-medium">Nurture</th>
            <th className="text-right py-1.5 px-2 font-medium">Closed</th>
            <th className="text-right py-1.5 pl-2 font-medium">Dead</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.market} className="border-b border-overlay-3">
              <td className="py-1.5 pr-3 font-medium">{row.label}</td>
              <td className="py-1.5 px-2 text-right tabular-nums font-medium">{row.active}</td>
              <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground/60">{row.prospect}</td>
              <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground/60">{row.lead}</td>
              <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground/60">{row.negotiation}</td>
              <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground/60">{row.disposition}</td>
              <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground/60">{row.nurture}</td>
              <td className="py-1.5 px-2 text-right tabular-nums">{row.closed}</td>
              <td className="py-1.5 pl-2 text-right tabular-nums text-muted-foreground/40">{row.dead}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MiniMetric({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warn" | "positive" }) {
  return (
    <div className={cn(
      "rounded-[8px] border px-2.5 py-1.5",
      tone === "default" && "border-glass-border bg-glass/30",
      tone === "warn" && "border-amber-500/20 bg-amber-500/[0.04]",
      tone === "positive" && "border-emerald-500/20 bg-emerald-500/[0.04]",
    )}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50">{label}</p>
      <p className="text-xs font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function TrustBadge({ type }: { type: "hard" | "estimated" | "informational" }) {
  const labels = { hard: "Hard truth", estimated: "Estimated", informational: "Informational" };
  return <Badge variant="outline" className="text-[10px]">{labels[type]}</Badge>;
}

// ── Dispo Funnel ─────────────────────────────────────────────────────────────

function DispoFunnelCard() {
  const [funnel, setFunnel] = useState<{
    deals: number; linked: number; contacted: number;
    responded: number; interested: number; selected: number;
    stalledCount: number; avgDaysInDispo: number | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDispo = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/dispo", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const { deals } = await res.json();
      if (!deals) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allBuyers = deals.flatMap((d: any) => d.deal_buyers ?? []);
      const respondedStatuses = new Set(["interested", "offered", "follow_up", "selected"]);

      const now = Date.now();
      const DAY = 86400000;
      let stalledCount = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const deal of deals as any[]) {
        const dbs = deal.deal_buyers ?? [];
        if (dbs.length === 0) {
          const enteredAt = deal.entered_dispo_at ? new Date(deal.entered_dispo_at).getTime() : null;
          if (enteredAt && now - enteredAt > DAY) stalledCount++;
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const allPre = dbs.every((db: any) => db.status === "not_contacted" || db.status === "queued");
          if (allPre) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const oldest = Math.min(...dbs.map((db: any) => new Date(db.created_at).getTime()));
            if (now - oldest > DAY) stalledCount++;
          }
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dispoAges = (deals as any[])
        .map((d) => d.entered_dispo_at ? Math.max(0, Math.floor((now - new Date(d.entered_dispo_at).getTime()) / DAY)) : null)
        .filter((d): d is number => d != null);
      const avgDaysInDispo = dispoAges.length > 0
        ? Math.round(dispoAges.reduce((a: number, b: number) => a + b, 0) / dispoAges.length)
        : null;

      setFunnel({
        deals: deals.length,
        linked: allBuyers.length,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        contacted: allBuyers.filter((b: any) => b.status !== "not_contacted" && b.status !== "queued").length,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        responded: allBuyers.filter((b: any) => respondedStatuses.has(b.status) || (b.status === "passed" && b.responded_at)).length,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        interested: allBuyers.filter((b: any) => ["interested", "offered", "selected"].includes(b.status)).length,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        selected: allBuyers.filter((b: any) => b.status === "selected").length,
        stalledCount,
        avgDaysInDispo,
      });
    } catch (err) {
      console.error("[DispoFunnel] fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDispo(); }, [fetchDispo]);

  if (loading || !funnel || funnel.deals === 0) return null;

  const steps = [
    { label: "Deals", value: funnel.deals },
    { label: "Linked", value: funnel.linked },
    { label: "Contacted", value: funnel.contacted },
    { label: "Responded", value: funnel.responded },
    { label: "Interested", value: funnel.interested },
    { label: "Selected", value: funnel.selected },
  ];

  return (
    <GlassCard hover={false} className="!p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Dispo Outreach Funnel
        </h3>
        <TrustBadge type="hard" />
      </div>
      <div className="grid grid-cols-6 gap-2 text-xs">
        {steps.map((s, i) => {
          const prevVal = i > 0 ? steps[i - 1].value : null;
          const dropoff = prevVal != null && prevVal > 0 && s.value < prevVal;
          return (
            <div key={s.label} className={cn(
              "rounded-[8px] border px-2 py-1.5 text-center",
              dropoff ? "border-amber-500/15 bg-amber-500/[0.03]" : "border-glass-border bg-glass/30",
            )}>
              <p className="text-sm font-bold tabular-nums">{s.value}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
        {funnel.avgDaysInDispo != null && (
          <span>Avg <span className="text-foreground/80 font-medium">{funnel.avgDaysInDispo === 0 ? "< 1" : funnel.avgDaysInDispo}d</span> in dispo</span>
        )}
        {funnel.stalledCount > 0 && (
          <span className="text-amber-400/70 font-medium">{funnel.stalledCount} stalled</span>
        )}
        <Link href="/dispo" className="text-primary/50 hover:text-primary ml-auto transition-colors text-[11px]">
          Open Dispo <ArrowRight className="h-2.5 w-2.5 inline" />
        </Link>
      </div>
    </GlassCard>
  );
}

// ── Data Trust Notes (demoted to bottom) ─────────────────────────────────────

function DataTrustNotes({ speed, revenue, marketScoreboard, sourceOutcomes }: {
  speed: { sampleCount: number; estimatedSampleCount: number; coveragePct: number } | undefined;
  revenue: { closedDeals: number; undatedClosedDealsExcluded: number } | undefined;
  marketScoreboard: MarketScoreRow[];
  sourceOutcomes: SourceOutcomeRow[];
}) {
  const [expanded, setExpanded] = useState(false);

  const notes: string[] = [];
  const unknownCountyLeads = marketScoreboard.find((r) => r.market === "other")?.totalLeads ?? 0;
  const unknownSourceLeads = sourceOutcomes.find((r) => r.sourceKey === "unknown")?.leads ?? 0;
  const awaitingFirstContact = marketScoreboard.reduce((s, r) => s + r.awaitingFirstContact, 0);
  const speedSamples = speed?.sampleCount ?? 0;
  const estimatedSpeedSamples = speed?.estimatedSampleCount ?? 0;
  const closedDeals = revenue?.closedDeals ?? 0;
  const undatedExcluded = revenue?.undatedClosedDealsExcluded ?? 0;

  if (unknownCountyLeads > 0) notes.push(`${unknownCountyLeads} lead(s) grouped under Unknown/Other county.`);
  if (unknownSourceLeads > 0) notes.push(`${unknownSourceLeads} lead(s) grouped under Unknown source.`);
  if (awaitingFirstContact > 0) notes.push(`${awaitingFirstContact} lead(s) have no logged first contact.`);
  if (speedSamples === 0) notes.push("No speed-to-lead samples available for this period.");
  else if (estimatedSpeedSamples > 0) notes.push(`${estimatedSpeedSamples} of ${speedSamples} speed samples use last_contact_at fallback.`);
  if (closedDeals === 0) notes.push("No closed deals recorded in this period.");
  if (undatedExcluded > 0) notes.push(`${undatedExcluded} closed deal(s) excluded (missing closed_at).`);

  if (notes.length === 0) return null;

  return (
    <div className="border-t border-overlay-4 pt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground/30 hover:text-muted-foreground transition-colors w-full"
      >
        <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
        Data trust notes ({notes.length})
        <div className="flex items-center gap-1 ml-2">
          <TrustBadge type="hard" />
          <TrustBadge type="estimated" />
          <TrustBadge type="informational" />
        </div>
      </button>
      {expanded && (
        <ul className="space-y-1 text-xs text-muted-foreground mt-2 pl-4 list-disc">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
