import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/dialer/v1/inbound/[event_id]/recover
 *
 * Marks a missed inbound call as recovered.
 * Writes an inbound.recovered dialer_event referencing the original event.
 * Optionally completes the associated callback task.
 *
 * Body: { complete_task?: boolean }
 *
 * This removes the event from the missed_inbound recovery queue.
 * No lead fields are changed — recovery just clears the operational signal.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ event_id: string }> }
) {
  try {
    const user = await getDialerUser(req.headers.get("authorization"));
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { event_id } = await params;
    const body = await req.json().catch(() => ({}));
    const completeTask = !!body.complete_task;

    const sb = createDialerClient();

    // Fetch the original missed-inbound event to get task_id and lead_id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: original, error: fetchErr } = await (sb.from("dialer_events") as any)
      .select("id, lead_id, task_id, metadata")
      .eq("id", event_id)
      .eq("event_type", "inbound.missed")
      .single();

    if (fetchErr || !original) {
      return NextResponse.json({ error: "Event not found or not a missed-inbound event" }, { status: 404 });
    }

    // Write the recovery event
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: eventErr } = await (sb.from("dialer_events") as any)
      .insert({
        event_type: "inbound.recovered",
        lead_id: original.lead_id,
        session_id: null,
        task_id: original.task_id,
        metadata: {
          original_event_id: event_id,
          recovered_by: user.id,
          recovered_at: new Date().toISOString(),
          from_number: original.metadata?.from_number ?? null,
        },
      });

    if (eventErr) {
      return NextResponse.json({ error: eventErr.message }, { status: 500 });
    }

    // Optionally complete the callback task
    if (completeTask && original.task_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("tasks") as any)
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", original.task_id);
    }

    return NextResponse.json({ ok: true, event_id, recovered: true });
  } catch (err) {
    console.error("[dialer/v1/inbound/recover] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
