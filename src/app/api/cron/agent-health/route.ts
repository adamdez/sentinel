import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { withCronTracking } from "@/lib/cron-run-tracker";
import { summarizeAgentHealth, type AgentRunHealthRow } from "@/lib/agent-health";
import { notifyAgentFleetAlert } from "@/lib/notify";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (expected && secret !== expected && secret !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return withCronTracking("agent-health", async (run) => {
    const sb = createServerClient();
    const windowHours = 6;
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("agent_runs") as any)
      .select("id, agent_name, status, error, started_at, completed_at")
      .gte("started_at", since)
      .order("started_at", { ascending: false })
      .limit(300);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const summary = summarizeAgentHealth((data ?? []) as AgentRunHealthRow[], windowHours);
    const criticalCauseCount = summary.causes.filter((cause) => cause.severity === "critical").reduce((sum, cause) => sum + cause.count, 0);
    const shouldAlert =
      summary.totals.total >= 8 &&
      (summary.totals.successRate < 80 || criticalCauseCount >= 3 || summary.totals.failed >= 5);

    if (shouldAlert) {
      notifyAgentFleetAlert({
        windowHours,
        successRate: summary.totals.successRate,
        totalRuns: summary.totals.total,
        failedRuns: summary.totals.failed,
        causes: summary.causes,
      }).catch(() => {});
    }

    run.increment(summary.totals.total);
    return NextResponse.json({ ok: true, shouldAlert, summary });
  });
}
