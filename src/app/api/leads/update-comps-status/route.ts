import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

/**
 * PATCH /api/leads/update-comps-status
 *
 * Updates the comps_status field on a lead after comps are pulled.
 * Called by the UI after a successful comps search, or by cron
 * to mark stale comps.
 *
 * Body: { leadId: string, status: "pending" | "stale" | "current" }
 *
 * Blueprint 9.1: comps_status tracks whether the lead has fresh comps.
 */
export async function PATCH(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { leadId, status } = body as { leadId?: string; status?: string };

  if (!leadId) {
    return NextResponse.json({ error: "leadId required" }, { status: 400 });
  }

  if (!status || !["pending", "stale", "current"].includes(status)) {
    return NextResponse.json(
      { error: "status must be pending, stale, or current" },
      { status: 400 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb.from("leads") as any)
    .update({ comps_status: status })
    .eq("id", leadId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, leadId, comps_status: status });
}
