import { NextRequest, NextResponse } from "next/server";
import { runExceptionScan } from "@/agents/exception";
import { runFollowUpAgent } from "@/agents/follow-up";
import { notifyStaleFollowUp } from "@/lib/notify";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/exception-scan
 *
 * Nightly exception scan. Runs the Exception Agent to detect pipeline problems.
 * Produces a structured ExceptionReport with critical/high/medium items.
 *
 * Secured by CRON_SECRET header (same pattern as /api/cron/stale-leads).
 * Triggered by Vercel cron at 2am PT or manually via Claude Code scheduled task.
 *
 * Blueprint: "Exception Agent: Nightly scan + real-time SLA monitors.
 * Produces morning priority brief, exception alerts via n8n. Informational — no write."
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (expected && secret !== expected && secret !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const report = await runExceptionScan({
      triggerType: "cron",
      triggerRef: "exception-scan-nightly",
    });

    // Dispatch overdue follow-up nudge to Logan if critical/high items found
    const overdueItems = [
      ...report.critical.filter((e) => e.category === "overdue_follow_up" || e.category === "missing_next_action"),
      ...report.high.filter((e) => e.category === "overdue_follow_up"),
    ];
    if (overdueItems.length > 0) {
      notifyStaleFollowUp({
        overdueLeads: overdueItems.slice(0, 10).map((e) => ({
          leadId: e.leadId,
          ownerName: e.ownerName,
          address: e.address,
          nextAction: e.currentNextAction,
          hoursOverdue: e.daysSinceLastContact ? e.daysSinceLastContact * 24 : 0,
          severity: e.severity,
        })),
        totalOverdue: overdueItems.length,
      }).catch(() => {});
    }

    // Auto-trigger Follow-Up Agent for top stale leads (fire-and-forget)
    // Limits to 5 leads per scan to control costs. Drafts go to review_queue.
    const staleLeads = [
      ...report.critical.filter(e => e.category === "stale_contact" || e.category === "overdue_follow_up"),
      ...report.high.filter(e => e.category === "overdue_follow_up"),
    ].slice(0, 5);

    for (const item of staleLeads) {
      runFollowUpAgent({
        leadId: item.leadId,
        triggerType: "stale_lead",
        triggerRef: `exception-scan-${report.runId}`,
        channel: "call", // Washington outbound is call-only by default
      }).catch((err) => {
        console.error(`[cron/exception-scan] Follow-up agent failed for ${item.leadId}:`, err);
      });
    }

    return NextResponse.json({
      ok: true,
      runId: report.runId,
      summary: report.summary,
      totals: report.totals,
      critical: report.critical,
      high: report.high,
      medium: report.medium,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron/exception-scan] Error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
