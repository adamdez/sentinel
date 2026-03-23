/**
 * PATCH /api/dialer/v1/jeff-messages/[id]/acknowledge
 *
 * Marks a Jeff message as acknowledged by appending an acknowledgment
 * record to the voice_session's extracted_facts JSONB array.
 *
 * Body: { action: 'dismissed' | 'called_back' | 'converted_to_lead', lead_id?: string }
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

type RouteContext = { params: Promise<{ id: string }> };

async function getAuthedUser(req: NextRequest) {
  const sb = createServerClient();
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  const { data: { user } } = await sb.auth.getUser(auth.replace("Bearer ", ""));
  return user;
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const sb = createServerClient();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action as string | undefined;
  if (!action || !["dismissed", "called_back", "converted_to_lead"].includes(action)) {
    return NextResponse.json({ error: "action must be dismissed | called_back | converted_to_lead" }, { status: 400 });
  }

  // Fetch current session
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: session, error: fetchErr } = await (sb.from("voice_sessions") as any)
    .select("id, extracted_facts")
    .eq("id", id)
    .single();

  if (fetchErr || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Append acknowledgment to extracted_facts
  const currentFacts = Array.isArray(session.extracted_facts) ? session.extracted_facts : [];
  const ackRecord = {
    type: "acknowledged",
    action,
    acknowledged_by: user.email ?? user.id,
    acknowledged_at: new Date().toISOString(),
    lead_id: body.lead_id ?? null,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateErr } = await (sb.from("voice_sessions") as any)
    .update({ extracted_facts: [...currentFacts, ackRecord] })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, action });
}
