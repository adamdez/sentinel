/**
 * DELETE /api/dialer/v1/dial-queue?leadId=...
 *
 * Removes a lead from the operator's dial queue by clearing assigned_to.
 * Logs a dialer_event for audit trail so the removal is traceable.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";

export async function DELETE(req: NextRequest) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const leadId = req.nextUrl.searchParams.get("leadId");
  if (!leadId) {
    return NextResponse.json({ error: "leadId is required" }, { status: 400 });
  }

  const sb = createDialerClient();

  // Verify the lead is assigned to this user before removing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead, error: leadErr } = await (sb.from("leads") as any)
    .select("id, assigned_to, status")
    .eq("id", leadId)
    .maybeSingle();

  if (leadErr) {
    console.error("[dial-queue] lead lookup failed:", leadErr.message);
    return NextResponse.json({ error: "Failed to look up lead" }, { status: 500 });
  }

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  if (lead.assigned_to !== user.id) {
    return NextResponse.json({ error: "Lead is not assigned to you" }, { status: 403 });
  }

  // Unassign the lead
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateErr } = await (sb.from("leads") as any)
    .update({ assigned_to: null })
    .eq("id", leadId);

  if (updateErr) {
    console.error("[dial-queue] unassign failed:", updateErr.message);
    return NextResponse.json({ error: "Failed to remove from queue" }, { status: 500 });
  }

  // Log audit event
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("dialer_events") as any)
    .insert({
      event_type: "queue.removed",
      user_id: user.id,
      lead_id: leadId,
      metadata: {
        previous_status: lead.status,
        action: "manual_queue_removal",
      },
    })
    .then(({ error: evErr }: { error: { message: string } | null }) => {
      if (evErr) console.error("[dial-queue] event log failed:", evErr.message);
    });

  return NextResponse.json({ ok: true, lead_id: leadId });
}
