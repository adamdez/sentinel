/**
 * POST /api/voice/vapi/outbound/call
 *
 * Trigger a single outbound call via Vapi (Jeff).
 * Creates a voice_session with direction=outbound, checks DNC,
 * then initiates the call via Vapi API.
 *
 * Request: { leadId: string }
 * Response: { success: true, voiceSessionId, vapiCallId } | { error: string }
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getDialerUser, createDialerClient } from "@/lib/dialer/db";
import { isDnc } from "@/lib/dnc-check";
import { initiateOutboundCall } from "@/providers/voice/vapi-adapter";

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

  let body: { leadId?: string };
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
    .select("id, first_name, last_name, phone, property_address, stage")
    .eq("id", leadId)
    .single();

  if (leadErr || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const phone = lead.phone;
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

  // ── Create voice_session ──────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: session, error: sessErr } = await (sb.from("voice_sessions") as any)
    .insert({
      direction: "outbound",
      lead_id: leadId,
      from_number: phone,
      status: "initiating",
      caller_type: "seller",
      initiated_by: user.id,
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
