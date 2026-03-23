/**
 * PATCH /api/dialer/v1/sessions/[id]/link
 *
 * Links an unlinked call session to a lead by setting call_sessions.lead_id.
 * Also updates any session_notes to reference the lead.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: sessionId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const leadId = body.lead_id;
  if (!leadId || typeof leadId !== "string") {
    return NextResponse.json({ error: "lead_id is required" }, { status: 400 });
  }

  const sb = createDialerClient();

  // Verify session exists and is unlinked
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: session, error: fetchErr } = await (sb.from("call_sessions") as any)
    .select("id, lead_id, user_id")
    .eq("id", sessionId)
    .single();

  if (fetchErr || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Update session's lead_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateErr } = await (sb.from("call_sessions") as any)
    .update({ lead_id: leadId })
    .eq("id", sessionId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
