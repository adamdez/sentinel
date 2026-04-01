import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { summarizeAgentHealth, type AgentRunHealthRow } from "@/lib/agent-health";

export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const windowHours = Math.min(Math.max(parseInt(searchParams.get("window_hours") ?? "48", 10), 1), 168);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "250", 10), 20), 1000);
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("agent_runs") as any)
    .select("id, agent_name, status, error, started_at, completed_at")
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const summary = summarizeAgentHealth((data ?? []) as AgentRunHealthRow[], windowHours);
  return NextResponse.json({
    summary,
    count: data?.length ?? 0,
  });
}
