import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { dispositionCategory } from "@/lib/comm-truth";
import { suggestNextCadenceDate } from "@/lib/call-scheduler";

/**
 * POST /api/leads/[id]/log-call
 *
 * Log a call made outside Sentinel (e.g., from a personal cell phone).
 * Inserts into calls_log and updates lead counters identically to
 * the Twilio-based dialer flow — no TwilioSID required.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: leadId } = await params;
  if (!leadId) {
    return NextResponse.json({ error: "Missing lead ID" }, { status: 400 });
  }

  const sb = createServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    disposition: string;
    notes?: string;
    durationSec?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.disposition || typeof body.disposition !== "string") {
    return NextResponse.json({ error: "disposition is required" }, { status: 400 });
  }

  // Fetch lead + property for phone and counters
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead, error: leadErr } = await (sb.from("leads") as any)
    .select("id, property_id, total_calls, call_sequence_step")
    .eq("id", leadId)
    .single();

  if (leadErr || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Get phone from property
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prop } = await (sb.from("properties") as any)
    .select("owner_phone")
    .eq("id", lead.property_id)
    .single();

  const now = new Date().toISOString();

  // Insert call log record (no twilio_sid — external call)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: callLog, error: insertErr } = await (sb.from("calls_log") as any)
    .insert({
      lead_id: leadId,
      property_id: lead.property_id || null,
      user_id: user.id,
      phone_dialed: prop?.owner_phone || "external",
      disposition: body.disposition,
      duration_sec: body.durationSec ?? 0,
      notes: body.notes ?? null,
      started_at: now,
      ended_at: now,
    })
    .select("id")
    .single();

  if (insertErr) {
    console.error("[LogCall] calls_log insert failed:", insertErr);
    return NextResponse.json({ error: "Failed to log call" }, { status: 500 });
  }

  // Update lead counters via RPC (same path as dialer)
  const dispoCategory = dispositionCategory(body.disposition);
  const isLive = dispoCategory === "live";
  const isVM = dispoCategory === "voicemail";
  const newTotalCalls = (lead.total_calls ?? 0) + 1;
  const step = lead.call_sequence_step ?? 1;
  const cadenceNext = suggestNextCadenceDate(now, newTotalCalls);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: rpcErr } = await (sb as any).rpc("increment_lead_call_counters", {
    p_lead_id: leadId,
    p_is_live: isLive,
    p_is_voicemail: isVM,
    p_last_contact_at: now,
    p_call_sequence_step: step + 1,
    p_next_call_scheduled_at: cadenceNext ? cadenceNext.toISOString() : null,
    p_clear_sequence: false,
  });

  if (rpcErr) {
    console.error("[LogCall] lead counter update failed:", rpcErr);
    // Non-fatal — the call was logged even if counters didn't update
  }

  // Audit log (non-blocking)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sb.from("event_log") as any)
    .insert({
      user_id: user.id,
      action: "dialer.external_call_logged",
      entity_type: "call",
      entity_id: callLog?.id ?? "unknown",
      details: {
        lead_id: leadId,
        disposition: body.disposition,
        source: "external_cell",
      },
    })
    .then(() => {});

  return NextResponse.json({ success: true, callLogId: callLog?.id });
}
