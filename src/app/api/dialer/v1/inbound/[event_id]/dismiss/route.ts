import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/dialer/v1/inbound/[event_id]/dismiss
 *
 * Dismisses a missed inbound call signal — removes it from the recovery queue.
 *
 * Body: { reason: string }  — required, min 3 chars
 *
 * Writes an inbound.dismissed dialer_event referencing the original event or
 * fallback calls_log row when the missed event never persisted.
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

    let originalLeadId: string | null = original?.lead_id ?? null;
    let originalTaskId: string | null = original?.task_id ?? null;
    let fromNumber: string | null = (original?.metadata?.from_number as string | null) ?? null;
    let originalEventId: string | null = original?.id ?? null;
    let originalCallLogId: string | null = null;

    if (fetchErr || !original) {
      // Fallback rows come from calls_log when no inbound.missed event exists yet.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: fallbackCall, error: fallbackErr } = await (sb.from("calls_log") as any)
        .select("id, lead_id, phone_dialed")
        .eq("id", event_id)
        .eq("direction", "inbound")
        .single();

      if (fallbackErr || !fallbackCall) {
        return NextResponse.json({ error: "Event not found or not a missed-inbound event" }, { status: 404 });
      }

      originalLeadId = fallbackCall.lead_id ?? null;
      originalTaskId = null;
      fromNumber = fallbackCall.phone_dialed ?? null;
      originalEventId = null;
      originalCallLogId = fallbackCall.id;
    }

    // Write the dismiss event
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: eventErr } = await (sb.from("dialer_events") as any)
      .insert({
        event_type: "inbound.dismissed",
        lead_id: originalLeadId,
        session_id: null,
        task_id: originalTaskId,
        metadata: {
          original_event_id: originalEventId,
          original_call_log_id: originalCallLogId,
          dismissed_by: user.id,
          dismissed_at: new Date().toISOString(),
          reason,
          from_number: fromNumber,
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
