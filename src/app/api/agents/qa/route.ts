import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { runQAAgent } from "@/agents/qa";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/agents/qa
 *
 * Trigger QA analysis on a specific call.
 * Informational only — produces quality rating and coaching flags.
 *
 * Body: { callLogId: string, leadId?: string }
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { callLogId, leadId } = body;

    if (!callLogId) {
      return NextResponse.json(
        { error: "callLogId is required" },
        { status: 400 },
      );
    }

    // Resolve lead ownership from the call row when possible so callers do not
    // need to provide a second id that can drift out of sync.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: callRow } = await (sb.from("calls_log") as any)
      .select("id, lead_id")
      .eq("id", callLogId)
      .maybeSingle();

    if (!callRow) {
      return NextResponse.json(
        { error: `Call ${callLogId} not found` },
        { status: 404 },
      );
    }

    const resolvedLeadId = (callRow.lead_id as string | null) ?? leadId;
    if (!resolvedLeadId) {
      return NextResponse.json(
        { error: `Call ${callLogId} has no linked lead` },
        { status: 422 },
      );
    }

    const result = await runQAAgent({
      callLogId,
      leadId: resolvedLeadId,
      triggerType: "manual",
      triggerRef: `operator:${user.id}`,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[agents/qa] Error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
