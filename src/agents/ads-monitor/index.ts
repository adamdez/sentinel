/**
 * Ads Monitor Agent — Runner
 *
 * Blueprint: "Google Ads performance alerts. Triggered daily or on anomaly
 * threshold breach. Informational — recommendations require operator approval."
 *
 * Phase 1: Deterministic threshold checks against ads_daily_metrics.
 * No LLM call needed — alert detection is rule-based.
 *
 * Imported by:
 *   - /api/cron/ads-monitor (daily cron)
 *   - Claude Code scheduled tasks
 */

import { createServerClient } from "@/lib/supabase";
import {
  createAgentRun,
  completeAgentRun,
  isAgentEnabled,
} from "@/lib/control-plane";
import { ADS_MONITOR_AGENT_VERSION, ADS_THRESHOLDS } from "./prompt";
import type {
  AdsMonitorInput,
  AdsMonitorReport,
  AdsAlert,
  AlertSeverity,
} from "./types";

export async function runAdsMonitor(
  input: AdsMonitorInput,
): Promise<AdsMonitorReport> {
  const enabled = await isAgentEnabled("ads_monitor");
  if (!enabled) {
    return emptyReport("Ads Monitor agent disabled via feature flag");
  }

  // Map agent-level trigger types to control-plane's enum
  const cpTriggerType = input.triggerType === "daily_cron" ? "cron" as const
    : input.triggerType === "anomaly_trigger" ? "event" as const
    : "manual" as const;

  const runId = await createAgentRun({
    agentName: "ads_monitor",
    triggerType: cpTriggerType,
    triggerRef: input.triggerRef,
    model: "deterministic",
    promptVersion: ADS_MONITOR_AGENT_VERSION,
    inputs: { trigger: input.triggerType, campaignIds: input.campaignIds },
  });

  if (!runId) {
    return emptyReport("Ads Monitor already running — skipped duplicate.");
  }
  const traceRunId: string = runId;

  try {
    const sb = createServerClient();
    const now = new Date();
    const alerts: AdsAlert[] = [];

    // ── Query recent campaign stats ──────────────────────────────────
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tbl = (name: string) => sb.from(name) as any;

    // Get last 7 days of campaign-level metrics (filter out ad-group/keyword breakdowns)
    const { data: dailyStats } = await tbl("ads_daily_metrics")
      .select("report_date, campaign_id, impressions, clicks, cost_micros, conversions, ads_campaigns(name)")
      .gte("report_date", sevenDaysAgo)
      .is("ad_group_id", null)
      .is("keyword_id", null)
      .order("report_date", { ascending: false });

    if (!dailyStats || dailyStats.length === 0) {
      await completeAgentRun({
        runId: traceRunId,
        status: "completed",
        outputs: { message: "No campaign stats found" },
      });
      return emptyReport("No campaign data available for the past 7 days.");
    }

    // ── Aggregate by campaign ────────────────────────────────────────
    type CampaignAgg = {
      name: string;
      totalSpend: number;
      totalClicks: number;
      totalImpressions: number;
      totalConversions: number;
      totalLeads: number;
      days: number;
      yesterdayImpressions: number;
      avgDailyImpressions: number;
    };

    const campaigns = new Map<string, CampaignAgg>();

    for (const row of dailyStats) {
      const id = String(row.campaign_id);
      const campaignName = row.ads_campaigns?.name ?? id;
      const costDollars = Number(row.cost_micros ?? 0) / 1_000_000;

      if (!campaigns.has(id)) {
        campaigns.set(id, {
          name: campaignName,
          totalSpend: 0,
          totalClicks: 0,
          totalImpressions: 0,
          totalConversions: 0,
          totalLeads: 0,
          days: 0,
          yesterdayImpressions: 0,
          avgDailyImpressions: 0,
        });
      }
      const c = campaigns.get(id)!;
      c.totalSpend += costDollars;
      c.totalClicks += Number(row.clicks ?? 0);
      c.totalImpressions += Number(row.impressions ?? 0);
      c.totalConversions += Number(row.conversions ?? 0);
      // leads_generated not tracked in ads_daily_metrics; use conversions as proxy
      c.totalLeads += Number(row.conversions ?? 0);
      c.days++;
      if (row.report_date === yesterday) {
        c.yesterdayImpressions = Number(row.impressions ?? 0);
      }
    }

    // Compute averages
    for (const c of campaigns.values()) {
      c.avgDailyImpressions = c.days > 1 ? c.totalImpressions / c.days : c.totalImpressions;
    }

    // ── Threshold checks per campaign ────────────────────────────────
    let globalSpend = 0;
    let globalLeads = 0;
    let globalClicks = 0;
    let globalImpressions = 0;

    for (const [, c] of campaigns) {
      globalSpend += c.totalSpend;
      globalLeads += c.totalLeads;
      globalClicks += c.totalClicks;
      globalImpressions += c.totalImpressions;

      // CPL check
      if (c.totalLeads > 0) {
        const cpl = c.totalSpend / c.totalLeads;
        if (cpl > ADS_THRESHOLDS.maxCPL) {
          alerts.push(alert(
            cpl > ADS_THRESHOLDS.maxCPL * 2 ? "critical" : "high",
            "high_cpl",
            `${c.name}: CPL $${cpl.toFixed(0)} exceeds $${ADS_THRESHOLDS.maxCPL} threshold (7d avg).`,
            c.name, "cpl", cpl, ADS_THRESHOLDS.maxCPL,
          ));
        }
      }

      // Spend with zero leads = waste
      if (c.totalSpend > 100 && c.totalLeads === 0) {
        alerts.push(alert(
          "critical", "waste",
          `${c.name}: $${c.totalSpend.toFixed(0)} spent with zero leads in past 7 days.`,
          c.name, "leads", 0, 1,
        ));
      }

      // CTR check
      if (c.totalImpressions > 100) {
        const ctr = (c.totalClicks / c.totalImpressions) * 100;
        if (ctr < ADS_THRESHOLDS.minCTR) {
          alerts.push(alert(
            "medium", "low_ctr",
            `${c.name}: CTR ${ctr.toFixed(2)}% below ${ADS_THRESHOLDS.minCTR}% minimum.`,
            c.name, "ctr", ctr, ADS_THRESHOLDS.minCTR,
          ));
        }
      }

      // CPC check
      if (c.totalClicks > 0) {
        const cpc = c.totalSpend / c.totalClicks;
        if (cpc > ADS_THRESHOLDS.maxCPC) {
          alerts.push(alert(
            "high", "high_cpc",
            `${c.name}: CPC $${cpc.toFixed(2)} exceeds $${ADS_THRESHOLDS.maxCPC} threshold.`,
            c.name, "cpc", cpc, ADS_THRESHOLDS.maxCPC,
          ));
        }
      }

      // Impression drop (anomaly detection)
      if (c.days > 2 && c.avgDailyImpressions > 0) {
        const dropPercent = ((c.avgDailyImpressions - c.yesterdayImpressions) / c.avgDailyImpressions) * 100;
        if (dropPercent > ADS_THRESHOLDS.impressionDropPercent) {
          alerts.push(alert(
            "high", "impression_drop",
            `${c.name}: Impressions dropped ${dropPercent.toFixed(0)}% yesterday vs 7d avg.`,
            c.name, "impression_drop_pct", dropPercent, ADS_THRESHOLDS.impressionDropPercent,
          ));
        }
      }
    }

    // ── Global checks ────────────────────────────────────────────────
    const blendedCPL = globalLeads > 0 ? globalSpend / globalLeads : 0;
    const avgCTR = globalImpressions > 0 ? (globalClicks / globalImpressions) * 100 : 0;
    const avgCPC = globalClicks > 0 ? globalSpend / globalClicks : 0;

    // Sort alerts: critical first, then high, then medium
    const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2 };
    alerts.sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3));

    const totals = {
      critical: alerts.filter((a) => a.severity === "critical").length,
      high: alerts.filter((a) => a.severity === "high").length,
      medium: alerts.filter((a) => a.severity === "medium").length,
      total: alerts.length,
    };

    const summary = totals.total === 0
      ? `Ads healthy. 7d: $${globalSpend.toFixed(0)} spend, ${globalLeads} leads, $${blendedCPL.toFixed(0)} CPL.`
      : `${totals.total} alert${totals.total > 1 ? "s" : ""} (${totals.critical} critical). ` +
        `7d: $${globalSpend.toFixed(0)} spend, ${globalLeads} leads, $${blendedCPL.toFixed(0)} CPL. ` +
        `Top: ${alerts[0].message}`;

    const report: AdsMonitorReport = {
      runId: traceRunId,
      generatedAt: now.toISOString(),
      alerts,
      summary,
      totals,
      metrics: {
        totalSpend: globalSpend,
        totalLeads: globalLeads,
        blendedCPL,
        avgCTR,
        avgCPC,
        budgetUtilization: 0, // requires budget data not yet available
      },
    };

    await completeAgentRun({
      runId: traceRunId,
      status: "completed",
      outputs: { totals, summary, alertCount: alerts.length },
    });

    return report;

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await completeAgentRun({
      runId: traceRunId,
      status: "failed",
      error: msg,
    });
    return emptyReport(`Ads monitor failed: ${msg}`);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────

function alert(
  severity: AlertSeverity,
  category: AdsAlert["category"],
  message: string,
  campaignName: string | null,
  metric: string,
  value: number,
  threshold: number,
): AdsAlert {
  return { severity, category, message, campaignName, metric, value, threshold };
}

function emptyReport(summary: string): AdsMonitorReport {
  return {
    runId: "none",
    generatedAt: new Date().toISOString(),
    alerts: [],
    summary,
    totals: { critical: 0, high: 0, medium: 0, total: 0 },
  };
}
