import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { runFollowUpAgent } from "@/agents/follow-up";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/agents/follow-up
 *
 * Trigger follow-up draft generation for a lead.
 * Drafts go to review_queue — operator approves before send.
 *
 * Body: {
 *   leadId: string,
 *   channel?: "call" | "sms" | "email",
 *   operatorNotes?: string
 * }
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { leadId, channel, operatorNotes } = body;

    if (!leadId) {
      return NextResponse.json(
        { error: "leadId is required" },
        { status: 400 },
      );
    }

    const result = await runFollowUpAgent({
      leadId,
      triggerType: "operator_request",
      triggerRef: `operator:${user.id}`,
      channel,
      operatorNotes,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[agents/follow-up] Error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
