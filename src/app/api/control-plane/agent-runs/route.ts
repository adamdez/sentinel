import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

/**
 * GET /api/control-plane/agent-runs
 *
 * List recent agent runs. Supports filtering by agent_name and status.
 * Read-only — agents create runs via the control-plane service layer.
 */
export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const agentName = searchParams.get("agent_name");
  const status = searchParams.get("status");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (sb.from("agent_runs") as any)
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);

  if (agentName) query = query.eq("agent_name", agentName);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, count: data?.length ?? 0 });
}
