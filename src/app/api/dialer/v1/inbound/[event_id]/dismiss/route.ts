import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/dialer/v1/inbound/[event_id]/dismiss
 *
 * Dismisses a missed inbound call signal — removes it from the recovery queue.
 * Requires an explicit reason (enforces that dismissal is intentional, not lazy).
 *
 * Body: { reason: string }  — required, min 3 chars
 *
 * Writes an inbound.dismissed dialer_event referencing the original.
 * Does NOT complete the associated task — operator can do that separately.
 * Does NOT change any lead fields.
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
    const reason = (body.reason ?? "").trim();

    if (reason.length < 3) {
      return NextResponse.json(
        { error: "A dismiss reason is required (min 3 characters)" },
        { status: 400 }
      );
    }

    const sb = createDialerClient();

    // Fetch original event
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: original, error: fetchErr } = await (sb.from("dialer_events") as any)
      .select("id, lead_id, task_id, metadata")
      .eq("id", event_id)
      .eq("event_type", "inbound.missed")
      .single();

    if (fetchErr || !original) {
      return NextResponse.json({ error: "Event not found or not a missed-inbound event" }, { status: 404 });
    }

    // Write the dismiss event
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: eventErr } = await (sb.from("dialer_events") as any)
      .insert({
        event_type: "inbound.dismissed",
        lead_id: original.lead_id,
        session_id: null,
        task_id: original.task_id,
        metadata: {
          original_event_id: event_id,
          dismissed_by: user.id,
          dismissed_at: new Date().toISOString(),
          reason,
          from_number: original.metadata?.from_number ?? null,
        },
      });

    if (eventErr) {
      return NextResponse.json({ error: eventErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, event_id, dismissed: true });
  } catch (err) {
    console.error("[dialer/v1/inbound/dismiss] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
