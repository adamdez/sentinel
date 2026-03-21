import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

/**
 * POST|GET /api/twilio/voice
 *
 * Twilio webhook — called when the AGENT answers their cell phone
 * (agent-first click-to-call). Returns TwiML that bridges
 * the call to the prospect.
 *
 * Query params:
 *   ?agentId=<user_id>&callLogId=<id>&prospectPhone=<e164>
 */
async function handleVoiceWebhook(req: NextRequest) {
  const url = new URL(req.url);
  const agentId = url.searchParams.get("agentId");
  const callLogId = url.searchParams.get("callLogId");
  const prospectPhone = url.searchParams.get("prospectPhone");

  console.log("[Twilio Voice] Webhook hit:", {
    agentId: agentId ? `${agentId.slice(0, 8)}…` : null,
    callLogId: callLogId ? `${callLogId.slice(0, 8)}…` : null,
    prospectPhone: prospectPhone ? `***${prospectPhone.slice(-4)}` : null,
    method: req.method,
  });

  const sb = createServerClient();

  let agentTwilioNumber = "";
  let agentName = "";
  if (agentId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (sb.from("user_profiles") as any)
      .select("full_name, twilio_phone_number")
      .eq("id", agentId)
      .single();

    agentName = (profile?.full_name as string) ?? "";
    agentTwilioNumber = (profile?.twilio_phone_number as string) ?? "";
  }

  const twilioNumber = agentTwilioNumber || process.env.TWILIO_PHONE_NUMBER || "";

  // Build the absolute action URL for the Dial verb
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  const actionUrl = siteUrl
    ? `${siteUrl}/api/twilio/voice/status?callLogId=${encodeURIComponent(callLogId ?? "")}&amp;type=dial_complete`
    : `/api/twilio/voice/status?callLogId=${callLogId ?? ""}&amp;type=dial_complete`;

  let twiml: string;

  if (prospectPhone) {
    // Agent just picked up — bridge to the prospect.
    // The prospect sees the Twilio number (CNAM "Dominion Homes") as caller ID.

    // WI-1: Optionally add <Stream> for real-time Deepgram transcription
    const transcriptionUrl = process.env.TRANSCRIPTION_WS_URL;
    const hasDeepgram = !!process.env.DEEPGRAM_API_KEY;
    const sessionId = url.searchParams.get("sessionId");
    const streamParams = new URLSearchParams();
    if (callLogId) streamParams.set("callLogId", callLogId);
    if (sessionId) streamParams.set("sessionId", sessionId);
    if (agentId)   streamParams.set("userId", agentId);
    const streamQuery = streamParams.toString();
    const streamLine = transcriptionUrl && hasDeepgram && (callLogId || sessionId)
      ? `  <Stream url="${transcriptionUrl}${streamQuery ? `?${streamQuery}` : ""}" track="both_tracks" />`
      : "";

    twiml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      "<Response>",
      '  <Say voice="Polly.Joanna">Sentinel call. Connecting to prospect now.</Say>',
      ...(streamLine ? [streamLine] : []),
      `  <Dial callerId="${twilioNumber}" timeout="30" action="${actionUrl}">`,
      `    <Number>${prospectPhone}</Number>`,
      "  </Dial>",
      "</Response>",
    ].join("\n");
  } else {
    console.warn("[Twilio Voice] No prospectPhone in webhook — call will end");
    twiml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      "<Response>",
      '  <Say voice="Polly.Joanna">No prospect number available. Goodbye.</Say>',
      "</Response>",
    ].join("\n");
  }

  // Log the webhook event (non-blocking)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sb.from("event_log") as any).insert({
    user_id: agentId ?? SYSTEM_USER_ID,
    action: "twilio.voice_webhook",
    entity_type: "call",
    entity_id: callLogId ?? "unknown",
    details: {
      flow: "agent_first",
      prospect_phone: prospectPhone ? `***${prospectPhone.slice(-4)}` : null,
      agent_name: agentName,
      from_number: twilioNumber,
      timestamp: new Date().toISOString(),
    },
  });

  // Update calls_log to show the agent answered
  if (callLogId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sb.from("calls_log") as any)
      .update({ disposition: "agent_answered" })
      .eq("id", callLogId)
      .then(() => {});
  }

  return new NextResponse(twiml, {
    headers: { "Content-Type": "text/xml" },
  });
}

// Twilio sends POST for voice webhooks by default
export const POST = handleVoiceWebhook;
// Some Twilio configs use GET — support both
export const GET = handleVoiceWebhook;
