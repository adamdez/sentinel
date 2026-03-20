import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { runDispoAgent } from "@/agents/dispo";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/agents/dispo
 *
 * Trigger disposition analysis for a deal.
 * Ranks buyers by fit, generates outreach drafts.
 * All drafts go to review_queue — operator selects buyer and approves.
 *
 * Body: {
 *   dealId: string,
 *   leadId: string,
 *   maxBuyers?: number,
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
    const { dealId, leadId, maxBuyers, operatorNotes } = body;

    if (!dealId || !leadId) {
      return NextResponse.json(
        { error: "dealId and leadId are required" },
        { status: 400 },
      );
    }

    const result = await runDispoAgent({
      dealId,
      leadId,
      triggerType: "operator_request",
      triggerRef: `operator:${user.id}`,
      maxBuyers,
      operatorNotes,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[agents/dispo] Error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
