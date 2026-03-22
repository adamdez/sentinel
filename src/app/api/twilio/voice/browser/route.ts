import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import twilio from "twilio";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

/**
 * POST /api/twilio/voice/browser
 *
 * TwiML Application Voice URL — called by Twilio when the browser SDK
 * initiates an outbound call via device.connect().
 *
 * Twilio POSTs form-encoded body with:
 *   - To: prospect phone number (from connect params)
 *   - From: "client:identity" (browser user)
 *   - CallSid, AccountSid, etc.
 *   - Custom params: callLogId, agentId, callerId
 *
 * Returns TwiML that dials the prospect directly.
 */
async function handleBrowserVoice(req: NextRequest) {
  // ── Twilio signature validation (P0 security) ──────────────────────
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
  if (!twilioAuthToken) {
    console.error("[BrowserVoice] TWILIO_AUTH_TOKEN not set — rejecting request");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const twilioSignature = req.headers.get("x-twilio-signature") || "";
  const reqUrl = new URL(req.url);
  // Twilio sends form-encoded POST; read params from body for validation
  const bodyForValidation = Object.fromEntries(await req.clone().formData());
  const isValidTwilio = twilio.validateRequest(
    twilioAuthToken,
    twilioSignature,
    reqUrl.origin + reqUrl.pathname,
    bodyForValidation as Record<string, string>,
  );
  if (!isValidTwilio) {
    console.warn("[BrowserVoice] Invalid Twilio signature — rejecting");
    return NextResponse.json({ error: "Invalid Twilio signature" }, { status: 403 });
  }

  const formData = await req.formData();

  const to = formData.get("To") as string | null;
  const callLogId = formData.get("callLogId") as string | null;
  const agentId = formData.get("agentId") as string | null;
  let callerId = formData.get("callerId") as string | null;
  const callSid = formData.get("CallSid") as string | null;
  const sessionId = formData.get("sessionId") as string | null; // PR2: passed via device.connect() params

  console.log("[BrowserVoice] Webhook hit:", {
    to: to ? `***${to.slice(-4)}` : null,
    callLogId: callLogId ? `${callLogId.slice(0, 8)}…` : null,
    agentId: agentId ? `${agentId.slice(0, 8)}…` : null,
    callSid: callSid ? `${callSid.slice(0, 10)}…` : null,
  });

  // If no To number, return hangup TwiML
  if (!to || to.startsWith("client:")) {
    console.warn("[BrowserVoice] No valid To number — returning hangup");
    const twiml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      "<Response>",
      '  <Say voice="Polly.Joanna">No destination number provided. Goodbye.</Say>',
      "</Response>",
    ].join("\n");
    return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
  }

  const sb = createServerClient();

  // Look up agent's Twilio number if callerId not provided
  if (!callerId && agentId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (sb.from("user_profiles") as any)
      .select("twilio_phone_number")
      .eq("id", agentId)
      .single();
    callerId = (profile?.twilio_phone_number as string) || null;
  }

  // Fallback to env var
  if (!callerId) {
    callerId = process.env.TWILIO_PHONE_NUMBER || "";
  }

  // Build webhook URLs
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

  // PR2: thread sessionId through callback URLs so the status webhook can
  // forward it to the internal dialer session sync route.
  // Use &amp; in URL params because these get embedded inside XML attribute values
  const sessionParam = sessionId ? `&amp;sessionId=${encodeURIComponent(sessionId)}` : "";
  const statusCallbackUrl = siteUrl
    ? `${siteUrl}/api/twilio/voice/status?callLogId=${encodeURIComponent(callLogId ?? "")}${sessionParam}&amp;type=call_status`
    : "";
  const dialActionUrl = siteUrl
    ? `${siteUrl}/api/twilio/voice/status?callLogId=${encodeURIComponent(callLogId ?? "")}${sessionParam}&amp;type=dial_complete`
    : "";

  // Build TwiML — dial the prospect directly from the browser
  // Optionally add <Stream> for real-time transcription via Deepgram (WI-1)
  // TRANSCRIPTION_WS_URL = WebSocket relay server that bridges Twilio audio → Deepgram
  // Only enabled when both the WS URL is configured and DEEPGRAM_API_KEY is set
  const transcriptionUrl = process.env.TRANSCRIPTION_WS_URL; // e.g. wss://sentinel-transcription.fly.dev/media-stream
  const hasDeepgram = !!process.env.DEEPGRAM_API_KEY;
  const streamParams = new URLSearchParams();
  if (callLogId) streamParams.set("callLogId", callLogId);
  if (sessionId) streamParams.set("sessionId", sessionId);
  if (agentId)   streamParams.set("userId", agentId);
  // URLSearchParams uses raw & — must be &amp; inside XML attributes
  const streamQuery = streamParams.toString().replace(/&/g, "&amp;");
  // <Stream> must be wrapped in <Start> per Twilio TwiML spec
  const streamLines = transcriptionUrl && hasDeepgram && (callLogId || sessionId)
    ? [
        "  <Start>",
        `    <Stream url="${transcriptionUrl}" track="both_tracks">`,
        ...(callLogId ? [`      <Parameter name="callLogId" value="${callLogId}" />`] : []),
        ...(sessionId ? [`      <Parameter name="sessionId" value="${sessionId}" />`] : []),
        ...(agentId ? [`      <Parameter name="userId" value="${agentId}" />`] : []),
        "    </Stream>",
        "  </Start>",
      ]
    : [];

  // Normalize the To number — strip any formatting, ensure E.164
  const toNormalized = (() => {
    if (!to) return "";
    const digits = to.replace(/\D/g, "");
    if (digits.length === 0) return "";
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
    if (digits.length === 10) return `+1${digits}`;
    return `+${digits}`;
  })();

  const twiml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Response>",
    ...streamLines,
    `  <Dial callerId="${callerId}" timeout="30"${dialActionUrl ? ` action="${dialActionUrl}"` : ""}>`,
    `    <Number${statusCallbackUrl ? ` statusCallback="${statusCallbackUrl}" statusCallbackEvent="initiated ringing answered completed"` : ""}>${toNormalized}</Number>`,
    "  </Dial>",
    "</Response>",
  ].join("\n");

  // Update calls_log with Twilio CallSid (non-blocking)
  if (callLogId && callSid) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sb.from("calls_log") as any)
      .update({
        twilio_sid: callSid,
        disposition: "ringing_prospect",
      })
      .eq("id", callLogId)
      .then(() => {});
  }

  // Audit log (non-blocking)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sb.from("event_log") as any).insert({
    user_id: agentId ?? SYSTEM_USER_ID,
    action: "twilio.browser_voice",
    entity_type: "call",
    entity_id: callLogId ?? callSid ?? "unknown",
    details: {
      flow: "browser_voip",
      prospect_phone: to ? `***${to.slice(-4)}` : null,
      from_number: callerId,
      twilio_sid: callSid,
      timestamp: new Date().toISOString(),
    },
  });

  console.log("[BrowserVoice] Dialing prospect:", to ? `***${to.slice(-4)}` : "unknown", "from:", callerId);

  return new NextResponse(twiml, {
    headers: { "Content-Type": "text/xml" },
  });
}

export const POST = handleBrowserVoice;
export const GET = handleBrowserVoice;
