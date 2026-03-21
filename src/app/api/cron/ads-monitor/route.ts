import { NextRequest, NextResponse } from "next/server";
import { runAdsMonitor } from "@/agents/ads-monitor";
import { notifyAdsAnomaly } from "@/lib/notify";
import { withCronTracking } from "@/lib/cron-run-tracker";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/ads-monitor
 *
 * Daily Google Ads performance scan. Runs the Ads Monitor Agent
 * to detect threshold breaches (high CPL, waste, low CTR, etc.).
 *
 * Dispatches alerts to Slack when anomalies found.
 *
 * Secured by CRON_SECRET header.
 * Triggered by Vercel cron daily or manually via Claude Code scheduled task.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (expected && secret !== expected && secret !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return withCronTracking("ads-monitor", async (run) => {
    const report = await runAdsMonitor({
      triggerType: "daily_cron",
      triggerRef: `ads-monitor-${new Date().toISOString().slice(0, 10)}`,
    });

    // Notify Slack if there are critical or high alerts
    const criticalAlerts = report.alerts.filter((a) => a.severity === "critical" || a.severity === "high");
    if (criticalAlerts.length > 0) {
      notifyAdsAnomaly({
        runId: report.runId,
        summary: report.summary,
        alertCount: report.alerts.length,
        criticalAlerts: criticalAlerts.slice(0, 5).map((a) => ({
          category: a.category,
          campaignName: a.campaignName,
          message: a.message,
        })),
        blendedCPL: report.metrics?.blendedCPL ?? 0,
        totalSpend: report.metrics?.totalSpend ?? 0,
      }).catch(() => {});
    }

    run.increment(report.alerts.length);
    return NextResponse.json({
      ok: true,
      runId: report.runId,
      summary: report.summary,
      totals: report.totals,
      alerts: report.alerts,
      metrics: report.metrics,
    });
  });
}
