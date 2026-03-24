import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { refreshZillowEstimateForLeadAssignment } from "@/lib/zillow-estimate";

/**
 * POST /api/leads/[id]/queue
 *
 * Adds a lead to the current user's dialer queue by:
 *   1. Assigning the lead to the calling user
 *   2. Setting next_call_scheduled_at = now (makes it due immediately)
 *
 * This makes the lead appear at the top of the dialer queue on next load.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sb = createServerClient();
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: leadId } = await params;
  if (!leadId) return NextResponse.json({ error: "Lead ID required" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb.from("leads") as any)
    .update({
      assigned_to: user.id,
      next_call_scheduled_at: new Date().toISOString(),
    })
    .eq("id", leadId);

  if (error) {
    console.error("[Queue] Failed to queue lead:", error);
    return NextResponse.json({ error: "Failed to queue lead" }, { status: 500 });
  }

  // Non-blocking audit
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sb.from("event_log") as any).insert({
    user_id: user.id,
    action: "dialer.lead_queued",
    entity_type: "lead",
    entity_id: leadId,
    details: { queued_at: new Date().toISOString() },
  });

  try {
    await Promise.race([
      refreshZillowEstimateForLeadAssignment({
        sb,
        leadId,
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Zillow refresh timed out")), 12_000);
      }),
    ]);
  } catch (refreshError) {
    console.error("[Queue] Zillow estimate refresh failed (non-fatal):", refreshError);
  }

  return NextResponse.json({ success: true });
}
