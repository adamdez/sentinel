import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServerClient } from "@/lib/supabase";
import { isLangfuseConfigured } from "@/lib/langfuse";

export const runtime = "nodejs";

/**
 * GET /api/diagnostics/langfuse
 *
 * Check Langfuse integration status and recent agent run stats.
 */
export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const configured = isLangfuseConfigured();

  // Get recent agent run stats
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: runs } = await (sb.from("agent_runs") as any)
    .select("agent_name, status, cost_cents, input_tokens, output_tokens, duration_ms")
    .gte("started_at", sevenDaysAgo);

  const stats: Record<string, { total: number; completed: number; failed: number; totalCostCents: number; totalTokens: number; avgDurationMs: number }> = {};

  for (const run of runs ?? []) {
    const name = run.agent_name;
    if (!stats[name]) stats[name] = { total: 0, completed: 0, failed: 0, totalCostCents: 0, totalTokens: 0, avgDurationMs: 0 };
    stats[name].total++;
    if (run.status === "completed") stats[name].completed++;
    if (run.status === "failed") stats[name].failed++;
    stats[name].totalCostCents += run.cost_cents ?? 0;
    stats[name].totalTokens += (run.input_tokens ?? 0) + (run.output_tokens ?? 0);
    stats[name].avgDurationMs += run.duration_ms ?? 0;
  }

  // Compute averages
  for (const name of Object.keys(stats)) {
    if (stats[name].total > 0) {
      stats[name].avgDurationMs = Math.round(stats[name].avgDurationMs / stats[name].total);
    }
  }

  return NextResponse.json({
    langfuse: {
      configured,
      publicKeySet: !!process.env.LANGFUSE_PUBLIC_KEY,
      secretKeySet: !!process.env.LANGFUSE_SECRET_KEY,
      baseUrl: process.env.LANGFUSE_BASE_URL ?? "https://cloud.langfuse.com (default)",
    },
    agentStats7d: stats,
    totalRuns7d: runs?.length ?? 0,
  });
}
