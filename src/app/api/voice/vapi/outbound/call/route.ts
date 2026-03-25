/**
 * POST /api/voice/vapi/outbound/call
 *
 * Trigger a single outbound call via Vapi (Jeff).
 * Creates a voice_session with direction=outbound, checks DNC,
 * looks up auto-cycle context, then initiates the call via Vapi API.
 *
 * Request: { leadId: string; phoneNumber?: string }
 * Response: { success: true, voiceSessionId, vapiCallId } | { error: string }
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getDialerUser, createDialerClient } from "@/lib/dialer/db";
import { isDnc } from "@/lib/dnc-check";
import { initiateOutboundCall } from "@/providers/voice/vapi-adapter";
import { normalizePhoneForCompare } from "@/lib/dialer/auto-cycle";

function buildSiteUrl(req: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  if (env) return env;
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

export async function POST(req: NextRequest) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { leadId?: string; phoneNumber?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { leadId } = body;
  if (!leadId) {
    return NextResponse.json({ error: "leadId is required" }, { status: 400 });
  }

  const sb = createDialerClient();

  // ── Fetch lead + phone ──────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead, error: leadErr } = await (sb.from("leads") as any)
    .select(`
      id, status,
      properties ( owner_name, address ),
      lead_phones ( phone, is_primary, position )
    `)
    .eq("id", leadId)
    .single();

  if (leadErr || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Use specified phone, or pick best from lead_phones (primary first, then lowest position)
  let phone = body.phoneNumber;
  if (!phone) {
    const phones = (lead.lead_phones as Array<{ phone: string; is_primary: boolean; position: number }>) ?? [];
    const sorted = [...phones].sort((a, b) => {
      if (a.is_primary && !b.is_primary) return -1;
      if (!a.is_primary && b.is_primary) return 1;
      return (a.position ?? 999) - (b.position ?? 999);
    });
    phone = sorted[0]?.phone;
  }
  if (!phone) {
    return NextResponse.json({ error: "Lead has no phone number" }, { status: 400 });
  }

  // ── DNC check ─────────────────────────────────────────────────────────
  try {
    const dncResult = await isDnc(phone);
    if (dncResult.isDnc) {
      return NextResponse.json(
        { error: "Phone number is on the DNC list", reason: dncResult.reason },
        { status: 403 },
      );
    }
  } catch (err) {
    console.warn("[outbound/call] DNC check failed, proceeding:", err);
  }

  // ── Look up auto-cycle context ────────────────────────────────────────
  let autoCycleLeadId: string | null = null;
  let autoCyclePhoneId: string | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cycleRow } = await (sb.from("dialer_auto_cycle_leads") as any)
    .select("id, cycle_status")
    .eq("lead_id", leadId)
    .in("cycle_status", ["ready", "waiting", "paused"])
    .maybeSingle();

  if (cycleRow) {
    autoCycleLeadId = cycleRow.id;

    // Find the matching phone in the cycle
    const normalizedPhone = normalizePhoneForCompare(phone);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cyclePhones } = await (sb.from("dialer_auto_cycle_phones") as any)
      .select("id, phone, phone_status")
      .eq("cycle_lead_id", cycleRow.id)
      .eq("phone_status", "active");

    if (cyclePhones) {
      const match = cyclePhones.find(
        (p: { phone: string }) => normalizePhoneForCompare(p.phone) === normalizedPhone,
      );
      if (match) autoCyclePhoneId = match.id;
    }
  }

  // ── Create voice_session ──────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: session, error: sessErr } = await (sb.from("voice_sessions") as any)
    .insert({
      direction: "outbound",
      lead_id: leadId,
      to_number: phone,
      status: "initiating",
      caller_type: "seller",
      initiated_by: user.id,
      auto_cycle_lead_id: autoCycleLeadId,
      auto_cycle_phone_id: autoCyclePhoneId,
    })
    .select("id")
    .single();

  if (sessErr || !session) {
    console.error("[outbound/call] Failed to create voice_session:", sessErr?.message);
    return NextResponse.json({ error: "Failed to create call session" }, { status: 500 });
  }

  const voiceSessionId = session.id;

  // ── Initiate Vapi call ────────────────────────────────────────────────
  const siteUrl = buildSiteUrl(req);
  const serverUrl = `${siteUrl}/api/voice/vapi/webhook`;

  try {
    const { vapiCallId } = await initiateOutboundCall(phone, serverUrl);

    // Update voice_session with Vapi call ID
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("voice_sessions") as any)
      .update({
        vapi_call_id: vapiCallId,
        status: "ai_handling",
      })
      .eq("id", voiceSessionId);

    const leadName = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unknown";
    console.log("[outbound/call] Call initiated:", {
      leadId: leadId.slice(0, 8),
      leadName,
      phone: `***${phone.slice(-4)}`,
      voiceSessionId: voiceSessionId.slice(0, 8),
      vapiCallId: vapiCallId.slice(0, 8),
      autoCycle: autoCycleLeadId ? "yes" : "no",
    });

    return NextResponse.json({
      success: true,
      voiceSessionId,
      vapiCallId,
      leadName,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[outbound/call] Vapi call initiation failed:", msg);

    // Mark session as failed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("voice_sessions") as any)
      .update({ status: "failed" })
      .eq("id", voiceSessionId);

    return NextResponse.json({ error: `Call initiation failed: ${msg}` }, { status: 500 });
  }
}
