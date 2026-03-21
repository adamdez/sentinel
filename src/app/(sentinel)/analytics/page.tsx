"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AlertCircle, BarChart3, Clock3, DollarSign, Loader2, MapPinned, Radio, RotateCcw, Shield, TrendingUp, Users } from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Badge } from "@/components/ui/badge";
import { useAnalytics } from "@/hooks/use-analytics";
import { KpiSummaryRow } from "@/components/sentinel/kpi-summary-row";
import { formatCurrency, formatMinutes, formatPercent, type TimePeriod } from "@/lib/analytics";
import { useSentinelStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

const PERIODS: { key: TimePeriod; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "all", label: "All Time" },
];

export default function AnalyticsPage() {
  const { currentUser } = useSentinelStore();
  const { period, setPeriod, data, conversionSnapshot, loading, error, refetch } = useAnalytics();

  // Timeout: if still loading after 10 seconds, show error
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

  const unknownCountyLeads = marketScoreboard.find((row) => row.market === "other")?.totalLeads ?? 0;
  const unknownSourceLeads = sourceOutcomes.find((row) => row.sourceKey === "unknown")?.leads ?? 0;
  const awaitingFirstContact = marketScoreboard.reduce((sum, row) => sum + row.awaitingFirstContact, 0);

  const speedSamples = speed?.sampleCount ?? 0;
  const estimatedSpeedSamples = speed?.estimatedSampleCount ?? 0;
  const snapshotCount = conversionSnapshot?.snapshotCount ?? 0;
  const closedDeals = revenue?.closedDeals ?? 0;
  const undatedClosedDealsExcluded = revenue?.undatedClosedDealsExcluded ?? 0;

  const dataNotes: string[] = [];
  if (unknownCountyLeads > 0) {
    dataNotes.push(`${unknownCountyLeads} lead(s) are grouped under Unknown/Other county because county is missing or outside Spokane/Kootenai.`);
  }
  if (unknownSourceLeads > 0) {
    dataNotes.push(`${unknownSourceLeads} lead(s) are grouped under Uncategorized / Unknown source.`);
  }
  if (awaitingFirstContact > 0) {
    dataNotes.push(`${awaitingFirstContact} lead(s) still have no logged first contact attempt.`);
  }
  if (speedSamples === 0) {
    dataNotes.push("No first response samples are available for this period yet.");
  } else if (estimatedSpeedSamples > 0) {
    dataNotes.push(`${estimatedSpeedSamples} of ${speedSamples} speed-to-lead sample(s) use last_contact_at fallback (estimated).`);
  }
  if (snapshotCount === 0) {
    dataNotes.push("Conversion snapshots are not available yet; snapshot context is incomplete for this period.");
  }
  if (closedDeals === 0) {
    dataNotes.push("No closed deals are recorded in this period.");
  }
  if (undatedClosedDealsExcluded > 0) {
    dataNotes.push(`${undatedClosedDealsExcluded} closed deal(s) were excluded because closed_at is missing.`);
  }

  return (
    <PageShell
      title="Analytics"
      description="Business outcomes for Spokane and Kootenai. Hard-truth, estimated, and informational metrics are explicitly labeled."
      actions={
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-sm gap-1">
            <Radio className="h-2.5 w-2.5 text-foreground animate-pulse" />
            Live
          </Badge>
          <Badge variant="outline" className="text-sm gap-1">
            <Shield className="h-2.5 w-2.5" />
            {currentUser.role === "admin" ? "Team-wide view" : "Portfolio-scoped view"}
          </Badge>
        </div>
      }
    >
      <div className="space-y-4">
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

        <KpiSummaryRow period={period} />

        {showError ? (
          <GlassCard hover={false} className="!p-8">
            <div className="flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              <AlertCircle className="h-5 w-5 text-foreground/70" />
              <p>{error || "Analytics took too long to load."}</p>
              <button
                onClick={() => { setTimedOut(false); refetch(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-medium bg-primary/15 text-primary border border-primary/20 hover:bg-primary/25 transition-all"
              >
                <RotateCcw className="h-3 w-3" />
                Retry
              </button>
            </div>
          </GlassCard>
        ) : loading ? (
          <GlassCard hover={false} className="!p-8">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading analytics...
            </div>
          </GlassCard>
        ) : (
          <>
            <GlassCard hover={false} className="!p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="text-sm font-semibold">Data Trust Notes</h3>
                <div className="flex items-center gap-1.5">
                  <TrustBadge type="hard" />
                  <TrustBadge type="estimated" />
                  <TrustBadge type="informational" />
                </div>
              </div>

              {dataNotes.length === 0 ? (
                <p className="text-xs text-muted-foreground">No trust flags for the selected period.</p>
              ) : (
                <ul className="space-y-1.5 text-xs text-muted-foreground list-disc pl-4">
                  {dataNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              )}
            </GlassCard>

            <GlassCard hover={false} className="!p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <MapPinned className="h-4 w-4 text-primary" />
                  Market Scoreboard
                </h3>
                <div className="flex items-center gap-1.5">
                  <TrustBadge type="hard" />
                  <TrustBadge type="estimated" />
                </div>
              </div>

              <p className="text-sm text-muted-foreground mb-3">
                Spokane and Kootenai are primary markets. Unknown/Other appears only when county mapping is missing or outside both markets.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {marketScoreboard.map((row) => (
                  <div key={row.market} className="rounded-[12px] border border-glass-border bg-glass/40 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold">{row.label}</p>
                      <Badge variant="outline" className="text-sm">{row.totalLeads} total leads</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <Metric label="New Leads" value={row.newLeads} />
                      <Metric label="Active Pipeline" value={row.activePipeline} />
                      <Metric label="Contacted (est)" value={formatPercent(row.contactedRatePct)} />
                      <Metric label="Overdue Follow-up" value={row.overdueFollowUps} tone={row.overdueFollowUps > 0 ? "warn" : "default"} />
                      <Metric label="Awaiting First Contact" value={row.awaitingFirstContact} tone={row.awaitingFirstContact > 0 ? "warn" : "default"} />
                      <Metric label="Median First Response (est)" value={formatMinutes(row.medianSpeedToLeadMinutes)} />
                      <Metric label="Closed Deals" value={row.closedDeals} />
                      <Metric label="Assignment Revenue" value={formatCurrency(row.assignmentRevenue)} tone={row.assignmentRevenue > 0 ? "positive" : "default"} />
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <GlassCard hover={false} className="xl:col-span-2 !p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    Source Outcomes
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <TrustBadge type="hard" />
                    <TrustBadge type="estimated" />
                  </div>
                </div>

                {sourceOutcomes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No leads with source attribution in this period yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-white/[0.06] text-muted-foreground/70">
                          <th className="text-left py-2 pr-3">Source</th>
                          <th className="text-right py-2 px-2">Leads</th>
                          <th className="text-right py-2 px-2">S / K</th>
                          <th className="text-right py-2 px-2">Contacted (est)</th>
                          <th className="text-right py-2 px-2">Contract %</th>
                          <th className="text-right py-2 px-2">Close %</th>
                          <th className="text-right py-2 px-2">Closed</th>
                          <th className="text-right py-2 px-2">Revenue</th>
                          <th className="text-right py-2 pl-2">Median First Response (est)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sourceOutcomes.slice(0, 10).map((row) => {
                          const contractRate = row.leads > 0 ? Math.round((row.closedDeals / row.leads) * 1000) / 10 : null;
                          const closeRate = row.closedDeals > 0 ? 100 : row.leads > 0 ? 0 : null;
                          return (
                            <tr key={row.sourceKey} className="border-b border-white/[0.03]">
                              <td className="py-2 pr-3 font-medium">{row.sourceKey === "unknown" ? "Uncategorized / Unknown" : row.sourceLabel}</td>
                              <td className="py-2 px-2 text-right tabular-nums">{row.leads}</td>
                              <td className="py-2 px-2 text-right tabular-nums">{row.spokaneLeads}/{row.kootenaiLeads}</td>
                              <td className="py-2 px-2 text-right tabular-nums">{formatPercent(row.contactedRatePct)}</td>
                              <td className="py-2 px-2 text-right tabular-nums">{formatPercent(contractRate)}</td>
                              <td className="py-2 px-2 text-right tabular-nums">{formatPercent(closeRate)}</td>
                              <td className="py-2 px-2 text-right tabular-nums">{row.closedDeals}</td>
                              <td className="py-2 px-2 text-right tabular-nums">{formatCurrency(row.assignmentRevenue)}</td>
                              <td className="py-2 pl-2 text-right tabular-nums">{formatMinutes(row.medianSpeedToLeadMinutes)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </GlassCard>

              <GlassCard hover={false} className="!p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Clock3 className="h-4 w-4 text-primary" />
                    Speed-to-Lead
                  </h3>
                  <TrustBadge type="estimated" />
                </div>

                <div className="space-y-2 text-xs">
                  <Metric label="Median First Response (est)" value={formatMinutes(speed?.medianMinutes ?? null)} />
                  <Metric label="Within 15 Minutes (est)" value={formatPercent(speed?.within15mRatePct ?? null)} />
                  <Metric label="Slow/Missing First Response" value={speed?.slowOrMissingCount ?? 0} tone={(speed?.slowOrMissingCount ?? 0) > 0 ? "warn" : "default"} />
                  <Metric label="Sample Coverage" value={`${speedSamples} sample(s) (${speed?.coveragePct ?? 0}%)`} />
                </div>

                <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-1.5">
                  {(speed?.byMarket ?? []).map((row) => (
                    <div key={row.market} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className="tabular-nums">
                        {formatMinutes(row.medianMinutes)} | {formatPercent(row.within15mRatePct)}
                      </span>
                    </div>
                  ))}
                </div>

                <p className="text-sm text-muted-foreground mt-3">
                  Derived from first logged call attempt. When missing, last_contact_at is used as an estimate.
                </p>
              </GlassCard>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <GlassCard hover={false} className="xl:col-span-2 !p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Pipeline Health by Market
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <TrustBadge type="hard" />
                    <TrustBadge type="informational" />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/[0.06] text-muted-foreground/70">
                        <th className="text-left py-2 pr-3">Market</th>
                        <th className="text-right py-2 px-2">Active</th>
                        <th className="text-right py-2 px-2">Prospect</th>
                        <th className="text-right py-2 px-2">Lead</th>
                        <th className="text-right py-2 px-2">Negotiation</th>
                        <th className="text-right py-2 px-2">Disposition</th>
                        <th className="text-right py-2 px-2">Nurture</th>
                        <th className="text-right py-2 px-2">Closed</th>
                        <th className="text-right py-2 pl-2">Dead</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pipelineHealth.map((row) => (
                        <tr key={row.market} className="border-b border-white/[0.03]">
                          <td className="py-2 pr-3 font-medium">{row.label}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{row.active}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{row.prospect}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{row.lead}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{row.negotiation}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{row.disposition}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{row.nurture}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{row.closed}</td>
                          <td className="py-2 pl-2 text-right tabular-nums">{row.dead}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="text-sm text-muted-foreground mt-3">
                  Pipeline counts are from current lead statuses (operational truth). Snapshot count ({snapshotCount}) is informational coverage, not complete funnel truth.
                </p>
              </GlassCard>

              <GlassCard hover={false} className="!p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-primary" />
                    Revenue Outcomes
                  </h3>
                  <TrustBadge type="hard" />
                </div>

                <div className="space-y-2 text-xs">
                  <Metric label="Closed Deals" value={closedDeals} />
                  <Metric label="Assignment Revenue" value={formatCurrency(revenue?.assignmentRevenue ?? 0)} tone={(revenue?.assignmentRevenue ?? 0) > 0 ? "positive" : "default"} />
                  <Metric label="Avg Assignment Fee" value={closedDeals > 0 ? formatCurrency(revenue?.avgAssignmentFee ?? 0) : "n/a"} />
                </div>

                <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-1.5">
                  {(revenue?.byMarket ?? []).map((row) => (
                    <div key={row.market} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className="tabular-nums">{row.closedDeals} | {formatCurrency(row.assignmentRevenue)}</span>
                    </div>
                  ))}
                </div>

                <p className="text-sm text-muted-foreground mt-3">
                  Revenue is sourced from deals.assignment_fee on closed deals only.
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {undatedClosedDealsExcluded > 0
                    ? `${undatedClosedDealsExcluded} closed deal(s) were excluded in this period because closed_at is missing.`
                    : "No closed_at exclusions in this period."}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  For ad spend and campaign operations, use <a href="/ads" className="text-primary underline underline-offset-2">Ads</a>.
                </p>
              </GlassCard>
            </div>
            {/* Dispo Funnel */}
            <DispoFunnelCard />
          </>
        )}
      </div>
    </PageShell>
  );
}

// ── Compact Dispo Funnel ──

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

      // Stall detection (lightweight: deals with no buyers or all pre-contact >1d)
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

      // Avg days in dispo
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
          Disposition Outreach
        </h3>
        <TrustBadge type="hard" />
      </div>
      <div className="grid grid-cols-6 gap-2 text-xs">
        {steps.map((s) => (
          <div key={s.label} className="rounded-[10px] border border-glass-border bg-glass/30 px-2.5 py-2 text-center">
            <p className="text-sm font-semibold tabular-nums">{s.value}</p>
            <p className="text-sm uppercase tracking-wider text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
        {funnel.avgDaysInDispo != null && (
          <span>Avg <span className="text-foreground/80 font-medium">{funnel.avgDaysInDispo === 0 ? "< 1" : funnel.avgDaysInDispo} {funnel.avgDaysInDispo === 1 ? "day" : "days"}</span> in dispo</span>
        )}
        {funnel.stalledCount > 0 && (
          <span className="text-foreground/80">
            <span className="font-medium">{funnel.stalledCount}</span> {funnel.stalledCount === 1 ? "deal" : "deals"} stalled
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground mt-2">
        Live buyer outreach funnel for deals currently in disposition. See <a href="/dispo" className="text-primary underline underline-offset-2">Dispo Board</a> for details.
      </p>
    </GlassCard>
  );
}

function TrustBadge({ type }: { type: "hard" | "estimated" | "informational" }) {
  if (type === "hard") {
    return <Badge variant="outline" className="text-sm">Hard truth</Badge>;
  }
  if (type === "estimated") {
    return <Badge variant="outline" className="text-sm">Estimated</Badge>;
  }
  return <Badge variant="outline" className="text-sm">Informational</Badge>;
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "warn" | "positive";
}) {
  return (
    <div
      className={cn(
        "rounded-[10px] border px-2.5 py-2",
        tone === "default" && "border-glass-border bg-glass/30",
        tone === "warn" && "border-border/25 bg-muted/[0.05]",
        tone === "positive" && "border-border/25 bg-muted/[0.05]"
      )}
    >
      <p className="text-sm uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
