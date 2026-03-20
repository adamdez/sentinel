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
 * Body: { callLogId: string, leadId: string }
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

    if (!callLogId || !leadId) {
      return NextResponse.json(
        { error: "callLogId and leadId are required" },
        { status: 400 },
      );
    }

    const result = await runQAAgent({
      callLogId,
      leadId,
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
