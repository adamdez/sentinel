import { NextRequest, NextResponse } from "next/server";
import { runExceptionScan } from "@/agents/exception";

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
