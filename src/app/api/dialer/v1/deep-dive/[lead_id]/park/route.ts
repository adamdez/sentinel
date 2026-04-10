export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";
import { DEEP_DIVE_NEXT_ACTION, getDefaultDeepDiveDueAt } from "@/lib/deep-dive";

type RouteContext = { params: Promise<{ lead_id: string }> };

async function dropAutoCycleLead(sb: ReturnType<typeof createDialerClient>, userId: string, leadId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cycleLead } = await (sb.from("dialer_auto_cycle_leads") as any)
    .select("id")
    .eq("lead_id", leadId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!cycleLead?.id) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("dialer_auto_cycle_phones") as any)
    .update({
      phone_status: "exited",
      exit_reason: "deep_dive",
      next_attempt_number: null,
      next_due_at: null,
      voicemail_drop_next: false,
    })
    .eq("cycle_lead_id", cycleLead.id)
    .eq("phone_status", "active");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("dialer_auto_cycle_leads") as any)
    .update({
      cycle_status: "exited",
      next_due_at: null,
      next_phone_id: null,
      exit_reason: "deep_dive",
      last_outcome: "deep_dive",
    })
    .eq("id", cycleLead.id);
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const authHeader = req.headers.get("authorization");
  const user = await getDialerUser(authHeader);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { lead_id } = await params;
  if (!lead_id) return NextResponse.json({ error: "lead_id is required" }, { status: 400 });

  const body = await req.json().catch(() => ({} as { reason?: string; next_action_due_at?: string }));
  const reason = typeof body.reason === "string" && body.reason.trim().length > 0 ? body.reason.trim() : null;
  const nextActionDueAt = typeof body.next_action_due_at === "string" && !Number.isNaN(new Date(body.next_action_due_at).getTime())
    ? body.next_action_due_at
    : getDefaultDeepDiveDueAt();

  const sb = createDialerClient(authHeader);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead, error: leadErr } = await (sb.from("leads") as any)
    .select("id, assigned_to, status, next_action, next_action_due_at")
    .eq("id", lead_id)
    .maybeSingle();

  if (leadErr) {
    return NextResponse.json({ error: "Failed to load lead" }, { status: 500 });
  }
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  if (lead.assigned_to !== user.id) {
    return NextResponse.json({ error: "Lead must be assigned to you" }, { status: 403 });
  }
  if (lead.status === "dead" || lead.status === "closed") {
    return NextResponse.json({ error: "Cannot park terminal leads" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateErr } = await (sb.from("leads") as any)
    .update({
      next_action: DEEP_DIVE_NEXT_ACTION,
      next_action_due_at: nextActionDueAt,
    })
    .eq("id", lead_id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  await dropAutoCycleLead(sb, user.id, lead_id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("dialer_events") as any)
    .insert({
      event_type: "queue.deep_dive",
      user_id: user.id,
      lead_id,
      metadata: {
        previous_next_action: lead.next_action ?? null,
        previous_next_action_due_at: lead.next_action_due_at ?? null,
        next_action_due_at: nextActionDueAt,
        reason,
      },
    });

  return NextResponse.json({
    ok: true,
    lead_id,
    next_action: DEEP_DIVE_NEXT_ACTION,
    next_action_due_at: nextActionDueAt,
  });
}
