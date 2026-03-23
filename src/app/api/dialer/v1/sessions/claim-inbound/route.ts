/**
 * POST /api/dialer/v1/sessions/claim-inbound
 *
 * Reassigns an inbound session to the operator who answered the call.
 * The inbound webhook creates sessions under a default user_id (Logan),
 * but any operator can answer. This endpoint transfers ownership so
 * note polling, live coach, and closeout all work for the answering operator.
 *
 * Body: { sessionId: string }
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";

export async function POST(req: NextRequest) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { sessionId: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  const sb = createDialerClient();

  // Update the session's user_id to the answering operator
  // Also update the linked calls_log entry
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: session, error: sessErr } = await (sb.from("call_sessions") as any)
    .update({ user_id: user.id, status: "connected" })
    .eq("id", body.sessionId)
    .in("status", ["ringing", "initiating", "connected"])
    .select("id, phone_dialed, lead_id")
    .maybeSingle();

  if (sessErr) {
    console.error("[claim-inbound] Session update failed:", sessErr.message);
    return NextResponse.json({ error: sessErr.message }, { status: 500 });
  }

  if (!session) {
    return NextResponse.json({ error: "Session not found or already ended" }, { status: 404 });
  }

  // Also update the calls_log entry to the answering operator
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("calls_log") as any)
    .update({ user_id: user.id })
    .eq("dialer_session_id", body.sessionId)
    .catch(() => {});

  console.log(`[claim-inbound] Session ${body.sessionId.slice(0, 8)} claimed by ${user.email}`);

  return NextResponse.json({
    ok: true,
    session: {
      id: session.id,
      phoneDialed: session.phone_dialed,
      leadId: session.lead_id,
    },
  });
}
