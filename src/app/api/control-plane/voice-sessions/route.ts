import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

/**
 * GET /api/control-plane/voice-sessions
 *
 * Query AI-handled voice sessions (Vapi). Filters:
 *   ?status=completed&direction=inbound&lead_id=xxx&limit=50
 *
 * Blueprint 6: Voice front office sessions are volatile — facts stay here
 * until operator promotes them via session-fact-promotion bridge.
 */
export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = req.nextUrl.searchParams.get("status");
  const direction = req.nextUrl.searchParams.get("direction");
  const leadId = req.nextUrl.searchParams.get("lead_id");
  const callerType = req.nextUrl.searchParams.get("caller_type");
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10), 100);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (sb.from("voice_sessions") as any)
    .select(`
      id, call_sid, vapi_call_id, direction, from_number, to_number,
      lead_id, caller_type, caller_intent, status,
      transferred_to, transfer_reason,
      summary, extracted_facts, callback_requested, callback_time,
      duration_seconds, cost_cents,
      recording_url, feature_flag, run_id,
      created_at, updated_at, ended_at
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);
  if (direction) query = query.eq("direction", direction);
  if (leadId) query = query.eq("lead_id", leadId);
  if (callerType) query = query.eq("caller_type", callerType);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    sessions: data ?? [],
    count: data?.length ?? 0,
  });
}
